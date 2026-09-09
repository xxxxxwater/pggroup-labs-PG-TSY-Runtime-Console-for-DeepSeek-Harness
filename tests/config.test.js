import test from 'node:test'
import assert from 'node:assert/strict'
import { envConfig } from '../src/index.js'

test('runtime URL selects real HTTP transport when transport is omitted', () => {
  const config = envConfig({ PG_TSY_RUNTIME_URL: 'http://127.0.0.1:8787/' })
  assert.equal(config.transport, 'http')
  assert.equal(config.runtimeUrl, 'http://127.0.0.1:8787')
})

test('no runtime URL keeps developer mock transport', () => {
  const config = envConfig({})
  assert.equal(config.transport, 'mock')
})

test('explicit HTTP transport requires runtime URL', () => {
  assert.throws(() => envConfig({ PG_TSY_TRANSPORT: 'http' }), /PG_TSY_RUNTIME_URL is required/)
})

test('unknown transport fails instead of silently falling back to mock', () => {
  assert.throws(() => envConfig({ PG_TSY_TRANSPORT: 'ssh' }), /must be mock or http/)
})
