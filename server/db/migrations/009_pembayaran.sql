-- 009 – Midtrans payment attempts and the webhook log.
--
-- Two things are separated on purpose:
--
--  - `payment_status` on the order is the single value the screens read. It is
--    denormalised so a history page or an admin list does not need a join or a
--    second query per row.
--  - `tbl_pembayaran` keeps every attempt, because Midtrans refuses a reused
--    `order_id`: a retry after an expiry needs a new provider order id, and the
--    earlier attempt must stay readable for support and reconciliation.
--
-- `tbl_notifikasi_pembayaran` is the webhook log. Its unique
-- `(provider, notification_key)` is what makes a replayed notification a no-op
-- instead of a second state change.

ALTER TABLE tbl_pesanan
  ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'unpaid',
  -- The policy id (`bca`, `bni-va`, `kartu`). The label in `payment_method` is
  -- for display and must never be parsed to recover the choice: a copy change
  -- would silently remap the checkout to a different provider channel.
  ADD COLUMN payment_method_id TEXT;

-- Orders placed before this step only stored the Indonesian label. Map the
-- three known labels once so older orders can still be reconciled; an unknown
-- label stays NULL instead of being guessed.
UPDATE tbl_pesanan
   SET payment_method_id = CASE payment_method
                             WHEN 'Transfer bank BCA' THEN 'bca'
                             WHEN 'Virtual account BNI' THEN 'bni-va'
                             WHEN 'Kartu kredit' THEN 'kartu'
                           END
 WHERE payment_method_id IS NULL;

ALTER TABLE tbl_pesanan
  ADD CONSTRAINT tbl_pesanan_payment_method_id_valid
  CHECK (payment_method_id IS NULL OR payment_method_id IN ('bca', 'bni-va', 'kartu'));

-- Orders placed before step 05b were paid by manual transfer or were never
-- paid at all, so `unpaid` is the honest default for them as well.
ALTER TABLE tbl_pesanan
  ADD CONSTRAINT tbl_pesanan_payment_status_valid
  CHECK (payment_status IN ('unpaid', 'pending', 'paid', 'failed', 'expired', 'refunded'));

CREATE INDEX tbl_pesanan_payment_status_idx
  ON tbl_pesanan (payment_status, created_at DESC);

CREATE TABLE tbl_pembayaran (
  id                BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id          BIGINT      NOT NULL REFERENCES tbl_pesanan (id) ON DELETE CASCADE,
  provider          TEXT        NOT NULL DEFAULT 'midtrans',

  -- The id sent to the provider. Unique per attempt: `BD-2026-0417` for the
  -- first try, `BD-2026-0417-2` for the next one.
  provider_order_id TEXT        NOT NULL,
  attempt_no        INTEGER     NOT NULL,

  -- `gross_amount` is a snapshot of what was quoted. A webhook whose amount
  -- disagrees with this row is refused, never applied.
  gross_amount      BIGINT      NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'pending',

  snap_token        TEXT,
  snap_redirect_url TEXT,

  -- Provider-reported facts, kept for reconciliation and support.
  transaction_id    TEXT,
  payment_type      TEXT,
  fraud_status      TEXT,
  status_code       TEXT,

  paid_at           TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tbl_pembayaran_status_valid
    CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'refunded')),
  CONSTRAINT tbl_pembayaran_gross_amount_positive CHECK (gross_amount > 0),
  CONSTRAINT tbl_pembayaran_attempt_no_positive CHECK (attempt_no > 0),
  CONSTRAINT tbl_pembayaran_attempt_unique UNIQUE (order_id, attempt_no),
  CONSTRAINT tbl_pembayaran_provider_order_unique UNIQUE (provider, provider_order_id)
);

CREATE INDEX tbl_pembayaran_order_id_idx ON tbl_pembayaran (order_id, attempt_no DESC);

CREATE TRIGGER tbl_pembayaran_set_updated_at
  BEFORE UPDATE ON tbl_pembayaran
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE tbl_notifikasi_pembayaran (
  id                 BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider           TEXT        NOT NULL,

  -- SHA-256 hex over the fields that identify one provider event. A provider
  -- retry sends the same values and therefore the same key.
  notification_key   TEXT        NOT NULL,

  provider_order_id  TEXT        NOT NULL,
  -- Both stay nullable: a notification for an order this system never created
  -- is still evidence, and dropping it would hide a misconfiguration.
  payment_id         BIGINT      REFERENCES tbl_pembayaran (id) ON DELETE SET NULL,
  order_id           BIGINT      REFERENCES tbl_pesanan (id) ON DELETE SET NULL,

  transaction_id     TEXT        NOT NULL DEFAULT '',
  transaction_status TEXT        NOT NULL,
  status_code        TEXT        NOT NULL DEFAULT '',
  fraud_status       TEXT        NOT NULL DEFAULT '',
  -- Kept as text exactly as received; parsing happens in the service.
  gross_amount       TEXT        NOT NULL DEFAULT '',

  -- What this notification did: `applied`, `duplicate`, `stale`,
  -- `amount_mismatch`, `unknown_order` or `unmapped_status`.
  outcome            TEXT        NOT NULL DEFAULT '',

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tbl_notifikasi_pembayaran_key_valid
    CHECK (notification_key ~ '^[0-9a-f]{64}$'),
  CONSTRAINT tbl_notifikasi_pembayaran_unique UNIQUE (provider, notification_key)
);

CREATE INDEX tbl_notifikasi_pembayaran_order_idx
  ON tbl_notifikasi_pembayaran (provider_order_id, created_at DESC);

CREATE TRIGGER tbl_notifikasi_pembayaran_set_updated_at
  BEFORE UPDATE ON tbl_notifikasi_pembayaran
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
