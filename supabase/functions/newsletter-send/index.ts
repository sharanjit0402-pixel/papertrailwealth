// Sends the Saturday teaser email for a newsletter issue to every active subscriber.
// The email shows 3 headlines and a "Read the full issue" button (the issue itself lives on the website).
// Call: POST /functions/v1/newsletter-send  with header  x-admin-key: <NEWSLETTER_ADMIN_KEY>
// Body: { "slug": "...", "issue": 1, "week": "Nov. 16–20, 2026", "subject": "...", "headlines": ["...","...","..."], "test_to": "optional@email" }
import { createClient } from 'npm:@supabase/supabase-js@2';

const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? (() => { try { const k = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}'); return k.default ?? Object.values(k)[0]; } catch { return ''; } })() as string;
const SITE = Deno.env.get('SITE_URL') ?? 'https://papertrailwealth.com';
const FROM = 'The Paper Trail <hello@papertrailwealth.com>';
const FUNCTIONS_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1`;

async function token(email: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('ptw-nl:' + SERVICE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(email));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function teaserHtml(o: { issue: number; week: string; subject: string; headlines: string[]; url: string; unsub: string }) {
  return `<!doctype html><html><body style="margin:0;background:#F4F7F5;font-family:Inter,Segoe UI,Arial,sans-serif;color:#14171A">
  <div style="max-width:560px;margin:0 auto;padding:28px 18px">
    <div style="font-weight:800;font-size:20px;letter-spacing:-.4px">The Paper <span style="color:#1F7A4D">Trail</span></div>
    <div style="background:#fff;border:1px solid #E5E7EB;border-radius:18px;overflow:hidden;margin-top:16px">
      <div style="background:#0B3D26;color:#A7F3C9;font-size:12px;font-weight:800;letter-spacing:2px;padding:14px 26px">WEEKLY INVESTING NEWSLETTER · ISSUE #${o.issue} · ${esc(o.week.toUpperCase())}</div>
      <div style="padding:26px">
        <h1 style="font-size:24px;line-height:1.25;margin:0 0 16px;letter-spacing:-.5px">${esc(o.subject)}</h1>
        <p style="font-size:16px;line-height:1.6;color:#374151;margin:0 0 14px">This week's issue is ready. Here's what's inside:</p>
        ${o.headlines.map((h) => `<div style="border-left:4px solid #1F7A4D;background:#F4F7F5;border-radius:8px;padding:12px 14px;margin:10px 0;font-size:16px;font-weight:700;line-height:1.4">${esc(h)}</div>`).join('')}
        <p style="font-size:15px;color:#6b7280;margin:16px 0 0">+ Washington, bonds, gold and Bitcoin, next week's calendar and this week's money term explained.</p>
        <p style="margin:26px 0 6px"><a href="${o.url}" style="background:#1F7A4D;color:#fff;text-decoration:none;padding:15px 24px;border-radius:12px;font-weight:800;font-size:16px;display:inline-block">Read the full issue →</a></p>
      </div>
    </div>
    <p style="font-size:12px;color:#6b7280;line-height:1.6;margin-top:18px">You're getting this because you signed up for The Paper Trail's Weekly Investing Newsletter at papertrailwealth.com. General education, not financial advice.<br>
    <a href="${o.unsub}" style="color:#6b7280">Unsubscribe</a></p>
  </div></body></html>`;
}

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-key' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.headers.get('x-admin-key') !== Deno.env.get('NEWSLETTER_ADMIN_KEY')) return new Response('forbidden', { status: 403, headers: cors });
  const b = await req.json();
  const url = `${SITE}/newsletter/${b.slug}/?utm_source=newsletter&utm_medium=email`;
  const db = createClient(Deno.env.get('SUPABASE_URL')!, SERVICE_KEY);

  let list: string[];
  if (b.test_to) list = [b.test_to];
  else {
    const { data: sent } = await db.from('newsletter_sends').select('slug').eq('slug', b.slug).maybeSingle();
    if (sent) return new Response(JSON.stringify({ skipped: 'already sent' }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    const { data, error } = await db.from('newsletter_subscribers').select('email').eq('status', 'active');
    if (error) return new Response(error.message, { status: 500, headers: cors });
    list = (data ?? []).map((r) => r.email);
  }

  let sentCount = 0;
  for (let i = 0; i < list.length; i += 100) {
    const batch = await Promise.all(list.slice(i, i + 100).map(async (to) => {
      const unsub = `${FUNCTIONS_URL}/newsletter-unsubscribe?e=${encodeURIComponent(to)}&t=${await token(to)}`;
      return { from: FROM, to, subject: b.subject, reply_to: 'hello@papertrailwealth.com',
        html: teaserHtml({ issue: b.issue, week: b.week, subject: b.subject, headlines: b.headlines, url, unsub }),
        headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } };
    }));
    const res = await fetch('https://api.resend.com/emails/batch', { method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' }, body: JSON.stringify(batch) });
    if (!res.ok) return new Response(`Resend ${res.status}: ${await res.text()}`, { status: 502, headers: cors });
    sentCount += batch.length;
  }
  if (!b.test_to) await db.from('newsletter_sends').insert({ slug: b.slug, subject: b.subject, recipients: sentCount });
  return new Response(JSON.stringify({ sent: sentCount }), { headers: { ...cors, 'Content-Type': 'application/json' } });
});
