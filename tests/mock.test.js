import test from 'node:test'
import assert from 'node:assert/strict'
import { mockEvents, mockSnapshot } from '../src/host/mock.js'

test('safe-hold mock preserves stable order identity evidence', () => {
  const snapshot = mockSnapshot('safe_hold')
  const unknown = snapshot.orders.recent.find(order => order.status === 'UNKNOWN')
  assert.ok(unknown)
  assert.match(unknown.client_identity, /^cloid:/)
  assert.equal(snapshot.safety.allow_new_exposure, false)
})

test('mock event stream exposes structured failure boundary', () => {
  const events = mockEvents('safe_hold')
  assert.ok(events.some(event => event.type === 'execution.unknown'))
  assert.ok(events.some(event => event.type === 'safety.safe_hold'))
  assert.ok(events.every((event, index, array) => index === 0 || event.seq > array[index - 1].seq))
})
