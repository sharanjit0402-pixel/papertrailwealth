// Sends a welcome email the first time someone joins a challenge.
// Called by the website right after they join (with their login token).
import { createClient } from 'npm:@supabase/supabase-js@2';

// ---- shared email helpers ----
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? (() => { try { const k = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}'); return k.default ?? Object.values(k)[0]; } catch { return ''; } })() as string;
const SITE = Deno.env.get('SITE_URL') ?? 'https://papertrailwealth.com';
const FROM = 'The Paper Trail <hello@papertrailwealth.com>';
const FUNCTIONS_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1`;

const NAMES: Record<string, string> = {
  '52-week': 'The 52-Week Challenge',
  'emergency-fund': 'The $1,000 Safety Net',
  'savings-streak': 'The Savings Streak',
};
const money = (n: number) => '$' + (Math.round(n * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });

async function hmac(text: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('ptw-unsub:' + SERVICE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
const unsubToken = (userId: string) => hmac('unsub:' + userId);
async function unsubUrl(userId: string) { return `${FUNCTIONS_URL}/unsubscribe?u=${userId}&t=${await unsubToken(userId)}`; }

function layout(opts: { title: string; body: string; cta?: { text: string; url: string }; unsub: string }) {
  const btn = opts.cta
    ? `<p style="margin:28px 0"><a href="${opts.cta.url}" style="background:#1F7A4D;color:#fff;text-decoration:none;padding:14px 22px;border-radius:12px;font-weight:700;display:inline-block">${opts.cta.text}</a></p>` : '';
  return `<!doctype html><html><body style="margin:0;background:#F4F7F5;font-family:Inter,Segoe UI,Arial,sans-serif;color:#14171A">
  <div style="max-width:560px;margin:0 auto;padding:28px 18px">
    <div style="font-weight:800;font-size:20px;letter-spacing:-.4px">The Paper <span style="color:#1F7A4D">Trail</span></div>
    <div style="background:#fff;border:1px solid #E5E7EB;border-radius:18px;padding:28px;margin-top:16px">
      <h1 style="font-size:24px;line-height:1.25;margin:0 0 14px;letter-spacing:-.5px">${opts.title}</h1>
      <div style="font-size:16px;line-height:1.6;color:#374151">${opts.body}</div>${btn}
    </div>
    <p style="font-size:12px;color:#6b7280;line-height:1.6;margin-top:18px">You're getting this because you joined a money challenge at papertrailwealth.com. General education, not financial advice.<br>
    <a href="${opts.unsub}" style="color:#6b7280">Unsubscribe from challenge emails</a></p>
  </div></body></html>`;
}

async function send(to: string, subject: string, html: string, unsub: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, html, reply_to: 'hello@papertrailwealth.com', headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}
// ---- end helpers ----


const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const TIPS: Record<string, string> = {
  'savings-streak': `Save something today, even $1, then tap <b>"I saved today"</b>. We'll nudge you in the evening if your streak is about to break. Milestones unlock at 3, 7, 14, 30, 60, 100, 200 and 365 days.`,
  '52-week': `This week, move <b>$1</b> into savings (or $52 if you chose reverse mode) and tick it off. Every Sunday we'll send your running total. By week 52 you'll have <b>$1,378</b>.`,
  'emergency-fund': `Your first stop is a <b>$1,000 starter fund</b>. Log every deposit and we'll show your finish date. If a real emergency hits, log it with "I had to use it". That's exactly what it's for.`,
};
const PATHS: Record<string, string> = { 'savings-streak': 'savings-streak', '52-week': '52-week', 'emergency-fund': 'emergency-fund' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { challenge } = await req.json();
    if (!NAMES[challenge]) return new Response('bad challenge', { status: 400, headers: cors });
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, SERVICE_KEY);
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return new Response('unauthorized', { status: 401, headers: cors });
    const { data: prof } = await admin.from('profiles').select('name, email, email_opt_in').eq('id', user.id).single();
    if (!prof?.email_opt_in) return new Response('opted out', { headers: cors });
    const key = `welcome:${challenge}`;
    const { error: dup } = await admin.from('email_log').insert({ user_id: user.id, key });
    if (dup) return new Response('already sent', { headers: cors });
    const unsub = await unsubUrl(user.id);
    const hi = prof.name ? `Hi ${prof.name},` : 'Hi there,';
    await send(prof.email, `You're in: ${NAMES[challenge]} 🔥`, layout({
      title: `Welcome to ${NAMES[challenge]}`,
      body: `<p>${hi}</p><p>${TIPS[challenge]}</p><p>Small steps, every day. That's the whole trick.</p>`,
      cta: { text: 'Open my challenge', url: `${SITE}/challenges/${PATHS[challenge]}/` }, unsub,
    }), unsub);
    return new Response('sent', { headers: cors });
  } catch (e) {
    return new Response(String(e), { status: 500, headers: cors });
  }
});
