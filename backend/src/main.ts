import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global API prefix
  app.setGlobalPrefix('api/v1');

  // Enable CORS for Expo development
  app.enableCors({
    origin: true,
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`MatPotLib API running on http://localhost:${port}/api/v1`);
}
bootstrap();
