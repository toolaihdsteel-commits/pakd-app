// Kiểm NHÓM QUẢN LÝ tab Giá Sàn → Quản lý (R17, 25/11/2026).
// 7 nhóm khớp 1-1 với 7 dòng bảng giá nhập Sheet: g1–g5 giữ nguyên, bỏ g6 "A5052 (tất cả)", thêm g7 H32 / g8 H34.
import {DEFAULT_MGMT_GROUPS,skuCuaNhom,calcMgmtGroups,calcFloorPricePerSku,findUpdatedImportPrice,groupBySku,giaNhapNhom,taoEffQ,
  timDongGia,filterLatestUIP,filterPrevWeekUIP,khoaDongGia,sanTruocCuaNhom,defInputs} from '../src/lib/core.js';
let loi=0;
const gan=(ten,thuc,mong)=>{const ok=JSON.stringify(thuc)===JSON.stringify(mong);if(!ok)loi++;console.log(`${ok?'✅':'❌'} ${ten}: ${JSON.stringify(thuc)}${ok?'':'  ≠ mong '+JSON.stringify(mong)}`);};
const gan2=(ten,thuc,mong,saiSo)=>{const ok=typeof thuc==='number'&&Number.isFinite(thuc)&&Math.abs(thuc-mong)<=saiSo;if(!ok)loi++;console.log(`${ok?'✅':'❌'} ${ten}: ${thuc}${ok?'':'  ≠ mong '+mong+' ±'+saiSo}`);};
const nhom=id=>DEFAULT_MGMT_GROUPS.find(g=>g.id===id);

// 1) Danh sách nhóm
gan('Đúng 7 nhóm',DEFAULT_MGMT_GROUPS.length,7);
gan('Danh sách id',DEFAULT_MGMT_GROUPS.map(g=>g.id),['g1','g2','g3','g4','g5','g7','g8']);
gan('Không còn id g6',DEFAULT_MGMT_GROUPS.some(g=>g.id==='g6'),false);
gan('g7 đúng thiết kế',nhom('g7'),{id:'g7',label:'A5052 H32 1.0–99.0mm',alloy:'A5052',temper:'H32',minThick:1.0,maxThick:99.0,legacyLabels:['A5052 (tất cả)']});
gan('g8 đúng thiết kế',nhom('g8'),{id:'g8',label:'A5052 H34 1.0–99.0mm',alloy:'A5052',temper:'H34',minThick:1.0,maxThick:99.0,legacyLabels:['A5052 (tất cả)']});
gan('Nhãn không trùng',new Set(DEFAULT_MGMT_GROUPS.map(g=>g.label)).size,7);

// 2) Gom SKU vào nhóm — bộ SKU giả (dạng floorPriceData tối giản)
const sku=(skuKey,alloy,temper,thickness,totalQty,costBasisPhysical,floorAbsolute,extra)=>({skuKey,alloy,temper,thickness:String(thickness),totalQty,costBasisPhysical,floorAbsolute,priceCore:floorAbsolute,priceLoyal:floorAbsolute,priceNew:floorAbsolute,competitorPrice:0,competitorFloorPrice:0,newImportPriceVND:null,...(extra||{})});
const BO=[
  // A1050 (g1/g2/g3 — temper rỗng = mọi temper)
  sku('a1','A1050','H14',0.3,1000,80000,82000), sku('a2','A1050','H14',0.4,3000,84000,86000),
  sku('a3','A1050','H14',0.6,2000,81000,83000), sku('a4','A1050','H14',0.8,2000,83000,85000),
  sku('a5','A1050','H14',2.0,5000,79000,81000),
  // A3003
  sku('b1','A3003','H14',2.0,4000,90000,92000), sku('b2','A3003','H16',3.0,1000,95000,97000),
  // A5052
  sku('c1','A5052','H32',1.5,500,98000,100000), sku('c2','A5052','H32',3.0,1500,100000,102000),
  sku('c3','A5052','H34',2.0,2500,97000,99000),
  sku('c4','A5052','H112',6.0,700,120000,123000), sku('c5','A5052','H32',0.8,300,99000,101000),
];
const thuoc=k=>DEFAULT_MGMT_GROUPS.filter(g=>skuCuaNhom(BO,g,{}).matching.some(r=>r.skuKey===k)).map(g=>g.id);
gan('H32 1.5mm chỉ vào g7',thuoc('c1'),['g7']);
gan('H32 3.0mm chỉ vào g7',thuoc('c2'),['g7']);
gan('H34 chỉ vào g8',thuoc('c3'),['g8']);
gan('H112 không vào nhóm nào',thuoc('c4'),[]);
gan('H32 dày 0.8 không vào nhóm nào',thuoc('c5'),[]);
const KQ=calcMgmtGroups(BO,DEFAULT_MGMT_GROUPS,{},null,false);
const kq=id=>KQ.find(g=>g.id===id);
gan('Tổng tồn g7 = 500+1500',kq('g7').totalQty,2000);
gan('Tổng tồn g8 = 2500',kq('g8').totalQty,2500);
gan('Số mã g7/g8',[kq('g7').skus,kq('g8').skus],[2,1]);
gan2('avgCost g7 = (500×98000+1500×100000)/2000 = 99500',kq('g7').avgCost,99500,1e-6);

// 3) Chuẩn hoá chữ thường / dấu cách
{
  const r=sku('z1',' a5052 ','h32 ',2,10,1,1);
  gan("SKU ' a5052 ' / 'h32 ' vào g7",DEFAULT_MGMT_GROUPS.filter(g=>skuCuaNhom([r],g,{}).matching.length>0).map(g=>g.id),['g7']);
  const nhomThuong={...nhom('g7'),alloy:' a5052',temper:'h32'};
  gan('Nhóm ghi chữ thường vẫn gom được SKU chuẩn',skuCuaNhom(BO,nhomThuong,{}).matching.map(r=>r.skuKey),['c1','c2']);
}

// 4) Giá đối thủ không bị pha loãng
{
  const ds=[
    sku('d1','A5052','H32',2,100,1,1,{competitorPrice:110000,competitorFloorPrice:105000}),
    sku('d2','A5052','H32',3,300,1,1),
    sku('d3','A5052','H34',2,400,1,1),
  ];
  const [g7,g8]=calcMgmtGroups(ds,[nhom('g7'),nhom('g8')],{},null,false);
  gan('g7: BQ ĐT = đúng giá mã có giá',[g7.avgCompPrice,g7.avgCompFloor],[110000,105000]);
  gan('g7: compMissingCount = 1',g7.compMissingCount,1);
  gan('g8: không mã nào có giá ĐT → 0 (kiểu số)',[g8.avgCompPrice,g8.avgCompFloor],[0,0]);
  gan('Nhóm rỗng → avgCompPrice 0',calcMgmtGroups([],[nhom('g7')],{},null,false)[0].avgCompPrice,0);
}

// 5) Lệch ngày giữa các dòng giá
const dd=d=>`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
const cong=(d,n)=>{const x=new Date(d);x.setHours(0,0,0,0);x.setDate(x.getDate()+n);return x;};
{
  const D=new Date();
  const rows=[
    {alloy:'A1050',temper:'H14',minThick:1,maxThick:6,priceFC:2700,updateDate:dd(D),id:'1050_D'},
    {alloy:'A1050',temper:'H14',minThick:1,maxThick:6,priceFC:2750,updateDate:dd(cong(D,-1)),id:'1050_D-1'},
    {alloy:'A5052',temper:'H32',minThick:1,maxThick:99,priceFC:3995,updateDate:dd(cong(D,-2)),id:'H32_D-2'},
    {alloy:'A5052',temper:'H32',minThick:1,maxThick:99,priceFC:4100,updateDate:dd(cong(D,-9)),id:'H32_D-9'},
    {alloy:' a5052 ',temper:'h34',minThick:'1',maxThick:'99',priceFC:3925,updateDate:dd(cong(D,-2)),id:'H34_D-2'},
  ];
  gan('filterLatestUIP giữ dòng mới nhất của TỪNG khoá',filterLatestUIP(rows).map(r=>r.id),['1050_D','H32_D-2','H34_D-2']);
  const coNgayHong=[...rows,{alloy:'A3003',temper:'H14',minThick:1,maxThick:5,priceFC:3000,updateDate:'',id:'3003_rong'},
    {alloy:'A1050',temper:'H14',minThick:1,maxThick:6,priceFC:2600,updateDate:'abc',id:'1050_hong'}];
  gan('Ngày hỏng: khoá có ngày hợp lệ → bỏ dòng hỏng; khoá không có ngày → giữ',filterLatestUIP(coNgayHong).map(r=>r.id),['1050_D','H32_D-2','H34_D-2','3003_rong']);
  gan('Mọi dòng không có ngày → trả nguyên',filterLatestUIP([{alloy:'A1050',updateDate:''},{alloy:'A5052',updateDate:''}]).length,2);
  gan('khoaDongGia chuẩn hoá',khoaDongGia(rows[4])===khoaDongGia({alloy:'A5052',temper:'H34',minThick:1,maxThick:99}),true);

  // Tuần trước: thứ 2 tuần trước = thứ 2 tuần này − 7 (giữ nguyên cách xác định khung của filterPrevWeekUIP)
  const dow=D.getDay(),tuThu2=dow===0?6:dow-1;
  const t2Truoc=cong(D,-tuThu2-7);
  const tw=[
    {alloy:'A1050',temper:'H14',minThick:1,maxThick:6,priceFC:2700,updateDate:dd(cong(t2Truoc,4)),id:'1050_T6'},
    {alloy:'A1050',temper:'H14',minThick:1,maxThick:6,priceFC:2690,updateDate:dd(cong(t2Truoc,1)),id:'1050_T3'},
    {alloy:'A5052',temper:'H32',minThick:1,maxThick:99,priceFC:4010,updateDate:dd(cong(t2Truoc,2)),id:'H32_T4'},
    {alloy:'A5052',temper:'H32',minThick:1,maxThick:99,priceFC:4050,updateDate:dd(t2Truoc),id:'H32_T2'},
    {alloy:'A5052',temper:'H34',minThick:1,maxThick:99,priceFC:4040,updateDate:dd(cong(t2Truoc,6)),id:'H34_CN'},
    {alloy:'A5052',temper:'H34',minThick:1,maxThick:99,priceFC:3925,updateDate:dd(cong(t2Truoc,7)),id:'H34_tuanNay'},
    {alloy:'A5052',temper:'H32',minThick:1,maxThick:99,priceFC:3999,updateDate:dd(cong(t2Truoc,-1)),id:'H32_tuanKia'},
  ];
  gan('filterPrevWeekUIP: ngày mới nhất trong tuần trước RIÊNG từng khoá',filterPrevWeekUIP(tw).map(r=>r.id),['1050_T6','H32_T4','H34_CN']);
  gan('filterPrevWeekUIP không có dòng trong tuần trước → []',filterPrevWeekUIP([tw[5]]),[]);
}

// 6) timDongGia: dòng mới hơn thắng khi chồng dải dày
{
  const cu={alloy:'A5052',temper:'H32',minThick:0.5,maxThick:10,priceFC:4100,updateDate:'01/11/2026'};
  const moi={alloy:'A5052',temper:'H32',minThick:1,maxThick:99,priceFC:3995,updateDate:'25/11/2026'};
  const s={alloy:'A5052',temper:'H32',thickness:'2'};
  gan('Dòng cũ đứng trước → vẫn lấy dòng mới',timDongGia(s,[cu,moi]).priceFC,3995);
  gan('Dòng mới đứng trước → lấy dòng mới',timDongGia(s,[moi,cu]).priceFC,3995);
  gan('Hoà ngày → dòng đứng trước',timDongGia(s,[{...cu,updateDate:'25/11/2026'},moi]).priceFC,4100);
  gan('Chỉ dòng cũ phủ dày 0.8 → vẫn khớp dòng cũ',timDongGia({...s,thickness:'0.8'},[cu,moi]).priceFC,4100);
}

// 7) sanTruocCuaNhom
{
  const cu=Object.freeze({publishedFloor:101000,issuedDate:'18/11/2026',issuedBy:'X'});
  const moi=Object.freeze({publishedFloor:104000,issuedDate:'25/11/2026',issuedBy:'Y'});
  const a1=Object.freeze({publishedFloor:85000,issuedDate:'18/11/2026',issuedBy:'X'});
  const map=Object.freeze({'A5052 (tất cả)':cu,'A5052 H32 1.0–99.0mm':moi,'A1050 H14 0.2–0.49mm':a1});
  const anh=JSON.stringify(map);
  gan('Có nhãn mới → lấy nhãn mới, không cờ',sanTruocCuaNhom(map,nhom('g7')),moi);
  const r8=sanTruocCuaNhom(map,nhom('g8'));
  gan('Chỉ có nhãn cũ → lấy nhãn cũ kèm cờ',r8,{...cu,tuNhomCu:'A5052 (tất cả)'});
  gan('Đối tượng gốc không bị sửa',[JSON.stringify(map)===anh,'tuNhomCu' in cu,r8!==cu],[true,false,true]);
  gan('Không có cả hai → null',sanTruocCuaNhom({'A1050 H14 0.2–0.49mm':a1},nhom('g8')),null);
  gan('Nhóm A1050 không dính fallback',sanTruocCuaNhom({'A5052 (tất cả)':cu},nhom('g2')),null);
  gan('Nhóm A1050 lấy đúng nhãn của nó',sanTruocCuaNhom(map,nhom('g1')),a1);
  gan('Map rỗng / undefined → null',[sanTruocCuaNhom({},nhom('g7')),sanTruocCuaNhom(undefined,nhom('g7'))],[null,null]);
}

// 8) Nháp cũ có khoá g6
{
  let nem=null,r=null;
  try{r=calcMgmtGroups(BO,DEFAULT_MGMT_GROUPS,{g6:['c1','c2','c3','c4']},null,false);}catch(e){nem=e.message;}
  gan('excludedSkus={g6:[...]} không ném lỗi',nem,null);
  gan('Không loại mã nào của g7/g8',r&&[r.find(g=>g.id==='g7').activeSkus,r.find(g=>g.id==='g8').activeSkus,r.find(g=>g.id==='g7').totalQty],[2,1,2000]);
}

// 9) Bất biến g1–g5 (số tính tay)
{
  const mong={
    g1:{totalQty:4000,avgCost:(1000*80000+3000*84000)/4000,avgFloor:(1000*82000+3000*86000)/4000}, // 83000 / 85000
    g2:{totalQty:4000,avgCost:(2000*81000+2000*83000)/4000,avgFloor:(2000*83000+2000*85000)/4000}, // 82000 / 84000
    g3:{totalQty:5000,avgCost:79000,avgFloor:81000},
    g4:{totalQty:4000,avgCost:90000,avgFloor:92000},
    g5:{totalQty:1000,avgCost:95000,avgFloor:97000},
  };
  gan('Số tay g1 = 83.000 / 85.000',[mong.g1.avgCost,mong.g1.avgFloor],[83000,85000]);
  Object.entries(mong).forEach(([id,m])=>{
    const g=kq(id);
    gan(`${id} totalQty/avgCost/avgFloor`,[g.totalQty,g.avgCost,g.avgFloor],[m.totalQty,m.avgCost,m.avgFloor]);
  });
}

// 10) Bảng số MÔ PHỎNG g7 / g8
{
  const TY_GIA=25970,HE_SO=1.015;
  const vnd=fc=>fc/1000*TY_GIA*HE_SO;
  const HIEN_TAI=[
    {alloy:'A1050',temper:'H14',minThick:1,maxThick:6,priceFC:2700,importCoef:HE_SO,updateDate:'25/11/2026'},
    {alloy:'A5052',temper:'H32',minThick:1,maxThick:99,priceFC:3995,importCoef:HE_SO,updateDate:'25/11/2026',competitorPrice:109500,competitorFloorPrice:106000},
    {alloy:'A5052',temper:'H34',minThick:1,maxThick:99,priceFC:3925,importCoef:HE_SO,updateDate:'25/11/2026',competitorPrice:108000,competitorFloorPrice:0},
  ];
  const TUAN_TRUOC=[
    {alloy:'A5052',temper:'H32',minThick:1,maxThick:99,priceFC:4010,importCoef:HE_SO,updateDate:'17/11/2026'},
    {alloy:'A5052',temper:'H34',minThick:1,maxThick:99,priceFC:4040,importCoef:HE_SO,updateDate:'17/11/2026'},
  ];
  const dong=(temper,thickness,qtyKg,avgCost)=>({alloy:'A5052',temper,thickness:String(thickness),width:'1250',length:'2500',coating:'KP',status:'IN_STOCK',qtyKg,avgCost});
  const TON=[
    dong('H32',1.5,50000,98000),dong('H32',2,60000,99000),dong('H32',3,41899,100500),dong('H32',5,50000,101000),
    dong('H34',1.2,100000,97000),dong('H34',2,150000,98500),dong('H34',4,133870,99500),
    dong('H112',6,1000,120000),dong('H112',20,900,121000),dong('H112',50,518,122000),
    dong('H32',0.8,3000,99500),
  ];
  const inputs={...defInputs,exchangeRate:TY_GIA};
  const fpd=groupBySku(TON).map(grp=>calcFloorPricePerSku(grp,findUpdatedImportPrice(grp,HIEN_TAI,TY_GIA),inputs));
  const [g7,g8]=calcMgmtGroups(fpd,[nhom('g7'),nhom('g8')],{},null,false);
  const f=v=>v==null||v===0?'—':new Intl.NumberFormat('vi-VN').format(Math.round(v));
  console.log('\n── BẢNG SỐ g7 / g8 — DỮ LIỆU MÔ PHỎNG (không phải số thật; tỷ giá 25.970, hệ số 1,015; HT 25/11/2026, tuần trước 17/11/2026) ──');
  console.log('Nhóm | Tồn (kg) | Giá nhập tuần trước | Giá nhập HT | Biến động | BQ ĐT | Sàn ĐT');
  [g7,g8].forEach(g=>{
    const tt=giaNhapNhom(skuCuaNhom(fpd,g,{}).active,TUAN_TRUOC,TY_GIA,taoEffQ(null,false));
    const bd=g.avgNewImportPrice!=null&&tt.priceVND!=null?g.avgNewImportPrice-tt.priceVND:null;
    console.log(`${g.label} | ${f(g.totalQty)} | ${f(tt.priceVND)} (${tt.date}) | ${f(g.avgNewImportPrice)} | ${bd==null?'—':(bd>0?'▲':'▼')+f(Math.abs(bd))} | ${f(g.avgCompPrice)} | ${f(g.avgCompFloor)}`);
    g.__tt=tt.priceVND;
  });
  console.log('');
  gan('MÔ PHỎNG g7 tồn (H32 ≥1.0, không gồm 0.8mm)',g7.totalQty,201899);
  gan('MÔ PHỎNG g8 tồn',g8.totalQty,383870);
  gan2('MÔ PHỎNG g7 giá nhập tuần trước = CIF 4010',g7.__tt,vnd(4010),1e-6);
  gan2('MÔ PHỎNG g7 giá nhập HT = CIF 3995',g7.avgNewImportPrice,vnd(3995),1e-6);
  gan2('MÔ PHỎNG g8 giá nhập tuần trước = CIF 4040',g8.__tt,vnd(4040),1e-6);
  gan2('MÔ PHỎNG g8 giá nhập HT = CIF 3925',g8.avgNewImportPrice,vnd(3925),1e-6);
  gan('MÔ PHỎNG BQ ĐT / Sàn ĐT',[g7.avgCompPrice,g7.avgCompFloor,g8.avgCompPrice,g8.avgCompFloor],[109500,106000,108000,0]);
  gan('MÔ PHỎNG g7/g8 không thiếu giá nhập',[g7.importMissingCount,g8.importMissingCount],[0,0]);
}

console.log(loi?`\n❌ ${loi} phép kiểm SAI`:'\nToàn bộ phép kiểm ĐÚNG');
if(loi) process.exit(1);
