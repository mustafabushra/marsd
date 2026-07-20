/**
 * Swagger/OpenAPI Configuration
 * Setup and configuration for interactive API documentation
 *
 * Installation:
 * npm install @nestjs/swagger swagger-ui-express
 *
 * Usage in main.ts:
 * import { setupSwagger } from './docs/swagger.config'
 * setupSwagger(app)
 */

import { INestApplication } from '@nestjs/common'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Marsad API')
    .setDescription(
      'Complete REST API documentation for Marsad — Saudi B2B Business Trust Platform. ' +
      'All endpoints require JWT authentication except for auth/register and auth/login. ' +
      'Responses follow a consistent error handling format with structured error codes.'
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter JWT token',
      },
      'jwt',
    )
    .addServer('http://localhost:3000', 'Development')
    .addServer('https://api.marsad.local', 'Production')
    .setContact(
      'Marsad Support',
      'https://marsad.local',
      'support@marsad.local',
    )
    .setLicense('Proprietary', 'https://marsad.local/license')
    .setExternalDoc(
      'API Reference',
      'https://docs.marsad.local/api',
    )
    .build()

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey, methodKey) =>
      `${controllerKey}_${methodKey}`,
  })

  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      displayOperationId: true,
      filter: true,
      showRequestHeaders: true,
      supportedSubmitMethods: [
        'get',
        'post',
        'put',
        'patch',
        'delete',
      ],
      presets: [
        require('swagger-ui-express/swagger-ui-standalone-preset'),
      ],
    },
    customCss:
      '.swagger-ui { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto }',
    customCssUrl: [
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui.min.css',
    ],
  })

  // Also serve JSON spec
  SwaggerModule.setup('api/docs/json', app, document)

  console.log('✅ Swagger UI available at http://localhost:3000/api/docs')
  console.log('✅ OpenAPI JSON at http://localhost:3000/api/docs/json')
}

/**
 * Global exception filter decorator for Swagger
 * Use @ApiErrorResponse() on controller methods
 */
export function ApiErrorResponse() {
  return (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) => {
    // This would be expanded with @nestjs/swagger decorators
    return descriptor
  }
}
