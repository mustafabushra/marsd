/**
 * Common Module
 * Exports error handling, logging, filters, and pipes for use across the application
 */

import { Module } from '@nestjs/common'
import { LoggerService } from './logger/logger.service'

@Module({
  providers: [LoggerService],
  exports: [LoggerService],
})
export class CommonModule {}
