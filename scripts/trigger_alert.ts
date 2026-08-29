// Posts ONE clearly out-of-range reading (bone-dry soil) to verify the
// alert + push path on demand.
//
// Env: API_URL, DEVICE_ID, DEVICE_TOKEN (see scripts/.env.example)
// Run: npm run trigger:alert

import "dotenv/config";

const API_URL = process.env.API_URL ?? "http://localhost:3000";
const DEVICE_ID = process.env.DEVICE_ID ?? "";
const DEVICE_TOKEN = process.env.DEVICE_TOKEN ?? "";

if (!DEVICE_ID || !DEVICE_TOKEN) {
  console.error("DEVICE_ID and DEVICE_TOKEN env vars are required (run seed_demo first — it prints them).");
  process.exit(1);
}

const body = {
  device_id: DEVICE_ID,
  moisture: 1.0, // far below any species minimum -> high-severity alert
  temp_c: 22.0,
  humidity: 50.0,
  lux: 8000.0,
};

fetch(`${API_URL}/sensors/readings`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-device-token": DEVICE_TOKEN },
  body: JSON.stringify(body),
})
  .then(async (res) => {
    console.log(`POST ${res.status}`, await res.text());
    console.log("Check GET /alerts (or the app's Alerts tab) — a moisture_low alert should exist.");
    console.log("Note: a repeat run within 2h is suppressed by the alert cooldown by design.");
  })
  .catch((err) => {
    console.error("POST failed:", err.message);
    process.exit(1);
  });
