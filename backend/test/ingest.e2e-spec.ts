import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash, randomUUID } from 'node:crypto';
import type { ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { SupabaseService } from '../src/common/supabase.service';
import { EXPO_CLIENT, ExpoLike } from '../src/alerts/expo.provider';
import { InMemorySupabase } from './utils/in-memory-supabase';

const USER_ID = randomUUID();
const DEVICE_ID = randomUUID();
const PLANT_ID = randomUUID();
const SPECIES_ID = randomUUID();
const DEVICE_TOKEN = 'e2e-device-secret';

describe('Sensor ingest (e2e)', () => {
  let app: INestApplication<App>;
  let db: InMemorySupabase;
  let sendMock: jest.Mock<Promise<ExpoPushTicket[]>, [ExpoPushMessage[]]>;

  beforeEach(async () => {
    db = new InMemorySupabase();
    db.seed('devices', [
      {
        id: DEVICE_ID,
        owner_user_id: USER_ID,
        name: 'Pot 1',
        status: 'offline',
        last_seen_at: null,
        claim_code: 'CLAIMED',
      },
    ]);
    db.seed('device_secrets', [
      {
        device_id: DEVICE_ID,
        secret_hash: createHash('sha256').update(DEVICE_TOKEN).digest('hex'),
      },
    ]);
    db.seed('user_plants', [
      {
        id: PLANT_ID,
        owner_user_id: USER_ID,
        device_id: DEVICE_ID,
        plant_species_id: SPECIES_ID,
        nickname: 'Ferny',
      },
    ]);
    db.seed('plant_species', [
      {
        id: SPECIES_ID,
        common_name: 'Boston Fern',
        ideal_moisture_min: 30,
        ideal_moisture_max: 60,
        ideal_temp_min: 15,
        ideal_temp_max: 30,
        ideal_humidity_min: 30,
        ideal_humidity_max: 70,
        ideal_lux_min: 1000,
        ideal_lux_max: 20000,
      },
    ]);
    db.seed('profiles', [{ user_id: USER_ID, experience_level: 'beginner' }]);
    db.seed('push_tokens', [
      {
        id: randomUUID(),
        user_id: USER_ID,
        expo_token: 'ExponentPushToken[e2e-test]',
      },
    ]);

    sendMock = jest.fn((chunk: ExpoPushMessage[]) =>
      Promise.resolve(
        chunk.map((): ExpoPushTicket => ({ status: 'ok', id: 'ticket' })),
      ),
    );
    const expoMock: ExpoLike = {
      chunkPushNotifications: (messages) => [messages],
      sendPushNotificationsAsync: sendMock,
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SupabaseService)
      .useValue({ admin: db })
      .overrideProvider(EXPO_CLIENT)
      .useValue(expoMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('stores the reading, creates an alert and attempts a push', async () => {
    await request(app.getHttpServer())
      .post('/sensors/readings')
      .set('x-device-token', DEVICE_TOKEN)
      .send({
        device_id: DEVICE_ID,
        moisture: 5, // below ideal 30-60 → moisture_low alert
        temp_c: 22,
        humidity: 50,
        lux: 5000,
      })
      .expect(201)
      .expect({ ok: true });

    // Reading stored
    expect(db.tables.sensor_readings).toHaveLength(1);
    expect(db.tables.sensor_readings[0].device_id).toBe(DEVICE_ID);
    expect(db.tables.sensor_readings[0].moisture).toBe(5);

    // Device marked online
    const device = db.tables.devices[0];
    expect(device.status).toBe('online');
    expect(device.last_seen_at).toBeTruthy();

    // Alert created
    expect(db.tables.alerts).toHaveLength(1);
    expect(db.tables.alerts[0].type).toBe('moisture_low');
    expect(db.tables.alerts[0].severity).toBe('high');
    expect(db.tables.alerts[0].user_id).toBe(USER_ID);

    // Push attempted for the user's token
    expect(sendMock).toHaveBeenCalledTimes(1);
    const sent = sendMock.mock.calls[0][0];
    expect(sent[0].to).toBe('ExponentPushToken[e2e-test]');
  });

  it('rejects an invalid device token with 401', async () => {
    await request(app.getHttpServer())
      .post('/sensors/readings')
      .set('x-device-token', 'wrong-secret')
      .send({
        device_id: DEVICE_ID,
        moisture: 50,
        temp_c: 22,
        humidity: 50,
        lux: 5000,
      })
      .expect(401);

    expect(db.tables.sensor_readings).toHaveLength(0);
  });

  it('rejects an out-of-range payload with 400', async () => {
    await request(app.getHttpServer())
      .post('/sensors/readings')
      .set('x-device-token', DEVICE_TOKEN)
      .send({
        device_id: DEVICE_ID,
        moisture: 500,
        temp_c: 22,
        humidity: 50,
        lux: 5000,
      })
      .expect(400);

    expect(db.tables.sensor_readings).toHaveLength(0);
    expect(db.tables.alerts).toHaveLength(0);
  });
});
