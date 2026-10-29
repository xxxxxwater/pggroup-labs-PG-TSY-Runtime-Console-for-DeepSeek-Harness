import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { apply, envConfig } from '../src/index.js'
import { SNAPSHOT_ROUTE } from '../src/shared.js'

test('runtime URL with embedded credentials is refused at startup', () => {
  assert.throws(
    () => envConfig({ PG_TSY_RUNTIME_URL: 'http://ops:s3cret@127.0.0.1:8787' }),
    error => /must not embed credentials/.test(error.message) && !error.message.includes('s3cret'),
  )
})

test('runtime URL must be an absolute http(s) URL without query or fragment', () => {
  assert.throws(() => envConfig({ PG_TSY_RUNTIME_URL: '127.0.0.1:8787' }), /http or https|absolute/)
  assert.throws(() => envConfig({ PG_TSY_RUNTIME_URL: 'file:///etc/passwd' }), /http or https/)
  assert.throws(() => envConfig({ PG_TSY_RUNTIME_URL: 'not a url' }), /absolute http\(s\) URL/)
  assert.throws(() => envConfig({ PG_TSY_RUNTIME_URL: 'http://127.0.0.1:8787/?x=1' }), /query string/)
})

test('runtime URL may carry a path prefix behind a proxy', () => {
  const config = envConfig({ PG_TSY_RUNTIME_URL: ' https://proxy.internal/pg-core/ ' })
  assert.equal(config.runtimeUrl, 'https://proxy.internal/pg-core')
  assert.equal(config.transport, 'http')
})

test('upstream error relayed to the browser never contains the Host-only token', async () => {
  const token = 'host-only-secret-token'
  const server = createServer((req, res) => {
    res.statusCode = 500
    res.end(`proxy debug: authorization=${req.headers.authorization}`)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const saved = { ...process.env }
  try {
    process.env.PG_TSY_RUNTIME_URL = `http://127.0.0.1:${server.address().port}`
    process.env.PG_TSY_RUNTIME_TOKEN = token
    delete process.env.PG_TSY_TRANSPORT
    const routes = new Map()
    apply({
      connection: { requestRejection: () => undefined },
      webServer: { register: route => { routes.set(route.path, route.handler) } },
      effect: fn => fn(),
    })
    const res = {
      statusCode: 200,
      body: '',
      setHeader() {},
      end(chunk = '') { this.body += chunk },
    }
    await routes.get(SNAPSHOT_ROUTE)({ method: 'GET', url: SNAPSHOT_ROUTE, headers: {} }, res)
    assert.equal(res.statusCode, 502)
    assert.ok(!res.body.includes(token), res.body)
    assert.match(JSON.parse(res.body).message, /Bearer \[redacted\]/)
  } finally {
    process.env = saved
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
})
