// Dựng file ảnh chụp tĩnh từ JSON THÔ đã tải sẵn của EastMoney (một lần dùng
// khi cửa sổ thông IP quá hẹp: tải thô bằng curl lúc nào thông, dựng file lúc
// nào cũng được). Vẫn đi qua ĐÚNG bộ kiểm locNenHopLe như chup-nen.mjs —
// không có đường nào ghi file mà né kiểm chứng.
//
// Chạy:  npx vite-node tools/dung-tu-tho.mjs -- <file-tho.json> <ma> <khung> <thamSo>
// vd  :  npx vite-node tools/dung-tu-tho.mjs -- raw.json alm 60 al2610
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { locNenHopLe } from '../src/lib/eastmoney.js';

const [duongTho, ma, khung, thamSo] = process.argv.slice(2).filter((x) => x !== '--');
if (!duongTho || !ma || !khung) {
  console.error('Cách dùng: vite-node tools/dung-tu-tho.mjs -- <file-tho.json> <ma> <khung> <thamSo>');
  process.exit(2);
}

const LO = { alm: 5, aom: 20, adm: 10 };
const so = (v) => { const f = parseFloat(v); return isNaN(f) ? null : f; };
function sangMoc(s) {
  const t = String(s).trim();
  const iso = t.includes(' ') ? t.replace(' ', 'T') + ':00' : t + 'T00:00:00';
  const ms = Date.parse(iso + '+08:00');
  return isNaN(ms) ? null : ms;
}

const d = JSON.parse(fs.readFileSync(duongTho, 'utf8')).data;
if (!d?.klines?.length) { console.error('File thô không có nến'); process.exit(1); }

const nen = [];
for (const dong of d.klines) {
  const x = dong.split(',');
  const ts = sangMoc(x[0]);
  if (ts == null) continue;
  nen.push({ timestamp: ts, open: so(x[1]), close: so(x[2]), high: so(x[3]),
             low: so(x[4]), volume: so(x[5]) ?? 0, turnover: so(x[6]) ?? 0 });
}

// Cùng chốt chặn với mọi đường khác — sai thang giá là dừng, không ghi.
const q = locNenHopLe(nen, { lo: LO[ma] || 5, ten: `${thamSo || ma} (${d.name || '?'})` });

const RA = fileURLToPath(new URL('../public/market/', import.meta.url));
const f = path.join(RA, `${ma}_${khung}.json`);
fs.writeFileSync(f, JSON.stringify({
  ten: d.name || ma, ma, khung, nen: q.nen,
  capNhat: new Date().toISOString().slice(0, 10),
  ...(thamSo ? { thamSo } : {}),
}));
console.log(`✓ ${ma}_${khung}: ${q.nen.length} nến (bỏ ${q.boDi}) từ ${d.name} → ${(fs.statSync(f).size / 1024).toFixed(0)} KB`);
