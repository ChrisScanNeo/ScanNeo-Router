-- Migration to allow MultiPolygon geometries in areas table
-- This changes the geometry type from POLYGON to generic GEOMETRY to support both Polygon and MultiPolygon

-- Step 1: Drop the existing geometry constraint
ALTER TABLE areas 
  ALTER COLUMN geom TYPE GEOMETRY(GEOMETRY, 4326);

-- The GEOMETRY(GEOMETRY, 4326) accepts any geometry type while maintaining the SRID (4326 = WGS84)
-- This allows storing:
-- - POLYGON (single polygons)
-- - MULTIPOLYGON (multiple polygons)
-- - GEOMETRYCOLLECTION (collections of geometries)
-- - Any other PostGIS geometry type if needed

-- Verify the change
SELECT column_name, udt_name, 
       postgis_typmod_type(a.atttypmod) as geometry_type,
       postgis_typmod_srid(a.atttypmod) as srid
FROM information_schema.columns
JOIN pg_attribute a ON a.attname = column_name
JOIN pg_class c ON c.oid = a.attrelid
WHERE table_name = 'areas' 
  AND column_name = 'geom'
  AND c.relname = 'areas';