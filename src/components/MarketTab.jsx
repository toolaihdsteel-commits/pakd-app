import React from 'react';
const {useState,useEffect,useRef,useMemo}=React;
import Chart from 'chart.js/auto';
import {fu,fv,parseVNDate} from '../lib/core';
import {Ic} from './ui';

// ═══ TAB 📈 THỊ TRƯỜNG — tách khỏi App.jsx (GĐ1, không đổi tính năng) ═══
// marketData/marketErr/loadMarket VẪN nằm ở App.jsx vì bảng Giám đốc (#ceo) dùng chung.
// Component này giữ state riêng của khung nhìn: bộ lọc, VAT, biểu đồ Chart.js.
export const MarketTab=({
  marketData,marketErr,loadMarket,
  allRawImportPrices,
  inputs,setInputs,setProducts,
  scenarios,setScenarios,saveScenario,
  setTab,
  bg1,bg2,border2,
})=>{
  // R3: premium động per quy cách + lọc thời gian + SMM trừ VAT + thống kê & dự phóng
  const [marketAlloy,setMarketAlloy]=useState('ALL');
  const [marketRange,setMarketRange]=useState({preset:'90',from:'',to:''}); // preset: 30|90|180|ALL|custom
  // TQ HỦY hoàn thuế XK nhôm từ 01/12/2024 (anh Huy xác nhận) → NCC chào theo SMM GỒM VAT.
  // Mặc định TẮT trừ VAT; chỉ bật khi soi lịch sử các đợt mua TRƯỚC 12/2024.
  const [smmExVat,setSmmExVat]=useState(false);
  const marketChartRef=useRef(null);const marketChartInst=useRef(null);
  const smmFactor=smmExVat?1/1.13:1;
  // Dòng giá tăng dần theo ngày, lọc theo khoảng thời gian đang chọn
  const marketRows=useMemo(()=>{
    const rows=[...marketData].slice().reverse();
    if(!rows.length) return [];
    let from='',to='';
    if(marketRange.preset==='custom'){from=marketRange.from;to=marketRange.to;}
    else if(marketRange.preset!=='ALL'){
      const d=new Date(Date.now()-parseInt(marketRange.preset)*86400000);
      from=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
    return rows.filter(r=>{const d=String(r.date).slice(0,10);return (!from||d>=from)&&(!to||d<=to);});
  },[marketData,marketRange]);
  // Thống kê & dự phóng trên chuỗi SMM USD (đã áp trừ VAT nếu bật)
  const marketStats=useMemo(()=>{
    const vs=marketRows.map(r=>{const f=parseFloat(r.smm_usd);return isNaN(f)?null:f*smmFactor;}).filter(v=>v!=null);
    if(vs.length<5) return null;
    const last=vs[vs.length-1];
    const at=n=>vs.length>n?vs[vs.length-1-n]:null;
    const pctf=(a,b)=>(a!=null&&b)?(a-b)/b*100:null;
    const min=Math.min(...vs),max=Math.max(...vs);
    const sma=n=>{const s=vs.slice(-Math.min(n,vs.length));return s.reduce((a,b)=>a+b,0)/s.length;};
    const w=vs.slice(-30);const n=w.length;
    const xm=(n-1)/2,ym=w.reduce((a,b)=>a+b,0)/n;
    let nu=0,de=0;w.forEach((y,i)=>{nu+=(i-xm)*(y-ym);de+=(i-xm)*(i-xm);});
    const slope=de?nu/de:0;const intercept=ym-slope*xm;
    const sd=Math.sqrt(w.map((y,i)=>y-(intercept+slope*i)).reduce((a,b)=>a+b*b,0)/n);
    return {last,d7:pctf(last,at(7)),d30:pctf(last,at(30)),min,max,
            pos:max>min?(last-min)/(max-min)*100:50,sma7:sma(7),sma30:sma(30),
            slopeW:slope*7,f7:intercept+slope*(n-1+7),sd,n};
  },[marketRows,smmFactor]);
  // Premium từng quy cách (dùng TOÀN BỘ lịch sử, không phụ thuộc bộ lọc thời gian)
  const marketPremiumStats=useMemo(()=>{
    if(!marketData.length||!allRawImportPrices.length) return [];
    const rows=[...marketData].slice().reverse();
    const smmByDate=rows.map(r=>{const f=parseFloat(r.smm_usd);return {d:String(r.date).slice(0,10),v:isNaN(f)?null:f*smmFactor};}).filter(x=>x.v);
    if(!smmByDate.length) return [];
    const smmAt=(iso)=>{let best=null;for(const x of smmByDate){if(x.d<=iso)best=x.v;else break;}return best!=null?best:smmByDate[0].v;};
    const smmNow=smmByDate[smmByDate.length-1].v;
    const groups={};
    allRawImportPrices.forEach(u=>{
      const cif=parseFloat(u.priceFC)||0;if(cif<=0)return;
      const ts=parseVNDate(u.updateDate);if(!ts)return; // parseVNDate trả TIMESTAMP (số), KHÔNG phải Date
      const dd=new Date(ts);
      const iso=`${dd.getFullYear()}-${String(dd.getMonth()+1).padStart(2,'0')}-${String(dd.getDate()).padStart(2,'0')}`;
      const key=`${u.alloy}|${u.temper}|${u.minThick}-${u.maxThick}`;
      if(!groups[key])groups[key]={alloy:u.alloy,temper:u.temper,range:`${u.minThick}–${u.maxThick}mm`,entries:[]};
      groups[key].entries.push({iso,cif});
    });
    return Object.values(groups).map(g=>{
      g.entries.sort((a,b)=>a.iso.localeCompare(b.iso));
      const prems=g.entries.map(e=>{const s=smmAt(e.iso);return s?{iso:e.iso,p:e.cif-s}:null;}).filter(Boolean);
      const lastE=g.entries[g.entries.length-1];
      const premAvg=prems.length?prems.reduce((a,b)=>a+b.p,0)/prems.length:null;
      const premLast=prems.length?prems[prems.length-1].p:null;
      return {...g,n:g.entries.length,lastDate:lastE.iso,lastCIF:lastE.cif,premAvg,premLast,
              refCIF:(smmNow!=null&&premAvg!=null)?smmNow+premAvg:null,smmNow};
    }).sort((a,b)=>a.alloy.localeCompare(b.alloy)||a.temper.localeCompare(b.temper)||a.range.localeCompare(b.range));
  },[marketData,allRawImportPrices,smmFactor]);
  // Vẽ biểu đồ: SMM/LME/SHFE quy USD + SMA30 + điểm CIF của mác đang lọc (trong khoảng thời gian chọn)
  useEffect(()=>{
    if(!marketChartRef.current) return;
    if(typeof Chart==='undefined'||!marketRows.length) return;
    try{
      const num=v=>{const f=parseFloat(v);return isNaN(f)?null:f;};
      const labels=marketRows.map(r=>String(r.date).slice(0,10));
      const smmArr=marketRows.map(r=>{const f=num(r.smm_usd);return f!=null?Math.round(f*smmFactor*10)/10:null;});
      const shfeUsd=marketRows.map(r=>{const s=num(r.shfe_cny),u=num(r.usd_vnd),c=num(r.cny_vnd),su=num(r.smm_usd),sc=num(r.smm_cny);const k=(u&&c)?c/u:((su&&sc)?su/sc:null);return (s&&k)?Math.round(s*k*smmFactor*10)/10:null;});
      const sma30=smmArr.map((_,i)=>{const w=smmArr.slice(Math.max(0,i-29),i+1).filter(v=>v!=null);return w.length>=5?Math.round(w.reduce((a,b)=>a+b,0)/w.length*10)/10:null;});
      const cifPoints=[];
      allRawImportPrices.forEach(u=>{
        if(marketAlloy!=='ALL'&&u.alloy!==marketAlloy) return;
        const cif=num(u.priceFC);if(!cif)return;
        const ts=parseVNDate(u.updateDate);if(!ts)return; // parseVNDate trả TIMESTAMP (số)
        const dd=new Date(ts);
        const iso=`${dd.getFullYear()}-${String(dd.getMonth()+1).padStart(2,'0')}-${String(dd.getDate()).padStart(2,'0')}`;
        let lbl=labels.includes(iso)?iso:null;
        if(!lbl){for(let i=labels.length-1;i>=0;i--){if(labels[i]<=iso){lbl=labels[i];break;}}}
        if(!lbl) return; // ngoài khoảng thời gian đang xem
        cifPoints.push({x:lbl,y:cif,spec:`${u.alloy} ${u.temper} ${u.minThick}-${u.maxThick}mm · ${u.updateDate}`});
      });
      if(marketChartInst.current) marketChartInst.current.destroy();
      marketChartInst.current=new Chart(marketChartRef.current.getContext('2d'),{type:'line',
        data:{labels,datasets:[
          {label:`SMM A00${smmExVat?' (trừ VAT)':''} $/t`,data:smmArr,borderColor:'#dc2626',backgroundColor:'#dc2626',borderWidth:2,pointRadius:0,spanGaps:true,tension:.25},
          {label:'SMA30 của SMM',data:sma30,borderColor:'#9ca3af',backgroundColor:'#9ca3af',borderWidth:1.5,borderDash:[3,3],pointRadius:0,spanGaps:true,tension:.25},
          {label:'LME cash $/t',data:marketRows.map(r=>num(r.lme_usd)),borderColor:'#2563eb',backgroundColor:'#2563eb',borderWidth:2,pointRadius:0,spanGaps:true,tension:.25},
          {label:`SHFE quy đổi${smmExVat?' (trừ VAT)':''} $/t`,data:shfeUsd,borderColor:'#d97706',backgroundColor:'#d97706',borderWidth:1.5,borderDash:[6,4],pointRadius:0,spanGaps:true,tension:.25},
          {label:`CIF mua thực tế${marketAlloy!=='ALL'?` (${marketAlloy})`:''}`,data:cifPoints,showLine:false,pointRadius:5,pointHoverRadius:7,pointStyle:'rectRot',borderColor:'#16a34a',backgroundColor:'#16a34a'},
        ]},
        options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'nearest',intersect:false},
          plugins:{legend:{position:'bottom',labels:{font:{size:10,weight:'bold'},usePointStyle:true,padding:10}},
            tooltip:{callbacks:{label:c=>c.raw&&c.raw.spec?`CIF ${fv(c.raw.y)} $/t — ${c.raw.spec}`:`${c.dataset.label}: ${fv(c.parsed.y)} $/t`}}},
          scales:{x:{ticks:{font:{size:9},maxTicksLimit:14}},y:{ticks:{font:{size:9},callback:v=>fv(v)},title:{display:true,text:'USD/tấn',font:{size:10}}}}}});
    }catch(err){console.error('Lỗi vẽ biểu đồ thị trường:',err);}
  },[marketRows,allRawImportPrices,marketAlloy,smmFactor,smmExVat]);
  return (
    <div style={{flex:1,padding:'18px',overflowY:'auto',background:bg1}}>
      <div style={{maxWidth:'1300px',margin:'0 auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12,flexWrap:'wrap',gap:8}}>
          <div>
            <h2 style={{fontWeight:900,fontSize:'1.05rem',color:'#0f172a'}}>📈 Thị trường & Lịch sử CIF</h2>
            <p style={{fontSize:'.72rem',color:'#475569',fontWeight:600,marginTop:2}}>SMM A00 · LME · SHFE quy về USD/tấn + các đợt CIF phòng mua — khoảng hở SMM↔CIF = premium NCC đang tính</p>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            {marketData[0]&&<span className="tag tg" style={{fontSize:'.66rem'}}>✓ Giá ngày {marketData[0].date}</span>}
            <button className="btn btn-ghost btn-sm" onClick={loadMarket}><Ic.Refresh/> Tải lại giá</button>
          </div>
        </div>

        {marketData.length===0?(
          <div className="card" style={{textAlign:'center',padding:44}}>
            <div style={{fontSize:'2rem',marginBottom:8}}>📈</div>
            <div style={{color:'#64748b',fontWeight:700}}>{marketErr?`⚠ Lỗi đọc giá: ${marketErr}`:'Chưa có dữ liệu giá thị trường'}</div>
            <div style={{color:'#94a3b8',fontSize:'.75rem',marginTop:4}}>Trong Apps Script chạy <strong>fetchMarketPrices</strong> (giá hôm nay) và <strong>backfillMarketHistory</strong> (lịch sử + tỷ giá lịch sử) rồi bấm Tải lại.</div>
          </div>
        ):(
          <>
            {(()=>{
              const mk=marketData[0],mkPrev=marketData[1]||null;
              const num=v=>{const f=parseFloat(v);return isNaN(f)?null:f;};
              const arrow=(c,p)=>(c==null||p==null)?'':c>p?' ▲':c<p?' ▼':' =';
              return (
                <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:12}}>
                  {[
                    {l:'SMM A00',v:num(mk.smm_cny),u:'¥/t',p:mkPrev&&num(mkPrev.smm_cny)},
                    {l:smmExVat?'SMM $/t (trừ VAT)':'SMM $/t (gồm VAT)',v:num(mk.smm_usd)!=null?num(mk.smm_usd)*smmFactor:null,u:'$/t',p:mkPrev&&num(mkPrev.smm_usd)!=null?num(mkPrev.smm_usd)*smmFactor:null},
                    {l:'LME cash',v:num(mk.lme_usd),u:'$/t',p:mkPrev&&num(mkPrev.lme_usd)},
                    {l:'SHFE',v:num(mk.shfe_cny),u:'¥/t',p:mkPrev&&num(mkPrev.shfe_cny)},
                    {l:'USD/VND',v:num(mk.usd_vnd),u:'',p:mkPrev&&num(mkPrev.usd_vnd)},
                    {l:'CNY/VND',v:num(mk.cny_vnd),u:'',p:mkPrev&&num(mkPrev.cny_vnd)},
                  ].map((b,i)=>(
                    <div key={i} className="card" style={{padding:'7px 12px',minWidth:118}}>
                      <div style={{fontSize:'.62rem',fontWeight:800,color:'#64748b'}}>{b.l}</div>
                      <div className="mono" style={{fontSize:'.9rem',fontWeight:900,color:b.p!=null&&b.v!=null?(b.v>b.p?'#dc2626':b.v<b.p?'#16a34a':'#0f172a'):'#0f172a'}}>{b.v!=null?fv(b.v):'—'}{b.u?` ${b.u}`:''}<span style={{fontSize:'.64rem'}}>{arrow(b.v,b.p)}</span></div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Bộ lọc thời gian + VAT + mác */}
            <div className="card" style={{padding:'8px 12px',marginBottom:10,display:'flex',gap:12,flexWrap:'wrap',alignItems:'center'}}>
              <div style={{display:'flex',gap:4,alignItems:'center'}}>
                <span style={{fontSize:'.66rem',fontWeight:800,color:'#475569'}}>Khoảng thời gian:</span>
                {[['30','30 ngày'],['90','90 ngày'],['180','180 ngày'],['ALL','Tất cả']].map(([k,l])=>(
                  <button key={k} className={`btn btn-sm ${marketRange.preset===k?'btn-purple':'btn-ghost'}`} style={{padding:'2px 8px',fontSize:'.66rem'}} onClick={()=>setMarketRange(p=>({...p,preset:k}))}>{l}</button>
                ))}
                <span style={{fontSize:'.64rem',fontWeight:700,color:'#64748b',marginLeft:4}}>hoặc từ</span>
                <input type="date" className="inp inp-xs" style={{width:124}} value={marketRange.from} onChange={e=>setMarketRange(p=>({...p,preset:'custom',from:e.target.value}))}/>
                <span style={{fontSize:'.64rem',fontWeight:700,color:'#64748b'}}>đến</span>
                <input type="date" className="inp inp-xs" style={{width:124}} value={marketRange.to} onChange={e=>setMarketRange(p=>({...p,preset:'custom',to:e.target.value}))}/>
              </div>
              <label style={{display:'flex',gap:5,alignItems:'center',fontSize:'.66rem',fontWeight:800,color:'#475569',cursor:'pointer'}} title="TQ đã HỦY hoàn thuế XK nhôm từ 01/12/2024 → NCC chào theo SMM GỒM VAT (mặc định tắt). Chỉ bật khi soi lịch sử các đợt mua trước 12/2024.">
                <input type="checkbox" checked={smmExVat} onChange={e=>setSmmExVat(e.target.checked)}/> SMM trừ VAT 13% <span style={{fontWeight:600,color:'#94a3b8'}}>(chỉ cho lịch sử trước 12/2024)</span>
              </label>
              <div style={{display:'flex',gap:4,alignItems:'center'}}>
                <span style={{fontSize:'.66rem',fontWeight:800,color:'#475569'}}>Mác:</span>
                {['ALL',...new Set(allRawImportPrices.map(u=>u.alloy).filter(Boolean))].map(a=>(
                  <button key={a} className={`btn btn-sm ${marketAlloy===a?'btn-purple':'btn-ghost'}`} style={{padding:'2px 9px',fontSize:'.66rem'}} onClick={()=>setMarketAlloy(a)}>{a==='ALL'?'Tất cả':a}</button>
                ))}
              </div>
            </div>

            {/* Thống kê & dự phóng — lấp khoảng trống, hỗ trợ nhận định */}
            {marketStats&&(
              <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:10}}>
                {[
                  {l:'SMM hiện tại',v:`${fv(marketStats.last)} $/t`,c:'#0f172a'},
                  {l:'Δ 7 ngày',v:marketStats.d7!=null?`${marketStats.d7>=0?'+':''}${marketStats.d7.toFixed(1)}%`:'—',c:marketStats.d7>0?'#dc2626':marketStats.d7<0?'#16a34a':'#475569'},
                  {l:'Δ 30 ngày',v:marketStats.d30!=null?`${marketStats.d30>=0?'+':''}${marketStats.d30.toFixed(1)}%`:'—',c:marketStats.d30>0?'#dc2626':marketStats.d30<0?'#16a34a':'#475569'},
                  {l:'Dải giá kỳ đang xem',v:`${fv(marketStats.min)}–${fv(marketStats.max)}`,c:'#475569',sub:`giá nay ở mức ${Math.round(marketStats.pos)}% dải`},
                  {l:'Xu hướng SMA7/SMA30',v:marketStats.sma7>marketStats.sma30?'▲ Ngắn hạn TĂNG':marketStats.sma7<marketStats.sma30?'▼ Ngắn hạn GIẢM':'= Đi ngang',c:marketStats.sma7>marketStats.sma30?'#dc2626':'#16a34a',sub:`SMA7 ${fv(marketStats.sma7)} · SMA30 ${fv(marketStats.sma30)}`},
                  {l:'Dự phóng 7 ngày (hồi quy 30đ)',v:`≈ ${fv(marketStats.f7)} $/t`,c:'#7c3aed',sub:`±${fv(marketStats.sd)} · độ dốc ${marketStats.slopeW>=0?'+':''}${fv(marketStats.slopeW)} $/tuần`},
                ].map((b,i)=>(
                  <div key={i} className="card" style={{padding:'7px 12px',minWidth:150,flex:'1 1 150px'}}>
                    <div style={{fontSize:'.6rem',fontWeight:800,color:'#64748b'}}>{b.l}</div>
                    <div className="mono" style={{fontSize:'.84rem',fontWeight:900,color:b.c}}>{b.v}</div>
                    {b.sub&&<div style={{fontSize:'.58rem',fontWeight:700,color:'#94a3b8'}}>{b.sub}</div>}
                  </div>
                ))}
              </div>
            )}

            <div className="card" style={{padding:'12px 14px',marginBottom:12}}>
              <div style={{height:340,position:'relative'}}><canvas ref={marketChartRef}></canvas></div>
              <div style={{fontSize:'.64rem',color:'#94a3b8',fontWeight:600,marginTop:6}}>◆ xanh lá = CIF mua thực tế từng đợt · đỏ = SMM A00 {smmExVat?'đã trừ VAT 13%':'gồm VAT'} quy USD theo tỷ giá TỪNG NGÀY · xám đứt = trung bình động 30 ngày. ⚠ Dự phóng hồi quy chỉ là tham khảo xu hướng — giá kim loại ngắn hạn gần như ngẫu nhiên, không phải khuyến nghị chốt mua.</div>
            </div>

            <div className="card" style={{padding:'12px 14px'}}>
              <div style={{fontWeight:900,fontSize:'.82rem',color:'#0f172a',marginBottom:6}}>Premium động theo quy cách <span style={{fontSize:'.64rem',fontWeight:700,color:'#64748b'}}>(premium = CIF đợt nhập − SMM{smmExVat?' trừ VAT':''} cùng thời điểm)</span></div>
              <table className="tbl" style={{fontSize:'.74rem'}}>
                <thead><tr>
                  <th style={{textAlign:'left',paddingLeft:10}}>Quy cách</th>
                  <th style={{textAlign:'center',width:54}}>Số đợt</th>
                  <th style={{textAlign:'right',paddingRight:12}}>CIF gần nhất ($/t)</th>
                  <th style={{textAlign:'right',paddingRight:12}}>Premium gần nhất</th>
                  <th style={{textAlign:'right',paddingRight:12}}>Premium TB</th>
                  <th style={{textAlign:'right',paddingRight:12,background:'#ecfeff'}}>CIF tham chiếu nay</th>
                  <th style={{textAlign:'center',width:110}}>Xu hướng premium</th>
                </tr></thead>
                <tbody>
                  {marketPremiumStats.filter(g=>marketAlloy==='ALL'||g.alloy===marketAlloy).map((g,i)=>{
                    const trendPct=(g.premAvg&&g.premLast!=null&&g.premAvg!==0)?(g.premLast-g.premAvg)/Math.abs(g.premAvg)*100:null;
                    return (
                      <tr key={i} style={{background:i%2?'#f8fafc':'transparent'}}>
                        <td style={{textAlign:'left',paddingLeft:10,whiteSpace:'nowrap'}}><span style={{fontWeight:900}}>{g.alloy} {g.temper}</span> <span style={{color:'#64748b',fontWeight:700,fontSize:'.68rem'}}>{g.range}</span></td>
                        <td style={{textAlign:'center'}} className="mono">{g.n}</td>
                        <td style={{textAlign:'right',paddingRight:12}} className="mono"><span style={{fontWeight:900}}>{fv(g.lastCIF)}</span><div style={{fontSize:'.58rem',color:'#94a3b8',fontWeight:600}}>{g.lastDate}</div></td>
                        <td style={{textAlign:'right',paddingRight:12,fontWeight:800}} className="mono">{g.premLast!=null?fv(g.premLast):'—'}</td>
                        <td style={{textAlign:'right',paddingRight:12}} className="mono">{g.premAvg!=null?fv(g.premAvg):'—'}</td>
                        <td style={{textAlign:'right',paddingRight:12,fontWeight:900,color:'#0e7490',background:'#f0fdff'}} className="mono">{g.refCIF!=null?fv(g.refCIF):'—'}</td>
                        <td style={{textAlign:'center'}}>{trendPct==null?<span style={{color:'#cbd5e1'}}>—</span>:<span className="mono" style={{fontWeight:900,fontSize:'.7rem',borderRadius:4,padding:'2px 8px',background:trendPct>5?'#fee2e2':trendPct<-5?'#dcfce7':'#f1f5f9',color:trendPct>5?'#b91c1c':trendPct<-5?'#15803d':'#475569'}}>{trendPct>0?'▲ +':trendPct<0?'▼ ':'='}{trendPct.toFixed(1)}%</span>}</td>
                      </tr>
                    );
                  })}
                  {marketPremiumStats.filter(g=>marketAlloy==='ALL'||g.alloy===marketAlloy).length===0&&(
                    <tr><td colSpan={7} style={{padding:14,color:'#94a3b8',fontWeight:600}}>Chưa có dữ liệu CIF khớp bộ lọc — hoặc chưa backfill lịch sử SMM (chạy backfillMarketHistory).</td></tr>
                  )}
                </tbody>
              </table>
              <div style={{fontSize:'.64rem',color:'#94a3b8',fontWeight:600,marginTop:6}}>ℹ️ PriceFC = giá về tới cảng VN (chưa gồm CP về kho {inputs.managementFee||1.5}% — chỉnh ở tab PAKD Mua). Xu hướng ▲ đỏ = premium đợt mới cao hơn TB các đợt trước &gt;5% (NCC đang chém) · ▼ xanh = premium đang hạ.</div>
            </div>
          </>
        )}
      </div>
    </div>
  )}

  {/* ════ TAB SCENARIOS — ĐÃ BỎ (thay bằng nút 💾 Lưu Local / 📁 Nháp Local) ════ */}
  {false&&(
    <div style={{flex:1,padding:'18px',overflowY:'auto',background:bg1}}>
      <div style={{maxWidth:'1060px',margin:'0 auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:15}}>
          <div>
            <h2 style={{fontWeight:900,fontSize:'1.05rem',color:'#0f172a'}}>💾 Scenarios lưu trữ</h2>
            <p style={{fontSize:'.72rem',color:'#475569',fontWeight:600,marginTop:3}}>
              {scenarios.length} scenario{scenarios.length!==1?'s':''} · <span style={{color:'#15803d',fontWeight:700}}>✓ Lưu local — giữ nguyên khi tắt máy</span>
            </p>
          </div>
          <div style={{display:'flex',gap:6,alignItems:'center'}}>
            {scenarios.length>0&&(
              <button className="btn btn-xs" style={{background:'#fee2e2',border:'1px solid #fca5a5',color:'#b91c1c',fontWeight:800}}
                onClick={()=>{if(window.confirm(`Xóa toàn bộ ${scenarios.length} scenario?\nKhông thể khôi phục.`)){setScenarios([]);try{localStorage.removeItem('pakd_scenarios');}catch(e){}}}}>
                🗑️ Xóa tất cả
              </button>
            )}
            <button className="btn btn-success btn-sm" onClick={saveScenario}><Ic.Save/> Lưu scenario</button>
          </div>
        </div>
        {/* Info bar */}
        <div style={{background:'#f0fdf4',border:'1px solid #86efac',borderRadius:6,padding:'8px 13px',marginBottom:13,fontSize:'.72rem',color:'#14532d',fontWeight:600,display:'flex',alignItems:'center',gap:8}}>
          💡 Scenarios được lưu vào <strong>localStorage trình duyệt</strong> — tồn tại khi tắt máy, mở lại vẫn còn. Nhấn <strong>Tải</strong> để khôi phục lô hàng & thông số vào tab PAKD Mua.
        </div>
        {scenarios.length===0?(
          <div className="card" style={{textAlign:'center',padding:44,border:`1px dashed ${border2}`}}>
            <div style={{fontSize:'2rem',marginBottom:11}}>💾</div>
            <div style={{color:'#64748b',fontWeight:700,fontSize:'.9rem'}}>Chưa có scenario nào được lưu</div>
            <div style={{color:'#94a3b8',fontWeight:600,fontSize:'.78rem',marginTop:6}}>Nhấn <strong>Lưu</strong> hoặc <strong>Lưu scenario</strong> để lưu phương án hiện tại</div>
          </div>
        ):(
          <table className="tbl" style={{background:bg2,borderRadius:8,overflow:'hidden',boxShadow:'0 1px 3px rgba(0,0,0,0.1)'}}>
            <thead><tr>
              <th>#</th>
              <th style={{textAlign:'left',paddingLeft:9}}>Tên · Ngày · Giờ</th>
              <th>KL kg</th>
              <th>Invoice USD</th>
              <th>BQ Trước</th>
              <th>BQ Sau nhập</th>
              <th>Lãi/kg BQ</th>
              <th>Tổng Lãi VND</th>
              <th>Rủi ro</th>
              <th></th>
            </tr></thead>
            <tbody>
              {scenarios.map((s,i)=>(
                <tr key={s.id}>
                  <td style={{textAlign:'center',color:'#64748b',fontSize:'.75rem',fontWeight:700}} className="mono">{i+1}</td>
                  <td style={{paddingLeft:9}}>
                    <div style={{fontWeight:800,fontSize:'.82rem',color:'#0f172a'}}>{s.name}</div>
                    <div style={{fontSize:'.67rem',color:'#64748b',marginTop:1,fontWeight:600}}>{s.date}{s.time?` · ${s.time}`:''}</div>
                  </td>
                  <td className="mono" style={{textAlign:'right',paddingRight:9,color:'#15803d',fontWeight:700}}>{fv(s.totalKg)}</td>
                  <td className="mono" style={{textAlign:'right',paddingRight:9,color:'#b45309',fontWeight:700}}>{fu(s.invoiceUSD)}</td>
                  <td className="mono" style={{textAlign:'right',paddingRight:9,color:'#475569',fontWeight:700}}>{fv(s.globalAvgBefore)}</td>
                  <td className="mono" style={{textAlign:'right',paddingRight:9,color:'#1d4ed8',fontWeight:800}}>{fv(s.globalAvgAfter)}</td>
                  <td className="mono" style={{textAlign:'right',paddingRight:9,fontWeight:800,color:s.avgProfitPerKg!=null?(s.avgProfitPerKg>=0?'#15803d':'#dc2626'):'#94a3b8'}}>
                    {s.avgProfitPerKg!=null?(s.avgProfitPerKg>=0?'+':'')+fv(s.avgProfitPerKg):'—'}
                  </td>
                  <td className="mono" style={{textAlign:'right',paddingRight:9,fontWeight:800,color:s.totalGrossProfit>=0?'#15803d':'#dc2626'}}>
                    {s.totalGrossProfit!=null?(s.totalGrossProfit>=0?'+':'')+fv(s.totalGrossProfit):'—'}
                  </td>
                  <td style={{textAlign:'center'}}><span className={`tag ${s.hasRisk?'tr':'tg'}`}>{s.hasRisk?'⚠ Rủi ro':'✓ An toàn'}</span></td>
                  <td style={{textAlign:'center'}}>
                    <div style={{display:'flex',gap:4,justifyContent:'center'}}>
                      <button className="btn btn-solid btn-xs" title="Tải lại lô hàng & thông số vào tab PAKD Mua" onClick={()=>{setProducts(s.products);setInputs(s.inputs);setTab('main');}}>📂 Tải</button>
                      <button className="btn-danger" title="Xóa scenario này" onClick={()=>{
                        setScenarios(prev=>{
                          const updated=prev.filter(x=>x.id!==s.id);
                          try{localStorage.setItem('pakd_scenarios',JSON.stringify(updated));}catch(e){}
                          return updated;
                        });
                      }}><Ic.X/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
