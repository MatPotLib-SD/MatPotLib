const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const reading = (id, capture = null, seconds = id) => ({
  id, device_id: 'device-a', moisture: 20, lux: 100, temp_c: 90, humidity: 1,
  ts: new Date(1_800_000_000_000 + seconds * 1000).toISOString(),
  captured_at: new Date(1_800_000_000_000 + seconds * 1000).toISOString(),
  time_source: 'estimated', capture_request_id: capture,
});
const request = (id, state = 'pending', result = null) => ({
  id, device_id: 'device-a', state, reading: result,
  created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 30_000).toISOString(),
  result_reading_id: result?.id ?? null, failure_reason: null,
});

/** Mount the production hook with only its I/O and timer boundaries replaced. */
async function harness(t, overrides = {}) {
  let state;
  let creates = 0;
  const calls = [];
  const intervals = new Map();
  let timerId = 0;
  const listeners = new Set();
  const appState = {
    currentState: 'active',
    addEventListener: (_event, fn) => { listeners.add(fn); return { remove: () => listeners.delete(fn) }; },
  };
  const api = {
    getLatestReading: async () => null,
    getActiveCapture: async () => null,
    cancelPendingCapture: async (_device, key) => { calls.push(['cancel-key', key]); return request(`cancelled-${key}`, 'cancelled'); },
    cancelCapture: async (_device, id) => { calls.push(['cancel', id]); return request(id, 'cancelled'); },
    createCapture: async (_device, key) => { calls.push(['create', key]); return request(`capture-${++creates}`); },
    getCapture: async (_device, id) => request(id, 'completed', reading(creates, id)),
    ...overrides,
  };
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    const localRequire = (name) => {
      if (name === 'react') return React;
      if (name === 'react-native') return { AppState: appState };
      if (name === '@react-navigation/native') return { useFocusEffect: (fn) => React.useEffect(fn, [fn]) };
      if (name.endsWith('/api/client')) return api;
      if (name.startsWith('.')) return load(path.resolve(path.dirname(file), `${name}.ts`));
      return require(name);
    };
    vm.runInNewContext(compiled, {
      module, exports: module.exports, require: localRequire, console, Date, Math, Error,
      setTimeout, clearTimeout,
      setInterval: (fn, ms) => { const id = ++timerId; intervals.set(id, { fn, ms }); return id; },
      clearInterval: (id) => intervals.delete(id),
    }, { filename: file });
    return module.exports;
  }
  const { useTablingActivity } = load(path.resolve(__dirname, '../src/hooks/useTablingActivity.ts'));
  function Component({ device = 'device-a', plant = 'plant-a', targets = 'species-a:30:60:500:1000' }) {
    state = useTablingActivity(device, plant, targets);
    return null;
  }
  let renderer;
  await act(async () => { renderer = create(React.createElement(Component)); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  return {
    get state() { return state; }, api, calls, intervals,
    async capture(purpose) { await act(async () => { await state.capture(purpose); }); },
    async start() { await act(async () => state.startGroup()); },
    async reset() { await act(async () => state.reset()); },
    async tick(ms) { await act(async () => { for (const timer of [...intervals.values()]) if (timer.ms === ms) timer.fn(); }); },
    async background(value) { await act(async () => { appState.currentState = value; for (const fn of listeners) fn(value); }); },
    async switchDevice(device) { await act(async () => renderer.update(React.createElement(Component, { device }))); },
    async changeTargets(targets) { await act(async () => renderer.update(React.createElement(Component, { targets }))); },
  };
}

test('mounted hook inspects and cancels obsolete work without creating a capture', async (t) => {
  let active = request('previous-session');
  const h = await harness(t, {
    getActiveCapture: async () => active,
    cancelCapture: async () => { active = null; return request('previous-session', 'cancelled'); },
  });
  assert.equal(h.state.recovering, false);
  assert.equal(h.calls.filter(([kind]) => kind === 'create').length, 0);
  assert.equal(h.state.before, null);
  assert.equal(h.state.verifiedReading, null);
});

test('mounted hook keeps preparation, fixed Before, rechecks and newer scheduled Current separate', async (t) => {
  const h = await harness(t);
  await h.capture('verify');
  assert.equal(h.state.verifiedReading.id, 1);
  assert.equal(h.state.before, null);
  await h.start();
  await h.capture('before');
  assert.equal(h.state.before.id, 2);
  assert.equal(h.state.now, null);
  h.api.getLatestReading = async () => reading(50, null, 50);
  await h.tick(5000);
  await h.capture('now');
  assert.equal(h.state.current.id, 50);
  assert.equal(h.state.before.id, 2);
  assert.equal(h.state.now.id, 3);
  await h.capture('now');
  assert.equal(h.state.before.id, 2);
  assert.equal(h.state.now.id, 4);
});

test('mounted hook rejects completion arriving after reset', async (t) => {
  const response = deferred();
  const h = await harness(t, { getCapture: () => response.promise });
  await h.capture('verify');
  await h.reset();
  await act(async () => response.resolve(request('capture-1', 'completed', reading(1, 'capture-1'))));
  assert.equal(h.state.phase, 'preparation');
  assert.equal(h.state.verifiedReading, null);
  assert.equal(h.state.before, null);
  assert.equal(h.state.now, null);
});

test('mounted hook reset durably cancels an in-flight creation and discards its late result', async (t) => {
  const response = deferred();
  const h = await harness(t, { createCapture: () => response.promise });
  let creating;
  let resetting;
  await act(async () => { creating = h.state.capture('verify'); });
  await act(async () => { resetting = h.state.reset(); });
  assert.ok(h.calls.some(([kind]) => kind === 'cancel-key'));
  assert.equal(h.state.recovering, false);
  await act(async () => { response.resolve(request('late-create')); await Promise.all([creating, resetting]); });
  assert.ok(h.calls.some(([kind, id]) => kind === 'cancel' && id === 'late-create'));
  assert.equal(h.state.request, null);
  assert.equal(h.state.verifiedReading, null);
});

test('mounted hook pauses timers in background and resumes the same pending request', async (t) => {
  const h = await harness(t, { getCapture: async (_device, id) => request(id, 'measuring') });
  await h.capture('verify');
  const id = h.state.request.id;
  await h.background('background');
  assert.equal(h.intervals.size, 0);
  h.api.getCapture = async (_device, captureId) => request(captureId, 'completed', reading(1, captureId));
  await h.background('active');
  assert.equal(h.state.verifiedReading.capture_request_id, id);
  assert.equal(h.calls.filter(([kind]) => kind === 'create').length, 1);
});

test('mounted hook ignores an old latest response after switching device', async (t) => {
  const oldLatest = deferred();
  const h = await harness(t, { getLatestReading: (device) => device === 'device-a' ? oldLatest.promise : Promise.resolve(reading(80)) });
  await h.switchDevice('device-b');
  await act(async () => oldLatest.resolve(reading(100)));
  assert.equal(h.state.current.id, 80);
  assert.equal(h.state.phase, 'preparation');
});

test('mounted hook two immediate taps create one logical request', async (t) => {
  const response = deferred();
  let submissions = 0;
  const h = await harness(t, { createCapture: () => { submissions += 1; return response.promise; } });
  let first;
  await act(async () => { first = h.state.capture('verify'); void h.state.capture('verify'); });
  assert.equal(submissions, 1);
  assert.equal(h.state.creating, true);
  await act(async () => { response.resolve(request('double-tap')); await first; });
});

test('failed setup verification cannot reuse a previous successful verification', async (t) => {
  const h = await harness(t);
  await h.capture('verify');
  assert.ok(h.state.verifiedReading);
  h.api.getCapture = async (_device, id) => ({ ...request(id, 'failed'), failure_reason: 'Sensor disconnected' });
  await h.capture('verify');
  assert.equal(h.state.verifiedReading, null);
  await h.start();
  assert.equal(h.state.phase, 'preparation');
});

test('changing target identity discards the old group and requires fresh preparation', async (t) => {
  const h = await harness(t);
  await h.capture('verify');
  await h.start();
  await h.capture('before');
  await h.capture('now');
  await h.changeTargets('species-b:40:70:1000:2000');
  assert.equal(h.state.phase, 'preparation');
  assert.equal(h.state.before, null);
  assert.equal(h.state.now, null);
  assert.equal(h.state.verifiedReading, null);
});

test('indeterminate POST is durably cancelled by its key before recovery unlocks', async (t) => {
  let submittedKey;
  const cancelledKeys = new Set();
  const h = await harness(t, {
    createCapture: async (_device, key) => { submittedKey = key; throw new Error('Response lost before commit'); },
    cancelPendingCapture: async (_device, key) => {
      cancelledKeys.add(key);
      return request('tombstone', 'cancelled');
    },
  });
  await h.capture('verify');
  assert.ok(submittedKey);
  assert.ok(cancelledKeys.has(submittedKey), 'server must have cancellation intent even if active lookup is null');
  assert.equal(h.state.recovering, false);
  assert.equal(h.state.request, null);
  assert.equal(h.state.verifiedReading, null);
});

test('lost create response is retried with the original idempotency key', async (t) => {
  const keys = [];
  const h = await harness(t, {
    createCapture: async (_device, key) => {
      keys.push(key);
      if (keys.length === 1) throw Object.assign(new Error('Network timeout'), { status: 0 });
      return request('one-logical-request');
    },
  });
  await h.capture('verify');
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
  assert.equal(h.state.verifiedReading.capture_request_id, 'one-logical-request');
});

test('failed durable cancellation blocks a new attempt until recovery succeeds', async (t) => {
  let submissions = 0;
  const h = await harness(t, {
    createCapture: async () => { submissions += 1; throw new Error('Uncertain create'); },
    cancelPendingCapture: async () => { throw new Error('Cancellation unavailable'); },
  });
  await h.capture('verify');
  assert.match(h.state.recoveryError, /Cancellation unavailable/);
  await h.capture('verify');
  assert.equal(submissions, 1);
});

test('a new pending or failed recheck retains the snapshot but marks it as a previous attempt', async (t) => {
  const h = await harness(t);
  await h.capture('verify');
  await h.start();
  await h.capture('before');
  await h.capture('now');
  const previous = h.state.now;
  assert.equal(h.state.recheckState, 'completed');
  const response = deferred();
  h.api.getCapture = () => response.promise;
  await h.capture('now');
  assert.equal(h.state.recheckState, 'pending');
  assert.equal(h.state.now, previous);
  await act(async () => response.resolve(request('capture-4', 'failed')));
  assert.equal(h.state.recheckState, 'failed');
  assert.equal(h.state.now, previous);
});

test('loss of ownership of the previous device does not block setup on a new owned device', async (t) => {
  const h = await harness(t, {
    getCapture: async (_device, id) => request(id, 'measuring'),
    cancelPendingCapture: async (device, key) => {
      if (device === 'device-a') throw Object.assign(new Error('Device not found'), { status: 404 });
      return request(`cancelled-${key}`, 'cancelled');
    },
  });
  await h.capture('verify');
  await h.switchDevice('device-b');
  assert.equal(h.state.recoveryError, null);
  assert.equal(h.state.recovering, false);
  assert.equal(h.state.phase, 'preparation');
});

test('current-device cancellation 404 remains a setup error', async (t) => {
  const h = await harness(t, {
    createCapture: async () => { throw new Error('Uncertain create'); },
    cancelPendingCapture: async () => { throw Object.assign(new Error('Capture capability unavailable'), { status: 404 }); },
  });
  await h.capture('verify');
  assert.match(h.state.recoveryError, /capability unavailable/);
});

test('departed-device server errors still block recovery until cancellation is confirmed', async (t) => {
  const h = await harness(t, {
    getCapture: async (_device, id) => request(id, 'measuring'),
    cancelPendingCapture: async () => { throw Object.assign(new Error('Server unavailable'), { status: 503 }); },
  });
  await h.capture('verify');
  await h.switchDevice('device-b');
  assert.match(h.state.recoveryError, /Server unavailable/);
});
