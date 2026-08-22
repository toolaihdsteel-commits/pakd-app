// Chụp nến EastMoney ra file JSON tĩnh trong public/market/ — LƯỚI AN TOÀN.
// Khi EastMoney chặn theo IP (cả phòng cùng mở app), trình duyệt lùi về đọc
// các file này nên biểu đồ không bao giờ trắng.
//
// PHẢI DÙNG curl, KHÔNG dùng fetch của Node:
//   push2his.eastmoney.com từ chối TLS fingerprint của Node (UND_ERR_SOCKET)
//   và của Python (RemoteDisconnected). curl + trình duyệt thì qua.
//
// Chạy:  node tools/chup-nen.mjs
// CI:    thêm step vào .github/workflows/market-fetch.yml rồi commit thư mục public/market/

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CURL = process.platform === 'win32'
  ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'curl.exe')
  : 'curl';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const RA = path.resolve('public/market');

// Chụp bộ tối thiểu đủ dùng. Càng nhiều càng dễ bị EastMoney chặn giữa chừng.
const CAN_CHUP = [
  { ma: 'alm', khung: '101', klt: 101, lmt: 800 },
  { ma: 'alm', khung: '102', klt: 102, lmt: 600 },
  { ma: 'alm', khung: '60',  klt: 60,  lmt: 500 },
  { ma: 'alm', khung: '15',  klt: 15,  lmt: 400 },
  { ma: 'alm', khung: '103', klt: 103, lmt: 400 },
  { ma: 'aom', khung: '101', klt: 101, lmt: 800 },
  { ma: 'adm', khung: '101', klt: 101, lmt: 800 },
];

const nghi = (ms) => new Promise((r) => setTimeout(r, ms));
const so = (v) => { const f = parseFloat(v); return isNaN(f) ? null : f; };

// Số tấn mỗi lô — để suy ra giá từ giá trị giao dịch (mốc kiểm chứng độc lập)
const LO = { alm: 5, aom: 20, adm: 10 };

// CHỐT CHẶN: ngày 22/08 file alm_60.json đã được ghi ra với giá 11.865.139
// (giá thật ~23.700). Trình duyệt lùi về file đó và biểu đồ bị kéo trục lên 12
// triệu — nến bẹp thành một vạch. Từ nay KHÔNG ghi file nếu nến không qua kiểm.
function kiemNen(nen, lo) {
  const suyRa = nen.filter((n) => n.volume > 0 && n.turnover > 0)
                   .map((n) => n.turnover / (n.volume * lo)).sort((a, b) => a - b);
  if (!suyRa.length) return { ok: true, sai: 0 };     // trends2 không có turnover
  const moc = suyRa[suyRa.length >> 1];
  let sai = 0;
  for (const n of nen) {
    const g = [n.open, n.high, n.low, n.close];
    if (!g.every((v) => Number.isFinite(v) && v > 0) || n.high < n.low) { sai++; continue; }
    const r = n.close / moc;
    if (r > 5 || r < 1 / 5) sai++;
  }
  return { ok: sai / nen.length <= 0.02, sai, moc: Math.round(moc) };
}

// EastMoney trả giờ Bắc Kinh không kèm múi giờ → phải ghim +08:00
function sangMoc(s) {
  const t = String(s).trim();
  const iso = t.includes(' ') ? t.replace(' ', 'T') + ':00' : t + 'T00:00:00';
  const ms = Date.parse(iso + '+08:00');
  return isNaN(ms) ? null : ms;
}

async function goi(url, lanThu = 4) {
  let loiCuoi;
  for (let i = 0; i < lanThu; i++) {
    try {
      const out = execFileSync(CURL, ['-sL', '--max-time', '30', '-A', UA, url],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      if (!out) throw new Error('phản hồi rỗng (nhiều khả năng bị chặn theo IP)');
      return JSON.parse(out);
    } catch (e) {
      loiCuoi = e;
      // EastMoney chặn theo IP vài chục giây → lùi dần khá lâu mới có tác dụng
      if (i < lanThu - 1) await nghi(4000 * (i + 1));
    }
  }
  throw loiCuoi;
}

fs.mkdirSync(RA, { recursive: true });
let ok = 0, hong = 0;

for (const c of CAN_CHUP) {
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=113.${c.ma}`
    + `&klt=${c.klt}&fqt=0&beg=0&end=20500101&lmt=${c.lmt}`
    + '&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58';
  const f = path.join(RA, `${c.ma}_${c.khung}.json`);
  try {
    const d = (await goi(url)).data;
    if (!d?.klines?.length) throw new Error('không có nến');
    let nen = [];
    for (const dong of d.klines) {
      const x = dong.split(',');
      const ts = sangMoc(x[0]);
      if (ts == null) continue;
      nen.push({ timestamp: ts, open: so(x[1]), close: so(x[2]), high: so(x[3]),
                 low: so(x[4]), volume: so(x[5]) ?? 0, turnover: so(x[6]) ?? 0 });
    }
    // beg=0 khiến EastMoney bỏ qua lmt (alm trả về 6.713 nến ~733 KB).
    // Đây là file LÙI VỀ tải qua mạng — phải gọn, nên cắt lấy phần gần nhất.
    if (nen.length > c.lmt) nen = nen.slice(-c.lmt);
    const k = kiemNen(nen, LO[c.ma] || 5);
    if (!k.ok) throw new Error(`nến sai thang giá (${k.sai}/${nen.length}, mốc ~${k.moc}) — KHÔNG ghi đè file cũ`);
    fs.writeFileSync(f, JSON.stringify({
      ten: d.name || c.ma, ma: c.ma, khung: c.khung, nen,
      capNhat: new Date().toISOString().slice(0, 10),
    }));
    console.log(`✓ ${c.ma}_${c.khung}: ${nen.length} nến → ${(fs.statSync(f).size / 1024).toFixed(0)} KB`);
    ok++;
  } catch (e) {
    console.log(`✗ ${c.ma}_${c.khung}: ${e.message.slice(0, 70)}`);
    hong++;
  }
  await nghi(3000);   // giãn nhịp để khỏi bị chặn giữa chừng
}

console.log(`\n${ok} file OK, ${hong} lỗi`);
// Không exit(1) khi lỗi lẻ tẻ: đây là lưới an toàn, thiếu 1 file không phải sự cố.
process.exit(ok === 0 ? 1 : 0);
