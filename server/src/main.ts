import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors();
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(`后端服务已启动: http://localhost:${port}/api`);
}

bootstrap();
