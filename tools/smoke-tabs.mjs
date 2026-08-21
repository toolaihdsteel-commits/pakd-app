// Smoke rieng cho cac tab da tach khoi App.jsx.
// smoke.mjs chi render tab mac dinh ('main') nen KHONG cham toi MarketTab/EastMoneyChart.
// File nay render truc tiep 2 component do voi du lieu gia => bat loi tach nham.
//
// Chay:  npx vite-node tools/smoke-tabs.mjs
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',
  { url: 'https://hdsteel.github.io/pakd-app/' });
for (const k of ['window','document','localStorage','navigator','location',
                 'HTMLElement','HTMLCanvasElement','CustomEvent','Event']) {
  try { globalThis[k] = dom.window[k]; } catch (e) {}
}
globalThis.alert = () => {}; globalThis.confirm = () => false; globalThis.prompt = () => null;
globalThis.fetch = async () => ({ ok: false, status: 599, json: async () => ({}), text: async () => '' });

const { default: React } = await import('react');
const { renderToString } = await import('react-dom/server');
const { MarketTab } = await import('../src/components/MarketTab.jsx');
const { EastMoneyChart } = await import('../src/components/EastMoneyChart.jsx');

// Du lieu gia dung dung schema sheet MARKET_PRICES
const marketData = [
  { date:'2026-08-20', lme_usd:2610, shfe_cny:20450, smm_cny:20620, smm_move:35,
    smm_usd:2585, usd_vnd:26300, cny_vnd:3660 },
  { date:'2026-08-19', lme_usd:2598, shfe_cny:20390, smm_cny:20585, smm_move:-12,
    smm_usd:2578, usd_vnd:26295, cny_vnd:3658 },
];
const allRawImportPrices = [
  { alloy:'A1050', temper:'H14', minThick:0.5, maxThick:1.0, priceFC:2750, updateDate:'15/07/2026' },
  { alloy:'A3003', temper:'H14', minThick:1.0, maxThick:2.0, priceFC:2810, updateDate:'02/08/2026' },
];
const nop = () => {};
const chung = { bg1:'#f8fafc', bg2:'#fff', border2:'#e2e8f0' };

let loi = 0;
function thu(ten, el, canCo) {
  try {
    const html = renderToString(el);
    const thieu = canCo.filter(s => !html.includes(s));
    if (thieu.length) { console.log(`❌ ${ten}: thieu ${thieu.join(', ')}`); loi++; }
    else console.log(`✅ ${ten}: render ${html.length} ky tu`);
  } catch (e) {
    console.log(`❌ ${ten}: ${e.message}`); loi++;
  }
}

thu('MarketTab', React.createElement(MarketTab, {
  marketData, marketErr:null, loadMarket:nop,
  allRawImportPrices,
  inputs:{}, setInputs:nop, setProducts:nop,
  scenarios:[], setScenarios:nop, saveScenario:nop,
  setTab:nop, ...chung,
}), ['Thị trường', 'CIF']);

thu('MarketTab (rong)', React.createElement(MarketTab, {
  marketData:[], marketErr:null, loadMarket:nop, allRawImportPrices:[],
  inputs:{}, setInputs:nop, setProducts:nop,
  scenarios:[], setScenarios:nop, saveScenario:nop, setTab:nop, ...chung,
}), ['Thị trường']);

thu('EastMoneyChart', React.createElement(EastMoneyChart, { marketData, ...chung }),
    ['Biểu đồ Kỹ thuật', 'Nhôm Thượng Hải A00', 'Ngày']);

console.log(loi ? `\n${loi} tab loi` : '\nTat ca tab render OK');
process.exit(loi ? 1 : 0);
