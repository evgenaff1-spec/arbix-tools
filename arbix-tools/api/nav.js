// Navigation buttons in every topic of the students' group.
//   GET /api/nav?key=<CRON_SECRET>              -> posts & pins a navigation message in every topic
//   GET /api/nav?key=…&dry=1                    -> shows what would be posted, sends nothing
//   GET /api/nav?key=…&only=24,49               -> only these topics
//   GET /api/nav?key=…&edit=24:123,49:456       -> edits earlier messages instead of posting new ones
// The bot must be an admin of the group with the right to pin messages.
// Topics and texts: lib/nav-config.js.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tg, STUDENTS } from '../lib/tg.js';
import NAV from '../lib/nav-config.js';

const cfg = () => NAV;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function build(c, appUrl, botUser) {
  const L = id => `${c.groupLink}/${id}`;
  const st = c.stages, ex = Object.fromEntries(c.extra.map(e => [e.key, e]));
  const btn = (text, url) => ({ text, url });
  const toc = btn('📚 Зміст курсу', L(c.general));
  const service = [];
  if (ex.scam) service.push(btn('🛑 Скам-база', L(ex.scam.topic)));
  if (ex.tools) service.push(btn('🧰 Інструменти', L(ex.tools.topic)));
  const help = [];
  if (botUser) help.push(btn('✍️ Підтримка', `https://t.me/${botUser}`));
  // open the Mini App through the bot, so Telegram passes the student's identity (needed for the certificate)
  const app = (start, hash = '') => botUser ? `https://t.me/${botUser}?start=${start}` : `${appUrl}/${hash.replace('#', '?tab=')}`;
  if (appUrl) help.push(btn('📊 ARBI X Tools', app('app')));
  const out = [];

  // General: table of contents
  const rows = [[btn('🚀 Старт тут', L(c.start))]];
  for (let i = 0; i < st.length; i += 2) rows.push(st.slice(i, i + 2).map(s => btn(`${s.n}. ${s.title}`, L(s.topic))));
  rows.push(service); if (ex.pro) rows.push([btn(ex.pro.title, L(ex.pro.topic))]); if (help.length) rows.push(help);
  out.push({ topic: c.general, text: '📚 ЗМІСТ КУРСУ ARBI X TEAM\n\nНатисни на етап — відкриється його гілка. Проходь по порядку: урок → презентації → тест → ДЗ у боті (/dz).', rows });

  // Start here
  out.push({ topic: c.start, text: '🚀 З чого почати\n\n1. Прочитай закріп у цій гілці.\n2. Переходь до етапу 1 і йди по порядку.\n3. Після кожного етапу — тест в ARBI X Tools і ДЗ у боті підтримки (/dz).\n4. У кінці — фінальний іспит і сертифікат.',
    rows: [[btn('▶️ Почати: Етап 1', L(st[0].topic))], [toc], help.length ? help : null].filter(Boolean) });

  // Stages
  st.forEach((s, i) => {
    const prev = i ? btn(`⬅️ Етап ${st[i - 1].n}`, L(st[i - 1].topic)) : btn('⬅️ Старт', L(c.start));
    const next = i < st.length - 1 ? btn(`Етап ${st[i + 1].n} ➡️`, L(st[i + 1].topic)) : btn('🎓 Іспит ➡️', appUrl ? app('exam', '#exam') : L(ex.tools?.topic || c.general));
    const bar = '▰'.repeat(s.n) + '▱'.repeat(st.length - s.n);
    out.push({ topic: s.topic, text: `🧭 ЕТАП ${s.n} з ${st.length} · ${s.title}\n${bar}\n\nПройшов матеріали? Зроби тест в ARBI X Tools і здай ДЗ у боті: /dz ${s.n}\nПотім тисни «Етап ${Math.min(s.n + 1, st.length)} ➡️».`,
      rows: [[prev, next], [toc], service, help].filter(r => r.length) });
  });

  // Extra topics
  c.extra.forEach(e => {
    const rows = [[toc]];
    if (e.key === 'scam') rows.unshift([btn('🛡 Етап 6 · Безпека угод', L(st[5].topic))]);
    if (e.key === 'tools' && appUrl) rows.unshift([btn('📊 Відкрити ARBI X Tools', app('app'))], [btn('🎯 Тренажер', app('trainer', '#trainer')), btn('🎓 Іспит', app('exam', '#exam'))]);
    if (help.length) rows.push(e.key === 'tools' ? help.slice(0, 1) : help);
    out.push({ topic: e.topic, text: e.text, rows });
  });
  return out;
}

export default async function handler(req, res) {
  const { BOT_TOKEN, CRON_SECRET } = process.env;
  if (!BOT_TOKEN) { res.status(500).json({ error: 'set BOT_TOKEN' }); return; }
  if (!CRON_SECRET || req.query?.key !== CRON_SECRET) { res.status(401).json({ error: 'bad key' }); return; }
  const c = cfg();
  let appUrl = ''; try { appUrl = JSON.parse(readFileSync(join(process.cwd(), 'support.json'), 'utf8')).appUrl || ''; } catch {}
  appUrl = (appUrl || `https://${req.headers.host}`).replace(/\/$/, '');
  let botUser = ''; try { botUser = (await tg('getMe', {})).username; } catch {}
  let msgs = build(c, appUrl, botUser);
  const only = String(req.query.only || '').split(',').filter(Boolean).map(Number);
  if (only.length) msgs = msgs.filter(m => only.includes(m.topic));
  const edit = Object.fromEntries(String(req.query.edit || '').split(',').filter(Boolean).map(p => p.split(':').map(Number)));
  if (req.query.dry) { res.status(200).json({ botUser, appUrl, messages: msgs }); return; }

  const chat = STUDENTS(), done = [], errors = [];
  for (const m of msgs) {
    const markup = { inline_keyboard: m.rows };
    try {
      if (edit[m.topic]) {
        await tg('editMessageText', { chat_id: chat, message_id: edit[m.topic], text: m.text, reply_markup: markup });
        done.push(`${m.topic}:${edit[m.topic]}`);
      } else {
        const r = await tg('sendMessage', { chat_id: chat, message_thread_id: m.topic === 1 ? undefined : m.topic, text: m.text, reply_markup: markup, disable_notification: true });
        await tg('pinChatMessage', { chat_id: chat, message_id: r.message_id, disable_notification: true }).catch(e => errors.push(`pin ${m.topic}: ${e.message}`));
        done.push(`${m.topic}:${r.message_id}`);
      }
    } catch (e) { errors.push(`${m.topic}: ${e.message}`); }
    await sleep(1500);
  }
  const host = `https://${req.headers.host}/api/nav?key=${encodeURIComponent(CRON_SECRET)}`;
  res.status(200).json({ ok: !errors.length, posted: done.length, errors,
    editUrl: `${host}&edit=${done.join(',')}`,
    note: 'Збережи editUrl: щоб змінити тексти/кнопки пізніше без дублів, відредагуй lib/nav-config.js, задеплой і відкрий editUrl.' });
}
