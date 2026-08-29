// One-command demo seed: creates a demo user, one claimed device (+ secret),
// one plant (known species), and backfills ~48h of sensor_readings with a mix
// of in-range and out-of-range values so the app opens fully populated.
//
// Idempotent: safe to re-run (reuses the demo user/device, re-backfills readings).
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//      optional DEMO_EMAIL, DEMO_PASSWORD, DEMO_DEVICE_TOKEN
// Run: npm run seed:demo

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

const DEMO_EMAIL = process.env.DEMO_EMAIL ?? "demo@matpotlib.dev";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "demo-password-123";
const DEMO_DEVICE_TOKEN = process.env.DEMO_DEVICE_TOKEN ?? "demo-device-token";
const DEMO_CLAIM_CODE = "DEMO-1234";

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const round1 = (n: number) => Math.round(n * 10) / 10;
const rand = (min: number, max: number) => min + Math.random() * (max - min);

async function findOrCreateUser(): Promise<string> {
  const { data: created, error } = await sb.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
  });
  if (!error) return created.user.id;
  // Already exists -> look it up
  const { data: list, error: listErr } = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) throw listErr;
  const user = list.users.find((u) => u.email === DEMO_EMAIL);
  if (!user) throw new Error(`Could not create or find demo user: ${error.message}`);
  return user.id;
}

async function main() {
  console.log("[seed] creating demo user…");
  const userId = await findOrCreateUser();

  await sb.from("profiles").upsert({
    user_id: userId,
    display_name: "Demo User",
    experience_level: "beginner",
    goals: ["keep plants alive"],
    plant_types: ["houseplants"],
  });

  console.log("[seed] creating demo device…");
  let { data: device } = await sb.from("devices").select("id").eq("claim_code", DEMO_CLAIM_CODE).maybeSingle();
  if (!device) {
    const { data: inserted, error } = await sb
      .from("devices")
      .insert({
        id: randomUUID(),
        name: "Demo Pot",
        firmware_version: "sim",
        status: "online",
        claim_code: DEMO_CLAIM_CODE,
        owner_user_id: userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    device = inserted;
  } else {
    await sb.from("devices").update({ owner_user_id: userId }).eq("id", device.id);
  }
  const deviceId = device.id as string;
  const secretHash = sha256(DEMO_DEVICE_TOKEN);
  // delete first so upsert can't silently conflict-ignore on a schema mismatch
  await sb.from("device_secrets").delete().eq("device_id", deviceId);
  const { error: secretErr } = await sb
    .from("device_secrets")
    .insert({ device_id: deviceId, secret_hash: secretHash });
  if (secretErr) throw new Error(`device_secrets insert failed: ${secretErr.message}`);
  console.log(`[seed] device_secret written (hash prefix: ${secretHash.slice(0, 8)}…)`);

  console.log("[seed] linking a species + plant…");
  let { data: species } = await sb
    .from("plant_species")
    .select("id")
    .ilike("scientific_name", "epipremnum aureum")
    .maybeSingle();
  if (!species) {
    // plant_species not imported yet — insert one known row so the demo works standalone
    const { data: inserted, error } = await sb
      .from("plant_species")
      .insert({
        common_name: "Golden Pothos",
        scientific_name: "epipremnum aureum",
        care_level: "easy",
        ideal_moisture_min: 15, ideal_moisture_max: 60,
        ideal_lux_min: 1500, ideal_lux_max: 20000,
        ideal_temp_min: 10, ideal_temp_max: 32,
        ideal_humidity_min: 30, ideal_humidity_max: 85,
        source: "seed",
      })
      .select("id")
      .single();
    if (error) throw error;
    species = inserted;
  }

  let { data: plant } = await sb
    .from("user_plants")
    .select("id")
    .eq("owner_user_id", userId)
    .eq("device_id", deviceId)
    .maybeSingle();
  if (!plant) {
    const { data: inserted, error } = await sb
      .from("user_plants")
      .insert({
        owner_user_id: userId,
        device_id: deviceId,
        plant_species_id: species.id,
        nickname: "Demo Pothos",
        notes: "Seeded demo plant",
      })
      .select("id")
      .single();
    if (error) throw error;
    plant = inserted;
  }

  console.log("[seed] backfilling 48h of readings (15-min interval)…");
  await sb.from("sensor_readings").delete().eq("device_id", deviceId); // re-runs stay clean
  const rows = [];
  const now = Date.now();
  for (let i = 48 * 4; i >= 1; i--) {
    const ts = new Date(now - i * 15 * 60 * 1000).toISOString();
    // mostly in range; a dry spell 30h ago and a heat spike 6h ago
    const hoursAgo = i / 4;
    const drySpell = hoursAgo > 28 && hoursAgo < 32;
    const heatSpike = hoursAgo > 5 && hoursAgo < 7;
    rows.push({
      device_id: deviceId,
      ts,
      moisture: round1(drySpell ? rand(2, 8) : rand(30, 55)),
      temp_c: round1(heatSpike ? rand(36, 40) : rand(20, 25)),
      humidity: round1(rand(40, 65)),
      lux: round1(rand(2000, 15000)),
    });
  }
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await sb.from("sensor_readings").insert(rows.slice(i, i + 100));
    if (error) throw error;
  }

  console.log("\n[seed] done. Demo credentials + device (also export these for sim/trigger scripts):");
  console.log(`  DEMO_EMAIL=${DEMO_EMAIL}`);
  console.log(`  DEMO_PASSWORD=${DEMO_PASSWORD}`);
  console.log(`  DEVICE_ID=${deviceId}`);
  console.log(`  DEVICE_TOKEN=${DEMO_DEVICE_TOKEN}`);
  console.log(`  claim_code=${DEMO_CLAIM_CODE}`);
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
