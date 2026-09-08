import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { EVENTS_ROUTE, SNAPSHOT_ROUTE, effectiveRuntimeState, makeDiagnosisPrompt, snapshotAgeMs } from '../shared.js'

const h = React.createElement

function fmtMs(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  if (n < 1000) return `${Math.round(n)} ms`
  return `${(n / 1000).toFixed(1)} s`
}

function fmtMoney(value) {
  const n = Number(value)
  return Number.isFinite(n)
    ? new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)
    : '—'
}

function tone(value) {
  const v = String(value ?? '').toUpperCase()
  if (['HEALTHY', 'RUNNING', 'ALLOWED', 'OWNED', 'NORMAL', 'MATCH'].includes(v)) return 'pgtsy-good'
  if (['UNKNOWN', 'FAILED', 'HALTED', 'SAFE_HOLD', 'BLOCKED', 'STALE'].includes(v)) return 'pgtsy-bad'
  if (['DEGRADED', 'PARTIAL', 'WARNING'].includes(v)) return 'pgtsy-warn'
  return ''
}

function Row({ label, value, className = '' }) {
  return h('div', { className: 'pgtsy-row' },
    h('span', { className: 'pgtsy-key' }, label),
    h('span', { className: `pgtsy-value ${className}` }, value))
}
function Section({ title, children }) { return h('section', { className: 'pgtsy-section' }, h('h3', null, title), children) }
function Card({ children }) { return h('div', { className: 'pgtsy-card' }, children) }

async function getJson(url, signal) {
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(body.message || `HTTP ${response.status}`)
    error.payload = body
    throw error
  }
  return body
}

function Overview({ snapshot, state }) {
  const venues = Array.isArray(snapshot?.venues) ? snapshot.venues : []
  const strategies = Array.isArray(snapshot?.strategies) ? snapshot.strategies : []
  const positions = Array.isArray(snapshot?.positions) ? snapshot.positions : []
  return h(React.Fragment, null,
    h(Section, { title: 'Safety' }, h(Card, null,
      h(Row, { label: 'New exposure', value: snapshot?.safety?.allow_new_exposure ? 'ALLOWED' : 'BLOCKED', className: snapshot?.safety?.allow_new_exposure ? 'pgtsy-good' : 'pgtsy-bad' }),
      h(Row, { label: 'Lease', value: snapshot?.lease?.owned ? `OWNED · #${snapshot?.lease?.fencing_token ?? '—'}` : 'NOT OWNED', className: snapshot?.lease?.owned ? 'pgtsy-good' : 'pgtsy-bad' }),
      h(Row, { label: 'Lease heartbeat', value: fmtMs(snapshot?.lease?.heartbeat_age_ms) }),
      h(Row, { label: 'Reconcile', value: `${snapshot?.reconcile?.status ?? 'UNKNOWN'} · ${snapshot?.reconcile?.mismatch_count ?? 0} mismatch`, className: tone(snapshot?.reconcile?.status) }),
      h(Row, { label: 'Unknown orders', value: String(snapshot?.orders?.unknown ?? 0), className: Number(snapshot?.orders?.unknown) > 0 ? 'pgtsy-bad' : 'pgtsy-good' }),
      h(Row, { label: 'Journal', value: snapshot?.storage?.journal ?? 'UNKNOWN', className: tone(snapshot?.storage?.journal) })
    )),
    h(Section, { title: 'Venues' }, h(Card, null,
      venues.length ? venues.map(venue => h('div', { className: 'pgtsy-venue', key: venue.id },
        h('div', { className: 'pgtsy-venue-head' },
          h('span', null, venue.id),
          h('span', { className: venue.enabled === false ? 'pgtsy-muted' : tone(venue.execution) }, venue.enabled === false ? 'DISABLED' : venue.execution)),
        h('div', { className: 'pgtsy-metrics' },
          h('div', { className: 'pgtsy-metric' }, h('b', { className: tone(venue.market_data) }, venue.market_data ?? '—'), h('span', null, 'Market data')),
          h('div', { className: 'pgtsy-metric' }, h('b', { className: tone(venue.execution) }, venue.execution ?? '—'), h('span', null, 'Execution')),
          h('div', { className: 'pgtsy-metric' }, h('b', { className: tone(venue.reconcile) }, venue.reconcile ?? '—'), h('span', null, 'Reconcile'))),
        venue.latency_ms && h('div', { className: 'pgtsy-small' }, `market ${fmtMs(venue.latency_ms.market)} · order p50 ${fmtMs(venue.latency_ms.order_p50)} · p99 ${fmtMs(venue.latency_ms.order_p99)}`)
      )) : h('div', { className: 'pgtsy-empty' }, 'No venue telemetry')
    )),
    h(Section, { title: 'Strategies' }, h(Card, null,
      strategies.length ? h('ul', { className: 'pgtsy-list' }, strategies.map(item => h('li', { key: item.id },
        h('div', { className: 'pgtsy-line' }, h('strong', null, item.id), h('span', { className: tone(item.status) }, item.status)),
        h('div', { className: 'pgtsy-small' }, `${item.asset ?? '—'} · ${item.position ?? 'FLAT'} ${item.quantity ?? ''} · signal ${item.signal?.side ?? '—'} ${item.signal?.confidence ?? '—'} · age ${fmtMs(item.signal?.age_ms)}`)
      ))) : h('div', { className: 'pgtsy-empty' }, 'No active strategies')
    )),
    h(Section, { title: 'Positions' }, h(Card, null,
      positions.length ? h('ul', { className: 'pgtsy-list' }, positions.map((item, index) => h('li', { key: `${item.venue}-${item.asset}-${index}` },
        h('div', { className: 'pgtsy-line' }, h('strong', null, `${item.asset} · ${item.side}`), h('span', null, `${item.quantity} · ${fmtMoney(item.notional_usd)}`)),
        h('div', { className: 'pgtsy-small' }, `${item.venue} · ownership ${item.ownership ?? 'UNKNOWN'}${item.strategy_id ? ` · ${item.strategy_id}` : ''}`)
      ))) : h('div', { className: 'pgtsy-empty' }, 'No positions')
    )),
    h(Section, { title: 'Performance' }, h(Card, null,
      h(Row, { label: 'PnL today', value: fmtMoney(snapshot?.performance?.pnl_today_usd), className: Number(snapshot?.performance?.pnl_today_usd) >= 0 ? 'pgtsy-good' : 'pgtsy-bad' }),
      h(Row, { label: 'Gross exposure', value: fmtMoney(snapshot?.performance?.gross_exposure_usd) }),
      h(Row, { label: 'Console decision', value: state, className: tone(state) })
    ))
  )
}

function Orders({ snapshot }) {
  const recent = Array.isArray(snapshot?.orders?.recent) ? snapshot.orders.recent : []
  return h(React.Fragment, null,
    h(Section, { title: 'OMS summary' }, h(Card, null,
      h(Row, { label: 'Open', value: String(snapshot?.orders?.open ?? 0) }),
      h(Row, { label: 'Partial', value: String(snapshot?.orders?.partial ?? 0), className: Number(snapshot?.orders?.partial) > 0 ? 'pgtsy-warn' : '' }),
      h(Row, { label: 'Unknown', value: String(snapshot?.orders?.unknown ?? 0), className: Number(snapshot?.orders?.unknown) > 0 ? 'pgtsy-bad' : 'pgtsy-good' }),
      h(Row, { label: 'Filled recent', value: String(snapshot?.orders?.filled_recent ?? 0) })
    )),
    h(Section, { title: 'Recent orders' }, h(Card, null, recent.length ? h('ul', { className: 'pgtsy-list' }, recent.map(order => h('li', { key: order.id },
      h('div', { className: 'pgtsy-line' }, h('strong', null, `${order.asset} · ${order.side}`), h('span', { className: tone(order.status) }, order.status)),
      h('div', { className: 'pgtsy-small' }, `${order.venue} · ${order.filled ?? '?'} / ${order.quantity ?? '?'} · ${order.client_identity ?? order.id}`)
    ))) : h('div', { className: 'pgtsy-empty' }, 'No recent orders'))),
    h(Section, { title: 'Recovery' }, h(Card, null,
      h(Row, { label: 'Checkpoint seq', value: String(snapshot?.storage?.checkpoint_seq ?? '—') }),
      h(Row, { label: 'Journal tail', value: String(snapshot?.storage?.journal_tail_seq ?? '—') }),
      h(Row, { label: 'Pending dispatch', value: String(snapshot?.storage?.pending_dispatch ?? '—'), className: Number(snapshot?.storage?.pending_dispatch) > 0 ? 'pgtsy-warn' : 'pgtsy-good' }),
      h(Row, { label: 'Unknown ownership', value: String(snapshot?.reconcile?.ownership_unknown_count ?? 0), className: Number(snapshot?.reconcile?.ownership_unknown_count) > 0 ? 'pgtsy-bad' : 'pgtsy-good' })
    ))
  )
}

function Events({ events }) {
  return h(Section, { title: 'Structured runtime events' }, h(Card, null,
    events.length ? h('div', { className: 'pgtsy-events' }, events.slice().reverse().map(event => h('div', { className: 'pgtsy-event', key: event.seq, 'data-severity': event.severity },
      h('span', { className: 'pgtsy-event-time' }, new Date(event.at).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })),
      h('div', null,
        h('div', { className: 'pgtsy-event-type' }, event.type),
        h('div', null, event.message),
        h('div', { className: 'pgtsy-small' }, `${event.venue ?? '—'}${event.asset ? ` · ${event.asset}` : ''} · seq ${event.seq}`))
    ))) : h('div', { className: 'pgtsy-empty' }, 'No events')
  ))
}

export function RuntimeConsole({ useTabInfo }) {
  const { tab } = useTabInfo()
  const [snapshot, setSnapshot] = useState(null)
  const [events, setEvents] = useState([])
  const [error, setError] = useState(null)
  const [view, setView] = useState('overview')
  const [copied, setCopied] = useState(false)

  const refresh = useCallback(async signal => {
    try {
      const next = await getJson(SNAPSHOT_ROUTE, signal)
      setSnapshot(next)
      setError(null)
      const eventPayload = await getJson(`${EVENTS_ROUTE}?after=0&limit=80`, signal)
      const incoming = Array.isArray(eventPayload?.events) ? eventPayload.events : []
      setEvents(incoming.slice(-200))
    } catch (cause) {
      if (cause?.name !== 'AbortError') setError(cause)
    }
  }, [])

  useEffect(() => {
    if (tab.signal.aborted) return
    const controller = new AbortController()
    const abort = () => controller.abort()
    tab.signal.addEventListener('abort', abort, { once: true })
    refresh(controller.signal)
    const timer = setInterval(() => refresh(controller.signal), 2000)
    return () => {
      clearInterval(timer)
      controller.abort()
      tab.signal.removeEventListener('abort', abort)
    }
  }, [tab.signal, refresh])

  const state = useMemo(() => error ? 'OFFLINE' : effectiveRuntimeState(snapshot), [snapshot, error])
  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(makeDiagnosisPrompt(snapshot))
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }
  const age = snapshot ? snapshotAgeMs(snapshot) : Infinity
  const reason = state === 'OFFLINE'
    ? (error?.payload?.safety_note ?? 'Telemetry unavailable. This does not prove trading is stopped; trading state is UNKNOWN.')
    : snapshot?.safety?.reason

  return h('div', { className: 'pgtsy-root' },
    h('header', { className: 'pgtsy-head' },
      h('div', null,
        h('div', { className: 'pgtsy-title' }, 'PG TSY Runtime'),
        h('div', { className: 'pgtsy-sub' }, `${snapshot?.runtime?.environment ?? 'unknown'} · ${snapshot?.runtime?.instance_id ?? 'telemetry unavailable'} · ${snapshot?.runtime?.version ?? '—'}`)),
      h('div', { className: 'pgtsy-state', 'data-state': state }, h('span', { className: 'pgtsy-dot' }), state)
    ),
    (reason || state !== 'NORMAL') && h('div', { className: 'pgtsy-banner', 'data-state': state },
      h('strong', null, state === 'OFFLINE' ? 'Trading state UNKNOWN' : state),
      h('div', null, reason || `Runtime is ${state}.`)),
    h('nav', { className: 'pgtsy-tabs', 'aria-label': 'PG TSY runtime views' }, ['overview', 'orders', 'events'].map(id => h('button', {
      type: 'button', className: 'pgtsy-tab', key: id, 'aria-selected': view === id, onClick: () => setView(id)
    }, id[0].toUpperCase() + id.slice(1)))),
    snapshot && view === 'overview' && h(Overview, { snapshot, state }),
    snapshot && view === 'orders' && h(Orders, { snapshot }),
    view === 'events' && h(Events, { events }),
    !snapshot && !error && h('div', { className: 'pgtsy-empty' }, 'Loading runtime telemetry…'),
    error && h('div', { className: 'pgtsy-error' }, `Telemetry error: ${error.message}`),
    h('div', { className: 'pgtsy-actions' },
      h('button', { type: 'button', className: 'pgtsy-btn', onClick: () => refresh(new AbortController().signal) }, 'Refresh'),
      h('button', { type: 'button', className: 'pgtsy-btn', disabled: !snapshot, onClick: copyPrompt }, copied ? 'Copied' : 'Copy diagnosis prompt'),
      h('button', { type: 'button', className: 'pgtsy-btn', disabled: true, title: 'Control mutations are intentionally disabled until pg-core typed control API is production-complete.' }, 'Emergency Exit · not wired')
    ),
    h('footer', { className: 'pgtsy-foot' }, `Telemetry age ${Number.isFinite(age) ? fmtMs(age) : 'unknown'} · OFFLINE ≠ STOPPED · UNKNOWN ≠ REJECTED · process alive ≠ safe to trade`)
  )
}
