-- 008 – Optimistic product versions.
--
-- The admin panel edits a product from a form that may have been open for
-- minutes. In that window a checkout can sell the last units, and saving the
-- form's older `stock` would put stock back on the shelf that no longer exists.
--
-- `version` is bumped by a trigger on every update, including the stock
-- decrement checkout performs, so an admin write that names the version it read
-- is rejected as stale instead of silently overwriting a sale.

ALTER TABLE tbl_produk
  ADD COLUMN version BIGINT NOT NULL DEFAULT 1;

ALTER TABLE tbl_produk
  ADD CONSTRAINT tbl_produk_version_positive CHECK (version >= 1);

-- The trigger owns the value: whatever a caller sends, the stored version is
-- the previous one plus one. That makes the version a reliable "has anything
-- changed since you read this?" token rather than a client-settable field.
CREATE OR REPLACE FUNCTION advance_product_version()
RETURNS trigger AS $$
BEGIN
  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tbl_produk_advance_version
  BEFORE UPDATE ON tbl_produk
  FOR EACH ROW EXECUTE FUNCTION advance_product_version();
