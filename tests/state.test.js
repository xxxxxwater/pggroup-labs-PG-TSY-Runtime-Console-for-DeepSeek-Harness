import test from 'node:test'
import assert from 'node:assert/strict'
import { effectiveRuntimeState, makeDiagnosisPrompt } from '../src/shared.js'
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

test('stale telemetry means OFFLINE, never STOPPED', () => {
  const snapshot = mockSnapshot('normal')
  snapshot.telemetry.captured_at = new Date(Date.now() - 60_000).toISOString()
  snapshot.telemetry.stale_after_ms = 5_000
  assert.equal(effectiveRuntimeState(snapshot), 'OFFLINE')
})

test('diagnosis prompt is explicitly read-only', () => {
  const prompt = makeDiagnosisPrompt(mockSnapshot('safe_hold'))
  assert.match(prompt, /read-only diagnostics only/i)
  assert.match(prompt, /Do not submit, cancel, flatten, restart, reload/i)
  assert.match(prompt, /Unknown orders: 1/)
})
