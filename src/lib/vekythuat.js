// ═══════════════════════════════════════════════════════════════════════════
// CÔNG CỤ VẼ KỸ THUẬT — Đường xu hướng & Đường ngang (hỗ trợ/kháng cự)
// ═══════════════════════════════════════════════════════════════════════════
// Nét vẽ được lưu vào localStorage nên đóng trình duyệt mở lại vẫn còn.
//
// Quy tắc phạm vi (khác nhau có chủ đích):
//   • ĐƯỜNG NGANG  dùng chung cho MỌI khung thời gian của cùng một mã.
//     Mức kháng cự 24.000 thì nhìn ở khung Ngày hay 1 giờ vẫn là 24.000.
//   • ĐƯỜNG XU HƯỚNG chỉ hiện đúng khung đã vẽ. Đường nối 2 đỉnh trên biểu đồ
//     Ngày mà đem sang khung 15 phút thì vô nghĩa.
// ═══════════════════════════════════════════════════════════════════════════

export const TEN_NGANG = 'horizontalStraightLine';
export const TEN_XU_HUONG = 'segment';

export const CONG_CU = [
  { k: '',   l: '✥ Chọn',           overlay: null,          mota: 'Chọn / di chuyển nét vẽ' },
  { k: 'xh', l: '╱ Đường xu hướng', overlay: TEN_XU_HUONG,  mota: 'Bấm 2 điểm để nối thành đường xu hướng' },
  { k: 'ng', l: '━ Đường ngang',    overlay: TEN_NGANG,     mota: 'Bấm 1 điểm để đặt mức hỗ trợ / kháng cự' },
];

// Màu tách bạch với nến (xanh lá / đỏ) để không nhìn nhầm
export const KIEU_VE = {
  [TEN_XU_HUONG]: {
    line: { color: '#2563eb', size: 2 },
    point: { color: '#2563eb', borderColor: 'rgba(37,99,235,.25)', activeColor: '#1d4ed8' },
  },
  [TEN_NGANG]: {
    line: { color: '#9333ea', size: 2, style: 'dashed', dashedValue: [6, 4] },
    point: { color: '#9333ea', borderColor: 'rgba(147,51,234,.25)', activeColor: '#7e22ce' },
  },
};

const KHOA = (ma) => `pakd:ve-ky-thuat:${ma}`;

function doc(ma) {
  try {
    const s = localStorage.getItem(KHOA(ma));
    const d = s ? JSON.parse(s) : [];
    return Array.isArray(d) ? d : [];
  } catch { return []; }
}

// Nét vẽ LUÔN lưu ở mặt bằng GỒM VAT (đơn vị chuẩn), bất kể lúc vẽ đang bật
// hay tắt "bóc VAT". Nhờ vậy gạt công tắc VAT không làm lệch nét đã vẽ.
//   heSo = 1/1,13 khi đang bóc VAT, = 1 khi hiển thị giá gồm VAT.
/** Lưu nét vẽ đang có trên chart, GIỮ NGUYÊN nét của các khung khác. */
export function luuVe(chart, ma, khung, heSo = 1) {
  if (!chart) return 0;
  // Nét của khung khác không nằm trên chart lúc này → phải bê nguyên từ bản cũ
  // sang, nếu không mỗi lần đổi khung là xoá mất nét đã vẽ ở khung trước.
  const giuLai = doc(ma).filter((v) => v.name !== TEN_NGANG && v.khung !== khung);

  const hienTai = chart.getOverlays()
    .filter((o) => Array.isArray(o.points) && o.points.length
                   && o.points.every((p) => p?.timestamp != null && p?.value != null))
    .map((o) => ({
      name: o.name,
      khung: o.extendData?.khung ?? khung,
      points: o.points.map((p) => ({ timestamp: p.timestamp, value: p.value / heSo })),
    }));

  try { localStorage.setItem(KHOA(ma), JSON.stringify([...giuLai, ...hienTai])); } catch { /* đầy quota */ }
  return hienTai.length;
}

/** Xoá hết nét trên chart rồi vẽ lại đúng những nét thuộc phạm vi (mã, khung). */
export function khoiPhucVe(chart, ma, khung, heSo = 1) {
  if (!chart) return 0;
  chart.removeOverlay();
  let n = 0;
  for (const v of doc(ma)) {
    if (v.name !== TEN_NGANG && v.khung !== khung) continue;   // xu hướng: đúng khung mới hiện
    if (!v.points?.length) continue;
    chart.createOverlay({
      name: v.name,
      points: v.points.map((p) => ({ ...p, value: p.value * heSo })),
      styles: KIEU_VE[v.name],
      extendData: { khung: v.khung ?? khung },
    });
    n++;
  }
  return n;
}

/** Xoá toàn bộ nét vẽ của mã (mọi khung). */
export function xoaHet(chart, ma) {
  chart?.removeOverlay();
  try { localStorage.removeItem(KHOA(ma)); } catch { /* bỏ qua */ }
}

/** Đếm nét đang lưu, tách theo loại — dùng cho nhãn nút. */
export function demVe(ma, khung) {
  const d = doc(ma);
  return {
    ngang: d.filter((v) => v.name === TEN_NGANG).length,
    xuHuong: d.filter((v) => v.name !== TEN_NGANG && v.khung === khung).length,
    tong: d.length,
  };
}
