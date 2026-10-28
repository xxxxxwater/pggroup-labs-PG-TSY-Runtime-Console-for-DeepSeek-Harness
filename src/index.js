import {
  EVENTS_ROUTE,
  SNAPSHOT_ROUTE,
  assertRuntimeEvents,
  assertRuntimeSnapshot,
} from './shared.js'
import { mockEvents, mockSnapshot } from './host/mock.js'

export const name = 'pg-tsy-runtime-console'
export const inject = ['webServer', 'connection']

export function envConfig(source = process.env) {
  const runtimeUrl = String(source.PG_TSY_RUNTIME_URL ?? '').replace(/\/+$/, '')
  const explicitTransport = String(source.PG_TSY_TRANSPORT ?? '').trim().toLowerCase()
  const transport = explicitTransport || (runtimeUrl ? 'http' : 'mock')
  if (!['mock', 'http'].includes(transport)) {
    throw new Error(`PG_TSY_TRANSPORT must be mock or http, got: ${transport}`)
  }
  const token = source.PG_TSY_RUNTIME_TOKEN
  const scenario = String(source.PG_TSY_MOCK_SCENARIO ?? 'normal').toLowerCase()
  const rawTimeout = String(source.PG_TSY_HTTP_TIMEOUT_MS ?? '').trim()
  const parsedTimeout = rawTimeout === '' ? 3000 : Number(rawTimeout)
  // NaN would reach setTimeout as ~0 ms and abort every upstream request.
  if (!Number.isFinite(parsedTimeout)) {
    throw new Error(`PG_TSY_HTTP_TIMEOUT_MS must be a number of milliseconds, got: ${rawTimeout}`)
  }
  const timeoutMs = Math.max(250, Math.min(30_000, parsedTimeout))
  if (transport === 'http' && !runtimeUrl) {
    throw new Error('PG_TSY_RUNTIME_URL is required when PG_TSY_TRANSPORT=http')
  }
  return { transport, runtimeUrl, token, scenario, timeoutMs }
}

function connectionOf(ctx) {
  return Reflect.get(ctx, 'connection')
}

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

function method(req, res, expected) {
  if (req.method === expected) return true
  res.statusCode = 405
  res.setHeader('allow', expected)
  res.end()
  return false
}

function rejected(ctx, req, res) {
  const connection = connectionOf(ctx)
  // Fail closed: without Harness' trust fence there is no Host/Origin/auth check.
  if (typeof connection?.requestRejection !== 'function') {
    res.statusCode = 503
    res.end()
    return true
  }
  const status = connection.requestRejection(req)
  if (status === undefined) return false
  res.statusCode = status
  res.end()
  return true
}

function queryInteger(params, key, fallback, min, max) {
  const raw = params.get(key)
  if (raw === null || raw.trim() === '') return fallback
  const value = Number(raw)
  if (!Number.isSafeInteger(value)) return fallback
  return Math.max(min, Math.min(max, value))
}

async function upstreamJson(config, path, search = '') {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeoutMs)
  try {
    const headers = { accept: 'application/json' }
    if (config.token) headers.authorization = `Bearer ${config.token}`
    const response = await fetch(`${config.runtimeUrl}${path}${search}`, {
      method: 'GET', headers, signal: controller.signal
    })
    const text = await response.text()
    if (!response.ok) throw new Error(`runtime upstream ${response.status}: ${text.slice(0, 240)}`)
    try {
      return JSON.parse(text)
    } catch {
      throw new Error(`runtime upstream returned invalid JSON for ${path}`)
    }
  } finally {
    clearTimeout(timer)
  }
}

function unavailable(res, error) {
  const message = error instanceof Error ? error.message : String(error)
  sendJson(res, 502, {
    code: 'runtime-unavailable',
    message,
    safety_note: 'Telemetry unavailable does not prove the trading runtime is stopped. Trading state is unknown.'
  })
}

export function apply(ctx) {
  const config = envConfig()

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: SNAPSHOT_ROUTE,
    handler: async (req, res) => {
      if (rejected(ctx, req, res) || !method(req, res, 'GET')) return
      try {
        const snapshot = config.transport === 'http'
          ? await upstreamJson(config, '/v1/snapshot')
          : mockSnapshot(config.scenario)
        sendJson(res, 200, assertRuntimeSnapshot(snapshot))
      } catch (error) {
        unavailable(res, error)
      }
    }
  }), `pg-tsy-runtime: GET ${SNAPSHOT_ROUTE}`)

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: EVENTS_ROUTE,
    handler: async (req, res) => {
      if (rejected(ctx, req, res) || !method(req, res, 'GET')) return
      try {
        const url = new URL(String(req.url), 'http://localhost')
        const after = queryInteger(url.searchParams, 'after', 0, 0, Number.MAX_SAFE_INTEGER)
        const limit = queryInteger(url.searchParams, 'limit', 80, 1, 200)
        const payload = config.transport === 'http'
          ? await upstreamJson(config, '/v1/events', `?after=${after}&limit=${limit}`)
          : { events: mockEvents(config.scenario).filter(event => event.seq > after).slice(-limit) }
        sendJson(res, 200, assertRuntimeEvents(payload))
      } catch (error) {
        unavailable(res, error)
      }
    }
  }), `pg-tsy-runtime: GET ${EVENTS_ROUTE}`)
}
