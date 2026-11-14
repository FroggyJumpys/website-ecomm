-- 004 – Orders, order lines and the status timeline.
--
-- Prices and the shipping address are copied onto the order when it is placed.
-- Editing a product or an address later must never rewrite what the customer
-- bought or where it was sent.

CREATE TABLE tbl_pesanan (
  id                  BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_number        TEXT        NOT NULL,
  user_id             BIGINT      NOT NULL REFERENCES tbl_pengguna (id) ON DELETE RESTRICT,
  status              TEXT        NOT NULL DEFAULT 'processing',

  -- Money, all whole Rupiah.
  subtotal            BIGINT      NOT NULL,
  shipping_cost       BIGINT      NOT NULL DEFAULT 0,
  discount            BIGINT      NOT NULL DEFAULT 0,
  total               BIGINT      NOT NULL,

  payment_method      TEXT        NOT NULL DEFAULT '',
  tracking_number     TEXT,
  cancellation_reason TEXT,

  -- Address snapshot (flat columns rather than JSONB so they stay queryable
  -- for shipping labels and reports).
  shipping_recipient    TEXT      NOT NULL,
  shipping_phone        TEXT      NOT NULL,
  shipping_street       TEXT      NOT NULL,
  shipping_district     TEXT      NOT NULL DEFAULT '',
  shipping_city         TEXT      NOT NULL,
  shipping_province     TEXT      NOT NULL,
  shipping_postal_code  TEXT      NOT NULL DEFAULT '',
  shipping_notes        TEXT      NOT NULL DEFAULT '',

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tbl_pesanan_status_valid
    CHECK (status IN ('processing', 'shipped', 'completed', 'cancelled')),
  CONSTRAINT tbl_pesanan_amounts_non_negative
    CHECK (subtotal >= 0 AND shipping_cost >= 0 AND discount >= 0 AND total >= 0),
  CONSTRAINT tbl_pesanan_total_matches
    CHECK (total = subtotal + shipping_cost - discount),
  CONSTRAINT tbl_pesanan_order_number_key UNIQUE (order_number)
);

CREATE INDEX tbl_pesanan_user_id_idx ON tbl_pesanan (user_id, created_at DESC);
CREATE INDEX tbl_pesanan_status_idx ON tbl_pesanan (status, created_at DESC);

CREATE TRIGGER tbl_pesanan_set_updated_at
  BEFORE UPDATE ON tbl_pesanan
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE tbl_item_pesanan (
  id           BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id     BIGINT      NOT NULL REFERENCES tbl_pesanan (id) ON DELETE CASCADE,
  -- Kept for "buy this again" links; NULL if the product is later deleted.
  product_id   BIGINT      REFERENCES tbl_produk (id) ON DELETE SET NULL,

  -- Snapshot so the order still renders after a rename or a price change.
  product_name TEXT        NOT NULL,
  product_slug TEXT        NOT NULL,
  image        TEXT        NOT NULL DEFAULT '',
  unit_price   BIGINT      NOT NULL,
  quantity     INTEGER     NOT NULL,
  color        TEXT        NOT NULL DEFAULT '',
  size         TEXT        NOT NULL DEFAULT '',

  line_total   BIGINT      GENERATED ALWAYS AS (unit_price * quantity) STORED,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tbl_item_pesanan_unit_price_non_negative CHECK (unit_price >= 0),
  CONSTRAINT tbl_item_pesanan_quantity_positive CHECK (quantity > 0)
);

CREATE INDEX tbl_item_pesanan_order_id_idx ON tbl_item_pesanan (order_id);
CREATE INDEX tbl_item_pesanan_product_id_idx ON tbl_item_pesanan (product_id);

CREATE TRIGGER tbl_item_pesanan_set_updated_at
  BEFORE UPDATE ON tbl_item_pesanan
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Every status change, oldest first. The customer-facing timeline on
-- /akun/pesanan/:orderNumber reads this table.
CREATE TABLE tbl_riwayat_status_pesanan (
  id         BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id   BIGINT      NOT NULL REFERENCES tbl_pesanan (id) ON DELETE CASCADE,
  status     TEXT        NOT NULL,
  note       TEXT        NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tbl_riwayat_status_pesanan_status_valid
    CHECK (status IN ('processing', 'shipped', 'completed', 'cancelled'))
);

CREATE INDEX tbl_riwayat_status_pesanan_order_id_idx
  ON tbl_riwayat_status_pesanan (order_id, created_at);

CREATE TRIGGER tbl_riwayat_status_pesanan_set_updated_at
  BEFORE UPDATE ON tbl_riwayat_status_pesanan
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
