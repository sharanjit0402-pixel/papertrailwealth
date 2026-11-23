// One-click unsubscribe link used in every email footer.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { SITE, unsubToken } from '../_shared/email.ts';

const page = (msg: string) => new Response(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:80px auto;padding:0 20px;color:#14171A"><h2>The Paper <span style="color:#1F7A4D">Trail</span></h2><p style="font-size:18px">${msg}</p><p><a href="${SITE}/challenges/" style="color:#1F7A4D;font-weight:700">Back to my challenges</a></p></body>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const u = url.searchParams.get('u') ?? '', t = url.searchParams.get('t') ?? '';
  if (!u || t !== await unsubToken(u)) return page('This unsubscribe link is invalid or expired.');
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  await admin.from('profiles').update({ email_opt_in: false }).eq('id', u);
  return page("You're unsubscribed from challenge emails. Your progress is still saved, and you can keep using your challenges anytime.");
});
