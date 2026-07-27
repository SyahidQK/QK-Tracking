/**
 * CORS for the public endpoints.
 *
 * ALLOWED_ORIGINS is a comma-separated list set as a function secret, e.g.
 *   https://qk-tracking.vercel.app,http://localhost:5173
 * If it is unset we fall back to "*", which is acceptable only because these
 * endpoints authenticate by token, not by cookie or Origin.
 */
const configured = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

export function corsHeaders(origin: string | null): Record<string, string> {
  const allow =
    configured.length === 0
      ? '*'
      : origin && configured.includes(origin)
        ? origin
        : (configured[0] ?? '*')

  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-cron-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

export function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  })
}
