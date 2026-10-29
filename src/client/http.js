// Upper bound for one console request. Without it a stalled connection never settles,
// no error is recorded and the safety badge keeps showing the last decision.
export const CLIENT_TIMEOUT_MS = 10_000

export async function getJson(url, signal, { timeoutMs = CLIENT_TIMEOUT_MS, fetchImpl = globalThis.fetch } = {}) {
  if (signal?.aborted) throw signal.reason
  const controller = new AbortController()
  const forward = () => controller.abort(signal.reason)
  signal?.addEventListener('abort', forward, { once: true })
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  try {
    const response = await fetchImpl(url, { headers: { accept: 'application/json' }, signal: controller.signal })
    let body
    try {
      body = await response.json()
    } catch (cause) {
      if (cause?.name === 'AbortError') throw cause
      body = undefined
    }
    if (!response.ok) {
      const error = new Error(body?.message || `HTTP ${response.status}`)
      error.payload = body ?? {}
      throw error
    }
    // A 200 that is not a JSON object (e.g. a proxy login page) is not telemetry.
    if (!body || typeof body !== 'object') throw new Error(`invalid JSON telemetry from ${url}`)
    return body
  } catch (cause) {
    if (timedOut) throw new Error(`telemetry request timed out after ${timeoutMs} ms`)
    throw cause
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', forward)
  }
}
