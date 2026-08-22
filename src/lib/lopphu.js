// ═══════════════════════════════════════════════════════════════════════════
// LỚP PHỦ NGHIỆP VỤ — SMM giao ngay · CIF thực mua · Giá sàn
// ═══════════════════════════════════════════════════════════════════════════
// Đưa 3 nguồn số liệu của công ty lên chung biểu đồ nến SHFE.
//
// HỆ QUY CHIẾU: CNY/tấn — giữ nguyên trục của nến, KHÔNG quy nến sang USD.
//   Lý do: SMM vốn đã là CNY/tấn (trùng đơn vị nến) nên đường quan trọng nhất
//   là basis SMM↔SHFE không cần quy đổi, không có sai số nào. Nếu quy nến sang
//   USD thì phải nhân 6.713 nến với tỷ giá, mà tỷ giá lịch sử chỉ có ~400 ngày
//   — chính codebase này đã cảnh báo ở backfillMarketHistory rằng dùng tỷ giá
//   hôm nay cho số liệu cũ làm giá bị thổi phồng 10-18%.
//
// QUY ĐỔI (luôn dùng tỷ giá CÙNG NGÀY, thiếu tỷ giá thì BỎ điểm chứ không lấp):
//   CIF     : CNY/tấn = priceFC × (usd_vnd / cny_vnd)
//   Giá sàn : CNY/tấn = publishedFloor × 1000 / cny_vnd
//   SMM     : giữ nguyên smm_cny
//
// VAT: SHFE và SMM là giá GỒM VAT 13% Trung Quốc; CIF là giá nhập khẩu KHÔNG
//   có VAT đó. Khi bật "bóc VAT", nến + SMM được chia 1,13 để khoảng hở tới CIF
//   phản ánh đúng premium thuần (gia công, cước), không lẫn thuế.
// ═══════════════════════════════════════════════════════════════════════════

import { parseVNDate } from './core';

export const VAT_TQ = 0.13;
export const KHUNG_CO_LOP_PHU = ['101', '102', '103'];   // Ngày · Tuần · Tháng
const NGAY = 86400000;
const HAN_SMM = 7 * NGAY;      // SMM cũ hơn 7 ngày thì bỏ, không kéo phẳng
const HAN_FX = 45 * NGAY;      // tỷ giá đổi chậm nên cho phép cũ hơn

const so = (v) => { const f = parseFloat(v); return isNaN(f) ? null : f; };
const heSoVat = (bocVat) => (bocVat ? 1 / (1 + VAT_TQ) : 1);

/** Mốc 00:00 giờ Bắc Kinh của ngày chứa ts — để khớp với dấu thời gian của nến. */
const dauNgayBK = (ts) => {
  const d = new Date(ts + 8 * 3600000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 8 * 3600000;
};

// ─── Bảng tra theo ngày (SMM + tỷ giá) ────────────────────────────────────
export function dungTraCuu(marketData = []) {
  const ds = [];
  for (const r of marketData) {
    const ngay = String(r?.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ngay)) continue;
    const ts = Date.parse(ngay + 'T00:00:00+08:00');
    if (isNaN(ts)) continue;
    ds.push({ ts, smmCny: so(r.smm_cny), usdVnd: so(r.usd_vnd), cnyVnd: so(r.cny_vnd) });
  }
  ds.sort((a, b) => a.ts - b.ts);
  return ds;
}

/** Bản ghi mới nhất KHÔNG muộn hơn ts (nhị phân). */
function ganNhat(ds, ts) {
  let lo = 0, hi = ds.length - 1, kq = null;
  while (lo <= hi) {
    const g = (lo + hi) >> 1;
    if (ds[g].ts <= ts) { kq = ds[g]; lo = g + 1; } else hi = g - 1;
  }
  return kq;
}

/** Tỷ giá USD→CNY tại thời điểm ts. Không có thì trả null (KHÔNG lấp bừa). */
function tyGiaUsdCny(ds, ts) {
  const r = ganNhat(ds, ts);
  if (!r || !r.usdVnd || !r.cnyVnd || ts - r.ts > HAN_FX) return null;
  return r.usdVnd / r.cnyVnd;
}

// ─── 1. SMM giao ngay → giá trị theo từng nến ─────────────────────────────
export function taoTraSMM(ds, bocVat) {
  const f = heSoVat(bocVat);
  return (ts) => {
    const r = ganNhat(ds, ts);
    if (!r || !r.smmCny || ts - r.ts > HAN_SMM) return null;
    return Math.round(r.smmCny * f);
  };
}

// ─── 2. CIF thực mua → danh sách sự kiện đã sắp xếp ───────────────────────
// Trả về [{ts, cny, mota[]}] — nến nào chứa sự kiện thì chấm 1 điểm ở đó.
export function taoDsCIF(allRawImportPrices = [], ds, mac = 'ALL') {
  const ra = [];
  for (const u of allRawImportPrices) {
    const cif = so(u?.priceFC);
    if (!cif || cif <= 0) continue;
    if (mac !== 'ALL' && u.alloy !== mac) continue;
    const ts = parseVNDate(u.updateDate);          // parseVNDate trả TIMESTAMP (số)
    if (!ts) continue;
    const k = tyGiaUsdCny(ds, ts);
    if (!k) continue;                              // thiếu tỷ giá → bỏ điểm
    ra.push({
      ts: dauNgayBK(ts),
      cny: cif * k,
      mota: `${u.alloy || ''} ${u.temper || ''} ${u.minThick ?? ''}-${u.maxThick ?? ''}mm · ${Math.round(cif)} $/t`,
    });
  }
  return ra.sort((a, b) => a.ts - b.ts);
}

// ─── 3. Giá sàn → chuỗi bậc thang đã sắp xếp ──────────────────────────────
export function taoDsSan(floorHistory = [], nhan, ds) {
  const ra = [];
  for (const e of floorHistory) {
    const ts = e?.issuedISO ? Date.parse(e.issuedISO) : null;
    if (!ts || isNaN(ts)) continue;
    const g = (e.groups || []).find((x) => x?.label === nhan);
    const san = so(g?.publishedFloor);             // VND/kg
    if (!san) continue;
    const fx = ganNhat(ds, ts);
    if (!fx?.cnyVnd || ts - fx.ts > HAN_FX) continue;
    ra.push({ ts: dauNgayBK(ts), cny: (san * 1000) / fx.cnyVnd, nhan });
  }
  return ra.sort((a, b) => a.ts - b.ts);
}

/** Danh sách nhóm vật tư có giá sàn, xếp theo sản lượng giảm dần. */
export function layNhomVatTu(floorHistory = []) {
  const m = new Map();
  for (const e of floorHistory) {
    for (const g of e.groups || []) {
      if (!g?.label || !so(g.publishedFloor)) continue;
      const cu = m.get(g.label);
      const sl = so(g.totalQty) || 0;
      if (!cu || sl > cu.sanLuong) m.set(g.label, { nhan: g.label, sanLuong: sl, mac: g.alloy || '' });
    }
  }
  return [...m.values()].sort((a, b) => b.sanLuong - a.sanLuong);
}

// ═══ Nguồn dùng chung cho các chỉ báo ═════════════════════════════════════
// registerIndicator là hàm TOÀN CỤC, callback calc không bắt được state React.
// Vì vậy component ghi dữ liệu vào đây, chỉ báo đọc ra lúc tính.
export const NGUON = { traSMM: null, dsCIF: [], dsSan: [], nhanSan: '' };

/** Gộp sự kiện rời rạc vào đúng cây nến chứa nó (đúng cho cả Ngày/Tuần/Tháng). */
function gomVaoNen(dataList, dsSuKien, gop) {
  const ra = new Array(dataList.length);
  let j = 0;
  for (let i = 0; i < dataList.length; i++) {
    const batDau = dataList[i].timestamp;
    const ketThuc = i + 1 < dataList.length ? dataList[i + 1].timestamp : Infinity;
    while (j < dsSuKien.length && dsSuKien[j].ts < batDau) j++;   // bỏ sự kiện trước nến đầu
    const trong = [];
    let k = j;
    while (k < dsSuKien.length && dsSuKien[k].ts < ketThuc) { trong.push(dsSuKien[k]); k++; }
    ra[i] = gop(trong);
  }
  return ra;
}

// ─── Định nghĩa 3 chỉ báo ────────────────────────────────────────────────
// series:'price' = dùng CHUNG thang giá với nến → không cần trục phụ, không lệch tỷ lệ.
export const CHI_BAO_LOP_PHU = [
  {
    name: 'SMM', shortName: 'SMM giao ngay', series: 'price', precision: 0,
    figures: [{ key: 'smm', title: 'SMM ', type: 'line' }],
    styles: { lines: [{ color: '#ea580c', size: 2 }] },
    calc: (dataList) => dataList.map((d) => ({ smm: NGUON.traSMM?.(d.timestamp) ?? null })),
  },
  {
    name: 'CIF', shortName: 'CIF thực mua', series: 'price', precision: 0,
    figures: [{ key: 'cif', title: 'CIF ', type: 'circle' }],
    styles: { circles: [{ color: '#16a34a', style: 'fill' }] },
    calc: (dataList) => gomVaoNen(dataList, NGUON.dsCIF, (trong) => {
      if (!trong.length) return { cif: null, cifMota: '' };
      const tb = trong.reduce((a, b) => a + b.cny, 0) / trong.length;
      return { cif: Math.round(tb), cifMota: trong.map((x) => x.mota).join(' · ') };
    }),
  },
  {
    name: 'SAN', shortName: 'Giá sàn', series: 'price', precision: 0,
    figures: [{ key: 'san', title: 'Sàn ', type: 'line' }],
    styles: { lines: [{ color: '#7c3aed', size: 2, style: 'dashed', dashedValue: [5, 4] }] },
    calc: (dataList) => {
      // Bậc thang: giữ mức sàn gần nhất cho tới lần duyệt kế tiếp
      // Mốc duyệt phải so với BIÊN CUỐI của cây nến, không phải biên đầu.
      // Sàn duyệt hôm thứ Tư mà so với biên đầu tuần thì cả tuần đó bị trống,
      // phải sang tuần sau mới hiện — sai với thực tế điều hành.
      const ds = NGUON.dsSan;
      let j = 0, hienTai = null;
      return dataList.map((d, i) => {
        const ketThuc = i + 1 < dataList.length ? dataList[i + 1].timestamp : Infinity;
        while (j < ds.length && ds[j].ts < ketThuc) { hienTai = ds[j].cny; j++; }
        return { san: hienTai != null ? Math.round(hienTai) : null };
      });
    },
  },
];
