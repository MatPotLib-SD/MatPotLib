import { randomUUID } from 'node:crypto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateReadingDto } from './create-reading.dto';

async function validatePayload(payload: Record<string, unknown>) {
  return validate(plainToInstance(CreateReadingDto, payload));
}

describe('CreateReadingDto', () => {
  const valid = {
    device_id: randomUUID(),
    moisture: 42.5,
    temp_c: 21.3,
    humidity: 55,
    lux: 1200,
  };

  it('accepts a valid payload', async () => {
    expect(await validatePayload(valid)).toHaveLength(0);
  });

  it('accepts an optional numeric battery_pct', async () => {
    expect(await validatePayload({ ...valid, battery_pct: 88 })).toHaveLength(
      0,
    );
  });

  it('rejects a non-uuid device_id', async () => {
    const errors = await validatePayload({ ...valid, device_id: 'pot-1' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('device_id');
  });

  it('rejects out-of-range values', async () => {
    expect(await validatePayload({ ...valid, moisture: 101 })).not.toHaveLength(
      0,
    );
    expect(await validatePayload({ ...valid, moisture: -1 })).not.toHaveLength(
      0,
    );
    expect(await validatePayload({ ...valid, temp_c: -100 })).not.toHaveLength(
      0,
    );
    expect(await validatePayload({ ...valid, temp_c: 90 })).not.toHaveLength(0);
    expect(await validatePayload({ ...valid, humidity: 150 })).not.toHaveLength(
      0,
    );
    expect(await validatePayload({ ...valid, lux: 300000 })).not.toHaveLength(
      0,
    );
  });

  it('rejects missing required fields', async () => {
    const withoutTemp: Record<string, unknown> = { ...valid };
    delete withoutTemp.temp_c;
    const errors = await validatePayload(withoutTemp);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('temp_c');
  });

  it('rejects wrong types', async () => {
    expect(await validatePayload({ ...valid, lux: 'bright' })).not.toHaveLength(
      0,
    );
    expect(
      await validatePayload({ ...valid, moisture: '50' }),
    ).not.toHaveLength(0);
    expect(
      await validatePayload({ ...valid, battery_pct: 'full' }),
    ).not.toHaveLength(0);
  });
});
