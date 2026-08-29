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
    alerts: [],
    push_tokens: [],
  };

  from(table: string): FakeQuery {
    if (!this.tables[table]) this.tables[table] = [];
    return new FakeQuery(this.tables[table]);
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
  private orderBy: { column: string; ascending: boolean } | null = null;
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
    this.orderBy = { column, ascending: options?.ascending !== false };
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
      if (this.orderBy) {
        const { column, ascending } = this.orderBy;
        result.sort((a, b) => {
          const av = a[column] as string | number | null;
          const bv = b[column] as string | number | null;
          if (av === bv) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          const cmp =
            typeof av === 'number' && typeof bv === 'number'
              ? av - bv
              : String(av) < String(bv)
                ? -1
                : 1;
          return cmp * (ascending ? 1 : -1);
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
