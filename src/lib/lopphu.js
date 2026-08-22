// ═══════════════════════════════════════════════════════════════════════════
// ĐƯỜNG SMM GIAO NGAY vẽ đè lên nến SHFE
// ═══════════════════════════════════════════════════════════════════════════
// Mục đích duy nhất: nhìn ra BASIS — khoảng hở giữa giá giao ngay (SMM) và giá
// phái sinh (SHFE). Đây là con số phòng mua hàng thực sự dùng.
//
// HỆ QUY CHIẾU: CNY/tấn — trùng đúng đơn vị của nến nên KHÔNG phải quy đổi gì,
// không có sai số nào. Đường SMM và nến đọc chung một trục.
//
// VAT: SHFE và SMM đều là giá GỒM VAT 13% Trung Quốc. Công tắc "bóc VAT" chia
// cả hai cho 1,13 — basis giữ nguyên tỉ lệ, chỉ đổi mặt bằng đọc số.
//
// LIỀN MẠCH: marketData do GitHub Actions ghi 1 lần/ngày, nghỉ cuối tuần và có
// lúc job hỏng vài ngày. Bản trước đặt ngưỡng "cũ quá 7 ngày thì bỏ" nên mỗi
// khoảng trống là đường bị ĐỨT — nhìn như giá lúc có lúc không. Nay giữ mức
// gần nhất xuyên qua khoảng trống, và chỉ vẽ TRONG vùng thực sự có số liệu;
// ngoài vùng đó để trống hẳn thay vì kéo một đường phẳng giả.
// ═══════════════════════════════════════════════════════════════════════════

export const VAT_TQ = 0.13;
export const KHUNG_CO_SMM = ['101', '102', '103'];   // Ngày · Tuần · Tháng
const NGAY = 86400000;
const DUOI_CUOI = 10 * NGAY;   // cho phép kéo dài quá mốc cuối tối đa 10 ngày

const so = (v) => { const f = parseFloat(v); return isNaN(f) ? null : f; };

// ─── Bảng SMM theo ngày ───────────────────────────────────────────────────
export function dungTraCuu(marketData = []) {
  const ds = [];
  for (const r of marketData) {
    const ngay = String(r?.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ngay)) continue;
    const ts = Date.parse(ngay + 'T00:00:00+08:00');   // nến cũng đóng dấu giờ Bắc Kinh
    const smm = so(r.smm_cny);
    if (isNaN(ts) || !smm) continue;
    ds.push({ ts, smm });
  }
  ds.sort((a, b) => a.ts - b.ts);
  return ds;
}

/** Bản ghi mới nhất KHÔNG muộn hơn ts (tìm nhị phân). */
function ganNhat(ds, ts) {
  let lo = 0, hi = ds.length - 1, kq = null;
  while (lo <= hi) {
    const g = (lo + hi) >> 1;
    if (ds[g].ts <= ts) { kq = ds[g]; lo = g + 1; } else hi = g - 1;
  }
  return kq;
}

/**
 * Hàm tra SMM cho từng cây nến. Giữ mức gần nhất xuyên khoảng trống để đường
 * liền mạch, nhưng chỉ trong vùng có số liệu thật.
 */
export function taoTraSMM(ds, bocVat) {
  if (!ds.length) return () => null;
  const f = bocVat ? 1 / (1 + VAT_TQ) : 1;
  const dau = ds[0].ts, cuoi = ds[ds.length - 1].ts + DUOI_CUOI;
  return (ts) => {
    if (ts < dau || ts > cuoi) return null;   // ngoài vùng có dữ liệu → để trống
    const r = ganNhat(ds, ts);
    return r ? Math.round(r.smm * f) : null;
  };
}

/** Vùng thời gian có số liệu SMM — dùng để báo cho người dùng biết. */
export function vungCoSMM(ds) {
  if (!ds.length) return null;
  const iso = (ts) => new Date(ts + 8 * 3600000).toISOString().slice(0, 10);
  return { tu: iso(ds[0].ts), den: iso(ds[ds.length - 1].ts), soNgay: ds.length };
}

// ═══ Nguồn dùng chung cho chỉ báo ════════════════════════════════════════
// registerIndicator là hàm TOÀN CỤC, callback calc không bắt được state React.
// Vì vậy component ghi dữ liệu vào đây, chỉ báo đọc ra lúc tính.
export const NGUON = { traSMM: null };

// series:'price' = dùng CHUNG thang giá với nến → không cần trục phụ, không lệch tỷ lệ.
export const CHI_BAO_SMM = {
  name: 'SMM', shortName: 'SMM giao ngay', series: 'price', precision: 0,
  figures: [{ key: 'smm', title: 'SMM ', type: 'line' }],
  styles: { lines: [{ color: '#ea580c', size: 2 }] },
  calc: (dataList) => dataList.map((d) => ({ smm: NGUON.traSMM?.(d.timestamp) ?? null })),
};
