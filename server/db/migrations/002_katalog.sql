-- 002 – Catalogue: categories, brands and products.

-- Used only to speed up the `?search=` filter on GET /api/v1/products, which
-- matches a substring across name, material and description (same rule as the
-- frontend mock). Plain ILIKE can use a trigram GIN index; a btree cannot.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- -------------------------------------------------------------------- kategori

CREATE TABLE tbl_kategori (
  id          BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug        TEXT        NOT NULL,
  name        TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  image       TEXT        NOT NULL DEFAULT '',
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tbl_kategori_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT tbl_kategori_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT tbl_kategori_slug_key UNIQUE (slug)
);

CREATE INDEX tbl_kategori_sort_order_idx ON tbl_kategori (sort_order, id);

CREATE TRIGGER tbl_kategori_set_updated_at
  BEFORE UPDATE ON tbl_kategori
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------------------- merek

CREATE TABLE tbl_merek (
  id         BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug       TEXT        NOT NULL,
  name       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tbl_merek_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT tbl_merek_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT tbl_merek_slug_key UNIQUE (slug)
);

CREATE TRIGGER tbl_merek_set_updated_at
  BEFORE UPDATE ON tbl_merek
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------- produk

CREATE TABLE tbl_produk (
  id               BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug             TEXT        NOT NULL,
  name             TEXT        NOT NULL,
  category_id      BIGINT      NOT NULL REFERENCES tbl_kategori (id) ON DELETE RESTRICT,
  brand_id         BIGINT      REFERENCES tbl_merek (id) ON DELETE SET NULL,
  price            BIGINT      NOT NULL,
  compare_at_price BIGINT,
  rating           NUMERIC(2, 1) NOT NULL DEFAULT 0,
  review_count     INTEGER     NOT NULL DEFAULT 0,
  stock            INTEGER     NOT NULL DEFAULT 0,

  -- Single-valued spec text; the shop filters do not facet on these.
  material         TEXT        NOT NULL DEFAULT '',
  dimensions       TEXT        NOT NULL DEFAULT '',
  description      TEXT        NOT NULL DEFAULT '',

  -- Variant options and gallery. Arrays keep the payload identical to the mock
  -- (no per-variant price or stock), and element order doubles as display order.
  colors           TEXT[]      NOT NULL DEFAULT '{}',
  sizes            TEXT[]      NOT NULL DEFAULT '{}',
  images           TEXT[]      NOT NULL DEFAULT '{}',

  is_new           BOOLEAN     NOT NULL DEFAULT false,
  is_trending      BOOLEAN     NOT NULL DEFAULT false,
  is_active        BOOLEAN     NOT NULL DEFAULT true,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tbl_produk_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT tbl_produk_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT tbl_produk_price_non_negative CHECK (price >= 0),
  CONSTRAINT tbl_produk_compare_at_price_positive
    CHECK (compare_at_price IS NULL OR compare_at_price > 0),
  -- A struck-through price below the live price would render as a fake discount.
  CONSTRAINT tbl_produk_compare_at_price_above_price
    CHECK (compare_at_price IS NULL OR compare_at_price > price),
  CONSTRAINT tbl_produk_rating_range CHECK (rating >= 0 AND rating <= 5),
  CONSTRAINT tbl_produk_review_count_non_negative CHECK (review_count >= 0),
  CONSTRAINT tbl_produk_stock_non_negative CHECK (stock >= 0),
  CONSTRAINT tbl_produk_slug_key UNIQUE (slug)
);

CREATE INDEX tbl_produk_category_id_idx ON tbl_produk (category_id) WHERE is_active;
CREATE INDEX tbl_produk_brand_id_idx ON tbl_produk (brand_id) WHERE is_active;
CREATE INDEX tbl_produk_price_idx ON tbl_produk (price) WHERE is_active;
CREATE INDEX tbl_produk_created_at_idx ON tbl_produk (created_at DESC);
CREATE INDEX tbl_produk_is_new_idx ON tbl_produk (created_at DESC) WHERE is_active AND is_new;
CREATE INDEX tbl_produk_is_trending_idx
  ON tbl_produk (created_at DESC) WHERE is_active AND is_trending;

CREATE INDEX tbl_produk_search_idx ON tbl_produk USING gin (
  (lower(name || ' ' || material || ' ' || description)) gin_trgm_ops
);

CREATE TRIGGER tbl_produk_set_updated_at
  BEFORE UPDATE ON tbl_produk
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
