-- 010 – QRIS as a checkout choice, plus the dynamic QR an attempt hands back.
--
-- QRIS is offered explicitly at checkout, so the order stores its own policy id
-- and the Snap request names exactly one channel (`other_qris`). A customer who
-- picks QRIS therefore never has to pick it a second time inside the provider's
-- own screen.
--
-- The QR code is transaction-specific: Midtrans returns a `generate_qr_code`
-- action URL for the attempt. Keeping it lets the order page redraw the same
-- code after a reload, instead of opening a second provider transaction just to
-- show a picture. The column stays NULL for every other channel.

ALTER TABLE tbl_pesanan
  DROP CONSTRAINT tbl_pesanan_payment_method_id_valid;

ALTER TABLE tbl_pesanan
  ADD CONSTRAINT tbl_pesanan_payment_method_id_valid
  CHECK (payment_method_id IS NULL OR payment_method_id IN ('bca', 'bni-va', 'qris', 'kartu'));

ALTER TABLE tbl_pembayaran
  ADD COLUMN qr_code_url TEXT;
