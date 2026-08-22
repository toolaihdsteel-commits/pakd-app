// Kiểm phân hệ MIN/MAX — đối soát SKU giữa app và Google Sheet.
//
// Lỗi gốc (22/08/2026): bấm "✓ Xử lý" đề xuất mua của
//   A3003 H14 PE 1.2×1250×cuộn(mm)
// thì Apps Script báo "Không tìm thấy SKU" dù dòng đó đang nằm trên sheet.
// Nguyên nhân: khoá SKU ghép từ 6 thành phần nhập tay, mỗi bên chuẩn hoá một
// kiểu — "cuộn" vs "C", "PE" vs "1E", "1,2" vs "1.2", dấu nhân "×" vs "x",
// khoảng trắng NBSP dán từ Excel. Chỉ cần lệch 1 thành phần là trượt.
//
// Bài kiểm này canh 3 việc:
//   1. Hai bản chuẩn hoá (trình duyệt + Apps Script) KHÔNG được lệch nhau.
//   2. Mọi cách viết của cùng một mặt hàng phải ra cùng một khoá.
//   3. Trượt thật thì phải báo LỆCH Ô NÀO, không được báo cụt lủn.
//
// Chạy:  npx vite-node tools/kiem-minmax.mjs
import fs from 'node:fs';
import { bienTheKhoa, chuanDai, chuanPhu, chuanSo, khoaSku, tachQuyCach } from '../src/lib/chuanhoa.js';

let hong = 0;
const ok = (ten, dieu, them = '') => {
  console.log(`${dieu ? '✅' : '❌'} ${ten}${them ? ' — ' + them : ''}`);
  if (!dieu) hong++;
};
const bang = (ten, thuc, mong) => ok(ten, thuc === mong, thuc === mong ? '' : `được "${thuc}", cần "${mong}"`);

// ── Nạp bản Apps Script để so với bản trình duyệt ────────────────────────
const src = fs.readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
const GS = new Function(
  `${src}\nreturn { khoaSku2_, timDongSku_, colsMinMax_, chuanDai_, chuanPhu_, skuLabel_ };`)();

// ═══ 1. Mặt hàng đang lỗi, viết theo mọi kiểu người ta hay gõ ═══════════
console.log('── Mã đang lỗi: A3003 H14 PE 1.2×1250×cuộn(mm) ──');
const CHUAN = { alloy: 'A3003', temper: 'H14', thickness: '1.2', width: '1250', length: 'C', coating: '1E' };
const khoaChuan = khoaSku(CHUAN);
console.log(`   khoá chuẩn = ${khoaChuan}`);

const CACH_VIET = [
  ['sheet ghi "C" + "1E"        ', { ...CHUAN }],
  ['sheet ghi "cuộn" + "PE"     ', { ...CHUAN, length: 'cuộn', coating: 'PE' }],
  ['sheet ghi "Coil" + "pe"     ', { ...CHUAN, length: 'Coil', coating: 'pe' }],
  ['dấu phẩy thập phân "1,2"    ', { ...CHUAN, thickness: '1,2' }],
  ['dày ghi "1.20"              ', { ...CHUAN, thickness: '1.20' }],
  ['khổ ghi "1 250" (có trắng)  ', { ...CHUAN, width: '1 250' }],
  ['khổ ghi "1.250" (kiểu VN)   ', { ...CHUAN, width: '1.250' }],
  ['có đuôi đơn vị "1.2 mm"     ', { ...CHUAN, thickness: '1.2 mm' }],
  ['NBSP dán từ Excel           ', { ...CHUAN, alloy: ' A3003 ', temper: 'H14​' }],
  ['thường hoá "a3003"/"h14"    ', { ...CHUAN, alloy: 'a3003', temper: 'h14' }],
  ['getValues() trả về số       ', { ...CHUAN, thickness: 1.2, width: 1250 }],
];
for (const [ten, o] of CACH_VIET) {
  const a = khoaSku(o), b = GS.khoaSku2_(o);
  ok(`${ten} → khoá chuẩn`, a === khoaChuan, a === khoaChuan ? '' : a);
  ok(`${ten}   hai bản khớp`, a === b, a === b ? '' : `trình duyệt="${a}" ≠ AppsScript="${b}"`);
}

// ═══ 2. Tách chuỗi quy cách — đúng chỗ dấu nhân "×" hay bị nhầm ════════
console.log('\n── Tách quy cách (dấu nhân mọi kiểu) ──');
for (const s of ['1.2×1250×cuộn(mm)', '1.2 x 1250 x C', '1,2*1 250*Coil', '1.2✕1250✕cuộn']) {
  const t = tachQuyCach(s);
  const k = t ? khoaSku({ ...CHUAN, ...t }) : '(tách hỏng)';
  ok(`"${s}"`, k === khoaChuan, k === khoaChuan ? '' : k);
}

// ═══ 3. Chuẩn hoá từng phần ════════════════════════════════════════════
console.log('\n── Chuẩn hoá từng thành phần ──');
bang('chuanDai("cuộn")', chuanDai('cuộn'), 'C');
bang('chuanDai("Coil")', chuanDai('Coil'), 'C');
bang('chuanDai("")', chuanDai(''), 'C');
bang('chuanDai("2500")', chuanDai('2500'), '2500');
bang('chuanPhu("PE")', chuanPhu('PE'), '1E');
bang('chuanPhu("KP")', chuanPhu('KP'), 'KP');
bang('chuanPhu("")', chuanPhu(''), 'KP');
bang('chuanSo("1.250") = 1250 (kiểu VN)', chuanSo('1.250'), 1250);
bang('chuanSo("1,2") = 1.2', chuanSo('1,2'), 1.2);
bang('chuanSo("0.43") = 0.43', chuanSo('0.43'), 0.43);
bang('chuanSo("3.0") = 3', chuanSo('3.0'), 3);
ok('chuanSo("cuộn") = null (không phải số)', chuanSo('cuộn') === null);

// ═══ 4. Tìm dòng trên sheet — dữ liệu thật lấy từ GSheet ngày 22/08 ═════
console.log('\n── Tìm dòng trên sheet Min/Max (dữ liệu thật) ──');
const H = ['ID', 'alloy', 'temper', 'thickness', 'width', 'length', 'Coating',
           'minStockKg', 'maxStockKg', 'SellCost', 'Comment', 'yeucaumua', 'tuanyeucau'];
// getValues() trả số là Number, chữ là String — mô phỏng đúng như vậy
const DONG = [
  ['AC5052XH32X1D21250XXXXCN1E', 'A5052', 'H32', 1.2, 1250, 'C', '1E', 4000, '', 109000, '', '', ''],
  ['AC3003XH14XX2D1250XXXXCN1E', 'A3003', 'H14', 2, 1250, 'C', '1E', 15000, '', 107000, '', '', ''],
  ['AT3003CH16XX3D12502500CN1E', 'A3003', 'H16', 3, 1250, 2500, '1E', 10100, '', 107000, '', 5000, 'Tuần 34'],
  ['AC3003XH14XX3D1250XXXXCN1E', 'A3003', 'H14', 3, 1250, 'C', '1E', 2500, '', 107000, '', '', ''],
  ['AC3003XH14XX1D21500XXXXCN1E', 'A3003', 'H14', 1.2, 1250, 'C', '1E', 0, '', '', '', 5000, 'Tuần 34'],
];
const C = GS.colsMinMax_(H);
ok('Dò đúng cột (alloy/temper/dày/rộng/dài/phủ/yêu cầu)',
   C.a === 1 && C.t === 2 && C.d === 3 && C.r === 4 && C.l === 5 && C.p === 6 && C.req === 11);

const payload = { ...CHUAN, skuKey: khoaChuan, skuVariants: bienTheKhoa(CHUAN) };
const tim = GS.timDongSku_([H, ...DONG], C, payload);
ok('Tìm thấy đúng dòng của mã đang lỗi', tim.i === 5, `trả về i=${tim.i}` + (tim.loi ? ` · ${tim.loi.split('\n')[0]}` : ''));

// Sheet viết kiểu khác → vẫn phải tìm ra
const DONG2 = DONG.map((r, i) => (i === 4 ? [...r.slice(0, 5), 'cuộn', 'PE', ...r.slice(7)] : r));
ok('Sheet ghi "cuộn"/"PE" → vẫn tìm ra',
   GS.timDongSku_([H, ...DONG2], C, payload).i === 5);

// ═══ 5. AN TOÀN: không được đoán bừa khi lệch lớp phủ ═══════════════════
console.log('\n── An toàn: PE và KP là hai mặt hàng khác nhau ──');
const DONG3 = DONG.map((r, i) => (i === 4 ? [...r.slice(0, 6), 'KP', ...r.slice(7)] : r));
const tim3 = GS.timDongSku_([H, ...DONG3], C, payload);
ok('Sheet ghi KP mà app hỏi PE → KHÔNG tự khớp', tim3.i === -1);
ok('… và báo rõ lệch ô "lớp phủ"', !!tim3.loi && tim3.loi.includes('lớp phủ'),
   tim3.loi ? tim3.loi.split('\n').slice(-2)[0].trim() : '(không có thông báo)');
ok('… có nêu khoá app gửi để đối chiếu', !!tim3.loi && tim3.loi.includes(khoaChuan));

// ═══ 6. Không tự khớp nhầm sang mã khác ════════════════════════════════
console.log('\n── Không khớp nhầm mã khác ──');
const khac = { alloy: 'A3003', temper: 'H14', thickness: '3.0', width: '1250', length: 'C', coating: '1E' };
const timKhac = GS.timDongSku_([H, ...DONG], C, { ...khac, skuKey: khoaSku(khac), skuVariants: bienTheKhoa(khac) });
ok('Mã dày 3.0 khớp đúng dòng 3.0 (không nhảy sang 1.2)', timKhac.i === 4);
const khongCo = { alloy: 'A6061', temper: 'T6', thickness: '5.0', width: '1500', length: 'C', coating: 'KP' };
ok('Mã không có trên sheet → trượt đúng cách',
   GS.timDongSku_([H, ...DONG], C, { ...khongCo, skuKey: khoaSku(khongCo) }).i === -1);

console.log(hong ? `\n${hong} phép kiểm SAI` : '\nToàn bộ phép kiểm ĐÚNG');
process.exit(hong ? 1 : 0);
