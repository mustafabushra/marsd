/**
 * Audit Logging Module
 * Comprehensive audit trail for security events and compliance
 * Supports immutable, append-only logging
 *
 * OWASP Reference: A09:2021 – Logging and Monitoring Failures
 */

import { Request, Response } from 'express';

/**
 * Audit log entry severity levels
 */
export enum AuditSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL',
}

/**
 * Audit log entry categories
 */
export enum AuditCategory {
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  DATA_ACCESS = 'DATA_ACCESS',
  DATA_MODIFICATION = 'DATA_MODIFICATION',
  CONFIGURATION_CHANGE = 'CONFIGURATION_CHANGE',
  SECURITY_EVENT = 'SECURITY_EVENT',
  COMPLIANCE = 'COMPLIANCE',
  SYSTEM = 'SYSTEM',
}

/**
 * Audit log entry structure
 */
export interface AuditLogEntry {
  id?: string; // Generated on save
  timestamp: Date;
  severity: AuditSeverity;
  category: AuditCategory;
  action: string; // e.g., 'LOGIN_SUCCESS', 'FAILED_LOGIN', 'FILE_DOWNLOADED'
  userId?: string;
  userEmail?: string;
  userName?: string;
  ipAddress?: string;
  userAgent?: string;
  resource?: string; // What was affected (e.g., 'users/123', 'companies/456')
  resourceType?: string; // Type of resource (e.g., 'user', 'company')
  resourceId?: string;
  oldValue?: any; // Previous state (for modifications)
  newValue?: any; // New state
  status: 'SUCCESS' | 'FAILURE' | 'PARTIAL';
  statusCode?: number;
  errorMessage?: string;
  details?: Record<string, any>; // Additional context
  sessionId?: string;
  correlationId?: string; // For tracking related events
}

/**
 * Audit logger configuration
 */
interface AuditLoggerConfig {
  writeToConsole?: boolean;
  writeToFile?: boolean; // Set to false in production, use database instead
  filePath?: string;
  writeToDatabase?: boolean;
  dbConnection?: any; // Database connection (required if writeToDatabase is true)
  encryptSensitiveData?: boolean;
  redactPaths?: string[]; // Paths in objects to redact
  maskEmails?: boolean;
  maskPhoneNumbers?: boolean;
  retentionDays?: number; // How long to keep logs
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: AuditLoggerConfig = {
  writeToConsole: true,
  writeToFile: false,
  writeToDatabase: true,
  encryptSensitiveData: true,
  redactPaths: ['password', 'secret', 'token', 'apiKey', 'creditCard', 'ssn'],
  maskEmails: true,
  maskPhoneNumbers: true,
  retentionDays: 90,
};

/**
 * Audit Logger Service
 */
export class AuditLogger {
  private config: AuditLoggerConfig;
  private logBuffer: AuditLogEntry[] = [];
  private bufferFlushInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<AuditLoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Start buffer flush interval (e.g., every 5 seconds)
    if (this.config.writeToDatabase) {
      this.bufferFlushInterval = setInterval(() => this.flushBuffer(), 5000);
    }
  }

  /**
   * Generate unique log entry ID
   */
  private generateId(): string {
    return `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Redact sensitive information from value
   */
  private redactSensitiveData(value: any, path: string = ''): any {
    if (typeof value !== 'object' || value === null) {
      return value;
    }

    const redacted = Array.isArray(value) ? [...value] : { ...value };

    for (const [key, val] of Object.entries(redacted)) {
      const currentPath = path ? `${path}.${key}` : key;

      // Check if this path should be redacted
      const shouldRedact = this.config.redactPaths?.some(
        (redactPath) =>
          currentPath.toLowerCase().includes(redactPath.toLowerCase()) ||
          key.toLowerCase().includes(redactPath.toLowerCase())
      );

      if (shouldRedact) {
        redacted[key] = '[REDACTED]';
      } else if (typeof val === 'object' && val !== null) {
        redacted[key] = this.redactSensitiveData(val, currentPath);
      }
    }

    return redacted;
  }

  /**
   * Mask email addresses
   */
  private maskEmail(email: string): string {
    if (!this.config.maskEmails || !email || typeof email !== 'string') {
      return email;
    }

    const [local, domain] = email.split('@');
    if (!domain) return email;

    const maskedLocal = local[0] + '*'.repeat(Math.max(1, local.length - 2)) + local[local.length - 1];
    return `${maskedLocal}@${domain}`;
  }

  /**
   * Mask phone numbers
   */
  private maskPhoneNumber(phone: string): string {
    if (!this.config.maskPhoneNumbers || !phone || typeof phone !== 'string') {
      return phone;
    }

    const digits = phone.replace(/\D/g, '');
    if (digits.length < 4) return phone;

    const lastFour = digits.slice(-4);
    const masked = '*'.repeat(digits.length - 4) + lastFour;

    return masked;
  }

  /**
   * Prepare log entry for storage
   */
  private prepareLogEntry(entry: AuditLogEntry): AuditLogEntry {
    const prepared = { ...entry };

    // Generate ID if not present
    if (!prepared.id) {
      prepared.id = this.generateId();
    }

    // Redact sensitive data
    if (this.config.encryptSensitiveData) {
      if (prepared.oldValue) {
        prepared.oldValue = this.redactSensitiveData(prepared.oldValue);
      }
      if (prepared.newValue) {
        prepared.newValue = this.redactSensitiveData(prepared.newValue);
      }
      if (prepared.details) {
        prepared.details = this.redactSensitiveData(prepared.details);
      }
    }

    // Mask emails
    if (prepared.userEmail) {
      prepared.userEmail = this.maskEmail(prepared.userEmail);
    }

    // Mask phone numbers in details
    if (prepared.details) {
      for (const key in prepared.details) {
        if (typeof prepared.details[key] === 'string') {
          prepared.details[key] = this.maskPhoneNumber(prepared.details[key]);
        }
      }
    }

    return prepared;
  }

  /**
   * Write log entry to console
   */
  private writeToConsole(entry: AuditLogEntry): void {
    if (!this.config.writeToConsole) return;

    const timestamp = entry.timestamp.toISOString();
    const message = `[${timestamp}] [${entry.severity}] [${entry.category}] ${entry.action}`;

    const logData = {
      id: entry.id,
      userId: entry.userId,
      ipAddress: entry.ipAddress,
      status: entry.status,
      resource: entry.resource,
      details: entry.details,
    };

    console.log(message, logData);
  }

  /**
   * Write log entry to file
   */
  private async writeToFile(entry: AuditLogEntry): Promise<void> {
    if (!this.config.writeToFile || !this.config.filePath) return;

    // In production, use database instead of file
    // This is for development/debugging only
    const fs = require('fs').promises;

    try {
      const logLine = JSON.stringify(entry) + '\n';
      await fs.appendFile(this.config.filePath, logLine);
    } catch (error) {
      console.error('[AUDIT_WRITE_ERROR]', error);
    }
  }

  /**
   * Add log entry to buffer for batch writing
   */
  private addToBuffer(entry: AuditLogEntry): void {
    this.logBuffer.push(entry);

    // Flush if buffer gets large
    if (this.logBuffer.length >= 100) {
      this.flushBuffer();
    }
  }

  /**
   * Flush buffer to database
   */
  async flushBuffer(): Promise<void> {
    if (this.logBuffer.length === 0 || !this.config.writeToDatabase) return;

    const entriesToWrite = [...this.logBuffer];
    this.logBuffer = [];

    try {
      // Save to database
      // Example with TypeORM:
      // await this.config.dbConnection.getRepository(AuditLog).save(entriesToWrite);

      console.log(`[AUDIT_FLUSH] Flushed ${entriesToWrite.length} audit logs to database`);
    } catch (error) {
      console.error('[AUDIT_FLUSH_ERROR]', error);
      // Add back to buffer if write fails
      this.logBuffer.unshift(...entriesToWrite);
    }
  }

  /**
   * Log an audit event
   */
  async log(entry: Partial<AuditLogEntry>): Promise<void> {
    const fullEntry: AuditLogEntry = {
      timestamp: new Date(),
      severity: AuditSeverity.INFO,
      status: 'SUCCESS',
      ...entry,
      category: entry.category || AuditCategory.SYSTEM,
      action: entry.action || 'UNKNOWN_ACTION',
    };

    const prepared = this.prepareLogEntry(fullEntry);

    // Write to multiple destinations
    this.writeToConsole(prepared);
    await this.writeToFile(prepared);
    this.addToBuffer(prepared);
  }

  /**
   * Log authentication event
   */
  async logAuthentication(
    userId: string,
    email: string,
    action: string,
    req: Request,
    success: boolean,
    errorMessage?: string
  ): Promise<void> {
    await this.log({
      category: AuditCategory.AUTHENTICATION,
      action,
      userId,
      userEmail: email,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      status: success ? 'SUCCESS' : 'FAILURE',
      statusCode: success ? 200 : 401,
      errorMessage,
      severity: success ? AuditSeverity.INFO : AuditSeverity.WARNING,
    });
  }

  /**
   * Log authorization event
   */
  async logAuthorization(
    userId: string,
    resource: string,
    action: string,
    req: Request,
    allowed: boolean,
    reason?: string
  ): Promise<void> {
    await this.log({
      category: AuditCategory.AUTHORIZATION,
      action: `${action}_${allowed ? 'ALLOWED' : 'DENIED'}`,
      userId,
      resource,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      status: allowed ? 'SUCCESS' : 'FAILURE',
      severity: allowed ? AuditSeverity.INFO : AuditSeverity.WARNING,
      details: { reason },
    });
  }

  /**
   * Log data access event
   */
  async logDataAccess(
    userId: string,
    resource: string,
    resourceType: string,
    req: Request,
    success: boolean = true
  ): Promise<void> {
    await this.log({
      category: AuditCategory.DATA_ACCESS,
      action: 'DATA_READ',
      userId,
      resource,
      resourceType,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      status: success ? 'SUCCESS' : 'FAILURE',
    });
  }

  /**
   * Log data modification event
   */
  async logDataModification(
    userId: string,
    resource: string,
    resourceType: string,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    oldValue?: any,
    newValue?: any,
    req?: Request
  ): Promise<void> {
    await this.log({
      category: AuditCategory.DATA_MODIFICATION,
      action: `DATA_${action}`,
      userId,
      resource,
      resourceType,
      oldValue,
      newValue,
      ipAddress: req?.ip,
      userAgent: req?.headers['user-agent'],
      status: 'SUCCESS',
    });
  }

  /**
   * Log security event
   */
  async logSecurityEvent(
    action: string,
    severity: AuditSeverity,
    userId?: string,
    req?: Request,
    details?: Record<string, any>
  ): Promise<void> {
    await this.log({
      category: AuditCategory.SECURITY_EVENT,
      action,
      severity,
      userId,
      ipAddress: req?.ip,
      userAgent: req?.headers['user-agent'],
      status: 'SUCCESS',
      details,
    });
  }

  /**
   * Query audit logs
   */
  async queryLogs(
    filters: {
      userId?: string;\n      action?: string;\n      category?: AuditCategory;\n      fromDate?: Date;\n      toDate?: Date;\n      severity?: AuditSeverity;\n    },
    limit: number = 100,
    offset: number = 0
  ): Promise<{ entries: AuditLogEntry[]; total: number }> {\n    // Implementation depends on database setup
    // This is a placeholder for the actual query logic
    console.log('[AUDIT_QUERY]', filters, limit, offset);

    return { entries: [], total: 0 };
  }

  /**
   * Generate audit report
   */
  async generateReport(
    startDate: Date,
    endDate: Date,
    filters?: { userId?: string; category?: AuditCategory }
  ): Promise<Record<string, any>> {\n    const entries = await this.queryLogs(
      {
        fromDate: startDate,
        toDate: endDate,
        ...filters,
      },
      Infinity
    );

    const report = {
      generatedAt: new Date(),
      period: { startDate, endDate },
      totalEvents: entries.total,
      byCategory: {} as Record<string, number>,
      bySeverity: {} as Record<string, number>,
      byAction: {} as Record<string, number>,
    };

    // Aggregate statistics
    entries.entries.forEach((entry) => {\n      report.byCategory[entry.category] = (report.byCategory[entry.category] || 0) + 1;
      report.bySeverity[entry.severity] = (report.bySeverity[entry.severity] || 0) + 1;
      report.byAction[entry.action] = (report.byAction[entry.action] || 0) + 1;
    });

    return report;
  }

  /**
   * Cleanup old logs based on retention policy
   */
  async cleanup(): Promise<void> {\n    if (!this.config.retentionDays) return;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    console.log(`[AUDIT_CLEANUP] Deleting logs older than ${cutoffDate.toISOString()}`);

    // Implement based on database setup
    // Example: await auditLogRepository.delete({ timestamp: LessThan(cutoffDate) });
  }

  /**
   * Destroy logger and cleanup
   */
  destroy(): void {\n    if (this.bufferFlushInterval) {
      clearInterval(this.bufferFlushInterval);
    }

    // Flush remaining buffer
    this.flushBuffer();
  }
}

/**
 * Express middleware for automatic audit logging
 */
export const createAuditLoggingMiddleware = (logger: AuditLogger) => {
  return async (req: Request, res: Response, next: Function): Promise<void> => {\n    // Store original response.json
    const originalJson = res.json.bind(res);

    // Override response.json to log the response
    res.json = function (data: any) {\n      // Log based on response status
      if (res.statusCode >= 400) {
        logger.logSecurityEvent(
          `HTTP_${req.method}_${res.statusCode}`,
          AuditSeverity.WARNING,
          (req as any).user?.id,
          req,
          { path: req.path, status: res.statusCode }
        );
      }

      return originalJson(data);
    };

    next();
  };
};

export default {
  AuditSeverity,
  AuditCategory,
  AuditLogger,
  createAuditLoggingMiddleware,
};
