import { AppError } from './errors.js';

/**
 * Exact money for catalogue reads.
 *
 * The admin list and detail are read-only for price, but they still have to
 * report what the database holds. `pg` parses BIGINT through `Number`, which
 * silently rounds 9007199254740993 to ...992, so every money column is cast to
 * text in SQL and converted here only after an exact check. A value too large
 * to represent is refused: a catalogue row whose price the API cannot show
 * honestly is a row an administrator must fix in the database, not one this
 * layer may round.
 */

const MAX_SAFE_MONEY = BigInt(Number.MAX_SAFE_INTEGER);

export function toSafeCatalogMoney(decimalText) {
  if (typeof decimalText !== 'string' || !/^\d+$/.test(decimalText)) throw tooLarge();

  const exact = BigInt(decimalText);

  if (exact > MAX_SAFE_MONEY) throw tooLarge();

  return Number(exact);
}

function tooLarge() {
  return new AppError(
    409,
    'CATALOG_VALUE_TOO_LARGE',
    'Ada harga di katalog yang terlalu besar untuk ditampilkan. Perbaiki datanya di database.'
  );
}
