import { effectiveRuntimeState } from '../shared.js'

const base = () => ({
  schema_version: 'runtime.snapshot.v1',
  telemetry: { captured_at: new Date().toISOString(), stale_after_ms: 10_000, source: 'mock' },
  runtime: { environment: 'development', instance_id: 'pg-live-01', mode: 'live', version: 'mock-v1', uptime_sec: 63_842, halted: false },
  safety: { state: 'NORMAL', allow_new_exposure: true, reason: null, affected_scope: null },
  lease: { required: true, owned: true, owner: 'pg-live-01', fencing_token: 1842, heartbeat_age_ms: 420 },
  storage: { journal: 'HEALTHY', checkpoint_seq: 83_120, journal_tail_seq: 83_147, pending_dispatch: 0 },
  reconcile: { status: 'HEALTHY', last_success_age_ms: 1_240, mismatch_count: 0, ownership_unknown_count: 0 },
  feeds: [
    { venue: 'hyperliquid', feed: 'BBO', asset: 'SOLUSDT', status: 'HEALTHY', age_ms: 23, required: true },
    { venue: 'hyperliquid', feed: 'L2', asset: 'SOLUSDT', status: 'HEALTHY', age_ms: 31, required: true },
    { venue: 'ibkr', feed: 'TICK', asset: 'AAPL', status: 'HEALTHY', age_ms: 82, required: false }
  ],
  venues: [
    { id: 'hyperliquid', enabled: true, market_data: 'HEALTHY', execution: 'HEALTHY', reconcile: 'HEALTHY', latency_ms: { market: 23, order_p50: 42, order_p99: 131 } },
    { id: 'ibkr', enabled: true, market_data: 'HEALTHY', execution: 'HEALTHY', reconcile: 'HEALTHY', latency_ms: { market: 82, order_p50: 71, order_p99: 204 } },
    { id: 'binance-pm', enabled: false, market_data: 'DISABLED', execution: 'DISABLED', reconcile: 'DISABLED' }
  ],
  strategies: [
    { id: 'sol-vwap-momentum-v4', status: 'RUNNING', asset: 'SOLUSDT', position: 'LONG', quantity: 42, signal: { side: 'LONG', confidence: 0.82, age_ms: 340, ttl_ms: 5_000 } }
  ],
  positions: [
    { venue: 'hyperliquid', asset: 'SOLUSDT', side: 'LONG', quantity: 42, notional_usd: 6_132, ownership: 'STRATEGY', strategy_id: 'sol-vwap-momentum-v4' }
  ],
  orders: {
    open: 2,
    partial: 1,
    filled_recent: 8,
    unknown: 0,
    recent: [
      { id: '019b-sol-001', venue: 'hyperliquid', asset: 'SOLUSDT', side: 'BUY', status: 'PARTIAL', filled: 20, quantity: 42, client_identity: 'cloid:019b-sol-001' }
    ]
  },
  performance: { pnl_today_usd: 1284.12, gross_exposure_usd: 31_200 },
  capabilities: { status: true, logs: true, latency: true, performance: true, start: false, reload_script: false, emergency_exit: false }
})

export function mockSnapshot(scenario = 'normal') {
  const snapshot = base()
  switch (scenario) {
    case 'shadow':
      snapshot.runtime.mode = 'shadow'
      snapshot.safety.state = 'SHADOW'
      break
    case 'degraded':
      snapshot.safety.state = 'DEGRADED'
      snapshot.venues[1].market_data = 'DEGRADED'
      snapshot.feeds[2].status = 'STALE'
      break
    case 'safe_hold':
      snapshot.safety.state = 'SAFE_HOLD'
      snapshot.safety.allow_new_exposure = false
      snapshot.safety.reason = 'Ambiguous external order outcome; venue truth not proven.'
      snapshot.safety.affected_scope = { venue: 'hyperliquid', asset: 'SOLUSDT' }
      snapshot.orders.unknown = 1
      snapshot.orders.recent.unshift({ id: '019b-unknown-007', venue: 'hyperliquid', asset: 'SOLUSDT', side: 'BUY', status: 'UNKNOWN', filled: null, quantity: 15, client_identity: 'cloid:019b-unknown-007' })
      break
    case 'lease_lost':
      snapshot.safety.state = 'SAFE_HOLD'
      snapshot.safety.allow_new_exposure = false
      snapshot.safety.reason = 'Runtime lease is not owned; fencing authority unavailable.'
      snapshot.lease.owned = false
      snapshot.lease.owner = 'pg-live-02'
      break
    case 'halted':
      snapshot.runtime.halted = true
      snapshot.safety.state = 'HALTED'
      snapshot.safety.allow_new_exposure = false
      snapshot.safety.reason = 'Operator halt.'
      break
    default:
      break
  }
  snapshot.safety.effective_state = effectiveRuntimeState(snapshot)
  return snapshot
}

export function mockEvents(scenario = 'normal') {
  const now = Date.now()
  const normal = [
    ['feed.bbo', 'info', 'BBO received', 'hyperliquid', 'SOLUSDT'],
    ['factor.frame', 'info', 'Online factor frame updated', 'hyperliquid', 'SOLUSDT'],
    ['signal.created', 'info', 'LONG confidence=0.82', 'hyperliquid', 'SOLUSDT'],
    ['risk.allowed', 'info', 'New exposure allowed', 'hyperliquid', 'SOLUSDT'],
    ['journal.intent', 'info', 'Order intent durable before dispatch', 'hyperliquid', 'SOLUSDT'],
    ['oms.partial_fill', 'info', 'Partial fill 20 / 42', 'hyperliquid', 'SOLUSDT'],
    ['reconcile.match', 'info', 'Venue / journal / ownership match', 'hyperliquid', 'SOLUSDT']
  ]
  if (scenario === 'safe_hold') {
    normal.push(
      ['execution.unknown', 'warning', 'Submit outcome unresolved after venue lookup', 'hyperliquid', 'SOLUSDT'],
      ['safety.safe_hold', 'critical', 'New SOL exposure blocked pending reconcile', 'hyperliquid', 'SOLUSDT']
    )
  }
  return normal.map((entry, index) => ({
    seq: 83_200 + index,
    at: new Date(now - (normal.length - index) * 700).toISOString(),
    type: entry[0], severity: entry[1], message: entry[2], venue: entry[3], asset: entry[4]
  }))
}
