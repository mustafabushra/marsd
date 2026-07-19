/**
 * SQL Injection Prevention Module
 * Implements best practices for preventing SQL injection attacks
 * Works with TypeORM, Prisma, and raw database queries
 *
 * OWASP Reference: A03:2021 – Injection
 */

import { DataSource, Repository, ObjectLiteral, SelectQueryBuilder } from 'typeorm';

/**
 * SQL reserved keywords that should trigger warnings
 */
const SQL_KEYWORDS = [
  'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER',
  'EXEC', 'EXECUTE', 'UNION', 'OR', 'AND', '--', '/*', '*/',
  'HAVING', 'GROUP BY', 'DECLARE', 'CAST', 'CONVERT',
];

/**
 * Detect potential SQL injection patterns in input
 */
export const detectSqlInjection = (value: string): boolean => {
  if (typeof value !== 'string') return false;

  const upperValue = value.toUpperCase();
  const injectionPatterns = [
    /['";]/g, // Check for quotes and semicolons
    /--|\#|\/\*/g, // SQL comments
    /\bUNION\b/gi, // UNION-based injection
    /\bEXEC\b|\bEXECUTE\b/gi, // Stacked queries
    /\bOR\b\s+1\s*=\s*1/gi, // Logic manipulation
  ];

  return injectionPatterns.some(pattern => pattern.test(value));
};

/**
 * Validate input for SQL injection attempts
 * Returns true if value is safe, false if potentially malicious
 */
export const isSafeInput = (value: any): boolean => {
  if (typeof value === 'string') {
    return !detectSqlInjection(value);
  }

  if (Array.isArray(value)) {
    return value.every(item => isSafeInput(item));
  }

  if (typeof value === 'object' && value !== null) {
    return Object.values(value).every(item => isSafeInput(item));
  }

  return true;
};

/**
 * Validate column name to prevent injection
 * Column names should only contain alphanumeric characters and underscores
 */
export const validateColumnName = (columnName: string): boolean => {
  // Allow only alphanumeric, underscores, and dots (for table.column syntax)
  const columnRegex = /^[a-zA-Z_][a-zA-Z0-9_.]*$/;
  return columnRegex.test(columnName);
};

/**
 * Validate multiple column names
 */
export const validateColumnNames = (columnNames: string[]): boolean => {
  return columnNames.every(name => validateColumnName(name));
};

/**
 * Escape SQL string literal
 * Use parameterized queries instead when possible
 */
export const escapeSqlString = (value: string): string => {
  if (typeof value !== 'string') return '';

  return value
    .replace(/\\/g, '\\\\') // Backslash
    .replace(/'/g, "''") // Single quote (SQL escape)
    .replace(/"/g, '\\"') // Double quote
    .replace(/\0/g, '\\0') // Null byte
    .replace(/\n/g, '\\n') // Newline
    .replace(/\r/g, '\\r') // Carriage return
    .replace(/\x1a/g, '\\Z'); // Ctrl+Z
};

/**
 * Build safe WHERE clause with parameters (TypeORM)
 */
export const buildSafeWhereClause = (
  conditions: Record<string, any>
): { where: Record<string, any>; params: Record<string, any> } => {
  const where: Record<string, any> = {};
  const params: Record<string, any> = {};

  for (const [key, value] of Object.entries(conditions)) {
    // Validate column name
    if (!validateColumnName(key)) {
      throw new Error(`Invalid column name: ${key}`);
    }

    // Validate value for injection
    if (!isSafeInput(value)) {
      throw new Error(`Potential SQL injection detected in value for column: ${key}`);
    }

    where[key] = value;
    params[key] = value;
  }

  return { where, params };
};

/**
 * Build safe ORDER BY clause
 */
export const buildSafeOrderByClause = (
  orderByString: string
): { column: string; direction: 'ASC' | 'DESC' } => {
  const parts = orderByString.trim().split(/\s+/);

  if (parts.length === 0 || parts.length > 2) {
    throw new Error('Invalid ORDER BY clause');
  }

  const column = parts[0];
  const direction = (parts[1] || 'ASC').toUpperCase() as 'ASC' | 'DESC';

  // Validate column name
  if (!validateColumnName(column)) {
    throw new Error(`Invalid column name in ORDER BY: ${column}`);
  }

  // Validate direction
  if (!['ASC', 'DESC'].includes(direction)) {
    throw new Error(`Invalid sort direction: ${direction}`);
  }

  return { column, direction };
};

/**
 * Build safe LIMIT and OFFSET values
 */
export const buildSafeLimitOffset = (
  limit?: number,
  offset?: number
): { limit: number; offset: number } => {
  // Validate limit
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 1000);

  // Validate offset
  const safeOffset = Math.max(Number(offset) || 0, 0);

  return { limit: safeLimit, offset: safeOffset };
};

/**
 * Build parameterized query helper for raw queries
 * Use this for complex queries that can't use ORM methods
 */
export class SafeQueryBuilder {
  private sql: string = '';
  private params: any[] = [];

  /**
   * Add a WHERE condition with parameters
   */
  where(column: string, operator: string, value: any): this {
    if (!validateColumnName(column)) {
      throw new Error(`Invalid column name: ${column}`);
    }

    if (!['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IN', 'NOT IN'].includes(operator.toUpperCase())) {
      throw new Error(`Invalid operator: ${operator}`);
    }

    if (!isSafeInput(value)) {
      throw new Error('Potential SQL injection detected in value');
    }

    const paramIndex = this.params.length + 1;
    this.sql += ` WHERE ${column} ${operator} $${paramIndex}`;
    this.params.push(value);

    return this;
  }

  /**
   * Add an AND condition
   */
  and(column: string, operator: string, value: any): this {
    if (!validateColumnName(column)) {
      throw new Error(`Invalid column name: ${column}`);
    }

    if (!isSafeInput(value)) {
      throw new Error('Potential SQL injection detected in value');
    }

    const paramIndex = this.params.length + 1;
    this.sql += ` AND ${column} ${operator} $${paramIndex}`;
    this.params.push(value);

    return this;
  }

  /**
   * Add an OR condition
   */
  or(column: string, operator: string, value: any): this {
    if (!validateColumnName(column)) {
      throw new Error(`Invalid column name: ${column}`);
    }

    if (!isSafeInput(value)) {
      throw new Error('Potential SQL injection detected in value');
    }

    const paramIndex = this.params.length + 1;
    this.sql += ` OR ${column} ${operator} $${paramIndex}`;
    this.params.push(value);

    return this;
  }

  /**
   * Add ORDER BY
   */
  orderBy(column: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
    if (!validateColumnName(column)) {
      throw new Error(`Invalid column name: ${column}`);
    }

    if (!['ASC', 'DESC'].includes(direction)) {
      throw new Error(`Invalid direction: ${direction}`);
    }

    this.sql += ` ORDER BY ${column} ${direction}`;
    return this;
  }

  /**
   * Add LIMIT
   */
  limit(limit: number): this {
    const safeLimit = Math.min(Math.max(parseInt(String(limit), 10), 1), 1000);
    this.sql += ` LIMIT ${safeLimit}`;
    return this;
  }

  /**
   * Add OFFSET
   */
  offset(offset: number): this {
    const safeOffset = Math.max(parseInt(String(offset), 10), 0);
    this.sql += ` OFFSET ${safeOffset}`;
    return this;
  }

  /**
   * Get final query and parameters
   */
  build(): { query: string; params: any[] } {
    return {
      query: this.sql,
      params: this.params,
    };
  }
}

/**
 * TypeORM specific protection middleware
 * Use this to wrap repository methods
 */
export const createSafeRepository = <Entity extends ObjectLiteral>(
  repository: Repository<Entity>
) => {
  return {
    /**
     * Safe find with validated WHERE conditions
     */
    async findSafe(conditions: Record<string, any>) {
      const { where } = buildSafeWhereClause(conditions);
      return repository.find({ where });
    },

    /**
     * Safe findOne with validated WHERE conditions
     */
    async findOneSafe(conditions: Record<string, any>) {
      const { where } = buildSafeWhereClause(conditions);
      return repository.findOne({ where });
    },

    /**
     * Safe find with pagination
     */
    async findWithPagination(
      conditions: Record<string, any>,
      limit: number,
      offset: number,
      orderBy?: string
    ) {
      const { where } = buildSafeWhereClause(conditions);
      const { limit: safeLimit, offset: safeOffset } = buildSafeLimitOffset(limit, offset);

      let query = repository.createQueryBuilder('entity').where(where);

      if (orderBy) {
        const { column, direction } = buildSafeOrderByClause(orderBy);
        query = query.orderBy(`entity.${column}`, direction);
      }

      const [data, total] = await query
        .take(safeLimit)
        .skip(safeOffset)
        .getManyAndCount();

      return {
        data,
        total,
        limit: safeLimit,
        offset: safeOffset,
        pages: Math.ceil(total / safeLimit),
      };
    },

    /**
     * Safe save/update
     */
    async saveSafe(entity: Partial<Entity>) {
      // Validate entity data
      if (!isSafeInput(entity)) {
        throw new Error('Potential SQL injection detected in entity data');
      }

      return repository.save(entity);
    },

    /**
     * Safe delete with validated conditions
     */
    async deleteSafe(conditions: Record<string, any>) {
      const { where } = buildSafeWhereClause(conditions);
      return repository.delete(where);
    },
  };
};

/**
 * Audit logging for suspicious query attempts
 */
export class SqlInjectionAuditLogger {
  /**
   * Log potential SQL injection attempt
   */
  static logSuspiciousQuery(
    userId: string | undefined,
    query: string,
    params: any[],
    timestamp: Date = new Date()
  ): void {
    const suspiciousIndicators = {
      detectSqlKeywords: SQL_KEYWORDS.some(keyword => query.toUpperCase().includes(keyword)),
      hasSqlComments: /--|#|\/\*|\*\//.test(query),
      hasUnionClause: /UNION/i.test(query),
      param_injection_risk: params.some(p => detectSqlInjection(String(p))),
    };

    console.warn('[SQL_INJECTION_ATTEMPT]', {
      timestamp,
      userId: userId || 'ANONYMOUS',
      query: query.substring(0, 200), // Truncate for logging
      suspiciousIndicators,
      fullParamCount: params.length,
    });

    // In production, send to centralized logging service (e.g., ELK, DataDog)
  }

  /**
   * Log successful safe query
   */
  static logSafeQuery(
    userId: string | undefined,
    operation: string,
    tableName: string,
    timestamp: Date = new Date()
  ): void {
    // Log to audit system for compliance
    console.log('[SAFE_QUERY]', {
      timestamp,
      userId: userId || 'ANONYMOUS',
      operation,
      tableName,
    });
  }
}

export default {
  detectSqlInjection,
  isSafeInput,
  validateColumnName,
  validateColumnNames,
  escapeSqlString,
  buildSafeWhereClause,
  buildSafeOrderByClause,
  buildSafeLimitOffset,
  SafeQueryBuilder,
  createSafeRepository,
  SqlInjectionAuditLogger,
};
