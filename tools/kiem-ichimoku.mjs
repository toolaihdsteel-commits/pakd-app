// Kiểm phần TOÁN của chỉ báo kỹ thuật (không cần trình duyệt):
//   • Ichimoku: Chuyển đổi / Cơ sở / Mây A / Mây B / Trễ đúng công thức, dịch đúng 26 nến,
//     có 26 điểm mây "tương lai" sau nến cuối, hàm vẽ mây vẽ vượt nến cuối.
//   • apChiBao: bật/tắt MA-MACD-Ichimoku idempotent, luôn isStack=true trên candle_pane
//     (MA từng bị SMM đè mất vì thiếu isStack).
//   • Quạt Gann: 9 tia, 1×1 đi đúng qua điểm 2, tia kéo tới mép khung.
//
// Chạy:  npx vite-node tools/kiem-ichimoku.mjs
import { BO_MA, CHI_BAO_ICHIMOKU, CHI_BAO_MAC_DINH, KIEU_MACD, PANE_MACD, PANE_NEN, TEN_ICHIMOKU,
         apChiBao, docChiBao, thamSoMA, tinhIchimoku, veMayIchimoku } from '../src/lib/chibao.js';
import { CONG_CU, KIEU_VE, OVERLAY_GANN, TEN_GANN, TIA_GANN, tinhTiaGann } from '../src/lib/vekythuat.js';

let hong = 0;
const gan = (ten, thuc, mong, saiSo = 1e-9) => {
  const ok = thuc != null && mong != null && Math.abs(thuc - mong) <= saiSo;
  console.log(`${ok ? '✅' : '❌'} ${ten}: ${thuc == null ? 'null' : +thuc.toFixed(4)} (mong ${mong == null ? 'null' : +mong.toFixed(4)})`);
  if (!ok) hong++;
};
const bang = (ten, thuc, mong) => {
  const ok = JSON.stringify(thuc) === JSON.stringify(mong);
  console.log(`${ok ? '✅' : '❌'} ${ten}: ${JSON.stringify(thuc)}`);
  if (!ok) { console.log(`   mong: ${JSON.stringify(mong)}`); hong++; }
};

// ─── 80 nến giả: sóng sin + xu hướng, cao/thấp lệch không đều để max/min không tầm thường ───
const N = 80;
const nen = [];
for (let i = 0; i < N; i++) {
  const g = 20000 + i * 15 + Math.round(400 * Math.sin(i / 5));
  nen.push({ timestamp: Date.UTC(2026, 0, 1) + i * 86400000, open: g - 20, close: g + ((i % 3) - 1) * 35,
             high: g + 60 + (i % 7) * 11, low: g - 55 - (i % 5) * 13, volume: 1000 + i });
}
// Công thức "tay" tính độc lập để đối chiếu
const giua = (i, p) => {
  if (i < p - 1) return null;
  const doan = nen.slice(i - p + 1, i + 1);
  return (Math.max(...doan.map((x) => x.high)) + Math.min(...doan.map((x) => x.low))) / 2;
};

const kq = tinhIchimoku(nen, { tenkan: 9, kijun: 26, senkou: 52, dich: 26 });

console.log('── Độ dài & mây tương lai ──');
bang('Cùng độ dài dataList', kq.length, N);
bang('Có 26 điểm mây sau nến cuối', kq.tuongLai.length, 26);

console.log('\n── Chuyển đổi (Tenkan, 9 nến) ──');
bang('i=7 chưa đủ 9 nến → null', kq[7].tenkan, null);
gan('i=8 (nến đầu tiên đủ 9)', kq[8].tenkan, giua(8, 9));
gan('i=40', kq[40].tenkan, giua(40, 9));
gan('i=79 (nến cuối)', kq[79].tenkan, giua(79, 9));

console.log('\n── Cơ sở (Kijun, 26 nến) ──');
bang('i=24 → null', kq[24].kijun, null);
gan('i=25', kq[25].kijun, giua(25, 26));
gan('i=63', kq[63].kijun, giua(63, 26));

console.log('\n── Mây A = (Tenkan+Kijun)/2 dịch TỚI 26 ──');
bang('i=50 → null (nguồn i=24 chưa có Kijun)', kq[50].senkouA, null);
gan('i=51 lấy giá trị tính ở i=25', kq[51].senkouA, (giua(25, 9) + giua(25, 26)) / 2);
gan('i=70 lấy giá trị tính ở i=44', kq[70].senkouA, (giua(44, 9) + giua(44, 26)) / 2);

console.log('\n── Mây B = (max 52 + min 52)/2 dịch TỚI 26 ──');
bang('i=76 → null (nguồn i=50 chưa đủ 52 nến)', kq[76].senkouB, null);
gan('i=77 lấy giá trị tính ở i=51', kq[77].senkouB, giua(51, 52));
gan('i=79 lấy giá trị tính ở i=53', kq[79].senkouB, giua(53, 52));

console.log('\n── Trễ (Chikou) = giá đóng cửa dịch LÙI 26 ──');
gan('i=0 = close[26]', kq[0].chikou, nen[26].close);
gan('i=53 = close[79] (điểm Trễ cuối cùng)', kq[53].chikou, nen[79].close);
bang('i=54 → null (không có close[80])', kq[54].chikou, null);

console.log('\n── Mây TƯƠNG LAI (vị trí 80…105 lấy giá trị tính ở 54…79) ──');
gan('tuongLai[0].senkouA (vị trí 80 ← 54)', kq.tuongLai[0].senkouA, (giua(54, 9) + giua(54, 26)) / 2);
gan('tuongLai[25].senkouA (vị trí 105 ← 79)', kq.tuongLai[25].senkouA, (giua(79, 9) + giua(79, 26)) / 2);
gan('tuongLai[25].senkouB (vị trí 105 ← 79)', kq.tuongLai[25].senkouB, giua(79, 52));
bang('Dịch đúng 26: mây A tại i bằng A "chưa dịch" tại i-26 (mọi i≥51)',
     kq.slice(51).every((d, j) => Math.abs(d.senkouA - (giua(51 + j - 26, 9) + giua(51 + j - 26, 26)) / 2) < 1e-9), true);

console.log('\n── Template klinecharts ──');
const qua = CHI_BAO_ICHIMOKU.calc(nen, { calcParams: [9, 26, 52] });
bang('calc() = tinhIchimoku()', JSON.stringify(qua) === JSON.stringify(kq) && qua.tuongLai.length === 26, true);
bang('name / series / precision', [CHI_BAO_ICHIMOKU.name, CHI_BAO_ICHIMOKU.series, CHI_BAO_ICHIMOKU.precision], ['ICHIMOKU', 'price', 0]);
bang('Nhãn chú giải tiếng Việt', CHI_BAO_ICHIMOKU.figures.map((f) => f.title.trim()),
     ['Chuyển đổi:', 'Cơ sở:', 'Mây A:', 'Mây B:', 'Trễ:']);
bang('Màu Chuyển đổi / Cơ sở / Trễ', [0, 1, 4].map((k) => CHI_BAO_ICHIMOKU.styles.lines[k].color),
     ['#dc2626', '#2563eb', '#16a34a']);
bang('Nến quá ít (5 nến) → không lỗi, toàn null',
     tinhIchimoku(nen.slice(0, 5)).every((d) => d.tenkan == null && d.senkouB == null), true);

console.log('\n── Hàm vẽ mây: vẽ VƯỢT nến cuối, tô 2 màu, cắt đúng chỗ giao ──');
const ghi = { fill: [], stroke: 0, mauTo: new Set(), maxX: -Infinity, comp: [] };
const ctx = {
  save() {}, restore() {}, beginPath() {}, closePath() {}, setLineDash() {},
  moveTo(x) { ghi.maxX = Math.max(ghi.maxX, x); }, lineTo(x) { ghi.maxX = Math.max(ghi.maxX, x); },
  fill() { ghi.fill.push(this.fillStyle); ghi.mauTo.add(this.fillStyle); ghi.comp.push(this.globalCompositeOperation); },
  stroke() { ghi.stroke++; },
};
const xAxis = { convertToPixel: (i) => i * 10 };
const yAxis = { convertToPixel: (v) => 30000 - v };
const chartGia = { getVisibleRange: () => ({ from: 0, to: N, realFrom: 0, realTo: N }) };
const tra = veMayIchimoku({ ctx, chart: chartGia, indicator: { result: kq, styles: CHI_BAO_ICHIMOKU.styles }, xAxis, yAxis });
bang('Trả false (để klinecharts vẽ tiếp 5 đường)', tra, false);
bang('Có tô mây', ghi.fill.length > 0, true);
bang('Mây nằm DƯỚI nến (destination-over)', ghi.comp.every((c) => c === 'destination-over'), true);
bang('Vẽ tới vị trí 105 = nến cuối (79) + 26', ghi.maxX, 105 * 10);
bang('Vẽ nối dài 2 viền mây ra tương lai', ghi.stroke, 2);
// Mây đổi chiều: A cắt B → phải có đủ 2 màu
const cat = [];
for (let i = 0; i < 6; i++) cat.push({ senkouA: 100 + i * 10, senkouB: 125 });   // A từ dưới lên trên B
cat.tuongLai = [];
ghi.fill = []; ghi.mauTo = new Set();
veMayIchimoku({ ctx, chart: { getVisibleRange: () => ({ from: 0 }) }, indicator: { result: cat, styles: null }, xAxis, yAxis });
bang('A cắt lên trên B → tô đỏ nhạt rồi xanh nhạt (2 đa giác)', [ghi.fill.length, ghi.mauTo.size], [2, 2]);

console.log('\n── apChiBao: bật/tắt idempotent trên chart giả ──');
function chartGiaLap() {
  const ds = []; const log = [];
  const loc = (f = {}) => ds.filter((x) => (f.paneId == null || x.paneId === f.paneId) && (f.name == null || x.name === f.name));
  return {
    ds, log,
    getIndicators: (f) => loc(f),
    createIndicator: (v, isStack) => { log.push(['tao', v.name, v.paneId, !!isStack]); ds.push({ ...v, calcParams: v.calcParams || [] }); return v.name; },
    removeIndicator: (f) => { const xoa = loc(f); xoa.forEach((x) => ds.splice(ds.indexOf(x), 1)); log.push(['go', f.name || f.paneId]); return xoa.length > 0; },
    overrideIndicator: (o) => { loc(o).forEach((x) => { x.calcParams = o.calcParams; }); log.push(['doi', o.name, o.calcParams.join(',')]); return true; },
  };
}
const c = chartGiaLap();
apChiBao(c, CHI_BAO_MAC_DINH);
bang('Mặc định: chỉ MA [5,10,30,60] trên nến, isStack=true', c.log, [['tao', 'MA', PANE_NEN, true]]);
bang('Mặc định: bộ MA', c.ds[0].calcParams, [5, 10, 30, 60]);
apChiBao(c, CHI_BAO_MAC_DINH);
bang('Gọi lại lần 2 → không tạo trùng, không tính lại', [c.ds.length, c.log.length], [1, 1]);
apChiBao(c, { ...CHI_BAO_MAC_DINH, macd: true, ichimoku: true, boMA: '20-50-200' });
bang('Bật MACD + Ichimoku + đổi bộ MA', c.log.slice(1), [
  ['doi', 'MA', '20,50,200'], ['tao', TEN_ICHIMOKU, PANE_NEN, true], ['tao', 'MACD', PANE_MACD, false]]);
bang('MACD mang màu quy ước VN', c.ds.find((x) => x.name === 'MACD').styles, KIEU_MACD);
apChiBao(c, { ...CHI_BAO_MAC_DINH, ma: false, boMA: '20-50-200' });
bang('Tắt hết → chart trống', c.ds.length, 0);
bang('thamSoMA khoá lạ → về mặc định', thamSoMA('xyz'), [5, 10, 30, 60]);
bang('3 bộ MA', BO_MA.map((b) => b.p.join(',')), ['5,10,20', '5,10,30,60', '20,50,200']);
bang('docChiBao không có localStorage → mặc định', docChiBao(), CHI_BAO_MAC_DINH);

console.log('\n── Quạt Gann ──');
const khung = { width: 1000, height: 500 };
const tia = tinhTiaGann({ x: 100, y: 300 }, { x: 200, y: 200 }, khung);
bang('Đủ 9 tia', tia.map((t) => t.nhan), TIA_GANN.map((t) => t.nhan));
const t11 = tia.find((t) => t.nhan === '1×1');
bang('1×1 đi qua điểm 2 và chạm mép TRÊN tại (400,0)', [t11.cuoi.x, t11.cuoi.y], [400, 0]);
const t81 = tia.find((t) => t.nhan === '8×1');
bang('8×1 dốc gấp 8 → chạm mép trên tại x=137.5', [t81.cuoi.x, t81.cuoi.y], [137.5, 0]);
const t18 = tia.find((t) => t.nhan === '1×8');
bang('1×8 thoải → chạm mép PHẢI tại y=187.5', [t18.cuoi.x, t18.cuoi.y], [1000, 187.5]);
bang('2 điểm thẳng đứng → không vẽ', tinhTiaGann({ x: 100, y: 300 }, { x: 100, y: 200 }, khung), []);
bang('Gốc ở ngoài khung, tia đi ra xa → bỏ', tinhTiaGann({ x: -50, y: 300 }, { x: -60, y: 200 }, khung).length, 0);
const hinh = OVERLAY_GANN.createPointFigures({ coordinates: [{ x: 100, y: 300 }, { x: 200, y: 200 }], bounding: khung });
bang('Overlay: 9 tia + 9 nhãn', [hinh.filter((h) => h.type === 'line').length, hinh.filter((h) => h.type === 'text').length], [9, 9]);
bang('Overlay: tia 1×1 đậm hơn', hinh.find((h) => h.type === 'line' && h.styles)?.styles.size, 2);
bang('Overlay: đang vẽ (1 điểm) → chưa có tia', OVERLAY_GANN.createPointFigures({ coordinates: [{ x: 1, y: 1 }], bounding: khung }), []);
bang('Overlay 2 điểm → totalStep 3', [OVERLAY_GANN.name, OVERLAY_GANN.totalStep], [TEN_GANN, 3]);
bang('Có nút 📐 Gann trên thanh công cụ + kiểu vẽ', [CONG_CU.find((t) => t.k === 'gn')?.overlay, !!KIEU_VE[TEN_GANN]], [TEN_GANN, true]);

console.log(hong ? `\n${hong} phép kiểm SAI` : '\nToàn bộ phép kiểm ĐÚNG');
process.exit(hong ? 1 : 0);
