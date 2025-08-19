-- Coverage routes table
CREATE TABLE IF NOT EXISTS coverage_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  grid_cells INTEGER NOT NULL,
  street_segments INTEGER NOT NULL,
  route_data JSONB NOT NULL, -- Stores full route details, waypoints, validation
  total_distance DOUBLE PRECISION NOT NULL, -- meters
  estimated_duration DOUBLE PRECISION NOT NULL, -- seconds
  coverage_percentage DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_coverage_routes_area_id ON coverage_routes(area_id);
CREATE INDEX idx_coverage_routes_user_id ON coverage_routes(user_id);
CREATE INDEX idx_coverage_routes_created_at ON coverage_routes(created_at DESC);

-- Navigation sessions table (tracks actual driving)
CREATE TABLE IF NOT EXISTS navigation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coverage_route_id UUID NOT NULL REFERENCES coverage_routes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  device_id TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active, paused, completed, cancelled
  current_segment_index INTEGER DEFAULT 0,
  distance_traveled DOUBLE PRECISION DEFAULT 0, -- meters
  duration_elapsed DOUBLE PRECISION DEFAULT 0, -- seconds
  segments_completed INTEGER DEFAULT 0,
  segments_total INTEGER NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  paused_at TIMESTAMP WITH TIME ZONE,
  resumed_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  location_history JSONB DEFAULT '[]'::jsonb, -- Array of {lat, lng, timestamp, speed}
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_navigation_sessions_coverage_route_id ON navigation_sessions(coverage_route_id);
CREATE INDEX idx_navigation_sessions_user_id ON navigation_sessions(user_id);
CREATE INDEX idx_navigation_sessions_status ON navigation_sessions(status);
CREATE INDEX idx_navigation_sessions_started_at ON navigation_sessions(started_at DESC);

-- Reroute events table
CREATE TABLE IF NOT EXISTS reroute_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES navigation_sessions(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL, -- 'manual', 'wrong_turn', 'road_closed', 'traffic'
  original_location JSONB NOT NULL, -- {lat, lng}
  new_route JSONB NOT NULL, -- Stores the new route segments
  distance_change DOUBLE PRECISION, -- meters (positive = longer, negative = shorter)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_reroute_events_session_id ON reroute_events(session_id);
CREATE INDEX idx_reroute_events_created_at ON reroute_events(created_at DESC);

-- Coverage statistics view
CREATE OR REPLACE VIEW coverage_statistics AS
SELECT
  cr.area_id,
  a.name as area_name,
  COUNT(DISTINCT cr.id) as total_routes,
  COUNT(DISTINCT ns.id) as total_sessions,
  COUNT(DISTINCT CASE WHEN ns.status = 'completed' THEN ns.id END) as completed_sessions,
  AVG(cr.coverage_percentage) as avg_coverage,
  SUM(ns.distance_traveled) as total_distance_traveled,
  SUM(ns.duration_elapsed) as total_duration,
  MAX(ns.completed_at) as last_completed_at
FROM coverage_routes cr
LEFT JOIN areas a ON cr.area_id = a.id
LEFT JOIN navigation_sessions ns ON cr.id = ns.coverage_route_id
GROUP BY cr.area_id, a.name;

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER coverage_routes_updated_at
  BEFORE UPDATE ON coverage_routes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER navigation_sessions_updated_at
  BEFORE UPDATE ON navigation_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();