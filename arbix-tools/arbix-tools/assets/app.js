(() => {
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('arbix:' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('arbix:' + k, JSON.stringify(v)); } catch {} },
};
const DEMO = new URLSearchParams(location.search).has('demo');
const EXN = Object.fromEntries(ARBI.EXCHANGES), BKN = Object.fromEntries(ARBI.BANKS);
const fmt = (n, d = 2) => n == null || isNaN(n) ? '—' : Number(n).toLocaleString('uk-UA', { minimumFractionDigits: d, maximumFractionDigits: d });
const cls = v => v == null ? 'zero' : v > 0.05 ? 'pos' : v < -0.05 ? 'neg' : 'zero';

// Telegram Mini App
try { const tg = window.Telegram?.WebApp; if (tg) { tg.ready(); tg.expand(); tg.setHeaderColor?.('#070A09'); tg.setBackgroundColor?.('#070A09'); } } catch {}

// Tabs
function openTab(id) {
  document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x.dataset.tab === id));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.id === id));
  scrollTo({ top: 0 });
}
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => openTab(b.dataset.tab));
{ const t = new URLSearchParams(location.search).get('tab') || location.hash.slice(1).split('&')[0]; if (['exam','trainer','calc','quiz','check','tpl','gloss','terms'].includes(t)) openTab(t); }
document.addEventListener('click', e => { const a = e.target.closest('[data-open]'); if (a) { e.preventDefault(); openTab(a.dataset.open); } });

// ---------- SCANNER ----------
const st = store.get('scan', { ex: ['binance', 'okx', 'bybit'], banks: ['mono', 'privat', 'pumb', 'abank'], asset: 'USDT', amount: '', fee: 0.25, mode: 'maker' });
function chips(el, items, key) {
  el.innerHTML = items.map(([k, n]) => `<button class="chip ${st[key].includes(k) ? 'on' : ''}" data-k="${k}">${esc(n)}</button>`).join('');
  el.querySelectorAll('.chip').forEach(c => c.onclick = () => {
    const k = c.dataset.k; const i = st[key].indexOf(k);
    if (i >= 0) { if (st[key].length > 1) st[key].splice(i, 1); } else st[key].push(k);
    c.classList.toggle('on', st[key].includes(k)); store.set('scan', st);
  });
}
chips($('#exChips'), ARBI.EXCHANGES, 'ex');
chips($('#bankChips'), ARBI.BANKS, 'banks');
$('#asset').value = st.asset; $('#amount').value = st.amount; $('#fee').value = st.fee;
document.querySelectorAll('#mode button').forEach(b => {
  b.classList.toggle('on', b.dataset.m === st.mode);
  b.onclick = () => { st.mode = b.dataset.m; document.querySelectorAll('#mode button').forEach(x => x.classList.toggle('on', x === b)); store.set('scan', st); render(); };
});
['asset', 'amount', 'fee'].forEach(id => $('#' + id).onchange = () => { st[id] = id === 'fee' ? Number($('#fee').value) || 0 : $('#' + id).value; store.set('scan', st); if (id === 'fee') render(); });

let data = {}; // key "ex|bank" -> {buy:[], sell:[], err}
let selKey = null;

function demoAds(ex, bank, side) {
  const base = 47 + ({ binance: 0, okx: 0.05, bybit: -0.04 }[ex]) + (bank.length % 4) * 0.07;
  return Array.from({ length: 6 }, (_, i) => ({
    price: +(side === 'buy' ? base + i * 0.03 + Math.random() * 0.05 : base - 0.35 - i * 0.03 + Math.random() * 0.4).toFixed(2),
    min: 500 * (i + 1), max: 20000 + i * 5000, avail: 1000 + i * 300, nick: 'demo_' + ex + i, orders: 100 + i * 37, rate: 95 + (i % 5), banks: [BKN[bank]],
  }));
}
async function getAds(ex, bank, side) {
  if (DEMO) { await new Promise(r => setTimeout(r, 120)); return { ads: demoAds(ex, bank, side) }; }
  const p = new URLSearchParams({ ex, bank, side, asset: st.asset });
  if (st.amount) p.set('amount', st.amount);
  const r = await fetch('/api/p2p?' + p); const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.status);
  return j;
}
async function pool(tasks, n = 6) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < tasks.length) { const k = i++; out[k] = await tasks[k](); } }));
  return out;
}
async function scan() {
  const btn = $('#go'); btn.disabled = true; $('#status').textContent = 'Скануємо…';
  const keys = st.ex.flatMap(ex => st.banks.map(b => [ex, b]));
  const next = {};
  await pool(keys.flatMap(([ex, b]) => ['buy', 'sell'].map(side => async () => {
    const k = ex + '|' + b; next[k] ??= { buy: [], sell: [], err: null };
    try { next[k][side] = (await getAds(ex, b, side)).ads || []; } catch (e) { next[k].err = String(e.message || e); }
  })));
  data = next; btn.disabled = false;
  $('#status').textContent = 'Оновлено о ' + new Date().toLocaleTimeString('uk-UA') + (DEMO ? ' (демо-дані)' : '');
  render();
}
const pts = () => Object.entries(data).map(([k, v]) => {
  const [ex, bank] = k.split('|');
  return { k, ex, bank, name: `${EXN[ex]} · ${BKN[bank]}`, ask: v.buy[0]?.price ?? null, bid: v.sell[0]?.price ?? null, err: v.err, nAsk: v.buy.length, nBid: v.sell.length };
});
function sellPrice(p) { return st.mode === 'maker' ? (p.ask != null ? +(p.ask - 0.01).toFixed(2) : null) : p.bid; }
function spread(buy, sell) { if (buy == null || sell == null) return null; return (sell - buy) / buy * 100 - (st.mode === 'maker' ? Number(st.fee) || 0 : 0); }

function render() {
  const P = pts(); if (!P.length) return;
  // best table
  $('#best').innerHTML = `<tr><th>Біржа · банк</th><th>Купити</th><th>Продати тейкером</th><th>Різниця</th></tr>` +
    P.map(p => `<tr data-k="${p.k}" class="${p.k === selKey ? 'sel' : ''}"><td>${esc(p.name)}${p.err ? `<div class="err">помилка: ${esc(p.err)}</div>` : ''}</td>
      <td>${fmt(p.ask)}</td><td>${fmt(p.bid)}</td><td class="${cls(p.ask && p.bid ? (p.bid - p.ask) / p.ask * 100 : null)}">${p.ask && p.bid ? fmt((p.bid - p.ask) / p.ask * 100) + '%' : '—'}</td></tr>`).join('');
  $('#best').querySelectorAll('tr[data-k]').forEach(tr => tr.onclick = () => { selKey = tr.dataset.k; render(); });
  renderAds();
  // matrix
  const buyers = P.filter(p => p.ask != null), sellers = P.filter(p => sellPrice(p) != null);
  $('#matrixHint').textContent = st.mode === 'maker'
    ? `Рядок — де купуєш тейкером. Колонка — де продаєш через своє оголошення (ціна на 0,01 нижче найкращого продавця) мінус комісія мейкера ${st.fee}%.`
    : 'Рядок — де купуєш тейкером. Колонка — де продаєш тейкером найкращому покупцю. Комісії немає.';
  const cells = [];
  $('#matrix').innerHTML = `<tr><th>Купити ↓ / Продати →</th>${sellers.map(s => `<th>${esc(s.name)}<br><span class="muted">${fmt(sellPrice(s))}</span></th>`).join('')}</tr>` +
    buyers.map(b => `<tr><th class="rowh">${esc(b.name)}<br><span class="muted">${fmt(b.ask)}</span></th>${sellers.map(s => {
      const v = spread(b.ask, sellPrice(s)); if (b.k !== s.k || st.mode === 'taker') cells.push({ b, s, v });
      return `<td class="${cls(v)} ${v >= 1 ? 'h' : v >= 0.5 ? 'm' : ''}">${v == null ? '—' : fmt(v) + '%'}</td>`;
    }).join('')}</tr>`).join('');
  // top
  const top = cells.filter(c => c.v != null).sort((a, b) => b.v - a.v).slice(0, 5);
  $('#top').innerHTML = top.length ? `<div class="toplist">${top.map(c => `<div class="link"><div><div><b>${esc(c.b.name)}</b> → <b>${esc(c.s.name)}</b></div>
    <div class="d">купити ${fmt(c.b.ask)} · продати ${fmt(sellPrice(c.s))}${c.b.ex !== c.s.ex ? ' · між біржами, врахуй комісію мережі' : ''}</div></div>
    <div class="p ${cls(c.v)}">${c.v > 0 ? '+' : ''}${fmt(c.v)}%</div></div>`).join('')}</div>` : 'Немає даних. Спробуй інші банки або прибери суму.';
}
function renderAds() {
  const v = selKey && data[selKey]; if (!v) { $('#ads').innerHTML = ''; return; }
  const [ex, bank] = selKey.split('|');
  const list = (a, t) => `<div><h4>${t}</h4>${a.length ? a.slice(0, 6).map(x => `<div class="ad"><div><span class="pr">${fmt(x.price)}</span> · ${esc(x.nick)}<div class="muted">${fmt(x.min, 0)}–${fmt(x.max, 0)} грн · ${x.orders ?? '—'} угод · ${x.rate ?? '—'}%</div></div></div>`).join('') : '<div class="muted">немає оголошень</div>'}</div>`;
  $('#ads').innerHTML = `<h3 style="margin-top:14px">${esc(EXN[ex])} · ${esc(BKN[bank])}</h3><div class="ads">${list(v.buy, 'Продавці (ти купуєш)')}${list(v.sell, 'Покупці (ти продаєш)')}</div>`;
}
$('#go').onclick = scan;
let timer = null;
$('#auto').onchange = e => { clearInterval(timer); if (e.target.checked) { scan(); timer = setInterval(scan, 60000); } };

// ---------- CALC ----------
function calc() {
  const amt = +$('#cAmt').value || 0, buy = +$('#cBuy').value || 0, sell = +$('#cSell').value || 0, fee = +$('#cFee').value || 0;
  if (!buy) { $('#cRes').innerHTML = ''; return; }
  const usdt = amt / buy, gross = usdt * sell, feeUah = gross * fee / 100, net = gross - feeUah - amt, pct = net / amt * 100;
  const k = (t, v, c = '') => `<div class="kpi"><label>${t}</label><div class="v ${c}">${v}</div></div>`;
  $('#cRes').innerHTML = k('Отримаєш USDT', fmt(usdt)) + k('Продаж, грн', fmt(gross)) + k('Комісія, грн', fmt(feeUah)) +
    k('Чистий прибуток', fmt(net) + ' ₴', cls(net)) + k('Чистий %', fmt(pct) + '%', cls(pct));
}
['cAmt', 'cBuy', 'cSell', 'cFee'].forEach(id => $('#' + id).oninput = calc); calc();

// ---------- QUIZ ----------
const qs = store.get('quiz', {});
function quizList() {
  $('#quizList').innerHTML = ARBI.QUIZ.map((s, i) => {
    const r = qs[s.stage]; const done = r && r >= 4;
    return `<button class="stage ${done ? 'done' : ''}" data-i="${i}"><div class="n">ЕТАП ${s.stage}</div>${esc(s.title)}<div class="s">${r != null ? (done ? '✅ ' : '↺ ') + r + '/5' : 'не пройдено'}</div></button>`;
  }).join('');
  $('#quizList').querySelectorAll('.stage').forEach(b => b.onclick = () => openQuiz(+b.dataset.i));
}
function openQuiz(i) {
  const src = ARBI.QUIZ[i]; const box = $('#quizBox'); box.hidden = false; let answered = 0, right = 0;
  const shuf = a => { a = a.slice(); for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a; };
  const s = { ...src, q: src.q.map(q => { const o = shuf(q.o.map((t, oi) => [t, oi])); return { t: q.t, o: o.map(x => x[0]), a: o.findIndex(x => x[1] === q.a) }; }) };
  box.innerHTML = `<h3>Етап ${s.stage} · ${esc(s.title)}</h3>` + s.q.map((q, qi) => `<div class="q" data-q="${qi}"><p>${qi + 1}. ${esc(q.t)}</p>${q.o.map((o, oi) => `<button class="opt" data-o="${oi}">${esc(o)}</button>`).join('')}</div>`).join('') + '<div id="qRes"></div>';
  box.querySelectorAll('.q').forEach(qd => {
    const q = s.q[+qd.dataset.q];
    qd.querySelectorAll('.opt').forEach(b => b.onclick = () => {
      if (qd.dataset.done) return; qd.dataset.done = 1; answered++;
      const ok = +b.dataset.o === q.a; if (ok) right++;
      b.classList.add(ok ? 'right' : 'wrong'); qd.querySelectorAll('.opt')[q.a].classList.add('right');
      if (answered === s.q.length) {
        qs[s.stage] = Math.max(qs[s.stage] || 0, right); store.set('quiz', qs); quizList();
        $('#qRes').innerHTML = `<div class="kpi"><label>Результат</label><div class="v ${right >= 4 ? 'pos' : 'neg'}">${right}/5 ${right >= 4 ? '— етап пройдено ✅' : '— повтори урок і спробуй ще'}</div></div>`;
      }
    });
  });
  box.scrollIntoView({ behavior: 'smooth' });
}
quizList();

// ---------- CHECKLIST ----------
function checklist() {
  $('#checkList').innerHTML = ARBI.CHECKLIST.map((t, i) => `<label class="chk"><input type="checkbox" data-i="${i}"> <span>${esc(t)}</span></label>`).join('');
  const upd = () => {
    const n = document.querySelectorAll('#checkList input:checked').length, all = ARBI.CHECKLIST.length;
    $('#checkRes').innerHTML = `<div class="kpi"><label>${n}/${all}</label><div class="v ${n === all ? 'pos' : 'neg'}">${n === all ? 'Можна відпускати ✅' : 'НЕ відпускай USDT ⛔'}</div></div>`;
  };
  document.querySelectorAll('#checkList input').forEach(c => c.onchange = upd); upd();
}
$('#checkReset').onclick = checklist; checklist();

// ---------- TEMPLATES ----------
$('#tplList').innerHTML = ARBI.TEMPLATES.map(([h, t], i) => `<div class="tplc"><div class="h">${esc(h)}<button data-i="${i}">Копіювати</button></div><p>${esc(t)}</p></div>`).join('');
$('#tplList').querySelectorAll('button').forEach(b => b.onclick = async () => {
  const t = ARBI.TEMPLATES[+b.dataset.i][1];
  try { await navigator.clipboard.writeText(t); b.textContent = 'Скопійовано ✓'; } catch { b.textContent = 'Виділи текст'; }
  setTimeout(() => b.textContent = 'Копіювати', 1500);
});

// ---------- GLOSSARY ----------
function gloss(f = '') {
  f = f.toLowerCase();
  $('#gList').innerHTML = ARBI.GLOSSARY.filter(([a, b]) => (a + b).toLowerCase().includes(f)).map(([a, b]) => `<div class="term"><b>${esc(a)}</b><p>${esc(b)}</p></div>`).join('') || '<p class="muted">Нічого не знайдено</p>';
}
$('#gSearch').oninput = e => gloss(e.target.value); gloss();

// ---------- TRAINER ----------
const shuffleArr = a => { a = a.slice(); for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a; };
let tr = null;
function trStart() {
  tr = { order: shuffleArr(ARBI.CASES.map((_, i) => i)), i: 0, right: 0 };
  trShow();
}
function trShow() {
  const box = $('#trBox'); const best = store.get('trainerBest', null);
  if (tr.i >= tr.order.length) {
    const n = tr.right, all = tr.order.length, ok = n >= 16;
    if (best == null || n > best) store.set('trainerBest', n);
    box.innerHTML = `<div class="result"><div class="kpi"><label>Результат</label><div class="v ${ok ? 'pos' : 'neg'}">${n}/${all}</div></div>
      <div class="kpi"><label>Статус</label><div class="v ${ok ? 'pos' : 'neg'}">${ok ? 'Готовий до угод ✅' : 'Повтори етап 6'}</div></div>
      <div class="kpi"><label>Найкращий</label><div class="v">${Math.max(best ?? 0, n)}/${all}</div></div></div>
      <p class="hint" style="margin-top:12px">Для ДЗ етапу 6: зроби скрін цього екрана і надішли боту з підписом /dz 6</p>
      <button class="btn" id="trAgain">Пройти ще раз</button>`;
    $('#trAgain').onclick = trStart; return;
  }
  const c = ARBI.CASES[tr.order[tr.i]];
  const opts = shuffleArr(c.o.map((t, k) => [t, k]));
  box.innerHTML = `<div class="trhead"><span class="pill">${esc(c.tag)}</span><span class="muted">Ситуація ${tr.i + 1} з ${tr.order.length} · правильно ${tr.right}</span></div>
    <div class="bar"><i style="width:${tr.i / tr.order.length * 100}%"></i></div>
    <h4 class="trt">${esc(c.t)}</h4><p class="situ">${esc(c.s)}</p><p class="q"><b>Що робиш?</b></p>
    ${opts.map(([t, k]) => `<button class="opt" data-k="${k}">${esc(t)}</button>`).join('')}<div id="trExp"></div>`;
  box.querySelectorAll('.opt').forEach(b => b.onclick = () => {
    if (box.dataset.done === String(tr.i)) return; box.dataset.done = String(tr.i);
    const ok = +b.dataset.k === c.a; if (ok) tr.right++;
    b.classList.add(ok ? 'right' : 'wrong');
    box.querySelector(`.opt[data-k="${c.a}"]`).classList.add('right');
    $('#trExp').innerHTML = `<div class="exp ${ok ? 'ok' : 'bad'}"><b>${ok ? '✅ Правильно' : '❌ Ні'}.</b> ${esc(c.e)}</div><button class="btn" id="trNext">${tr.i + 1 < tr.order.length ? 'Далі →' : 'Результат'}</button>`;
    $('#trNext').onclick = () => { tr.i++; trShow(); box.scrollIntoView({ behavior: 'smooth' }); };
  });
}
$('#trBox').innerHTML = `<p>Найкращий результат: <b>${store.get('trainerBest', null) ?? '—'}</b>${store.get('trainerBest', null) != null ? '/20' : ''}</p><button class="btn" id="trGo">Почати тренажер</button>`;
$('#trGo').onclick = trStart;

// ---------- EXAM ----------
const TG = window.Telegram?.WebApp;
const initData = TG?.initData || '';
const tgUser = TG?.initDataUnsafe?.user;
const savedName = store.get('examName', '') || (tgUser ? [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') : '');
$('#exName').value = savedName;
let ex = null;
$('#exGo').onclick = async () => {
  const name = $('#exName').value.trim().replace(/\s+/g, ' ');
  if (name.split(' ').length < 2 || name.length < 5) { $('#exMsg').textContent = 'Вкажи імʼя і прізвище — так вони будуть у сертифікаті.'; return; }
  if (!$('#exAgree').checked) { $('#exMsg').textContent = 'Підтверди, що ознайомився з умовами навчання.'; return; }
  store.set('examName', name); $('#exMsg').textContent = 'Завантажуємо питання…';
  try {
    const r = await fetch('/api/exam', { cache: 'no-store' }); const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status);
    ex = { name, ...j, ans: {} }; $('#exMsg').textContent = ''; $('#exStart').hidden = true; exRender();
  } catch (e) { $('#exMsg').textContent = 'Не вдалося завантажити іспит: ' + e.message; }
};
function exRender() {
  const box = $('#exBox'); box.hidden = false;
  box.innerHTML = `<h3>Фінальний іспит · ${esc(ex.name)}</h3><div class="trhead"><span class="muted" id="exCount">Відповіді: 0/${ex.total}</span><span class="muted">Прохідний бал: ${ex.pass}/${ex.total}</span></div><div class="bar"><i id="exBar" style="width:0"></i></div>` +
    ex.questions.map((q, i) => `<div class="q" data-id="${q.id}"><p>${i + 1}. ${esc(q.t)}</p>${q.o.map(o => `<button class="opt" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>`).join('') +
    `<button class="btn" id="exSubmit" disabled>Завершити іспит</button><div id="exRes"></div>`;
  box.querySelectorAll('.q').forEach(qd => qd.querySelectorAll('.opt').forEach(b => b.onclick = () => {
    if (ex.sent) return;
    qd.querySelectorAll('.opt').forEach(x => x.classList.toggle('pick', x === b));
    ex.ans[qd.dataset.id] = b.dataset.v;
    const n = Object.keys(ex.ans).length;
    $('#exCount').textContent = `Відповіді: ${n}/${ex.total}`; $('#exBar').style.width = n / ex.total * 100 + '%';
    $('#exSubmit').disabled = n < ex.total;
  }));
  $('#exSubmit').onclick = exSubmit;
  box.scrollIntoView({ behavior: 'smooth' });
}
async function exSubmit() {
  const btn = $('#exSubmit'); btn.disabled = true; btn.textContent = 'Перевіряємо…';
  try {
    const r = await fetch('/api/exam', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'submit', name: ex.name, answers: ex.ans, initData }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status);
    ex.sent = true; btn.hidden = true;
    const pct = Math.round(j.score / j.total * 100);
    let html = `<div class="result"><div class="kpi"><label>Результат</label><div class="v ${j.passed ? 'pos' : 'neg'}">${j.score}/${j.total} · ${pct}%</div></div><div class="kpi"><label>Статус</label><div class="v ${j.passed ? 'pos' : 'neg'}">${j.passed ? 'Складено 🎓' : 'Не складено'}</div></div></div>`;
    if (j.review?.length) html += `<p class="hint" style="margin-top:12px">Повтори етапи, де були помилки: ${j.review.map(r => `<b>${r.stage}. ${esc(r.title)}</b>`).join(', ')}</p>`;
    if (j.passed && j.certId) html += `<div id="certWrap"><canvas id="cert" width="1600" height="1130"></canvas><div class="actions"><button class="btn" id="certDl">Завантажити PNG</button>${initData ? '<button class="btn ghost" id="certTg" style="margin-top:0">Надіслати в бот</button>' : ''}<span class="muted" id="certMsg"></span></div><p class="hint">Номер для ДЗ етапу 10: <b>${esc(j.certId)}</b></p></div>`;
    else if (j.passed && j.certError) html += `<p class="exp bad">${esc(j.certError)}</p>`;
    if (!j.passed) html += `<button class="btn" id="exRetry">Спробувати ще раз</button>`;
    $('#exRes').innerHTML = html;
    if (j.passed && j.certId) { await drawCert(j); TG?.HapticFeedback?.notificationOccurred?.('success'); }
    $('#exRetry') && ($('#exRetry').onclick = () => { $('#exBox').hidden = true; $('#exStart').hidden = false; scrollTo({ top: 0 }); });
    $('#exRes').scrollIntoView({ behavior: 'smooth' });
  } catch (e) { btn.disabled = false; btn.textContent = 'Завершити іспит'; alertBox('Помилка: ' + e.message); }
}
const alertBox = t => { $('#exRes').innerHTML = `<p class="exp bad">${esc(t)}</p>`; };
async function drawCert(j) {
  const cv = $('#cert'), g = cv.getContext('2d'), W = cv.width, H = cv.height;
  try { await Promise.all(['900 64px Unbounded', '800 40px Unbounded', '700 30px Manrope', '400 28px Manrope'].map(f => document.fonts.load(f))); } catch {}
  g.fillStyle = '#070A09'; g.fillRect(0, 0, W, H);
  const rg = g.createRadialGradient(W * 0.85, -80, 20, W * 0.85, -80, 900); rg.addColorStop(0, 'rgba(31,242,181,.35)'); rg.addColorStop(1, 'rgba(31,242,181,0)');
  g.fillStyle = rg; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#1FF2B5'; g.lineWidth = 4; g.strokeRect(40, 40, W - 80, H - 80);
  g.strokeStyle = 'rgba(31,242,181,.35)'; g.lineWidth = 1.5; g.strokeRect(58, 58, W - 116, H - 116);
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.font = '800 34px Unbounded'; g.fillStyle = '#EEF4F1';
  const wm = ['ARBI ', '✕', ' TEAM']; const ww = wm.map(t => g.measureText(t).width); let x = W / 2 - ww.reduce((a, b) => a + b) / 2;
  g.textAlign = 'left'; wm.forEach((t, i) => { g.fillStyle = i === 1 ? '#1FF2B5' : '#EEF4F1'; g.fillText(t, x, 160); x += ww[i]; }); g.textAlign = 'center';
  g.font = '900 96px Unbounded'; g.fillStyle = '#1FF2B5'; g.fillText('СЕРТИФІКАТ', W / 2, 310);
  g.font = '700 30px Manrope'; g.fillStyle = '#8FA59D'; g.fillText('ЗАСВІДЧУЄ, ЩО', W / 2, 390);
  let fs = 76; g.font = `800 ${fs}px Unbounded`; while (g.measureText(j.name).width > W - 260 && fs > 40) { fs -= 4; g.font = `800 ${fs}px Unbounded`; }
  g.fillStyle = '#EEF4F1'; g.fillText(j.name, W / 2, 500);
  g.fillStyle = '#1FF2B5'; g.fillRect(W / 2 - 160, 535, 320, 4);
  g.font = '400 32px Manrope'; g.fillStyle = '#D5E0DB';
  g.fillText('успішно пройшов(ла) базовий курс P2P-арбітражу ARBI SCHOOL', W / 2, 615);
  g.fillText(`і склав(ла) фінальний іспит: ${j.score} з ${j.total} (${Math.round(j.score / j.total * 100)}%)`, W / 2, 665);
  const col = (cx, label, val) => { g.font = '700 22px Manrope'; g.fillStyle = '#8FA59D'; g.fillText(label, cx, 820); g.font = '800 34px Unbounded'; g.fillStyle = '#EEF4F1'; g.fillText(val, cx, 870); };
  const [y, m, d] = j.date.split('-'); col(W * 0.25, 'ДАТА', `${d}.${m}.${y}`); col(W * 0.5, 'НОМЕР', j.certId); col(W * 0.75, 'ПРОГРАМА', '10 етапів');
  g.font = '400 22px Manrope'; g.fillStyle = '#8FA59D';
  g.fillText(`Перевірка: ${location.host} → Іспит → «Перевірити сертифікат». Не є документом про освіту державного зразка.`, W / 2, H - 100);
  $('#certDl').onclick = () => { const a = document.createElement('a'); a.download = `ARBI_X_TEAM_${j.certId}.png`; a.href = cv.toDataURL('image/png'); a.click(); };
  if ($('#certTg')) $('#certTg').onclick = async () => {
    $('#certMsg').textContent = 'Надсилаємо…';
    try {
      const r = await fetch('/api/exam', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'send', name: j.name, certId: j.certId, png: cv.toDataURL('image/png'), initData }) });
      const k = await r.json(); if (!r.ok) throw new Error(k.error || r.status); $('#certMsg').textContent = 'Надіслано в чат з ботом ✅';
    } catch (e) { $('#certMsg').textContent = 'Не вдалося: ' + e.message; }
  };
}
$('#vGo').onclick = async () => {
  const id = $('#vId').value.trim(), name = $('#vName').value.trim();
  if (!id || !name) { $('#vRes').innerHTML = '<p class="muted">Введи номер і імʼя.</p>'; return; }
  try {
    const j = await (await fetch('/api/exam?' + new URLSearchParams({ verify: id, name }))).json();
    $('#vRes').innerHTML = j.valid ? `<div class="kpi"><label>Сертифікат дійсний ✅</label><div class="v pos">${esc(j.name)}</div><div class="muted">виданий ${j.date.split('-').reverse().join('.')}</div></div>`
      : `<div class="kpi"><label>Результат</label><div class="v neg">Не знайдено ⛔</div><div class="muted">Перевір номер і написання імені</div></div>`;
  } catch (e) { $('#vRes').innerHTML = `<p class="muted">Помилка: ${esc(e.message)}</p>`; }
};

// ---------- TERMS ----------
$('#termsBox').innerHTML = ARBI.TERMS.map(([h, t], i) => `<div class="term"><b>${i + 1}. ${esc(h)}</b><p>${esc(t)}</p></div>`).join('');

if (DEMO) scan();
})();
