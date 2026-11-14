// GET /api/p2p?ex=binance|okx|bybit&asset=USDT&side=buy|sell&bank=mono&amount=5000
// side=buy  -> you BUY crypto as taker: returns sellers' ads, cheapest first.
// side=sell -> you SELL crypto as taker: returns buyers' ads, highest first.
import { BANKS, EXCHANGES } from '../lib/banks.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const num = v => (v === null || v === undefined || v === '' ? null : Number(v));

async function binance({ asset, side, bank, amount }) {
  const body = {
    asset, fiat: 'UAH', tradeType: side === 'buy' ? 'BUY' : 'SELL',
    payTypes: BANKS[bank].binance, page: 1, rows: 10, publisherType: null,
  };
  if (amount) body.transAmount = String(amount);
  const r = await fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
    method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': UA }, body: JSON.stringify(body),
  });
  const j = await r.json();
  if (j.code !== '000000') throw new Error('binance: ' + (j.message || j.code));
  return (j.data || []).map(d => ({
    price: num(d.adv.price), min: num(d.adv.minSingleTransAmount), max: num(d.adv.maxSingleTransAmount),
    avail: num(d.adv.surplusAmount), nick: d.advertiser.nickName,
    orders: d.advertiser.monthOrderCount, rate: d.advertiser.monthFinishRate != null ? Math.round(d.advertiser.monthFinishRate * 100) : null,
    banks: (d.adv.tradeMethods || []).map(m => m.tradeMethodShortName || m.identifier),
  }));
}

async function okx({ asset, side, bank, amount }) {
  // OKX: side=sell -> sellers' ads (you buy); side=buy -> buyers' ads (you sell)
  const okxSide = side === 'buy' ? 'sell' : 'buy';
  const u = `https://www.okx.com/v3/c2c/tradingOrders/books?quoteCurrency=UAH&baseCurrency=${asset}&side=${okxSide}` +
    `&paymentMethod=all&userType=all&showTrade=false&showFollow=false&showAlreadyTraded=false&isAbleFilter=false&receivingAds=false&t=${Date.now()}`;
  const r = await fetch(u, { headers: { 'user-agent': UA, accept: 'application/json' } });
  const j = await r.json();
  if (j.code !== 0) throw new Error('okx: ' + (j.msg || j.code));
  const names = BANKS[bank].okx.map(s => s.toLowerCase());
  let list = (j.data?.[okxSide] || []).filter(x => (x.paymentMethods || []).some(p => names.includes(String(p).toLowerCase())));
  if (amount) list = list.filter(x => num(x.quoteMinAmountPerOrder) <= amount && amount <= num(x.quoteMaxAmountPerOrder));
  list.sort((a, b) => side === 'buy' ? a.price - b.price : b.price - a.price);
  return list.slice(0, 10).map(x => ({
    price: num(x.price), min: num(x.quoteMinAmountPerOrder), max: num(x.quoteMaxAmountPerOrder),
    avail: num(x.availableAmount), nick: x.nickName, orders: x.completedOrderQuantity,
    rate: x.completedRate != null ? Math.round(Number(x.completedRate) * 100) : null,
    banks: x.paymentMethods || [],
  }));
}

async function bybit({ asset, side, bank, amount }) {
  // Bybit: side "1" -> sellers' ads (you buy); "0" -> buyers' ads (you sell)
  const body = {
    userId: '', tokenId: asset, currencyId: 'UAH', payment: BANKS[bank].bybit,
    side: side === 'buy' ? '1' : '0', size: '10', page: '1', amount: amount ? String(amount) : '',
    authMaker: false, canTrade: false,
  };
  const r = await fetch('https://api2.bybit.com/fiat/otc/item/online', {
    method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': UA }, body: JSON.stringify(body),
  });
  const j = await r.json();
  if (j.ret_code !== 0) throw new Error('bybit: ' + (j.ret_msg || j.ret_code));
  return (j.result?.items || []).map(x => ({
    price: num(x.price), min: num(x.minAmount), max: num(x.maxAmount), avail: num(x.lastQuantity),
    nick: x.nickName, orders: x.recentOrderNum, rate: x.recentExecuteRate, banks: (x.payments || []).map(id => BYBIT_NAMES[id] || id),
  }));
}

const BYBIT_NAMES = Object.fromEntries(Object.values(BANKS).flatMap(b => b.bybit.map(id => [id, b.label])));
const FN = { binance, okx, bybit };

export default async function handler(req, res) {
  const q = req.query || {};
  const ex = String(q.ex || 'binance');
  const asset = String(q.asset || 'USDT').toUpperCase();
  const side = q.side === 'sell' ? 'sell' : 'buy';
  const bank = String(q.bank || 'mono');
  const amount = q.amount ? Math.max(0, Number(q.amount)) || null : null;
  if (!EXCHANGES.includes(ex) || !BANKS[bank] || !['USDT', 'USDC'].includes(asset)) {
    res.status(400).json({ error: 'bad params' }); return;
  }
  try {
    const ads = await FN[ex]({ asset, side, bank, amount });
    res.setHeader('Cache-Control', 's-maxage=20, stale-while-revalidate=40');
    res.status(200).json({ ex, asset, side, bank, amount, ads, at: Date.now() });
  } catch (e) {
    res.status(502).json({ ex, bank, side, error: String(e.message || e) });
  }
}
