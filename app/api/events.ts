// Shared event log so a report on one phone appears on every screen.
// Vercel Function (Node.js runtime, Web-standard handlers) backed by Upstash Redis over REST.
// Configure on Vercel: add the Upstash Redis integration from the Marketplace, which sets
// KV_REST_API_URL and KV_REST_API_TOKEN (UPSTASH_REDIS_REST_URL / _TOKEN also work).
// Without them the endpoint answers { configured: false } and each browser works on its own.

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN
const LIST = 'suraksha:events'
const CLOCK = 'suraksha:clock'
const KEEP = 500
const TTL = 60 * 60 * 24 * 3 // three days

type Cmd = (string | number)[]

async function pipeline(cmds: Cmd[]): Promise<unknown[]> {
  const res = await fetch(`${REDIS_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  })
  if (!res.ok) throw new Error(`redis ${res.status}`)
  const out = (await res.json()) as { result?: unknown; error?: string }[]
  return out.map((r) => r.result)
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

export async function GET(request: Request) {
  if (!REDIS_URL || !REDIS_TOKEN) return json({ configured: false, events: [], clock: null })
  const since = Number(new URL(request.url).searchParams.get('since') ?? 0)
  const [raw, clock] = await pipeline([
    ['LRANGE', LIST, 0, KEEP - 1],
    ['GET', CLOCK],
  ])
  const events = ((raw as string[]) ?? [])
    .map((s) => JSON.parse(s) as { stamp: number; envelope: unknown })
    .filter((e) => e.stamp > since)
    .sort((a, b) => a.stamp - b.stamp)
  return json({ configured: true, events, clock: clock ? JSON.parse(clock as string) : null })
}

export async function POST(request: Request) {
  if (!REDIS_URL || !REDIS_TOKEN) return json({ configured: false }, 503)
  const text = await request.text()
  if (text.length > 80_000) return json({ error: 'payload too large' }, 413)
  const body = JSON.parse(text) as { envelope?: { type?: string }; clock?: unknown }
  const cmds: Cmd[] = []
  if (body.envelope) {
    const type = body.envelope.type
    if (!['obs', 'man', 'wo', 'reset'].includes(String(type))) return json({ error: 'unknown event' }, 400)
    if (type === 'reset') cmds.push(['DEL', LIST])
    cmds.push(['LPUSH', LIST, JSON.stringify({ stamp: Date.now(), envelope: body.envelope })], ['LTRIM', LIST, 0, KEEP - 1], ['EXPIRE', LIST, TTL])
  }
  if (body.clock) cmds.push(['SET', CLOCK, JSON.stringify(body.clock), 'EX', TTL])
  if (cmds.length) await pipeline(cmds)
  return json({ ok: true })
}
