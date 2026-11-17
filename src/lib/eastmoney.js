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
const PB_CACHE = 'v5';   // v3: 15/60 chuyển nguồn Sina · v4: 15p ghép trends2 EastMoney (17/11) · v5: 60p cũng ghép trends2

export const MA_NHOM = [
  { ma: 'alm', ten: 'Nhôm Thượng Hải A00', lo: 5,  buocGia: 5 },
  { ma: 'aom', ten: 'Alumina (oxit nhôm)', lo: 20, buocGia: 1 },
  { ma: 'adm', ten: 'Hợp kim nhôm đúc',    lo: 10, buocGia: 5 },
];

// klt = mã khung thời gian của EastMoney. period = định dạng KLineChart v10.
export const KHUNG_TG = [
  { k: 'trends', l: 'Trong ngày', klt: null, period: { span: 1,  type: 'minute' }, soNen: 0    },
  // ── 15 phút & 1 giờ: nguồn SINA FINANCE (quyết định 22/08/2026, lần 2) ────
  // Lịch sử: push2his của EastMoney trả LỊCH SỬ trong ngày hỏng hệ thống —
  // mọi nến trước phiên hiện hành ≈ giá thanh toán × 500, thử đủ mã liên tục
  // lẫn hợp đồng al2609/al2610 và mọi tham số fqt đều bệnh y hệt. Hai nút này
  // từng bị ẩn (an:true) vì vậy.
  // Nay lấy qua Sina (InnerFuturesNewService.getFewMinLine, symbol AL0):
  //   • 1.023 nến 60m sạch, ĐỐI CHIẾU CHÉO khớp đúng các nến còn lành của
  //     EastMoney (21/08 22:00 cùng ra 23.745), trục thời gian tăng dần.
  //   • Sina KHÔNG mở CORS → trình duyệt đi qua proxy Apps Script (doGet
  //     action=nenSina, có whitelist + cache); lưới đỡ là ảnh chụp tĩnh do
  //     chup-nen.mjs tải bằng curl.
  // 17/11/2026: riêng 15p, Sina lệch EastMoney (giá 1 bước, khối lượng, nến
  // phẳng giả, nến 00:00 sai ngày) → đè nến dựng từ luồng 1 phút trends2 lên
  // (xem gopTrends15 / ghepNen). Khung 60 đi cùng đường (gopTrends60): kline
  // 60 của EastMoney cũng hỏng lịch sử, Sina 60 cũng ghi nến 00:00 sai ngày.
  { k: '15',     l: '15 phút',    klt: 15,   period: { span: 15, type: 'minute' }, soNen: 400, sina: true },
  { k: '60',     l: '1 giờ',      klt: 60,   period: { span: 1,  type: 'hour'   }, soNen: 500, sina: true },
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
  // EastMoney: "2026-08-20 14:30" (thiếu giây) · Sina: "2026-08-21 22:00:00"
  // (đủ giây) · nến ngày: "2026-08-20". Đếm dấu ":" để khỏi chắp thừa.
  const iso = !t.includes(' ') ? t + 'T00:00:00'
    : t.replace(' ', 'T') + ((t.match(/:/g) || []).length >= 2 ? '' : ':00');
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
    // Phải đặt LÝ DO khi huỷ. Không đặt thì trình duyệt ném đúng câu
    // "signal is aborted without reason" — câu này từng hiện thẳng lên màn
    // hình cho người dùng đọc, chẳng nói lên điều gì.
    let quaGio = false;
    const hetGio = setTimeout(() => { quaGio = true; ac.abort(); }, timeout);
    const nhaBo = () => ac.abort();
    signal?.addEventListener('abort', nhaBo);
    try {
      const r = await fetch(url, { signal: ac.signal, cache: 'no-store' });
      if (!r.ok) throw new Error('máy chủ trả mã ' + r.status);
      return await r.json();
    } catch (e) {
      loiCuoi = quaGio
        ? new Error(`quá ${Math.round(timeout / 1000)} giây không phản hồi`)
        : (e?.name === 'TypeError' ? new Error('không kết nối được') : e);
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

// ─── Khung 15 phút: dựng nến từ luồng 1 phút EastMoney, đè lên Sina ──────
// VÌ SAO (đo 17/11/2026, 21 nến gần nhất so với nến chính thức EastMoney):
//   • Sina lệch O/H/L/C một bước giá ở 11/21 nến, khối lượng sai nặng
//     (16/11 22:30: EM 5351 — Sina 921), có nến phẳng giả o=h=l=c, v=0
//     (16/11 15:00), và ghi nến 00:00 đêm thứ Sáu sang ngày thứ Hai.
//   • Kline 15p của EastMoney vẫn hỏng lịch sử (≈ 11.857.000) → không dùng.
//   • Luồng 1 phút trends2 (ndays=5) giá ĐÚNG cả 5 ngày; gộp lại khớp 20/21
//     nến chính thức (nến còn lại là nến đang chạy lúc đo).
// Các hàm dưới đây là hàm THUẦN (không I/O) để trình duyệt và
// tools/chup-nen.mjs dùng chung một phép ghép.
const PHUT = 60000;
const P15 = 15 * PHUT;
const P60 = 60 * PHUT;
// Phút trong ngày theo giờ Bắc Kinh (+08:00, không theo giờ máy)
const phutBK = (ts) => { const d = new Date(ts + 8 * 3600000); return d.getUTCHours() * 60 + d.getUTCMinutes(); };

// Mốc nến (nhãn = giờ KẾT THÚC) chứa phút có nhãn ts.
// 15p: làm tròn LÊN bội 15 phút (+08:00 là bội 15 phút → tính trên UTC vẫn đúng).
const moc15 = (ts) => Math.ceil(ts / P15) * P15;
// 60p theo quy ước EastMoney (đã đối chiếu nến chính thức 17/11/2026): phiên
// ngày SHFE 09:00–10:15 · 10:30–11:30 · 13:30–15:00 cắt thành 4 nến đếm theo
// GIỜ GIAO DỊCH, bỏ qua giờ nghỉ: 10:00 · 11:15 (= 10:00–10:15 + 10:30–11:15) ·
// 14:15 (= 11:15–11:30 + 13:30–14:15) · 15:00 (chỉ 45 phút). Phiên đêm làm
// tròn LÊN giờ chẵn (22:00 · 23:00 · 00:00 · 01:00 — 00:00 thuộc ngày lịch kế tiếp).
const MOC_NGAY_60 = [600, 675, 855, 900];          // 10:00 · 11:15 · 14:15 · 15:00 (phút trong ngày)
const moc60 = (ts) => {
  const p = phutBK(ts);
  if (p > 540 && p <= 900) return ts + (MOC_NGAY_60.find((m) => p <= m) - p) * PHUT;
  return Math.ceil(ts / P60) * P60;
};

/** Mảng Sina [{d,o,h,l,c,v}] → nến của app, GIỮ NGUYÊN thứ tự gốc (lamSachNenSina cần). */
export function nenTuSina(arr) {
  const nen = [];
  for (const r of arr || []) {
    const ts = sangMoc(r.d);
    if (ts == null) continue;
    nen.push({ timestamp: ts, open: so(r.o), high: so(r.h), low: so(r.l),
               close: so(r.c), volume: so(r.v) ?? 0, turnover: 0 });
  }
  return nen;
}

/**
 * Làm sạch nến 15p / 60p của Sina (đầu vào theo THỨ TỰ GỐC của Sina);
 * buoc = độ dài nến (ms), mặc định 15 phút.
 * Sina đẩy nến 00:00 của đêm thứ Sáu xuống CUỐI phiên đêm (sau nến 01:00 thứ
 * Bảy) và ghi ngày thứ Hai ("2026-11-16 00:00:00" thay vì 14/11 00:00) → sắp
 * theo mốc thì nến này nhảy sang sáng thứ Hai, sai vị trí. Nhận diện: nến
 * 00:00 không đứng ngay sau nến cuối ngày (23:45 với 15p, 23:00 với 60p) liền
 * trước nó, trong khi nến đứng trước nó thuộc cùng phiên đêm với một nến
 * cuối ngày (ngày D) mà khe D+1 00:00 còn trống, và mốc ghi sai cách xa hơn
 * một ngày → gán về D+1 00:00.
 * Sau đó sắp tăng dần, khử trùng mốc (giữ bản xuất hiện sau trong nguồn).
 */
export function lamSachNenSina(nen, { buoc = P15 } = {}) {
  const co = new Set((nen || []).map((n) => n.timestamp));
  const ra = [];
  const phutCuoiNgay = 24 * 60 - buoc / PHUT;   // 23:45 (15p) · 23:00 (60p)
  let mocCuoi = null;                       // nến cuối ngày gần nhất trong nguồn
  for (const n of nen || []) {
    let x = n;
    const p = phutBK(n.timestamp);
    if (p === 0 && mocCuoi != null) {
      const truoc = ra[ra.length - 1];
      const khe = mocCuoi + buoc;
      const dungCho = truoc && truoc.timestamp === n.timestamp - buoc;
      // nến trước thuộc cùng phiên đêm với nến cuối ngày đó (tối đa tới 01:00)
      const cungPhien = truoc && truoc.timestamp >= mocCuoi && truoc.timestamp <= mocCuoi + buoc + 60 * PHUT;
      if (!dungCho && cungPhien && !co.has(khe) && n.timestamp - khe > 24 * 3600000) {
        x = { ...n, timestamp: khe };
        co.add(khe);
      }
    }
    if (p === phutCuoiNgay) mocCuoi = n.timestamp;
    ra.push(x);
  }
  ra.sort((a, b) => a.timestamp - b.timestamp);          // sort ổn định
  const kq = [];
  for (const n of ra) {
    if (kq.length && kq[kq.length - 1].timestamp === n.timestamp) kq[kq.length - 1] = n;
    else kq.push(n);
  }
  return kq;
}

/**
 * Gộp luồng 1 phút trends2 ("YYYY-MM-DD HH:mm,open,close,high,low,volume,amount,avg",
 * giờ Bắc Kinh, nhãn = CUỐI phút) thành nến nhãn theo giờ KẾT THÚC — giống
 * Sina và EastMoney. mocCua(ts) cho mốc nến chứa phút ts:
 *   • 15p (moc15): làm tròn LÊN bội 15 phút (đầu phiên đêm 21:15, đầu ngày
 *     09:15, sau nghỉ 10:45 và 13:45, 23:46…00:00 → nến 00:00 ngày hôm sau).
 *   • 60p (moc60): 22:00 · 23:00 · 00:00 · 01:00 · 10:00 · 11:15 · 14:15 · 15:00.
 *   • Điểm mở phiên (điểm đầu một phiên, phút chia hết 15, volume 0 — vd
 *     21:00) thuộc nến KẾ TIẾP (= nến của phút sau nó). "Đầu phiên" = cách
 *     điểm trước ≥ 10 phút: nghỉ thật giữa các phiên SHFE ngắn nhất 15 phút
 *     (10:15→10:30). Còn khi trends2 hụt vài phút giữa phiên rồi gặp điểm
 *     :15 volume 0, điểm đó KHÔNG phải mở phiên: nó ở lại nến của chính nó,
 *     và giá của nó không bị lấy làm giá mở cho nến kế tiếp.
 *   • trends2 chỉ có trường open ở ngày giao dịch hiện hành (ngày cũ open=0)
 *     → giá mở: open phút đầu nếu > 0; không thì open nến Sina cùng mốc nếu
 *     nằm trong [low, high]; không nữa thì close nến trước, kẹp vào [low, high].
 *   • H = max, L = min, C = close phút cuối, V = tổng volume,
 *     turnover = tổng amount (để locNenHopLe soi được thang giá).
 */
export function gopTrends15(trends, tuyChon) { return gopTrends(trends, moc15, tuyChon); }
export function gopTrends60(trends, tuyChon) { return gopTrends(trends, moc60, tuyChon); }

function gopTrends(trends, mocCua, { nenSina = [] } = {}) {
  const sinaTheoMoc = new Map((nenSina || []).map((n) => [n.timestamp, n]));
  const nen = [];
  let tsTruoc = null;
  let cur = null;
  const dong = () => {
    if (!cur) return;
    const { n, dau } = cur;
    let mo = dau.moPhien ? (dau.o > 0 ? dau.o : dau.c) : dau.o;
    if (!(mo > 0)) {
      const s = sinaTheoMoc.get(n.timestamp);
      const truoc = nen[nen.length - 1];
      if (s && s.open >= n.low && s.open <= n.high) mo = s.open;
      else mo = Math.min(n.high, Math.max(n.low, truoc ? truoc.close : dau.c));
    }
    n.open = mo;
    nen.push(n);
    cur = null;
  };
  for (const s of trends || []) {
    const c = String(s).split(',');
    const ts = sangMoc(c[0]);
    const o = so(c[1]), cl = so(c[2]), h = so(c[3]), l = so(c[4]);
    const v = so(c[5]) ?? 0, tien = so(c[6]) ?? 0;
    if (ts == null || !(cl > 0) || !(h > 0) || !(l > 0)) continue;
    const dauPhien = tsTruoc == null || ts - tsTruoc >= 10 * PHUT;
    tsTruoc = ts;
    const moPhien = dauPhien && ts % P15 === 0 && v === 0;   // +08:00 là bội 15 phút → % trên UTC vẫn đúng
    const moc = mocCua(moPhien ? ts + PHUT : ts);
    if (!cur || cur.n.timestamp !== moc) {
      dong();
      cur = { dau: { o, c: cl, moPhien },
              n: { timestamp: moc, open: 0, high: h, low: l, close: cl, volume: 0, turnover: 0 } };
    }
    const n = cur.n;
    n.high = Math.max(n.high, h);
    n.low = Math.min(n.low, l);
    n.close = cl;
    n.volume += v;
    n.turnover += tien;
  }
  dong();
  return nen;
}

/**
 * Ghép (dùng chung 15p / 60p): nến EastMoney (gopTrends15 / gopTrends60) ĐÈ
 * lên nến Sina ĐÃ LÀM SẠCH trong đoạn EM phủ [nến EM đầu, nến EM cuối] — mốc
 * chỉ có ở EM thì thêm, nến Sina trong đoạn đó mà EM không có mốc thì bỏ
 * (vd nến phẳng giả). Nến Sina ngoài đoạn giữ nguyên. EM rỗng → trả nguyên Sina. Kết quả tăng dần, không trùng mốc.
 */
export function ghepNen(nenSina, nenEM) {
  const sina = nenSina || [];
  if (!nenEM?.length) return [...sina];
  const dau = nenEM[0].timestamp, cuoi = nenEM[nenEM.length - 1].timestamp;
  return [...sina.filter((n) => n.timestamp < dau || n.timestamp > cuoi), ...nenEM]
    .sort((a, b) => a.timestamp - b.timestamp);
}
export const ghepNen15 = ghepNen;

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

// ─── Nguồn 4: nến phút qua PROXY APPS SCRIPT (dữ liệu gốc Sina Finance) ───
// Sina không mở CORS nên trình duyệt không gọi thẳng được; Apps Script đứng
// giữa (UrlFetchApp không vướng CORS, IP Google không bị chặn). URL do App.jsx
// nạp từ cấu hình dùng chung (config/gas.json) qua datGasUrl().
let GAS_URL = '';
export const datGasUrl = (u) => { GAS_URL = String(u || '').trim(); };
export const coGasUrl = () => !!GAS_URL;

async function taiNenSina(ma, khungK, signal, { lamSach = false } = {}) {
  if (ma !== 'alm') throw new Error(`khung phút chỉ có cho nhôm SHFE (mã ${ma} chưa hỗ trợ)`);
  if (!GAS_URL) throw new Error('chưa cấu hình Apps Script (⚙️ GitHub → Ghi GSheet)');
  const u = `${GAS_URL}?action=nenSina&symbol=AL0&type=${khungK}`;
  const d = await goiJSON(u, { signal, lanThu: 2, timeout: 12000 });
  if (!d?.ok || !Array.isArray(d.nen) || !d.nen.length)
    throw new Error(d?.error || 'proxy không trả về nến');
  // Sửa nến 00:00 ghi sai ngày TRƯỚC khi lọc — nhận diện dựa vào thứ tự gốc
  // của Sina, lọc bỏ nến hỏng trước thì có thể mất nến cuối ngày làm mốc.
  const nen = lamSach
    ? lamSachNenSina(nenTuSina(d.nen), { buoc: Number(khungK) * PHUT })
    : nenTuSina(d.nen);
  // Sina không có turnover → locNenHopLe chỉ soi được phần cơ bản. Chấp nhận
  // được: nguồn này đã đối chiếu chéo khớp EastMoney ngày 22/08.
  const q = locNenHopLe(nen, { lo: timMa(ma).lo, ten: 'Sina' });
  return { ten: d.ten || 'Nhôm SHFE (Sina)', nen: q.nen, kieu: 'nen' };
}

// ─── Nguồn 5: luồng 1 phút trends2 nhiều ngày — làm đúng nến 15p / 60p ───
// ndays tối đa 5 (lớn hơn EastMoney trả rỗng). Lấy đủ 8 trường để có
// open/high/low/volume/amount, khác taiTrongNgay chỉ cần giá + khối lượng.
async function taiTrends5(ma, signal) {
  const u = `${HOST_HIS}/api/qt/stock/trends2/get?secid=${THI_TRUONG}.${ma}`
    + '&ndays=5&iscr=0&iscca=0&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13'
    + '&fields2=f51,f52,f53,f54,f55,f56,f57,f58';
  const d = (await goiJSON(u, { signal })).data;
  if (!d?.trends?.length) throw new Error('EastMoney trả luồng 1 phút rỗng');
  return d.trends;
}

// Khung 15p / 60p = Sina (đã làm sạch) + nến dựng từ trends2 đè lên. Hai nguồn
// tải SONG SONG. Sina là xương sống: Sina lỗi thì ném để layNen lùi như cũ
// (sessionStorage → ảnh tĩnh). trends2 chỉ là lớp làm đúng: lỗi/rỗng/sai
// thang giá thì vẫn trả Sina đã làm sạch, kèm canhBao cho người dùng biết.
const GOP_THEO_KHUNG = { '15': [gopTrends15, '15 phút'], '60': [gopTrends60, '1 giờ'] };
async function taiNenGhep(ma, khungK, signal) {
  const [gop, tenKhung] = GOP_THEO_KHUNG[khungK];
  const huaEM = ma === 'alm' && GAS_URL ? taiTrends5(ma, signal).catch((e) => e) : null;
  const goi = await taiNenSina(ma, khungK, signal, { lamSach: true });
  let loiEM;
  try {
    const kq = await huaEM;
    if (!kq) return goi;
    if (kq instanceof Error) throw kq;
    const nenEM = gop(kq, { nenSina: goi.nen });
    if (!nenEM.length) throw new Error('luồng 1 phút rỗng');
    const q = locNenHopLe(ghepNen(goi.nen, nenEM), { lo: timMa(ma).lo, ten: 'EastMoney + Sina' });
    return { ...goi, nen: q.nen };
  } catch (e) {
    if (signal?.aborted) throw e;
    loiEM = e;
  }
  return { ...goi, canhBao: `Không tải được luồng 1 phút EastMoney (${loiEM.message}) — `
    + `nến ${tenKhung} đang theo Sina, có thể lệch EastMoney một bước giá.` };
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
      : kh.sina
        ? await taiNenGhep(ma, khungK, signal)
        : await taiNenK(ma, kh.klt, kh.soNen, signal);
    ram.set(khoa, { goi, luc: Date.now() });
    ghiSS(khoa, goi);
    return { ...goi, nguon: 'mang' };
  } catch (e) {
    if (signal?.aborted) throw e;

    // Nói ĐÚNG nguyên nhân: mất kết nối và "trả về số sai" là hai chuyện khác
    // nhau, cách xử lý cũng khác (chờ vs báo kỹ thuật). Khung phút đi nguồn
    // Sina qua Apps Script nên phải gọi đúng tên, đừng đổ oan EastMoney.
    const tenNguon = kh.sina ? 'Nguồn nến phút (Sina qua Apps Script)' : 'EastMoney';
    const viSao = /không hợp lệ/.test(e.message)
      ? `${tenNguon} trả về dữ liệu sai (${e.message})`
      : `${tenNguon} không phản hồi (${e.message})`;

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
