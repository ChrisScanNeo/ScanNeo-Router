"""
Configuration settings for the worker service
"""

import os
from typing import Optional
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """Application settings"""
    
    # Database
    database_url: str = Field(..., env='DATABASE_URL')
    
    # OpenRouteService
    ors_api_key: Optional[str] = Field(None, env='ORS_API_KEY')
    
    # Redis (Upstash)
    redis_url: Optional[str] = Field(None, env='UPSTASH_REDIS_REST_URL')
    redis_token: Optional[str] = Field(None, env='UPSTASH_REDIS_REST_TOKEN')
    
    # Overpass API (OpenStreetMap)
    overpass_url: str = Field(
        "https://overpass-api.de/api/interpreter",
        env='OVERPASS_URL'
    )
    
    # Worker settings
    poll_interval: int = Field(30, env='POLL_INTERVAL')  # seconds
    job_timeout: int = Field(3600, env='JOB_TIMEOUT')  # seconds
    max_retries: int = Field(3, env='MAX_RETRIES')
    
    # Environment
    environment: str = Field('development', env='ENVIRONMENT')
    log_level: str = Field('INFO', env='LOG_LEVEL')
    
    # Service info
    service_name: str = "scanneo-worker"
    service_version: str = "1.0.0"
    
    class Config:
        env_file = '.env'
        env_file_encoding = 'utf-8'
        case_sensitive = False


# Create settings instance
settings = Settings()