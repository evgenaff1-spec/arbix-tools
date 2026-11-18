// Support bot (Telegram webhook). Students write to the bot in private chat,
// every message is copied to the curators' support group with the student's id.
// A curator REPLIES to that message in the group, and the bot delivers the reply
// back to the student. No database needed: the student id lives in the message itself.
//
// Homework: the student sends a screenshot/file/text with the caption "/dz <stage>".
// It lands in the curators' group with buttons "✅ Зараховано" / "🔁 Доробити".
//
// Env: BOT_TOKEN, SUPPORT_CHAT_ID (curators' group id), CRON_SECRET (also used as webhook secret).
// Access: only members of the students' group (STUDENTS_CHAT_ID, default ARBI SCHOOL) can use the bot.
// The bot must be a member (better admin) of that group.
// Optional: SUPPORT_THREAD_ID (topic id, if the curators' group has topics).
// One-time setup: open /api/support?setup=1&key=<CRON_SECRET>
import { tg, esc, hasAccess, supportTarget } from '../lib/tg.js';

import SUPPORT from '../lib/support-config.js';

const cfg = () => SUPPORT;
const TAG = /🆔\s*(\d{4,})/;
const DZ = /^\/dz(?:@\w+)?(?:\s+(\d{1,2}))?\s*([\s\S]*)$/i;
const fill = (t, h) => String(t || '').replace('{stage}', h.stage).replace('{stage}', h.stage).replace('{title}', h.title);

function header(from, title = '📩') {
  const name = esc([from.first_name, from.last_name].filter(Boolean).join(' ') || 'Учень');
  const user = from.username ? ` · @${esc(from.username)}` : '';
  return `${title}${title.endsWith('\n') ? '' : ' '}<a href="tg://user?id=${from.id}">${name}</a>${user}\n🆔 ${from.id}`;
}
function menu(c) {
  const rows = c.faq.map(f => [{ text: f.button, callback_data: `faq:${f.id}` }]);
  if (c.homework?.length) rows.unshift([{ text: '📝 Домашні завдання', callback_data: 'hw' }]);
  if (c.appUrl) rows.unshift([{ text: '📊 Відкрити ARBI X Tools', web_app: { url: c.appUrl } }], [{ text: '🎯 Тренажер', web_app: { url: c.appUrl.replace(/\/$/, '') + '/?tab=trainer' } }, { text: '🎓 Іспит', web_app: { url: c.appUrl.replace(/\/$/, '') + '/?tab=exam' } }]);
  rows.push([{ text: '✍️ Написати куратору', callback_data: 'ask' }]);
  return { inline_keyboard: rows };
}
function noAccess(chatId, c) {
  const mgr = (c.manager || '').replace(/^@/, '');
  return tg('sendMessage', {
    chat_id: chatId, text: (c.noAccess || 'Немає доступу.').replace('{manager}', c.manager || ''),
    reply_markup: mgr && mgr !== 'your_manager' ? { inline_keyboard: [[{ text: '💬 Написати менеджеру', url: `https://t.me/${mgr}` }]] } : undefined,
  });
}
const doneKb = id => ({ inline_keyboard: [[{ text: '✅ Вирішено', callback_data: `done:${id}` }]] });
const hwKb = (id, s) => ({ inline_keyboard: [[{ text: '✅ Зараховано', callback_data: `hwok:${id}:${s}` }, { text: '🔁 Доробити', callback_data: `hwre:${id}:${s}` }]] });
const hasMedia = m => !!(m.photo || m.document || m.video || m.voice || m.audio || m.animation);

// ---- homework ----
function hwList(chatId, c) {
  const rows = [];
  for (let i = 0; i < c.homework.length; i += 2)
    rows.push(c.homework.slice(i, i + 2).map(h => ({ text: `${h.stage}. ${h.title}`, callback_data: `hw:${h.stage}` })));
  return tg('sendMessage', { chat_id: chatId, text: c.hwHelp, reply_markup: { inline_keyboard: rows } });
}
function hwTask(chatId, h) {
  return tg('sendMessage', {
    chat_id: chatId, parse_mode: 'HTML',
    text: `📝 <b>ДЗ · Етап ${h.stage} · ${esc(h.title)}</b>\n\n<b>Завдання:</b> ${esc(h.task)}\n\n<b>Що надіслати:</b> ${esc(h.proof)}\n\nНадішли скрін або текст з підписом <code>/dz ${h.stage}</code>`,
  });
}
async function hwSubmit(msg, c, h, body) {
  const sup = supportTarget();
  const head = `${header(msg.from, `📝 <b>ДЗ · Етап ${h.stage}</b> · ${esc(h.title)}\n`)}`;
  const note = body ? `\n\n${esc(body)}` : '';
  if (hasMedia(msg)) {
    await tg('copyMessage', { ...sup, from_chat_id: msg.chat.id, message_id: msg.message_id, caption: `${head}${note}`.slice(0, 1024), parse_mode: 'HTML', reply_markup: hwKb(msg.from.id, h.stage) });
  } else {
    await tg('sendMessage', { ...sup, text: `${head}${note}`, parse_mode: 'HTML', reply_markup: hwKb(msg.from.id, h.stage), disable_web_page_preview: true });
  }
  await tg('sendMessage', { chat_id: msg.chat.id, text: fill(c.hwGot, h) });
}
async function onDz(msg, c, m) {
  const stage = m[1] ? Number(m[1]) : null, body = (m[2] || '').trim();
  const h = stage && c.homework.find(x => x.stage === stage);
  if (!stage) return hwList(msg.chat.id, c);
  if (!h) return tg('sendMessage', { chat_id: msg.chat.id, text: `Етапу ${stage} немає. Напиши номер від 1 до ${c.homework.length}, наприклад /dz 3` });
  if (!body && !hasMedia(msg)) return hwTask(msg.chat.id, h);
  return hwSubmit(msg, c, h, body);
}

async function fromStudent(msg, c) {
  const sup = supportTarget();
  const h = header(msg.from);
  if (msg.text) {
    await tg('sendMessage', { ...sup, text: `${h}\n\n${esc(msg.text)}`, parse_mode: 'HTML', reply_markup: doneKb(msg.from.id), disable_web_page_preview: true });
  } else if (hasMedia(msg)) {
    const cap = msg.caption ? `\n\n${esc(msg.caption)}` : '';
    await tg('copyMessage', { ...sup, from_chat_id: msg.chat.id, message_id: msg.message_id, caption: `${h}${cap}`.slice(0, 1024), parse_mode: 'HTML', reply_markup: doneKb(msg.from.id) });
  } else {
    // sticker, video note, contact, etc.: header first, then the item
    await tg('sendMessage', { ...sup, text: h, parse_mode: 'HTML', reply_markup: doneKb(msg.from.id) });
    await tg('copyMessage', { ...sup, from_chat_id: msg.chat.id, message_id: msg.message_id });
  }
  await tg('sendMessage', { chat_id: msg.chat.id, text: c.autoReply });
}

async function fromCurator(msg) {
  const src = msg.reply_to_message;
  const m = src && (src.text || src.caption || '').match(TAG);
  if (!m) return; // ordinary chat between curators
  const studentId = Number(m[1]);
  try {
    await tg('copyMessage', { chat_id: studentId, from_chat_id: msg.chat.id, message_id: msg.message_id });
    await tg('setMessageReaction', { chat_id: msg.chat.id, message_id: msg.message_id, reaction: [{ type: 'emoji', emoji: '👍' }] }).catch(() => {});
  } catch (e) {
    await tg('sendMessage', { chat_id: msg.chat.id, message_thread_id: msg.message_thread_id, reply_to_message_id: msg.message_id, text: `⚠️ Не вдалося доставити: ${e.message}. Можливо, учень зупинив бота.` });
  }
}

async function onCallback(q, c) {
  const data = q.data || '';
  const fromSupport = String(q.message?.chat?.id) === String(process.env.SUPPORT_CHAT_ID);
  const who = q.from.username ? '@' + q.from.username : q.from.first_name;
  const studentCb = data.startsWith('faq:') || data === 'ask' || data === 'hw' || data.startsWith('hw:');
  if (studentCb && !(await hasAccess(q.from.id))) return noAccess(q.from.id, c);

  if (data.startsWith('faq:')) {
    const f = c.faq.find(x => x.id === data.slice(4));
    if (f) await tg('sendMessage', { chat_id: q.from.id, text: f.text, reply_markup: { inline_keyboard: [[{ text: '✍️ Написати куратору', callback_data: 'ask' }]] } });
  } else if (data === 'ask') {
    await tg('sendMessage', { chat_id: q.from.id, text: '✍️ Напиши своє питання одним повідомленням: що робив, що пішло не так, номер етапу. Можна додати скрін (без реквізитів).' });
  } else if (data === 'hw') {
    await hwList(q.from.id, c);
  } else if (data.startsWith('hw:')) {
    const h = c.homework.find(x => x.stage === Number(data.slice(3)));
    if (h) await hwTask(q.from.id, h);
  } else if (fromSupport && data.startsWith('done:')) {
    const sid = Number(data.slice(5));
    await tg('editMessageReplyMarkup', { chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [[{ text: `✅ Вирішено · ${who}`, callback_data: 'noop' }]] } });
    await tg('sendMessage', { chat_id: sid, text: c.doneText }).catch(() => {});
  } else if (fromSupport && /^hw(ok|re):\d+:\d+$/.test(data)) {
    const [kind, sid, st] = data.split(':');
    const h = c.homework.find(x => x.stage === Number(st)) || { stage: st, title: '' };
    const ok = kind === 'hwok';
    await tg('editMessageReplyMarkup', { chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [[{ text: `${ok ? '✅ Зараховано' : '🔁 На доопрацюванні'} · ${who}`, callback_data: 'noop' }]] } });
    await tg('sendMessage', { chat_id: Number(sid), text: fill(ok ? c.hwOk : c.hwRe, h) }).catch(() => {});
    if (!ok) await tg('sendMessage', { chat_id: q.message.chat.id, message_thread_id: q.message.message_thread_id, reply_to_message_id: q.message.message_id, text: '✍️ Відповідай реплаєм на ДЗ вище — коментар піде учню.' }).catch(() => {});
  }
}

export default async function handler(req, res) {
  const { BOT_TOKEN, SUPPORT_CHAT_ID, CRON_SECRET } = process.env;
  if (!BOT_TOKEN) { res.status(500).json({ error: 'set BOT_TOKEN' }); return; }

  // one-time webhook setup
  if (req.method === 'GET') {
    if (req.query?.setup && req.query?.key === CRON_SECRET) {
      const url = `https://${req.headers.host}/api/support`;
      const r = await tg('setWebhook', { url, secret_token: CRON_SECRET, allowed_updates: ['message', 'callback_query'] });
      await tg('setMyCommands', { commands: [{ command: 'start', description: 'Меню підтримки' }, { command: 'dz', description: 'Здати домашнє завдання' }] }).catch(() => {});
      res.status(200).json({ ok: r, webhook: url, supportChat: SUPPORT_CHAT_ID || 'НЕ ЗАДАНО — напиши /chatid у групі кураторів' });
      return;
    }
    res.status(200).send('ARBI X TEAM support bot'); return;
  }
  if (CRON_SECRET && req.headers['x-telegram-bot-api-secret-token'] !== CRON_SECRET) { res.status(401).end(); return; }

  const u = req.body || {};
  const c = cfg();
  try {
    if (u.callback_query) {
      await onCallback(u.callback_query, c);
      await tg('answerCallbackQuery', { callback_query_id: u.callback_query.id }).catch(() => {});
    } else if (u.message) {
      const msg = u.message;
      const txt = msg.text ?? msg.caption ?? '';
      if (msg.text === '/chatid' || msg.text?.startsWith('/chatid@')) {
        await tg('sendMessage', { chat_id: msg.chat.id, message_thread_id: msg.message_thread_id, text: `chat_id: ${msg.chat.id}${msg.message_thread_id ? `\nthread_id: ${msg.message_thread_id}` : ''}` });
      } else if (msg.chat.type === 'private') {
        const dz = txt.match(DZ);
        if (!(await hasAccess(msg.from.id))) { await noAccess(msg.chat.id, c); }
        else if (/^\/start (app|exam|trainer)$/.test(msg.text || '') && c.appUrl) {
          const t = msg.text.split(' ')[1], url = c.appUrl.replace(/\/$/, '') + (t === 'app' ? '' : '/?tab=' + t);
          const label = { app: '📊 Відкрити ARBI X Tools', exam: '🎓 Відкрити фінальний іспит', trainer: '🎯 Відкрити тренажер' }[t];
          await tg('sendMessage', { chat_id: msg.chat.id, text: t === 'exam' ? '🎓 Фінальний іспит: 30 питань, прохідний 24. Після успіху — сертифікат. Натисни кнопку нижче 👇' : 'Натисни кнопку нижче 👇', reply_markup: { inline_keyboard: [[{ text: label, web_app: { url } }]] } });
        } else if (msg.text === '/start' || msg.text?.startsWith('/start ')) {
          await tg('sendMessage', { chat_id: msg.chat.id, text: c.welcome, reply_markup: menu(c) });
        } else if (dz && c.homework?.length) {
          if (SUPPORT_CHAT_ID || !(dz[1] && (dz[2] || hasMedia(msg)))) await onDz(msg, c, dz);
        } else if (SUPPORT_CHAT_ID) {
          await fromStudent(msg, c);
        }
      } else if (String(msg.chat.id) === String(SUPPORT_CHAT_ID)) {
        await fromCurator(msg);
      }
    }
  } catch (e) {
    console.error(e);
  }
  res.status(200).json({ ok: true }); // always 200, so Telegram does not resend
}
