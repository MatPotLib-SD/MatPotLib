import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AlertsModule } from './alerts/alerts.module';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { DevicesModule } from './devices/devices.module';
import { EnrichmentModule } from './enrichment/enrichment.module';
import { PlantsModule } from './plants/plants.module';
import { ProfilesModule } from './profiles/profiles.module';
import { SensorsModule } from './sensors/sensors.module';
import { SpeciesModule } from './species/species.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CommonModule,
    AuthModule,
    ProfilesModule,
    DevicesModule,
    PlantsModule,
    SpeciesModule,
    EnrichmentModule,
    SensorsModule,
    AlertsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
