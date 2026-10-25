const { db, tg, round, tx, FV, C, ADMIN } = require('../lib/core');
const welcome = async chat => {
  const R = round(), P = R.prize, now = R.active ? 'This round' : 'Next round', ch = C.ch[0].replace('@', ''), proof = C.proof.replace('@', '');
  const when = R.n ? '' : `\n📅 <b>Round 1 starts ${new Date(C.start).toUTCString().slice(0, 16)}</b>`;
  const kb = { inline_keyboard: [[{ text: '🚀 Open App', web_app: { url: C.app } }], [{ text: '📢 Our Channel', url: 'https://t.me/' + ch }, { text: '✅ Payment Proof', url: 'https://t.me/' + proof }], ...(C.support ? [[{ text: '💬 Support', url: C.support }]] : [])] };
  const cap = `💎 <b>LEADERSHIP USDT</b>\n<i>Compete. Climb. Win real USDT every week.</i>\n\n🏆 Top 2 players win big USDT prizes\n🎁 Places 3 to 10 win ${C.top} USDT each\n⚡ Earn points with ads, tasks and invites\n🔒 Free to play · Paid in USDT (BEP20) · Public payment proof${when}\n\n👇 Tap <b>Open App</b> and start climbing!`;
  const r = await tg('sendPhoto', { chat_id: chat, photo: C.img || C.app + '/banner.png', caption: cap, parse_mode: 'HTML', reply_markup: kb });
  if (!r.ok) await tg('sendMessage', { chat_id: chat, text: cap, parse_mode: 'HTML', reply_markup: kb });
  await tg('sendMessage', { chat_id: chat, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: kb, text:
    `📖 <b>HOW IT WORKS</b>\n1️⃣ Open the app and join our 2 channels\n2️⃣ Earn points every day\n3️⃣ Finish in the Top 10 when the round ends and win USDT\n\n` +
    `💰 <b>HOW TO EARN POINTS</b>\n👥 Invite a friend: <b>+${C.inv}</b> each (no limit!)\n🎬 Watch an ad: <b>+${C.ad}</b> (up to ${C.adMax} every ${C.adHrs} hours)\n✅ Complete a task: <b>+${C.task}</b> each\n📅 Daily check-in: <b>+${C.ci}</b> and more with a streak\n🎁 Invite bonuses at ${Object.keys(C.ms).join(', ')} friends\n⚡ <b>${C.bx}x points</b> in the final ${C.bh} hours of every round\n\n` +
    `🏆 <b>PRIZES (${now})</b>\n🥇 1st place: <b>${P[0]} USDT</b>\n🥈 2nd place: <b>${P[1]} USDT</b>\n🎖 3rd to 10th: <b>${C.top} USDT</b> each\n📈 Prizes grow every round, up to ${C.max} USDT!\n\n` +
    `🗓 <b>SCHEDULE</b>\nRounds run Monday 00:00 to Friday 23:59 (UTC). The weekend is a countdown to the next round. Points reset every round, so everyone starts fresh.\n\n` +
    `🔒 <b>FAIR PLAY AND PAYMENTS</b>\n• One account per person. Cheating means removal\n• Winners get a message here and send a USDT (BEP20) address\n• Every payment is posted in the proof channel\n\n` +
    `🔔 You will get a message here for every reward, invite and round update.\n\nCommands: /start · /help` });
};

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
      if (c.startsWith('/start') || c === '/help') {
        await welcome(f);
      } else if (f === ADMIN && (c === '/flag' || c === '/unflag')) { // hide / restore a user on the leaderboard
        const ref = db.doc('users/' + id), u = (await ref.get()).data();
        if (u) { u.flagged = c === '/flag'; await ref.update({ flagged: u.flagged }); await tx(round(), u, () => {}); }
        await tg('sendMessage', { chat_id: f, text: u ? `${c} ${id} done` : 'User not found' });
      } else if (f === ADMIN && c === '/paid') { // /paid <userId> <amount> <txHash>  -> posts proof to the channel
        const u = (await db.doc('users/' + id).get()).data(), amt = rest[0], hash = rest[1] || '';
        if (u) {
          await tg('sendMessage', { chat_id: C.proof, text: `✅ Payment sent\n👤 ${u.name}${u.un ? ' @' + u.un : ''}\n💰 ${amt} USDT (BEP20)\n🔗 ${hash}` });
          await tg('sendMessage', { chat_id: id, text: `✅ Your ${amt} USDT prize was sent. Check ${C.proof}.` });
          await db.doc('meta/stats').set({ paid: FV.increment(+amt || 0) }, { merge: true });
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
