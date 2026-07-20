# ============================================================================
# MARSAD DOCKER COMMANDS - POWERSHELL SCRIPT
# Convenient Docker commands for Windows users
#
# USAGE:
#   .\docker-commands.ps1 -command up
#   .\docker-commands.ps1 -command prod
#   .\docker-commands.ps1 -command down
#   .\docker-commands.ps1 -command logs
# ============================================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$command,

    [Parameter(Mandatory=$false)]
    [string]$service,

    [Parameter(Mandatory=$false)]
    [string]$args
)

function Show-Help {
    Write-Host "Marsad Docker Commands (PowerShell)" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Development Commands:" -ForegroundColor Green
    Write-Host "  up              - Start development environment"
    Write-Host "  down            - Stop development environment"
    Write-Host "  restart         - Restart all services"
    Write-Host "  status          - Show service status"
    Write-Host "  logs            - View logs (follow mode)"
    Write-Host "  logs-backend    - View backend logs only"
    Write-Host "  logs-frontend   - View frontend logs only"
    Write-Host "  logs-db         - View database logs only"
    Write-Host ""
    Write-Host "Production Commands:" -ForegroundColor Green
    Write-Host "  prod            - Start production environment"
    Write-Host "  prod-down       - Stop production environment"
    Write-Host "  prod-logs       - View production logs"
    Write-Host ""
    Write-Host "Building:" -ForegroundColor Green
    Write-Host "  build           - Build all Docker images"
    Write-Host "  build-nocache   - Build without cache"
    Write-Host "  build-prod      - Build production images"
    Write-Host ""
    Write-Host "Database:" -ForegroundColor Green
    Write-Host "  migrate         - Run database migrations"
    Write-Host "  seed            - Seed database with test data"
    Write-Host "  db-backup       - Backup PostgreSQL database"
    Write-Host "  db-restore      - Restore from backup.sql"
    Write-Host "  db-shell        - Open PostgreSQL shell"
    Write-Host ""
    Write-Host "Shell Access:" -ForegroundColor Green
    Write-Host "  shell-backend   - Open backend container shell"
    Write-Host "  shell-frontend  - Open frontend container shell"
    Write-Host "  shell-db        - Open database shell"
    Write-Host "  shell-redis     - Open Redis shell"
    Write-Host ""
    Write-Host "Testing:" -ForegroundColor Green
    Write-Host "  test-backend    - Run backend tests"
    Write-Host "  test-frontend   - Run frontend tests"
    Write-Host ""
    Write-Host "Maintenance:" -ForegroundColor Green
    Write-Host "  clean           - Remove containers and volumes"
    Write-Host "  clean-images    - Remove all images"
    Write-Host "  prune           - Prune Docker system"
    Write-Host "  health          - Check service health"
    Write-Host "  stats           - Show container resource usage"
    Write-Host "  troubleshoot    - Run diagnostic checks"
    Write-Host ""
}

function Invoke-DockerCompose {
    param([string[]]$Arguments)
    & docker-compose @Arguments
}

function Invoke-DockerComposeProd {
    param([string[]]$Arguments)
    & docker-compose -f docker-compose.yml -f docker-compose.prod.yml @Arguments
}

# Process commands
switch ($command) {
    # ========================================================================
    # DEVELOPMENT ENVIRONMENT
    # ========================================================================
    "up" {
        Write-Host "Starting Marsad development environment..." -ForegroundColor Yellow
        Invoke-DockerCompose "up", "-d"
        Write-Host "Waiting for services to be healthy..." -ForegroundColor Yellow
        Start-Sleep -Seconds 5
        Invoke-DockerCompose "ps"
    }

    "down" {
        Write-Host "Stopping Marsad development environment..." -ForegroundColor Yellow
        Invoke-DockerCompose "down"
    }

    "restart" {
        Write-Host "Restarting all services..." -ForegroundColor Yellow
        Invoke-DockerCompose "restart"
        Invoke-DockerCompose "ps"
    }

    "status" {
        Write-Host "Service Status:" -ForegroundColor Cyan
        Invoke-DockerCompose "ps"
    }

    "logs" {
        Invoke-DockerCompose "logs", "-f"
    }

    "logs-backend" {
        Invoke-DockerCompose "logs", "-f", "backend"
    }

    "logs-frontend" {
        Invoke-DockerCompose "logs", "-f", "frontend"
    }

    "logs-db" {
        Invoke-DockerCompose "logs", "-f", "postgres"
    }

    "logs-redis" {
        Invoke-DockerCompose "logs", "-f", "redis"
    }

    # ========================================================================
    # PRODUCTION ENVIRONMENT
    # ========================================================================
    "prod" {
        Write-Host "Building production images..." -ForegroundColor Yellow
        Invoke-DockerComposeProd "build"
        Write-Host "Starting Marsad production environment..." -ForegroundColor Yellow
        Invoke-DockerComposeProd "up", "-d"
        Write-Host "Waiting for services to be healthy..." -ForegroundColor Yellow
        Start-Sleep -Seconds 5
        Invoke-DockerComposeProd "ps"
    }

    "prod-down" {
        Write-Host "Stopping Marsad production environment..." -ForegroundColor Yellow
        Invoke-DockerComposeProd "down"
    }

    "prod-logs" {
        Invoke-DockerComposeProd "logs", "-f"
    }

    # ========================================================================
    # BUILDING
    # ========================================================================
    "build" {
        Write-Host "Building Docker images..." -ForegroundColor Yellow
        Invoke-DockerCompose "build"
    }

    "build-nocache" {
        Write-Host "Building Docker images (no cache)..." -ForegroundColor Yellow
        Invoke-DockerCompose "build", "--no-cache"
    }

    "build-prod" {
        Write-Host "Building production Docker images..." -ForegroundColor Yellow
        Invoke-DockerComposeProd "build"
    }

    # ========================================================================
    # DATABASE OPERATIONS
    # ========================================================================
    "migrate" {
        Write-Host "Running database migrations..." -ForegroundColor Yellow
        Invoke-DockerCompose "exec", "backend", "npm", "run", "prisma:migrate"
    }

    "seed" {
        Write-Host "Seeding database..." -ForegroundColor Yellow
        Invoke-DockerCompose "exec", "backend", "npm", "run", "prisma:seed"
    }

    "db-backup" {
        $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $backupfile = "backup-$timestamp.sql"
        Write-Host "Backing up PostgreSQL database to $backupfile..." -ForegroundColor Yellow
        Invoke-DockerCompose "exec", "postgres", "pg_dump", "-U", "marsad", "-d", "marsad" | Out-File $backupfile
        Write-Host "Backup completed: $backupfile" -ForegroundColor Green
    }

    "db-restore" {
        if (Test-Path "backup.sql") {
            Write-Host "Restoring PostgreSQL database from backup.sql..." -ForegroundColor Yellow
            Get-Content backup.sql | Invoke-DockerCompose "exec", "-T", "postgres", "psql", "-U", "marsad", "-d", "marsad"
            Write-Host "Restore completed" -ForegroundColor Green
        }
        else {
            Write-Host "Error: backup.sql not found" -ForegroundColor Red
        }
    }

    "db-shell" {
        Invoke-DockerCompose "exec", "postgres", "psql", "-U", "marsad", "-d", "marsad"
    }

    # ========================================================================
    # SHELL ACCESS
    # ========================================================================
    "shell-backend" {
        Invoke-DockerCompose "exec", "backend", "sh"
    }

    "shell-frontend" {
        Invoke-DockerCompose "exec", "frontend", "sh"
    }

    "shell-db" {
        Invoke-DockerCompose "exec", "postgres", "psql", "-U", "marsad", "-d", "marsad"
    }

    "shell-redis" {
        Invoke-DockerCompose "exec", "redis", "redis-cli"
    }

    # ========================================================================
    # TESTING
    # ========================================================================
    "test-backend" {
        Write-Host "Running backend tests..." -ForegroundColor Yellow
        Invoke-DockerCompose "exec", "backend", "npm", "test"
    }

    "test-frontend" {
        Write-Host "Running frontend tests..." -ForegroundColor Yellow
        Invoke-DockerCompose "exec", "frontend", "npm", "test"
    }

    # ========================================================================
    # MAINTENANCE
    # ========================================================================
    "clean" {
        Write-Host "Removing containers and data volumes..." -ForegroundColor Yellow
        Invoke-DockerCompose "down", "-v"
    }

    "clean-images" {
        Write-Host "Removing all Marsad Docker images..." -ForegroundColor Yellow
        Invoke-DockerCompose "down", "--rmi", "all"
    }

    "prune" {
        Write-Host "Pruning Docker system (removing unused resources)..." -ForegroundColor Yellow
        & docker system prune -a --volumes -f
    }

    "health" {
        Write-Host "Checking service health..." -ForegroundColor Cyan

        try {
            $frontend = Invoke-WebRequest -Uri "http://localhost:3000/health" -ErrorAction SilentlyContinue
            if ($frontend.StatusCode -eq 200) {
                Write-Host "Frontend: OK" -ForegroundColor Green
            }
        }
        catch {
            Write-Host "Frontend: FAILED" -ForegroundColor Red
        }

        try {
            $backend = Invoke-WebRequest -Uri "http://localhost:3001/health" -ErrorAction SilentlyContinue
            if ($backend.StatusCode -eq 200) {
                Write-Host "Backend: OK" -ForegroundColor Green
            }
        }
        catch {
            Write-Host "Backend: FAILED" -ForegroundColor Red
        }

        Write-Host "Database: " -NoNewline
        Invoke-DockerCompose "exec", "-T", "postgres", "pg_isready", "-U", "marsad", "-d", "marsad" | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "OK" -ForegroundColor Green
        }
        else {
            Write-Host "FAILED" -ForegroundColor Red
        }

        Write-Host "Redis: " -NoNewline
        Invoke-DockerCompose "exec", "-T", "redis", "redis-cli", "ping" | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "OK" -ForegroundColor Green
        }
        else {
            Write-Host "FAILED" -ForegroundColor Red
        }
    }

    "stats" {
        Write-Host "Container resource usage:" -ForegroundColor Cyan
        & docker stats --no-stream
    }

    "troubleshoot" {
        Write-Host "=== Docker System Info ===" -ForegroundColor Cyan
        & docker version

        Write-Host ""
        Write-Host "=== Docker Compose Version ===" -ForegroundColor Cyan
        & docker-compose version

        Write-Host ""
        Write-Host "=== Marsad Services ===" -ForegroundColor Cyan
        Invoke-DockerCompose "ps"

        Write-Host ""
        Write-Host "=== Docker Disk Usage ===" -ForegroundColor Cyan
        & docker system df

        Write-Host ""
        Write-Host "=== Recent Logs (last 50 lines) ===" -ForegroundColor Cyan
        Invoke-DockerCompose "logs", "--tail=50"
    }

    # ========================================================================
    # HELP & DEFAULT
    # ========================================================================
    "help" {
        Show-Help
    }

    default {
        Write-Host "Unknown command: $command" -ForegroundColor Red
        Write-Host ""
        Show-Help
        exit 1
    }
}
