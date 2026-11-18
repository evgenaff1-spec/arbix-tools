// Daily reminder bot. Vercel Cron calls this once a day (see vercel.json).
// For every lesson in lib/schedule-config.js: posts "завтра урок" the day before and "сьогодні о 21:00" on the day.
// Env: BOT_TOKEN (from @BotFather), CHAT_ID (group id, e.g. -1004356545590), CRON_SECRET (any random string).
// Manual test: /api/remind?test=1&key=<CRON_SECRET>  -> sends a test message to the announcements topic.
import SCHEDULE from '../lib/schedule-config.js';

const kyivDate = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); // YYYY-MM-DD
};

async function send(token, chatId, threadId, text) {
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_thread_id: threadId || undefined, text, disable_web_page_preview: true }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.description || 'telegram error');
  return j.result.message_id;
}

export default async function handler(req, res) {
  const { BOT_TOKEN, CHAT_ID, CRON_SECRET } = process.env;
  const auth = req.headers.authorization || '';
  const key = req.query?.key;
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}` && key !== CRON_SECRET) { res.status(401).json({ error: 'unauthorized' }); return; }
  if (!BOT_TOKEN || !CHAT_ID) { res.status(500).json({ error: 'set BOT_TOKEN and CHAT_ID env vars' }); return; }

  const cfg = SCHEDULE;
  const annTopic = cfg.announcementsTopicId;
  const sent = [];
  try {
    if (req.query?.test) {
      sent.push(await send(BOT_TOKEN, CHAT_ID, annTopic, '🤖 Тест бота ARBI X TEAM: нагадування працюють ✅'));
      res.status(200).json({ ok: true, test: true, sent }); return;
    }
    const today = kyivDate(0), tomorrow = kyivDate(1);
    for (const l of cfg.lessons) {
      if (!l.date) continue;
      const fmt = l.format === 'video' ? '🎥 відео-урок' : '🎙 зідзвон';
      const time = l.time || cfg.defaultTime || '21:00';
      if (l.date === tomorrow) {
        sent.push(await send(BOT_TOKEN, CHAT_ID, annTopic,
          `⏰ Завтра о ${time} — ${fmt}\n\nЕтап ${l.stage}: ${l.title}\n\nПідготуйся: зроби ДЗ з попереднього етапу і пройди тест у застосунку ARBI X Tools.`));
      }
      if (l.date === today) {
        sent.push(await send(BOT_TOKEN, CHAT_ID, annTopic,
          `🔥 Сьогодні о ${time} — ${fmt}\n\nЕтап ${l.stage}: ${l.title}\n\nМатеріали будуть у гілці етапу. Не запізнюйся!`));
      }
    }
    res.status(200).json({ ok: true, today, sent });
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e.message || e), sent });
  }
}
