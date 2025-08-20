#!/bin/bash

# This script should be run by a project owner to grant necessary permissions
# to the github-actions service account

PROJECT_ID="scanneo-webapp"
SERVICE_ACCOUNT="github-actions@${PROJECT_ID}.iam.gserviceaccount.com"
REGION="europe-west2"

echo "=== GCP Service Account Permission Setup ==="
echo "Project: $PROJECT_ID"
echo "Service Account: $SERVICE_ACCOUNT"
echo "Region: $REGION"
echo ""

echo "This script needs to be run by someone with Owner or Editor role on the project."
echo "You can run these commands in the GCP Cloud Shell or with gcloud CLI."
echo ""

echo "1. First, enable required APIs:"
echo "----------------------------------------"
cat << 'EOF'
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  containerregistry.googleapis.com \
  artifactregistry.googleapis.com \
  compute.googleapis.com \
  iam.googleapis.com \
  --project=scanneo-webapp
EOF

echo ""
echo "2. Grant necessary roles to the service account:"
echo "----------------------------------------"
cat << 'EOF'
# Cloud Run Admin - to deploy services
gcloud projects add-iam-policy-binding scanneo-webapp \
  --member="serviceAccount:github-actions@scanneo-webapp.iam.gserviceaccount.com" \
  --role="roles/run.admin"

# Storage Admin - for pushing images to GCR
gcloud projects add-iam-policy-binding scanneo-webapp \
  --member="serviceAccount:github-actions@scanneo-webapp.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

# Service Account User - to act as service account
gcloud projects add-iam-policy-binding scanneo-webapp \
  --member="serviceAccount:github-actions@scanneo-webapp.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

# Artifact Registry Writer (if using Artifact Registry instead of GCR)
gcloud projects add-iam-policy-binding scanneo-webapp \
  --member="serviceAccount:github-actions@scanneo-webapp.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

# Service Usage Consumer - to list and use services
gcloud projects add-iam-policy-binding scanneo-webapp \
  --member="serviceAccount:github-actions@scanneo-webapp.iam.gserviceaccount.com" \
  --role="roles/serviceusage.serviceUsageConsumer"
EOF

echo ""
echo "3. Create Artifact Registry repository (recommended over GCR):"
echo "----------------------------------------"
cat << 'EOF'
gcloud artifacts repositories create scanneo-docker \
  --repository-format=docker \
  --location=europe-west2 \
  --description="Docker images for ScanNeo" \
  --project=scanneo-webapp
EOF

echo ""
echo "4. Test the permissions:"
echo "----------------------------------------"
cat << 'EOF'
# Test listing services
gcloud services list --enabled --project=scanneo-webapp

# Test Cloud Run access
gcloud run services list --region=europe-west2 --project=scanneo-webapp
EOF

echo ""
echo "=== Alternative: Using GCP Console UI ==="
echo ""
echo "1. Go to: https://console.cloud.google.com/apis/dashboard?project=scanneo-webapp"
echo "2. Enable these APIs:"
echo "   - Cloud Run API"
echo "   - Container Registry API"
echo "   - Cloud Build API"
echo "   - Artifact Registry API"
echo ""
echo "3. Go to: https://console.cloud.google.com/iam-admin/iam?project=scanneo-webapp"
echo "4. Find: github-actions@scanneo-webapp.iam.gserviceaccount.com"
echo "5. Click Edit (pencil icon)"
echo "6. Add these roles:"
echo "   - Cloud Run Admin"
echo "   - Storage Admin"
echo "   - Service Account User"
echo "   - Artifact Registry Writer"
echo "   - Service Usage Consumer"
echo ""
echo "=== After Running These Commands ==="
echo "Trigger the GitHub Actions workflow again to deploy the worker."