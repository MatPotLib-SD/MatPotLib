import { randomUUID } from 'node:crypto';
import type { ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { InMemorySupabase, Row } from '../../test/utils/in-memory-supabase';
import type { SupabaseService } from '../common/supabase.service';
import { AlertsService } from './alerts.service';
import type { ExpoLike } from './expo.provider';

const USER_ID = randomUUID();
const DEVICE_ID = randomUUID();
const PLANT_ID = randomUUID();
const SPECIES_ID = randomUUID();

const IN_RANGE = { moisture: 45, temp_c: 22, humidity: 50, lux: 5000 };

interface Harness {
  db: InMemorySupabase;
  service: AlertsService;
  sendMock: jest.Mock;
}

function makeHarness(options?: {
  experienceLevel?: string;
  speciesOverrides?: Row;
  noPlant?: boolean;
  tickets?: ExpoPushTicket[];
}): Harness {
  const db = new InMemorySupabase();
  db.seed('devices', [
    { id: DEVICE_ID, owner_user_id: USER_ID, status: 'online' },
  ]);
  if (!options?.noPlant) {
    db.seed('user_plants', [
      {
        id: PLANT_ID,
        owner_user_id: USER_ID,
        device_id: DEVICE_ID,
        plant_species_id: SPECIES_ID,
        nickname: 'Ferny',
      },
    ]);
  }
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
      ...(options?.speciesOverrides ?? {}),
    },
  ]);
  db.seed('profiles', [
    {
      user_id: USER_ID,
      experience_level: options?.experienceLevel ?? 'beginner',
    },
  ]);
  db.seed('push_tokens', [
    {
      id: randomUUID(),
      user_id: USER_ID,
      expo_token: 'ExponentPushToken[unit-test]',
    },
  ]);

  const sendMock = jest.fn((chunk: ExpoPushMessage[]) =>
    Promise.resolve(
      options?.tickets ??
        chunk.map((): ExpoPushTicket => ({ status: 'ok', id: 'ticket' })),
    ),
  );
  const expo: ExpoLike = {
    chunkPushNotifications: (messages) => [messages],
    sendPushNotificationsAsync: sendMock,
  };
  const supabase = { admin: db } as unknown as SupabaseService;
  return { db, service: new AlertsService(supabase, expo), sendMock };
}

describe('AlertsService.evaluate', () => {
  it('creates an active alert and sends a push when a metric is out of range', async () => {
    const { db, service, sendMock } = makeHarness();

    await service.evaluate(DEVICE_ID, { ...IN_RANGE, moisture: 10 });

    expect(db.tables.alerts).toHaveLength(1);
    const alert = db.tables.alerts[0];
    expect(alert.type).toBe('moisture_low');
    expect(alert.severity).toBe('high');
    expect(alert.status).toBe('active');
    expect(alert.user_id).toBe(USER_ID);
    expect(alert.user_plant_id).toBe(PLANT_ID);
    expect(alert.cooldown_key).toBe(`${PLANT_ID}:moisture`);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('writes a verbose message for beginners and a terse one otherwise', async () => {
    const beginner = makeHarness({ experienceLevel: 'beginner' });
    await beginner.service.evaluate(DEVICE_ID, { ...IN_RANGE, moisture: 10 });
    expect(beginner.db.tables.alerts[0].message).toContain('watering');
    expect(beginner.db.tables.alerts[0].message).toContain('Ferny');

    const expert = makeHarness({ experienceLevel: 'expert' });
    await expert.service.evaluate(DEVICE_ID, { ...IN_RANGE, moisture: 10 });
    expect(expert.db.tables.alerts[0].message).toBe(
      'Soil moisture low: 10% (ideal 30–60%).',
    );
  });

  it('suppresses a duplicate alert within the cooldown window', async () => {
    const { db, service, sendMock } = makeHarness();

    await service.evaluate(DEVICE_ID, { ...IN_RANGE, moisture: 10 });
    await service.evaluate(DEVICE_ID, { ...IN_RANGE, moisture: 8 });

    expect(db.tables.alerts).toHaveLength(1);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('resolves the active alert and emits one recovered alert on recovery', async () => {
    const { db, service } = makeHarness();

    await service.evaluate(DEVICE_ID, { ...IN_RANGE, moisture: 10 });
    await service.evaluate(DEVICE_ID, { ...IN_RANGE, moisture: 45 });

    expect(db.tables.alerts).toHaveLength(2);
    const breach = db.tables.alerts.find((a) => a.type === 'moisture_low');
    const recovered = db.tables.alerts.find(
      (a) => a.type === 'moisture_recovered',
    );
    expect(breach?.status).toBe('resolved');
    expect(recovered?.severity).toBe('info');

    // A further in-range reading must not emit another recovered alert.
    await service.evaluate(DEVICE_ID, { ...IN_RANGE, moisture: 50 });
    expect(db.tables.alerts).toHaveLength(2);
  });

  it('skips metrics whose thresholds are null', async () => {
    const { db, service, sendMock } = makeHarness({
      speciesOverrides: { ideal_moisture_min: null, ideal_moisture_max: null },
    });

    await service.evaluate(DEVICE_ID, { ...IN_RANGE, moisture: 5 });

    expect(db.tables.alerts).toHaveLength(0);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('applies the severity rule: high only for low moisture, medium otherwise', async () => {
    const lowMoisture = makeHarness();
    await lowMoisture.service.evaluate(DEVICE_ID, {
      ...IN_RANGE,
      moisture: 10,
    });
    expect(lowMoisture.db.tables.alerts[0].severity).toBe('high');

    const highMoisture = makeHarness();
    await highMoisture.service.evaluate(DEVICE_ID, {
      ...IN_RANGE,
      moisture: 90,
    });
    expect(highMoisture.db.tables.alerts[0].type).toBe('moisture_high');
    expect(highMoisture.db.tables.alerts[0].severity).toBe('medium');

    const highTemp = makeHarness();
    await highTemp.service.evaluate(DEVICE_ID, { ...IN_RANGE, temp_c: 40 });
    expect(highTemp.db.tables.alerts[0].type).toBe('temp_high');
    expect(highTemp.db.tables.alerts[0].severity).toBe('medium');
  });

  it('does nothing when no plant is linked to the device', async () => {
    const { db, service, sendMock } = makeHarness({ noPlant: true });

    await service.evaluate(DEVICE_ID, { ...IN_RANGE, moisture: 5 });

    expect(db.tables.alerts).toHaveLength(0);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('prunes push tokens rejected with DeviceNotRegistered', async () => {
    const { db, service } = makeHarness({
      tickets: [
        {
          status: 'error',
          message: 'not registered',
          details: { error: 'DeviceNotRegistered' },
        },
      ],
    });

    await service.evaluate(DEVICE_ID, { ...IN_RANGE, moisture: 10 });

    expect(db.tables.push_tokens).toHaveLength(0);
    expect(db.tables.alerts).toHaveLength(1); // alert still stored
  });
});
