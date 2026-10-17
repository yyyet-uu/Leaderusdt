const { db, tg, round, tx, C, ADMIN } = require('../lib/core');
module.exports = async (req, res) => {
  if (req.headers['x-telegram-bot-api-secret-token'] !== process.env.WEBHOOK_SECRET) return res.status(401).end();
  const { message: m, callback_query: cq } = req.body || {};
  try {
    if (cq && String(cq.from.id) === ADMIN) { // approve / reject user-submitted tasks
      const [act, id] = cq.data.split('_'), ref = db.doc('tasks/' + id), t = (await ref.get()).data();
      if (t && t.status === 'pending') {
        let ok = act === 'ok';
        if (ok) { const u = (await db.doc('users/' + t.by).get()).data(); try { await tx(round(), u, p => { if (p.pts < C.cost) throw 1; return { add: -C.cost }; }); } catch { ok = false; } }
        await ref.update({ status: ok ? 'active' : 'rejected' });
        await tg('sendMessage', { chat_id: t.by, text: ok ? '✅ Your task is live. The points were used.' : '❌ Your task was not approved. No points were taken.' });
      }
      await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Done' });
    } else if (m && m.text) {
      const f = String(m.from.id), x = m.text.trim(), [c, id, ...rest] = x.split(/\s+/);
      if (c.startsWith('/start')) {
        const cap = '💎 <b>Leadership USDT</b>\n\nWatch ads, finish tasks and invite friends to climb the leaderboard. The top players win real USDT every round.\n\n🗓 Rounds run Monday to Friday. Points reset every round.';
        const kb = { inline_keyboard: [[{ text: '🚀 Open App', web_app: { url: C.app } }]] };
        if (C.img) await tg('sendPhoto', { chat_id: f, photo: C.img, caption: cap, parse_mode: 'HTML', reply_markup: kb });
        else await tg('sendMessage', { chat_id: f, text: cap, parse_mode: 'HTML', reply_markup: kb });
      } else if (f === ADMIN && (c === '/flag' || c === '/unflag')) { // hide / restore a user on the leaderboard
        const ref = db.doc('users/' + id), u = (await ref.get()).data();
        if (u) { u.flagged = c === '/flag'; await ref.update({ flagged: u.flagged }); await tx(round(), u, () => {}); }
        await tg('sendMessage', { chat_id: f, text: u ? `${c} ${id} done` : 'User not found' });
      } else if (f === ADMIN && c === '/paid') { // /paid <userId> <amount> <txHash>  -> posts proof to the channel
        const u = (await db.doc('users/' + id).get()).data(), amt = rest[0], hash = rest[1] || '';
        if (u) {
          await tg('sendMessage', { chat_id: C.proof, text: `✅ Payment sent\n👤 ${u.name}${u.un ? ' @' + u.un : ''}\n💰 ${amt} USDT (BEP20)\n🔗 ${hash}` });
          await tg('sendMessage', { chat_id: id, text: `✅ Your ${amt} USDT prize was sent. Check @leaderpaymemtproof.` });
        }
      } else if (/^0x[a-fA-F0-9]{40}$/.test(x)) { // winner submits BEP20 wallet (only during the weekend after their round)
        const R = round(), ref = db.doc('users/' + f), u = (await ref.get()).data();
        if (u && u.win && !R.active && u.win.round === R.n && !u.win.wallet) {
          await ref.update({ 'win.wallet': x });
          await tg('sendMessage', { chat_id: ADMIN, text: `💰 Wallet received\n${u.name} @${u.un} (${f})\nRound ${u.win.round} prize: ${u.win.usdt} USDT\nBEP20: ${x}` });
          await tg('sendMessage', { chat_id: f, text: '✅ Address received. Your prize will be sent soon.' });
        }
      }
    }
  } catch (e) { console.error(e); }
  res.json({ ok: 1 });
};
