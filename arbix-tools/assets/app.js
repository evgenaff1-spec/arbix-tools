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
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.id === b.dataset.tab));
  scrollTo({ top: 0 });
});

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

if (DEMO) scan();
})();
