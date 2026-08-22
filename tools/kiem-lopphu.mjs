// Kiểm phần TOÁN của đường SMM: quy đổi VAT và — quan trọng nhất — đường phải
// LIỀN MẠCH. Bản trước đặt ngưỡng "cũ quá 7 ngày thì bỏ" nên mỗi lần GitHub
// Actions hỏng vài ngày là đường bị đứt, nhìn như giá lúc có lúc không.
//
// Chạy:  npx vite-node tools/kiem-lopphu.mjs
import { CHI_BAO_SMM, NGUON, dungTraCuu, taoTraSMM, vungCoSMM } from '../src/lib/lopphu.js';

let hong = 0;
const gan = (ten, thuc, mong, saiSo = 1) => {
  const ok = thuc != null && Math.abs(thuc - mong) <= saiSo;
  console.log(`${ok ? '✅' : '❌'} ${ten}: ${thuc == null ? 'null' : Math.round(thuc)} (mong ${Math.round(mong)})`);
  if (!ok) hong++;
};
const bang = (ten, thuc, mong) => {
  const ok = JSON.stringify(thuc) === JSON.stringify(mong);
  console.log(`${ok ? '✅' : '❌'} ${ten}: ${JSON.stringify(thuc)}`);
  if (!ok) { console.log(`   mong: ${JSON.stringify(mong)}`); hong++; }
};
const T = (s) => Date.parse(s + 'T00:00:00+08:00');

// ─── Số liệu thật lấy từ màn hình app ngày 21/08/2026 ───
console.log('── Quy đổi VAT ──');
const ds1 = dungTraCuu([
  { date: '2026-08-21', smm_cny: 23680, usd_vnd: 26060, cny_vnd: 3876 },
  { date: '2026-08-20', smm_cny: 23650, usd_vnd: 26050, cny_vnd: 3874 },
]);
gan('SMM gồm VAT', taoTraSMM(ds1, false)(T('2026-08-21')), 23680);
gan('SMM bóc VAT 13%', taoTraSMM(ds1, true)(T('2026-08-21')), 23680 / 1.13);
gan('Đối chiếu app hiện 3.522 $/t', 23680 / (26060 / 3876), 3522, 2);

console.log('\n── LIỀN MẠCH: mô phỏng đúng thực tế vận hành ──');
// GitHub Actions chạy 1 lần/ngày, nghỉ cuối tuần, và giả lập 14 ngày job hỏng
const md = [];
const d0 = Date.UTC(2026, 4, 1);
for (let i = 0; i < 120; i++) {
  const d = new Date(d0 + i * 86400000);
  if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
  if (i > 60 && i < 75) continue;
  md.push({ date: d.toISOString().slice(0, 10), smm_cny: 23000 + i * 5 });
}
const ds2 = dungTraCuu(md);
const tra = taoTraSMM(ds2, true);
let co = 0, dut = 0, truoc = null;
for (let i = 0; i < 120; i++) {
  const v = tra(d0 + i * 86400000);
  if (v != null) co++; else if (truoc != null) dut++;
  truoc = v;
}
console.log(`   marketData chỉ có ${md.length}/120 ngày (nghỉ cuối tuần + 14 ngày job hỏng)`);
bang('Vẽ liền mạch mọi ngày trong vùng có dữ liệu', co, 120);
bang('Số lần ĐỨT ĐOẠN giữa chừng', dut, 0);

console.log('\n── Ngoài vùng có dữ liệu thì để TRỐNG, không kéo đường phẳng giả ──');
bang('Trước ngày đầu tiên', tra(d0 - 30 * 86400000), null);
bang('Sau ngày cuối quá 10 ngày', tra(d0 + 200 * 86400000), null);
bang('Ngay sau ngày cuối vài ngày vẫn nối tiếp', tra(ds2[ds2.length - 1].ts + 3 * 86400000) != null, true);

console.log('\n── Vùng dữ liệu báo cho người dùng ──');
const v = vungCoSMM(ds2);
bang('Có mốc đầu / cuối / số ngày', !!(v && v.tu && v.den && v.soNgay === md.length), true);
bang('Không có dữ liệu → null', vungCoSMM([]), null);

console.log('\n── Chỉ báo gắn vào nến ──');
NGUON.traSMM = tra;
const kq = CHI_BAO_SMM.calc([{ timestamp: d0 }, { timestamp: d0 + 40 * 86400000 }, { timestamp: d0 + 65 * 86400000 }]);
bang('Cả 3 cây nến đều có giá trị (kể cả cây rơi vào đoạn job hỏng)',
     kq.every((x) => x.smm != null), true);
bang('Dùng chung thang giá với nến', CHI_BAO_SMM.series, 'price');

console.log(hong ? `\n${hong} phép kiểm SAI` : '\nToàn bộ phép kiểm ĐÚNG');
process.exit(hong ? 1 : 0);
