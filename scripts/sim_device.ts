// Simulated pot: POSTs a fake reading to the backend every 10 seconds.
// Values are randomized across in-range and out-of-range to exercise alerts.
//
// Env: API_URL, DEVICE_ID, DEVICE_TOKEN (see scripts/.env.example)
// Run: npm run sim   (from scripts/, or backend/ via alias)

import "dotenv/config";

const API_URL = process.env.API_URL ?? "http://localhost:3000";
const DEVICE_ID = process.env.DEVICE_ID ?? "";
const DEVICE_TOKEN = process.env.DEVICE_TOKEN ?? "";
const INTERVAL_MS = Number(process.env.SIM_INTERVAL_MS ?? 10_000);

if (!DEVICE_ID || !DEVICE_TOKEN) {
  console.error("DEVICE_ID and DEVICE_TOKEN env vars are required (run seed_demo first — it prints them).");
  process.exit(1);
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const round1 = (n: number) => Math.round(n * 10) / 10;

// ~70% in a comfortable range, ~30% clearly out of range (one metric at a time)
function makeReading() {
  const reading = {
    device_id: DEVICE_ID,
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

async function post() {
  const body = makeReading();
  try {
    const res = await fetch(`${API_URL}/sensors/readings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-device-token": DEVICE_TOKEN },
      body: JSON.stringify(body),
    });
    console.log(`[sim] POST ${res.status}`, body);
  } catch (err) {
    console.error("[sim] POST failed:", (err as Error).message);
  }
}

console.log(`[sim] posting to ${API_URL}/sensors/readings every ${INTERVAL_MS / 1000}s — Ctrl+C to stop`);
post();
setInterval(post, INTERVAL_MS);
