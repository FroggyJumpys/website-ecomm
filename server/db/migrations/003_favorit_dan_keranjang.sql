-- 003 – Wishlist and shopping cart.

-- --------------------------------------------------------------------- favorit

CREATE TABLE tbl_favorit (
  id         BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    BIGINT      NOT NULL REFERENCES tbl_pengguna (id) ON DELETE CASCADE,
  product_id BIGINT      NOT NULL REFERENCES tbl_produk (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Saving the same product twice is a no-op, not a second row.
  CONSTRAINT tbl_favorit_user_product_key UNIQUE (user_id, product_id)
);

CREATE INDEX tbl_favorit_user_id_idx ON tbl_favorit (user_id, created_at DESC);

CREATE TRIGGER tbl_favorit_set_updated_at
  BEFORE UPDATE ON tbl_favorit
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------ keranjang

-- A cart belongs to exactly one owner: a signed-in user, or an anonymous
-- visitor identified by a guest token held in a cookie. Step 04f merges the
-- guest cart into the user cart on login, so both owners must be representable.
CREATE TABLE tbl_keranjang (
  id          BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     BIGINT      REFERENCES tbl_pengguna (id) ON DELETE CASCADE,
  guest_token TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- XOR: exactly one of the two owners is set.
  CONSTRAINT tbl_keranjang_single_owner
    CHECK ((user_id IS NOT NULL) <> (guest_token IS NOT NULL)),
  CONSTRAINT tbl_keranjang_guest_token_not_blank
    CHECK (guest_token IS NULL OR length(btrim(guest_token)) > 0)
);

CREATE UNIQUE INDEX tbl_keranjang_user_id_key
  ON tbl_keranjang (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX tbl_keranjang_guest_token_key
  ON tbl_keranjang (guest_token) WHERE guest_token IS NOT NULL;

CREATE TRIGGER tbl_keranjang_set_updated_at
  BEFORE UPDATE ON tbl_keranjang
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE tbl_item_keranjang (
  id         BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cart_id    BIGINT      NOT NULL REFERENCES tbl_keranjang (id) ON DELETE CASCADE,
  product_id BIGINT      NOT NULL REFERENCES tbl_produk (id) ON DELETE CASCADE,
  quantity   INTEGER     NOT NULL,
  color      TEXT        NOT NULL DEFAULT '',
  size       TEXT        NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tbl_item_keranjang_quantity_positive CHECK (quantity > 0),
  -- One row per product + variant; adding the same variant again increments
  -- quantity instead of creating a duplicate line.
  CONSTRAINT tbl_item_keranjang_cart_variant_key UNIQUE (cart_id, product_id, color, size)
);

CREATE INDEX tbl_item_keranjang_cart_id_idx ON tbl_item_keranjang (cart_id);

CREATE TRIGGER tbl_item_keranjang_set_updated_at
  BEFORE UPDATE ON tbl_item_keranjang
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
