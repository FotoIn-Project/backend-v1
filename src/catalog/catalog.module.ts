import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogService } from './catalog.service';
import { CatalogController } from './catalog.controller';
import { Catalog } from './entities/catalog.entity';
import { CatalogGallery } from './entities/catalog-gallery.entity';
import { Category } from './entities/category.entity';
import { ConfigService } from '@nestjs/config';
import { ProfileUser } from 'src/profile-user/entities/profile-user.entity';
import { Review } from './entities/review.entity';
import { S3Service } from 'src/s3/s3.service';

@Module({
  imports: [TypeOrmModule.forFeature([Catalog, CatalogGallery, Category, ProfileUser, Review])],
  controllers: [CatalogController],
  providers: [CatalogService, ConfigService, S3Service],
})
export class CatalogModule {}
