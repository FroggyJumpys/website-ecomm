-- 001 – Users and shipping addresses.
--
-- Naming: every table is prefixed `tbl_` and named in Bahasa Indonesia;
-- columns stay snake_case. Money is always a whole-number Rupiah amount
-- (BIGINT), never a float. Timestamps are TIMESTAMPTZ so the API can hand the
-- browser a real instant; the UI formats it for Asia/Makassar (WITA).

-- Keeps updated_at honest on every table without remembering it in the API
-- layer. Attached per table with a BEFORE UPDATE trigger.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------ pengguna

CREATE TABLE tbl_pengguna (
  id            BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          TEXT        NOT NULL,
  email         TEXT        NOT NULL,
  phone         TEXT        NOT NULL DEFAULT '',
  password_hash TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'customer',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tbl_pengguna_name_not_blank CHECK (length(btrim(name)) > 0),
  -- The API lowercases and trims email before writing. Enforcing it here keeps
  -- the plain UNIQUE below case-insensitive in practice.
  CONSTRAINT tbl_pengguna_email_lowercase CHECK (email = lower(email)),
  CONSTRAINT tbl_pengguna_email_shape
    CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  CONSTRAINT tbl_pengguna_role_valid CHECK (role IN ('customer', 'admin')),
  CONSTRAINT tbl_pengguna_email_key UNIQUE (email)
);

CREATE TRIGGER tbl_pengguna_set_updated_at
  BEFORE UPDATE ON tbl_pengguna
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- --------------------------------------------------------------------- alamat

CREATE TABLE tbl_alamat (
  id          BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     BIGINT      NOT NULL REFERENCES tbl_pengguna (id) ON DELETE CASCADE,
  label       TEXT        NOT NULL,
  recipient   TEXT        NOT NULL,
  phone       TEXT        NOT NULL,
  street      TEXT        NOT NULL,
  district    TEXT        NOT NULL DEFAULT '',
  city        TEXT        NOT NULL,
  province    TEXT        NOT NULL,
  postal_code TEXT        NOT NULL DEFAULT '',
  notes       TEXT        NOT NULL DEFAULT '',
  is_default  BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tbl_alamat_label_not_blank CHECK (length(btrim(label)) > 0),
  CONSTRAINT tbl_alamat_recipient_not_blank CHECK (length(btrim(recipient)) > 0),
  CONSTRAINT tbl_alamat_street_not_blank CHECK (length(btrim(street)) > 0)
);

CREATE INDEX tbl_alamat_user_id_idx ON tbl_alamat (user_id, id);

-- At most one default address per user, enforced by the database rather than by
-- the service layer clearing the flag on its own.
CREATE UNIQUE INDEX tbl_alamat_one_default_per_user
  ON tbl_alamat (user_id)
  WHERE is_default;

CREATE TRIGGER tbl_alamat_set_updated_at
  BEFORE UPDATE ON tbl_alamat
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
