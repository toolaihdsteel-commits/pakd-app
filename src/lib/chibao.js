// ═══════════════════════════════════════════════════════════════════════════
// CHỈ BÁO KỸ THUẬT — Mây Ichimoku · MACD · MA (tab 📊 Biểu đồ Kỹ thuật)
// ═══════════════════════════════════════════════════════════════════════════
// File này THUẦN: không chạm window/document lúc import (smoke test render phía
// máy chủ và kiem-ichimoku.mjs chạy bằng node). localStorage chỉ đọc bên trong
// hàm, có try/catch. Các hằng CHI_BAO_* là "template" để EastMoneyChart đưa vào
// registerIndicator SAU khi đã nạp động klinecharts (xem napKLine).
//
// ICHIMOKU (chuẩn Hosoda, tham số 9 / 26 / 52, dịch 26):
//   Chuyển đổi (Tenkan) = (cao nhất 9 nến + thấp nhất 9 nến) / 2
//   Cơ sở (Kijun)       = như trên với 26 nến
//   Mây A (Senkou A)    = (Tenkan + Kijun) / 2        — dịch TỚI 26 nến
//   Mây B (Senkou B)    = (cao nhất 52 + thấp nhất 52) / 2 — dịch TỚI 26 nến
//   Trễ (Chikou)        = giá đóng cửa                 — dịch LÙI 26 nến
// Mây xanh (A ≥ B) = xu hướng tăng; giá nằm trên mây = tích cực.
// Lưu ý: TradingView dịch 25 (tính cả nến hiện tại là 1). Ở đây theo đúng
// yêu cầu nghiệp vụ: dịch đủ 26 nến.
// ═══════════════════════════════════════════════════════════════════════════

export const TEN_ICHIMOKU = 'ICHIMOKU';
export const DICH_ICHIMOKU = 26;
export const PANE_NEN = 'candle_pane';
export const PANE_MACD = 'pane_macd';   // id pane cố định → bật/tắt không phụ thuộc id ngẫu nhiên

const laSo = (v) => typeof v === 'number' && Number.isFinite(v);

/** (cao nhất + thấp nhất)/2 của p nến kết thúc tại i; thiếu dữ liệu → null. */
function giuaKhoang(nen, i, p) {
  if (i < p - 1) return null;
  let cao = -Infinity, thap = Infinity;
  for (let j = i - p + 1; j <= i; j++) {
    const h = nen[j]?.high, l = nen[j]?.low;
    if (!laSo(h) || !laSo(l)) return null;
    if (h > cao) cao = h;
    if (l < thap) thap = l;
  }
  return (cao + thap) / 2;
}

/**
 * Tính Ichimoku cho mảng nến {open,high,low,close,...}.
 * Trả mảng CÙNG ĐỘ DÀI với nen, mỗi phần tử {tenkan,kijun,senkouA,senkouB,chikou}
 * (null khi chưa đủ nến). Kèm thuộc tính `tuongLai`: mảng `dich` phần tử
 * {senkouA,senkouB} cho các vị trí n, n+1, … n+dich-1 — phần mây vượt quá cây
 * nến cuối, klinecharts không tự vẽ được vì chỉ báo tính theo index dataList.
 */
export function tinhIchimoku(nen = [], { tenkan = 9, kijun = 26, senkou = 52, dich = DICH_ICHIMOKU } = {}) {
  const n = nen.length;
  const tk = new Array(n), kj = new Array(n), sa = new Array(n), sb = new Array(n);
  for (let i = 0; i < n; i++) {
    tk[i] = giuaKhoang(nen, i, tenkan);
    kj[i] = giuaKhoang(nen, i, kijun);
    sa[i] = tk[i] != null && kj[i] != null ? (tk[i] + kj[i]) / 2 : null;   // CHƯA dịch
    sb[i] = giuaKhoang(nen, i, senkou);                                      // CHƯA dịch
  }
  const kq = new Array(n);
  for (let i = 0; i < n; i++) {
    const nguon = i - dich;           // mây tại i là giá trị tính ở i-26
    const sau = i + dich;             // đường Trễ tại i là giá đóng cửa ở i+26
    const c = nen[sau]?.close;
    kq[i] = {
      tenkan: tk[i],
      kijun: kj[i],
      senkouA: nguon >= 0 ? sa[nguon] : null,
      senkouB: nguon >= 0 ? sb[nguon] : null,
      chikou: sau < n && laSo(c) ? c : null,
    };
  }
  // Mây "tương lai": vị trí n+j lấy giá trị tính ở n+j-26 (vẫn nằm trong dữ liệu)
  const tuongLai = [];
  for (let j = 0; j < dich; j++) {
    const nguon = n + j - dich;
    tuongLai.push({
      senkouA: nguon >= 0 && nguon < n ? sa[nguon] : null,
      senkouB: nguon >= 0 && nguon < n ? sb[nguon] : null,
    });
  }
  kq.tuongLai = tuongLai;
  return kq;
}

// Màu: Chuyển đổi đỏ, Cơ sở xanh dương, Trễ xanh lá (theo yêu cầu); viền mây
// dùng tông lá mạ / hồng để không lẫn với nến và đường Trễ.
export const MAU_ICHIMOKU = {
  tenkan: '#dc2626', kijun: '#2563eb', senkouA: '#65a30d', senkouB: '#e11d48', chikou: '#16a34a',
  mayTang: 'rgba(22,163,74,.15)',   // A ≥ B — xanh lá nhạt
  mayGiam: 'rgba(220,38,38,.13)',   // A < B  — đỏ nhạt
};
const net = (color, size = 1) => ({ style: 'solid', smooth: false, size, dashedValue: [2, 2], color });

/**
 * Vẽ MÂY (tô vùng giữa Mây A và Mây B) trên toàn vùng nhìn + 26 nến tương lai,
 * và nối tiếp 2 đường viền mây ra phần tương lai. Trả false để klinecharts vẽ
 * tiếp các đường mặc định (Chuyển đổi, Cơ sở, Trễ, viền mây trong vùng dữ liệu)
 * ĐÈ LÊN mây. xAxis.convertToPixel(index) nhận cả index vượt dataList.
 */
export function veMayIchimoku({ ctx, chart, indicator, xAxis, yAxis }) {
  const kq = indicator?.result;
  if (!ctx || !kq?.length || !xAxis || !yAxis) return false;
  const n = kq.length;
  const tl = Array.isArray(kq.tuongLai) ? kq.tuongLai : [];
  const tam = chart?.getVisibleRange?.();
  const dau = Math.max(0, (laSo(tam?.from) ? tam.from : 0) - 1);
  const cuoi = n - 1 + tl.length;
  const lay = (i) => (i < n ? kq[i] : tl[i - n]);
  const kieu = indicator.styles?.lines || [];
  const mauA = kieu[2]?.color || MAU_ICHIMOKU.senkouA;
  const mauB = kieu[3]?.color || MAU_ICHIMOKU.senkouB;

  // ── 1. Tô mây: gom các đoạn liên tiếp cùng chiều (A≥B / A<B) thành 1 đa giác,
  // cắt đúng tại điểm giao nhau để 2 màu không chờm lên nhau.
  // 'destination-over' = tô XUỐNG DƯỚI những gì đã vẽ (nến, MA, SMM) → mây làm
  // nền, không phủ màu lên thân nến.
  ctx.save();
  ctx.globalCompositeOperation = 'destination-over';
  let doan = null;
  const dong = () => {
    if (doan && doan.a.length > 1) {
      ctx.fillStyle = doan.tang ? MAU_ICHIMOKU.mayTang : MAU_ICHIMOKU.mayGiam;
      ctx.beginPath();
      ctx.moveTo(doan.a[0].x, doan.a[0].y);
      for (let k = 1; k < doan.a.length; k++) ctx.lineTo(doan.a[k].x, doan.a[k].y);
      for (let k = doan.b.length - 1; k >= 0; k--) ctx.lineTo(doan.b[k].x, doan.b[k].y);
      ctx.closePath();
      ctx.fill();
    }
    doan = null;
  };
  for (let i = dau; i <= cuoi; i++) {
    const d = lay(i);
    if (!laSo(d?.senkouA) || !laSo(d?.senkouB)) { dong(); continue; }
    const x = xAxis.convertToPixel(i);
    const ya = yAxis.convertToPixel(d.senkouA), yb = yAxis.convertToPixel(d.senkouB);
    const tang = d.senkouA >= d.senkouB;
    if (doan && doan.tang !== tang) {
      // Giao cắt giữa nến trước và nến này: nội suy tuyến tính theo pixel
      const t0 = doan.cuoi, lech0 = t0.ya - t0.yb, lech1 = ya - yb;
      const r = lech0 === lech1 ? 0 : lech0 / (lech0 - lech1);
      const giao = { x: t0.x + (x - t0.x) * r, y: t0.ya + (ya - t0.ya) * r };
      doan.a.push(giao); doan.b.push(giao);
      dong();
      doan = { tang, a: [giao], b: [giao] };
    }
    if (!doan) doan = { tang, a: [], b: [] };
    doan.a.push({ x, y: ya }); doan.b.push({ x, y: yb });
    doan.cuoi = { x, ya, yb };
  }
  dong();
  ctx.restore();

  // ── 2. Viền mây phần TƯƠNG LAI (từ nến cuối ra thêm 26 nến). Phần trong vùng
  // dữ liệu do klinecharts tự vẽ theo figures → không vẽ trùng.
  if (tl.length) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = 1;
    if (typeof ctx.setLineDash === 'function') ctx.setLineDash([]);
    [['senkouA', mauA], ['senkouB', mauB]].forEach(([khoa, mau]) => {
      ctx.strokeStyle = mau;
      ctx.beginPath();
      let dangVe = false;
      for (let i = n - 1; i <= cuoi; i++) {
        const v = lay(i)?.[khoa];
        if (!laSo(v)) { dangVe = false; continue; }
        const x = xAxis.convertToPixel(i), y = yAxis.convertToPixel(v);
        if (dangVe) ctx.lineTo(x, y); else { ctx.moveTo(x, y); dangVe = true; }
      }
      ctx.stroke();
    });
    ctx.restore();
  }
  return false;
}

// series:'price' → dùng CHUNG trục giá với nến (vẽ đè lên candle_pane).
// Mây A/B có type 'line' để klinecharts tự vẽ viền mây trong vùng dữ liệu và
// hiện số trong chú giải; phần mây tô + phần tương lai do veMayIchimoku vẽ.
export const CHI_BAO_ICHIMOKU = {
  name: TEN_ICHIMOKU, shortName: 'Ichimoku', series: 'price', precision: 0,
  calcParams: [9, 26, 52],
  figures: [
    { key: 'tenkan', title: 'Chuyển đổi: ', type: 'line' },
    { key: 'kijun', title: 'Cơ sở: ', type: 'line' },
    { key: 'senkouA', title: 'Mây A: ', type: 'line' },
    { key: 'senkouB', title: 'Mây B: ', type: 'line' },
    { key: 'chikou', title: 'Trễ: ', type: 'line' },
  ],
  styles: {
    lines: [
      net(MAU_ICHIMOKU.tenkan), net(MAU_ICHIMOKU.kijun),
      net(MAU_ICHIMOKU.senkouA), net(MAU_ICHIMOKU.senkouB), net(MAU_ICHIMOKU.chikou),
    ],
  },
  calc: (dataList, indicator) => {
    const p = indicator?.calcParams || [];
    return tinhIchimoku(dataList, {
      tenkan: p[0] ?? 9, kijun: p[1] ?? 26, senkou: p[2] ?? 52, dich: p[3] ?? p[1] ?? DICH_ICHIMOKU,
    });
  },
  draw: veMayIchimoku,
};

// ─── MACD (chỉ báo CÓ SẴN của klinecharts) — chỉ đè màu ───────────────────
// Quy ước VN: cột dương xanh lá, cột âm đỏ. Hàm styles của cột MACD trong
// klinecharts đọc indicator.styles.bars[0].upColor/downColor → truyền đủ bộ
// thuộc tính (thiếu borderSize… là cột rỗng không có viền).
export const KIEU_MACD = {
  lines: [net('#2563eb'), net('#d97706')],   // DIF xanh dương · DEA cam
  bars: [{
    style: 'fill', borderStyle: 'solid', borderSize: 1, borderDashedValue: [2, 2],
    upColor: '#16a34a', downColor: '#dc2626', noChangeColor: '#94a3b8',
  }],
};

// ─── MA — 3 bộ chu kỳ chọn nhanh ───────────────────────────────────────────
export const BO_MA = [
  { k: '5-10-20', l: 'MA 5·10·20', p: [5, 10, 20] },
  { k: '5-10-30-60', l: 'MA 5·10·30·60', p: [5, 10, 30, 60] },   // mặc định klinecharts
  { k: '20-50-200', l: 'MA 20·50·200', p: [20, 50, 200] },
];
export const thamSoMA = (k) => (BO_MA.find((b) => b.k === k) || BO_MA[1]).p;

// ─── Trạng thái bật/tắt lưu trên máy ──────────────────────────────────────
export const KHOA_CHI_BAO = 'pakd_chart_chibao';
export const CHI_BAO_MAC_DINH = { ma: true, boMA: '5-10-30-60', macd: false, ichimoku: false };

export function docChiBao() {
  try {
    const d = JSON.parse(localStorage.getItem(KHOA_CHI_BAO) || 'null');
    if (!d || typeof d !== 'object') return { ...CHI_BAO_MAC_DINH };
    return {
      ma: typeof d.ma === 'boolean' ? d.ma : CHI_BAO_MAC_DINH.ma,
      boMA: BO_MA.some((b) => b.k === d.boMA) ? d.boMA : CHI_BAO_MAC_DINH.boMA,
      macd: d.macd === true,
      ichimoku: d.ichimoku === true,
    };
  } catch { return { ...CHI_BAO_MAC_DINH }; }
}

export function luuChiBao(cb) {
  try { localStorage.setItem(KHOA_CHI_BAO, JSON.stringify(cb)); } catch { /* chế độ riêng tư / đầy quota */ }
}

/**
 * Đồng bộ chỉ báo trên chart với trạng thái cb — gọi bao nhiêu lần cũng được
 * (idempotent): có rồi thì thôi, thiếu thì tạo, thừa thì gỡ.
 * isStack=true BẮT BUỘC cho chỉ báo trên candle_pane: mặc định false khiến chỉ
 * báo mới THAY THẾ cả pane (MA từng bị SMM đè mất).
 * Chỉ báo sống theo chart chứ không theo dữ liệu → setSymbol/setPeriod/nạp lại
 * (Bóc VAT) giữ nguyên, klinecharts tự tính lại trên nến mới.
 */
export function apChiBao(chart, cb) {
  if (!chart || !cb) return;
  const co = (loc) => chart.getIndicators(loc)[0] || null;

  const locMA = { paneId: PANE_NEN, name: 'MA' };
  const pMA = thamSoMA(cb.boMA);
  const ma = co(locMA);
  if (cb.ma) {
    if (!ma) chart.createIndicator({ ...locMA, calcParams: [...pMA] }, true);
    // overrideIndicator (v10) lọc theo paneId+name; chỉ gọi khi bộ chu kỳ đổi,
    // vì mỗi lần override calcParams là klinecharts tính lại toàn bộ.
    else if (JSON.stringify(ma.calcParams) !== JSON.stringify(pMA)) chart.overrideIndicator({ ...locMA, calcParams: [...pMA] });
  } else if (ma) chart.removeIndicator(locMA);

  const locIchi = { paneId: PANE_NEN, name: TEN_ICHIMOKU };
  const ichi = co(locIchi);
  if (cb.ichimoku && !ichi) chart.createIndicator({ ...locIchi }, true);
  else if (!cb.ichimoku && ichi) chart.removeIndicator(locIchi);

  // MACD: pane riêng id cố định. createIndicator v10 trả về ID CHỈ BÁO (không
  // phải paneId) nên tự đặt paneId để gỡ cho chắc. Pane tạo sau VOL → nằm dưới VOL.
  const locMACD = { paneId: PANE_MACD, name: 'MACD' };
  const macd = co(locMACD);
  // precision 1: mặc định 4 số lẻ → trục hiện "200.0000" rất rối (MACD nhôm cỡ hàng trăm ¥/t)
  if (cb.macd && !macd) chart.createIndicator({ ...locMACD, precision: 1, styles: KIEU_MACD });
  else if (!cb.macd && macd) chart.removeIndicator({ paneId: PANE_MACD });
}
