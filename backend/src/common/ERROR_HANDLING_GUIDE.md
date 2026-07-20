# Backend Error Handling Guide

## Overview

This guide documents the comprehensive error handling system for the Marsad backend. The system provides:

- **Custom Exception Classes** for different error scenarios
- **Global Exception Filter** for standardized API responses
- **Validation Pipe** for input validation with custom error messages
- **Logger Service** for structured logging with file rotation
- **Request Logger Middleware** for request/response tracking
- **Error Codes** with standardized mappings and messages

## Architecture

```
┌─ Request ─┐
     │
     ▼
[Request Logger Middleware] → Assigns request ID, logs incoming request
     │
     ▼
[Validation Pipe] → Validates request DTO/payload
     │ (error) → [Global Exception Filter]
     │ (success) → Controller
     │
     ▼
[Controller Logic] → May throw custom exceptions
     │ (success) → Response with 200 status
     │ (error) → Thrown exception
     │
     ▼
[Global Exception Filter] → Catches all exceptions
     │ (BaseException) → Extract error code and details
     │ (HttpException) → Map to error code
     │ (Unknown) → Log and return generic error
     │
     ▼
[Formatted Error Response] → Return to client
```

## Error Codes

Error codes are structured by category (xxxx in ERRxxx):

- **4001-4099**: Validation errors (400 Bad Request)
- **4100-4199**: Authentication errors (401 Unauthorized)
- **4200-4299**: Resource errors (404 Not Found)
- **4300-4399**: Business logic errors (422 Unprocessable Entity)
- **4400-4499**: Rate limiting errors (429 Too Many Requests)
- **5000-5999**: Server errors (500 Internal Server Error)

### Common Error Codes

```typescript
ErrorCode.INVALID_REQUEST           // 400
ErrorCode.UNAUTHORIZED              // 401
ErrorCode.INVALID_CREDENTIALS       // 401
ErrorCode.RESOURCE_NOT_FOUND        // 404
ErrorCode.RESOURCE_ALREADY_EXISTS   // 409
ErrorCode.VALIDATION_FAILED         // 400
ErrorCode.BUSINESS_RULE_VIOLATION   // 422
ErrorCode.RATE_LIMIT_EXCEEDED       // 429
ErrorCode.INTERNAL_SERVER_ERROR     // 500
ErrorCode.DATABASE_ERROR            // 500
ErrorCode.SERVICE_UNAVAILABLE       // 503
```

## Usage Examples

### Throwing Validation Exceptions

```typescript
import { ValidationException } from '@common/exceptions'

throw new ValidationException(
  'Email already registered',
  { email: 'user@example.com' }
)

// Response:
// {
//   "success": false,
//   "error": {
//     "code": "ERR_4002",
//     "message": "Email already registered",
//     "details": { "email": "user@example.com" },
//     "timestamp": "2026-07-18T10:00:00.000Z",
//     "requestId": "req-123"
//   }
// }
```

### Throwing Authentication Exceptions

```typescript
import { AuthenticationException } from '@common/exceptions'
import { ErrorCode } from '@common/constants/error-codes'

throw new AuthenticationException(
  ErrorCode.INVALID_CREDENTIALS,
  'Invalid email or password'
)
```

### Throwing Not Found Exceptions

```typescript
import { NotFoundException } from '@common/exceptions'

const company = await this.companyService.findById(companyId)
if (!company) {
  throw new NotFoundException('Company', companyId)
}
```

### Throwing Business Rule Exceptions

```typescript
import { BusinessRuleException } from '@common/exceptions'
import { ErrorCode } from '@common/constants/error-codes'

if (company.status !== 'ACTIVE') {
  throw new BusinessRuleException(
    ErrorCode.INVALID_STATE_TRANSITION,
    'Cannot process reports for inactive companies',
    { currentStatus: company.status }
  )
}
```

### Throwing Database Exceptions

```typescript
import { DatabaseException } from '@common/exceptions'

try {
  return await this.database.query(sql)
} catch (error) {
  throw new DatabaseException(
    'Failed to execute query',
    { query: sql, originalError: error.message }
  )
}
```

### Throwing Rate Limit Exceptions

```typescript
import { RateLimitException } from '@common/exceptions'

if (requestCount > limit) {
  throw new RateLimitException(60) // Retry after 60 seconds
}
```

## Logging Examples

### Log Authentication Events

```typescript
this.logger.logAuth('LOGIN', userId, { ipAddress: '192.168.1.1' })
this.logger.logAuth('TOKEN_REFRESH', userId)
this.logger.logAuth('MFA', userId, { method: 'SMS' })
```

### Log Authorization Checks

```typescript
this.logger.logAuthorization(
  allowed,
  'Report',
  'VIEW',
  userId,
  allowed ? undefined : 'Insufficient permissions'
)
```

### Log Database Operations

```typescript
const startTime = Date.now()
const result = await this.database.query(sql)
const duration = Date.now() - startTime

this.logger.logDatabase('SELECT', duration, requestId)
```

### Log Security Events

```typescript
this.logger.logSecurityEvent(
  'Unauthorized access attempt',
  'HIGH',
  userId,
  { resource: 'AdminPanel', action: 'Configure' }
)

this.logger.logSecurityEvent(
  'Suspicious IP detected',
  'CRITICAL',
  undefined,
  { ipAddress: '192.168.1.1', reason: 'Multiple failed logins' }
)
```

### Log External Service Calls

```typescript
const startTime = Date.now()
const response = await this.externalService.call()
const duration = Date.now() - startTime

this.logger.logExternalService(
  'TrustScoreAPI',
  'GET /score/:companyId',
  response.status,
  duration,
  requestId
)
```

## Setting Up Error Handling in App Module

```typescript
import { Module } from '@nestjs/common'
import { APP_FILTER, APP_PIPE } from '@nestjs/core'
import { HttpExceptionFilter, ValidationPipe, LoggerService, CommonModule } from '@common'

@Module({
  imports: [CommonModule],
  providers: [
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_PIPE,
      useClass: ValidationPipe,
    },
  ],
})
export class AppModule {}
```

## Setting Up Request Logger Middleware

```typescript
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common'
import { RequestLoggerMiddleware } from '@common'

@Module({})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*')
  }
}
```

## Creating DTOs with Validation

```typescript
import { IsEmail, IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator'

export class CreateUserDto {
  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Invalid email format' })
  email: string

  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(50, { message: 'Password must not exceed 50 characters' })
  password: string

  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  name: string
}

// The validation pipe will automatically validate these and throw
// a ValidationException with formatted error messages
```

## Log Files

Log files are created in the `logs/` directory with the following naming convention:

- `error-YYYY-MM-DD.log` - All errors
- `warn-YYYY-MM-DD.log` - Warnings
- `info-YYYY-MM-DD.log` - Info level logs
- `debug-YYYY-MM-DD.log` - Debug level logs (development only)

Each log entry is a JSON object with:

```json
{
  "timestamp": "2026-07-18T10:00:00.000Z",
  "level": "ERROR",
  "message": "Database operation failed",
  "data": {
    "errorCode": "ERR_5001",
    "statusCode": 500,
    "path": "/api/companies",
    "method": "POST"
  }
}
```

## Best Practices

1. **Always provide context**: Include relevant information in exception details
   ```typescript
   throw new NotFoundException('Company', companyId)
   ```

2. **Use specific exception types**: Don't throw generic exceptions
   ```typescript
   // Good
   throw new ConflictException('User', { email })

   // Bad
   throw new Error('User already exists')
   ```

3. **Log security events**: Always log authentication/authorization attempts
   ```typescript
   this.logger.logSecurityEvent('Login attempt', 'MEDIUM', userId)
   ```

4. **Include request ID in logs**: Always pass requestId for traceability
   ```typescript
   this.logger.error('Operation failed', { requestId, userId })
   ```

5. **Don't expose sensitive data**: Never log passwords, tokens, or secrets
   ```typescript
   // Good
   this.logger.info('User login', { userId, email })

   // Bad
   this.logger.info('User login', { userId, password })
   ```

6. **Handle database errors gracefully**: Catch database errors and wrap them
   ```typescript
   try {
     return await this.database.query(sql)
   } catch (error) {
     throw new DatabaseException('Query failed', { sql: sanitize(sql) })
   }
   ```

7. **Use error codes consistently**: Always use standardized error codes
   ```typescript
   throw new ValidationException('Invalid input', { fields })
   ```

8. **Test error scenarios**: Test both success and error paths
   ```typescript
   it('should throw NotFoundException when user not found', async () => {
     await expect(userService.findById(999)).rejects.toThrow(NotFoundException)
   })
   ```

## Cleanup

The logger service can clean up old log files automatically:

```typescript
// In main.ts or a scheduled task
const logger = app.get(LoggerService)
logger.cleanOldLogs(30) // Keep logs from last 30 days
```

## Troubleshooting

### Errors not being caught
- Ensure HttpExceptionFilter is registered as APP_FILTER
- Check that ValidationPipe is registered as APP_PIPE

### Custom exceptions not formatted correctly
- Ensure exception extends BaseException
- Verify ErrorCode and ErrorMessages are properly defined

### Logs not being written
- Check file system permissions for `logs/` directory
- Ensure NODE_ENV is set to 'production' for file logging

### Performance issues
- Review error logging frequency
- Consider batch processing for high-volume logs
- Monitor log file sizes and rotate as needed

## Performance Considerations

1. **Async Logging**: Error logging is non-blocking
2. **Batch Flushing**: Errors are batched before writing to disk (production only)
3. **File Rotation**: Logs are rotated daily by timestamp
4. **Cleanup**: Old logs can be automatically cleaned up

## Security Considerations

1. **No Sensitive Data**: Never log passwords, tokens, or secrets
2. **Request ID Tracking**: All logs include request ID for auditing
3. **Error Details**: Error details are stripped in production responses
4. **Rate Limiting**: Excessive errors are tracked and can trigger alerts
5. **Security Events**: All security-related errors are logged with HIGH or CRITICAL severity
