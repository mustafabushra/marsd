import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { metricsService } from './metrics.service';

interface HealthStatus {
  status: 'UP' | 'DEGRADED' | 'DOWN';
  timestamp: string;
  uptime: number;
  environment: string;
  version: string;
}

interface HealthCheckDetail {
  name: string;
  status: 'UP' | 'DOWN' | 'UNKNOWN';
  details?: Record<string, any>;
  duration?: number;
}

export interface FullHealthResponse {
  overall: HealthStatus;
  checks: Record<string, HealthCheckDetail>;
  metrics?: Record<string, any>;
}

@Controller('health')
export class HealthCheckController {
  private startTime = Date.now();

  @Get('/')
  @Get('/live')
  async liveCheck(@Res() res: Response): Promise<void> {
    const response: HealthStatus = {
      status: 'UP',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      environment: process.env.NODE_ENV || 'production',
      version: process.env.APP_VERSION || '1.0.0',
    };

    res.status(HttpStatus.OK).json(response);
  }

  @Get('/ready')
  async readinessCheck(@Res() res: Response): Promise<void> {
    try {
      const checks = await this.performReadinessChecks();
      const allHealthy = Object.values(checks).every((check) => check.status === 'UP');

      const response: FullHealthResponse = {
        overall: {
          status: allHealthy ? 'UP' : 'DEGRADED',
          timestamp: new Date().toISOString(),
          uptime: Math.floor((Date.now() - this.startTime) / 1000),
          environment: process.env.NODE_ENV || 'production',
          version: process.env.APP_VERSION || '1.0.0',
        },
        checks,
      };

      res
        .status(allHealthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
        .json(response);
    } catch (error) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        overall: {
          status: 'DOWN',
          timestamp: new Date().toISOString(),
          uptime: Math.floor((Date.now() - this.startTime) / 1000),
          environment: process.env.NODE_ENV || 'production',
          version: process.env.APP_VERSION || '1.0.0',
        },
        checks: {
          readiness: {
            name: 'Readiness Check',
            status: 'DOWN',
            details: { error: error instanceof Error ? error.message : String(error) },
          },
        },
      });
    }
  }

  @Get('/deep')
  async deepHealthCheck(@Res() res: Response): Promise<void> {
    try {
      const checks = await this.performDeepHealthChecks();
      const allHealthy = Object.values(checks).every((check) => check.status === 'UP');

      const response: FullHealthResponse = {
        overall: {
          status: allHealthy ? 'UP' : 'DEGRADED',
          timestamp: new Date().toISOString(),
          uptime: Math.floor((Date.now() - this.startTime) / 1000),
          environment: process.env.NODE_ENV || 'production',
          version: process.env.APP_VERSION || '1.0.0',
        },
        checks,
        metrics: metricsService.getMetricsSummary(),
      };

      res
        .status(allHealthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
        .json(response);
    } catch (error) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        overall: {
          status: 'DOWN',
          timestamp: new Date().toISOString(),
          uptime: Math.floor((Date.now() - this.startTime) / 1000),
          environment: process.env.NODE_ENV || 'production',
          version: process.env.APP_VERSION || '1.0.0',
        },
        checks: {
          deepCheck: {
            name: 'Deep Health Check',
            status: 'DOWN',
            details: { error: error instanceof Error ? error.message : String(error) },
          },
        },
      });
    }
  }

  @Get('/metrics')
  async getMetrics(@Res() res: Response): Promise<void> {
    const metrics = metricsService.getAllMetrics();
    res.status(HttpStatus.OK).json(metrics);
  }

  @Get('/metrics/prometheus')
  async getPrometheusMetrics(@Res() res: Response): Promise<void> {
    const prometheusMetrics = metricsService.exportPrometheus();
    res.type('text/plain').status(HttpStatus.OK).send(prometheusMetrics);
  }

  private async performReadinessChecks(): Promise<Record<string, HealthCheckDetail>> {
    const checks: Record<string, HealthCheckDetail> = {};

    // Database connectivity check
    checks.database = await this.checkDatabase();

    // Redis/Cache connectivity check (if applicable)
    if (process.env.REDIS_URL) {
      checks.cache = await this.checkCache();
    }

    // Memory check
    checks.memory = this.checkMemory();

    // Disk space check
    checks.diskSpace = this.checkDiskSpace();

    return checks;
  }

  private async performDeepHealthChecks(): Promise<Record<string, HealthCheckDetail>> {
    const checks = await this.performReadinessChecks();

    // Add more detailed checks
    checks.application = {
      name: 'Application',
      status: 'UP',
      details: {
        processId: process.pid,
        nodeVersion: process.version,
        platform: process.platform,
      },
    };

    // Response time check
    const startTime = Date.now();
    const responseTime = Date.now() - startTime;
    checks.responseTime = {
      name: 'Response Time',
      status: responseTime < 1000 ? 'UP' : 'DEGRADED',
      details: { responseTime: `${responseTime}ms` },
      duration: responseTime,
    };

    return checks;
  }

  private async checkDatabase(): Promise<HealthCheckDetail> {
    try {
      const startTime = Date.now();
      // This should be implemented to actually test database connectivity
      // For now, returning a placeholder
      const duration = Date.now() - startTime;

      return {
        name: 'Database',
        status: 'UP',
        details: { responseTime: `${duration}ms` },
        duration,
      };
    } catch (error) {
      return {
        name: 'Database',
        status: 'DOWN',
        details: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  private async checkCache(): Promise<HealthCheckDetail> {
    try {
      const startTime = Date.now();
      // This should be implemented to actually test cache connectivity
      // For now, returning a placeholder
      const duration = Date.now() - startTime;

      return {
        name: 'Cache',
        status: 'UP',
        details: { responseTime: `${duration}ms` },
        duration,
      };
    } catch (error) {
      return {
        name: 'Cache',
        status: 'DOWN',
        details: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  private checkMemory(): HealthCheckDetail {
    const memUsage = process.memoryUsage();
    const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    return {
      name: 'Memory',
      status: heapUsedPercent < 90 ? 'UP' : 'DEGRADED',
      details: {
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
        heapUsedPercent: `${heapUsedPercent.toFixed(2)}%`,
      },
    };
  }

  private checkDiskSpace(): HealthCheckDetail {
    // Placeholder - actual implementation would use disk space checking library
    return {
      name: 'Disk Space',
      status: 'UP',
      details: { available: 'unknown', total: 'unknown' },
    };
  }
}
