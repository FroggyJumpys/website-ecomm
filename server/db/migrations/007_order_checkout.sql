-- 007 – Checkout metadata and order-number allocation.
--
-- 04g turns a server cart into an order. Three things about that write belong
-- in the database rather than only in the service:
--
--  - Which delivery the customer chose, so a reprint of the order says the same
--    thing it said at checkout.
--  - A retry identity. A lost response must not become a second order, and the
--    pair (owner, key) is what makes that a constraint instead of a hope.
--  - A sequence for order numbers. MAX(order_number) + 1 lets two concurrent
--    checkouts draw the same number; a per-year reset would collide with the
--    year's earlier orders during rollover.

-- Nullable: orders placed before this migration have no recorded method, and
-- inventing one would put a fact into the history that nobody chose.
ALTER TABLE tbl_pesanan
  ADD COLUMN shipping_method     TEXT,
  ADD COLUMN idempotency_key     TEXT,
  ADD COLUMN request_fingerprint TEXT;

ALTER TABLE tbl_pesanan
  ADD CONSTRAINT tbl_pesanan_shipping_method_valid
  CHECK (shipping_method IS NULL OR shipping_method IN ('reguler', 'kargo', 'workshop'));

-- The key is echoed from the client, so its shape is bounded here as well as in
-- the validator: 16–128 characters of an ASCII alphabet that needs no escaping.
ALTER TABLE tbl_pesanan
  ADD CONSTRAINT tbl_pesanan_idempotency_key_valid
  CHECK (idempotency_key IS NULL OR idempotency_key ~ '^[A-Za-z0-9_-]{16,128}$');

-- SHA-256 hex. Legacy rows have neither column, so both stay null together.
ALTER TABLE tbl_pesanan
  ADD CONSTRAINT tbl_pesanan_request_fingerprint_valid
  CHECK (request_fingerprint IS NULL OR request_fingerprint ~ '^[0-9a-f]{64}$');

ALTER TABLE tbl_pesanan
  ADD CONSTRAINT tbl_pesanan_idempotency_pair
  CHECK ((idempotency_key IS NULL) = (request_fingerprint IS NULL));

-- Partial, because a checkout without a key is not a duplicate of another one,
-- and most rows will carry no key at all.
CREATE UNIQUE INDEX tbl_pesanan_user_idempotency_key
  ON tbl_pesanan (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- One global sequence, never reset per year: the year is part of the rendered
-- number, not of the counter, so a rollover cannot reissue a number.
--
-- The floor of 1000 matters for a clean checkout, where migrations run before
-- the seed: the seeded demo orders (highest suffix 0417) must not collide with
-- the first generated number. Where real data exists, start just past it.
DO $$
DECLARE
  highest_suffix BIGINT;
  starts_at      BIGINT;
BEGIN
  SELECT max((regexp_match(order_number, '^BD-[0-9]{4}-([0-9]{4,})$'))[1]::bigint)
    INTO highest_suffix
    FROM tbl_pesanan
   WHERE order_number ~ '^BD-[0-9]{4}-[0-9]{4,}$';

  starts_at := greatest(1000, coalesce(highest_suffix, 0) + 1);

  EXECUTE format('CREATE SEQUENCE order_number_sequence START WITH %s', starts_at);
END
$$;
