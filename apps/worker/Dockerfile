FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies for PostGIS, GDAL, and OSM tools
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    postgresql-client \
    libgeos-dev \
    libproj-dev \
    gdal-bin \
    libgdal-dev \
    python3-gdal \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create non-root user for security
RUN useradd -m -u 1000 worker && chown -R worker:worker /app
USER worker

# Expose port
EXPOSE 8080

# Health check using curl which is more reliable
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Set environment variable for port (Cloud Run sets this)
ENV PORT=8080

# Temporary: Set environment variables directly for testing
ENV ENVIRONMENT=production
ENV LOG_LEVEL=INFO
ENV POLL_INTERVAL=30
ENV JOB_TIMEOUT=3600

# Run the application with logging
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080", "--log-level", "info"]