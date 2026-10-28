import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { apply, envConfig } from '../src/index.js'
import { EVENTS_ROUTE, SNAPSHOT_ROUTE } from '../src/shared.js'
import { mockSnapshot } from '../src/host/mock.js'

const ENV_KEYS = ['PG_TSY_TRANSPORT', 'PG_TSY_RUNTIME_URL', 'PG_TSY_RUNTIME_TOKEN', 'PG_TSY_MOCK_SCENARIO', 'PG_TSY_HTTP_TIMEOUT_MS']

function withEnv(env, fn) {
  const saved = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]))
  for (const key of ENV_KEYS) delete process.env[key]
  Object.assign(process.env, env)
  try {
    return fn()
  } finally {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  }
}

function mount(env, connection = { requestRejection: () => undefined }) {
  const routes = new Map()
  const ctx = {
    connection,
    webServer: { register: route => { routes.set(route.path, route.handler) } },
    effect: fn => fn(),
  }
  withEnv(env, () => apply(ctx))
  return async (path, method = 'GET') => {
    const url = new URL(path, 'http://localhost')
    const res = {
      statusCode: 200,
      headers: {},
      body: '',
      setHeader(key, value) { this.headers[key.toLowerCase()] = value },
      end(chunk = '') { this.body += chunk },
    }
    await routes.get(url.pathname)({ method, url: path, headers: {} }, res)
    return { status: res.statusCode, headers: res.headers, json: res.body ? JSON.parse(res.body) : undefined }
  }
}

async function withUpstream(handler, fn) {
  const server = createServer(handler)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`)
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
}

test('routes fail closed when the Harness connection fence is unavailable', async () => {
  const request = mount({}, null)
  assert.equal((await request(SNAPSHOT_ROUTE)).status, 503)
  assert.equal((await request(EVENTS_ROUTE)).status, 503)
})

test('routes return the fence rejection before any runtime data', async () => {
  const request = mount({}, { requestRejection: () => 401 })
  const response = await request(SNAPSHOT_ROUTE)
  assert.equal(response.status, 401)
  assert.equal(response.json, undefined)
})

test('non-GET methods are refused', async () => {
  const request = mount({})
  const response = await request(SNAPSHOT_ROUTE, 'POST')
  assert.equal(response.status, 405)
  assert.equal(response.headers.allow, 'GET')
})

test('mock snapshot route serves a validated no-store snapshot', async () => {
  const request = mount({ PG_TSY_MOCK_SCENARIO: 'safe_hold' })
  const response = await request(SNAPSHOT_ROUTE)
  assert.equal(response.status, 200)
  assert.equal(response.headers['cache-control'], 'no-store')
  assert.equal(response.json.safety.effective_state, 'SAFE_HOLD')
})

test('malformed events cursor falls back to defaults instead of NaN', async () => {
  const request = mount({})
  const all = await request(`${EVENTS_ROUTE}?after=0&limit=200`)
  const garbage = await request(`${EVENTS_ROUTE}?after=abc&limit=xyz`)
  assert.equal(garbage.status, 200)
  assert.deepEqual(garbage.json.events.map(event => event.seq), all.json.events.map(event => event.seq))
  const last = all.json.events.at(-1).seq
  const tail = await request(`${EVENTS_ROUTE}?after=${last - 2}&limit=1`)
  assert.deepEqual(tail.json.events.map(event => event.seq), [last])
})

test('HTTP transport sends the Host-only bearer and sanitized cursor upstream', async () => {
  const seen = []
  await withUpstream((req, res) => {
    seen.push({ url: req.url, authorization: req.headers.authorization })
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(req.url.startsWith('/v1/events') ? { events: [] } : mockSnapshot('normal')))
  }, async base => {
    const request = mount({ PG_TSY_RUNTIME_URL: base, PG_TSY_RUNTIME_TOKEN: 'host-secret' })
    assert.equal((await request(SNAPSHOT_ROUTE)).status, 200)
    assert.equal((await request(`${EVENTS_ROUTE}?after=NaN&limit=1e9`)).status, 200)
  })
  assert.deepEqual(seen, [
    { url: '/v1/snapshot', authorization: 'Bearer host-secret' },
    { url: '/v1/events?after=0&limit=200', authorization: 'Bearer host-secret' },
  ])
})

test('upstream schema mismatch surfaces as runtime-unavailable, never as trading truth', async () => {
  await withUpstream((req, res) => {
    res.end(JSON.stringify({ ...mockSnapshot('normal'), schema_version: 'runtime.snapshot.v0' }))
  }, async base => {
    const request = mount({ PG_TSY_RUNTIME_URL: base })
    const response = await request(SNAPSHOT_ROUTE)
    assert.equal(response.status, 502)
    assert.equal(response.json.code, 'runtime-unavailable')
    assert.match(response.json.safety_note, /does not prove the trading runtime is stopped/)
  })
})

test('invalid HTTP timeout fails at startup instead of aborting every request', () => {
  assert.throws(() => envConfig({ PG_TSY_HTTP_TIMEOUT_MS: 'fast' }), /PG_TSY_HTTP_TIMEOUT_MS must be a number/)
  assert.equal(envConfig({ PG_TSY_HTTP_TIMEOUT_MS: '' }).timeoutMs, 3000)
  assert.equal(envConfig({ PG_TSY_HTTP_TIMEOUT_MS: '10' }).timeoutMs, 250)
  assert.equal(envConfig({ PG_TSY_HTTP_TIMEOUT_MS: '999999' }).timeoutMs, 30_000)
})
