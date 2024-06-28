import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { CategorySeeder } from './seeds/category-seeder';
import { DataSource } from 'typeorm';
import { existsSync, writeFileSync } from 'fs';
import * as cors from 'cors';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { Category } from './catalog/entities/category.entity';

class CustomIoAdapter extends IoAdapter {
  constructor(app: NestExpressApplication) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const optionsWithCors: ServerOptions = {
      ...options,
      cors: {
        origin: 'http://localhost:5173', // Allow only this origin
        methods: ['GET', 'POST'],
        credentials: true,
      },
    };
    return super.createIOServer(port, optionsWithCors);
  }
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Configure CORS for HTTP routes
  app.use(
    cors({
      origin: 'http://localhost:5173', // Allow only this origin
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      credentials: true,
    }),
  );

  // Use custom WebSocket adapter for CORS
  app.useWebSocketAdapter(new CustomIoAdapter(app));

  const dataSource = app.get(DataSource);

  // Check if the category table has zero rows
  const categoryCount = await dataSource.getRepository(Category).count();
  if (categoryCount === 0) {
    console.log('No categories found, running seeder...');
    const seeder = new CategorySeeder();
    await seeder.run(dataSource);
    console.log('Categories have been seeded!');
  } else {
    console.log('Categories already exist, skipping seeder...');
  }
  // test

  // Serve static assets
  app.useStaticAssets(join(__dirname, '..', 'uploads'));

  await app.listen(3000);
}

bootstrap();
