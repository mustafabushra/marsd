# Marsad Docker Setup Guide

Production-ready Docker configuration for the Marsad platform with multi-stage builds, development and production configurations.

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Services](#services)
- [Development Setup](#development-setup)
- [Production Deployment](#production-deployment)
- [Environment Configuration](#environment-configuration)
- [Docker Commands](#docker-commands)
- [Troubleshooting](#troubleshooting)
- [Security Considerations](#security-considerations)

## Quick Start

### Development Environment

```bash
# Start all services (frontend, backend, PostgreSQL, Redis)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Rebuild images
docker-compose build
```

### Production Environment

```bash
# Start with production override
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# View logs
docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f

# Stop services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml down
```

## Architecture

### Technology Stack

- **Frontend**: React 18.2 + Vite (development) / Nginx (production)
- **Backend**: NestJS + TypeScript
- **Database**: PostgreSQL 16
- **Cache**: Redis 7
- **Container Runtime**: Docker + Docker Compose

### Service Communication

```
┌─────────────────────────────────────────────────┐
│                                                 │
│  Frontend (Vite Dev / Nginx Prod)              │
│  Port 3000 (dev) / 80 (prod)                   │
│  ├─ Hot Reload (dev)                           │
│  └─ Optimized Static Files (prod)              │
│                                                 │
└─────────────┬───────────────────────────────────┘
              │ API Calls (HTTP/HTTPS)
              │
┌─────────────▼───────────────────────────────────┐
│                                                 │
│  Backend (NestJS)                               │
│  Port 3001                                       │
│  ├─ Authentication & Authorization              │
│  ├─ Business Logic                              │
│  └─ Data Validation                             │
│                                                 │
└─────────────┬───────────────────────────────────┘
              │ Database Queries
              │
┌─────────────▼───────────────────────────────────┐
│                                                 │
│  PostgreSQL Database                            │
│  Port 5432                                       │
│  └─ Primary Data Store                          │
│                                                 │
└─────────────────────────────────────────────────┘

              │ Cache Queries
              │
┌─────────────▼───────────────────────────────────┐
│                                                 │
│  Redis Cache                                    │
│  Port 6379                                       │
│  └─ Session & Cache Storage                     │
│                                                 │
└─────────────────────────────────────────────────┘
```

## Services

### Frontend Service

**Development Mode**:
- Vite dev server with hot module replacement
- Source code mounted as volume for live updates
- Health check every 10 seconds

**Production Mode**:
- Nginx serving static files
- Optimized with compression and caching
- Security headers configured
- SPA routing support

**Configuration**:
- Port: 3000 (dev), 80 (prod)
- Memory: 512MB recommended
- CPU: 0.25-0.5 cores

### Backend Service

**Development Mode**:
- ts-node for live TypeScript compilation
- Source code mounted as volume
- Debug port 9229 exposed for VS Code debugging
- Verbose logging

**Production Mode**:
- Compiled JavaScript runtime
- Minimal memory footprint
- Info level logging
- Non-root user execution for security

**Configuration**:
- Port: 3001
- Memory: 1GB recommended
- CPU: 0.5-1 core

### PostgreSQL Service

**Configuration**:
- Image: postgres:16-alpine
- Port: 5432
- Database: marsad
- User: marsad
- Password: Configured via environment variables

**Development**:
- max_connections: 100
- shared_buffers: 256MB
- effective_cache_size: 1GB

**Production**:
- max_connections: 200
- shared_buffers: 512MB
- effective_cache_size: 2GB
- Enhanced query optimization

**Persistence**:
- Volume: postgres_data
- Location: /var/lib/postgresql/data

### Redis Service

**Configuration**:
- Image: redis:7-alpine
- Port: 6379
- Appendonly: Enabled for persistence

**Development**:
- Basic in-memory caching
- No password required

**Production**:
- Persistent storage (AOF)
- Password protected
- Max memory: 512MB
- Eviction policy: allkeys-lru
- Higher max connections: 65535

**Persistence**:
- Volume: redis_data
- Location: /data

## Development Setup

### Prerequisites

- Docker Desktop 4.0+ installed
- Docker Compose 2.0+ included
- 4GB+ RAM available
- 10GB+ free disk space

### Initial Setup

1. **Clone the repository**:
```bash
cd marsad
```

2. **Create environment file**:
```bash
cp .env.docker.dev .env
```

3. **Start services**:
```bash
docker-compose up -d
```

4. **Wait for services to be healthy**:
```bash
docker-compose ps
```

All services should show `Up (healthy)` status.

5. **Run database migrations**:
```bash
docker-compose exec backend npm run prisma:migrate
```

6. **Seed database (optional)**:
```bash
docker-compose exec backend npm run prisma:seed
```

7. **Access the application**:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- PostgreSQL: localhost:5432
- Redis: localhost:6379

### Development Workflow

**View logs**:
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
```

**Execute commands in containers**:
```bash
# Backend
docker-compose exec backend npm test
docker-compose exec backend npm run prisma:migrate

# Frontend
docker-compose exec frontend npm test
docker-compose exec frontend npm run build

# Database
docker-compose exec postgres psql -U marsad -d marsad
```

**Rebuild images**:
```bash
docker-compose build
docker-compose build --no-cache
```

**Full reset** (careful! removes data):
```bash
docker-compose down -v
docker-compose up -d
```

### Debugging

**Backend Debug in VS Code**:
1. Port 9229 is exposed for Node debugging
2. Add launch configuration to .vscode/launch.json:
```json
{
  "type": "node",
  "request": "attach",
  "name": "Docker Backend",
  "port": 9229,
  "skipFiles": ["<node_internals>/**"]
}
```
3. Start debugging: F5 or Debug menu

**View container logs**:
```bash
docker-compose logs -f [service_name]
```

**Access container shell**:
```bash
docker-compose exec backend sh
docker-compose exec frontend sh
docker-compose exec postgres psql -U marsad -d marsad
```

## Production Deployment

### Prerequisites

- Docker 20.10+ and Docker Compose 2.0+ on production server
- Minimum 8GB RAM, 4 CPU cores
- 100GB+ SSD storage for data
- HTTPS/TLS certificate from Let's Encrypt or provider
- Backup and restore procedures planned

### Pre-Deployment Checklist

- [ ] All environment variables set in `.env.docker.prod`
- [ ] AWS credentials configured for S3 and SES
- [ ] Stripe API keys obtained
- [ ] Database backups configured
- [ ] Monitoring and alerting setup
- [ ] Log aggregation configured (ELK, Datadog, etc.)
- [ ] Firewall rules configured
- [ ] SSL/TLS certificates deployed

### Deployment Steps

1. **Prepare production environment file**:
```bash
cp .env.docker.prod .env
# Edit .env with actual production values
```

2. **Build production images** (recommended):
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml build
```

3. **Start production services**:
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

4. **Verify services**:
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

5. **Run database migrations**:
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml \
  exec -T backend npm run prisma:migrate
```

6. **View logs**:
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f
```

### Production Monitoring

**Health checks**:
```bash
curl http://localhost/health          # Frontend
curl http://localhost:3001/health     # Backend
```

**Database connectivity**:
```bash
docker-compose exec postgres pg_isready -U marsad -d marsad
```

**Redis connectivity**:
```bash
docker-compose exec redis redis-cli ping
```

**View resource usage**:
```bash
docker stats
```

## Environment Configuration

### Development Environment (`env.docker.dev`)

Contains safe defaults for local development:
- Weak passwords (dev-only)
- Debug logging enabled
- Local URLs (localhost)
- Test API keys

**Never use for production data!**

### Production Environment (`.env.docker.prod`)

Contains required production settings:
- Strong secure passwords (change before deployment!)
- Info level logging
- Production domain URLs
- Real API keys and credentials

**IMPORTANT**:
1. Keep `.env.docker.prod` out of version control
2. Use a secure secret management system (Vault, Secrets Manager)
3. Rotate secrets regularly
4. Audit access to production environment variables

### Environment Variable Reference

```
NODE_ENV              Development/Production mode
PORT                  Backend port (default: 3000)
DATABASE_URL          PostgreSQL connection string
REDIS_URL             Redis connection string
JWT_SECRET            Secret key for JWT signing (min 32 chars)
AWS_*                 AWS API credentials
STRIPE_*              Stripe payment gateway keys
VITE_API_URL          Frontend API endpoint
LOG_LEVEL             Logging level (debug/info/warn/error)
```

## Docker Commands

### Image Management

```bash
# Build images
docker-compose build
docker-compose build frontend
docker-compose build --no-cache

# List images
docker images | grep marsad

# Remove images
docker-compose down --rmi all
docker rmi marsad-backend:latest
```

### Container Management

```bash
# Start services
docker-compose up -d
docker-compose up -d frontend backend

# Stop services
docker-compose stop
docker-compose stop backend

# Restart services
docker-compose restart
docker-compose restart redis

# Remove containers
docker-compose down
docker-compose down -v  # Also removes volumes
```

### Logs and Debugging

```bash
# View logs
docker-compose logs
docker-compose logs -f backend
docker-compose logs --tail=100 frontend

# Follow logs
docker-compose logs -f

# Filter logs
docker-compose logs backend 2>&1 | grep ERROR
```

### Database Operations

```bash
# Connect to PostgreSQL
docker-compose exec postgres psql -U marsad -d marsad

# Create backup
docker-compose exec postgres pg_dump -U marsad -d marsad > backup.sql

# Restore from backup
docker-compose exec -T postgres psql -U marsad -d marsad < backup.sql

# Export data
docker-compose exec postgres pg_dump -U marsad -d marsad --format=custom > backup.dump
```

### Redis Operations

```bash
# Connect to Redis CLI
docker-compose exec redis redis-cli

# Clear cache
docker-compose exec redis redis-cli FLUSHALL

# Monitor commands
docker-compose exec redis redis-cli MONITOR
```

## Troubleshooting

### Services Not Starting

**Problem**: Services stuck in "restarting" state

**Solution**:
```bash
# Check logs
docker-compose logs [service_name]

# Restart with clean state
docker-compose down -v
docker-compose up -d
```

### Database Connection Errors

**Problem**: Backend can't connect to PostgreSQL

**Solution**:
```bash
# Verify PostgreSQL is running
docker-compose ps postgres

# Check database health
docker-compose exec postgres pg_isready -U marsad -d marsad

# Check connection string in backend logs
docker-compose logs backend | grep DATABASE_URL
```

### Out of Disk Space

**Problem**: Docker images or volumes consuming too much space

**Solution**:
```bash
# Clean up unused images and volumes
docker system prune -a --volumes

# Check disk usage
docker system df

# Remove specific volume
docker volume rm marsad_postgres_data  # WARNING: Deletes data!
```

### Port Conflicts

**Problem**: Ports already in use on host

**Solution**:
```bash
# Check which process is using a port
lsof -i :3000  # macOS/Linux
netstat -ano | findstr :3000  # Windows

# Change ports in docker-compose.yml or use custom port mapping
docker-compose -p marsad-custom up -d
```

### High Memory Usage

**Problem**: Containers consuming excessive memory

**Solution**:
```bash
# Check container resource usage
docker stats

# Limit container memory (add to docker-compose.yml):
# deploy:
#   resources:
#     limits:
#       memory: 1G
#     reservations:
#       memory: 512M

# Rebuild and restart
docker-compose up -d
```

### Slow Build Times

**Problem**: Docker image builds are slow

**Solution**:
```bash
# Use BuildKit for faster builds
export DOCKER_BUILDKIT=1
docker-compose build

# Check layer caching
docker-compose build --progress=plain

# Remove cache and rebuild
docker-compose build --no-cache
```

## Security Considerations

### Image Security

- **Base Images**: Use alpine variants for minimal attack surface
- **Non-root User**: Applications run as non-root users
- **Multi-stage Builds**: Only production dependencies in final image
- **No Secrets in Images**: Secrets from environment variables only

### Network Security

- **Internal Network**: Services communicate via `marsad-network` bridge
- **Port Exposure**: Only necessary ports exposed to host
- **HTTPS**: Use reverse proxy (Nginx) with SSL/TLS in production

### Environment Security

- **Secret Management**: Use `.env` files (not in git) or secret management service
- **Rotation**: Regularly rotate secrets and API keys
- **Audit Trail**: Log access to sensitive configuration
- **Principle of Least Privilege**: Each service gets only required permissions

### Database Security

- **Strong Passwords**: Min 32 characters for PostgreSQL
- **Connection Limits**: Limited max connections per user
- **Backups**: Regular automated backups to secure location
- **Encryption**: Enable SSL for database connections in production

### Redis Security

- **Password Protection**: Redis requires password in production
- **Persistence**: AOF (Append Only File) enabled for data durability
- **Memory Limits**: Configured to prevent OOM scenarios
- **Network Isolation**: Only accessible within Docker network

### Runtime Security

```dockerfile
# Dockerfile best practices already implemented:
- Read-only root filesystem (can be added)
- Health checks for auto-recovery
- Memory limits via docker-compose
- CPU limits via docker-compose
- No privileged mode
- Drop unnecessary capabilities
```

### Monitoring and Logging

- **Container Logs**: Centralized via `docker-compose logs`
- **Health Checks**: Automated recovery on failure
- **Metrics**: Use `docker stats` for resource monitoring
- **Alerts**: Configure monitoring/alerting system (Prometheus, Datadog, etc.)

## Performance Optimization

### Frontend (Vite)

- Gzip compression enabled (Nginx)
- Asset caching with 1-year expiration
- SPA routing optimized
- Code splitting via Vite

### Backend (NestJS)

- Connection pooling for PostgreSQL
- Redis caching for sessions and hot data
- Request validation and transformation
- Error handling and logging

### Database (PostgreSQL)

- Optimized `work_mem` and `shared_buffers`
- Index creation on frequently queried columns
- Query optimization and EXPLAIN analysis
- Connection pooling via pgBouncer (optional)

### Redis

- Eviction policy: LRU for automatic cleanup
- Appendonly with fsync for durability
- Client-side caching at application level

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Reference](https://docs.docker.com/compose/compose-file/)
- [NestJS Docker Guide](https://docs.nestjs.com/deployment/docker)
- [Vite Production Guide](https://vitejs.dev/guide/build.html)
- [PostgreSQL Docker Image](https://hub.docker.com/_/postgres)
- [Redis Docker Image](https://hub.docker.com/_/redis)
- [Nginx Configuration](https://nginx.org/en/docs/)

## Support

For issues or questions:
1. Check logs: `docker-compose logs -f`
2. Review environment configuration
3. Verify service health: `docker-compose ps`
4. Check Docker documentation
5. Review Marsad project documentation

---

**Last Updated**: July 18, 2026  
**Docker Version**: 20.10+  
**Docker Compose Version**: 2.0+
