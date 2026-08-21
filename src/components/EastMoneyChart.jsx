import React from 'react';
const {useState,useEffect,useRef,useCallback}=React;
import {KHUNG_TG,MA_NHOM,layGiaHienTai,layNen,timKhung,timMa,trangThaiPhien} from '../lib/eastmoney';

// ═══ TAB 📊 BIỂU ĐỒ KỸ THUẬT — nến nhôm SHFE (GĐ2) ═══
// klinecharts chạm `window` NGAY LÚC IMPORT → phải nạp động trong useEffect,
// nếu import ở đầu file thì smoke test (render phía máy chủ) sẽ vỡ và
// bundle chính phình thêm ~150 KB dù người dùng chưa mở tab này.

const NHAN_NGUON={mang:'trực tiếp',ram:'nhớ tạm',phien:'phiên trước',tinh:'ảnh chụp tĩnh'};

export const EastMoneyChart=({marketData=[],bg1,bg2,border2})=>{
  const [ma,setMa]=useState('alm');
  const [khungK,setKhungK]=useState('101');
  const [dangTai,setDangTai]=useState(true);
  const [loi,setLoi]=useState(null);
  const [canhBao,setCanhBao]=useState(null);
  const [nguon,setNguon]=useState(null);
  const [soNen,setSoNen]=useState(0);
  const [gia,setGia]=useState(null);
  const [phien,setPhien]=useState(()=>trangThaiPhien());

  const boxRef=useRef(null);
  const chartRef=useRef(null);
  const huyRef=useRef(null);

  const kh=timKhung(khungK);
  const mInfo=timMa(ma);

  // ── Khởi tạo biểu đồ 1 lần (nạp động klinecharts) ──
  useEffect(()=>{
    let huy=false,chart=null;
    (async()=>{
      const {init,dispose}=await import('klinecharts');
      if(huy||!boxRef.current) return;
      chart=init(boxRef.current,{
        locale:'en-US',
        // PHẢI là giờ sàn (Bắc Kinh), KHÔNG phải giờ VN. Nến NGÀY được EastMoney
        // đóng dấu lúc 00:00 Bắc Kinh; nếu quy về giờ VN thì thành 23:00 hôm
        // trước → trục hoành lùi mất 1 ngày (nến 21/8 hiện thành 20/8).
        timezone:'Asia/Shanghai',
        styles:{
          grid:{horizontal:{color:'#eef2f7'},vertical:{color:'#eef2f7'}},
          candle:{
            // Quy ước VIỆT NAM: xanh = tăng, đỏ = giảm (ngược app Trung Quốc)
            bar:{upColor:'#16a34a',downColor:'#dc2626',noChangeColor:'#94a3b8',
                 upBorderColor:'#16a34a',downBorderColor:'#dc2626',
                 upWickColor:'#16a34a',downWickColor:'#dc2626'},
            priceMark:{last:{upColor:'#16a34a',downColor:'#dc2626'}},
            tooltip:{legend:{template:[
              {title:'Mở ',value:'{open}'},{title:'Cao ',value:'{high}'},
              {title:'Thấp ',value:'{low}'},{title:'Đóng ',value:'{close}'},
              {title:'KL ',value:'{volume}'},
            ]}},
          },
          indicator:{lastValueMark:{show:false}},
        },
      });
      if(!chart) return;
      chartRef.current=chart;
      chart.createIndicator('MA',false,{id:'candle_pane'});
      chart.createIndicator('VOL');
      // Canvas của klinecharts giữ nguyên 300x150 nếu vùng chứa chưa có kích
      // thước lúc init (tab vừa mount, layout chưa xong). Ép vẽ lại sau layout.
      requestAnimationFrame(()=>chartRef.current?.resize());
      setTimeout(()=>chartRef.current?.resize(),120);
      // Hook chẩn đoán khi chạy npm run dev: mở Console gõ __bieuDo.getDataList()
      if(import.meta.env?.DEV) window.__bieuDo=chart;
    })();
    // Đổi cỡ cửa sổ / mở-đóng panel → vẽ lại cho khớp
    const ro=typeof ResizeObserver!=='undefined'
      ? new ResizeObserver(()=>chartRef.current?.resize()) : null;
    if(ro&&boxRef.current) ro.observe(boxRef.current);
    return()=>{
      huy=true;
      ro?.disconnect();
      huyRef.current?.abort();
      if(chartRef.current){ import('klinecharts').then(({dispose})=>dispose(chartRef.current)).catch(()=>{}); chartRef.current=null; }
    };
  },[]);

  // ── Nạp dữ liệu mỗi khi đổi mã / khung ──
  const nap=useCallback(async(boQuaCache=false)=>{
    huyRef.current?.abort();
    const ac=new AbortController(); huyRef.current=ac;
    setDangTai(true); setLoi(null); setCanhBao(null);
    try{
      const g=await layNen(ma,khungK,{signal:ac.signal,boQuaCache});
      if(ac.signal.aborted) return;
      const chart=chartRef.current;
      if(chart){
        chart.setSymbol({ticker:ma,pricePrecision:0,volumePrecision:0});
        chart.setPeriod(kh.period);
        // Trong ngày là đường 1 giá/phút → vẽ dạng vùng cho đúng bản chất
        chart.setStyles({candle:{type:g.kieu==='trongNgay'?'area':'candle_solid'}});
        chart.setDataLoader({
          getBars:({type,callback})=>{
            callback(type==='init'?g.nen:[],{backward:false,forward:false});
          },
        });
        requestAnimationFrame(()=>chartRef.current?.resize());
      }
      setSoNen(g.nen.length); setNguon(g.nguon); setCanhBao(g.canhBao||null);
    }catch(e){
      if(!ac.signal.aborted) setLoi(e.message);
    }finally{
      if(!ac.signal.aborted) setDangTai(false);
    }
  },[ma,khungK,kh.period]);

  useEffect(()=>{nap();},[nap]);

  // ── Giá hiện tại + trạng thái phiên; làm mới 30 s trong giờ giao dịch ──
  useEffect(()=>{
    let dung=false;
    const doc=async()=>{
      setPhien(trangThaiPhien());
      try{const q=await layGiaHienTai(ma); if(!dung) setGia(q);}catch{ /* im lặng, không chặn biểu đồ */ }
    };
    doc();
    const id=setInterval(()=>{ if(trangThaiPhien().mo) doc(); else setPhien(trangThaiPhien()); },30000);
    return()=>{dung=true;clearInterval(id);};
  },[ma]);

  const hang=marketData[0]||null;
  const mauTD=gia?.thayDoi>0?'#16a34a':gia?.thayDoi<0?'#dc2626':'#64748b';
  const nut=(on)=>({fontSize:'.68rem',fontWeight:700,padding:'4px 9px',borderRadius:5,cursor:'pointer',
    border:`1px solid ${on?'#0891b2':border2}`,background:on?'#0891b2':'#fff',color:on?'#fff':'#475569'});

  return (
    <div style={{flex:1,padding:'18px',overflowY:'auto',background:bg1}}>
      <div style={{maxWidth:'1300px',margin:'0 auto'}}>

        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',
                     marginBottom:12,flexWrap:'wrap',gap:8}}>
          <div>
            <h2 style={{fontWeight:900,fontSize:'1.05rem',color:'#0f172a'}}>📊 Biểu đồ Kỹ thuật — Nhôm SHFE</h2>
            <p style={{fontSize:'.72rem',color:'#475569',fontWeight:600,marginTop:2}}>
              Nến OHLC sàn Thượng Hải · kéo ngang &amp; lăn chuột để phóng to. Dùng để <b>đọc xu hướng</b>;
              giá tuyệt đối tính giá vốn vẫn lấy ở tab 📈 Thị trường (SMM giao ngay).
            </p>
          </div>
          <div style={{display:'flex',gap:6,alignItems:'center'}}>
            <span style={{fontSize:'.66rem',fontWeight:700,padding:'3px 9px',borderRadius:99,
                          border:`1px solid ${phien.mo?'#16a34a':border2}`,
                          background:phien.mo?'#f0fdf4':'#fff',color:phien.mo?'#16a34a':'#64748b'}}>
              {phien.mo?'● ':'○ '}{phien.chu}
            </span>
            <button onClick={()=>nap(true)} style={nut(false)}>↻ Làm mới</button>
          </div>
        </div>

        {/* Chọn mã + khung thời gian */}
        <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',marginBottom:10,
                     background:bg2,border:`1px solid ${border2}`,borderRadius:8,padding:'8px 10px'}}>
          <select value={ma} onChange={e=>setMa(e.target.value)}
                  style={{fontSize:'.72rem',fontWeight:700,padding:'4px 8px',borderRadius:5,border:`1px solid ${border2}`}}>
            {MA_NHOM.map(m=><option key={m.ma} value={m.ma}>{m.ten} ({m.ma})</option>)}
          </select>
          <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
            {KHUNG_TG.map(k=>(
              <button key={k.k} onClick={()=>setKhungK(k.k)} style={nut(khungK===k.k)}>{k.l}</button>
            ))}
          </div>
          <div style={{flex:1}}/>
          <span style={{fontSize:'.64rem',color:'#94a3b8',fontWeight:600}}>
            {dangTai?'đang tải…':soNen?`${soNen.toLocaleString('vi-VN')} phiên · ${NHAN_NGUON[nguon]||nguon}`:''}
          </span>
        </div>

        {/* Giá hiện tại */}
        {gia&&(
          <div style={{display:'flex',gap:14,flexWrap:'wrap',alignItems:'baseline',marginBottom:10,
                       background:bg2,border:`1px solid ${border2}`,borderRadius:8,padding:'9px 12px'}}>
            <span style={{fontSize:'1.25rem',fontWeight:900,color:mauTD}} className="mono">
              {gia.gia?.toLocaleString('vi-VN')??'—'}
            </span>
            <span style={{fontSize:'.78rem',fontWeight:800,color:mauTD}} className="mono">
              {gia.thayDoi>0?'+':''}{gia.thayDoi?.toLocaleString('vi-VN')??'—'}
              {gia.phanTram!=null?`  ${gia.phanTram>0?'+':''}${gia.phanTram.toFixed(2)}%`:''}
            </span>
            <span style={{fontSize:'.7rem',color:'#64748b',fontWeight:700}}>CNY/tấn</span>
            <div style={{flex:1}}/>
            <span style={{fontSize:'.7rem',fontWeight:700,color:'#475569'}} className="mono">
              Mở {gia.mo?.toLocaleString('vi-VN')} · Cao {gia.cao?.toLocaleString('vi-VN')}
              {' '}· Thấp {gia.thap?.toLocaleString('vi-VN')} · KL {gia.kl?.toLocaleString('vi-VN')} lô
            </span>
          </div>
        )}

        {canhBao&&(
          <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderLeft:'3px solid #f59e0b',
                       borderRadius:6,padding:'8px 12px',marginBottom:10,fontSize:'.7rem',
                       color:'#92400e',fontWeight:600}}>⚠ {canhBao}</div>
        )}
        {loi&&(
          <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderLeft:'3px solid #dc2626',
                       borderRadius:6,padding:'8px 12px',marginBottom:10,fontSize:'.7rem',
                       color:'#991b1b',fontWeight:600}}>✕ {loi}</div>
        )}

        {/* Khung vẽ KLineChart */}
        <div style={{position:'relative',background:'#fff',border:`1px solid ${border2}`,borderRadius:8}}>
          <div ref={boxRef} style={{width:'100%',height:480}}/>
          {dangTai&&(
            <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',
                         justifyContent:'center',background:'rgba(255,255,255,.65)',
                         fontSize:'.75rem',fontWeight:700,color:'#64748b'}}>Đang tải dữ liệu…</div>
          )}
        </div>

        <div style={{fontSize:'.64rem',color:'#94a3b8',fontWeight:600,marginTop:6,lineHeight:1.6}}>
          Nguồn: EastMoney (cùng nguồn phần mềm 东方财富期货) · trục thời gian theo <b>giờ sàn Thượng Hải</b>
          (giờ VN = trừ 1 tiếng; phiên đêm 21:00–01:00 giờ sàn = 20:00–00:00 giờ ta) ·
          quy ước màu <b style={{color:'#16a34a'}}>xanh = tăng</b> / <b style={{color:'#dc2626'}}>đỏ = giảm</b> (ngược app Trung Quốc) ·
          1 lô {mInfo.lo} tấn. Công cụ vẽ Trendline &amp; Đường ngang sẽ bổ sung ở bước kế tiếp.
        </div>

        {/* Tham chiếu chéo với sheet MARKET_PRICES */}
        {hang&&(
          <div style={{marginTop:12,background:bg2,border:`1px solid ${border2}`,borderRadius:8,padding:'10px 12px'}}>
            <div style={{fontSize:'.66rem',fontWeight:900,color:'#64748b',marginBottom:5}}>
              ĐỐI CHIẾU NGÀY {hang.date} <span style={{fontWeight:600}}>(nguồn: sheet MARKET_PRICES)</span>
            </div>
            <div style={{display:'flex',gap:16,flexWrap:'wrap',fontSize:'.75rem',fontWeight:800}}>
              <span>SMM A00 giao ngay: <b className="mono">{hang.smm_cny??'—'} ¥/t</b></span>
              <span>SHFE: <b className="mono">{hang.shfe_cny??'—'} ¥/t</b></span>
              <span>LME: <b className="mono">{hang.lme_usd??'—'} $/t</b></span>
              {hang.smm_cny&&hang.shfe_cny&&(
                <span style={{color:'#0891b2'}}>Basis (SMM−SHFE):{' '}
                  <b className="mono">{(parseFloat(hang.smm_cny)-parseFloat(hang.shfe_cny)).toLocaleString('vi-VN')} ¥/t</b>
                </span>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
