const { db, tg, round, prizes, C, ADMIN } = require('../lib/core');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const job = async (id, text) => { try { await db.doc('jobs/' + C.rc + '_' + id).create({ text, done: false, last: '', sent: 0 }); } catch {} }; // create() fails if it exists = queued once

async function finish(k, rr) { // pick winners of an ended round
  const s = await db.collection(`${C.rc}/${k}/p`).where('score', '>=', 1e6).orderBy('score', 'desc').limit(10).get(), pz = prizes(k);
  const w = s.docs.map((d, i) => { const p = d.data(); return { id: d.id, name: p.name, un: p.un, pts: p.pts, usdt: i < 2 ? pz[i] : C.top }; });
  if (w.length < 2) return rr.set({ n: k, done: true, skipped: true }); // fewer than 2 players: no prizes
  await rr.set({ n: k, done: true, winners: w });
  for (const [i, x] of w.entries()) {
    await db.doc('users/' + x.id).update({ win: { round: k, usdt: x.usdt } });
    await tg('sendMessage', { chat_id: x.id, text: `🏆 You finished #${i + 1} in Round ${k} and won ${x.usdt} USDT!\n\nReply with your USDT (BEP20) wallet address before the next round starts.` });
  }
  const line = x => `${x.name}${x.un ? ' @' + x.un : ''}`;
  await tg('sendMessage', { chat_id: ADMIN, text: `🏆 Round ${k} winners\n` + w.map((x, i) => `${i + 1}. ${line(x)} (${x.id}) - ${x.pts} pts - ${x.usdt} USDT`).join('\n') + '\n\nWallets will arrive here. Pay, then: /paid <userId> <amount> <txHash>' });
  await tg('sendMessage', { chat_id: C.proof, text: `🏆 Round ${k} winners\n` + w.map((x, i) => `${i + 1}. ${line(x)} - ${x.usdt} USDT`).join('\n') + '\n\nPayment proof will be posted here.' });
  await job('end_' + k, `🏁 Round ${k} is over! See the winners in the app. Next round starts Monday with prizes of ${prizes(k + 1).join(' / ')} USDT.`);
}

module.exports = async (req, res) => { // runs every 5 minutes
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).end();
  try {
    const R = round(), k = R.active ? R.n - 1 : R.n;
    if (k >= 1) { const rr = db.doc(C.rc + '/' + k); if (!((await rr.get()).data() || {}).done) await finish(k, rr); }
    if (R.active) {
      await job('start_' + R.n, `🚀 Round ${R.n} is live! Prizes: ${R.prize[0]} / ${R.prize[1]} USDT. Earn points now.`);
      if (R.ends - Date.now() <= C.bh * 36e5) await job('soon_' + R.n, `⏰ Final ${C.bh} hours of Round ${R.n}! ${C.bx}x points are active. Climb the board now.`);
    }
    const q = await db.collection('jobs').where('done', '==', false).limit(1).get(); // send one broadcast in batches
    if (!q.empty) {
      const ref = q.docs[0].ref, j = q.docs[0].data();
      let uq = db.collection('users').orderBy('__name__').limit(C.batch); if (j.last) uq = uq.startAfter(j.last);
      const us = await uq.get();
      if (us.empty) await ref.update({ done: true });
      else {
        const ids = us.docs.filter(d => d.data().ver).map(d => d.id), kb = { inline_keyboard: [[{ text: '🚀 Open App', web_app: { url: C.app } }]] };
        for (let i = 0; i < ids.length; i += 25) { await Promise.all(ids.slice(i, i + 25).map(c => tg('sendMessage', { chat_id: c, text: j.text, reply_markup: kb }))); await sleep(1000); }
        await ref.update({ last: us.docs[us.docs.length - 1].id, sent: j.sent + ids.length });
      }
    }
    res.json({ ok: 1 });
  } catch (e) { console.error(e); res.status(500).json({ error: 1 }); }
};
