-- 005 – Session revocation through a token version.
--
-- A JWT cannot be un-issued, so a password change would otherwise leave every
-- other device signed in until the token expires. The token carries the version
-- it was issued with; `requireAuth` compares it with this column and rejects a
-- stale one. Incrementing the column therefore signs every other device out,
-- while the device that made the change receives a fresh token.
--
-- Existing rows start at 0, so tokens issued before this migration (which carry
-- no version) are treated as stale — the safe direction.

ALTER TABLE tbl_pengguna
  ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE tbl_pengguna
  ADD CONSTRAINT tbl_pengguna_token_version_non_negative CHECK (token_version >= 0);
