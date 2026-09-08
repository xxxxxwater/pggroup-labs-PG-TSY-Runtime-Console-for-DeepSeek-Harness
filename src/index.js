import { EVENTS_ROUTE, SNAPSHOT_ROUTE } from './shared.js'
import { mockEvents, mockSnapshot } from './host/mock.js'

export const name = 'pg-tsy-runtime-console'
export const inject = ['webServer', 'connection']

function envConfig() {
  const transport = String(process.env.PG_TSY_TRANSPORT ?? 'mock').toLowerCase()
  const runtimeUrl = String(process.env.PG_TSY_RUNTIME_URL ?? '').replace(/\/+$/, '')
  const token = process.env.PG_TSY_RUNTIME_TOKEN
  const scenario = String(process.env.PG_TSY_MOCK_SCENARIO ?? 'normal').toLowerCase()
  const timeoutMs = Math.max(250, Math.min(30_000, Number(process.env.PG_TSY_HTTP_TIMEOUT_MS ?? 3000)))
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
  const status = connectionOf(ctx)?.requestRejection?.(req)
  if (status === undefined) return false
  res.statusCode = status
  res.end()
  return true
}

async function upstreamJson(config, path, search = '') {
  if (!config.runtimeUrl) throw new Error('PG_TSY_RUNTIME_URL is required when PG_TSY_TRANSPORT=http')
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
    return JSON.parse(text)
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
        sendJson(res, 200, snapshot)
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
        const after = Math.max(0, Number(url.searchParams.get('after') ?? 0))
        const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') ?? 80)))
        const payload = config.transport === 'http'
          ? await upstreamJson(config, '/v1/events', `?after=${after}&limit=${limit}`)
          : { events: mockEvents(config.scenario).filter(event => event.seq > after).slice(-limit) }
        sendJson(res, 200, payload)
      } catch (error) {
        unavailable(res, error)
      }
    }
  }), `pg-tsy-runtime: GET ${EVENTS_ROUTE}`)
}
