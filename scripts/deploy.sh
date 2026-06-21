#!/bin/bash
echo "Building Docker images..."
for svc in gateway auth trading mining user; do
  docker build -t local/$svc services/$svc/
done
echo "Starting services with Docker Compose..."
docker-compose -f docker/docker-compose.yml up -d
echo "Services started. Access gateway at http://localhost:8000"
