/**
 * Guest cart merge: the account cart wins the stock it already holds, the
 * guest's lines are layered on top in the order they were added, and anything
 * that does not fit is reported as an adjustment rather than dropped quietly.
 *
 * Runs inside the caller's transaction — login and registration wrap it — so a
 * failure leaves both carts exactly as they were.
 *
 * Two locks make this safe against a simultaneous request:
 *
 *  - the guest card row, so two logins with the same token cannot both merge it;
 *  - the account cart row, so a write to the account cart cannot interleave;
 *  - and every affected product row, in id order, so two merges that share a
 *    product queue instead of deadlocking.
 */

function notEnoughStock(stock, quantity) {
  if (quantity === 0) {
    return 'Stok tidak mencukupi. Barang ini tidak bisa digabungkan.';
  }

  return `Stok tersisa ${stock} unit. Jumlah disesuaikan menjadi ${quantity}.`;
}

function toAdjustment(line, quantity, code, message) {
  return {
    productId: line.product_id,
    color: line.color,
    size: line.size,
    requestedQuantity: line.quantity,
    quantity,
    code,
    message,
  };
}

/** What the product offers today, checked against what the line asks for. */
function variantAvailable(product, color, size) {
  const colors = product.colors ?? [];
  const sizes = product.sizes ?? [];

  const colorOk = colors.length === 0 ? color === '' : colors.includes(color);
  const sizeOk = sizes.length === 0 ? size === '' : sizes.includes(size);

  return colorOk && sizeOk;
}

export async function mergeGuestCart(client, { userId, guestTokenHash }) {
  // The guest cart is locked first; a second login holding the same cookie
  // waits here and then sees `merged_at` and stops.
  const guest = await client.query(
    `SELECT id, merged_at
       FROM tbl_keranjang
      WHERE guest_token = $1
        FOR UPDATE`,
    [guestTokenHash]
  );

  if (guest.rows.length === 0) {
    return { consumed: false, merged: false, adjustments: [] };
  }

  if (guest.rows[0].merged_at !== null) {
    return { consumed: false, merged: false, adjustments: [] };
  }

  const guestCartId = guest.rows[0].id;

  // The account cart is created on first merge, then locked. There is one
  // partial unique index per owner kind, so `DO NOTHING` cannot mask a mistake.
  await client.query(
    `INSERT INTO tbl_keranjang (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
    [userId]
  );

  const account = await client.query(
    'SELECT id FROM tbl_keranjang WHERE user_id = $1 FOR UPDATE',
    [userId]
  );

  const accountCartId = account.rows[0].id;

  const [guestItems, accountItems] = await Promise.all([
    client.query(
      `SELECT id, product_id, quantity, color, size
         FROM tbl_item_keranjang
        WHERE cart_id = $1
        ORDER BY created_at ASC, id ASC`,
      [guestCartId]
    ),
    client.query(
      `SELECT id, product_id, quantity, color, size
         FROM tbl_item_keranjang
        WHERE cart_id = $1
        ORDER BY created_at ASC, id ASC`,
      [accountCartId]
    ),
  ]);

  const productIds = [...guestItems.rows, ...accountItems.rows].map((row) => row.product_id);

  const products = new Map();
  if (productIds.length > 0) {
    const locked = await client.query(
      `SELECT id, stock, colors, sizes, is_active
         FROM tbl_produk
        WHERE id = ANY($1::bigint[])
        ORDER BY id
          FOR UPDATE`,
      [[...new Set(productIds)]]
    );

    for (const row of locked.rows) products.set(row.id, row);
  }

  const adjustments = [];

  // Remaining stock per product, shared by every variant of that product.
  const remaining = new Map();

  /** How much of this product is still allocatable. */
  function available(productId) {
    if (!remaining.has(productId)) {
      const product = products.get(productId);
      remaining.set(productId, product ? product.stock : 0);
    }

    return remaining.get(productId);
  }

  function take(productId, wanted) {
    const left = available(productId);
    const took = Math.max(0, Math.min(wanted, left));
    remaining.set(productId, left - took);
    return took;
  }

  // 1. The account's own lines keep their place — but only up to what is
  //    actually in stock, so a stale quantity cannot starve the guest cart.
  const accountByVariant = new Map();

  for (const line of accountItems.rows) {
    const product = products.get(line.product_id);

    // An unavailable line is left for the customer to fix; it holds no stock.
    if (!product || !product.is_active) {
      accountByVariant.set(`${line.product_id}::${line.color}::${line.size}`, line);
      continue;
    }

    const keep = take(line.product_id, line.quantity);

    if (keep < line.quantity) {
      adjustments.push(
        toAdjustment(
          line,
          keep,
          'INSUFFICIENT_STOCK',
          notEnoughStock(product.stock, keep)
        )
      );

      if (keep === 0) {
        await client.query('DELETE FROM tbl_item_keranjang WHERE id = $1', [line.id]);
        continue;
      }

      await client.query('UPDATE tbl_item_keranjang SET quantity = $1 WHERE id = $2', [
        keep,
        line.id,
      ]);
    }

    accountByVariant.set(`${line.product_id}::${line.color}::${line.size}`, {
      ...line,
      quantity: keep,
    });
  }

  // 2. The guest's lines are layered on in the order they were added.
  let merged = false;

  for (const line of guestItems.rows) {
    const product = products.get(line.product_id);

    if (!product || !product.is_active) {
      adjustments.push(
        toAdjustment(
          line,
          0,
          'PRODUCT_UNAVAILABLE',
          'Produk ini sedang tidak dijual, jadi tidak ikut digabungkan.'
        )
      );
      continue;
    }

    if (!variantAvailable(product, line.color, line.size)) {
      adjustments.push(
        toAdjustment(
          line,
          0,
          'INVALID_VARIANT',
          'Pilihan warna atau ukuran ini sudah tidak tersedia, jadi tidak ikut digabungkan.'
        )
      );
      continue;
    }

    const keep = take(line.product_id, line.quantity);

    if (keep < line.quantity) {
      adjustments.push(
        toAdjustment(
          line,
          keep,
          'INSUFFICIENT_STOCK',
          notEnoughStock(product.stock, keep)
        )
      );
    }

    if (keep === 0) continue;

    const key = `${line.product_id}::${line.color}::${line.size}`;
    const existing = accountByVariant.get(key);

    if (existing) {
      await client.query('UPDATE tbl_item_keranjang SET quantity = quantity + $1 WHERE id = $2', [
        keep,
        existing.id,
      ]);
      existing.quantity += keep;
    } else {
      const { rows } = await client.query(
        `INSERT INTO tbl_item_keranjang (cart_id, product_id, quantity, color, size)
              VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
        [accountCartId, line.product_id, keep, line.color, line.size]
      );

      accountByVariant.set(key, { ...line, id: rows[0].id, quantity: keep });
    }

    merged = true;
  }

  // 3. The guest cart is spent: its items go, and the row stays as a marker so
  //    a write that was already in flight cannot recreate it.
  await client.query('DELETE FROM tbl_item_keranjang WHERE cart_id = $1', [guestCartId]);
  await client.query('UPDATE tbl_keranjang SET merged_at = now() WHERE id = $1', [guestCartId]);

  return { consumed: true, merged, adjustments };
}
