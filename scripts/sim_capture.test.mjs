import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { test } from 'node:test';

const testDeviceId = '11111111-1111-4111-8111-111111111111';
const physicalDeviceId = '22222222-2222-4222-8222-222222222222';
const captureId = '33333333-3333-4333-8333-333333333333';

test('local simulator keeps scheduled and redelivered capture uploads separate', { timeout: 20000 }, async () => {
  const scheduled = [];
  const commanded = [];
  let failureReports = 0;
  let completed = false;
  let finish;
  let fail;
  const finished = new Promise((resolve, reject) => { finish = resolve; fail = reject; });

  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    assert.equal(req.headers['x-device-token'], 'test-token-only');
    assert.equal(body.device_id, testDeviceId);
    res.setHeader('Content-Type', 'application/json');

    if (req.url === '/devices/captures/poll') {
      res.end(JSON.stringify(scheduled.length > 0 && !completed
        ? { capture_request_id: captureId, expires_at: new Date(Date.now() + 30000).toISOString(), remaining_ms: 30000 }
        : { capture_request_id: null, expires_at: null, remaining_ms: null }));
    } else if (req.url === '/sensors/readings') {
      if (body.capture_request_id) {
        commanded.push(body);
        // Force all first-run attempts to fail and the failure report to be
        // lost. The next poll redelivers the same request ID.
        if (commanded.length <= 3) res.writeHead(503).end('{}');
        else {
          completed = true;
          res.writeHead(201).end(JSON.stringify({ ok: true }));
          finish();
        }
      } else {
        scheduled.push(body);
        res.writeHead(201).end(JSON.stringify({ ok: true }));
      }
    } else if (req.url === `/devices/captures/${captureId}/fail`) {
      failureReports += 1;
      res.writeHead(503).end('{}');
    } else {
      res.writeHead(404).end('{}');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  let child;
  let timeoutId;
  try {
    child = spawn(process.execPath, ['--import', 'tsx', 'sim_capture.ts', '--commands'], {
    cwd: import.meta.dirname,
    env: {
      ...process.env,
      API_URL: `http://127.0.0.1:${server.address().port}`,
      DEVICE_ID: physicalDeviceId,
      DEVICE_TOKEN: 'physical-token-placeholder',
      SIM_TEST_DEVICE_ID: testDeviceId,
      SIM_TEST_DEVICE_TOKEN: 'test-token-only',
      SIM_TEST_ONLY: 'isolated-local-test-database',
      DOTENV_CONFIG_PATH: '__no_env_file_for_sim_test__',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.once('error', fail);
    child.once('exit', (code) => { if (!completed) fail(new Error(`simulator exited ${code}: ${output}`)); });

    await Promise.race([finished, new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(`simulator timed out: ${output}`)), 15000);
    })]);
    assert.equal(scheduled.length, 1);
    assert.equal(scheduled[0].capture_request_id, undefined);
    assert.ok(Number.isInteger(scheduled[0].sample_age_ms));
    assert.equal(commanded.length, 4);
    assert.equal(failureReports, 1);
    const metrics = ({ device_id, moisture, temp_c, humidity, lux, capture_request_id }) =>
      ({ device_id, moisture, temp_c, humidity, lux, capture_request_id });
    for (const upload of commanded) assert.deepEqual(metrics(upload), metrics(commanded[0]));
    assert.ok(commanded.every((upload) => Number.isInteger(upload.sample_age_ms)));
    assert.ok(commanded[3].sample_age_ms > commanded[0].sample_age_ms);
  } finally {
    clearTimeout(timeoutId);
    child?.kill();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
