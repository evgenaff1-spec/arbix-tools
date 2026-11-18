// Final exam + certificate.
//   GET  /api/exam                      -> questions (options shuffled, no answers)
//   GET  /api/exam?verify=AX-…&name=…   -> check a certificate number
//   POST {action:'submit', name, answers:{id: optionText}, initData} -> score, certificate number if passed
//   POST {action:'send', name, certId, png, initData}               -> bot sends the certificate PNG to the student
// The certificate is issued only to students who open the exam inside Telegram (Mini App)
// and are members of the students' group. Set EXAM_OPEN=1 to allow the browser too.
// Env: BOT_TOKEN, CERT_SECRET (falls back to CRON_SECRET), SUPPORT_CHAT_ID (optional: notify curators).
import { createHmac } from 'node:crypto';
import { EXAM, PASS, STAGES } from '../lib/exam.js';
import { tg, tgSendFile, esc, hasAccess, verifyInitData, supportTarget } from '../lib/tg.js';

const SECRET = () => process.env.CERT_SECRET || process.env.CRON_SECRET || '';
const normName = n => String(n || '').trim().replace(/\s+/g, ' ');
const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function sig(name, date) {
  const h = createHmac('sha256', SECRET()).update(`${normName(name).toLowerCase()}|${date}`).digest();
  return Array.from(h.subarray(0, 8), b => B32[b % 32]).join('');
}
const kyivDate = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Kyiv' }); // YYYY-MM-DD
const certId = (name, date) => `AX-${date.replace(/-/g, '').slice(2)}-${sig(name, date)}`;
function parseCert(id) {
  const m = String(id || '').toUpperCase().trim().match(/^AX-(\d{6})-([A-Z2-9]{8})$/);
  if (!m) return null;
  return { date: `20${m[1].slice(0, 2)}-${m[1].slice(2, 4)}-${m[1].slice(4, 6)}`, sig: m[2] };
}
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

async function student(initData) {
  const user = verifyInitData(initData);
  if (!user) return { user: null, ok: process.env.EXAM_OPEN === '1' };
  return { user, ok: process.env.EXAM_OPEN === '1' || await hasAccess(user.id) };
}

export default async function handler(req, res) {
  if (!SECRET()) { res.status(500).json({ error: 'set CERT_SECRET' }); return; }
  try {
    if (req.method === 'GET') {
      if (req.query?.verify) {
        const p = parseCert(req.query.verify), name = normName(req.query.name);
        const valid = !!(p && name && sig(name, p.date) === p.sig);
        res.status(200).json({ valid, name: valid ? name : null, date: valid ? p.date : null }); return;
      }
      const questions = shuffle(EXAM.map((q, id) => ({ id, s: q.s, t: q.t, o: shuffle(q.o) })));
      res.setHeader('cache-control', 'no-store');
      res.status(200).json({ total: EXAM.length, pass: PASS, questions }); return;
    }
    if (req.method !== 'POST') { res.status(405).end(); return; }

    const b = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const name = normName(b.name).slice(0, 60);

    if (b.action === 'submit') {
      const ans = b.answers || {};
      let score = 0; const missed = new Set();
      EXAM.forEach((q, id) => { if (ans[id] === q.o[q.a]) score++; else missed.add(q.s); });
      const passed = score >= PASS;
      const out = { score, total: EXAM.length, pass: PASS, passed, review: [...missed].sort((a, b) => a - b).map(s => ({ stage: s, title: STAGES[s] })) };
      if (passed) {
        const st = await student(b.initData);
        if (!st.ok) { out.certError = st.user ? 'Сертифікат видається тільки учням потоку.' : 'Щоб отримати сертифікат, відкрий іспит через бота в Telegram.'; }
        else if (name.length < 3) { out.certError = 'Вкажи імʼя та прізвище для сертифіката.'; }
        else {
          const date = kyivDate();
          Object.assign(out, { certId: certId(name, date), date, name });
          if (process.env.SUPPORT_CHAT_ID && process.env.BOT_TOKEN) {
            const u = st.user;
            const who = u ? `<a href="tg://user?id=${u.id}">${esc(name)}</a>${u.username ? ' · @' + esc(u.username) : ''}\n🆔 ${u.id}` : esc(name);
            await tg('sendMessage', { ...supportTarget(), parse_mode: 'HTML', text: `🎓 <b>Фінальний іспит складено</b>\n${who}\n\nРезультат: ${score}/${EXAM.length}\nСертифікат: <code>${out.certId}</code>` }).catch(() => {});
          }
        }
      }
      res.status(200).json(out); return;
    }

    if (b.action === 'send') {
      const st = await student(b.initData);
      const p = parseCert(b.certId);
      if (!st.user || !st.ok) { res.status(403).json({ error: 'Відкрий через бота в Telegram' }); return; }
      if (!p || sig(name, p.date) !== p.sig) { res.status(400).json({ error: 'Невірний сертифікат' }); return; }
      const png = Buffer.from(String(b.png || '').replace(/^data:image\/png;base64,/, ''), 'base64');
      if (png.length < 1000 || png.length > 4_000_000) { res.status(400).json({ error: 'Файл сертифіката пошкоджений' }); return; }
      await tgSendFile(st.user.id, png, `ARBI_X_TEAM_certificate_${b.certId}.png`, `🎓 Твій сертифікат ARBI X TEAM\nНомер: <code>${esc(b.certId)}</code>`);
      res.status(200).json({ ok: true }); return;
    }
    res.status(400).json({ error: 'unknown action' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server error' });
  }
}
