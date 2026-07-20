import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.useGlobalPipes(new ValidationPipe({ transform: true }))
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  })

  const port = process.env.PORT || 3000
  await app.listen(port)

  console.log(`🚀 Marsad API running on http://localhost:${port}`)
  console.log(`📡 WebSocket available at ws://localhost:${port}/realtime`)
}

bootstrap()
