// Chụp nến EastMoney ra file JSON tĩnh trong public/market/ — LƯỚI AN TOÀN.
// Khi EastMoney chặn theo IP (cả phòng cùng mở app), trình duyệt lùi về đọc
// các file này nên biểu đồ không bao giờ trắng.
//
// PHẢI DÙNG curl, KHÔNG dùng fetch của Node:
//   push2his.eastmoney.com từ chối TLS fingerprint của Node (UND_ERR_SOCKET)
//   và của Python (RemoteDisconnected). curl + trình duyệt thì qua.
//
// Chạy:  node tools/chup-nen.mjs
// CI:    thêm step vào .github/workflows/market-fetch.yml rồi commit thư mục public/market/

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CURL = process.platform === 'win32'
  ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'curl.exe')
  : 'curl';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const RA = path.resolve('public/market');

// Chụp bộ tối thiểu đủ dùng. Càng nhiều càng dễ bị EastMoney chặn giữa chừng.
const CAN_CHUP = [
  { ma: 'alm', khung: '101', klt: 101, lmt: 800 },
  { ma: 'alm', khung: '102', klt: 102, lmt: 600 },
  // alm_60 / alm_15: BỎ HẲN (22/08/2026). push2his trả lịch sử trong ngày sai
  // hệ thống — mọi nến trước phiên hiện hành ≈ giá thanh toán × 500, thử cả mã
  // liên tục lẫn hợp đồng al2609/al2610 đều bệnh y hệt (al2608 hết niêm yết).
  // Chụp tiếp chỉ đốt hạn mức request vốn rất hẹp của các file còn lại.
  // Hai nút 15 phút / 1 giờ cũng đã ẩn trong KHUNG_TG (an:true).
  { ma: 'alm', khung: '103', klt: 103, lmt: 400 },
  { ma: 'aom', khung: '101', klt: 101, lmt: 800 },
  { ma: 'adm', khung: '101', klt: 101, lmt: 800 },
];

const nghi = (ms) => new Promise((r) => setTimeout(r, ms));
const so = (v) => { const f = parseFloat(v); return isNaN(f) ? null : f; };

// Số tấn mỗi lô — để suy ra giá từ giá trị giao dịch (mốc kiểm chứng độc lập)
const LO = { alm: 5, aom: 20, adm: 10 };

// CHỐT CHẶN: ngày 22/08 file alm_60.json đã được ghi ra với giá 11.865.139
// (giá thật ~23.700). Trình duyệt lùi về file đó và biểu đồ bị kéo trục lên 12
// triệu — nến bẹp thành một vạch. Từ nay KHÔNG ghi file nếu nến không qua kiểm.
function kiemNen(nen, lo) {
  const suyRa = nen.filter((n) => n.volume > 0 && n.turnover > 0)
                   .map((n) => n.turnover / (n.volume * lo)).sort((a, b) => a - b);
  if (!suyRa.length) return { ok: true, sai: 0 };     // trends2 không có turnover
  const moc = suyRa[suyRa.length >> 1];
  let sai = 0;
  for (const n of nen) {
    const g = [n.open, n.high, n.low, n.close];
    if (!g.every((v) => Number.isFinite(v) && v > 0) || n.high < n.low) { sai++; continue; }
    const r = n.close / moc;
    if (r > 5 || r < 1 / 5) sai++;
  }
  return { ok: sai / nen.length <= 0.02, sai, moc: Math.round(moc) };
}

// EastMoney trả giờ Bắc Kinh không kèm múi giờ → phải ghim +08:00
function sangMoc(s) {
  const t = String(s).trim();
  const iso = t.includes(' ') ? t.replace(' ', 'T') + ':00' : t + 'T00:00:00';
  const ms = Date.parse(iso + '+08:00');
  return isNaN(ms) ? null : ms;
}

async function goi(url, lanThu = 4) {
  let loiCuoi;
  for (let i = 0; i < lanThu; i++) {
    try {
      const out = execFileSync(CURL, ['-sL', '--max-time', '30', '-A', UA, url],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      if (!out) throw new Error('phản hồi rỗng (nhiều khả năng bị chặn theo IP)');
      return JSON.parse(out);
    } catch (e) {
      loiCuoi = e;
      // EastMoney chặn theo IP vài chục giây → lùi dần khá lâu mới có tác dụng
      if (i < lanThu - 1) await nghi(6000 * 2 ** i);   // 6s · 12s · 24s
    }
  }
  throw loiCuoi;
}

fs.mkdirSync(RA, { recursive: true });

// ─── XẾP THỨ TỰ ƯU TIÊN ──────────────────────────────────
// EastMoney chặn rất sớm: lượt chạy 22/08 trên runner GitHub chỉ 2 request
// ĐẦU TIÊN lọt (alm_101, alm_102), 5 cái sau chặn sạch. Cứ chạy theo thứ tự
// cố định thì mãi mãi chỉ 2 file đó tươi, còn alm_60/alm_15/alm_103 không bao
// giờ được chụp.
// Cách chữa: mỗi lượt dồn hạn mức ít ỏi vào thứ ĐANG THIẾU trước — file chưa
// có xếp đầu, rồi tới file cũ nhất; file đã tươi hôm nay thì bỏ qua hẳn.
// Chạy vài lượt là đủ bộ.
const homNay = new Date().toISOString().slice(0, 10);
const EP = process.argv.includes('--ep');   // --ep = chụp lại tất, kể cả file tươi

const doTuoi = (c) => {
  const f = path.join(RA, `${c.ma}_${c.khung}.json`);
  if (!fs.existsSync(f)) return { uu: 0, cu: '(chưa có)' };
  try {
    const g = JSON.parse(fs.readFileSync(f, 'utf8'));
    return { uu: g.capNhat === homNay ? 2 : 1, cu: g.capNhat || '?' };
  } catch { return { uu: 0, cu: '(hỏng)' }; }
};

const xepHang = CAN_CHUP.map((c) => ({ ...c, ...doTuoi(c) }))
  .sort((a, b) => a.uu - b.uu || String(a.cu).localeCompare(String(b.cu)));
const canLam = EP ? xepHang : xepHang.filter((c) => c.uu < 2);
const boQua = xepHang.length - canLam.length;

console.log(`Thứ tự chụp (thiếu trước, cũ trước): ${canLam.map((c) => c.ma + '_' + c.khung).join(' → ') || '(không có gì)'}`);
if (boQua) console.log(`Bỏ qua ${boQua} file đã tươi hôm nay (dùng --ep để ép chụp lại).`);


// ─── NHIỀU BIẾN THỂ THAM SỐ, ĐỂ BỘ KIỂM TỰ CHỌN CÁI ĐÚNG ───────────
// Log 22/08 lo ra một sự thật khác hẳn điều tôi tưởng: request alm_60 ĐÃ TỚI
// được EastMoney, và chính EastMoney trả về 120/124 nến có giá ~11.865.000
// trong khi giá thật ~23.700. Tám nến mới nhất (cùng ngày) thì đúng.
// Mẫu đó đúng với chuỗi HỢP ĐỒNG LIÊN TỤC (沪铝主连): mỗi lần đáo hạn là nối
// sang tháng mới, và hệ số quy đổi của các lần nối nhân dồn lại — phần
// lịch sử bị thổi lên, phần mới nhất (chưa nối lần nào) vẫn sạch.
//
// Không đoán được tham số nào đúng khi không gọi được EastMoney để thử.
// Nhưng ta ĐÃ CÓ bộ kiểm độc lập (turnover/volume) — cứ thử lần lượt và giữ
// cái ĐẦU TIÊN qua được kiểm. Để dữ liệu tự chỉ ra tham số đúng.
// ĐÃ CÓ CÂU TRẢ LỜI cho chuyện fqt (lượt chạy 22/08, job #12):
//   alm_60: fqt=0 sai 120/124 · fqt=1 sai 120/124 · fqt=2 sai 120/124 · không beg sai 120/124
//   alm_15: cả bốn đều sai 384/400
// Bốn biến thể ra ĐÚNG CÙNG MỘT con số → fqt không ảnh hưởng gì. Thử tiếp là
// ném 8 request vào sọt rác mỗi lượt, trong khi EastMoney chỉ cho vài request.
//
// Cùng lượt đó: alm_103 (tháng), aom_101, adm_101 đều qua kiểm ngay lần đầu.
// => Ngày/tuần/tháng LÀNH, riêng khung TRONG NGÀY của mã liên tục thì HỎNG.
//
// Đọc được từ đó: "alm" là chuỗi HỢP ĐỒNG LIÊN TỤC (沪铝主连) — nối nhiều
// tháng lại với nhau. Phần lịch sử bị quy đổi sai, chỉ vài nến mới nhất
// (thuộc hợp đồng hiện hành, chưa nối lần nào) là đúng.
// => Với khung trong ngày, thử thẳng MÃ HỢP ĐỒNG CỤ THỂ (al + YYMM) thay vì mã
// liên tục. Không chắc mã nào đang niêm yết nên thử vài tháng gần — đoán bừa
// ở đây AN TOÀN vì bộ kiểm turnover/volume chặn ở cổng: mã sai thì không có
// nến hoặc không qua kiểm, không đời nào ghi ra file sai.
function maHopDongGan(n = 4) {
  const d = new Date(), ra = [];
  for (let k = 0; k < n; k++) {
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1));
    ra.push('al' + String(t.getUTCFullYear()).slice(2) + String(t.getUTCMonth() + 1).padStart(2, '0'));
  }
  return ra;
}

/** Danh sách (mã, tham số) sẽ thử cho một mục tiêu. */
function bienThe(c) {
  const trongNgay = c.klt < 101;
  // Ngày/tuần/tháng: lần đầu luôn đúng — một request là đủ, đừng phí hạn mức.
  if (!trongNgay) return [{ ten: 'fqt=0', ma: c.ma, q: 'fqt=0&beg=0&end=20500101' }];
  // Trong ngày: thử mã liên tục một lần (phòng khi EastMoney sửa), rồi tới
  // các hợp đồng cụ thể.
  const ra = [{ ten: `${c.ma} (liên tục)`, ma: c.ma, q: 'fqt=0&beg=0&end=20500101' }];
  if (c.ma === 'alm') for (const m of maHopDongGan()) ra.push({ ten: m, ma: m, q: 'fqt=0&beg=0&end=20500101' });
  return ra;
}

function docNen(d, lmt) {
  let nen = [];
  for (const dong of d.klines) {
    const x = dong.split(',');
    const ts = sangMoc(x[0]);
    if (ts == null) continue;
    nen.push({ timestamp: ts, open: so(x[1]), close: so(x[2]), high: so(x[3]),
               low: so(x[4]), volume: so(x[5]) ?? 0, turnover: so(x[6]) ?? 0 });
  }
  // beg=0 khiến EastMoney bỏ qua lmt (alm trả về 6.713 nến ~733 KB).
  // Đây là file LÙI VỀ tải qua mạng — phải gọn, nên cắt lấy phần gần nhất.
  return nen.length > lmt ? nen.slice(-lmt) : nen;
}

let ok = 0, hong = 0, chan = 0;

for (const c of canLam) {
  const f = path.join(RA, `${c.ma}_${c.khung}.json`);
  const lo = LO[c.ma] || 5;
  let dat = null, ghiChu = [];

  for (const bt of bienThe(c)) {
    const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=113.${bt.ma}`
      + `&klt=${c.klt}&${bt.q}&lmt=${c.lmt}`
      + '&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58';
    try {
      const d = (await goi(url, 2)).data;      // 2 lần thôi — còn biến thể khác để thử
      if (!d?.klines?.length) throw new Error('không có nến');
      const nen = docNen(d, c.lmt);
      const k = kiemNen(nen, lo);
      if (!k.ok) { ghiChu.push(`${bt.ten}: sai thang giá ${k.sai}/${nen.length}`); await nghi(4000); continue; }
      dat = { nen, ten: d.name || c.ma, bt: bt.ten };
      break;
    } catch (e) {
      const chanIP = /Command failed|phản hồi rỗng/i.test(e.message);
      ghiChu.push(`${bt.ten}: ${chanIP ? 'bị chặn' : e.message.slice(0, 40)}`);
      if (chanIP) { chan++; break; }           // bị chặn thì thử biến thể nữa cũng vô ích
      await nghi(4000);
    }
  }

  if (dat) {
    fs.writeFileSync(f, JSON.stringify({
      ten: dat.ten, ma: c.ma, khung: c.khung, nen: dat.nen,
      capNhat: new Date().toISOString().slice(0, 10), thamSo: dat.bt,
    }));
    console.log(`✓ ${c.ma}_${c.khung}: ${dat.nen.length} nến (${dat.bt}) → ${(fs.statSync(f).size / 1024).toFixed(0)} KB`);
    ok++;
  } else {
    console.log(`✗ ${c.ma}_${c.khung}: ${ghiChu.join(' · ')}`);
    hong++;
  }
  // 3s là quá dày — EastMoney chặn ngay từ request thứ 3. Giãn hẳn ra.
  await nghi(9000);
}

const conThieu = CAN_CHUP.filter((c) => !fs.existsSync(path.join(RA, `${c.ma}_${c.khung}.json`)))
  .map((c) => `${c.ma}_${c.khung}`);
console.log(`\n${ok} file OK, ${hong} lỗi, ${boQua} bỏ qua vì đã tươi`);
if (conThieu.length) console.log(`CÒN THIẾU: ${conThieu.join(', ')} — chạy lại lượt nữa sẽ ưu tiên các file này.`);
// Không exit(1) khi lỗi lẻ tẻ: đây là lưới an toàn, thiếu 1 file không phải sự cố.
// KHÔNG exit(1) khi bị chặn. Đây là lưới an toàn chạy nền, EastMoney chặn IP là
// chuyện thường ngày và không phải lỗi của ta — để job đỏ mỗi ngày thì chỉ tạo
// nhiễu, rồi đến lúc đỏ thật lại không ai nhìn. Dùng ::warning:: cho hiện ở
// trang tóm tắt mà không làm hỏng lượt chạy.
if (conThieu.length) console.log(`::warning::Chưa chụp được: ${conThieu.join(', ')}`);
process.exit(0);
