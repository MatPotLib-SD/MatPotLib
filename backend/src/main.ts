import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global API prefix
  app.setGlobalPrefix('api/v1');

  // Configure CORS: restrictive in production, permissive in development
  const isProduction = process.env.NODE_ENV === 'production';
  const corsOriginsEnv = process.env.CORS_ORIGINS;
  const corsOrigin = isProduction
    ? (corsOriginsEnv
        ? corsOriginsEnv.split(',').map((origin) => origin.trim()).filter(Boolean)
        : [])
    : true;

  app.enableCors({
    origin: corsOrigin,
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`MatPotLib API running on http://localhost:${port}/api/v1`);
}
bootstrap();
