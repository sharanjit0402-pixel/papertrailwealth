// Shared email helpers (Resend + branded template + unsubscribe links).
export const SITE = Deno.env.get('SITE_URL') ?? 'https://papertrailwealth.com';
const FROM = 'The Paper Trail <hello@papertrailwealth.com>';
const FUNCTIONS_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1`;

export const NAMES: Record<string, string> = {
  '52-week': 'The 52-Week Challenge',
  'emergency-fund': 'The $1,000 Safety Net',
  'savings-streak': 'The Savings Streak',
};
export const money = (n: number) => '$' + (Math.round(n * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });

async function hmac(text: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(Deno.env.get('UNSUB_SECRET') ?? 'change-me'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
export const unsubToken = (userId: string) => hmac('unsub:' + userId);
export async function unsubUrl(userId: string) { return `${FUNCTIONS_URL}/unsubscribe?u=${userId}&t=${await unsubToken(userId)}`; }

export function layout(opts: { title: string; body: string; cta?: { text: string; url: string }; unsub: string }) {
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

export async function send(to: string, subject: string, html: string, unsub: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, html, reply_to: 'hello@papertrailwealth.com', headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}
