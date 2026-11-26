// Kiểm GIÁ NHẬP NHÓM tab Giá Sàn (R16, 25/11/2026).
// Tình huống thật: nhóm "A5052 (tất cả)" có H112 (không có giá nhập) → cột "Giá nhập tuần trước" ra 69.345,
// "Giá nhập HT" 103.669 (bị pha loãng) thay vì ~106.220 / ~104.097.
import {giaNhapNhom,timDongGia,taoEffQ,skuCuaNhom,calcMgmtGroups,calcFloorPricePerSku,findUpdatedImportPrice,groupBySku,skuKeyNorm,defInputs} from '../src/lib/core.js';
let loi=0;
const gan=(ten,thuc,mong)=>{const ok=JSON.stringify(thuc)===JSON.stringify(mong);if(!ok)loi++;console.log(`${ok?'✅':'❌'} ${ten}: ${JSON.stringify(thuc)}${ok?'':'  ≠ mong '+JSON.stringify(mong)}`);};
const gan2=(ten,thuc,mong,saiSo)=>{const ok=typeof thuc==='number'&&Number.isFinite(thuc)&&Math.abs(thuc-mong)<=saiSo;if(!ok)loi++;console.log(`${ok?'✅':'❌'} ${ten}: ${thuc}${ok?'':'  ≠ mong '+mong+' ±'+saiSo}`);};

const TY_GIA=25970,HE_SO=1.015;
const TUAN_TRUOC=[
  {alloy:'A5052',temper:'H32',minThick:1,maxThick:99,priceFC:4010,importCoef:HE_SO,updateDate:'17/11/2026'},
  {alloy:'A5052',temper:'H34',minThick:1,maxThick:99,priceFC:4040,importCoef:HE_SO,updateDate:'17/11/2026'},
];
const HIEN_TAI=[
  {alloy:'A5052',temper:'H32',minThick:1,maxThick:99,priceFC:3995,importCoef:HE_SO,updateDate:'25/11/2026'},
  {alloy:'A5052',temper:'H34',minThick:1,maxThick:99,priceFC:3925,importCoef:HE_SO,updateDate:'25/11/2026'},
];
// Tồn A5052 mô phỏng: H32 201.899 kg, H34 383.870 kg, H112 2.418 kg — chia nhiều SKU, giá vốn khác nhau
const dong=(temper,thickness,qtyKg,avgCost)=>({alloy:'A5052',temper,thickness:String(thickness),width:'1250',length:'2500',coating:'KP',status:'IN_STOCK',qtyKg,avgCost});
const TON=[
  dong('H32',1.5,50000,98000),dong('H32',2,60000,99000),dong('H32',3,41899,100500),dong('H32',5,50000,101000),
  dong('H34',1.2,100000,97000),dong('H34',2,150000,98500),dong('H34',4,133870,99500),
  dong('H112',6,1000,120000),dong('H112',20,900,121000),dong('H112',50,518,122000),
];
const inputs={...defInputs,exchangeRate:TY_GIA};
const fpd=groupBySku(TON).map(grp=>calcFloorPricePerSku(grp,findUpdatedImportPrice(grp,HIEN_TAI,TY_GIA),inputs));
const laH112=r=>r.temper==='H112';
const H112=fpd.filter(laH112),KHAC=fpd.filter(r=>!laH112(r));
const THU_TU={'H112 ĐẦU':[...H112,...KHAC],'H112 GIỮA':[...KHAC.slice(0,3),...H112,...KHAC.slice(3)],'H112 CUỐI':[...KHAC,...H112]};
const QH112=2418;
// Số đúng tính tay (chỉ H32+H34)
const vnd=fc=>fc/1000*TY_GIA*HE_SO;
const DUNG_TT=(201899*vnd(4010)+383870*vnd(4040))/585769;
const DUNG_HT=(201899*vnd(3995)+383870*vnd(3925))/585769;
gan2('Số tay tuần trước ≈ 106.220',DUNG_TT,106220,2);
gan2('Số tay HT ≈ 104.097',DUNG_HT,104097,2);

// 1) giaNhapNhom bất biến theo thứ tự, loại H112 khỏi mẫu số
Object.entries(THU_TU).forEach(([ten,ds])=>{
  const kq=giaNhapNhom(ds,TUAN_TRUOC,TY_GIA,r=>r.totalQty);
  gan2(`[${ten}] tuần trước ≈ 106.220`,kq.priceVND,106220,2);
  gan(`[${ten}] thiếu giá = 3 mã H112 / 2.418 kg`,[kq.missingCount,kq.missingQty,kq.matchedCount,kq.matchedQty],[3,QH112,7,585769]);
  gan(`[${ten}] ngày`,kq.date,'17/11/2026');
  const ht=giaNhapNhom(ds,HIEN_TAI,TY_GIA,r=>r.totalQty);
  gan2(`[${ten}] HT qua giaNhapNhom ≈ 104.097`,ht.priceVND,104097,2);
  gan(`[${ten}] biến động ▼ ≈ 2.123`,Math.round(kq.priceVND-ht.priceVND),Math.round(DUNG_TT-DUNG_HT));
});

// 2) calcMgmtGroups: Giá nhập HT không bị pha loãng, bất biến thứ tự
// SỬA R17: DEFAULT_MGMT_GROUPS không còn nhóm gộp g6 (đã tách g7 H32 / g8 H34) → dựng nhóm gộp CỤC BỘ
// để giữ nguyên ý nghĩa + số kỳ vọng của các phép kiểm R16 bên dưới.
const G6={id:'g6',label:'A5052 (tất cả)',alloy:'A5052',temper:'',minThick:0,maxThick:99};
const ketQuaNhom=[];
Object.entries(THU_TU).forEach(([ten,ds])=>{
  const g=calcMgmtGroups(ds,[G6],{},null,false)[0];
  ketQuaNhom.push(g.avgNewImportPrice);
  gan2(`[${ten}] calcMgmtGroups avgNewImportPrice ≈ 104.097`,g.avgNewImportPrice,104097,2);
  gan(`[${ten}] importMissingCount/Qty`,[g.importMissingCount,g.importMissingQty],[3,QH112]);
});
gan('calcMgmtGroups bất biến thứ tự',ketQuaNhom.every(v=>Math.abs(v-ketQuaNhom[0])<1e-6),true);

// 3) Không hồi quy wa(): avgCost/avgFloor/totalQty vẫn tính trên TẤT CẢ SKU active (kể cả H112)
{
  const g=calcMgmtGroups(fpd,[G6],{},null,false)[0];
  const tongQ=fpd.reduce((s,r)=>s+r.totalQty,0);
  const tayCost=fpd.reduce((s,r)=>s+r.totalQty*r.costBasisPhysical,0)/tongQ;
  const tayFloor=fpd.reduce((s,r)=>s+r.totalQty*r.floorAbsolute,0)/tongQ;
  gan('totalQty gồm cả H112 = 588.187',g.totalQty,588187);
  gan2('avgCost = tính tay (cả H112)',g.avgCost,tayCost,1e-6);
  gan2('avgFloor = tính tay (cả H112)',g.avgFloor,tayFloor,1e-6);
  gan('skus / activeSkus',[g.skus,g.activeSkus],[10,10]);
}

// 4) 100% SKU thiếu giá → null (không NaN, không 0)
{
  const kq=giaNhapNhom(H112,TUAN_TRUOC,TY_GIA,r=>r.totalQty);
  gan('Toàn H112 → priceVND/priceFC null',[kq.priceVND,kq.priceFC,kq.matchedCount,kq.missingCount],[null,null,0,3]);
  const g=calcMgmtGroups(fpd,[{id:'x',label:'A5052 H112',alloy:'A5052',temper:'H112',minThick:0,maxThick:99}],{},null,false)[0];
  gan('Nhóm toàn H112 → avgNewImportPrice null',[g.avgNewImportPrice,g.importMissingCount,g.importMissingQty],[null,3,QH112]);
  const rong=calcMgmtGroups(fpd,[{id:'y',label:'Rỗng',alloy:'A9999',temper:'',minThick:0,maxThick:99}],{},null,false)[0];
  gan('Nhóm không SKU → avgNewImportPrice null + đủ trường mới',[rong.avgNewImportPrice,rong.importMissingCount,rong.importMissingQty],[null,0,0]);
  gan('Bảng giá rỗng → null',giaNhapNhom(KHAC,[],TY_GIA,r=>r.totalQty).priceVND,null);
  gan('Tỷ giá 0 → priceVND null, priceFC vẫn có',[giaNhapNhom(KHAC,TUAN_TRUOC,0,r=>r.totalQty).priceVND,giaNhapNhom(KHAC,TUAN_TRUOC,0,r=>r.totalQty).priceFC>0],[null,true]);
}

// 5) SKU khớp giá nhưng qty = 0 → không chia 0
{
  const sku0={alloy:'A5052',temper:'H32',thickness:'2',totalQty:0};
  const kq=giaNhapNhom([sku0],TUAN_TRUOC,TY_GIA,r=>r.totalQty);
  gan('Chỉ 1 SKU qty 0 → null, không NaN',[kq.priceVND,kq.priceFC,kq.matchedCount,kq.matchedQty],[null,null,1,0]);
  const kq2=giaNhapNhom([sku0,{alloy:'A5052',temper:'H34',thickness:'2',totalQty:100}],TUAN_TRUOC,TY_GIA,r=>r.totalQty);
  gan2('SKU qty 0 bị bỏ qua, còn lại = giá H34',kq2.priceVND,vnd(4040),1e-6);
  const g=calcMgmtGroups([{...fpd[0],totalQty:0}],[G6],{},null,false)[0];
  gan('calcMgmtGroups qty 0 → avgNewImportPrice null, avgCost 0 như cũ',[g.avgNewImportPrice,g.avgCost],[null,0]);
}

// 6) Chuẩn hoá mã + biên dày
{
  const bang=[{alloy:'A5052',temper:'H32',minThick:'',maxThick:'',priceFC:4000,importCoef:'',updateDate:'17/11/2026'}];
  gan('temper " h32 " / alloy "a5052" vẫn khớp',!!timDongGia({alloy:'a5052',temper:' h32 ',thickness:'3'},bang),true);
  gan('minThick rỗng → 0 (dày 0 khớp)',!!timDongGia({alloy:'A5052',temper:'H32',thickness:'0'},bang),true);
  gan('maxThick rỗng → không giới hạn (dày 500 khớp)',!!timDongGia({alloy:'A5052',temper:'H32',thickness:'500'},bang),true);
  gan('maxThick 0 là 0 thật (không thành 999)',!!timDongGia({alloy:'A5052',temper:'H32',thickness:'3'},[{...bang[0],maxThick:0}]),false);
  gan('importCoef rỗng → 1',Math.round(giaNhapNhom([{alloy:'A5052',temper:'H32',thickness:'3',totalQty:10}],bang,TY_GIA,r=>r.totalQty).priceVND),Math.round(4000/1000*TY_GIA));
  gan('Khác temper không khớp',timDongGia({alloy:'A5052',temper:'H112',thickness:'6'},bang),null);
  const m=findUpdatedImportPrice({alloy:'a5052',temper:'h32 ',thickness:'2'},HIEN_TAI,TY_GIA);
  gan('findUpdatedImportPrice giữ dạng kết quả',Object.keys(m),['priceFC','importCoef','priceVNDperKg','note','updateDate','competitorPrice','competitorFloorPrice']);
  gan2('findUpdatedImportPrice giá VND H32',m.priceVNDperKg,vnd(3995),1e-6);
}

// 7) date = ngày MỚI NHẤT khi các dòng khớp có ngày khác nhau (không phụ thuộc thứ tự)
{
  const bang=[{...TUAN_TRUOC[0],updateDate:'20/11/2026'},{...TUAN_TRUOC[1],updateDate:'16/11/2026'}];
  gan('Ngày mới nhất (H112 đầu)',giaNhapNhom(THU_TU['H112 ĐẦU'],bang,TY_GIA,r=>r.totalQty).date,'20/11/2026');
  gan('Ngày mới nhất (đảo thứ tự SKU)',giaNhapNhom([...KHAC].reverse(),bang,TY_GIA,r=>r.totalQty).date,'20/11/2026');
}

// 8) Bật loại PO + loại tay 1 SKU: trọng số giaNhapNhom (qua taoEffQ/skuCuaNhom) khớp calcMgmtGroups
{
  const h34=fpd.find(r=>r.temper==='H34'&&r.thickness==='2');
  const po={[skuKeyNorm(h34)]:{remaining:50000}};
  const loaiTay={g6:[fpd.find(r=>r.temper==='H32'&&r.thickness==='1.5').skuKey]};
  const g=calcMgmtGroups(fpd,[G6],loaiTay,po,true)[0];
  const {active}=skuCuaNhom(fpd,G6,loaiTay);
  const effQ=taoEffQ(po,true);
  const kq=giaNhapNhom(active,HIEN_TAI,TY_GIA,effQ);
  gan2('Giá HT qua giaNhapNhom = calcMgmtGroups (PO + loại tay)',kq.priceVND,g.avgNewImportPrice,1e-6);
  gan('Tổng trọng số khớp: matchedQty+missingQty = totalQty nhóm',kq.matchedQty+kq.missingQty,g.totalQty);
  gan('PO trừ đúng 50.000 kg, loại tay 50.000 kg',g.totalQty,588187-50000-50000);
  gan('effQ không âm',taoEffQ({[skuKeyNorm(h34)]:{remaining:9e9}},true)(h34),0);
  gan('Tắt loại PO → effQ = totalQty',taoEffQ(po,false)(h34),h34.totalQty);
}

console.log(loi?`\n❌ ${loi} phép kiểm SAI`:'\nToàn bộ phép kiểm ĐÚNG');
if(loi) process.exit(1);
