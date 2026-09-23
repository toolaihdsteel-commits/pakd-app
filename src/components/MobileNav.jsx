// ─── GIAO DIỆN ĐIỆN THOẠI (≤768px) ───────────────────────────────
// Chỉ render khi useIsMobile() = true (xem src/lib/mobile.js) nên desktop không đổi gì.
// Gồm: header gọn 1 dòng + dải tag kết quả, thanh điều hướng đáy, bottom-sheet "Thêm".
// Toàn bộ CSS nằm trong styles.css → @media (max-width:768px) → .is-mobile ...
import React from 'react';
import {Ic} from './ui';
const {useEffect}=React;

// 4 tab chính nằm thẳng trên thanh đáy
const TAB_CHINH=[
  {k:'main',i:'📊',l:'Mua'},
  {k:'inventory',i:'📦',l:'Kho'},
  {k:'floor',i:'💹',l:'Sàn'},
  {k:'market',i:'📈',l:'Thị trường'},
];
// Tab phụ — nằm trong bottom-sheet "Thêm"; `ngan` = nhãn ngắn khi hiện ở ô "Thêm"
const TAB_PHU=[
  {k:'minstock',i:'📏',l:'Min/Max',ngan:'Min/Max'},
  {k:'cashflow',i:'💰',l:'Dòng Tiền',ngan:'Dòng tiền'},
  {k:'po',i:'📑',l:'PO đã ký',ngan:'PO'},
  {k:'floorhistory',i:'🗓️',l:'Lịch sử Sàn',ngan:'LS Sàn'},
  {k:'techchart',i:'📊',l:'Biểu đồ Kỹ thuật',ngan:'Kỹ thuật'},
];

// Giờ đồng bộ dạng HH:mm (lastSyncAt là mốc ms; lastSync là chuỗi toLocaleTimeString cũ)
const gioSync=(db)=>{
  if(db.lastSyncAt){try{return new Date(db.lastSyncAt).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'});}catch(e){}}
  return String(db.lastSync||'').slice(0,5);
};

// Header 1 dòng: logo · tên · badge sync · ⟳ Sync All · ⋯ menu — kèm dải tag kết quả (chỉ tab PAKD Mua)
const MobileHeader=({dbStatus,ghVerified,onSync,onMore,result,tab})=>{
  const badge=dbStatus.loading?{cls:'m-badge m-badge-load',txt:'Đang tải…'}
    :dbStatus.error?{cls:'m-badge m-badge-err',txt:'⚠ Lỗi',title:dbStatus.error}
    :dbStatus.lastSync?{cls:'m-badge m-badge-ok',txt:`✓ ${gioSync(dbStatus)}`,title:dbStatus.warn||`Đồng bộ GSheet lúc ${dbStatus.lastSync}`}
    :{cls:'m-badge',txt:'Local'};
  return(
    <>
      <header className="screen-container mobile-header">
        <div className="m-logo">P</div>
        <div className="m-title">PAKD <span>7.0</span></div>
        <span className={badge.cls} title={badge.title}>{dbStatus.loading&&<span className="spinner" style={{width:11,height:11,borderWidth:2}}/>}{badge.txt}</span>
        <button className="m-icon-btn" onClick={onSync} disabled={dbStatus.loading||!ghVerified} aria-label="Đồng bộ tất cả (Sync All)" title="Sync All"><span className={dbStatus.loading?'m-spin':''}>⟳</span> Sync</button>
        <button className="m-icon-btn m-more-btn" onClick={onMore} aria-label="Mở menu Thêm" aria-haspopup="dialog" title="Thêm">⋯</button>
      </header>
      {result&&tab==='main'&&(
        <div className="mobile-strip no-print">
          <span className={`tag ${result.rec.cls}`}>{result.rec.txt}</span>
          <span className={`tag ${result.containerOk?'tg':result.totalContainer<24?'tr':'ty'}`}>📦 {result.totalContainer.toFixed(1)}T</span>
          {result.hasLowStock&&<span className="tag tr pulse"><Ic.Alert/> Thiếu hàng</span>}
        </div>
      )}
    </>
  );
};

// Thanh điều hướng đáy: 4 tab chính + ô "Thêm" (hiện tab phụ đang mở nếu có)
const MobileBottomNav=({tab,onGo,onMore})=>{
  const phu=TAB_PHU.find(t=>t.k===tab);
  return(
    <nav className="mobile-nav no-print" aria-label="Điều hướng chính">
      {TAB_CHINH.map(t=>(
        <button key={t.k} className={`m-nav-item${tab===t.k?' on':''}`} aria-current={tab===t.k?'page':undefined} onClick={()=>onGo(t.k)}>
          <span className="m-nav-ico">{t.i}</span><span className="m-nav-lbl">{t.l}</span>
        </button>
      ))}
      <button className={`m-nav-item${phu?' on':''}`} aria-current={phu?'page':undefined} aria-haspopup="dialog" onClick={onMore}>
        <span className="m-nav-ico">{phu?phu.i:'☰'}</span><span className="m-nav-lbl">{phu?phu.ngan:'Thêm'}</span>
      </button>
    </nav>
  );
};

// Bottom-sheet "Thêm": trang phụ + thao tác (Lưu, In A4, GitHub, Bảng GĐ). Chạm nền / chọn xong / Esc → đóng
const MobileMoreSheet=({open,onClose,tab,onGo,poCount,onSave,canSave,onPrint,canPrint,onGithub,ghVerified,ghLogin,onCeo})=>{
  useEffect(()=>{
    if(!open) return undefined;
    const phim=e=>{if(e.key==='Escape') onClose();};
    window.addEventListener('keydown',phim);
    return()=>window.removeEventListener('keydown',phim);
  },[open,onClose]);
  if(!open) return null;
  const chon=fn=>()=>{onClose();fn();};
  return(
    <div className="m-sheet-overlay no-print" onClick={onClose}>
      <div className="m-sheet" role="dialog" aria-modal="true" aria-label="Thêm" onClick={e=>e.stopPropagation()}>
        <div className="m-sheet-grip" aria-hidden="true"/>
        <div className="m-sheet-group">Trang khác</div>
        {TAB_PHU.map(t=>(
          <button key={t.k} className={`m-sheet-item${tab===t.k?' on':''}`} aria-current={tab===t.k?'page':undefined} onClick={chon(()=>onGo(t.k))}>
            <span className="m-sheet-ico">{t.i}</span><span className="m-sheet-lbl">{t.l}</span>
            {t.k==='po'&&poCount>0&&<span className="m-sheet-count">{poCount}</span>}
          </button>
        ))}
        <div className="m-sheet-group">Thao tác</div>
        <button className="m-sheet-item" onClick={chon(onSave)} disabled={!canSave}>
          <span className="m-sheet-ico">💾</span><span className="m-sheet-lbl">Lưu kịch bản</span>{!canSave&&<small>cần có lô hàng</small>}
        </button>
        <button className="m-sheet-item" onClick={chon(onPrint)} disabled={!canPrint}>
          <span className="m-sheet-ico">🖨</span><span className="m-sheet-lbl">In A4</span>{!canPrint&&<small>cần có lô hàng</small>}
        </button>
        <button className="m-sheet-item" onClick={chon(onGithub)}>
          <span className="m-sheet-ico">⚙️</span><span className="m-sheet-lbl">GitHub</span><small className={ghVerified?'ok':'err'}>{ghVerified?`✓ ${ghLogin||'?'}`:'⚠ chưa xác thực'}</small>
        </button>
        <button className="m-sheet-item" onClick={chon(onCeo)}>
          <span className="m-sheet-ico">📱</span><span className="m-sheet-lbl">Bảng Giám đốc</span>
        </button>
        <button className="m-sheet-close" onClick={onClose}>Đóng</button>
      </div>
    </div>
  );
};

export {MobileBottomNav,MobileHeader,MobileMoreSheet,TAB_CHINH,TAB_PHU};
