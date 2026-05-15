-- Russian Post delivery integration

ALTER TABLE user_addresses ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE user_addresses ADD COLUMN IF NOT EXISTS office_code TEXT;
ALTER TABLE user_addresses ADD COLUMN IF NOT EXISTS delivery_type TEXT DEFAULT 'manual';

ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal_amount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_type TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_point_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_point_address TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_point_index TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_price INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS package_weight_g INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_status TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_barcode TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_qr_data TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_pickup_qr_data TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pochta_order_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_created_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS post_offices_cache (
  id TEXT PRIMARY KEY,
  postal_code TEXT NOT NULL,
  address TEXT,
  city TEXT,
  region TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  office_type TEXT,
  work_time TEXT,
  meta_json TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_post_offices_cache_city ON post_offices_cache(city);
CREATE INDEX IF NOT EXISTS idx_post_offices_cache_postal ON post_offices_cache(postal_code);
