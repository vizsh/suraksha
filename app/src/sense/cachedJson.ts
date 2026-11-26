// Fetch JSON from a free public API with a browser cache in front of it.
// Open-Meteo is free but rate-limited; every page load used to ask again. Now each answer is
// kept for its time-to-live, and a stale answer is used if the service refuses (429) or is offline.

const PREFIX = 'sm-cache:'

function key(url: string) {
  let h = 5381
  for (let i = 0; i < url.length; i++) h = ((h << 5) + h + url.charCodeAt(i)) | 0
  return PREFIX + (h >>> 0).toString(36)
}

export async function cachedJson<T = unknown>(url: string, ttlMs: number): Promise<T> {
  const k = key(url)
  let stale: T | undefined
  try {
    const hit = localStorage.getItem(k)
    if (hit) {
      const { at, data } = JSON.parse(hit) as { at: number; data: T }
      if (Date.now() - at < ttlMs) return data
      stale = data
    }
  } catch {
    /* storage unavailable: just fetch */
  }
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${res.status}`)
    const data = (await res.json()) as T
    try {
      localStorage.setItem(k, JSON.stringify({ at: Date.now(), data }))
    } catch {
      /* full or private mode: fine without the cache */
    }
    return data
  } catch (e) {
    if (stale !== undefined) return stale
    throw e
  }
}
