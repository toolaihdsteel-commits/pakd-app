// Kiểm luồng duyệt khi NHIỀU NGƯỜI CÙNG BẬC (R14, 28/10/2026).
// Tình huống thật: luồng Sàn Mrs Hương B1, Mr Dương B2, MS Liên B2 — 1 trong 2 sếp ký là PA qua.
import {approvalProgress,tenNguoiCho} from '../src/lib/core.js';
let loi=0;
const gan=(ten,thuc,mong)=>{const ok=JSON.stringify(thuc)===JSON.stringify(mong);if(!ok)loi++;console.log(`${ok?'✅':'❌'} ${ten}: ${JSON.stringify(thuc)}${ok?'':'  ≠ mong '+JSON.stringify(mong)}`);};
const AP=[
  {id:'huong',name:'Mrs Hương',role:'TP Kinh doanh',stepBuy:2,stepFloor:1},
  {id:'duong',name:'Mr Dương',role:'Giám đốc',stepBuy:4,stepFloor:2},
  {id:'lien',name:'MS Liên',role:'Phó Giám Đốc',stepBuy:3,stepFloor:2},
];
const ky=(id,step)=>({id,step,decision:'approved'});
const p1=approvalProgress(AP,[ky('huong',1)],'floor');
gan('Hương B1 ký → chưa đủ cấp',p1.done,false);
gan('CẢ HAI sếp B2 cùng sáng đèn',p1.nextApprovers.map(a=>a.id).sort(),['duong','lien']);
gan('Dòng trạng thái nêu cả hai',tenNguoiCho(p1,'floor'),'Mr Dương hoặc MS Liên · bước 2 — 1 trong 2 người ký là qua bậc');
gan('MS Liên ký B2 → ĐỦ CẤP',approvalProgress(AP,[ky('huong',1),ky('lien',2)],'floor').done,true);
gan('Mr Dương ký B2 → ĐỦ CẤP',approvalProgress(AP,[ky('huong',1),ky('duong',2)],'floor').done,true);
gan('Đủ cấp → không còn ai chờ',approvalProgress(AP,[ky('huong',1),ky('lien',2)],'floor').nextApprovers,[]);
const pm=approvalProgress(AP,[ky('huong',2)],'buy');
gan('Luồng Mua khác bậc → chỉ 1 người chờ',pm.nextApprovers.map(a=>a.id),['lien']);
gan('1 người chờ → không ghi "1 trong"',tenNguoiCho(pm,'buy'),'MS Liên · bước 3');
gan('Bị bác → danh sách chờ rỗng',approvalProgress(AP,[{id:'lien',step:2,decision:'rejected'}],'floor').nextApprovers,[]);
console.log(loi?`\n❌ ${loi} phép kiểm SAI`:'\nToàn bộ phép kiểm ĐÚNG');
if(loi) process.exit(1);
