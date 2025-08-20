#!/usr/bin/env python3
"""
Test database connection and job polling
"""

import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add app to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def test_connection():
    """Test database connection and basic operations"""
    print("Testing ScanNeo Worker...")
    
    # Test config loading
    try:
        from app.config import settings
        print(f"✓ Config loaded: {settings.service_name} v{settings.service_version}")
        print(f"  Environment: {settings.environment}")
        print(f"  Database URL: {settings.database_url[:30]}...")
    except Exception as e:
        print(f"✗ Failed to load config: {e}")
        return False
    
    # Test database connection
    try:
        from app.database import db
        if db.health_check():
            print("✓ Database connection successful")
        else:
            print("✗ Database connection failed")
            return False
    except Exception as e:
        print(f"✗ Database error: {e}")
        return False
    
    # Check for pending jobs
    try:
        job = db.get_pending_job()
        if job:
            print(f"✓ Found pending job: {job['id']}")
            print(f"  Area: {job['area_id']}")
            print(f"  Status: {job['params'].get('status', 'unknown')}")
        else:
            print("ℹ No pending jobs found")
    except Exception as e:
        print(f"✗ Error checking jobs: {e}")
    
    # Test area fetching
    try:
        # Get first area from database
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id, name FROM areas LIMIT 1")
                area = cur.fetchone()
                if area:
                    print(f"✓ Found area: {area['name']} ({area['id']})")
                    
                    # Test fetching full area data
                    area_data = db.get_area_data(area['id'])
                    if area_data:
                        print(f"  Geometry type: {area_data['geojson']['type']}")
                        print(f"  Buffer: {area_data['buffer_m']}m")
                else:
                    print("ℹ No areas found in database")
    except Exception as e:
        print(f"✗ Error fetching areas: {e}")
    
    print("\n✅ Worker test complete!")
    return True

if __name__ == "__main__":
    success = test_connection()
    sys.exit(0 if success else 1)