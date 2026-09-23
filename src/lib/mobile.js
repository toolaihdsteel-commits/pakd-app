// ─── GIAO DIỆN ĐIỆN THOẠI — hạ tầng dùng chung ───────────────────
// Breakpoint thống nhất với CSS: @media (max-width:768px) trong styles.css.
// Đổi số này thì phải đổi luôn media query bên CSS cho khớp.
import {useState,useEffect} from 'react';

export const MOBILE_BP=768;
const MQ=`(max-width: ${MOBILE_BP}px)`;

// Có matchMedia không? (SSR / jsdom trong tools/smoke*.mjs không có → coi là desktop)
const coMatchMedia=()=>typeof window!=='undefined'&&typeof window.matchMedia==='function';

// Đọc trạng thái hiện tại — không bao giờ ném lỗi
const docMQ=()=>{
  if(!coMatchMedia()) return false;
  try{return window.matchMedia(MQ).matches;}catch(e){return false;}
};

// Hook: true khi màn hình ≤768px; tự cập nhật khi xoay máy / kéo cửa sổ
export function useIsMobile(){
  const [isMobile,setIsMobile]=useState(docMQ);
  useEffect(()=>{
    if(!coMatchMedia()) return undefined;
    let mql;
    try{mql=window.matchMedia(MQ);}catch(e){return undefined;}
    const onChange=e=>setIsMobile(!!e.matches);
    setIsMobile(mql.matches); // đồng bộ lại phòng khi đổi cỡ giữa lúc render và mount
    if(typeof mql.addEventListener==='function'){
      mql.addEventListener('change',onChange);
      return()=>mql.removeEventListener('change',onChange);
    }
    // Safari < 14 chỉ có addListener/removeListener
    if(typeof mql.addListener==='function'){
      mql.addListener(onChange);
      return()=>mql.removeListener(onChange);
    }
    return undefined;
  },[]);
  return isMobile;
}
