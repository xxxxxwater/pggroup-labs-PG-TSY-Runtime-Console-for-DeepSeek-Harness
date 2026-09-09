export const PLUGIN_ID = '@pgresearch/dsh-pg-tsy-runtime-console'
export const TAB_KIND = 'pg-tsy-runtime'
export const API_PREFIX = '/pg-tsy-runtime-console'
export const SNAPSHOT_ROUTE = `${API_PREFIX}/snapshot`
export const EVENTS_ROUTE = `${API_PREFIX}/events`
export const SNAPSHOT_SCHEMA_VERSION = 'runtime.snapshot.v1'

export const RUNTIME_STATES = Object.freeze([
  'NORMAL',
  'SHADOW',
  'DEGRADED',
  'SAFE_HOLD',
  'HALTED',
  'OFFLINE',
])

export function integer(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : fallback
}

export function isHealthy(value) {
  return String(value ?? '').toUpperCase() === 'HEALTHY'
}

export function gateStatusLabel(status) {
  if (typeof status === 'string') return status.toUpperCase()
  if (status && typeof status === 'object' && Object.hasOwn(status, 'Failed')) {
    return `FAILED · ${String(status.Failed)}`
  }
  return 'UNKNOWN'
}

export function assertRuntimeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('runtime snapshot must be a JSON object')
  }
  if (snapshot.schema_version !== SNAPSHOT_SCHEMA_VERSION) {
    throw new Error(`unsupported runtime snapshot schema: ${snapshot.schema_version ?? 'missing'}`)
  }
  for (const key of ['telemetry', 'runtime', 'safety', 'lease', 'storage', 'reconcile', 'orders']) {
    if (!snapshot[key] || typeof snapshot[key] !== 'object') {
      throw new Error(`runtime snapshot missing object: ${key}`)
    }
  }
  return snapshot
}

export function assertRuntimeEvents(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.events)) {
    throw new Error('runtime events response must contain an events array')
  }
  return payload
}

export function snapshotAgeMs(snapshot, now = Date.now()) {
  const parsed = Date.parse(snapshot?.telemetry?.captured_at ?? snapshot?.captured_at ?? '')
  return Number.isFinite(parsed) ? Math.max(0, now - parsed) : Number.POSITIVE_INFINITY
}

export function startupBlockers(snapshot) {
  if (snapshot?.startup?.ready === true) return []
  const gates = Array.isArray(snapshot?.startup?.gates) ? snapshot.startup.gates : []
  return gates
    .filter(entry => gateStatusLabel(entry?.status) !== 'PASSED')
    .map(entry => `${entry?.gate ?? 'unknown_gate'}=${gateStatusLabel(entry?.status)}`)
}

export function effectiveRuntimeState(snapshot, now = Date.now()) {
  if (!snapshot) return 'OFFLINE'
  const staleAfter = integer(snapshot?.telemetry?.stale_after_ms, 10_000) || 10_000
  if (snapshotAgeMs(snapshot, now) > staleAfter) return 'OFFLINE'

  const declared = String(snapshot?.safety?.state ?? '').toUpperCase()
  if (snapshot?.runtime?.halted === true || declared === 'HALTED') return 'HALTED'

  const unknownOrders = integer(snapshot?.orders?.unknown)
  const mismatchCount = integer(snapshot?.reconcile?.mismatch_count)
  const leaseOwned = snapshot?.lease?.required === false || snapshot?.lease?.owned === true
  const allowNewExposure = snapshot?.safety?.allow_new_exposure === true
  const startupReady = snapshot?.startup === undefined || snapshot.startup?.ready === true
  if (
    declared === 'SAFE_HOLD'
    || unknownOrders > 0
    || mismatchCount > 0
    || !leaseOwned
    || !allowNewExposure
    || !startupReady
  ) return 'SAFE_HOLD'

  if (String(snapshot?.runtime?.mode ?? '').toLowerCase() === 'shadow' || declared === 'SHADOW') {
    return 'SHADOW'
  }

  const enabledVenues = Array.isArray(snapshot?.venues)
    ? snapshot.venues.filter(venue => venue?.enabled !== false)
    : []
  const venueDegraded = enabledVenues.some(venue =>
    !isHealthy(venue?.market_data) || !isHealthy(venue?.execution) || !isHealthy(venue?.reconcile))
  const feedDegraded = Array.isArray(snapshot?.feeds)
    && snapshot.feeds.some(feed => feed?.required !== false && !isHealthy(feed?.status))

  if (declared === 'DEGRADED' || venueDegraded || feedDegraded) return 'DEGRADED'
  return 'NORMAL'
}

export function makeDiagnosisPrompt(snapshot) {
  const state = effectiveRuntimeState(snapshot)
  const affected = snapshot?.safety?.affected_scope
  const scope = affected
    ? `${affected.venue ?? 'unknown venue'} / ${affected.asset ?? 'unknown asset'}`
    : 'global runtime'
  const reason = snapshot?.safety?.reason ?? 'No explicit reason reported.'
  const blockers = startupBlockers(snapshot)
  return [
    'Inspect the PG TSY runtime using read-only diagnostics only.',
    `Current console state: ${state}.`,
    `Affected scope: ${scope}.`,
    `Safety reason: ${reason}`,
    `Startup ready: ${snapshot?.startup?.ready === true ? 'yes' : 'no/unknown'}.`,
    `Startup blockers: ${blockers.length ? blockers.join(', ') : 'none reported'}.`,
    `Journal: ${snapshot?.storage?.journal ?? 'UNKNOWN'}.`,
    `Reconcile: ${snapshot?.reconcile?.status ?? 'UNKNOWN'}.`,
    `Unknown orders: ${integer(snapshot?.orders?.unknown)}.`,
    `Reconcile mismatches: ${integer(snapshot?.reconcile?.mismatch_count)}.`,
    `Lease owned: ${snapshot?.lease?.owned === true ? 'yes' : 'no/unknown'}.`,
    'Trace market-data freshness -> signal -> strategy -> risk -> OMS -> execution -> journal -> reconcile.',
    'Treat PENDING/UNKNOWN as missing evidence, not as proof of failure or success.',
    'Do not submit, cancel, flatten, restart, reload, or otherwise mutate production state.',
    'Explain the most likely fault boundary and the next safest verification step.',
  ].join('\n')
}
