// Kiểm LỚP DỮ LIỆU NẾN — chốt chặn dữ liệu sai + luồng lùi khi mất mạng.
//
// Lỗi gốc (22/08/2026): chuyển khung 15 phút → 1 giờ thì biểu đồ "co rúm,
// méo mó". Không phải lỗi resize: file public/market/alm_60.json chứa giá
// 11.865.139 trong khi giá thật ~23.700. EastMoney chặn → trình duyệt lùi về
// file đó → trục giá bị kéo lên 12 triệu, nến bẹp thành một vạch, các đường
// MA dựng đứng.
//
// Mốc kiểm chứng ĐỘC LẬP: turnover / (volume × số tấn mỗi lô). Ba trường này
// EastMoney trả riêng, nên một lỗi làm hỏng open/high/low/close sẽ lộ ra ngay.
//
// Chạy:  npx vite-node tools/kiem-nen.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { locNenHopLe } from '../src/lib/eastmoney.js';

let hong = 0;
const ok = (ten, dieu, them = '') => {
  console.log(`${dieu ? '✅' : '❌'} ${ten}${them ? ' — ' + them : ''}`);
  if (!dieu) hong++;
};
const nem = (ten, fn, chua) => {
  try { fn(); ok(ten, false, 'KHÔNG ném lỗi (đáng lẽ phải chặn)'); }
  catch (e) { ok(ten, !chua || e.message.includes(chua), e.message); }
};

const H = 3600000;
/** Nến 1 giờ bình thường quanh giá `gia`. */
const nenThat = (n, gia = 23700, tu = 1785420000000) =>
  Array.from({ length: n }, (_, i) => {
    const g = gia + Math.round(Math.sin(i / 7) * 120);
    const vol = 20000 + (i % 13) * 900;
    return { timestamp: tu + i * H, open: g - 10, high: g + 40, low: g - 45, close: g,
             volume: vol, turnover: Math.round(g * vol * 5) };
  });

// ═══ 1. Dữ liệu lành thì đi qua nguyên vẹn ═════════════════════════════
console.log('── Dữ liệu lành ──');
const lanh = nenThat(128);
const r1 = locNenHopLe(lanh, { lo: 5, ten: 'test' });
ok('Giữ đủ 128 nến', r1.nen.length === 128, `giữ ${r1.nen.length}`);
ok('Không bỏ nến nào', r1.boDi === 0);

// ═══ 2. ĐÚNG DẠNG HỎNG ĐÃ GẶP: 120/128 nến sai thang giá ══════════════
console.log('\n── Tái hiện file alm_60.json hỏng ngày 21/08 ──');
// Số thật lấy từ file hỏng: open 11.865.139 · close 11.865.267 · biên độ 358
// nhưng volume/turnover vẫn đúng (giá suy ra 23.661).
const hongThat = lanh.map((n, i) => (i < 120
  ? { ...n, open: 11865139 + i * 130, high: 11865395 + i * 130,
      low: 11865037 + i * 130, close: 11865267 + i * 130 }
  : n));
nem('Nguồn hỏng 120/128 → CHẶN, không cho vẽ',
    () => locNenHopLe(hongThat, { lo: 5, ten: 'ảnh chụp tĩnh' }), 'không hợp lệ');

// ═══ 3. Hỏng lẻ tẻ thì bỏ nến hỏng, giữ phần còn lại ═══════════════════
console.log('\n── Hỏng lẻ tẻ ──');
const leTe = lanh.map((n, i) => (i === 40 ? { ...n, close: n.close * 500, high: n.high * 500 } : n));
const r3 = locNenHopLe(leTe, { lo: 5, ten: 'test' });
ok('Bỏ đúng 1 nến sai', r3.boDi === 1, `bỏ ${r3.boDi}`);
ok('Giữ 127 nến còn lại', r3.nen.length === 127);
ok('Nến sai đã biến mất', !r3.nen.some((n) => n.close > 100000));

console.log('\n── Nến rác kiểu khác ──');
const rac = [...nenThat(30),
  { timestamp: 1785420000000, open: 0, high: 0, low: 0, close: 0, volume: 1, turnover: 1 },
  { timestamp: 1785420000000, open: NaN, high: 1, low: 1, close: 1, volume: 1, turnover: 1 },
  { timestamp: 1785420000000, open: 23700, high: 23600, low: 23900, close: 23700, volume: 1, turnover: 1 },
];
const r4 = locNenHopLe(rac, { lo: 5, ten: 'test' });
ok('Bỏ nến giá 0 / NaN / cao<thấp', r4.boDi === 3, `bỏ ${r4.boDi}`);
ok('Giữ nguyên 30 nến lành', r4.nen.length === 30);

// ═══ 4. Không bắt nhầm hàng lành ═══════════════════════════════════════
console.log('\n── Không bắt nhầm (mỗi mã một cỡ lô) ──');
const RA = fileURLToPath(new URL('../public/market/', import.meta.url));
for (const [f, lo] of [['alm_101.json', 5], ['alm_102.json', 5], ['alm_103.json', 5], ['alm_60.json', 5], ['alm_15.json', 5], ['aom_101.json', 20], ['adm_101.json', 10]]) {   // alm_60/15: nguồn Sina, turnover=0 → kiểm cơ bản
  const duong = path.join(RA, f);
  if (!fs.existsSync(duong)) { console.log(`   (bỏ qua ${f} — chưa có)`); continue; }
  const g = JSON.parse(fs.readFileSync(duong, 'utf8'));
  try {
    const r = locNenHopLe(g.nen, { lo, ten: f });
    ok(`${f} (lô ${lo} tấn) đi qua sạch`, r.boDi === 0, `${r.nen.length} nến, bỏ ${r.boDi}`);
  } catch (e) { ok(`${f} (lô ${lo} tấn) đi qua sạch`, false, e.message); }
}
// Trước đây khẳng định alm_60.json PHẢI VẮNG (file EastMoney hỏng đã gỡ).
// Nguồn đã đổi sang Sina nên khẳng định ngược lại: phải CÓ, và lành.
ok('alm_60.json (nguồn Sina) đã trở lại kho', fs.existsSync(path.join(RA, 'alm_60.json')));
ok('alm_15.json (nguồn Sina) đã trở lại kho', fs.existsSync(path.join(RA, 'alm_15.json')));

// ═══ 5. Đường trong ngày không có turnover → không được chặn oan ═══════
console.log('\n── Đường trong ngày (trends2, không có turnover) ──');
const trongNgay = Array.from({ length: 200 }, (_, i) => ({
  timestamp: 1785420000000 + i * 60000, open: 23700, high: 23700, low: 23700, close: 23700, volume: 3,
}));
const r5 = locNenHopLe(trongNgay, { lo: 5, ten: 'trends' });
ok('Không bỏ nhầm nến nào', r5.boDi === 0 && r5.nen.length === 200);

// ═══ 6. Toàn luồng khi MẤT MẠNG THẬT ═══════════════════════════════════
console.log('\n── Mất mạng: thử lại rồi lùi về ảnh chụp tĩnh ──');
const { layNen } = await import('../src/lib/eastmoney.js');
const thuMuc = RA;
let soLanGoiMang = 0;
globalThis.fetch = async (u) => {
  const url = String(u);
  if (url.includes('eastmoney.com')) { soLanGoiMang++; throw new TypeError('Failed to fetch'); }
  const m = url.match(/market\/([\w.]+\.json)$/);
  const f = m && path.join(thuMuc, m[1]);
  if (!f || !fs.existsSync(f)) return { ok: false, status: 404 };
  return { ok: true, json: async () => JSON.parse(fs.readFileSync(f, 'utf8')) };
};

const t0 = Date.now();
const g6 = await layNen('alm', '101');
const giay = ((Date.now() - t0) / 1000).toFixed(1);
ok('Thử lại đúng 3 lần trước khi bỏ cuộc', soLanGoiMang === 3, `gọi ${soLanGoiMang} lần trong ${giay}s`);
ok('Có lùi dần (backoff) chứ không dồn dập', Date.now() - t0 >= 2000, `mất ${giay}s`);
ok('Vẫn trả về được nến', g6.nen.length > 100, `${g6.nen.length} nến`);
ok('Nguồn = ảnh chụp tĩnh', g6.nguon === 'tinh', g6.nguon);
ok('Có câu cảnh báo cho người dùng', !!g6.canhBao, g6.canhBao);
ok('KHÔNG ném lỗi làm treo luồng nghiệp vụ', true);

console.log('\n── Khung 1 giờ: chưa cấu hình Apps Script → lùi về ảnh chụp Sina ──');
soLanGoiMang = 0;
const g7 = await layNen('alm', '60');
ok('Vẫn có nến để vẽ', g7.nen.length >= 300, `${g7.nen.length} nến`);
ok('Nguồn = ảnh chụp tĩnh', g7.nguon === 'tinh', g7.nguon);
ok('Không đốt request EastMoney nào cho khung này', soLanGoiMang === 0, `${soLanGoiMang} request`);
ok('Cảnh báo gọi đúng tên nguồn Sina/Apps Script', /Sina|Apps Script/.test(g7.canhBao || ''), g7.canhBao);
ok('Không còn dữ liệu 11 triệu', g7.nen.every((n) => n.close < 100000));

// ═══ 7. Khung 15 phút / 1 giờ phải ở trạng thái ẨN (kết luận 22/08) ═════
console.log('\n── Khung 15/60 hiện trở lại với nguồn Sina ──');
const { KHUNG_TG } = await import('../src/lib/eastmoney.js');
// 22/08 chiều: hai khung này từng ẩn (an:true) vì EastMoney hỏng lịch sử
// trong ngày. Nay có nguồn thay thế (Sina qua proxy Apps Script) nên phải
// HIỆN đủ 6 khung, và 15/60 mang cờ sina để layNen đi đúng đường.
ok('Không còn khung nào bị ẩn', KHUNG_TG.every((k) => !k.an));
ok('15 phút và 1 giờ mang cờ sina',
   KHUNG_TG.filter((k) => k.sina).map((k) => k.k).sort().join(',') === '15,60');
ok('Đủ 6 khung hiển thị', KHUNG_TG.length === 6);

console.log(hong ? `\n${hong} phép kiểm SAI` : '\nToàn bộ phép kiểm ĐÚNG');
process.exit(hong ? 1 : 0);
