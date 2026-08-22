// Kiểm phần TOÁN của lớp phủ nghiệp vụ: quy đổi đơn vị, bóc VAT, gom sự kiện
// vào đúng cây nến. Sai một chỗ ở đây là đường CIF/Giá sàn nằm lệch trên biểu đồ
// mà nhìn bằng mắt rất khó phát hiện.
//
// Chạy:  npx vite-node tools/kiem-lopphu.mjs
import { CHI_BAO_LOP_PHU, NGUON, dungTraCuu, layNhomVatTu, taoDsCIF, taoDsSan, taoTraSMM }
  from '../src/lib/lopphu.js';

let hong = 0;
const gan = (ten, thuc, mong, saiSo = 1) => {
  const ok = Math.abs(thuc - mong) <= saiSo;
  console.log(`${ok ? '✅' : '❌'} ${ten}: ${Math.round(thuc)} (mong ${Math.round(mong)})`);
  if (!ok) hong++;
};
const bang = (ten, thuc, mong) => {
  const ok = JSON.stringify(thuc) === JSON.stringify(mong);
  console.log(`${ok ? '✅' : '❌'} ${ten}: ${JSON.stringify(thuc)}`);
  if (!ok) { console.log(`   mong: ${JSON.stringify(mong)}`); hong++; }
};

// ─── Số liệu thật lấy từ màn hình app ngày 21/08/2026 ───
const marketData = [
  { date:'2026-08-21', smm_cny:23680, shfe_cny:23585, lme_usd:3206, usd_vnd:26060, cny_vnd:3876 },
  { date:'2026-08-20', smm_cny:23650, shfe_cny:23595, lme_usd:3200, usd_vnd:26050, cny_vnd:3874 },
  { date:'2026-07-15', smm_cny:23100, shfe_cny:23050, lme_usd:3150, usd_vnd:26000, cny_vnd:3860 },
];
const ds = dungTraCuu(marketData);
const T = (s) => Date.parse(s + 'T00:00:00+08:00');

console.log('── Tỷ giá chéo ──');
// USD/CNY = usd_vnd / cny_vnd = 26060/3876 = 6,7233
gan('SMM quy USD (đối chiếu app hiện 3.522 $/t)', 23680 / (26060 / 3876), 3522, 2);

console.log('\n── SMM: giữ nguyên CNY/tấn, có bóc VAT ──');
gan('SMM gồm VAT', taoTraSMM(ds, false)(T('2026-08-21')), 23680);
gan('SMM bóc VAT 13%', taoTraSMM(ds, true)(T('2026-08-21')), 23680 / 1.13);
bang('SMM quá cũ (>7 ngày) thì bỏ, không kéo phẳng',
     taoTraSMM(ds, false)(T('2026-08-05')), null);

console.log('\n── CIF: USD/tấn → CNY/tấn bằng tỷ giá CÙNG NGÀY ──');
const nhap = [
  { alloy:'A1050', temper:'H14', minThick:0.5, maxThick:1.0, priceFC:3900, updateDate:'21/08/2026' },
  { alloy:'A5052', temper:'H32', minThick:2,   maxThick:4,   priceFC:4100, updateDate:'21/08/2026' },
  { alloy:'A3003', temper:'H14', minThick:1,   maxThick:2,   priceFC:3800, updateDate:'15/07/2026' },
  { alloy:'A1050', temper:'H14', minThick:0.5, maxThick:1.0, priceFC:3700, updateDate:'01/01/2020' }, // ngoài vùng tỷ giá
];
const dsCIF = taoDsCIF(nhap, ds, 'ALL');
bang('Bỏ đợt không có tỷ giá cùng thời điểm', dsCIF.length, 3);
const cif3900 = dsCIF.find((x) => x.mota.includes('3900'));
gan('CIF 3.900 $/t → CNY/tấn', cif3900.cny, 3900 * (26060 / 3876), 5);
bang('Lọc theo mác A5052', taoDsCIF(nhap, ds, 'A5052').length, 1);

console.log('\n── Giá sàn: VND/kg → CNY/tấn ──');
const lichSuSan = [
  { issuedISO:'2026-08-21T03:00:00.000Z', groups:[
      { id:'g0', label:'Cuộn A1050 H14', alloy:'A1050', totalQty:120000, publishedFloor:110000 },
      { id:'g1', label:'Tấm A5052 H32',  alloy:'A5052', totalQty: 45000, publishedFloor:125000 }]},
  { issuedISO:'2026-07-15T03:00:00.000Z', groups:[
      { id:'g0', label:'Cuộn A1050 H14', alloy:'A1050', totalQty:118000, publishedFloor:105000 }]},
];
const dsSan = taoDsSan(lichSuSan, 'Cuộn A1050 H14', ds);
bang('Số mốc sàn của nhóm', dsSan.length, 2);
gan('110.000 đ/kg → CNY/tấn', dsSan.at(-1).cny, 110000 * 1000 / 3876, 5);
bang('Nhóm mặc định = sản lượng lớn nhất', layNhomVatTu(lichSuSan)[0].nhan, 'Cuộn A1050 H14');

console.log('\n── Thứ tự giá phải hợp lý về nghiệp vụ (đã bóc VAT) ──');
const shfeEx = 23585 / 1.13, smmEx = 23680 / 1.13;
const cif = cif3900.cny, san = dsSan.at(-1).cny;
const dung = shfeEx < cif && cif < san && Math.abs(shfeEx - smmEx) < 200;
console.log(`${dung ? '✅' : '❌'} SHFE ${Math.round(shfeEx)} ≈ SMM ${Math.round(smmEx)} < CIF ${Math.round(cif)} < Sàn ${Math.round(san)} CNY/tấn`);
if (!dung) hong++;
console.log(`   premium NCC = CIF − SHFE = ${Math.round(cif - shfeEx)} CNY/tấn ≈ ${Math.round((cif - shfeEx) / (26060 / 3876))} $/t`);

console.log('\n── Gom sự kiện vào đúng cây nến ──');
NGUON.traSMM = taoTraSMM(ds, true);
NGUON.dsCIF = dsCIF;
NGUON.dsSan = dsSan;
// Nến TUẦN: mốc 17/08 bao trọn cả ngày 21/08 → chấm CIF phải rơi vào nến đó
const nenTuan = [{ timestamp:T('2026-07-13') }, { timestamp:T('2026-08-17') }];
const kqCIF = CHI_BAO_LOP_PHU.find((c) => c.name === 'CIF').calc(nenTuan);
bang('Nến tuần 13/07 gom được đợt nhập 15/07', kqCIF[0].cif != null, true);
bang('Nến tuần 17/08 gom 2 đợt nhập ngày 21/08', kqCIF[1].cif != null, true);
gan('Nến tuần 17/08 lấy trung bình 2 đợt (3.900 & 4.100)',
    kqCIF[1].cif, (3900 + 4100) / 2 * (26060 / 3876), 10);

const kqSan = CHI_BAO_LOP_PHU.find((c) => c.name === 'SAN').calc(nenTuan);
bang('Giá sàn là bậc thang, giữ mức cũ tới lần duyệt sau', kqSan[0].san != null && kqSan[1].san > kqSan[0].san, true);

console.log(hong ? `\n${hong} phép kiểm SAI` : '\nToàn bộ phép kiểm ĐÚNG');
process.exit(hong ? 1 : 0);
