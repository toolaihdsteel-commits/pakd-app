import React from 'react';

// ═══ R15 (11/11/2026): NHÃN "PHƯƠNG ÁN ĐANG DÙNG" ở tab PAKD Mua ═══
// Vì sao: người dùng so sánh nhiều PA đã lưu local bằng cách mở nhiều tab trình duyệt (mỗi tab
// tải 1 bản nháp). Trước đây sau khi bấm "⬇ Tải" màn hình KHÔNG còn dấu vết đang dùng bản nào,
// lưu lúc nào → chuyển qua lại giữa các tab rất dễ nhầm.
// Giải pháp: nhớ PA đang dùng trong sessionStorage (RIÊNG TỪNG TAB trình duyệt), hiện dải nhãn
// có ngày giờ lưu + tuổi + cờ "đã chỉnh sau khi tải", và gắn ngày vào tiêu đề tab trình duyệt.

export const KHOA_PA_DANG_DUNG='pakd_pa_dang_dung';

export const docPADangDung=()=>{try{return JSON.parse(sessionStorage.getItem(KHOA_PA_DANG_DUNG)||'null');}catch(e){return null;}};
export const ghiPADangDung=(v)=>{try{if(v) sessionStorage.setItem(KHOA_PA_DANG_DUNG,JSON.stringify(v)); else sessionStorage.removeItem(KHOA_PA_DANG_DUNG);}catch(e){}};

// Dấu vân tay nội dung PA (inputs + products) — đủ để biết đã chỉnh sau khi tải hay chưa
export const dauPA=(inputs,products)=>{
  let s='';
  try{s=JSON.stringify([inputs,products]);}catch(e){return '';}
  let h=0;
  for(let i=0;i<s.length;i++){h=((h<<5)-h+s.charCodeAt(i))|0;}
  return s.length+':'+h;
};

const pad=n=>String(n).padStart(2,'0');
export const ngayGioPA=(iso)=>{
  if(!iso) return '?';
  const d=new Date(iso);
  if(isNaN(d)) return String(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const ngayNganPA=(iso)=>{
  if(!iso) return '';
  const d=new Date(iso);
  if(isNaN(d)) return '';
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const tuoiPA=(iso,now=Date.now())=>{
  if(!iso) return '';
  const t=new Date(iso).getTime();
  if(isNaN(t)) return '';
  const phut=Math.max(0,Math.round((now-t)/60000));
  if(phut<1) return 'vừa lưu';
  if(phut<60) return `${phut} phút trước`;
  const gio=Math.floor(phut/60);
  if(gio<24) return `${gio} giờ trước`;
  const ngay=Math.floor(gio/24);
  return `${ngay} ngày trước`;
};

const NHAN_NGUON={local:{ic:'💻',t:'Nháp Local',bg:'#eff6ff',br:'#93c5fd',c:'#1e3a8a'},github:{ic:'☁️',t:'PA GitHub',bg:'#f5f3ff',br:'#c4b5fd',c:'#4c1d95'}};

export const PADangDungBar=({pa,dirty,now,onBo,onMoNhap})=>{
  if(!pa){
    return(
      <div className="pa-dang-dung" style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',padding:'5px 11px',background:'#f8fafc',borderBottom:'1px solid #e2e8f0',fontSize:'.7rem',fontWeight:700,color:'#64748b'}}>
        <span>🆕 Phương án MỚI — chưa lưu / chưa tải bản nháp nào</span>
        <button onClick={onMoNhap} className="btn btn-ghost btn-xs" style={{fontSize:'.62rem'}}>📁 Mở nháp đã lưu</button>
      </div>
    );
  }
  const n=NHAN_NGUON[pa.nguon]||NHAN_NGUON.local;
  return(
    <div className="pa-dang-dung" title="Phương án đang hiển thị trên tab trình duyệt NÀY. Mỗi tab trình duyệt nhớ phương án riêng." style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',padding:'6px 11px',background:n.bg,borderBottom:`2px solid ${n.br}`,borderTop:`1px solid ${n.br}`}}>
      <span style={{fontSize:'.62rem',fontWeight:900,color:n.c,textTransform:'uppercase',letterSpacing:'.05em'}}>📌 Đang dùng</span>
      <span style={{fontSize:'.6rem',fontWeight:800,background:'#fff',border:`1px solid ${n.br}`,color:n.c,borderRadius:10,padding:'1px 7px'}}>{n.ic} {n.t}</span>
      <span style={{fontSize:'.8rem',fontWeight:900,color:'#0f172a',maxWidth:340,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={pa.label}>{pa.label}</span>
      <span className="mono" style={{fontSize:'.76rem',fontWeight:900,color:'#fff',background:n.c,borderRadius:5,padding:'2px 8px'}} title="Ngày giờ lưu phương án">🗓 Lưu {ngayGioPA(pa.savedAt)}</span>
      <span style={{fontSize:'.66rem',fontWeight:700,color:'#475569'}}>({tuoiPA(pa.savedAt,now)}){pa.savedBy?` · ${pa.savedBy}`:''}</span>
      {dirty
        ?<span style={{fontSize:'.64rem',fontWeight:900,color:'#9a3412',background:'#ffedd5',border:'1px solid #fdba74',borderRadius:10,padding:'1px 8px'}} title="Số liệu trên màn hình đã khác bản đã lưu — bấm 💾 Lưu Local để lưu thành bản mới">✎ Đã chỉnh sau khi tải — chưa lưu</span>
        :<span style={{fontSize:'.64rem',fontWeight:800,color:'#14532d',background:'#dcfce7',border:'1px solid #86efac',borderRadius:10,padding:'1px 8px'}}>✓ Khớp bản đã lưu</span>}
      <span style={{flex:1}}/>
      <button onClick={onMoNhap} className="btn btn-ghost btn-xs" style={{fontSize:'.62rem'}} title="Mở danh sách nháp để đổi phương án">📁 Đổi PA</button>
      <button onClick={onBo} className="btn-danger" style={{fontSize:'.62rem',fontWeight:800}} title="Bỏ gắn nhãn (coi như phương án mới) — KHÔNG xoá bản nháp">✕ Bỏ nhãn</button>
    </div>
  );
};
