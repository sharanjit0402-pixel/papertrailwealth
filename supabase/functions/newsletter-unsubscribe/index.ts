// One-click unsubscribe from the Weekly Investing Newsletter.
import { createClient } from 'npm:@supabase/supabase-js@2';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? (() => { try { const k = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}'); return k.default ?? Object.values(k)[0]; } catch { return ''; } })() as string;
const SITE = Deno.env.get('SITE_URL') ?? 'https://papertrailwealth.com';
async function token(email: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('ptw-nl:' + SERVICE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(email));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
Deno.serve(async (req) => {
  const u = new URL(req.url);
  const email = (u.searchParams.get('e') ?? '').toLowerCase();
  if (!email || u.searchParams.get('t') !== await token(email)) return new Response('Invalid link', { status: 400 });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, SERVICE_KEY);
  await db.from('newsletter_subscribers').update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() }).eq('email', email);
  if (req.method === 'POST') return new Response('ok');
  return Response.redirect(`${SITE}/newsletter/?unsubscribed=1`, 302);
});
