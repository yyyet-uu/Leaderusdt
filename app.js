const { db, tg, round, auth, joined, tx, mult, C, ADMIN, DAY } = require('../lib/core');
const WIN = C.adHrs * 36e5;
let TC = { t: 0, v: [] };
const tasks = async () => {
  if (Date.now() - TC.t > 6e4) { const s = await db.collection('tasks').where('status', '==', 'active').limit(50).get(); TC = { t: Date.now(), v: s.docs.map(d => ({ id: d.id, ...d.data() })) }; }
  return TC.v;
};
const top = async n => (await db.collection(`rounds/${n}/p`).where('score', '>=', 1e6).orderBy('score', 'desc').limit(100).get()).docs.map(d => { const p = d.data(); return { name: p.name, un: p.un, photo: p.photo, pts: p.pts }; });
const past = async () => (await db.collection('rounds').orderBy('n', 'desc').limit(6).get()).docs.map(d => d.data()).filter(r => r.winners).map(r => ({ n: r.n, winners: r.winners.map(({ name, un, usdt }) => ({ name, un, usdt })) }));

module.exports = async (req, res) => {
  try {
    if (!db || !process.env.BOT_TOKEN) throw 'Server is not configured: add the environment variables in Vercel, then redeploy.';
    const R = round();
    if (req.method === 'GET') { res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=30'); return res.json(req.query.w ? { rounds: await past() } : { top: await top(R.n) }); }
    const b = req.body || {}, tu = auth(b.initData), id = String(tu.id), uref = db.doc('users/' + id);
    let u = (await uref.get()).data();
    if (!u) {
      const sp = new URLSearchParams(b.initData).get('start_param') || '', ref = /^ref_\d+$/.test(sp) && sp.slice(4) !== id ? sp.slice(4) : '';
      u = { id, name: tu.first_name || 'User', un: tu.username || '', photo: tu.photo_url || '', ver: false, flagged: false, ref, at: Date.now() };
      await uref.set(u);
      if (ref) await db.doc(`users/${ref}/inv/${id}`).set({ name: u.name, ver: false, pts: 0, at: u.at });
    }
    if (!(await joined(id))) return res.json({ gate: C.ch }); // re-checked on every open
    if (!u.ver) {
      u.ver = true; await uref.update({ ver: true });
      const iu = u.ref && (await db.doc('users/' + u.ref).get()).data();
      if (iu) { // invite counts only after channels joined + app opened, and only while a round is live
        let g = 0;
        if (R.active) g = (await tx(R, iu, p => { const inv = p.inv + 1; return { add: C.inv + (C.ms[inv] || 0), set: { inv } }; })).gain;
        await db.doc(`users/${u.ref}/inv/${id}`).set({ name: u.name, ver: true, pts: g, at: u.at });
        await tg('sendMessage', { chat_id: u.ref, text: `🎉 ${u.name} joined with your link!` + (g ? ` +${g} points` : '') });
      }
    }
    const a = b.a; let p;
    if (a === 'ad') {
      p = await tx(R, u, p => {
        if (!R.active) throw 'Round is not active.';
        const now = Date.now(), fresh = now - p.adWin >= WIN, ads = fresh ? 0 : p.ads;
        if (ads >= C.adMax) throw 'Ad limit reached. Wait for the countdown.';
        if (now - p.adAt < C.adGap * 1e3) throw 'Please wait a few seconds.';
        return { add: C.ad, set: { ads: ads + 1, adWin: fresh ? now : p.adWin, adAt: now } };
      });
    } else if (a === 'task') {
      const t = (await tasks()).find(x => x.id === b.id); if (!t) throw 'Task not found.';
      p = await tx(R, u, p => {
        if (!R.active) throw 'Round is not active.';
        const s = p.tasks[t.id], now = Date.now();
        if (s === -1) throw 'Already completed.';
        if (b.step === 'start') return { set: { tasks: { ...p.tasks, [t.id]: now } } };
        if (!s || now - s < C.wait * 1e3) throw `Open the task and wait ${C.wait} seconds.`;
        return { add: C.task, set: { tasks: { ...p.tasks, [t.id]: -1 } } };
      });
    } else if (a === 'checkin') {
      p = await tx(R, u, p => {
        if (!R.active) throw 'Round is not active.';
        const d = Math.floor(Date.now() / DAY);
        if (p.ciDay === d) throw 'You already checked in today.';
        const s = p.ciDay === d - 1 ? p.streak + 1 : 1; // streak bonus: +10 per extra day, up to +60
        return { add: C.ci + 10 * Math.min(s - 1, 6), set: { ciDay: d, streak: s } };
      });
    } else if (a === 'addtask') {
      const title = String(b.title || '').trim().slice(0, 60), url = String(b.url || '').trim(), adm = id === ADMIN;
      if (!title || !/^https:\/\/\S+$/.test(url)) throw 'Enter a title and an https:// link.';
      const cur = (await db.doc(`rounds/${R.n}/p/${id}`).get()).data();
      if (!adm && (!cur || cur.pts < C.cost)) throw `You need ${C.cost.toLocaleString('en-US')} points to add a task.`;
      const ref = await db.collection('tasks').add({ title, url, by: id, status: adm ? 'active' : 'pending', at: Date.now() });
      TC.t = 0;
      if (!adm) await tg('sendMessage', { chat_id: ADMIN, text: `New task from ${u.name} (${id})\n${title}\n${url}`, reply_markup: { inline_keyboard: [[{ text: '✅ Approve', callback_data: 'ok_' + ref.id }, { text: '❌ Reject', callback_data: 'no_' + ref.id }]] } });
      return res.json({ ok: 1 });
    } else if (a === 'friends') {
      return res.json({ friends: (await db.collection(`users/${id}/inv`).orderBy('at', 'desc').limit(100).get()).docs.map(d => d.data()) });
    } else p = (await db.doc(`rounds/${R.n}/p/${id}`).get()).data();
    p = p || { pts: 0, ads: 0, adAt: 0, adWin: 0, tasks: {}, inv: 0, streak: 0, ciDay: 0, score: 0 };
    const d = Math.floor(Date.now() / DAY), rank = p.pts > 0 && !u.flagged ? (await db.collection(`rounds/${R.n}/p`).where('score', '>', p.score).count().get()).data().count + 1 : null;
    res.json({ R, name: u.name, pts: p.pts, gain: p.gain || 0, rank, inv: p.inv, admin: id === ADMIN, boost: mult(R) > 1, ci: p.ciDay === d, streak: p.ciDay >= d - 1 ? p.streak : 0,
      adsLeft: Date.now() - p.adWin >= WIN ? C.adMax : C.adMax - p.ads, adsReset: p.adWin + WIN,
      tasks: (await tasks()).map(t => ({ id: t.id, title: t.title, url: t.url, done: p.tasks[t.id] === -1 })), link: `https://t.me/${C.user}?startapp=ref_${id}`,
      cfg: { zone: C.zone, inv: C.inv, ad: C.ad, task: C.task, ci: C.ci, adMax: C.adMax, cost: C.cost, wait: C.wait, bx: C.bx, ms: C.ms, top: C.top, support: C.support } });
  } catch (e) {
    if (typeof e !== 'string') console.error(e);
    res.status(400).json({ error: typeof e === 'string' ? e : 'Something went wrong. Try again.' });
  }
};
