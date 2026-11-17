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

// ═══ 8. Khung 15 phút: ghép luồng 1 phút EastMoney lên nến Sina (17/11) ══
// Giám đốc thấy biểu đồ 15p lệch app gốc 东方财富期货. Đo 21 nến gần nhất:
// Sina lệch O/H/L/C một bước giá ở 11/21 nến, khối lượng sai nặng (16/11
// 22:30: EM 5351, Sina 921), có nến phẳng giả (16/11 15:00, v=0) và ghi nến
// 00:00 đêm thứ Sáu sang ngày thứ Hai. Kline 15p của EastMoney thì hỏng lịch
// sử (≈ 11.857.000) → dựng nến 15p từ luồng 1 phút trends2 (giá đúng cả 5
// ngày) và đè lên Sina. Dữ liệu THẬT chụp 17/11/2026 ~10:16 giờ Bắc Kinh.
console.log('\n── Khung 15 phút: ghép trends2 EastMoney lên Sina ──');
{
  const M = await import('../src/lib/eastmoney.js');
  const FX = fileURLToPath(new URL('./fixtures/nen15/', import.meta.url));
  const docFx = (f) => JSON.parse(fs.readFileSync(path.join(FX, f), 'utf8'));
  const trends = docFx('em_trends.json').trends;
  const sinaTho = docFx('sina_15.json').nen;
  const emK = docFx('em_15.json').klines;
  const moc = (s) => Date.parse(s.trim().replace(' ', 'T') + ':00+08:00');
  const nhan = (ts) => new Date(ts + 8 * H).toISOString().slice(0, 16).replace('T', ' ');
  const tangNghiemNgat = (a) => a.every((n, i) => i === 0 || n.timestamp > a[i - 1].timestamp);
  const coDuHam = ['nenTuSina', 'lamSachNenSina', 'gopTrends15', 'ghepNen15']
    .every((f) => typeof M[f] === 'function');
  ok('Có đủ 4 hàm thuần nenTuSina / lamSachNenSina / gopTrends15 / ghepNen15', coDuHam);
  if (coDuHam) {
    const sinaSach = M.lamSachNenSina(M.nenTuSina(sinaTho));
    const nenEM = M.gopTrends15(trends, { nenSina: sinaSach });
    const ghep = M.ghepNen15(sinaSach, nenEM);
    const theoMoc = new Map(ghep.map((n) => [n.timestamp, n]));

    // (1) Mọi nến EM chính thức đã đóng: khớp tuyệt đối O/H/L/C/V
    const daDong = emK.slice(0, -1);                 // nến cuối 10:15 đang chạy lúc chụp
    const lech = [];
    for (const dong of daDong) {
      const [t, o, c, h, l, v] = dong.split(',');
      const n = theoMoc.get(moc(t));
      if (!n) { lech.push(`${t}: thiếu`); continue; }
      const sai = [['O', n.open, +o], ['H', n.high, +h], ['L', n.low, +l], ['C', n.close, +c], ['V', n.volume, +v]]
        .filter(([, a, b]) => a !== b).map(([k, a, b]) => `${k} ${a}≠${b}`);
      if (sai.length) lech.push(`${t}: ${sai.join(' ')}`);
    }
    ok(`${daDong.length} nến EM chính thức đã đóng khớp tuyệt đối O/H/L/C/V`,
       lech.length === 0, lech.slice(0, 4).join(' · ') || `${daDong.length}/${daDong.length}`);

    // (2) Tăng dần nghiêm ngặt, không trùng mốc
    ok('Chuỗi ghép tăng dần nghiêm ngặt, không trùng mốc', tangNghiemNgat(ghep), `${ghep.length} nến`);

    // (3) Nến 00:00 đêm thứ Sáu về đúng chỗ
    const viTri = (s) => ghep.findIndex((n) => n.timestamp === moc(s));
    const i00 = viTri('2026-11-14 00:00');
    ok('Nến 14/11 00:00 nằm giữa 13/11 23:45 và 14/11 00:15',
       i00 > 0 && viTri('2026-11-13 23:45') === i00 - 1 && viTri('2026-11-14 00:15') === i00 + 1);
    ok('Không còn nến ma "2026-11-16 00:00"', viTri('2026-11-16 00:00') < 0);

    // (4) Nến phẳng giả của Sina đã bị thay
    const n1500 = theoMoc.get(moc('2026-11-16 15:00'));
    ok('Nến 16/11 15:00 không phẳng (high > low, volume > 0)',
       !!n1500 && n1500.high > n1500.low && n1500.volume > 0,
       n1500 ? `h ${n1500.high} l ${n1500.low} v ${n1500.volume}` : 'thiếu nến');

    // (5) Ngày trends2 không có open (open=0): giá mở vẫn hợp lệ
    const ngay12 = ghep.filter((n) => nhan(n.timestamp).startsWith('2026-11-12'));
    ok('12/11 (open=0 trong trends2): mọi nến open > 0 và low ≤ open ≤ high',
       ngay12.length > 20 && ngay12.every((n) => n.open > 0 && n.low <= n.open && n.open <= n.high),
       `${ngay12.length} nến`);

    // (6) trends2 rỗng → Sina đã làm sạch
    const chiSina = M.ghepNen15(sinaSach, M.gopTrends15([], { nenSina: sinaSach }));
    ok('trends2 rỗng → kết quả = Sina đã làm sạch',
       chiSina.length === sinaSach.length && chiSina.every((n, i) => n.timestamp === sinaSach[i].timestamp));
    const viTriS = (s) => chiSina.findIndex((n) => n.timestamp === moc(s));
    const j00 = viTriS('2026-11-14 00:00');
    ok('  …vẫn tăng dần nghiêm ngặt và nến 14/11 00:00 đúng chỗ',
       tangNghiemNgat(chiSina) && j00 > 0 && viTriS('2026-11-13 23:45') === j00 - 1
       && viTriS('2026-11-14 00:15') === j00 + 1 && viTriS('2026-11-16 00:00') < 0);

    // (7) Không có mốc phiên không tồn tại
    const mocCam = ghep.filter((n) => ['10:30', '21:00', '09:00', '13:30'].includes(nhan(n.timestamp).slice(11)));
    ok('Không có nến mốc 10:30 / 21:00 / 09:00 / 13:30', mocCam.length === 0,
       mocCam.slice(0, 3).map((n) => nhan(n.timestamp)).join(', '));

    // Hụt phút giữa phiên ≠ mở phiên: điểm :15 volume 0 sau 1–2 phút hụt
    // phải ở lại nến :15, không được đẩy sang nến :30 (đổi giá mở nến đó).
    const p = (t, o, c, v) => `2026-11-18 ${t},${o},${c},${Math.max(o || c, c)},${Math.min(o || c, c)},${v},${v * c * 5},0`;
    const hut = [p('21:00', 22000, 22000, 0), ...Array.from({ length: 12 }, (_, i) =>
      p(`21:${String(i + 1).padStart(2, '0')}`, 22000, 22000 + 5 * i, 10)),   // hụt 21:13, 21:14
      p('21:15', 0, 22100, 0), p('21:16', 22010, 22020, 10), p('21:17', 22020, 22030, 10)];
    const nHut = M.gopTrends15(hut);
    const n15 = nHut.find((n) => n.timestamp === moc('2026-11-18 21:15'));
    const n30 = nHut.find((n) => n.timestamp === moc('2026-11-18 21:30'));
    ok('Hụt phút giữa phiên: điểm 21:15 (v=0) ở lại nến 21:15, không đổi giá mở nến 21:30',
       n15?.close === 22100 && n15?.open === 22000 && n30?.open === 22010,
       `21:15 o ${n15?.open} c ${n15?.close} · 21:30 o ${n30?.open}`);
    const moThat = M.gopTrends15([p('14:59', 22050, 22060, 5), p('15:00', 22060, 22070, 5),
      p('21:00', 22200, 22200, 0), p('21:01', 22210, 22220, 8)]);
    const m2115 = moThat.find((n) => n.timestamp === moc('2026-11-18 21:15'));
    ok('Mở phiên thật (21:00 v=0 sau khoảng hở ≥ 15 phút) vẫn thuộc nến 21:15, giá mở = giá 21:00',
       m2115?.open === 22200 && !moThat.some((n) => n.timestamp === moc('2026-11-18 21:00'))
       && nHut[0].timestamp === moc('2026-11-18 21:15') && nHut[0].open === 22000,
       `21:15 o ${m2115?.open}`);

    // Nến Sina cũ hơn đoạn EM phủ giữ nguyên
    const dauEM = nenEM[0]?.timestamp;
    const cuS = sinaSach.filter((n) => n.timestamp < dauEM);
    ok('Nến Sina cũ hơn đoạn EM phủ giữ nguyên',
       cuS.length > 0 && cuS.every((n) => theoMoc.get(n.timestamp) === n), `${cuS.length} nến`);

    // Luồng trình duyệt: proxy Sina + trends2 → nguồn mạng đã ghép
    const { layNen: layNen15, datGasUrl } = M;
    datGasUrl('https://gas.vidu/exec');
    let loiTrends = false;
    globalThis.fetch = async (u) => {
      const url = String(u);
      if (url.includes('action=nenSina'))
        return { ok: true, json: async () => ({ ok: true, ten: 'Nhôm SHFE (Sina)', nen: sinaTho }) };
      if (url.includes('trends2')) {
        if (loiTrends) throw new TypeError('Failed to fetch');
        return { ok: true, json: async () => ({ data: { name: '沪铝主连', trends } }) };
      }
      return { ok: false, status: 404 };
    };
    const g8 = await layNen15('alm', '15', { boQuaCache: true });
    const g8m = new Map(g8.nen.map((n) => [n.timestamp, n]));
    const n2230 = g8m.get(moc('2026-11-16 22:30'));
    ok('layNen 15p: nến 16/11 22:30 mang khối lượng EastMoney (5351)', n2230?.volume === 5351, `v ${n2230?.volume}`);
    ok('layNen 15p: nguồn mạng, tăng dần nghiêm ngặt', g8.nguon === 'mang' && tangNghiemNgat(g8.nen));
    loiTrends = true;
    const g9 = await layNen15('alm', '15', { boQuaCache: true });
    ok('layNen 15p: trends2 lỗi → vẫn có nến Sina đã làm sạch, không ném lỗi',
       g9.nguon === 'mang' && tangNghiemNgat(g9.nen) && !g9.nen.some((n) => n.timestamp === moc('2026-11-16 00:00')),
       `${g9.nen.length} nến`);
    ok('  …kèm cảnh báo cho người dùng', !!g9.canhBao, g9.canhBao);
    datGasUrl('');
  }
}

console.log(hong ? `\n${hong} phép kiểm SAI` : '\nToàn bộ phép kiểm ĐÚNG');
process.exit(hong ? 1 : 0);
