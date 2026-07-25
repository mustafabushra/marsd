# Marsad Docker Quick Reference

Fast reference for common Docker operations.

## Getting Started (30 seconds)

```bash
# 1. Start everything
docker-compose up -d

# 2. Check services are healthy
docker-compose ps

# 3. Access the app
# Frontend: http://localhost:3000
# Backend: http://localhost:3001
```

## Daily Commands

| Task | Command |
|------|---------|
| Start dev environment | `docker-compose up -d` |
| Stop services | `docker-compose down` |
| View logs | `docker-compose logs -f` |
| Restart backend | `docker-compose restart backend` |
| Rebuild images | `docker-compose build` |
| Connect to DB | `docker-compose exec postgres psql -U marsad -d marsad` |
| Backend shell | `docker-compose exec backend sh` |
| Run tests | `docker-compose exec backend npm test` |
| Database migrations | `docker-compose exec backend npm run prisma:migrate` |

## Troubleshooting Quick Fixes

| Problem | Solution |
|---------|----------|
| Ports already in use | `docker ps` to find conflicting containers |
| Services not starting | `docker-compose logs [service]` to see errors |
| Want clean state | `docker-compose down -v && docker-compose up -d` |
| High memory usage | `docker stats` to see usage, restart container if needed |
| Database connection error | Check `DATABASE_URL` in logs, verify postgres is healthy |
| Redis connection error | Verify redis is running: `docker-compose logs redis` |

## Environment Files

```bash
# Use for development
cp .env.docker.dev .env

# Use for production
cp .env.docker.prod .env
# Edit .env with real production values
```

## Production Deployment

```bash
# Build production images
docker-compose -f docker-compose.yml -f docker-compose.prod.yml build

# Start production services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# View production logs
docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f
```

## Database Backup & Restore

```bash
# Backup
docker-compose exec postgres pg_dump -U marsad -d marsad > backup.sql

# Restore
docker-compose exec -T postgres psql -U marsad -d marsad < backup.sql
```

## Accessing Services

| Service | URL/Command |
|---------|------------|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:3001 |
| PostgreSQL | `localhost:5432` (db: marsad, user: marsad) |
| Redis | `localhost:6379` |

## Performance Check

```bash
# View resource usage
docker stats

# Check all services healthy
docker-compose ps

# Verify connectivity
curl http://localhost:3001/health
```

## Cleanup

```bash
# Stop and remove containers
docker-compose down

# Remove containers and volumes (WARNING: deletes data!)
docker-compose down -v

# Remove all Docker images
docker-compose down --rmi all

# System cleanup (removes unused resources)
docker system prune -a
```

## Environment Variable Quick Reference

**Development** (`.env.docker.dev`):
- `NODE_ENV=development`
- `DATABASE_URL=postgresql://marsad:marsad-dev-password@postgres:5432/marsad`
- `REDIS_URL=redis://redis:6379`
- Weak passwords (dev-only)

**Production** (`.env.docker.prod`):
- `NODE_ENV=production`
- `DATABASE_URL=postgresql://marsad:YOUR-STRONG-PASSWORD@postgres:5432/marsad`
- `REDIS_URL=redis://redis:6379`
- `JWT_SECRET=YOUR-SECURE-SECRET-KEY`
- Strong passwords required

## Windows Users

Use PowerShell script instead of Make:

```powershell
# Start development
.\docker-commands.ps1 -command up

# Start production
.\docker-commands.ps1 -command prod

# View logs
.\docker-commands.ps1 -command logs

# See all commands
.\docker-commands.ps1 -command help
```

## macOS/Linux Users

Use Makefile for convenience:

```bash
# Start development
make -f Makefile.docker docker-up

# Start production
make -f Makefile.docker docker-prod

# View logs
make -f Makefile.docker docker-logs

# Database backup
make -f Makefile.docker docker-db-backup

# See all commands
make -f Makefile.docker help
```

## Health Check Commands

```bash
# Check all services
docker-compose ps

# Frontend health
curl http://localhost:3000/health

# Backend health
curl http://localhost:3001/health

# Database health
docker-compose exec postgres pg_isready -U marsad -d marsad

# Redis health
docker-compose exec redis redis-cli ping
```

## Common Issues & Solutions

### "Cannot connect to Docker daemon"
- Ensure Docker Desktop is running
- On Linux, check if `dockerd` service is running

### "Port 3000 already in use"
- Option 1: Stop other services on that port
- Option 2: Change port in `docker-compose.yml`
- Option 3: Use project isolation: `docker-compose -p marsad-2 up`

### "No space left on device"
```bash
docker system prune -a --volumes
docker builder prune -a
```

### "Services stuck restarting"
```bash
docker-compose down -v
docker-compose up -d
docker-compose logs
```

### "Database migrations not running"
```bash
docker-compose exec backend npm run prisma:migrate
```

## Security Reminders

- Never commit `.env` files to Git
- Use strong passwords in production
- Rotate secrets regularly
- Monitor container resource usage
- Keep Docker and Docker Compose updated
- Use private Docker registries for sensitive images

## Useful Docker Inspect Commands

```bash
# View container details
docker inspect $(docker-compose ps -q backend)

# View network details
docker network inspect marsad_marsad-network

# View volume details
docker volume inspect marsad_postgres_data

# Check resource limits
docker stats
```

## Performance Monitoring

```bash
# Real-time stats
docker stats

# View logs with timestamps
docker-compose logs --timestamps -f

# Check image sizes
docker images | grep marsad

# Check volume sizes
docker volume ls | grep marsad
```

## More Information

- Full guide: See `DOCKER_SETUP.md`
- Backend docs: See `backend/README.md`
- Frontend docs: See README in project root
- Docker docs: https://docs.docker.com/
- NestJS Docker: https://docs.nestjs.com/deployment/docker
- Vite guide: https://vitejs.dev/

---

**Quick Tip**: Bookmark this file or run `make -f Makefile.docker help` for instant command reference!
