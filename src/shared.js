export const PLUGIN_ID = '@pgresearch/dsh-pg-tsy-runtime-console'
export const TAB_KIND = 'pg-tsy-runtime'
export const API_PREFIX = '/pg-tsy-runtime-console'
export const SNAPSHOT_ROUTE = `${API_PREFIX}/snapshot`
export const EVENTS_ROUTE = `${API_PREFIX}/events`

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

export function snapshotAgeMs(snapshot, now = Date.now()) {
  const parsed = Date.parse(snapshot?.telemetry?.captured_at ?? snapshot?.captured_at ?? '')
  return Number.isFinite(parsed) ? Math.max(0, now - parsed) : Number.POSITIVE_INFINITY
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
  if (
    declared === 'SAFE_HOLD'
    || unknownOrders > 0
    || mismatchCount > 0
    || !leaseOwned
    || !allowNewExposure
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
  return [
    'Inspect the PG TSY runtime using read-only diagnostics only.',
    `Current console state: ${state}.`,
    `Affected scope: ${scope}.`,
    `Safety reason: ${reason}`,
    `Unknown orders: ${integer(snapshot?.orders?.unknown)}.`,
    `Reconcile mismatches: ${integer(snapshot?.reconcile?.mismatch_count)}.`,
    `Lease owned: ${snapshot?.lease?.owned === true ? 'yes' : 'no/unknown'}.`,
    'Trace market-data freshness -> signal -> strategy -> risk -> OMS -> execution -> journal -> reconcile.',
    'Do not submit, cancel, flatten, restart, reload, or otherwise mutate production state.',
    'Explain the most likely fault boundary and the next safest verification step.',
  ].join('\n')
}
