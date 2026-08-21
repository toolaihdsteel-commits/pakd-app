import React from 'react';
const {useState}=React;

// ═══ TAB 📊 BIỂU ĐỒ KỸ THUẬT — khung rỗng (GĐ1) ═══
// GĐ2 sẽ gắn KLineChart v9 vào đây:
//   - Nến SHFE nhôm (alm / aom / adm) lấy trực tiếp từ EastMoney
//     · realtime : push2.eastmoney.com/api/qt/stock/get          (CORS *)
//     · nến      : push2his.eastmoney.com/api/qt/stock/kline/get (CORS *)
//     · trong ngày: push2his.eastmoney.com/api/qt/stock/trends2/get
//     · KHÔNG dùng futsseapi.eastmoney.com — host này không bật CORS
//   - Pan/zoom + vẽ Trendline (`segment`) và Đường ngang (`horizontalStraightLine`)
//   - Lùi về /pakd-app/market/*.json tĩnh khi EastMoney chặn theo IP
//
// Giữ khung này tối giản để anh Huy soát tính toàn vẹn GĐ1 trước khi gắn thư viện.

export const MA_NHOM=[
  {ma:'alm',ten:'Nhôm Thượng Hải A00',lo:5, donVi:'CNY/tấn'},
  {ma:'aom',ten:'Alumina (oxit nhôm)', lo:20,donVi:'CNY/tấn'},
  {ma:'adm',ten:'Hợp kim nhôm đúc',    lo:10,donVi:'CNY/tấn'},
];

export const KHUNG_TG=[
  {k:'trends', l:'Trong ngày', klt:null},
  {k:'1',      l:'1 phút',     klt:1},
  {k:'5',      l:'5 phút',     klt:5},
  {k:'15',     l:'15 phút',    klt:15},
  {k:'30',     l:'30 phút',    klt:30},
  {k:'60',     l:'1 giờ',      klt:60},
  {k:'101',    l:'Ngày',       klt:101},
  {k:'102',    l:'Tuần',       klt:102},
  {k:'103',    l:'Tháng',      klt:103},
];

export const EastMoneyChart=({marketData=[],bg1,bg2,border2})=>{
  const [ma,setMa]=useState('alm');
  const [khung,setKhung]=useState('101');
  const hang=marketData[0]||null;

  return (
    <div style={{flex:1,padding:'18px',overflowY:'auto',background:bg1}}>
      <div style={{maxWidth:'1300px',margin:'0 auto'}}>

        <div style={{marginBottom:12}}>
          <h2 style={{fontWeight:900,fontSize:'1.05rem',color:'#0f172a'}}>📊 Biểu đồ Kỹ thuật — Nhôm SHFE</h2>
          <p style={{fontSize:'.72rem',color:'#475569',fontWeight:600,marginTop:2}}>
            Nến OHLC sàn Thượng Hải · phóng to/kéo ngang · vẽ đường xu hướng &amp; đường ngang.
            Dùng để <b>đọc xu hướng</b>; giá tuyệt đối để tính giá vốn vẫn lấy ở tab 📈 Thị trường (SMM giao ngay).
          </p>
        </div>

        {/* Thanh chọn mã + khung thời gian */}
        <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',marginBottom:12,
                     background:bg2,border:`1px solid ${border2}`,borderRadius:8,padding:'8px 10px'}}>
          <select value={ma} onChange={e=>setMa(e.target.value)}
                  style={{fontSize:'.72rem',fontWeight:700,padding:'4px 8px',borderRadius:5,border:`1px solid ${border2}`}}>
            {MA_NHOM.map(m=><option key={m.ma} value={m.ma}>{m.ten} ({m.ma})</option>)}
          </select>
          <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
            {KHUNG_TG.map(k=>(
              <button key={k.k} onClick={()=>setKhung(k.k)}
                style={{fontSize:'.68rem',fontWeight:700,padding:'4px 9px',borderRadius:5,cursor:'pointer',
                        border:`1px solid ${khung===k.k?'#0891b2':border2}`,
                        background:khung===k.k?'#0891b2':'#fff',color:khung===k.k?'#fff':'#475569'}}>
                {k.l}
              </button>
            ))}
          </div>
        </div>

        {/* Chỗ dành cho KLineChart (GĐ2) */}
        <div style={{background:bg2,border:`1px dashed ${border2}`,borderRadius:8,
                     height:460,display:'flex',flexDirection:'column',alignItems:'center',
                     justifyContent:'center',gap:8,color:'#64748b'}}>
          <div style={{fontSize:'2rem'}}>📊</div>
          <div style={{fontSize:'.82rem',fontWeight:800}}>Khung biểu đồ — sẽ gắn KLineChart ở Giai đoạn 2</div>
          <div style={{fontSize:'.7rem',fontWeight:600}}>
            Đang chọn: <b>{MA_NHOM.find(m=>m.ma===ma)?.ten}</b> · khung <b>{KHUNG_TG.find(k=>k.k===khung)?.l}</b>
          </div>
          <div style={{fontSize:'.66rem',marginTop:4,textAlign:'center',maxWidth:460,lineHeight:1.6}}>
            GĐ1 chỉ dựng khung và tách mã nguồn. Chưa gọi mạng, chưa vẽ nến —
            để soát tính toàn vẹn trước khi thêm phụ thuộc mới.
          </div>
        </div>

        {/* Tham chiếu nhanh: số liệu ngày gần nhất từ sheet MARKET_PRICES */}
        {hang&&(
          <div style={{marginTop:12,background:bg2,border:`1px solid ${border2}`,borderRadius:8,padding:'10px 12px'}}>
            <div style={{fontSize:'.66rem',fontWeight:900,color:'#64748b',marginBottom:5}}>
              THAM CHIẾU NGÀY {hang.date} <span style={{fontWeight:600}}>(nguồn: sheet MARKET_PRICES)</span>
            </div>
            <div style={{display:'flex',gap:16,flexWrap:'wrap',fontSize:'.75rem',fontWeight:800}}>
              <span>SMM A00: <b className="mono">{hang.smm_cny??'—'} ¥/t</b></span>
              <span>SHFE: <b className="mono">{hang.shfe_cny??'—'} ¥/t</b></span>
              <span>LME: <b className="mono">{hang.lme_usd??'—'} $/t</b></span>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
