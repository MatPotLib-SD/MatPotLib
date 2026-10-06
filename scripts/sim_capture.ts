// Local test simulator. Requires a separately provisioned TEST device and a
// loopback backend connected to an isolated test database. Never point this
// process at the physical event device or a cloud API.
import "dotenv/config";

const apiUrl = process.env.API_URL ?? "http://localhost:3000";
const deviceId = process.env.SIM_TEST_DEVICE_ID ?? "";
const token = process.env.SIM_TEST_DEVICE_TOKEN ?? "";
const commands = process.argv.includes("--commands");
const intervalMs = Number(process.env.SIM_INTERVAL_MS ?? 10_000);
const parsedUrl = new URL(apiUrl);

if (!["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname)) {
  throw new Error("Simulator API_URL must be loopback; use an isolated local test backend.");
}
if (process.env.SIM_TEST_ONLY !== "isolated-local-test-database") {
  throw new Error("Set SIM_TEST_ONLY=isolated-local-test-database after verifying the local backend's database target.");
}
if (!deviceId || !token || deviceId === process.env.DEVICE_ID || token === process.env.DEVICE_TOKEN) {
  throw new Error("Set distinct SIM_TEST_DEVICE_ID and SIM_TEST_DEVICE_TOKEN for a separate test device.");
}
if (!Number.isFinite(intervalMs) || intervalMs < 2000) {
  throw new Error("SIM_INTERVAL_MS must be at least 2000.");
}

type Reading = {
  device_id: string;
  moisture: number;
  temp_c: number;
  humidity: number;
  lux: number;
};

const headers = { "Content-Type": "application/json", "x-device-token": token };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const round1 = (n: number) => Math.round(n * 10) / 10;
const bufferedCaptures = new Map<string, { reading: Reading; acquiredAt: number }>();

function makeReading(): Reading {
  const reading = {
    device_id: deviceId,
    moisture: round1(rand(35, 60)),
    temp_c: round1(rand(19, 26)),
    humidity: round1(rand(40, 65)),
    lux: round1(rand(4000, 15000)),
  };
  if (Math.random() < 0.3) {
    const metric = ["moisture", "temp_c", "humidity", "lux"][Math.floor(Math.random() * 4)];
    if (metric === "moisture") reading.moisture = round1(rand(0, 8));
    if (metric === "temp_c") reading.temp_c = round1(rand(38, 45));
    if (metric === "humidity") reading.humidity = round1(rand(2, 12));
    if (metric === "lux") reading.lux = round1(rand(0, 300));
  }
  return reading;
}

async function post(path: string, body: object): Promise<Response> {
  return fetch(`${apiUrl}${path}`, {
    method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(8000),
  });
}

async function upload(reading: Reading, acquiredAt: number, captureId?: string): Promise<boolean> {
  const body = {
    ...reading,
    sample_age_ms: Math.max(0, Math.round(performance.now() - acquiredAt)),
    ...(captureId ? { capture_request_id: captureId } : {}),
  };
  const response = await post("/sensors/readings", body);
  console.log(`[sim] ${captureId ? `capture ${captureId}` : "scheduled"} upload ${response.status}`);
  if (response.ok) return true;
  if ([400, 401, 403, 404, 409, 410].includes(response.status)) {
    throw new Error(`Terminal upload rejection: ${response.status} ${await response.text()}`);
  }
  return false;
}

async function runCapture(captureId: string, remainingMs: number): Promise<void> {
  const deadline = performance.now() + remainingMs;
  // Redelivery reuses the same values after an ambiguous upload response.
  let buffered = bufferedCaptures.get(captureId);
  if (!buffered) {
    buffered = { reading: makeReading(), acquiredAt: performance.now() };
    bufferedCaptures.set(captureId, buffered);
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      if (await upload(buffered.reading, buffered.acquiredAt, captureId)) {
        bufferedCaptures.delete(captureId);
        return;
      }
    } catch (error) {
      console.error(`[sim] capture attempt ${attempt}:`, error);
      if (String(error).includes("Terminal upload rejection")) {
        bufferedCaptures.delete(captureId);
        return;
      }
    }
    if (performance.now() + 2000 >= deadline) break;
    await sleep(2000);
  }
  try {
    const response = await post(`/devices/captures/${captureId}/fail`, {
      device_id: deviceId, reason: "simulated_upload_failed",
    });
    console.error(`[sim] capture failed; report ${response.status}`);
    if (response.ok || [400, 403, 404, 409, 410].includes(response.status)) bufferedCaptures.delete(captureId);
  } catch (error) {
    console.error("[sim] failure report unavailable:", error);
  }
}

async function run(): Promise<void> {
  console.log(`[sim] ${commands ? "command-aware" : "scheduled"} local test simulator for ${deviceId}`);
  let nextScheduled = 0;
  while (true) {
    try {
      if (commands) {
        const response = await post("/devices/captures/poll", { device_id: deviceId });
        if (!response.ok) throw new Error(`Poll ${response.status}: ${await response.text()}`);
        const work = await response.json() as { capture_request_id: string | null; remaining_ms: number | null };
        if (work.capture_request_id && work.remaining_ms && work.remaining_ms > 0) {
          await runCapture(work.capture_request_id, work.remaining_ms);
          continue;
        }
        // The backend has made any old request terminal or ineligible.
        bufferedCaptures.clear();
      }
      if (performance.now() >= nextScheduled) {
        const reading = makeReading();
        await upload(reading, performance.now());
        nextScheduled = performance.now() + intervalMs;
      }
    } catch (error) {
      console.error("[sim]", error);
    }
    await sleep(commands ? 2000 : Math.min(intervalMs, 10_000));
  }
}

void run();
