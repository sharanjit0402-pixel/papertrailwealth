// Challenge progress store.
// Works in two modes:
//  - on-device: progress lives in localStorage (no account needed)
//  - account:   once Supabase is configured and the visitor signs in with a
//               magic link, progress is saved to the database and synced.
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { SUPABASE } from '../site';

export type ChallengeId = '52-week' | 'emergency-fund' | 'savings-streak';
export type LogKind = 'week' | 'day' | 'save' | 'withdraw';
export interface Log { ref: string; kind: LogKind; amount: number; created_at: string; }
export interface Enrollment { settings: Record<string, any>; started_at: string; }
export interface ChallengeState { enrollment: Enrollment | null; logs: Log[]; }

export const CHALLENGES: ChallengeId[] = ['52-week', 'emergency-fund', 'savings-streak'];
const LS = (c: ChallengeId) => `ptw:challenge:${c}`;
const empty = (): ChallengeState => ({ enrollment: null, logs: [] });

export const backendReady = !!(SUPABASE.url && SUPABASE.anonKey);
let sb: SupabaseClient | null = null;
if (backendReady) {
  sb = createClient(SUPABASE.url, SUPABASE.anonKey, {
    auth: { flowType: 'implicit', persistSession: true, detectSessionInUrl: true, autoRefreshToken: true },
  });
}

// ---------- local ----------
function readLocal(c: ChallengeId): ChallengeState {
  try { return JSON.parse(localStorage.getItem(LS(c)) || '') as ChallengeState; } catch { return empty(); }
}
function writeLocal(c: ChallengeId, s: ChallengeState) {
  try { localStorage.setItem(LS(c), JSON.stringify(s)); } catch { /* storage blocked */ }
}

// ---------- auth ----------
let currentUser: User | null = null;
const listeners = new Set<(u: User | null) => void>();
export function onUser(cb: (u: User | null) => void) { listeners.add(cb); cb(currentUser); return () => listeners.delete(cb); }

let _ready: Promise<User | null> | null = null;
/** Resolves once the visitor's login state is known (call before load()). */
export function ready() { return (_ready ??= initAuth().catch(() => null)); }

async function initAuth() {
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  currentUser = data.session?.user ?? null;
  if (currentUser) await migrateLocal();
  listeners.forEach((l) => l(currentUser));
  sb.auth.onAuthStateChange(async (_e, session) => {
    const was = currentUser?.id;
    currentUser = session?.user ?? null;
    if (currentUser && currentUser.id !== was) await migrateLocal();
    listeners.forEach((l) => l(currentUser));
  });
  return currentUser;
}

export async function signIn(email: string, name: string, optIn: boolean) {
  if (!sb) throw new Error('Accounts are not switched on yet.');
  const redirect = location.origin + location.pathname;
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirect, data: { name, email_opt_in: optIn } },
  });
  if (error) throw error;
}
export async function signOut() { if (sb) await sb.auth.signOut(); }

// Upload anything saved on this device before the visitor signed in.
async function migrateLocal() {
  if (!sb || !currentUser) return;
  for (const c of CHALLENGES) {
    const local = readLocal(c);
    if (!local.enrollment) continue;
    const { data: existing } = await sb.from('enrollments').select('id').eq('challenge', c).maybeSingle();
    if (!existing) {
      await sb.from('enrollments').insert({ user_id: currentUser.id, challenge: c, settings: local.enrollment.settings, started_at: local.enrollment.started_at });
      if (local.logs.length) {
        await sb.from('logs').upsert(local.logs.map((l) => ({ user_id: currentUser!.id, challenge: c, ...l })), { onConflict: 'user_id,challenge,ref', ignoreDuplicates: true });
      }
    }
    localStorage.removeItem(LS(c));
  }
}

// ---------- data ----------
export async function load(c: ChallengeId): Promise<ChallengeState> {
  if (!sb || !currentUser) return readLocal(c);
  const [{ data: e }, { data: logs }] = await Promise.all([
    sb.from('enrollments').select('settings, started_at').eq('challenge', c).maybeSingle(),
    sb.from('logs').select('ref, kind, amount, created_at').eq('challenge', c).order('created_at', { ascending: true }),
  ]);
  return { enrollment: (e as Enrollment) ?? null, logs: ((logs as Log[]) ?? []).map((l) => ({ ...l, amount: Number(l.amount) })) };
}

export async function enroll(c: ChallengeId, settings: Record<string, any>) {
  const started_at = new Date().toISOString();
  if (!sb || !currentUser) {
    const s = readLocal(c); s.enrollment = { settings, started_at: s.enrollment?.started_at ?? started_at }; writeLocal(c, s); return;
  }
  const { data: existing } = await sb.from('enrollments').select('id').eq('challenge', c).maybeSingle();
  if (existing) await sb.from('enrollments').update({ settings }).eq('challenge', c);
  else {
    await sb.from('enrollments').insert({ user_id: currentUser.id, challenge: c, settings, started_at });
    sb.functions.invoke('welcome', { body: { challenge: c } }).catch(() => {});
  }
}

export async function addLog(c: ChallengeId, log: Omit<Log, 'created_at'>) {
  const row = { ...log, created_at: new Date().toISOString() };
  if (!sb || !currentUser) {
    const s = readLocal(c); s.logs = s.logs.filter((l) => l.ref !== log.ref); s.logs.push(row); writeLocal(c, s); return;
  }
  await sb.from('logs').upsert({ user_id: currentUser.id, challenge: c, ...row }, { onConflict: 'user_id,challenge,ref' });
}

export async function removeLog(c: ChallengeId, ref: string) {
  if (!sb || !currentUser) { const s = readLocal(c); s.logs = s.logs.filter((l) => l.ref !== ref); writeLocal(c, s); return; }
  await sb.from('logs').delete().eq('challenge', c).eq('ref', ref);
}

export async function resetChallenge(c: ChallengeId) {
  if (!sb || !currentUser) { writeLocal(c, empty()); return; }
  await sb.from('logs').delete().eq('challenge', c);
  await sb.from('enrollments').delete().eq('challenge', c);
}

// ---------- helpers ----------
export const money = (n: number) => '$' + (Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
export const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function streakInfo(days: string[]) {
  const set = new Set(days);
  const d = new Date();
  let current = 0;
  if (!set.has(todayKey(d))) d.setDate(d.getDate() - 1); // streak still alive until tonight
  while (set.has(todayKey(d))) { current++; d.setDate(d.getDate() - 1); }
  const sorted = [...set].sort();
  let longest = 0, run = 0, prev: Date | null = null;
  for (const k of sorted) {
    const [y, m, dd] = k.split('-').map(Number); const cur = new Date(y, m - 1, dd);
    run = prev && Math.round((cur.getTime() - prev.getTime()) / 864e5) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run); prev = cur;
  }
  return { current, longest, doneToday: set.has(todayKey()) };
}
