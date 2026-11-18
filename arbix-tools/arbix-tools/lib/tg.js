// Shared Telegram helpers for the support bot and the exam.
import { createHmac, timingSafeEqual } from 'node:crypto';

export async function tg(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`${method}: ${j.description}`);
  return j.result;
}

// Upload a file (e.g. the certificate PNG) as a document.
export async function tgSendFile(chatId, buf, filename, caption) {
  const fd = new FormData();
  fd.append('chat_id', String(chatId));
  fd.append('document', new Blob([buf], { type: 'image/png' }), filename);
  if (caption) { fd.append('caption', caption); fd.append('parse_mode', 'HTML'); }
  const r = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendDocument`, { method: 'POST', body: fd });
  const j = await r.json();
  if (!j.ok) throw new Error(`sendDocument: ${j.description}`);
  return j.result;
}

export const esc = s => String(s ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

export const STUDENTS = () => process.env.STUDENTS_CHAT_ID || '-1004356545590';
export async function hasAccess(userId) {
  if (process.env.STUDENTS_CHAT_ID === 'off') return true;
  try {
    const m = await tg('getChatMember', { chat_id: STUDENTS(), user_id: userId });
    return ['creator', 'administrator', 'member'].includes(m.status) || (m.status === 'restricted' && m.is_member);
  } catch { return false; }
}

export const supportTarget = () => ({
  chat_id: process.env.SUPPORT_CHAT_ID,
  message_thread_id: process.env.SUPPORT_THREAD_ID ? Number(process.env.SUPPORT_THREAD_ID) : undefined,
});

// Verify Telegram Mini App initData. Returns the user object or null.
export function verifyInitData(initData, maxAgeSec = 24 * 3600) {
  if (!initData || !process.env.BOT_TOKEN) return null;
  const p = new URLSearchParams(initData);
  const hash = p.get('hash'); if (!hash) return null;
  p.delete('hash');
  const dcs = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest();
  const calc = createHmac('sha256', secret).update(dcs).digest('hex');
  if (calc.length !== hash.length || !timingSafeEqual(Buffer.from(calc), Buffer.from(hash))) return null;
  const age = Date.now() / 1000 - Number(p.get('auth_date') || 0);
  if (age > maxAgeSec) return null;
  try { return JSON.parse(p.get('user') || 'null'); } catch { return null; }
}
