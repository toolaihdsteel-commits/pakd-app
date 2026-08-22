// ═══════════════════════════════════════════════════════════════════════════
// LỚP DỮ LIỆU EASTMONEY — nến nhôm sàn Thượng Hải (SHFE)
// ═══════════════════════════════════════════════════════════════════════════
// PA-B: trình duyệt gọi thẳng EastMoney, KHÔNG qua máy chủ trung gian.
//
// Vì sao gọi được từ GitHub Pages (đã kiểm chứng bằng curl -D):
//   push2.eastmoney.com      → Access-Control-Allow-Origin: *   ✅
//   push2his.eastmoney.com   → Access-Control-Allow-Origin: *   ✅
//   futsseapi.eastmoney.com  → KHÔNG có CORS                    ❌ tuyệt đối đừng dùng
//
// Chống lỗi mạng, 4 lớp lùi dần:
//   1. Nhớ tạm trong RAM (đổi khung/quay lại tab không gọi lại mạng)
//   2. sessionStorage (F5 vẫn còn, sống qua lần tải lại trang)
//   3. Gọi mạng: timeout 8 s → thử lại 3 lần, backoff 0,8s · 1,6s · 3,2s + nhiễu
//   4. File JSON tĩnh trong public/market/ (do GitHub Actions cập nhật)
// EastMoney chặn theo IP khi bị gọi dồn — cả phòng cùng mở app là dính. Lớp 4
// đảm bảo biểu đồ KHÔNG BAO GIỜ trắng, chỉ mất phần realtime.
// ═══════════════════════════════════════════════════════════════════════════

const HOST_HIS = 'https://push2his.eastmoney.com';
const HOST_RT = 'https://push2.eastmoney.com';
const THI_TRUONG = 113;                    // 113 = SHFE (Sàn Kỳ hạn Thượng Hải)
const TTL_RAM = 3 * 60 * 1000;             // 3 phút
const TTL_SS = 12 * 60 * 60 * 1000;        // 12 giờ
const TOI_DA_LUU = 900;                    // số nến lưu vào sessionStorage (tránh đầy quota)
// Đổi số này mỗi khi sửa cách phân tích dữ liệu → cache cũ tự bị bỏ, không cần
// người dùng xoá tay. (v1 từng lưu nhầm nến ngày dưới khoá khung giờ.)
const PB_CACHE = 'v2';

export const MA_NHOM = [
  { ma: 'alm', ten: 'Nhôm Thượng Hải A00', lo: 5,  buocGia: 5 },
  { ma: 'aom', ten: 'Alumina (oxit nhôm)', lo: 20, buocGia: 1 },
  { ma: 'adm', ten: 'Hợp kim nhôm đúc',    lo: 10, buocGia: 5 },
];

// klt = mã khung thời gian của EastMoney. period = định dạng KLineChart v10.
export const KHUNG_TG = [
  { k: 'trends', l: 'Trong ngày', klt: null, period: { span: 1,  type: 'minute' }, soNen: 0    },
  { k: '15',     l: '15 phút',    klt: 15,   period: { span: 15, type: 'minute' }, soNen: 400  },
  { k: '60',     l: '1 giờ',      klt: 60,   period: { span: 1,  type: 'hour'   }, soNen: 500  },
  { k: '101',    l: 'Ngày',       klt: 101,  period: { span: 1,  type: 'day'    }, soNen: 800  },
  { k: '102',    l: 'Tuần',       klt: 102,  period: { span: 1,  type: 'week'   }, soNen: 600  },
  { k: '103',    l: 'Tháng',      klt: 103,  period: { span: 1,  type: 'month'  }, soNen: 400  },
];

export const timKhung = (k) => KHUNG_TG.find((x) => x.k === k) || KHUNG_TG[3];
export const timMa = (m) => MA_NHOM.find((x) => x.ma === m) || MA_NHOM[0];

// KLineChart gọi getBars kèm `period` của chính nó → cần dịch ngược về khung của ta.
// Mỗi khung ứng với một cặp (type, span) duy nhất nên ánh xạ 1-1, không nhập nhằng.
export const khungTuPeriod = (p) =>
  (KHUNG_TG.find((k) => k.period.type === p?.type && k.period.span === p?.span) || KHUNG_TG[3]).k;

// ─── Thời gian ────────────────────────────────────────────────────────────
// EastMoney trả giờ Bắc Kinh không kèm múi giờ ("2026-08-20 14:30").
// Phải ghim +08:00, nếu không trình duyệt sẽ hiểu theo giờ máy → lệch 1 tiếng.
function sangMoc(s) {
  const t = String(s).trim();
  const iso = t.includes(' ') ? t.replace(' ', 'T') + ':00' : t + 'T00:00:00';
  const ms = Date.parse(iso + '+08:00');
  return isNaN(ms) ? null : ms;
}

const so = (v) => { const f = parseFloat(v); return isNaN(f) ? null : f; };
const nghi = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Gọi mạng có thử lại ──────────────────────────────────────────────────
async function goiJSON(url, { signal, lanThu = 3, timeout = 8000 } = {}) {
  let loiCuoi;
  for (let i = 0; i < lanThu; i++) {
    const ac = new AbortController();
    const hetGio = setTimeout(() => ac.abort(), timeout);
    const nhaBo = () => ac.abort();
    signal?.addEventListener('abort', nhaBo);
    try {
      const r = await fetch(url, { signal: ac.signal, cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      loiCuoi = e;
      if (signal?.aborted) throw e;                 // người dùng đổi khung → dừng hẳn
      if (i < lanThu - 1) await nghi(800 * 2 ** i + Math.random() * 400);
    } finally {
      clearTimeout(hetGio);
      signal?.removeEventListener('abort', nhaBo);
    }
  }
  throw loiCuoi || new Error('Không gọi được EastMoney');
}

// ─── Kiểm chứng nến ───────────────────────────────────────────────────────
// VÌ SAO CẦN: ngày 22/08 file public/market/alm_60.json chứa giá 11.865.139
// trong khi giá thật ~23.700 (gấp ~500 lần — di chứng của lỗi cộng dồn
// setDataLoader đã sửa ở GĐ2). Khi EastMoney không phản hồi, biểu đồ lùi về
// file này và trục giá bị kéo lên 12 triệu → nến bẹp dí thành một vạch, các
// đường MA dựng đứng. Người dùng thấy "biểu đồ co rúm, méo mó".
//
// Chốt chặn: KHÔNG BAO GIỜ đưa nến vô lý cho biểu đồ. Mốc so sánh độc lập là
// turnover/(volume × số tấn mỗi lô) — ba trường này do EastMoney trả riêng nên
// một lỗi nhân sai giá sẽ lộ ra ngay. Lệch quá 5 lần = hỏng.
const BIEN_DO = 5;          // lệch quá 5 lần so với giá suy ra từ giá trị giao dịch
const TY_LE_HONG = 0.25;    // hỏng quá 25% số nến → coi như cả nguồn hỏng, bỏ hẳn

const trungVi = (a) => {
  if (!a.length) return null;
  const b = [...a].sort((x, y) => x - y);
  return b[b.length >> 1];
};

/**
 * Lọc nến vô lý. Trả về { nen, boDi }.
 * Ném lỗi nếu nguồn hỏng quá nặng — để layNen lùi tiếp xuống lớp dưới thay vì
 * vẽ ra một biểu đồ sai.
 */
export function locNenHopLe(nen, { lo = 5, ten = 'nguồn' } = {}) {
  const hopLe = [];
  const boDi = [];
  // Giá suy ra từ giá trị giao dịch — độc lập hoàn toàn với open/high/low/close
  const suyRa = [];
  for (const n of nen) {
    if (n.volume > 0 && n.turnover > 0) suyRa.push(n.turnover / (n.volume * lo));
  }
  const moc = trungVi(suyRa);

  for (const n of nen) {
    const g = [n.open, n.high, n.low, n.close];
    if (!g.every((v) => Number.isFinite(v) && v > 0) || n.high < n.low
        || !Number.isFinite(n.timestamp)) { boDi.push(n); continue; }
    if (moc != null) {
      const r = n.close / moc;
      if (r > BIEN_DO || r < 1 / BIEN_DO) { boDi.push(n); continue; }
    }
    hopLe.push(n);
  }

  if (nen.length && (boDi.length / nen.length > TY_LE_HONG || hopLe.length < 5)) {
    throw new Error(
      `dữ liệu ${ten} không hợp lệ (${boDi.length}/${nen.length} nến sai thang giá)`);
  }
  return { nen: hopLe, boDi: boDi.length };
}

// ─── Nhớ tạm ──────────────────────────────────────────────────────────────
const ram = new Map();

// Dọn cache của các phiên bản trước (khoá 'em:...' không mang đúng phiên bản)
try {
  for (const k of Object.keys(sessionStorage)) {
    if (k.startsWith('em:') && !k.startsWith(`em:${PB_CACHE}:`)) sessionStorage.removeItem(k);
  }
} catch { /* chế độ riêng tư / không có sessionStorage */ }

function docSS(khoa, lo = 5) {
  try {
    const s = sessionStorage.getItem(`em:${PB_CACHE}:${khoa}`);
    if (!s) return null;
    const g = JSON.parse(s);
    if (Date.now() - g.luc >= TTL_SS) return null;
    // Cache phiên có thể đã lưu bản hỏng từ trước khi có locNenHopLe → soi lại.
    if (g.kieu !== 'trongNgay') locNenHopLe(g.nen || [], { lo, ten: 'dữ liệu phiên trước' });
    return g;
  } catch { return null; }
}
function ghiSS(khoa, goi) {
  try {
    sessionStorage.setItem(`em:${PB_CACHE}:${khoa}`, JSON.stringify({
      ...goi, nen: goi.nen.slice(-TOI_DA_LUU), luc: Date.now(),
    }));
  } catch { /* đầy quota hoặc chế độ riêng tư — bỏ qua, không ảnh hưởng */ }
}

// ─── Nguồn 1: nến K (ngày/tuần/tháng/phút) ────────────────────────────────
async function taiNenK(ma, klt, soNen, signal) {
  const u = `${HOST_HIS}/api/qt/stock/kline/get?secid=${THI_TRUONG}.${ma}`
    + `&klt=${klt}&fqt=0&beg=0&end=20500101&lmt=${soNen || 800}`
    + '&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58';
  const d = (await goiJSON(u, { signal })).data;
  if (!d?.klines?.length) throw new Error('EastMoney trả về rỗng');
  const nen = [];
  for (const dong of d.klines) {
    // ngày, mở, đóng, cao, thấp, khối lượng, giá trị, biên độ%
    const c = dong.split(',');
    const ts = sangMoc(c[0]);
    if (ts == null) continue;
    nen.push({
      timestamp: ts,
      open: so(c[1]), close: so(c[2]), high: so(c[3]), low: so(c[4]),
      volume: so(c[5]) ?? 0, turnover: so(c[6]) ?? 0,
    });
  }
  const q = locNenHopLe(nen, { lo: timMa(ma).lo, ten: 'EastMoney' });
  return { ten: d.name || ma, nen: q.nen, kieu: 'nen' };
}

// ─── Nguồn 2: đường trong ngày (分时) ──────────────────────────────────────
// Trả về từng phút một giá → dựng nến phẳng và vẽ dạng vùng (area).
async function taiTrongNgay(ma, signal) {
  const u = `${HOST_HIS}/api/qt/stock/trends2/get?secid=${THI_TRUONG}.${ma}`
    + '&fields1=f1,f2,f3,f4&fields2=f51,f53,f56&ndays=1&iscr=0';
  const d = (await goiJSON(u, { signal })).data;
  if (!d?.trends?.length) throw new Error('EastMoney trả về rỗng');
  const nen = [];
  for (const dong of d.trends) {
    const c = dong.split(',');
    const ts = sangMoc(c[0]);
    const g = so(c[1]);
    if (ts == null || g == null) continue;
    nen.push({ timestamp: ts, open: g, high: g, low: g, close: g, volume: so(c[2]) ?? 0 });
  }
  return { ten: d.name || ma, nen, kieu: 'trongNgay' };
}

// ─── Nguồn 3: lưới an toàn — JSON tĩnh trong public/market/ ───────────────
async function taiTinh(ma, khungK) {
  const goc = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
  const r = await fetch(`${goc}market/${ma}_${khungK}.json`, { cache: 'no-cache' });
  if (!r.ok) throw new Error('Chưa có ảnh chụp tĩnh');
  const g = await r.json();
  if (!g?.nen?.length) throw new Error('Ảnh chụp tĩnh rỗng');
  // Ảnh chụp tĩnh là lớp cuối — nếu nó hỏng thì không còn gì đỡ phía sau, nên
  // phải soi kỹ nhất. Thà báo "chưa có ảnh chụp" còn hơn vẽ ra giá sai.
  const q = locNenHopLe(g.nen, { lo: timMa(ma).lo, ten: 'ảnh chụp tĩnh' });
  return { ...g, nen: q.nen, kieu: khungK === 'trends' ? 'trongNgay' : 'nen' };
}

// ═══ HÀM CHÍNH ═══════════════════════════════════════════════════════════
// Trả về { ten, nen[], kieu, nguon, canhBao? }
//   nguon: 'mang' | 'ram' | 'phien' | 'tinh'
export async function layNen(ma, khungK, { signal, boQuaCache = false } = {}) {
  const kh = timKhung(khungK);
  const khoa = `${ma}:${khungK}`;

  if (!boQuaCache) {
    const r = ram.get(khoa);
    if (r && Date.now() - r.luc < TTL_RAM) return { ...r.goi, nguon: 'ram' };
  }

  try {
    const goi = kh.klt == null
      ? await taiTrongNgay(ma, signal)
      : await taiNenK(ma, kh.klt, kh.soNen, signal);
    ram.set(khoa, { goi, luc: Date.now() });
    ghiSS(khoa, goi);
    return { ...goi, nguon: 'mang' };
  } catch (e) {
    if (signal?.aborted) throw e;

    // Nói ĐÚNG nguyên nhân: mất kết nối và "trả về số sai" là hai chuyện khác
    // nhau, cách xử lý cũng khác (chờ vs báo kỹ thuật).
    const viSao = /không hợp lệ/.test(e.message)
      ? `EastMoney trả về dữ liệu sai (${e.message})`
      : `EastMoney không phản hồi (${e.message})`;

    const ss = docSS(khoa, timMa(ma).lo);
    if (ss?.nen?.length) {
      return { ...ss, nguon: 'phien', canhBao: `${viSao} — đang dùng dữ liệu đã tải trước đó.` };
    }
    let loiTinh = '';
    try {
      const t = await taiTinh(ma, khungK);
      return { ...t, nguon: 'tinh',
        canhBao: `${viSao} — đang dùng ảnh chụp tĩnh${t.capNhat ? ' ngày ' + t.capNhat : ''}.` };
    } catch (e2) { loiTinh = e2.message; }
    throw new Error(
      `${viSao}, và khung này chưa có ảnh chụp tĩnh để lùi về (${loiTinh}). `
      + 'Các khung Ngày / Tuần vẫn xem được. EastMoney thường chặn tạm vài phút rồi mở lại.');
  }
}

// ─── Giá hiện tại (bảng thông số bên phải) ────────────────────────────────
// push2 (KHÔNG phải futsseapi) vì chỉ host này bật CORS.
export async function layGiaHienTai(ma, { signal } = {}) {
  const u = `${HOST_RT}/api/qt/stock/get?secid=${THI_TRUONG}.${ma}`
    + '&fields=f43,f44,f45,f46,f47,f48,f57,f58,f60,f168,f169,f170';
  const d = (await goiJSON(u, { signal, lanThu: 2, timeout: 6000 })).data;
  if (!d) throw new Error('Không có dữ liệu giá');
  return {
    ma: d.f57, ten: d.f58,
    gia: so(d.f43), cao: so(d.f44), thap: so(d.f45), mo: so(d.f46),
    kl: so(d.f47), giaTri: so(d.f48), dongCuaTruoc: so(d.f60),
    thayDoi: so(d.f169), phanTram: so(d.f170) != null ? so(d.f170) / 100 : null,
  };
}

// ─── Giờ giao dịch SHFE, quy về giờ Việt Nam (Bắc Kinh − 1) ───────────────
export function trangThaiPhien(bayGio = Date.now()) {
  const bj = new Date(bayGio + (new Date(bayGio).getTimezoneOffset() + 480) * 60000);
  const p = bj.getHours() * 60 + bj.getMinutes(), thu = bj.getDay();
  const trong = (a, b) => p >= a && p < b;
  const dem = trong(21 * 60, 24 * 60) || trong(0, 60);
  const ngay = trong(540, 615) || trong(630, 690) || trong(810, 900);
  if (thu === 6 || (thu === 0 && !dem) || (thu === 1 && dem && p < 60))
    return { mo: false, chu: 'Nghỉ cuối tuần' };
  if (dem)  return { mo: true,  chu: 'Đang giao dịch — phiên đêm' };
  if (ngay) return { mo: true,  chu: 'Đang giao dịch — phiên ngày' };
  return { mo: false, chu: 'Ngoài giờ giao dịch' };
}
