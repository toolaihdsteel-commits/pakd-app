// ═══════════════════════════════════════════════════════════════════════════
// CHUẨN HOÁ CHUỖI ĐỂ SO KHỚP SKU  (app ↔ Google Sheet ↔ Apps Script)
// ═══════════════════════════════════════════════════════════════════════════
// Vì sao cần: khoá SKU được ghép từ 6 thành phần do NHIỀU nguồn nhập tay —
// người gõ trên GSheet, người gõ trong app, dữ liệu dán từ file Excel cũ.
// Chỉ cần một dấu nhân "×" thay cho "x", một khoảng trắng dính đuôi, hay
// "cuộn" thay cho "C" là hai bên ra hai khoá khác nhau và app báo
// "Không tìm thấy SKU" dù dòng đó đang nằm sờ sờ trên sheet.
//
// Nguyên tắc: MỌI phép so khớp SKU đi qua đúng một hàm — khoaSku(). Không nơi
// nào được tự ghép chuỗi khoá riêng.
//
// Bộ này phải chạy được cả trên trình duyệt (ES module) lẫn trong Apps Script
// (đã chép sang apps-script/Code.gs, mục "CHUẨN HOÁ DÙNG CHUNG"). Sửa ở đây
// thì phải sửa cả bên kia — tools/kiem-minmax.mjs canh cho hai bản không lệch.
// ═══════════════════════════════════════════════════════════════════════════

const DAU_KET_HOP = /[\u0300-\u036f]/g;
// Khoảng trắng "lạ" hay dính vào khi copy từ Excel/web: NBSP, narrow NBSP,
// zero-width space, BOM. Trim() thường không dọn hết mấy con này.
const TRANG_LA = /[\u00a0\u1680\u2000-\u200d\u202f\u205f\u3000\ufeff]/g;
// Dấu nhân đủ kiểu: × (U+00D7), ✕, ✖, ⨯, x, X, *
export const DAU_NHAN = /[\u00d7\u2715\u2716\u2a2f*xX]/;

/** Bỏ dấu tiếng Việt, giữ nguyên hoa/thường và ký tự khác. */
export const boDau = (s) => String(s == null ? '' : s)
  .replace(TRANG_LA, ' ')
  .normalize('NFD').replace(DAU_KET_HOP, '')
  .replace(/đ/g, 'd').replace(/Đ/g, 'D');

/** Bỏ dấu + thường hoá + chỉ giữ a-z0-9. Dùng cho mác, temper, tên cột. */
export const chuanChu = (s) => boDau(s).toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Đọc số chịu được mọi kiểu gõ: "1,2" · " 1.2 mm" · "1 250" · "1.250" (kiểu VN).
 * Trả về Number, hoặc null nếu không phải số.
 */
export function chuanSo(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let s = boDau(v).replace(TRANG_LA, ' ').trim();
  if (s === '') return null;
  s = s.replace(/\s*(mm|kg|m|tan|tons?|ly)\s*$/i, '').trim();   // cắt đuôi đơn vị
  s = s.replace(/[()]/g, '').trim();
  // "1.250" / "1.250.000" = dấu chấm ngăn nghìn kiểu Việt Nam → bỏ chấm.
  // Nhưng "1.2" / "0.43" là số thập phân → giữ nguyên.
  if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  else if (/^-?\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, '');  // kiểu Anh
  else s = s.replace(',', '.');                                      // "1,2" → "1.2"
  s = s.replace(/\s+/g, '');
  if (!/^-?\d*\.?\d+$/.test(s)) return null;
  const f = parseFloat(s);
  return isNaN(f) ? null : f;
}

/** Số về dạng khoá: 2.0 → "2", 1.20 → "1.2". Không phải số thì chuẩnChu. */
export function chuanDo(v) {
  const f = chuanSo(v);
  return f == null ? chuanChu(v) : String(f);
}

// Mọi cách người ta viết "dạng cuộn" (không cắt theo chiều dài)
const LA_CUON = new Set(['', 'c', 'coil', 'cuon', 'cuoncoil', 'coilc', 'dangcuon', 'cuontron', 'roll']);
/** Chiều dài: cuộn (mọi biến thể) → "C"; còn lại → số đã chuẩn. */
export function chuanDai(v) {
  const t = chuanChu(v);
  if (LA_CUON.has(t)) return 'C';
  return chuanDo(v);
}

const LA_PHU = new Set(['1e', 'pe', 'yes', 'y', '1', 'true', 'co', 'cophu', 'phu', 'copheu']);
/** Lớp phủ: PE/1E/có phủ → "1E"; còn lại (KP, NOPE, trống) → "KP". */
export function chuanPhu(v) {
  return LA_PHU.has(chuanChu(v)) ? '1E' : 'KP';
}

/**
 * Khoá SKU chuẩn — DUY NHẤT một cách ghép, dùng ở mọi nơi.
 * vd: { alloy:'A3003', temper:'H14', thickness:'1,2', width:'1 250',
 *       length:'cuộn', coating:'PE' }  →  "a3003|h14|1.2|1250|C|1E"
 */
export function khoaSku(o) {
  return [
    chuanChu(o && o.alloy),
    chuanChu(o && o.temper),
    chuanDo(o && o.thickness),
    chuanDo(o && o.width),
    chuanDai(o && o.length),
    chuanPhu(o && o.coating),
  ].join('|');
}

/**
 * Tách chuỗi quy cách người dùng đọc được thành 3 phần.
 * Chịu được mọi dấu nhân và đuôi đơn vị:
 *   "1.2×1250×cuộn(mm)" · "1,2 x 1 250 x C" · "3.0*1250*2500 mm"
 * Trả về null nếu không tách được 3 phần.
 */
export function tachQuyCach(s) {
  const t = boDau(s).replace(/\(\s*mm\s*\)|\bmm\b/gi, ' ').trim();
  let phan = t.split(/[\u00d7\u2715\u2716\u2a2f*]/).map((x) => x.trim()).filter((x) => x !== '');
  if (phan.length < 3) phan = t.split(/[xX]/).map((x) => x.trim()).filter((x) => x !== '');
  if (phan.length < 3) return null;
  return { thickness: phan[0], width: phan[1], length: phan[2] };
}

/**
 * Danh sách khoá "chấp nhận được" của một SKU, để bên nhận có thể so khớp
 * kể cả khi nó đang dùng quy ước cũ (chưa chuẩn hoá "cuộn"/"PE").
 * Luôn đặt khoá chuẩn ở vị trí đầu.
 */
export function bienTheKhoa(o) {
  const goc = khoaSku(o);
  const p = goc.split('|');
  const ra = new Set([goc]);
  const dai = [p[4]];
  if (p[4] === 'C') dai.push('c', 'coil', 'cuon', '');
  const phu = p[5] === '1E' ? ['1E', '1e', 'pe', 'PE'] : ['KP', 'kp', 'nope', ''];
  for (const d of dai) for (const f of phu) ra.add([p[0], p[1], p[2], p[3], d, f].join('|'));
  return [...ra];
}

/** Chuỗi SKU cho người đọc — dùng trong thông báo lỗi, KHÔNG dùng để so khớp. */
export const nhanSku = (o) => `${o.alloy} ${o.temper} ${o.thickness}×${o.width}×${
  chuanDai(o.length) === 'C' ? 'cuộn' : o.length} ${chuanPhu(o.coating) === '1E' ? 'PE' : 'KP'}`;

/** Đếm số thành phần trùng nhau giữa 2 khoá (0–6) — để gợi ý dòng gần đúng. */
export function doGiong(a, b) {
  const x = String(a).split('|'), y = String(b).split('|');
  let n = 0;
  for (let i = 0; i < 6; i++) if (x[i] === y[i]) n++;
  return n;
}
