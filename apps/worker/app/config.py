"""
Configuration settings for the worker service
"""

import os
import sys
from typing import Optional
from pydantic_settings import BaseSettings
from pydantic import Field, validator


class Settings(BaseSettings):
    """Application settings"""
    
    # Database
    database_url: str = Field(..., env='DATABASE_URL')
    
    # OpenRouteService - REQUIRED for route generation
    ors_api_key: str = Field(..., env='ORS_API_KEY')
    
    # OpenRouteService endpoints
    ors_directions_url: str = Field(
        "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
        env='ORS_DIRECTIONS_URL'
    )
    ors_matrix_url: str = Field(
        "https://api.openrouteservice.org/v2/matrix/driving-car",
        env='ORS_MATRIX_URL'
    )
    
    # Redis (Upstash) for caching
    upstash_redis_rest_url: Optional[str] = Field(None, env='UPSTASH_REDIS_REST_URL')
    upstash_redis_rest_token: Optional[str] = Field(None, env='UPSTASH_REDIS_REST_TOKEN')
    
    # Overpass API (OpenStreetMap)
    overpass_url: str = Field(
        "https://overpass-api.de/api/interpreter",
        env='OVERPASS_URL'
    )
    
    # Worker settings
    poll_interval: int = Field(30, env='POLL_INTERVAL')  # seconds
    job_timeout: int = Field(3600, env='JOB_TIMEOUT')  # seconds
    max_retries: int = Field(3, env='MAX_RETRIES')
    
    # ORS rate limiting
    ors_timeout: int = Field(30, env='ORS_TIMEOUT')  # seconds per call
    ors_max_retries: int = Field(3, env='ORS_MAX_RETRIES')
    ors_retry_delay: float = Field(1.0, env='ORS_RETRY_DELAY')  # base delay in seconds
    
    # Route generation settings
    max_gap_meters: float = Field(30.0, env='MAX_GAP_METERS')  # max allowed gap in route
    snap_tolerance: float = Field(1e-6, env='SNAP_TOLERANCE')  # for intersection detection
    
    # Environment
    environment: str = Field('development', env='ENVIRONMENT')
    log_level: str = Field('INFO', env='LOG_LEVEL')
    
    # Service info
    service_name: str = "scanneo-worker"
    service_version: str = "1.0.3"
    
    @validator('ors_api_key')
    def validate_ors_key(cls, v):
        if not v or v == "":
            print("ERROR: ORS_API_KEY environment variable not set or empty", file=sys.stderr)
            print("Please set ORS_API_KEY to a valid OpenRouteService API key", file=sys.stderr)
            print("Get one at: https://openrouteservice.org/dev/#/signup", file=sys.stderr)
            sys.exit(1)
        return v
    
    class Config:
        env_file = '.env'
        env_file_encoding = 'utf-8'
        case_sensitive = False


# Create settings instance - will fail fast if ORS_API_KEY missing
try:
    settings = Settings()
    print(f"✓ Configuration loaded: ORS API key configured", file=sys.stderr)
except Exception as e:
    print(f"ERROR: Failed to load configuration: {e}", file=sys.stderr)
    sys.exit(1)