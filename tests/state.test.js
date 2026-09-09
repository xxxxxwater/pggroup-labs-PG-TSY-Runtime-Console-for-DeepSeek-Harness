import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assertRuntimeEvents,
  assertRuntimeSnapshot,
  effectiveRuntimeState,
  gateStatusLabel,
  makeDiagnosisPrompt,
  startupBlockers,
} from '../src/shared.js'
import { mockSnapshot } from '../src/host/mock.js'

test('healthy live mock resolves NORMAL', () => {
  assert.equal(effectiveRuntimeState(mockSnapshot('normal')), 'NORMAL')
})

test('shadow mock resolves SHADOW', () => {
  assert.equal(effectiveRuntimeState(mockSnapshot('shadow')), 'SHADOW')
})

test('unknown order forces SAFE_HOLD even if declared normal', () => {
  const snapshot = mockSnapshot('normal')
  snapshot.orders.unknown = 1
  assert.equal(effectiveRuntimeState(snapshot), 'SAFE_HOLD')
})

test('lost lease forces SAFE_HOLD', () => {
  assert.equal(effectiveRuntimeState(mockSnapshot('lease_lost')), 'SAFE_HOLD')
})

test('unfinished Rust startup gates force SAFE_HOLD', () => {
  const snapshot = mockSnapshot('normal')
  snapshot.startup = {
    ready: false,
    gates: [
      { gate: 'JournalWritable', status: 'Pending' },
      { gate: 'StrategyAllowlistLoaded', status: 'Passed' },
    ],
  }
  assert.equal(effectiveRuntimeState(snapshot), 'SAFE_HOLD')
  assert.deepEqual(startupBlockers(snapshot), ['JournalWritable=PENDING'])
})

test('Rust externally-tagged Failed gate is rendered faithfully', () => {
  assert.equal(gateStatusLabel({ Failed: 'database unavailable' }), 'FAILED · database unavailable')
})

test('stale telemetry means OFFLINE, never STOPPED', () => {
  const snapshot = mockSnapshot('normal')
  snapshot.telemetry.captured_at = new Date(Date.now() - 60_000).toISOString()
  snapshot.telemetry.stale_after_ms = 5_000
  assert.equal(effectiveRuntimeState(snapshot), 'OFFLINE')
})

test('runtime snapshot schema is strict', () => {
  assert.equal(assertRuntimeSnapshot(mockSnapshot('normal')).schema_version, 'runtime.snapshot.v1')
  const snapshot = mockSnapshot('normal')
  snapshot.schema_version = 'runtime.snapshot.v2'
  assert.throws(() => assertRuntimeSnapshot(snapshot), /unsupported runtime snapshot schema/)
})

test('runtime events envelope is strict', () => {
  assert.deepEqual(assertRuntimeEvents({ events: [] }), { events: [] })
  assert.throws(() => assertRuntimeEvents({ rows: [] }), /events array/)
})

test('diagnosis prompt is explicitly read-only and reports evidence gaps', () => {
  const snapshot = mockSnapshot('safe_hold')
  snapshot.startup = {
    ready: false,
    gates: [{ gate: 'RuntimeLeaseAcquired', status: 'Pending' }],
  }
  const prompt = makeDiagnosisPrompt(snapshot)
  assert.match(prompt, /read-only diagnostics only/i)
  assert.match(prompt, /Do not submit, cancel, flatten, restart, reload/i)
  assert.match(prompt, /Unknown orders: 1/)
  assert.match(prompt, /RuntimeLeaseAcquired=PENDING/)
})
