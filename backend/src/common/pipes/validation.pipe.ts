/**
 * Custom Validation Pipe
 * Enhanced validation with custom error handling
 */

import { Injectable, ValidationPipe as NestValidationPipe, BadRequestException } from '@nestjs/common'
import { ValidationError } from 'class-validator'
import { ValidationException } from '../exceptions'

@Injectable()
export class ValidationPipe extends NestValidationPipe {
  constructor() {
    super({
      whitelist: true, // Remove non-whitelisted properties
      forbidNonWhitelisted: true, // Throw error if non-whitelisted properties are present
      transform: true, // Transform payloads
      transformOptions: {
        enableImplicitConversion: true,
      },
      skipMissingProperties: false, // Check all properties
    })
  }

  /**
   * Override the default error formatting
   */
  protected createExceptionFactory() {
    return (validationErrors: ValidationError[]) => {
      if (validationErrors.length > 0) {
        const errors = this.formatErrors(validationErrors)

        throw new ValidationException(
          'Request validation failed',
          {
            errors,
            count: validationErrors.length,
          },
        )
      }

      return new BadRequestException('Validation failed')
    }
  }

  /**
   * Format validation errors into a readable structure
   */
  private formatErrors(validationErrors: ValidationError[]): Record<string, string[]> {
    const errors: Record<string, string[]> = {}

    const flattenErrors = (err: ValidationError, parentPath: string = ''): void => {
      const path = parentPath ? `${parentPath}.${err.property}` : err.property
      const messages: string[] = []

      if (err.constraints) {
        Object.values(err.constraints).forEach((constraint) => {
          messages.push(constraint)
        })
      }

      if (messages.length > 0) {
        errors[path] = messages
      }

      if (err.children && err.children.length > 0) {
        err.children.forEach((child) => {
          flattenErrors(child, path)
        })
      }
    }

    validationErrors.forEach((error) => {
      flattenErrors(error)
    })

    return errors
  }
}
