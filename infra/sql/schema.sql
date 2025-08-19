-- Enable PostGIS extension for spatial operations
CREATE EXTENSION IF NOT EXISTS postgis;

-- Areas table: stores coverage area polygons
CREATE TABLE IF NOT EXISTS areas(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  geom GEOMETRY(POLYGON, 4326) NOT NULL,
  buffer_m INTEGER NOT NULL DEFAULT 0,
  params JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Edges table: stores street segments for coverage
CREATE TABLE IF NOT EXISTS edges(
  id BIGSERIAL PRIMARY KEY,
  area_id UUID REFERENCES areas(id) ON DELETE CASCADE,
  way_id BIGINT,
  oneway BOOLEAN DEFAULT FALSE,
  tags JSONB,
  geom GEOMETRY(LINESTRING, 4326) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_edges_geom ON edges USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_edges_area_id ON edges(area_id);

-- Coverage routes table: stores the calculated coverage route
CREATE TABLE IF NOT EXISTS coverage_routes(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID REFERENCES areas(id) ON DELETE CASCADE,
  profile TEXT NOT NULL,
  length_m INTEGER,
  drive_time_s INTEGER,
  params JSONB NOT NULL DEFAULT '{}',
  geom GEOMETRY(LINESTRING, 4326),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coverage_routes_area_id ON coverage_routes(area_id);

-- Chunks table: stores navigable chunks of the route
CREATE TABLE IF NOT EXISTS chunks(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID REFERENCES coverage_routes(id) ON DELETE CASCADE,
  idx INT NOT NULL,
  length_m INTEGER,
  time_s INTEGER,
  geom GEOMETRY(LINESTRING, 4326) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chunks_route_idx ON chunks(route_id, idx);
CREATE INDEX IF NOT EXISTS idx_chunks_geom ON chunks USING GIST (geom);

-- Chunk instructions table: stores turn-by-turn instructions
CREATE TABLE IF NOT EXISTS chunk_instructions(
  id BIGSERIAL PRIMARY KEY,
  chunk_id UUID REFERENCES chunks(id) ON DELETE CASCADE,
  seq INT NOT NULL,
  instruction JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chunk_instructions_chunk_seq ON chunk_instructions(chunk_id, seq);

-- Covered edges table: tracks which edges have been driven
CREATE TABLE IF NOT EXISTS covered_edges(
  route_id UUID REFERENCES coverage_routes(id) ON DELETE CASCADE,
  edge_id BIGINT REFERENCES edges(id) ON DELETE CASCADE,
  device_id TEXT,
  covered_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY(route_id, edge_id, device_id)
);
CREATE INDEX IF NOT EXISTS idx_covered_edges_route_id ON covered_edges(route_id);
CREATE INDEX IF NOT EXISTS idx_covered_edges_covered_at ON covered_edges(covered_at);

-- Add updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at columns
CREATE TRIGGER update_areas_updated_at BEFORE UPDATE ON areas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_coverage_routes_updated_at BEFORE UPDATE ON coverage_routes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();