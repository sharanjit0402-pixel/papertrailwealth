// Sends a welcome email the first time someone joins a challenge.
// Called by the website right after they join (with their login token).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { NAMES, SITE, layout, send, unsubUrl } from '../_shared/email.ts';

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
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response('unauthorized', { status: 401, headers: cors });
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
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
