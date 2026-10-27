const admin = require('firebase-admin'), crypto = require('crypto');
const E = process.env; let db;
try { if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(E.FIREBASE_SERVICE_ACCOUNT)) }); db = admin.firestore(); } catch (e) { console.error('Firebase init failed:', e.message); }
const FV = admin.firestore.FieldValue;
const num = (k, d) => (E[k] !== undefined && E[k] !== '' && !isNaN(+E[k]) ? +E[k] : d);
const list = (k, d) => (E[k] || d).split(',').map(s => s.trim()).filter(Boolean);
const BOT = E.BOT_TOKEN, ADMIN = (E.ADMIN_ID || '').trim(), DAY = 864e5, WEEK = 7 * DAY;
// Every value below can be changed with an environment variable (see SETUP.md)
const C = {
  user: (E.BOT_USERNAME || 'Leaderusdt_bot').replace('@', ''), proof: E.PROOF_CHANNEL || '@leaderpaymemtproof',
  ch: list('REQUIRED_CHANNELS', '@leader_usdt_boot,@leaderpaymemtproof'),
  start: Date.parse(E.START_DATE || '2026-11-09T00:00:00Z'), rc: 'r' + (E.START_DATE || '2026-11-09').replace(/\D/g, '').slice(0, 8), // start must be a Monday 00:00 UTC; rc = data folder, so a new START_DATE means a fresh competition
  launch: Date.parse(E.LAUNCH_DATE || '2026-10-30T00:00:00Z'), lend: Date.parse(E.LAUNCH_END || '2026-11-07T00:00:00Z'), // launch round: Fri Oct 30 to Fri Nov 6 (ends Sat 00:00 UTC)
  inv: num('INVITE_POINTS', 500), ad: num('AD_POINTS', 100), task: num('TASK_POINTS', 200), ci: num('CHECKIN_POINTS', 50),
  adEach: num('ADS_PER_PLATFORM', 15), oc: E.ONCLICK_SPOT_ID || '', adMax: num('ADS_PER_PLATFORM', 15) * (E.ONCLICK_SPOT_ID ? 2 : 1), adHrs: num('ADS_WINDOW_HOURS', 12), adGap: num('AD_MIN_GAP_SECONDS', 15),
  cost: num('TASK_COST_POINTS', 50000), wait: num('TASK_WAIT_SECONDS', 5),
  bx: num('BOOST_MULTIPLIER', 2), bh: num('BOOST_LAST_HOURS', 24),
  ms: Object.fromEntries(list('INVITE_MILESTONES', '5:500,10:1500,25:5000').map(x => x.split(':').map(Number))),
  r1: list('PRIZE_ROUND1', '20,10').map(Number), r2: list('PRIZE_ROUND2', '20,10').map(Number),
  step: num('PRIZE_STEP', 0), max: num('PRIZE_MAX', 50), top: num('PRIZE_3_TO_10', 2),
  wid: E.ADEXIUM_WID || 'c0ecf862-f43e-406c-8b2d-0e887fde2fec', nf: E.NOTIFY_ACTIVITY !== '0', support: E.SUPPORT_URL || '', app: (E.APP_URL || '').replace(/\/+$/, ''), img: E.WELCOME_IMAGE || '', batch: num('BROADCAST_BATCH', 600)
};
// Round 1 = PRIZE_ROUND1, Round 2 = PRIZE_ROUND2, then + PRIZE_STEP per round for both places, capped at PRIZE_MAX
const prizes = n => n <= 1 ? C.r1 : [0, 1].map(i => Math.min(C.max, C.r2[i] + C.step * (n - 2)));

const ladder = n => [0, 1, 2, 3].map(i => ({ n: n + i, p: prizes(n + i) }));

function round(now = Date.now()) { // Round 1 = launch round, then Monday rounds every week (Mon 00:00 to Sat 00:00 UTC)
  if (now < C.launch) return { n: 0, active: false, start: C.launch, next: C.launch, prize: prizes(1) };
  if (now < C.lend) return { n: 1, active: true, start: C.launch, ends: C.lend, next: C.start, prize: prizes(1) };
  if (now < C.start) return { n: 1, active: false, start: C.launch, ends: C.lend, next: C.start, prize: prizes(2) };
  const k = Math.floor((now - C.start) / WEEK), s = C.start + k * WEEK, active = now < s + 5 * DAY;
  return { n: k + 2, active, start: s, ends: s + 5 * DAY, next: s + WEEK, prize: prizes(active ? k + 2 : k + 3) };
}
const mult = R => (R.active && R.ends - Date.now() <= C.bh * 36e5 ? C.bx : 1); // points boost in the last hours of a round

const tg = (m, b) => fetch(`https://api.telegram.org/bot${BOT}/${m}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json()).catch(() => ({}));

const notify = (uid, text) => (C.nf ? tg('sendMessage', { chat_id: uid, text }) : null);

async function joined(uid) {
  for (const c of C.ch) {
    const r = await tg('getChatMember', { chat_id: c, user_id: uid });
    if (!r.ok || !['member', 'administrator', 'creator'].includes(r.result.status)) return false;
  }
  return true;
}

function auth(initData) {
  const p = new URLSearchParams(initData || ''), hash = p.get('hash');
  p.delete('hash');
  const str = [...p.entries()].map(([k, v]) => k + '=' + v).sort().join('\n');
  const key = crypto.createHmac('sha256', 'WebAppData').update(BOT || '').digest();
  if (!hash || crypto.createHmac('sha256', key).update(str).digest('hex') !== hash || Date.now() / 1e3 - +p.get('auth_date') > 86400) throw 'Invalid session. Reopen the app from Telegram.';
  return JSON.parse(p.get('user'));
}

// Atomic points update. score = pts*1e6 + (1e6 - secondsIntoRound): more points win, earlier wins ties. Flagged users get -1 (hidden).
async function tx(R, u, fn) {
  const ref = db.doc(`${C.rc}/${R.n}/p/${u.id}`);
  return db.runTransaction(async t => {
    const s = await t.get(ref), p = s.exists ? s.data() : { pts: 0, ads: 0, adAt: 0, adWin: 0, tasks: {}, inv: 0, streak: 0, ciDay: 0 };
    const r = fn(p) || {}, add = r.add > 0 ? Math.round(r.add * mult(R)) : (r.add || 0), pts = p.pts + add, secs = Math.max(0, Math.min(999999, Math.floor((Date.now() - R.start) / 1e3)));
    const n = { ...p, ...r.set, pts, score: u.flagged ? -1 : pts * 1e6 + 1e6 - secs, name: u.name, un: u.un || '', photo: u.photo || '' };
    t.set(ref, n);
    return { ...n, gain: add };
  });
}
module.exports = { db, tg, round, prizes, auth, joined, tx, mult, notify, ladder, FV, C, ADMIN, DAY };
