import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { JwtGuard } from '../src/common/jwt.guard';
import { SupabaseService } from '../src/common/supabase.service';
import { InMemorySupabase, Row } from './utils/in-memory-supabase';

const OWNER = randomUUID();
const OTHER = randomUUID();
const DEVICE = randomUUID();
const TOKEN = 'capture-route-test-token';
const auth = (id = OWNER) => ({ Authorization: `Bearer ${id}` });

describe('capture HTTP contract (e2e)', () => {
  let app: INestApplication<App>;
  let db: InMemorySupabase;

  beforeEach(async () => {
    db = new InMemorySupabase();
    db.seed('devices', [
      { id: DEVICE, owner_user_id: OWNER, tabling_enabled: true },
    ]);
    db.seed('device_secrets', [
      {
        device_id: DEVICE,
        secret_hash: createHash('sha256').update(TOKEN).digest('hex'),
      },
    ]);
    const ingest = db.rpc.bind(db) as (
      name: string,
      args: Record<string, unknown>,
    ) => ReturnType<InMemorySupabase['rpc']>;
    jest.spyOn(db, 'rpc').mockImplementation(async (name, args) => {
      if (
        name === 'tabling_ingest_reading' ||
        name.startsWith('tabling_owned_')
      )
        return await ingest(name, args);
      const device = db.tables.devices[0];
      const user = args.p_user_id as string | undefined;
      if (user && device.owner_user_id !== user)
        return { data: null, error: { message: 'device_not_found' } };
      const captureId = args.p_capture_id as string | undefined;
      const key = args.p_key as string | undefined;
      const capture = db.tables.capture_requests.find(
        (row) => row.id === captureId && row.device_id === DEVICE,
      );
      const byKey = db.tables.capture_requests.find(
        (row) => row.idempotency_key === key && row.device_id === DEVICE,
      );
      const active = db.tables.capture_requests.find(
        (row) =>
          row.device_id === DEVICE &&
          ['pending', 'measuring'].includes(String(row.state)),
      );
      if (name === 'tabling_create_capture') {
        if (byKey) return { data: { capture: byKey }, error: null };
        if (!device.tabling_enabled)
          return { data: null, error: { message: 'tabling_disabled' } };
        if (active)
          return { data: { active_capture_id: active.id }, error: null };
        const row: Row = {
          id: randomUUID(),
          device_id: DEVICE,
          requester_user_id: user,
          idempotency_key: key,
          state: 'pending',
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 30000).toISOString(),
          result_reading_id: null,
          failure_reason: null,
        };
        db.tables.capture_requests.push(row);
        return { data: { capture: row }, error: null };
      }
      if (name === 'tabling_cancel_pending_capture') {
        if (byKey) {
          if (['pending', 'measuring'].includes(String(byKey.state)))
            byKey.state = 'cancelled';
          return { data: byKey, error: null };
        }
        const row: Row = {
          id: randomUUID(),
          device_id: DEVICE,
          requester_user_id: user,
          idempotency_key: key,
          state: 'cancelled',
          created_at: new Date().toISOString(),
          expires_at: new Date().toISOString(),
          result_reading_id: null,
          failure_reason: 'Cancelled before request was observed',
        };
        db.tables.capture_requests.push(row);
        return { data: row, error: null };
      }
      if (name === 'tabling_active_capture')
        return { data: active ?? null, error: null };
      if (name === 'tabling_poll_capture') {
        if (active) active.state = 'measuring';
        return {
          data: {
            capture_request_id: active?.id ?? null,
            expires_at: active?.expires_at ?? null,
            remaining_ms: active ? 25000 : null,
          },
          error: null,
        };
      }
      if (!capture)
        return { data: null, error: { message: 'capture_not_found' } };
      if (
        name === 'tabling_cancel_capture' ||
        name === 'tabling_fail_capture'
      ) {
        if (['pending', 'measuring'].includes(String(capture.state)))
          capture.state =
            name === 'tabling_cancel_capture' ? 'cancelled' : 'failed';
        return { data: capture, error: null };
      }
      if (name === 'tabling_get_capture') return { data: capture, error: null };
      return { data: null, error: { message: `unsupported RPC ${name}` } };
    });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SupabaseService)
      .useValue({ admin: db })
      .overrideGuard(JwtGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => {
            getRequest: () => {
              headers: { authorization?: string };
              userId?: string;
            };
          };
        }) => {
          const req = context.switchToHttp().getRequest();
          const id = req.headers.authorization?.replace(/^Bearer /, '');
          if (!id) throw new UnauthorizedException();
          req.userId = id;
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterEach(async () => app.close());

  it('enforces user ownership and device token, then returns exact result', async () => {
    await request(app.getHttpServer())
      .post(`/devices/${DEVICE}/captures`)
      .send({ idempotency_key: 'one' })
      .expect(401);
    await request(app.getHttpServer())
      .post(`/devices/${DEVICE}/captures`)
      .set(auth(OTHER))
      .send({ idempotency_key: 'one' })
      .expect(404);
    const created = await request(app.getHttpServer())
      .post(`/devices/${DEVICE}/captures`)
      .set(auth())
      .send({ idempotency_key: 'one' })
      .expect(201);
    const id = (created.body as { id: string }).id;
    expect(
      (
        await request(app.getHttpServer())
          .post(`/devices/${DEVICE}/captures`)
          .set(auth())
          .send({ idempotency_key: 'one' })
          .expect(201)
      ).body as { id: string },
    ).toMatchObject({ id });
    const conflict = await request(app.getHttpServer())
      .post(`/devices/${DEVICE}/captures`)
      .set(auth())
      .send({ idempotency_key: 'two' })
      .expect(409);
    expect(
      (conflict.body as { active_capture_id: string }).active_capture_id,
    ).toBe(id);
    await request(app.getHttpServer())
      .post('/devices/captures/poll')
      .set('x-device-token', 'wrong')
      .send({ device_id: DEVICE })
      .expect(401);
    const poll = await request(app.getHttpServer())
      .post('/devices/captures/poll')
      .set('x-device-token', TOKEN)
      .send({ device_id: DEVICE })
      .expect(200);
    expect(
      (poll.body as { capture_request_id: string }).capture_request_id,
    ).toBe(id);
    await request(app.getHttpServer())
      .post('/sensors/readings')
      .set('x-device-token', TOKEN)
      .send({
        device_id: DEVICE,
        capture_request_id: id,
        moisture: 30,
        temp_c: 21,
        humidity: 45,
        lux: 1500,
      })
      .expect(400);
    const reading = await request(app.getHttpServer())
      .post('/sensors/readings')
      .set('x-device-token', TOKEN)
      .send({
        device_id: DEVICE,
        capture_request_id: id,
        sample_age_ms: 100,
        moisture: 30,
        temp_c: 21,
        humidity: 45,
        lux: 1500,
      })
      .expect(201);
    const readingId = (reading.body as { reading: { id: number } }).reading.id;
    db.tables.capture_requests[0].state = 'completed';
    db.tables.capture_requests[0].result_reading_id = readingId;
    const result = await request(app.getHttpServer())
      .get(`/devices/${DEVICE}/captures/${id}`)
      .set(auth())
      .expect(200);
    expect(
      (result.body as { reading: { id: number; capture_request_id: string } })
        .reading,
    ).toMatchObject({ id: readingId, capture_request_id: id });
    expect(
      (
        await request(app.getHttpServer())
          .post(`/devices/${DEVICE}/captures/${id}/cancel`)
          .set(auth())
          .expect(201)
      ).body as { state: string },
    ).toMatchObject({ state: 'completed' });
  });

  it('cancels an unknown key without touching a different active request, and reports failure', async () => {
    const active = await request(app.getHttpServer())
      .post(`/devices/${DEVICE}/captures`)
      .set(auth())
      .send({ idempotency_key: 'active' })
      .expect(201);
    const cancelled = await request(app.getHttpServer())
      .post(`/devices/${DEVICE}/captures/cancel-pending`)
      .set(auth())
      .send({ idempotency_key: 'lost' })
      .expect(201);
    expect((cancelled.body as { state: string }).state).toBe('cancelled');
    const activeId = (active.body as { id: string }).id;
    expect(
      (
        await request(app.getHttpServer())
          .get(`/devices/${DEVICE}/active-capture`)
          .set(auth())
          .expect(200)
      ).body as { id: string },
    ).toMatchObject({ id: activeId });
    expect(
      (
        await request(app.getHttpServer())
          .post(`/devices/${DEVICE}/captures`)
          .set(auth())
          .send({ idempotency_key: 'lost' })
          .expect(201)
      ).body as { state: string },
    ).toMatchObject({ state: 'cancelled' });
    await request(app.getHttpServer())
      .post(`/devices/captures/${activeId}/fail`)
      .set('x-device-token', TOKEN)
      .send({ device_id: DEVICE, reason: 'probe failed' })
      .expect(201);
    expect(
      (
        await request(app.getHttpServer())
          .get(`/devices/${DEVICE}/captures/${activeId}`)
          .set(auth())
          .expect(200)
      ).body as { state: string },
    ).toMatchObject({ state: 'failed' });
    db.tables.devices[0].tabling_enabled = false;
    expect(
      (
        await request(app.getHttpServer())
          .post(`/devices/${DEVICE}/captures/cancel-pending`)
          .set(auth())
          .send({ idempotency_key: 'disabled' })
          .expect(201)
      ).body as { state: string },
    ).toMatchObject({ state: 'cancelled' });
    await request(app.getHttpServer())
      .post('/sensors/readings')
      .set('x-device-token', TOKEN)
      .send({
        device_id: DEVICE,
        capture_request_id: randomUUID(),
        sample_age_ms: 0,
        moisture: 30,
        temp_c: 21,
        humidity: 45,
        lux: 1500,
      })
      .expect(404);
  });

  it('does not expose readings through stale device or plant ownership', async () => {
    db.seed('user_plants', [
      {
        id: randomUUID(),
        owner_user_id: OWNER,
        device_id: DEVICE,
        plant_species_id: null,
        nickname: 'Event plant',
      },
    ]);
    await request(app.getHttpServer())
      .post('/sensors/readings')
      .set('x-device-token', TOKEN)
      .send({
        device_id: DEVICE,
        sample_age_ms: 0,
        moisture: 30,
        temp_c: 21,
        humidity: 45,
        lux: 1500,
      })
      .expect(201);
    await request(app.getHttpServer())
      .get(`/sensors/${DEVICE}`)
      .set(auth())
      .expect(200);
    db.tables.devices[0].owner_user_id = OTHER;
    await request(app.getHttpServer())
      .get(`/sensors/${DEVICE}`)
      .set(auth())
      .expect(404);
    await request(app.getHttpServer())
      .get(`/sensors/${DEVICE}/history`)
      .set(auth())
      .expect(404);
    const plants = await request(app.getHttpServer())
      .get('/plants')
      .set(auth())
      .expect(200);
    expect(
      (plants.body as { latest_reading: unknown }[])[0].latest_reading,
    ).toBeNull();
  });
});
