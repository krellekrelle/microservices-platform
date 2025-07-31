# Auth Service - Docker Commands Reference

## 🏗️ Building the Image

```bash
# Build the Docker image
docker build -t personal-project/auth-service .

# Build with a specific tag
docker build -t personal-project/auth-service:v1.0 .

# Build and show progress
docker build -t personal-project/auth-service . --progress=plain
```

## 🚀 Running the Container

```bash
# Run with environment file (recommended)
docker run -d -p 3001:3001 --name auth-service-container --env-file .env personal-project/auth-service

# Run with specific environment variables
docker run -d -p 3001:3001 --name auth-service-container \
  -e PORT=3001 \
  -e GOOGLE_CLIENT_ID=your-client-id \
  -e GOOGLE_CLIENT_SECRET=your-client-secret \
  -e GOOGLE_CALLBACK_URL=http://localhost:3001/auth/google/callback \
  -e FRONTEND_URL=http://localhost:3000 \
  personal-project/auth-service

# Run interactively (for debugging)
docker run -it -p 3001:3001 --env-file .env personal-project/auth-service

# Run with volume for persistent data
docker run -d -p 3001:3001 --name auth-service-container \
  --env-file .env \
  -v $(pwd)/data:/app/data \
  personal-project/auth-service
```

## 🔧 Container Management

```bash
# List running containers
docker ps

# List all containers (including stopped)
docker ps -a

# View container logs
docker logs auth-service-container

# Follow container logs (real-time)
docker logs -f auth-service-container

# Execute command in running container
docker exec -it auth-service-container sh

# Stop the container
docker stop auth-service-container

# Start stopped container
docker start auth-service-container

# Restart the container
docker restart auth-service-container

# Remove the container
docker rm auth-service-container

# Force remove running container
docker rm -f auth-service-container
```

## 🧹 Cleanup

```bash
# Remove the image
docker rmi personal-project/auth-service

# Remove all stopped containers
docker container prune

# Remove unused images
docker image prune

# Remove everything unused (containers, images, networks, volumes)
docker system prune -a
```

## 🧪 Testing the Container

```bash
# Check if the service is running
curl http://localhost:3001

# Test authentication status
curl http://localhost:3001/auth/status

# Test admin endpoint
curl http://localhost:3001/admin/users

# Test Google OAuth (should redirect to Google)
curl -I http://localhost:3001/auth/google
```

## 🐛 Debugging

```bash
# View container details
docker inspect auth-service-container

# Check container resource usage
docker stats auth-service-container

# Access container shell
docker exec -it auth-service-container sh

# View container processes
docker exec auth-service-container ps aux

# Check container environment variables
docker exec auth-service-container env
```

## 📝 Quick Start Commands

```bash
# Stop and remove existing container (if any)
docker stop auth-service-container 2>/dev/null || true
docker rm auth-service-container 2>/dev/null || true

# Build and run
docker build -t personal-project/auth-service .
docker run -d -p 3001:3001 --name auth-service-container --env-file .env personal-project/auth-service

# Test
curl http://localhost:3001
```

## 🔄 Development Workflow

```bash
# 1. Make code changes
# 2. Rebuild image
docker build -t personal-project/auth-service .

# 3. Stop old container
docker stop auth-service-container
docker rm auth-service-container

# 4. Run new container
docker run -d -p 3001:3001 --name auth-service-container --env-file .env personal-project/auth-service

# 5. Test changes
curl http://localhost:3001
```

## 🌐 Network Configuration

```bash
# Create custom network (for multi-container setup)
docker network create personal-project-network

# Run container on custom network
docker run -d --name auth-service-container \
  --network personal-project-network \
  -p 3001:3001 \
  --env-file .env \
  personal-project/auth-service

# List networks
docker network ls
```

## 📦 Data Persistence

```bash
# Create named volume for data persistence
docker volume create auth-service-data

# Run with named volume
docker run -d -p 3001:3001 --name auth-service-container \
  --env-file .env \
  -v auth-service-data:/app/data \
  personal-project/auth-service

# List volumes
docker volume ls

# Inspect volume
docker volume inspect auth-service-data
```

## 🚨 Troubleshooting

### Container won't start
```bash
# Check logs for errors
docker logs auth-service-container

# Run interactively to see startup issues
docker run -it --env-file .env personal-project/auth-service
```

### Port already in use
```bash
# Find what's using the port
lsof -i :3001

# Use different port
docker run -d -p 3002:3001 --name auth-service-container --env-file .env personal-project/auth-service
```

### Environment variables not loading
```bash
# Check if .env file exists
ls -la .env

# Verify environment variables in container
docker exec auth-service-container env | grep GOOGLE
```
