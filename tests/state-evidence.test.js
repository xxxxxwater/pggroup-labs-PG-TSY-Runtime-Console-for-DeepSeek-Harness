import test from 'node:test'
import assert from 'node:assert/strict'
import { effectiveRuntimeState, snapshotClockLeadMs } from '../src/shared.js'
import { mockSnapshot } from '../src/host/mock.js'

test('missing or unrecognized declared safety state is missing evidence, not NORMAL', () => {
  for (const value of [undefined, null, '', 'OFFLINE', 'STOPPED', 'ok']) {
    const snapshot = mockSnapshot('normal')
    snapshot.safety.state = value
    assert.equal(effectiveRuntimeState(snapshot), 'SAFE_HOLD', `safety.state=${String(value)}`)
  }
})

test('declared backend states keep their meaning regardless of case', () => {
  const snapshot = mockSnapshot('normal')
  snapshot.safety.state = 'normal'
  assert.equal(effectiveRuntimeState(snapshot), 'NORMAL')
  snapshot.safety.state = 'degraded'
  assert.equal(effectiveRuntimeState(snapshot), 'DEGRADED')
})

test('unhealthy journal or reconcile status is never NORMAL', () => {
  for (const [section, key] of [['storage', 'journal'], ['reconcile', 'status']]) {
    for (const value of ['FAILED', 'UNKNOWN', 'PENDING', undefined]) {
      const snapshot = mockSnapshot('normal')
      snapshot[section][key] = value
      assert.equal(effectiveRuntimeState(snapshot), 'DEGRADED', `${section}.${key}=${String(value)}`)
    }
  }
})

test('capture time beyond the staleness window in the future is OFFLINE', () => {
  const now = Date.parse('2026-10-29T12:00:00.000Z')
  const snapshot = mockSnapshot('normal')
  snapshot.telemetry.stale_after_ms = 10_000
  snapshot.telemetry.captured_at = new Date(now + 60 * 60_000).toISOString()
  assert.equal(snapshotClockLeadMs(snapshot, now), 60 * 60_000)
  assert.equal(effectiveRuntimeState(snapshot, now), 'OFFLINE')
})

test('small clock lead within the staleness window is tolerated', () => {
  const now = Date.parse('2026-10-29T12:00:00.000Z')
  const snapshot = mockSnapshot('normal')
  snapshot.telemetry.stale_after_ms = 10_000
  snapshot.telemetry.captured_at = new Date(now + 2_000).toISOString()
  assert.equal(effectiveRuntimeState(snapshot, now), 'NORMAL')
})
