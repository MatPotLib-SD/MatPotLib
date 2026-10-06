import assert from 'node:assert/strict';
import test from 'node:test';

import { CaptureGate } from '../src/tabling/CaptureGate.ts';
import { challengeConditions, comparisonFeedback, displayConditionValue, newerReading, recheckSucceeded, setupIsReady, targetIdentity } from '../src/tabling/model.ts';

const species = {
  ideal_moisture_min: 30, ideal_moisture_max: 60,
  ideal_lux_min: 500, ideal_lux_max: 1000,
};
const reading = (id, captured_at, moisture = 40, lux = 700) => ({
  id, captured_at, ts: captured_at, moisture, lux,
});
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

test('setup requires both valid metrics outside range; recheck needs both inside one capture', () => {
  assert.equal(setupIsReady(reading(1, '2026-09-24T12:00:00Z', 20, 300), species), true);
  assert.equal(setupIsReady(reading(2, '2026-09-24T12:00:00Z', 20, 700), species), false);
  assert.equal(setupIsReady(reading(3, '2026-09-24T12:00:00Z', NaN, 300), species), false);
  assert.equal(recheckSucceeded(reading(4, '2026-09-24T12:00:00Z', 30, 1000), species), true);
  assert.equal(recheckSucceeded(reading(5, '2026-09-24T12:00:00Z', 40, 1000.1), species), false);
  assert.equal(recheckSucceeded(reading(6, '2026-09-24T12:00:00Z', 40, 700), { ...species, ideal_lux_min: null }), false);
  assert.deepEqual(challengeConditions(null, species), { moisture: 'Unknown', lux: 'Unknown' });
});

test('late captured reading cannot replace a newer current reading', () => {
  const current = reading(12, '2026-09-24T12:05:00Z');
  assert.equal(newerReading(reading(13, '2026-09-24T12:04:59Z'), current), false);
  assert.equal(newerReading(reading(13, '2026-09-24T12:05:00Z'), current), true);
});

test('display precision does not contradict a boundary status', () => {
  assert.equal(displayConditionValue(29.96, 30, 60, 1), '29.96');
  assert.equal(displayConditionValue(30, 30, 60, 1), '30.0');
  assert.equal(displayConditionValue(1000.04, 500, 1000, 1), '1000.04');
});

test('activity identity changes with species or challenge targets, not unrelated metadata', () => {
  const plant = { id: 'plant-a', device_id: 'device-a', plant_species_id: 'species-a', nickname: 'Sprout', species: { id: 'species-a', ...species } };
  const original = targetIdentity(plant);
  assert.equal(targetIdentity({ ...plant, nickname: 'New nickname' }), original);
  assert.notEqual(targetIdentity({ ...plant, species: { ...plant.species, ideal_lux_max: 1200 } }), original);
  assert.notEqual(targetIdentity({ ...plant, plant_species_id: 'species-b' }), original);
  assert.notEqual(targetIdentity({ ...plant, device_id: 'device-b' }), original);
});

test('a prior successful Now does not show present success during a pending or failed recheck', () => {
  const successfulNow = reading(9, '2026-09-24T12:00:00Z', 40, 700);
  assert.equal(comparisonFeedback(successfulNow, species, 'completed'), 'success');
  assert.equal(comparisonFeedback(successfulNow, species, 'pending'), 'pending');
  assert.equal(comparisonFeedback(successfulNow, species, 'failed'), 'failed');
});

test('reset during a pending request rejects the late completion', async () => {
  const gate = new CaptureGate();
  const epoch = gate.selectDevice('device-a');
  assert.equal(gate.associate('device-a', epoch, 'capture-a'), true);
  const network = deferred();
  const applied = network.promise.then(() => gate.accepts('device-a', epoch, 'capture-a'));
  gate.reset();
  network.resolve();
  assert.equal(await applied, false);
});

test('device switch during create rejects association; background does not create a second request', async () => {
  const gate = new CaptureGate();
  const epoch = gate.selectDevice('device-a');
  const create = deferred();
  const associated = create.promise.then((id) => gate.associate('device-a', epoch, id));
  gate.selectDevice('device-b');
  create.resolve('capture-a');
  assert.equal(await associated, false);
  const nextEpoch = gate.token();
  assert.equal(gate.associate('device-b', nextEpoch, 'capture-b'), true);
  // Blur/resume does not alter the gate: the same server request is polled.
  assert.equal(gate.accepts('device-b', nextEpoch, 'capture-b'), true);
  assert.equal(gate.associate('device-b', nextEpoch, 'capture-c'), false);
});
