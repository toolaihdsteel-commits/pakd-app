// ═══════════════════════════════════════════════════════════════════════════
// CÔNG CỤ VẼ KỸ THUẬT — Đường xu hướng & Đường ngang (hỗ trợ/kháng cự)
// ═══════════════════════════════════════════════════════════════════════════
// Nét vẽ được lưu vào localStorage nên đóng trình duyệt mở lại vẫn còn.
//
// Quy tắc phạm vi (khác nhau có chủ đích):
//   • ĐƯỜNG NGANG  dùng chung cho MỌI khung thời gian của cùng một mã.
//     Mức kháng cự 24.000 thì nhìn ở khung Ngày hay 1 giờ vẫn là 24.000.
//   • ĐƯỜNG XU HƯỚNG chỉ hiện đúng khung đã vẽ. Đường nối 2 đỉnh trên biểu đồ
//     Ngày mà đem sang khung 15 phút thì vô nghĩa.
// ═══════════════════════════════════════════════════════════════════════════

export const TEN_NGANG = 'horizontalStraightLine';
export const TEN_XU_HUONG = 'segment';
export const TEN_KENH = 'priceChannelLine';       // kênh giá song song (3 điểm)
export const TEN_FIB = 'fibonacciLine';           // thoái lui Fibonacci (2 điểm)
export const TEN_GANN = 'gannFan';                // quạt Gann (2 điểm) — overlay TỰ ĐĂNG KÝ, xem OVERLAY_GANN

// soDiem: để thanh công cụ nhắc đúng "bấm mấy điểm" — klinecharts không tự nói.
export const CONG_CU = [
  { k: '',   l: '✥ Chọn',           overlay: null,          soDiem: 0, mota: 'Chọn / di chuyển nét vẽ' },
  { k: 'xh', l: '╱ Đường xu hướng', overlay: TEN_XU_HUONG,  soDiem: 2, mota: 'Bấm 2 điểm để nối thành đường xu hướng' },
  { k: 'ng', l: '━ Đường ngang',    overlay: TEN_NGANG,     soDiem: 1, mota: 'Bấm 1 điểm để đặt mức hỗ trợ / kháng cự' },
  { k: 'kg', l: '∥ Kênh giá',       overlay: TEN_KENH,      soDiem: 3, mota: 'Bấm 2 điểm vẽ cạnh trên, điểm 3 định bề rộng kênh' },
  { k: 'fb', l: '≡ Fibonacci',      overlay: TEN_FIB,       soDiem: 2, mota: 'Bấm đỉnh rồi đáy (hoặc ngược lại) để trải các mức thoái lui' },
  { k: 'gn', l: '📐 Gann',           overlay: TEN_GANN,      soDiem: 2, mota: 'Bấm điểm gốc (đỉnh/đáy), rồi điểm 2 định tia 1×1 (45° chuẩn)' },
];

// Màu tách bạch với nến (xanh lá / đỏ) để không nhìn nhầm
export const KIEU_VE = {
  [TEN_XU_HUONG]: {
    line: { color: '#2563eb', size: 2 },
    point: { color: '#2563eb', borderColor: 'rgba(37,99,235,.25)', activeColor: '#1d4ed8' },
  },
  [TEN_NGANG]: {
    line: { color: '#9333ea', size: 2, style: 'dashed', dashedValue: [6, 4] },
    point: { color: '#9333ea', borderColor: 'rgba(147,51,234,.25)', activeColor: '#7e22ce' },
  },
  [TEN_KENH]: {
    line: { color: '#0d9488', size: 2 },
    point: { color: '#0d9488', borderColor: 'rgba(13,148,136,.25)', activeColor: '#0f766e' },
  },
  [TEN_FIB]: {
    line: { color: '#d97706', size: 1 },
    text: { color: '#b45309' },
    point: { color: '#d97706', borderColor: 'rgba(217,119,6,.25)', activeColor: '#b45309' },
  },
  // Nhãn tỉ lệ: chữ tím trên nền trắng mờ (mặc định klinecharts là chữ trắng nền xanh, đè nến rất rối)
  [TEN_GANN]: {
    line: { color: '#8b5cf6', size: 1 },
    text: { color: '#6d28d9', size: 10, weight: 'bold', backgroundColor: 'rgba(255,255,255,.8)', borderColor: 'transparent',
            paddingLeft: 2, paddingRight: 2, paddingTop: 1, paddingBottom: 1 },
    point: { color: '#7c3aed', borderColor: 'rgba(124,58,237,.25)', activeColor: '#6d28d9' },
  },
};

// ═══ QUẠT GANN (Gann Fan) ═════════════════════════════════════════════════
// Điểm 1 = gốc (đỉnh/đáy quan trọng), điểm 2 định tia 1×1 = "đường 45° chuẩn":
// 1 đơn vị giá đi cùng 1 đơn vị thời gian. Các tia khác có độ dốc (tính theo
// PIXEL) bằng k lần tia 1×1: "giá×thời gian" 1×8 thoải nhất … 8×1 dốc nhất.
// Vì dựng từ toạ độ 2 điểm nên phóng to/thu nhỏ, gạt VAT (cả 2 điểm cùng nhân
// hệ số) thì quạt vẫn giữ đúng hình.
export const TIA_GANN = [
  { nhan: '1×8', k: 1 / 8 }, { nhan: '1×4', k: 1 / 4 }, { nhan: '1×3', k: 1 / 3 }, { nhan: '1×2', k: 1 / 2 },
  { nhan: '1×1', k: 1 },
  { nhan: '2×1', k: 2 }, { nhan: '3×1', k: 3 }, { nhan: '4×1', k: 4 }, { nhan: '8×1', k: 8 },
];

/**
 * Tính 9 tia quạt Gann (thuần toán, không cần chart): từ gốc kéo tới mép khung.
 * goc, diem2: {x,y} pixel · khung: {width,height}. Tia nằm hẳn ngoài khung bị bỏ.
 */
export function tinhTiaGann(goc, diem2, khung) {
  const dx = diem2.x - goc.x, dy = diem2.y - goc.y;
  if (Math.abs(dx) < 1) return [];          // 2 điểm thẳng đứng → không định được tỉ lệ thời gian
  const W = khung?.width ?? 0, H = khung?.height ?? 0;
  const kq = [];
  for (const t of TIA_GANN) {
    const vx = dx, vy = dy * t.k;
    let tMax = Infinity;
    if (vx > 0) tMax = Math.min(tMax, (W - goc.x) / vx); else tMax = Math.min(tMax, -goc.x / vx);
    if (vy > 0) tMax = Math.min(tMax, (H - goc.y) / vy); else if (vy < 0) tMax = Math.min(tMax, -goc.y / vy);
    if (!(tMax > 0) || !Number.isFinite(tMax)) continue;
    kq.push({ nhan: t.nhan, k: t.k, dau: { x: goc.x, y: goc.y }, cuoi: { x: goc.x + vx * tMax, y: goc.y + vy * tMax } });
  }
  return kq;
}

// Template cho registerOverlay (đăng ký 1 lần trong EastMoneyChart, sau napKLine).
// totalStep = số điểm + 1 (quy ước klinecharts: bước cuối là "đã xong").
// Điểm lưu dạng {timestamp,value} như mọi nét khác → luuVe/khoiPhucVe dùng chung,
// hệ số VAT nhân/chia vào value như Fibonacci.
export const OVERLAY_GANN = {
  name: TEN_GANN,
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, bounding }) => {
    if (!coordinates || coordinates.length < 2) return [];
    const hinh = [];
    for (const t of tinhTiaGann(coordinates[0], coordinates[1], bounding)) {
      const chinh = t.k === 1;              // 1×1 đậm hơn các tia còn lại
      hinh.push({ type: 'line', attrs: { coordinates: [t.dau, t.cuoi] },
                  styles: chinh ? { size: 2, color: '#6d28d9' } : undefined });
      hinh.push({ type: 'text', ignoreEvent: true,
                  attrs: { x: t.cuoi.x, y: t.cuoi.y, text: t.nhan,
                           align: t.cuoi.x >= t.dau.x ? 'right' : 'left',          // chữ luôn nằm TRONG khung
                           baseline: t.cuoi.y <= t.dau.y ? 'top' : 'bottom' },
                  styles: chinh ? { color: '#4c1d95' } : undefined });
    }
    return hinh;
  },
};

const KHOA = (ma) => `pakd:ve-ky-thuat:${ma}`;

function doc(ma) {
  try {
    const s = localStorage.getItem(KHOA(ma));
    const d = s ? JSON.parse(s) : [];
    return Array.isArray(d) ? d : [];
  } catch { return []; }
}

// Nét vẽ LUÔN lưu ở mặt bằng GỒM VAT (đơn vị chuẩn), bất kể lúc vẽ đang bật
// hay tắt "bóc VAT". Nhờ vậy gạt công tắc VAT không làm lệch nét đã vẽ.
//   heSo = 1/1,13 khi đang bóc VAT, = 1 khi hiển thị giá gồm VAT.
/** Lưu nét vẽ đang có trên chart, GIỮ NGUYÊN nét của các khung khác. */
export function luuVe(chart, ma, khung, heSo = 1) {
  if (!chart) return 0;
  // Nét của khung khác không nằm trên chart lúc này → phải bê nguyên từ bản cũ
  // sang, nếu không mỗi lần đổi khung là xoá mất nét đã vẽ ở khung trước.
  const giuLai = doc(ma).filter((v) => v.name !== TEN_NGANG && v.khung !== khung);

  const hienTai = chart.getOverlays()
    .filter((o) => Array.isArray(o.points) && o.points.length
                   && o.points.every((p) => p?.timestamp != null && p?.value != null))
    .map((o) => ({
      name: o.name,
      khung: o.extendData?.khung ?? khung,
      points: o.points.map((p) => ({ timestamp: p.timestamp, value: p.value / heSo })),
    }));

  try { localStorage.setItem(KHOA(ma), JSON.stringify([...giuLai, ...hienTai])); } catch { /* đầy quota */ }
  return hienTai.length;
}

/** Xoá hết nét trên chart rồi vẽ lại đúng những nét thuộc phạm vi (mã, khung). */
export function khoiPhucVe(chart, ma, khung, heSo = 1) {
  if (!chart) return 0;
  chart.removeOverlay();
  let n = 0;
  for (const v of doc(ma)) {
    if (v.name !== TEN_NGANG && v.khung !== khung) continue;   // xu hướng: đúng khung mới hiện
    if (!v.points?.length) continue;
    chart.createOverlay({
      name: v.name,
      points: v.points.map((p) => ({ ...p, value: p.value * heSo })),
      styles: KIEU_VE[v.name],
      extendData: { khung: v.khung ?? khung },
    });
    n++;
  }
  return n;
}

/** Xoá toàn bộ nét vẽ của mã (mọi khung). */
export function xoaHet(chart, ma) {
  chart?.removeOverlay();
  try { localStorage.removeItem(KHOA(ma)); } catch { /* bỏ qua */ }
}

/** Đếm nét đang lưu, tách theo loại — dùng cho nhãn nút. */
export function demVe(ma, khung) {
  const d = doc(ma);
  // Mọi nét KHÔNG phải đường ngang đều theo phạm vi từng khung (xu hướng,
  // kênh giá, Fibonacci) — quy tắc chung, thêm công cụ mới không phải sửa đây.
  return {
    ngang: d.filter((v) => v.name === TEN_NGANG).length,
    xuHuong: d.filter((v) => v.name !== TEN_NGANG && v.khung === khung).length,
    tong: d.length,
  };
}
