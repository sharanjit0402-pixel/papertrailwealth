// Runs automatically once a day (scheduled with pg_cron, see SETUP.md).
// Sends: streak reminders, milestone emails, weekly progress (Sundays)
// and a one-time "we miss you" after 14 quiet days.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { NAMES, SITE, layout, money, send, unsubUrl } from '../_shared/email.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const TZ = 'America/New_York'; // reminders are timed for US evenings
const dayKey = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD
const STREAK_MILES = [7, 30, 100, 365];
const FUND_MILES = [500, 1000];

function streak(days: Set<string>) {
  const d = new Date(); let n = 0;
  if (!days.has(dayKey(d))) d.setUTCDate(d.getUTCDate() - 1);
  while (days.has(dayKey(d))) { n++; d.setUTCDate(d.getUTCDate() - 1); }
  return n;
}

async function once(userId: string, key: string) {
  const { error } = await admin.from('email_log').insert({ user_id: userId, key });
  return !error; // false if it was already sent
}

Deno.serve(async (req) => {
  if (req.headers.get('Authorization') !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` && req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) {
    return new Response('unauthorized', { status: 401 });
  }
  const today = dayKey(new Date());
  const isSunday = new Date().toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short' }) === 'Sun';
  const { data: people } = await admin.from('profiles').select('id, email, name').eq('email_opt_in', true);
  let sent = 0; const errors: string[] = [];

  for (const p of people ?? []) {
    try {
      const [{ data: enr }, { data: logs }] = await Promise.all([
        admin.from('enrollments').select('challenge, settings, started_at').eq('user_id', p.id),
        admin.from('logs').select('challenge, ref, kind, amount, created_at').eq('user_id', p.id),
      ]);
      if (!enr?.length) continue;
      const unsub = await unsubUrl(p.id);
      const hi = p.name ? `Hi ${p.name},` : 'Hi there,';
      const by = (c: string) => (logs ?? []).filter((l) => l.challenge === c);
      const total = (c: string) => by(c).reduce((t, l) => t + (l.kind === 'withdraw' ? -Number(l.amount) : Number(l.amount)), 0);
      const lastActive = Math.max(new Date(enr[0].started_at).getTime(), ...(logs ?? []).map((l) => new Date(l.created_at).getTime()));
      const quietDays = Math.floor((Date.now() - lastActive) / 864e5);
      const mail = async (subject: string, title: string, body: string, path: string) => {
        await send(p.email, subject, layout({ title, body: `<p>${hi}</p>${body}`, cta: { text: 'Open my challenge', url: `${SITE}/challenges/${path}/` }, unsub }), unsub);
        sent++;
      };

      for (const e of enr) {
        const c = e.challenge;
        if (c === 'savings-streak') {
          const days = new Set(by(c).map((l) => l.ref));
          const n = streak(days);
          const m = STREAK_MILES.filter((x) => n >= x).pop();
          if (m && await once(p.id, `streak-${m}`)) {
            await mail(`🏅 ${m}-day savings streak!`, `${m} days in a row. That's a real habit.`, `<p>You've saved every single day for <b>${m} days</b>, ${money(total(c))} in total. Most people quit in week one. You didn't.</p>`, 'savings-streak');
          } else if (n > 0 && !days.has(today) && await once(p.id, `reminder:${today}`)) {
            await mail(`🔥 Don't lose your ${n}-day streak`, `Your ${n}-day streak ends at midnight`, `<p>You haven't logged today yet. Save something, even $1, and tap <b>"I saved today"</b> to keep it alive.</p>`, 'savings-streak');
          }
        }
        if (c === 'emergency-fund') {
          const bal = total(c);
          const m = FUND_MILES.filter((x) => bal >= x).pop();
          if (m && await once(p.id, `fund-${m}`)) {
            await mail(`🛟 You hit ${money(m)}!`, `Your safety net just hit ${money(m)}`, m === 1000
              ? `<p>That's your full <b>starter emergency fund</b>. A surprise car repair or vet bill no longer has to go on a credit card. Next stop: one month of expenses.</p>`
              : `<p>Halfway to your $1,000 starter fund. Keep going.</p>`, 'emergency-fund');
          }
        }
        if (c === '52-week') {
          const n = by(c).length;
          const m = [13, 26, 39, 52].filter((x) => n >= x).pop();
          if (m && await once(p.id, `weeks-${m}`)) {
            await mail(m === 52 ? '🎉 52 weeks. $1,378.' : `🏅 ${m} weeks done`, m === 52 ? 'You finished the 52-Week Challenge!' : `${m} of 52 weeks complete`, `<p>You've saved <b>${money(total(c))}</b> so far. ${m === 52 ? 'A full year of saving. Be proud of this one.' : 'Every week the habit gets easier.'}</p>`, '52-week');
          }
        }
      }

      if (isSunday && quietDays < 14 && await once(p.id, `weekly:${today}`)) {
        const lines = enr.map((e) => `<li><b>${NAMES[e.challenge]}</b>: ${money(total(e.challenge))} saved${e.challenge === '52-week' ? `, ${by('52-week').length}/52 weeks` : ''}${e.challenge === 'savings-streak' ? `, ${streak(new Set(by('savings-streak').map((l) => l.ref)))}-day streak` : ''}</li>`).join('');
        const grand = enr.reduce((t, e) => t + total(e.challenge), 0);
        await mail(`Your week in savings: ${money(grand)} so far`, 'Your weekly savings check-in', `<ul>${lines}</ul><p>Set a small goal for this week and log it as you go.</p>`, enr[0].challenge);
      }

      if (quietDays === 14 && await once(p.id, `winback:${today}`)) {
        await mail('Your savings challenge misses you', "It's not too late to pick it back up", `<p>It's been two weeks since your last check-in. No guilt: just log one small save today and you're back in. You've already saved <b>${money(enr.reduce((t, e) => t + total(e.challenge), 0))}</b>.</p>`, enr[0].challenge);
      }
    } catch (err) { errors.push(`${p.id}: ${err}`); }
  }
  return new Response(JSON.stringify({ sent, errors }), { headers: { 'Content-Type': 'application/json' } });
});
