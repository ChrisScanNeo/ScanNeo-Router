-- Check the most recent route
SELECT 
  id,
  area_name,
  status,
  progress,
  created_at,
  jsonb_array_length((metadata->'route'->'geometry'->'coordinates')::jsonb) as coordinate_count,
  metadata->'route'->'diagnostics' as diagnostics
FROM coverage_routes
ORDER BY created_at DESC
LIMIT 1;