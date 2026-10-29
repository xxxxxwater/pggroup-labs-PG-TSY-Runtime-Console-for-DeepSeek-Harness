import test from 'node:test'
import assert from 'node:assert/strict'
import { getJson } from '../src/client/http.js'

const respond = (status, body) => async () => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => {
    if (typeof body === 'string') throw new SyntaxError('Unexpected token <')
    return body
  },
})

const hang = (url, { signal }) => new Promise((_, reject) => {
  if (signal.aborted) return reject(signal.reason)
  signal.addEventListener('abort', () => reject(signal.reason), { once: true })
})

test('a stalled request times out as an error instead of hanging forever', async () => {
  await assert.rejects(
    getJson('/snapshot', new AbortController().signal, { timeoutMs: 20, fetchImpl: hang }),
    error => error.name !== 'AbortError' && /timed out after 20 ms/.test(error.message),
  )
})

test('lifecycle abort still surfaces as AbortError so it is not shown as telemetry loss', async () => {
  const lifecycle = new AbortController()
  const pending = getJson('/snapshot', lifecycle.signal, { timeoutMs: 5_000, fetchImpl: hang })
  lifecycle.abort()
  await assert.rejects(pending, error => error.name === 'AbortError')
})

test('an already-aborted lifecycle signal aborts immediately', async () => {
  const lifecycle = new AbortController()
  lifecycle.abort()
  await assert.rejects(getJson('/snapshot', lifecycle.signal, { fetchImpl: hang }), error => error.name === 'AbortError')
})

test('Host error payload is preserved for the OFFLINE banner', async () => {
  const payload = { code: 'runtime-unavailable', message: 'runtime upstream 503', safety_note: 'Trading state is unknown.' }
  await assert.rejects(
    getJson('/snapshot', undefined, { fetchImpl: respond(502, payload) }),
    error => error.message === 'runtime upstream 503' && error.payload.safety_note === 'Trading state is unknown.',
  )
})

test('non-JSON or null error body falls back to the HTTP status', async () => {
  for (const body of ['<html>', null]) {
    await assert.rejects(
      getJson('/snapshot', undefined, { fetchImpl: respond(504, body) }),
      error => error.message === 'HTTP 504' && typeof error.payload === 'object',
    )
  }
})

test('a 200 that is not a JSON object is rejected rather than treated as telemetry', async () => {
  for (const body of ['<html>login</html>', null, 42]) {
    await assert.rejects(getJson('/snapshot', undefined, { fetchImpl: respond(200, body) }), /invalid JSON telemetry/)
  }
})

test('a JSON object body is returned as-is', async () => {
  assert.deepEqual(await getJson('/events', undefined, { fetchImpl: respond(200, { events: [] }) }), { events: [] })
})
