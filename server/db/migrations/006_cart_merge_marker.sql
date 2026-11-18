-- 006 – Guest cart merge marker.

-- A guest cart is consumed exactly once, when its owner signs in. Deleting the
-- row would be enough for the happy path, but a write that was already in
-- flight would then recreate the same guest token and write into a cart nobody
-- can ever reach. Keeping the row with `merged_at` set makes "this token is
-- spent" a fact the next write can see, so that racing request is told to
-- reload instead of silently losing the customer's item.
ALTER TABLE tbl_keranjang
  ADD COLUMN merged_at TIMESTAMPTZ;

-- Only spent guest carts are indexed: live carts are looked up by the two
-- existing unique indexes (user_id, guest_token), and this one exists for the
-- occasional cleanup sweep.
CREATE INDEX tbl_keranjang_merged_at_idx
  ON tbl_keranjang (merged_at)
  WHERE merged_at IS NOT NULL;
