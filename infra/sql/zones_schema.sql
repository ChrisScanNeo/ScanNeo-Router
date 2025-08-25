-- Zones table: stores sub-divided areas for manageable route segments
CREATE TABLE IF NOT EXISTS zones(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_area_id UUID REFERENCES areas(id) ON DELETE CASCADE,
  zone_index INTEGER NOT NULL,
  zone_name TEXT,
  estimated_time_hours DECIMAL(4,2),
  estimated_length_km DECIMAL(8,2),
  street_count INTEGER,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  geom GEOMETRY(POLYGON, 4326) NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_zones_parent_area ON zones(parent_area_id);
CREATE INDEX IF NOT EXISTS idx_zones_status ON zones(status);
CREATE INDEX IF NOT EXISTS idx_zones_geom ON zones USING GIST (geom);

-- Add zone reference to coverage_routes
ALTER TABLE coverage_routes 
ADD COLUMN IF NOT EXISTS zone_id UUID REFERENCES zones(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_coverage_routes_zone ON coverage_routes(zone_id);

-- Zone progress tracking
CREATE TABLE IF NOT EXISTS zone_progress(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID REFERENCES zones(id) ON DELETE CASCADE,
  route_id UUID REFERENCES coverage_routes(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  coverage_percentage DECIMAL(5,2),
  actual_time_hours DECIMAL(4,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zone_progress_zone ON zone_progress(zone_id);