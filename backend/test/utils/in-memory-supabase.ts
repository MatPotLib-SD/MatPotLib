import { randomUUID } from 'node:crypto';

export type Row = Record<string, unknown>;

type Filter = (row: Row) => boolean;

interface QueryResult {
  data: any;
  error: { message: string } | null;
}

/**
 * Tiny in-memory stand-in for the supabase-js query builder covering only
 * the chains this backend uses (select/insert/update/delete + eq/in/gte/
 * lte/is/or + order/limit + single/maybeSingle). Tables are plain arrays.
 */
export class InMemorySupabase {
  public readonly tables: Record<string, Row[]> = {
    profiles: [],
    devices: [],
    device_secrets: [],
    plant_species: [],
    user_plants: [],
    sensor_readings: [],
    capture_requests: [],
    alerts: [],
    push_tokens: [],
  };

  from(table: string): FakeQuery {
    if (!this.tables[table]) this.tables[table] = [];
    return new FakeQuery(this.tables[table]);
  }

  rpc(name: string, args: Record<string, unknown>): Promise<QueryResult> {
    if (name === 'tabling_owned_latest' || name === 'tabling_owned_history') {
      const device = this.tables.devices.find(
        (row) =>
          row.id === args.p_device_id && row.owner_user_id === args.p_user_id,
      );
      if (!device)
        return Promise.resolve({
          data: null,
          error: { message: 'device_not_found' },
        });
      const readings = this.tables.sensor_readings
        .filter((row) => row.device_id === args.p_device_id)
        .filter(
          (row) =>
            !args.p_from || String(row.captured_at) >= (args.p_from as string),
        )
        .filter(
          (row) =>
            !args.p_to || String(row.captured_at) <= (args.p_to as string),
        )
        .sort(
          (a, b) =>
            String(a.captured_at).localeCompare(String(b.captured_at)) ||
            Number(a.id) - Number(b.id),
        );
      return Promise.resolve({
        data:
          name === 'tabling_owned_latest'
            ? (readings.at(-1) ?? null)
            : readings.slice(0, 5000),
        error: null,
      });
    }
    if (name !== 'tabling_ingest_reading') {
      return Promise.resolve({
        data: null,
        error: { message: `unsupported RPC ${name}` },
      });
    }
    const now = new Date();
    const age = (args.p_sample_age_ms as number | null) ?? null;
    const captureId = args.p_capture_request_id as string | null;
    const existing = captureId
      ? this.tables.sensor_readings.find(
          (row) => row.capture_request_id === captureId,
        )
      : null;
    if (existing)
      return Promise.resolve({
        data: { reading: existing, inserted: false, suppress_alerts: false },
        error: null,
      });
    const device = this.tables.devices.find(
      (row) => row.id === args.p_device_id,
    );
    if (!device)
      return Promise.resolve({
        data: null,
        error: { message: 'device_not_found' },
      });
    const capture = captureId
      ? this.tables.capture_requests.find(
          (row) => row.id === captureId && row.device_id === args.p_device_id,
        )
      : null;
    if (captureId && !capture) {
      return Promise.resolve({
        data: null,
        error: { message: 'capture_not_found' },
      });
    }
    if (
      captureId &&
      (!capture || !['pending', 'measuring'].includes(String(capture.state)))
    ) {
      return Promise.resolve({
        data: null,
        error: { message: 'capture_not_active' },
      });
    }
    if (captureId && age === null) {
      return Promise.resolve({
        data: null,
        error: { message: 'sample_age_required' },
      });
    }
    const row: Row = {
      id: this.tables.sensor_readings.length + 1,
      device_id: args.p_device_id,
      ts: now.toISOString(),
      captured_at: new Date(now.getTime() - (age ?? 0)).toISOString(),
      time_source: age === null ? 'receipt' : 'estimated',
      sample_age_ms: age,
      capture_request_id: captureId,
      moisture: args.p_moisture,
      temp_c: args.p_temp_c,
      humidity: args.p_humidity,
      lux: args.p_lux,
      battery_pct: args.p_battery_pct,
    };
    this.tables.sensor_readings.push(row);
    device.last_seen_at = row.ts;
    device.status = 'online';
    if (capture) {
      capture.state = 'completed';
      capture.result_reading_id = row.id;
    }
    return Promise.resolve({
      data: {
        reading: row,
        inserted: true,
        suppress_alerts: !!device.tabling_enabled,
      },
      error: null,
    });
  }

  seed(table: string, rows: Row[]): void {
    this.from(table); // ensure table exists
    this.tables[table].push(...rows);
  }

  reset(): void {
    for (const key of Object.keys(this.tables)) {
      this.tables[key].length = 0;
    }
  }
}

export class FakeQuery implements PromiseLike<QueryResult> {
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload: Row | Row[] | null = null;
  private filters: Filter[] = [];
  private orderBy: { column: string; ascending: boolean }[] = [];
  private limitCount: number | null = null;
  private wantSingle = false;
  private wantMaybeSingle = false;

  constructor(private readonly rows: Row[]) {}

  select(columns?: string): this {
    void columns;
    return this;
  }

  insert(payload: Row | Row[]): this {
    this.op = 'insert';
    this.payload = payload;
    return this;
  }

  update(payload: Row): this {
    this.op = 'update';
    this.payload = payload;
    return this;
  }

  delete(): this {
    this.op = 'delete';
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  is(column: string, value: unknown): this {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  gte(column: string, value: string | number): this {
    this.filters.push((row) => (row[column] as string | number) >= value);
    return this;
  }

  lte(column: string, value: string | number): this {
    this.filters.push((row) => (row[column] as string | number) <= value);
    return this;
  }

  or(expression: string): this {
    const parts = expression.split(/,(?![^{]*})/);
    this.filters.push((row) =>
      parts.some((part) => this.matchOrPart(row, part.trim())),
    );
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orderBy.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  maybeSingle(): this {
    this.wantMaybeSingle = true;
    return this;
  }

  single(): this {
    this.wantSingle = true;
    return this;
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private matchOrPart(row: Row, part: string): boolean {
    const match = /^(\w+)\.(ilike|eq|cs)\.(.*)$/.exec(part);
    if (!match) return false;
    const [, column, operator, raw] = match;
    const cell = row[column];
    if (operator === 'ilike') {
      if (typeof cell !== 'string') return false;
      const pattern = raw
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/%/g, '.*');
      return new RegExp(`^${pattern}$`, 'i').test(cell);
    }
    if (operator === 'cs') {
      if (!Array.isArray(cell)) return false;
      const values = raw
        .replace(/^\{|\}$/g, '')
        .split(',')
        .map((v) => v.trim().replace(/^"|"$/g, '').toLowerCase())
        .filter(Boolean);
      return values.every((v) =>
        cell.some(
          (item) => typeof item === 'string' && item.toLowerCase() === v,
        ),
      );
    }
    return cell === raw;
  }

  private execute(): QueryResult {
    const matches = this.rows.filter((row) =>
      this.filters.every((filter) => filter(row)),
    );

    let result: Row[];
    if (this.op === 'insert') {
      const items = Array.isArray(this.payload)
        ? this.payload
        : [this.payload ?? {}];
      const now = new Date().toISOString();
      result = items.map((item) => ({
        id: randomUUID(),
        created_at: now,
        ts: now,
        ...item,
      }));
      this.rows.push(...result);
    } else if (this.op === 'update') {
      for (const row of matches) Object.assign(row, this.payload);
      result = matches;
    } else if (this.op === 'delete') {
      for (const row of matches) {
        const index = this.rows.indexOf(row);
        if (index >= 0) this.rows.splice(index, 1);
      }
      result = matches;
    } else {
      result = [...matches];
      if (this.orderBy.length) {
        result.sort((a, b) => {
          for (const { column, ascending } of this.orderBy) {
            const av = a[column] as string | number | null;
            const bv = b[column] as string | number | null;
            if (av === bv) continue;
            if (av == null) return 1;
            if (bv == null) return -1;
            const cmp =
              typeof av === 'number' && typeof bv === 'number'
                ? av - bv
                : String(av) < String(bv)
                  ? -1
                  : 1;
            return cmp * (ascending ? 1 : -1);
          }
          return 0;
        });
      }
      if (this.limitCount != null) result = result.slice(0, this.limitCount);
    }

    if (this.wantSingle) {
      if (result.length !== 1) {
        return {
          data: null,
          error: { message: `expected a single row, got ${result.length}` },
        };
      }
      return { data: result[0], error: null };
    }
    if (this.wantMaybeSingle) {
      if (result.length > 1) {
        return { data: null, error: { message: 'more than one row returned' } };
      }
      return { data: result[0] ?? null, error: null };
    }
    return { data: result, error: null };
  }
}
