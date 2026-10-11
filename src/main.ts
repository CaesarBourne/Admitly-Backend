import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  // Ensure the sqlite data directory exists before TypeORM connects.
  const dbFile = process.env.DB_DATABASE || './data/admitly.sqlite';
  if ((process.env.DB_TYPE || 'sqlite') === 'sqlite') {
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const origins = config.get<string[]>('corsOrigins') ?? ['*'];
  app.enableCors({
    origin: origins.includes('*') ? true : origins,
    credentials: true,
  });

  const logger = new Logger('Bootstrap');

  // Swagger / OpenAPI docs at /docs
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Admitly API')
    .setDescription(
      'Multi-tenant backend for Admitly — invite/QR generation, entrance scanning and ' +
        'admission tracking, seating groups, and invitee management, scoped per organization.',
    )
    .setVersion('0.1')
    .addBearerAuth()
    .build();
  const doc = SwaggerModule.createDocument(app, swaggerConfig);
  const swaggerOutputPath = path.join(process.cwd(), 'docs', 'swagger-spec.json');
  fs.mkdirSync(path.dirname(swaggerOutputPath), { recursive: true });
  fs.writeFileSync(swaggerOutputPath, JSON.stringify(doc, null, 2));
  SwaggerModule.setup('docs', app, doc);

  const port = config.get<number>('port')!;
  await app.listen(port);

  logger.log(`🚀  API ready on http://localhost:${port}`);
  logger.log(`📚  Swagger docs on http://localhost:${port}/docs`);
  logger.log(`🧾  Swagger spec exported to ${swaggerOutputPath}`);
}

bootstrap();
