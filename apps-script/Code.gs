/**
 * PAKD MUA — GĐ2: Ghi 2 chiều GSheet + Email cảnh báo sáng
 * ─────────────────────────────────────────────────────────
 * CÀI ĐẶT (làm 1 lần, xem HuongDan_SuaCode.md mục GĐ2):
 * 1. Mở Google Sheet dữ liệu → Tiện ích mở rộng → Apps Script → dán file này.
 * 2. Project Settings → Script properties, thêm:
 *    - SECRET        : mã bí mật tự đặt (vd chuỗi 20 ký tự ngẫu nhiên) — PHẢI trùng với ô "Mã bí mật" trong app
 *    - ALERT_EMAILS  : email nhận cảnh báo, cách nhau dấu phẩy (vd sep@hdsteel.vn,huy@hdsteel.vn)
 *    - GH_OWNER      : tên user GitHub (cho cảnh báo PA chờ duyệt) — bỏ trống nếu chưa dùng
 *    - GH_REPO       : pakd-data
 *    - GH_TOKEN      : fine-grained token CHỈ quyền đọc Contents repo pakd-data
 * 3. Chạy hàm setupTriggers 1 lần (nút ▶) → cấp quyền → tự tạo lịch 8h sáng.
 * 4. Deploy → New deployment → Web app: Execute as ME, Access: ANYONE → copy URL dán vào app.
 */

const SHEET_ID = '1iNyB0XTf3rqZyHcmujYuuKlXh6QXTQqr-LQ1f6IEGxU';
const GID_INVENTORY = 0;
const GID_MINMAX    = 1080747466;
const GID_PO        = 2015387961;
const GID_CASHFLOW  = 127496102;
const AUDIT_SHEET   = 'AUDIT_LOG';

// ───────────────────────── Tiện ích chung ─────────────────────────
function props_(){ return PropertiesService.getScriptProperties(); }
function ss_(){ return SpreadsheetApp.openById(SHEET_ID); }
function sheetByGid_(gid){
  const sh = ss_().getSheets().find(s => s.getSheetId() === gid);
  if (!sh) throw new Error('Không tìm thấy sheet gid=' + gid);
  return sh;
}
// bỏ dấu tiếng Việt + thường hóa + chỉ giữ a-z0-9 (giống stripVN trong app)
function norm_(s){
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]/g, '');
}
// chuẩn hóa số đo (1.0 → "1", 1200 → "1200") giống normDim trong app
function normDim_(v){
  const f = parseFloat(String(v == null ? '' : v).replace(',', '.'));
  if (isNaN(f)) return norm_(v);
  return String(f);
}
function skuKey_(o){
  return [norm_(o.alloy), norm_(o.temper), normDim_(o.thickness), normDim_(o.width),
          normDim_(o.length), norm_(o.coating || 'KP')].join('|');
}
// ═══ CHUẨN HOÁ DÙNG CHUNG — bản sao của src/lib/chuanhoa.js ═══
// PHẢI khớp với bản trên trình duyệt. tools/kiem-minmax.mjs so hai bản với
// nhau; lệch là test đỏ.
// Lý do tồn tại: khoá SKU ghép từ 6 thành phần nhập tay ở nhiều nơi. Một dấu
// nhân "×" thay "x", một khoảng trắng NBSP dán từ Excel, hay "cuộn" thay "C"
// là hai bên ra hai khoá khác nhau → app báo "Không tìm thấy SKU" dù dòng đó
// đang nằm trên sheet.
var TRANG_LA_ = /[\u00a0\u1680\u2000-\u200d\u202f\u205f\u3000\ufeff]/g;

function boDau_(s){
  return String(s == null ? '' : s).replace(TRANG_LA_, ' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D');
}
function chuanChu_(s){ return boDau_(s).toLowerCase().replace(/[^a-z0-9]/g, ''); }

function chuanSo_(v){
  if (typeof v === 'number') return isFinite(v) ? v : null;
  var t = boDau_(v).trim();
  if (t === '') return null;
  t = t.replace(/\s*(mm|kg|m|tan|tons?|ly)\s*$/i, '').trim().replace(/[()]/g, '').trim();
  if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  else if (/^-?\d{1,3}(,\d{3})+$/.test(t)) t = t.replace(/,/g, '');
  else t = t.replace(',', '.');
  t = t.replace(/\s+/g, '');
  if (!/^-?\d*\.?\d+$/.test(t)) return null;
  var f = parseFloat(t);
  return isNaN(f) ? null : f;
}
function chuanDo_(v){ var f = chuanSo_(v); return f === null ? chuanChu_(v) : String(f); }

var LA_CUON_ = ['', 'c', 'coil', 'cuon', 'cuoncoil', 'coilc', 'dangcuon', 'cuontron', 'roll'];
function chuanDai_(v){
  var t = chuanChu_(v);
  return LA_CUON_.indexOf(t) >= 0 ? 'C' : chuanDo_(v);
}
var LA_PHU_ = ['1e', 'pe', 'yes', 'y', '1', 'true', 'co', 'cophu', 'phu', 'copheu'];
function chuanPhu_(v){ return LA_PHU_.indexOf(chuanChu_(v)) >= 0 ? '1E' : 'KP'; }

function khoaSku2_(o){
  return [chuanChu_(o && o.alloy), chuanChu_(o && o.temper), chuanDo_(o && o.thickness),
          chuanDo_(o && o.width), chuanDai_(o && o.length), chuanPhu_(o && o.coating)].join('|');
}
var TEN_PHAN_ = ['mác', 'temper', 'độ dày', 'khổ rộng', 'chiều dài', 'lớp phủ'];
/** Tên các thành phần LỆCH giữa 2 khoá — để báo cho người dùng biết sửa ô nào. */
function khacNhauO_(a, b){
  var x = String(a).split('|'), y = String(b).split('|'), ra = [];
  for (var i = 0; i < 6; i++) if (x[i] !== y[i]) ra.push(TEN_PHAN_[i] + ' (' + y[i] + ' ≠ ' + x[i] + ')');
  return ra;
}

// ═══ TÌM DÒNG SKU TRÊN SHEET MIN/MAX — nhiều tầng + chẩn đoán ═══
function colsMinMax_(H){
  return {
    a: colIdx_(H, ['mac', 'alloy']), t: colIdx_(H, ['temper']),
    d: colIdx_(H, ['day', 'thickness']), r: colIdx_(H, ['rong', 'width']),
    l: colIdx_(H, ['dai', 'length']), p: colIdx_(H, ['phu', 'coating']),
    req: colIdx_(H, ['yeucaumua', 'yeu cau mua']),
    week: colIdx_(H, ['tuanyeucau', 'tuan yeu cau'])
  };
}
/**
 * Trả về { i } nếu tìm thấy (i = chỉ số dòng trong data),
 * hoặc { i:-1, loi:'...' } kèm gợi ý dòng gần đúng.
 * KHÔNG tự khớp khi lệch lớp phủ — PE và KP là hai mặt hàng khác nhau, đoán
 * bừa thì ghi nhầm dòng. Thà báo rõ để người dùng sửa ô trên sheet.
 */
function timDongSku_(data, C, p){
  var muon = khoaSku2_(p);
  var nhan = {};
  nhan[muon] = 1;
  if (p.skuKey) nhan[p.skuKey] = 1;
  var bt = p.skuVariants || [];
  for (var v = 0; v < bt.length; v++) nhan[bt[v]] = 1;

  var gan = [];
  for (var i = 1; i < data.length; i++){
    var row = data[i];
    if (chuanChu_(row[C.a]) === '') continue;
    var k = khoaSku2_({ alloy: row[C.a], temper: row[C.t], thickness: row[C.d],
                        width: row[C.r], length: row[C.l], coating: row[C.p] });
    if (k === muon || nhan[k]) return { i: i, khoa: k };
    var kh = khacNhauO_(muon, k);
    if (kh.length <= 2) gan.push({ dong: i + 1, so: kh.length, lech: kh.join(', ') });
  }
  // Xep dong LECH IT NHAT len dau — nguoi dung nhin phat ra ngay o nao sai.
  gan.sort(function(x, y){ return x.so - y.so; });
  var msg = 'Không tìm thấy SKU ' + skuLabel_(p) + ' trong sheet Min/Max.\nKhoá app gửi: ' + muon;
  if (gan.length){
    msg += '\nDòng gần giống trên sheet:';
    for (var j = 0; j < Math.min(3, gan.length); j++)
      msg += '\n  • dòng ' + gan[j].dong + ' — lệch ' + gan[j].lech;
    msg += '\n→ Sửa ô lệch trên GSheet rồi bấm Sync.';
  }
  return { i: -1, loi: msg };
}

// tìm chỉ số cột theo danh sách tên ứng viên (đã norm)
function colIdx_(headers, cands){
  const hs = headers.map(norm_);
  for (var i = 0; i < cands.length; i++){
    const j = hs.indexOf(norm_(cands[i]));
    if (j >= 0) return j;
  }
  return -1;
}
function json_(obj){
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ─────────────────── AUDIT LOG (lưu vết mọi thao tác ghi) ───────────────────
function audit_(by, action, detail, oldVal, newVal){
  const ss = ss_();
  let sh = ss.getSheetByName(AUDIT_SHEET);
  if (!sh){
    sh = ss.insertSheet(AUDIT_SHEET);
    sh.appendRow(['Thời gian', 'Người (PIN)', 'Hành động', 'Chi tiết', 'Giá trị cũ', 'Giá trị mới']);
    sh.setFrozenRows(1);
  }
  sh.appendRow([new Date(), by || '?', action, detail || '', String(oldVal == null ? '' : oldVal), String(newVal == null ? '' : newVal)]);
}

// ───────────────────────── WEB APP: ghi 2 chiều ─────────────────────────
function doPost(e){
  let body;
  try { body = JSON.parse(e.postData.contents); }
  catch (err){ return json_({ ok: false, error: 'Body không phải JSON' }); }

  if (!body.secret || body.secret !== props_().getProperty('SECRET')){
    return json_({ ok: false, error: 'Sai mã bí mật' });
  }
  const by = String(body.by || '?').slice(0, 60); // tên người đã định danh bằng PIN trong app

  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); }
  catch (err){ return json_({ ok: false, error: 'Sheet đang bận, thử lại sau' }); }

  try {
    if (body.action === 'ping') return json_({ ok: true, msg: 'PAKD Apps Script sẵn sàng' });
    if (body.action === 'markBuyReqDone')    return json_(markBuyReqDone_(body.payload || {}, by));
    if (body.action === 'updatePODelivered') return json_(updatePODelivered_(body.payload || {}, by));
    if (body.action === 'setBuyRequest')     return json_(setBuyRequest_(body.payload || {}, by));
    if (body.action === 'appendFloorHistory') return json_(appendFloorHistory_(body.payload || {}, by));
    if (body.action === 'addImportPrice')     return json_(addImportPrice_(body.payload || {}, by));
    if (body.action === 'setCompetitorPrice') return json_(setCompetitorPrice_(body.payload || {}, by));
    if (body.action === 'addPORows')         return json_(addPORows_(body.payload || {}, by));
    if (body.action === 'updatePORow')        return json_(updatePORow_(body.payload || {}, by));
    if (body.action === 'deletePORow')        return json_(deletePORow_(body.payload || {}, by));
    if (body.action === 'deletePO')           return json_(deletePO_(body.payload || {}, by));
    if (body.action === 'storeMarket'){ // GĐ3a plan B: GitHub Actions kéo giá rồi đẩy vào đây
      const p = body.payload || {};
      const n = x => { const f = parseFloat(x); return isNaN(f) ? null : f; };
      return json_(writeMarketRow_({ lme: n(p.lme), shfe: n(p.shfe), smm: n(p.smm), smmMove: n(p.smmMove), usd: n(p.usd), cny: n(p.cny) }));
    }
    return json_({ ok: false, error: 'Action không hợp lệ: ' + body.action });
  } catch (err){
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

// Đánh dấu đề xuất mua ĐÃ XỬ LÝ = XÓA ô "yêu cầu mua" + "tuần yêu cầu" (giữ vết trong AUDIT_LOG)
function markBuyReqDone_(p, by){
  const sh = sheetByGid_(GID_MINMAX);
  const data = sh.getDataRange().getValues();
  const C = colsMinMax_(data[0]);
  if (C.req < 0) return { ok: false, error: 'Sheet Min/Max không có cột yeucaumua' };

  const tim = timDongSku_(data, C, p);
  if (tim.i < 0) return { ok: false, error: tim.loi };
  const i = tim.i, row = data[i];
  const oldReq = row[C.req], oldWeek = C.week >= 0 ? row[C.week] : '';
  if (String(oldReq).trim() === '')
    return { ok: false, error: 'Mã này không có đề xuất mua (có thể đã xử lý rồi — bấm Sync)' };
  sh.getRange(i + 1, C.req + 1).clearContent();
  if (C.week >= 0) sh.getRange(i + 1, C.week + 1).clearContent();
  audit_(by, 'XỬ LÝ ĐỀ XUẤT MUA', skuLabel_(p), 'yêu cầu=' + oldReq + ' tuần=' + oldWeek, '(đã xóa)');
  return { ok: true, msg: 'Đã xóa đề xuất mua của ' + skuLabel_(p) + ' (dòng ' + (i + 1) + ')' };
}

// R6: Sàn duyệt đủ cấp → append vào sheet lich_su_gia_san (1 dòng / nhóm hàng)
const GID_LICH_SU_GIA_SAN = 1612937978;
const GID_UPDATED_IMPORT = 1371908903; // FIX R7: bị rơi khai báo từ R2 — email cảnh báo premium lỗi mục này
function appendFloorHistory_(p, by){
  const sh = sheetByGid_(GID_LICH_SU_GIA_SAN);
  if (sh.getLastRow() === 0){
    sh.appendRow(['Ngày duyệt', 'Tuần', 'Người trình', 'Người duyệt', 'Nhóm hàng', 'Mác', 'Temper', 'Dày min', 'Dày max',
                  'SKUs', 'Tồn kho (kg)', 'BQ GV (đ/kg)', 'Sàn tự động (đ/kg)', 'Sàn ban hành (đ/kg)',
                  'A Group (đ/kg)', 'B Group (đ/kg)', 'C Group (đ/kg)', 'Tỷ giá', 'Ghi chú', 'File nguồn']);
    sh.setFrozenRows(1);
  }
  const groups = Array.isArray(p.groups) ? p.groups : [];
  if (!groups.length) return { ok: false, error: 'Không có nhóm hàng nào trong bản Sàn' };
  const dt = p.approvedAt ? new Date(p.approvedAt) : new Date();
  const dtxt = Utilities.formatDate(dt, 'GMT+7', 'dd/MM/yyyy HH:mm');
  const n = v => { const f = parseFloat(v); return isNaN(f) ? '' : Math.round(f); };
  const rows = groups.map(g => [dtxt, p.weekLabel || '', p.requestedBy || '', p.approvedBy || by || '',
    g.label || '', g.alloy || '', g.temper || '', g.minThick != null ? g.minThick : '', g.maxThick != null ? g.maxThick : '',
    g.skus || '', n(g.totalQty), n(g.avgCost), n(g.autoFloor != null ? g.autoFloor : g.avgFloor), n(g.publishedFloor),
    n(g.corePrice), n(g.loyalPrice), n(g.newPrice), p.exchangeRate || '', p.requestNote || '', p.sourceFile || '']);
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  audit_(by, 'BAN HÀNH GIÁ SÀN → lich_su_gia_san', 'Sàn ' + (p.weekLabel || '?') + ' — ' + rows.length + ' nhóm', '', p.sourceFile || '');
  return { ok: true, msg: 'Đã ghi ' + rows.length + ' nhóm vào lich_su_gia_san' };
}

// R7: Phòng mua nhập GIÁ CIF MỚI → APPEND dòng mới vào sheet UpdatedImportPrice (gid 1371908903)
function uipCols_(H){
  return {
    d: colIdx_(H, ['updatedate', 'update date']), a: colIdx_(H, ['alloy', 'mac']), t: colIdx_(H, ['temper']),
    mn: colIdx_(H, ['minthick', 'min thick']), mx: colIdx_(H, ['maxthick', 'max thick']),
    f: colIdx_(H, ['pricefc', 'price fc']), note: colIdx_(H, ['note', 'ghichu', 'ghi chu']),
    k: colIdx_(H, ['importcoef', 'import coef', 'heso']),
    cp: colIdx_(H, ['competitorprice', 'competitor price']), cf: colIdx_(H, ['competitorfloorprice', 'competitor floor price']),
  };
}
function uipToIso_(v){
  if (v instanceof Date) return Utilities.formatDate(v, 'GMT+7', 'yyyy-MM-dd');
  const m = String(v || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : '';
}
function uipGroupMatch_(row, c, p){
  return norm_(row[c.a]) === norm_(p.alloy) && norm_(row[c.t]) === norm_(p.temper || '')
    && normDim_(row[c.mn]) === normDim_(p.minThick) && normDim_(row[c.mx]) === normDim_(p.maxThick);
}
function addImportPrice_(p, by){
  const sh = sheetByGid_(GID_UPDATED_IMPORT);
  const data = sh.getDataRange().getValues();
  const H = data[0]; const c = uipCols_(H);
  if (c.f < 0 || c.a < 0) return { ok: false, error: 'Sheet Giá nhập thiếu cột PriceFC/Alloy' };
  const price = parseFloat(p.priceFC);
  if (isNaN(price) || price <= 0) return { ok: false, error: 'Giá CIF không hợp lệ' };
  // importCoef: kế thừa dòng MỚI NHẤT cùng nhóm, mặc định 1.015
  let coef = 1.015, lastIso = '';
  for (var i = 1; i < data.length; i++){
    if (!uipGroupMatch_(data[i], c, p)) continue;
    const iso = uipToIso_(data[i][c.d]);
    if (iso >= lastIso){ lastIso = iso; const k = parseFloat(data[i][c.k]); if (k > 0) coef = k; }
  }
  const row = new Array(H.length).fill('');
  if (c.d >= 0) row[c.d] = Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy');
  row[c.a] = p.alloy; if (c.t >= 0) row[c.t] = p.temper || '';
  if (c.mn >= 0) row[c.mn] = p.minThick; if (c.mx >= 0) row[c.mx] = p.maxThick;
  row[c.f] = price; if (c.note >= 0) row[c.note] = p.note || ''; if (c.k >= 0) row[c.k] = coef;
  sh.appendRow(row);
  audit_(by, 'NHẬP GIÁ CIF MỚI', p.alloy + ' ' + (p.temper || '') + ' ' + p.minThick + '-' + p.maxThick + 'mm', '', price + ' USD/t (' + (p.note || '') + ')');
  return { ok: true, msg: 'Đã thêm giá CIF ' + price + ' $/t cho ' + p.alloy + ' ' + (p.temper || '') + ' ' + p.minThick + '-' + p.maxThick + 'mm (hệ số ' + coef + ')' };
}
// R7: TP Kinh doanh ghi giá ĐỐI THỦ vào dòng CIF MỚI NHẤT của nhóm
function setCompetitorPrice_(p, by){
  const sh = sheetByGid_(GID_UPDATED_IMPORT);
  const data = sh.getDataRange().getValues();
  const H = data[0]; const c = uipCols_(H);
  if (c.cp < 0 && c.cf < 0) return { ok: false, error: 'Sheet Giá nhập thiếu cột CompetitorPrice/CompetitorFloorPrice' };
  let bestRow = -1, bestIso = '';
  for (var i = 1; i < data.length; i++){
    if (!uipGroupMatch_(data[i], c, p)) continue;
    const iso = uipToIso_(data[i][c.d]);
    if (iso >= bestIso){ bestIso = iso; bestRow = i; }
  }
  if (bestRow < 0) return { ok: false, error: 'Chưa có dòng giá CIF nào cho nhóm này — nhập "💲 CIF mới" trước' };
  const oldCp = c.cp >= 0 ? data[bestRow][c.cp] : '', oldCf = c.cf >= 0 ? data[bestRow][c.cf] : '';
  if (p.competitorPrice != null && c.cp >= 0) sh.getRange(bestRow + 1, c.cp + 1).setValue(parseFloat(p.competitorPrice));
  if (p.competitorFloorPrice != null && c.cf >= 0) sh.getRange(bestRow + 1, c.cf + 1).setValue(parseFloat(p.competitorFloorPrice));
  audit_(by, 'NHẬP GIÁ ĐỐI THỦ', p.alloy + ' ' + (p.temper || '') + ' ' + p.minThick + '-' + p.maxThick + 'mm (dòng ' + bestIso + ')',
         'CP=' + oldCp + ' CF=' + oldCf, 'CP=' + (p.competitorPrice != null ? p.competitorPrice : oldCp) + ' CF=' + (p.competitorFloorPrice != null ? p.competitorFloorPrice : oldCf));
  return { ok: true, msg: 'Đã ghi giá đối thủ vào dòng CIF ngày ' + bestIso };
}

// R4: GHI/SỬA đề xuất mua từ app (TP Kinh doanh…) → cột yeucaumua + tuanyeucau (lưu vết giá trị cũ)
function setBuyRequest_(p, by){
  const sh = sheetByGid_(GID_MINMAX);
  const data = sh.getDataRange().getValues();
  const C = colsMinMax_(data[0]);
  if (C.req < 0) return { ok: false, error: 'Sheet Min/Max không có cột yeucaumua' };
  const qty = parseFloat(p.request);
  if (isNaN(qty) || qty <= 0) return { ok: false, error: 'Khối lượng đề xuất không hợp lệ' };

  const tim = timDongSku_(data, C, p);
  if (tim.i < 0) return { ok: false, error: tim.loi };
  const i = tim.i, row = data[i];
  const oldReq = row[C.req], oldWeek = C.week >= 0 ? row[C.week] : '';
  sh.getRange(i + 1, C.req + 1).setValue(qty);
  if (C.week >= 0 && p.week) sh.getRange(i + 1, C.week + 1).setValue(String(p.week));
  audit_(by, 'ĐỀ XUẤT MUA (' + (String(oldReq).trim() === '' ? 'mới' : 'sửa') + ')', skuLabel_(p),
         'yêu cầu=' + oldReq + ' tuần=' + oldWeek, 'yêu cầu=' + qty + ' tuần=' + (p.week || oldWeek));
  return { ok: true, msg: 'Đã ghi đề xuất mua ' + qty + ' kg cho ' + skuLabel_(p) + (p.week ? ' (' + p.week + ')' : '') };
}

// R9: BỘ PO 2 CHIỀU ĐẦY ĐỦ — thêm nhiều dòng / sửa / xóa dòng / xóa cả PO (PIN + AUDIT_LOG)
function poCols_(H){
  return {
    po: colIdx_(H, ['sopo', 'so po', 'po']),
    sup: colIdx_(H, ['khachhang', 'khach hang', 'nhacc', 'nha cc', 'supplier', 'customer']),
    date: colIdx_(H, ['ngaypo', 'ngay po', 'date']),
    a: colIdx_(H, ['mac', 'alloy']), t: colIdx_(H, ['temper']),
    d: colIdx_(H, ['day', 'thickness']), r: colIdx_(H, ['rong', 'width']),
    l: colIdx_(H, ['dai', 'length']), ph: colIdx_(H, ['phu', 'coating']),
    ord: colIdx_(H, ['tldat', 'tl dat (kg)', 'tl dat']),
    del: colIdx_(H, ['tldagiao', 'tl da giao (kg)', 'tl da giao']),
    rem: colIdx_(H, ['tonchuagiao', 'ton chua giao (kg)', 'ton chua giao']),
    pr: colIdx_(H, ['dongia', 'don gia (d/kg)', 'don gia', 'price']),
  };
}
function poFindRow_(data, c, p){ // trả index dòng (1-based trong data) khớp PO + SKU, -1 nếu không có
  const want = skuKey_(p);
  for (var i = 1; i < data.length; i++){
    if (norm_(data[i][c.po]) !== norm_(p.po)) continue;
    const key = skuKey_({ alloy: data[i][c.a], temper: data[i][c.t], thickness: data[i][c.d],
                          width: data[i][c.r], length: data[i][c.l], coating: coat_(data[i][c.ph]) });
    if (key === want) return i;
  }
  return -1;
}
// THÊM nhiều dòng vào 1 PO (mới hoặc sẵn có). Dòng trùng PO+SKU bị BỎ QUA, dòng hợp lệ vẫn ghi.
function addPORows_(p, by){
  const sh = sheetByGid_(GID_PO);
  const data = sh.getDataRange().getValues();
  const H = data[0]; const c = poCols_(H);
  if (c.po < 0 || c.a < 0 || c.ord < 0) return { ok: false, error: 'Sheet PO thiếu cột Số PO / Mác / TL đặt' };
  const items = Array.isArray(p.items) ? p.items : [];
  if (!items.length) return { ok: false, error: 'Không có dòng hàng nào' };
  const added = [], skipped = [];
  items.forEach(function(it){
    const ordered = parseFloat(it.ordered);
    if (isNaN(ordered) || ordered <= 0){ skipped.push(skuLabel_(it) + ' (TL đặt sai)'); return; }
    const probe = { po: p.po, alloy: it.alloy, temper: it.temper, thickness: it.thickness, width: it.width, length: it.length, coating: it.coating };
    if (poFindRow_(data, c, probe) >= 0){ skipped.push(skuLabel_(it) + ' (trùng)'); return; }
    const row = new Array(H.length).fill('');
    row[c.po] = p.po; if (c.sup >= 0) row[c.sup] = p.supplier || '';
    if (c.date >= 0) row[c.date] = p.poDate || Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy');
    row[c.a] = it.alloy; if (c.t >= 0) row[c.t] = it.temper || '';
    if (c.d >= 0) row[c.d] = it.thickness; if (c.r >= 0) row[c.r] = it.width;
    if (c.l >= 0) row[c.l] = it.length || 'C'; if (c.ph >= 0) row[c.ph] = coat_(it.coating);
    row[c.ord] = ordered; if (c.del >= 0) row[c.del] = 0; if (c.rem >= 0) row[c.rem] = ordered;
    if (c.pr >= 0 && it.price > 0) row[c.pr] = parseFloat(it.price);
    sh.appendRow(row);
    data.push(row); // để check trùng giữa các dòng trong CÙNG lần gửi
    added.push(skuLabel_(it) + ' ' + ordered + 'kg');
  });
  if (added.length) audit_(by, 'THÊM HÀNG VÀO PO', 'PO ' + p.po + ' (' + (p.supplier || '?') + ')', '', added.join(' | '));
  if (!added.length) return { ok: false, error: 'Không ghi được dòng nào: ' + skipped.join(', ') };
  return { ok: true, msg: 'Đã ghi ' + added.length + ' dòng vào PO ' + p.po + (skipped.length ? ' · BỎ QUA ' + skipped.length + ' dòng: ' + skipped.join(', ') : '') };
}
// SỬA TL đặt + đơn giá 1 dòng (SKU giữ nguyên). Tồn chưa giao = TL đặt − đã giao (nếu không phải công thức).
function updatePORow_(p, by){
  const sh = sheetByGid_(GID_PO);
  const data = sh.getDataRange().getValues();
  const H = data[0]; const c = poCols_(H);
  const i = poFindRow_(data, c, p);
  if (i < 0) return { ok: false, error: 'Không tìm thấy PO ' + p.po + ' + SKU ' + skuLabel_(p) };
  const ordered = parseFloat(p.ordered);
  if (isNaN(ordered) || ordered <= 0) return { ok: false, error: 'TL đặt không hợp lệ' };
  const delivered = c.del >= 0 ? (parseFloat(data[i][c.del]) || 0) : 0;
  if (ordered < delivered) return { ok: false, error: 'TL đặt (' + ordered + ') nhỏ hơn TL đã giao (' + delivered + ')' };
  const oldOrd = data[i][c.ord], oldPr = c.pr >= 0 ? data[i][c.pr] : '';
  sh.getRange(i + 1, c.ord + 1).setValue(ordered);
  if (c.pr >= 0 && p.price > 0) sh.getRange(i + 1, c.pr + 1).setValue(parseFloat(p.price));
  if (c.rem >= 0 && sh.getRange(i + 1, c.rem + 1).getFormula() === ''){
    sh.getRange(i + 1, c.rem + 1).setValue(Math.max(ordered - delivered, 0));
  }
  audit_(by, 'SỬA DÒNG PO', 'PO ' + p.po + ' — ' + skuLabel_(p),
         'TL đặt=' + oldOrd + ' giá=' + oldPr, 'TL đặt=' + ordered + ' giá=' + (p.price > 0 ? p.price : oldPr));
  return { ok: true, msg: 'PO ' + p.po + ' — ' + skuLabel_(p) + ': TL đặt ' + oldOrd + ' → ' + ordered + ' kg' };
}
// XÓA 1 dòng PO (giá trị cũ lưu AUDIT_LOG)
function deletePORow_(p, by){
  const sh = sheetByGid_(GID_PO);
  const data = sh.getDataRange().getValues();
  const H = data[0]; const c = poCols_(H);
  const i = poFindRow_(data, c, p);
  if (i < 0) return { ok: false, error: 'Không tìm thấy PO ' + p.po + ' + SKU ' + skuLabel_(p) };
  const old = 'TL đặt=' + data[i][c.ord] + ' đã giao=' + (c.del >= 0 ? data[i][c.del] : '?') + ' giá=' + (c.pr >= 0 ? data[i][c.pr] : '?');
  sh.deleteRow(i + 1);
  audit_(by, 'XÓA DÒNG PO', 'PO ' + p.po + ' — ' + skuLabel_(p), old, '(đã xóa)');
  return { ok: true, msg: 'Đã xóa dòng ' + skuLabel_(p) + ' khỏi PO ' + p.po };
}
// XÓA CẢ PO — mọi dòng cùng Số PO (xóa từ dưới lên để không lệch index)
function deletePO_(p, by){
  const sh = sheetByGid_(GID_PO);
  const data = sh.getDataRange().getValues();
  const H = data[0]; const c = poCols_(H);
  const idxs = [];
  for (var i = 1; i < data.length; i++){ if (norm_(data[i][c.po]) === norm_(p.po)) idxs.push(i); }
  if (!idxs.length) return { ok: false, error: 'Không tìm thấy PO ' + p.po };
  const summary = idxs.map(function(i){
    return skuLabel_({ alloy: data[i][c.a], temper: data[i][c.t], thickness: data[i][c.d], width: data[i][c.r], length: data[i][c.l], coating: coat_(data[i][c.ph]) })
      + ' đặt=' + data[i][c.ord] + ' giao=' + (c.del >= 0 ? data[i][c.del] : '?');
  }).join(' | ');
  for (var k = idxs.length - 1; k >= 0; k--) sh.deleteRow(idxs[k] + 1);
  audit_(by, 'XÓA CẢ PO', 'PO ' + p.po + ' (' + idxs.length + ' dòng)', summary, '(đã xóa toàn bộ)');
  return { ok: true, msg: 'Đã xóa PO ' + p.po + ' — ' + idxs.length + ' dòng hàng' };
}

// Cập nhật "TL đã giao (kg)" của 1 dòng PO (tìm theo Số PO + SKU)
function updatePODelivered_(p, by){
  const sh = sheetByGid_(GID_PO);
  const data = sh.getDataRange().getValues();
  const H = data[0];
  const cPO = colIdx_(H, ['sopo', 'so po', 'po']),
        cA = colIdx_(H, ['mac', 'alloy']), cT = colIdx_(H, ['temper']),
        cD = colIdx_(H, ['day', 'thickness']), cR = colIdx_(H, ['rong', 'width']),
        cL = colIdx_(H, ['dai', 'length']), cP = colIdx_(H, ['phu', 'coating']),
        cOrd = colIdx_(H, ['tldat', 'tl dat (kg)', 'tl dat']),
        cDel = colIdx_(H, ['tldagiao', 'tl da giao (kg)', 'tl da giao']),
        cRem = colIdx_(H, ['tonchuagiao', 'ton chua giao (kg)', 'ton chua giao']);
  if (cPO < 0 || cDel < 0) return { ok: false, error: 'Sheet PO thiếu cột Số PO / TL đã giao' };

  const newDel = parseFloat(p.delivered);
  if (isNaN(newDel) || newDel < 0) return { ok: false, error: 'TL đã giao không hợp lệ' };
  const want = skuKey_(p);
  for (var i = 1; i < data.length; i++){
    const row = data[i];
    if (norm_(row[cPO]) !== norm_(p.po)) continue;
    const key = skuKey_({ alloy: row[cA], temper: row[cT], thickness: row[cD],
                          width: row[cR], length: row[cL], coating: coat_(row[cP]) });
    if (key !== want) continue;
    const oldDel = row[cDel];
    const ordered = cOrd >= 0 ? (parseFloat(row[cOrd]) || 0) : 0;
    if (ordered > 0 && newDel > ordered) return { ok: false, error: 'TL đã giao (' + newDel + ') lớn hơn TL đặt (' + ordered + ')' };
    sh.getRange(i + 1, cDel + 1).setValue(newDel);
    // Cột "Tồn chưa giao": chỉ ghi đè nếu KHÔNG phải công thức
    if (cRem >= 0 && sh.getRange(i + 1, cRem + 1).getFormula() === ''){
      sh.getRange(i + 1, cRem + 1).setValue(Math.max(ordered - newDel, 0));
    }
    audit_(by, 'CẬP NHẬT TL ĐÃ GIAO', 'PO ' + p.po + ' — ' + skuLabel_(p), oldDel, newDel);
    return { ok: true, msg: 'PO ' + p.po + ': TL đã giao ' + oldDel + ' → ' + newDel + ' kg' };
  }
  return { ok: false, error: 'Không tìm thấy PO ' + p.po + ' + SKU ' + skuLabel_(p) };
}

function coat_(v){ const u = String(v || '').toUpperCase(); return (u === '1E' || u === 'PE') ? '1E' : 'KP'; }
function skuLabel_(o){ return [o.alloy, o.temper, o.thickness + 'x' + o.width + 'x' + o.length, o.coating].join(' '); }

// ───────────────────────── CẢNH BÁO SÁNG 8H ─────────────────────────
function setupTriggers(){
  ScriptApp.getProjectTriggers().forEach(t => {
    if (['checkDailyAlerts','fetchMarketPrices'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('checkDailyAlerts').timeBased().everyDays(1).atHour(8).create();
  ScriptApp.newTrigger('fetchMarketPrices').timeBased().everyDays(1).atHour(12).create(); // GĐ3a: sau khi SMM công bố ~10h30 VN
  Logger.log('✓ Đã tạo lịch: checkDailyAlerts ~8h sáng, fetchMarketPrices ~12h trưa');
}

function checkDailyAlerts(){
  const alerts = [];
  try { alertCashflow_(alerts); }   catch (e){ alerts.push('⚠ Lỗi đọc dòng tiền: ' + e.message); }
  try { alertLowStock_(alerts); }   catch (e){ alerts.push('⚠ Lỗi đọc tồn kho: ' + e.message); }
  try { alertPendingPA_(alerts); }  catch (e){ alerts.push('⚠ Lỗi đọc PA GitHub: ' + e.message); }
  try { alertCIFvsMarket_(alerts); } catch (e){ alerts.push('⚠ Lỗi so giá CIF/thị trường: ' + e.message); }

  if (alerts.length === 0){ Logger.log('Không có cảnh báo — không gửi email.'); return; }
  const to = props_().getProperty('ALERT_EMAILS');
  if (!to){ Logger.log('Chưa cấu hình ALERT_EMAILS'); return; }
  const d = new Date();
  const subject = '⚠ PAKD cảnh báo sáng ' + Utilities.formatDate(d, 'GMT+7', 'dd/MM/yyyy') + ' (' + alerts.length + ' mục)';
  const htmlBody = '<div style="font-family:Arial,sans-serif;font-size:14px">'
    + '<h3 style="color:#b91c1c">Cảnh báo PAKD Mua — ' + Utilities.formatDate(d, 'GMT+7', 'dd/MM/yyyy HH:mm') + '</h3>'
    + '<ul><li>' + alerts.join('</li><li>') + '</li></ul>'
    + '<p style="color:#64748b;font-size:12px">Email tự động từ Google Apps Script (GĐ2). Mở app để xử lý.</p></div>';
  MailApp.sendEmail({ to: to, subject: subject, htmlBody: htmlBody });
}

// 1) Tuần hiện tại hụt dòng (TỔNG HẠN MỨC < 0) — đọc ma trận ngang theo cột KEY
function alertCashflow_(alerts){
  const data = sheetByGid_(GID_CASHFLOW).getDataRange().getValues();
  // tìm hàng header tuần (có ô "TUẦN n")
  let weekRow = -1;
  for (var i = 0; i < Math.min(data.length, 15); i++){
    if (data[i].some(c => /tuan\s*\d+/.test(norm_(String(c)).replace(/(\d)/, ' $1')) || /^tuan\d+$/.test(norm_(c)))){ weekRow = i; break; }
  }
  if (weekRow < 0) throw new Error('không thấy hàng TUẦN');
  let keyCol = data[weekRow].findIndex(c => norm_(c) === 'key');
  if (keyCol < 0) keyCol = 1;
  const byKey = {};
  for (var r = weekRow + 1; r < data.length; r++){ const k = norm_(data[r][keyCol]); if (k) byKey[k] = data[r]; }
  // tuần ISO hiện tại
  const now = new Date(); const tmp = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const week = Math.ceil((((tmp - new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))) / 86400000) + 1) / 7);
  // cột của tuần hiện tại
  let col = -1;
  data[weekRow].forEach((c, j) => { const m = norm_(c).match(/^tuan(\d+)$/); if (m && parseInt(m[1]) === week) col = j; });
  if (col < 0) return; // sheet chưa có tuần này
  const num = v => { const f = parseFloat(String(v).replace(/\./g, '').replace(/,/g, '.')); return isNaN(f) ? null : f; };
  let hanMuc = byKey['hanmuc'] ? num(byKey['hanmuc'][col]) : null;
  if (hanMuc == null){
    const hd = byKey['hm_hd'] ? num(byKey['hm_hd'][col]) : null;
    const dd = byKey['hm_dd'] ? num(byKey['hm_dd'][col]) : null;
    if (hd != null || dd != null) hanMuc = (hd || 0) + (dd || 0);
  }
  if (hanMuc != null && hanMuc < 0){
    alerts.push('🔴 <b>Tuần ' + week + ' HỤT DÒNG ' + (Math.abs(hanMuc) / 1e9).toFixed(2) + ' tỷ</b> (TỔNG HẠN MỨC âm) — cân nhắc hoãn chi / đẩy thu.');
  }
}

// 2) SKU tồn (kho + đang về) dưới Min
function alertLowStock_(alerts){
  const inv = sheetByGid_(GID_INVENTORY).getDataRange().getValues();
  const Hi = inv[0];
  const iA = colIdx_(Hi, ['alloy', 'mac']), iT = colIdx_(Hi, ['temper']), iD = colIdx_(Hi, ['thickness', 'day']),
        iR = colIdx_(Hi, ['width', 'rong']), iL = colIdx_(Hi, ['length', 'dai']), iP = colIdx_(Hi, ['coating', 'phu']),
        iQ = colIdx_(Hi, ['qtykg', 'qty kg']), iS = colIdx_(Hi, ['status']);
  const stockByKey = {};
  for (var r = 1; r < inv.length; r++){
    const row = inv[r]; if (!row[iA]) continue;
    const key = skuKey_({ alloy: row[iA], temper: row[iT], thickness: row[iD], width: row[iR], length: row[iL], coating: coat_(row[iP]) });
    const q = parseFloat(row[iQ]) || 0;
    const st = norm_(iS >= 0 ? row[iS] : 'instock');
    if (!stockByKey[key]) stockByKey[key] = { stock: 0, transit: 0 };
    if (st.indexOf('transit') >= 0) stockByKey[key].transit += q; else stockByKey[key].stock += q;
  }
  const mm = sheetByGid_(GID_MINMAX).getDataRange().getValues();
  const Hm = mm[0];
  const mA = colIdx_(Hm, ['mac', 'alloy']), mT = colIdx_(Hm, ['temper']), mD = colIdx_(Hm, ['day', 'thickness']),
        mR = colIdx_(Hm, ['rong', 'width']), mL = colIdx_(Hm, ['dai', 'length']), mP = colIdx_(Hm, ['phu', 'coating']),
        mMin = colIdx_(Hm, ['minstockkg', 'min stock kg']);
  const low = [];
  for (var r2 = 1; r2 < mm.length; r2++){
    const row2 = mm[r2]; if (!row2[mA]) continue;
    const min = parseFloat(row2[mMin]) || 0; if (min <= 0) continue;
    const key2 = skuKey_({ alloy: row2[mA], temper: row2[mT], thickness: row2[mD], width: row2[mR], length: row2[mL], coating: coat_(row2[mP]) });
    const s = stockByKey[key2] || { stock: 0, transit: 0 };
    if (s.stock + s.transit < min){
      low.push(skuLabel_({ alloy: row2[mA], temper: row2[mT], thickness: row2[mD], width: row2[mR], length: row2[mL], coating: row2[mP] })
        + ': tồn ' + Math.round(s.stock) + ' + đang về ' + Math.round(s.transit) + ' &lt; Min ' + Math.round(min) + ' kg');
    }
  }
  if (low.length) alerts.push('📦 <b>' + low.length + ' SKU dưới tồn Min</b>:<br>• ' + low.slice(0, 15).join('<br>• ') + (low.length > 15 ? '<br>… và ' + (low.length - 15) + ' mã nữa' : ''));
}

// 3) PA mua chờ duyệt quá 24h (đọc repo pakd-data /plans qua GitHub API)
function alertPendingPA_(alerts){
  const P = props_();
  const owner = P.getProperty('GH_OWNER'), repo = P.getProperty('GH_REPO'), token = P.getProperty('GH_TOKEN');
  if (!owner || !repo || !token) return; // chưa cấu hình → bỏ qua mục này
  const gh = path => JSON.parse(UrlFetchApp.fetch('https://api.github.com/repos/' + owner + '/' + repo + '/' + path,
    { headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' }, muteHttpExceptions: false }).getContentText());
  let files;
  try { files = gh('contents/plans'); } catch (e){ return; } // chưa có thư mục plans
  const pend = [];
  (files || []).filter(f => f.name.endsWith('.json')).sort((a, b) => b.name.localeCompare(a.name)).slice(0, 20).forEach(f => {
    try {
      const pa = JSON.parse(UrlFetchApp.fetch(f.download_url).getContentText());
      if (pa.status !== 'pending') return;
      const ageH = (Date.now() - new Date(pa.savedAt).getTime()) / 3600000;
      if (ageH >= 24) pend.push(f.name + ' — trình bởi ' + (pa.requestedBy || '?') + ', chờ ' + Math.floor(ageH) + 'h');
    } catch (e){}
  });
  if (pend.length) alerts.push('⏳ <b>' + pend.length + ' PA mua chờ duyệt quá 24h</b>:<br>• ' + pend.join('<br>• '));
}

// ═══════════════════ GĐ3a: GIÁ THỊ TRƯỜNG (LME / SHFE / SMM) + TỶ GIÁ ═══════════════════
// Nguồn chính: worthwillaluminium.com/api/price/{smm|lme|shfe} (miễn phí, JSON sạch).
// Dự phòng: LME → westmetall.com ; SHFE → shfe.com.cn .dat. SMM miễn phí chỉ có nguồn chính.
// Tỷ giá USD/CNY: XML công khai Vietcombank.
// Script properties (tùy chọn): CIF_ALERT_PCT — ngưỡng %% premium đợt mới vượt TB các đợt trước thì cảnh báo (mặc định 10).
const MARKET_SHEET = 'MARKET_PRICES';
const WW_API = 'https://www.worthwillaluminium.com/api/price/';

function fetchJson_(url){
  try {
    const txt = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }).getContentText();
    return JSON.parse(txt);
  } catch (e){ return null; }
}
function wwCurrent_(kind){
  const r = fetchJson_(WW_API + kind);
  return (r && r.code === 200 && r.data && r.data.current) ? r.data.current : null;
}
// Tỷ giá USD/VND + CNY/VND. SỬA 10/06: portal Vietcombank TREO ~6 phút khi gọi từ IP Google
// (testMarketSources đo được 359s) → chuyển sang GOOGLEFINANCE (nội bộ Google, không thể bị chặn)
// qua sheet phụ ẩn FX_HELPER; dự phòng open.er-api.com. Lưu ý: tỷ giá GIỮA THỊ TRƯỜNG, lệch nhẹ giá Transfer VCB.
function fetchFxRates_(){
  // 1) GOOGLEFINANCE qua sheet phụ ẩn
  try {
    const ss = ss_();
    let sh = ss.getSheetByName('FX_HELPER');
    if (!sh){ sh = ss.insertSheet('FX_HELPER'); try { sh.hideSheet(); } catch (e){} }
    sh.getRange('A1').setFormula('=GOOGLEFINANCE("CURRENCY:USDVND")');
    sh.getRange('A2').setFormula('=GOOGLEFINANCE("CURRENCY:CNYVND")');
    sh.getRange('B1').setValue('VND/USD (GOOGLEFINANCE)'); sh.getRange('B2').setValue('VND/CNY (GOOGLEFINANCE)');
    SpreadsheetApp.flush();
    for (var i = 0; i < 10; i++){
      const usd = parseFloat(sh.getRange('A1').getValue());
      const cny = parseFloat(sh.getRange('A2').getValue());
      if (usd > 0 && cny > 0) return { usd: usd, cny: cny, src: 'GOOGLEFINANCE' };
      Utilities.sleep(1000); // chờ công thức tính xong
    }
  } catch (e){}
  // 2) Dự phòng: open.er-api.com (miễn phí, thân thiện IP Google)
  try {
    const r = fetchJson_('https://open.er-api.com/v6/latest/USD');
    if (r && r.rates && r.rates.VND){
      return { usd: r.rates.VND, cny: r.rates.CNY ? r.rates.VND / r.rates.CNY : null, src: 'er-api' };
    }
  } catch (e){}
  return { usd: null, cny: null, src: null };
}
// Dự phòng LME: bảng westmetall (cash settlement mới nhất, USD/tấn)
function fetchLMEFallback_(){
  try {
    const html = UrlFetchApp.fetch('https://www.westmetall.com/en/markdaten.php?action=table&field=LME_Al_cash',
      { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } }).getContentText();
    const m = html.match(/<td[^>]*>\s*\d{2}\.\s*\w+\s*\d{4}\s*<\/td>\s*<td[^>]*>\s*([\d,]+\.?\d*)\s*<\/td>/);
    return m ? parseFloat(m[1].replace(/,/g, '')) : null;
  } catch (e){ return null; }
}
// Dự phòng SHFE: file .dat công khai (close của hợp đồng nhôm gần nhất, CNY/tấn)
function fetchSHFEFallback_(){
  try {
    for (var back = 0; back < 2; back++){ // chỉ lùi 2 ngày — tránh treo lâu
      const d = new Date(Date.now() - back * 86400000);
      const ds = Utilities.formatDate(d, 'GMT+8', 'yyyyMMdd');
      const r = fetchJson_('https://www.shfe.com.cn/data/tradedata/future/dailydata/kx' + ds + '.dat');
      if (!r || !r.o_curinstrument) continue;
      const al = r.o_curinstrument.filter(x => String(x.PRODUCTID).indexOf('al_f') === 0 && x.CLOSEPRICE > 0);
      if (al.length) return parseFloat(al[0].CLOSEPRICE);
    }
  } catch (e){}
  return null;
}

// Chạy hằng ngày ~12h trưa VN (sau khi SMM công bố 10:30 VN). Ghi/cập nhật 1 dòng/ngày.
// CHỐNG TIMEOUT (sửa 10/06): một số nguồn có thể TREO khi gọi từ máy chủ Google (chặn IP datacenter),
// mỗi request treo ~60s → quá giới hạn 6 phút. Giải pháp: quỹ thời gian — hết quỹ thì BỎ QUA nguồn
// còn lại và ghi những gì đã lấy được. Chạy testMarketSources để biết đích danh nguồn nào treo.
function fetchMarketPrices(){
  const t0 = Date.now();
  const leftMs = () => 270000 - (Date.now() - t0); // quỹ 4.5 phút (chừa 1.5 phút an toàn)
  const step = (name, fn) => {
    if (leftMs() < 75000){ Logger.log('⏭ BỎ QUA ' + name + ' — hết quỹ thời gian'); return null; }
    const s = Date.now();
    try {
      const v = fn();
      Logger.log((v != null ? '✓ ' : '✗ ') + name + ' (' + Math.round((Date.now() - s) / 1000) + 's)');
      return v;
    } catch (e){ Logger.log('✗ ' + name + ' lỗi: ' + e.message + ' (' + Math.round((Date.now() - s) / 1000) + 's)'); return null; }
  };
  const fx   = step('Tỷ giá (GOOGLEFINANCE)', fetchFxRates_) || { usd: null, cny: null };
  const smm  = step('SMM (worthwill)',  function(){ return wwCurrent_('smm'); });
  const lme  = step('LME (worthwill)',  function(){ return wwCurrent_('lme'); });
  const shfe = step('SHFE (worthwill)', function(){ return wwCurrent_('shfe'); });
  let lmeCash   = lme  ? parseFloat(lme.average || lme.end) : null;
  let shfeClose = shfe ? parseFloat(shfe.close_price || shfe.settlement_price) : null;
  if (lmeCash == null)   lmeCash   = step('LME dự phòng (westmetall)',  fetchLMEFallback_);
  if (shfeClose == null) shfeClose = step('SHFE dự phòng (shfe.com.cn)', fetchSHFEFallback_);
  const smmAvg  = smm ? parseFloat(smm.average)   : null;
  const smmMove = smm ? parseFloat(smm.move || 0) : null;
  writeMarketRow_({ lme: lmeCash, shfe: shfeClose, smm: smmAvg, smmMove: smmMove, usd: fx.usd, cny: fx.cny });
  Logger.log('KẾT QUẢ: LME=' + lmeCash + ' SHFE=' + shfeClose + ' SMM=' + smmAvg + ' USD=' + fx.usd + ' CNY=' + fx.cny + ' — tổng ' + Math.round((Date.now() - t0) / 1000) + 's');
}

// Ghi/cập nhật dòng giá của HÔM NAY vào tab MARKET_PRICES (giữ giá trị cũ nếu giá mới null)
function writeMarketRow_(v){
  const ss = ss_();
  let sh = ss.getSheetByName(MARKET_SHEET);
  if (!sh){
    sh = ss.insertSheet(MARKET_SHEET);
    sh.appendRow(['date', 'lme_usd', 'shfe_cny', 'smm_cny', 'smm_move', 'smm_usd', 'usd_vnd', 'cny_vnd', 'fetched_at']);
    sh.setFrozenRows(1);
  }
  const smmUsd = (v.smm != null && v.usd && v.cny) ? Math.round(v.smm * v.cny / v.usd * 10) / 10 : null;
  const today = Utilities.formatDate(new Date(), 'GMT+7', 'yyyy-MM-dd');
  let row = [today, v.lme, v.shfe, v.smm, v.smmMove, smmUsd, v.usd, v.cny, Utilities.formatDate(new Date(), 'GMT+7', 'HH:mm')];
  const last = sh.getLastRow();
  if (last > 1 && String(sh.getRange(last, 1).getValue()).slice(0, 10) === today){
    // cùng ngày → ghi đè, nhưng KHÔNG xóa giá trị cũ bằng null (nguồn tạm chết vẫn giữ số buổi trước)
    const old = sh.getRange(last, 1, 1, row.length).getValues()[0];
    row = row.map(function(x, i){ return (x == null || x === '') ? old[i] : x; });
    sh.getRange(last, 1, 1, row.length).setValues([row]);
  } else {
    sh.appendRow(row);
  }
  return { ok: true, msg: 'Đã ghi giá ngày ' + today };
}

// ═══ R3: BACKFILL lịch sử giá (chạy tay 1 lần; chạy lại = xóa & dựng lại các dòng backfill) ═══
// SỬA so với R2 (anh Huy phát hiện SMM quá khứ cao bất thường):
//  1. Quy đổi SMM→USD bằng TỶ GIÁ LỊCH SỬ TỪNG NGÀY (USD/CNY từ API Frankfurter/ECB) — không dùng tỷ giá hôm nay
//     (tỷ lệ SMM¥/LME$ đổi từ 7.8 → 6.6 trong 9 tháng, dùng tỷ giá nay làm SMM cũ bị thổi phồng 10-18%).
//  2. LME ưu tiên bảng cash settlement CHÍNH THỐNG Westmetall (worthwill thấp hơn ~1-3%), thiếu mới dùng worthwill.
function backfillMarketHistory(){
  const tz = ss_().getSpreadsheetTimeZone();
  const iso = v => Utilities.formatDate(v instanceof Date ? v : new Date(v), tz, 'yyyy-MM-dd');
  // 1) Giá lịch sử từ worthwill
  const get = kind => { const r = fetchJson_(WW_API + kind); return (r && r.data && r.data.historical) ? r.data.historical : []; };
  const num = v => { const f = parseFloat(String(v).replace(/,/g, '')); return isNaN(f) ? null : f; };
  const byDate = {};
  get('smm').forEach(h => { const d = String(h.date).slice(0, 10); if (!d) return; (byDate[d] = byDate[d] || {}).smm = num(h.average); byDate[d].smmMove = num(h.move); });
  get('lme').forEach(h => { const d = String(h.date).slice(0, 10); if (!d) return; (byDate[d] = byDate[d] || {}).lmeWW = num(h.average || h.end); });
  get('shfe').forEach(h => { const d = String(h.date).slice(0, 10); if (!d) return; (byDate[d] = byDate[d] || {}).shfe = num(h.close_price || h.settlement_price); });
  // 2) LME chính thống từ Westmetall (toàn bộ bảng)
  const wmLME = {};
  try {
    const html = UrlFetchApp.fetch('https://www.westmetall.com/en/markdaten.php?action=table&field=LME_Al_cash',
      { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } }).getContentText();
    const MON = { January:1, February:2, March:3, April:4, May:5, June:6, July:7, August:8, September:9, October:10, November:11, December:12 };
    const re = /<td >(\d{2})\.\s*(\w+)\s*(\d{4})<\/td>\s*<td >([\d,.]+)<\/td>/g; let m;
    while ((m = re.exec(html)) !== null){
      if (MON[m[2]]) wmLME[m[3] + '-' + ('0' + MON[m[2]]).slice(-2) + '-' + m[1]] = parseFloat(m[4].replace(/,/g, ''));
    }
  } catch (e){ Logger.log('⚠ Westmetall lỗi (' + e.message + ') — dùng LME worthwill'); }
  // 3) Tỷ giá LỊCH SỬ — v2.2: BỎ GOOGLEFINANCE (lỗi #ERROR! do locale tiếng Việt của sheet
  // dùng dấu ; trong công thức). Dùng API Frankfurter (tỷ giá ECB, miễn phí, JSON, thân thiện IP Google):
  // USD→CNY lịch sử là đủ để quy SMM→USD. Cột usd_vnd/cny_vnd của dòng backfill để trống
  // (app tự suy tỷ lệ từ smm_usd/smm_cny cùng dòng khi cần quy đổi SHFE).
  const ss = ss_();
  const fxh0 = ss.getSheetByName('FX_HELPER');
  if (fxh0){ try { fxh0.getRange('D1:K600').clearContent(); } catch (e){} } // dọn công thức #ERROR! cũ
  let ucMap = {};
  try {
    const fr = fetchJson_('https://api.frankfurter.dev/v1/2025-08-01..?base=USD&symbols=CNY');
    if (fr && fr.rates) Object.keys(fr.rates).forEach(d => { const v = parseFloat(fr.rates[d].CNY); if (v > 0) ucMap[d] = v; });
  } catch (e){}
  const dUC = Object.keys(ucMap).sort();
  const haveUC = dUC.length > 10;
  Logger.log('FX lịch sử USD→CNY (Frankfurter/ECB): ' + dUC.length + ' ngày' + (haveUC ? ' (' + dUC[0] + ' → ' + dUC[dUC.length - 1] + ')' : ''));
  const fxAt = (d, map, ds) => { let best = null; for (var i = 0; i < ds.length; i++){ if (ds[i] <= d) best = map[ds[i]]; else break; } return best; };
  let fxNow = null;
  if (!haveUC){
    fxNow = fetchFxRates_();
    if (!fxNow.usd){ Logger.log('✗ Không lấy được tỷ giá nào — dừng. Thử chạy lại sau vài phút.'); return; }
    Logger.log('⚠ Frankfurter không trả dữ liệu — dùng tỷ giá HÔM NAY cho quá khứ (XẤP XỈ, SMM cũ có thể lệch vài %).');
  }
  // 4) Dựng lại sheet: GIỮ dòng daily (fetched_at là giờ), XÓA dòng backfill cũ, thêm bản mới
  let sh = ss.getSheetByName(MARKET_SHEET);
  if (!sh){
    sh = ss.insertSheet(MARKET_SHEET);
    sh.appendRow(['date', 'lme_usd', 'shfe_cny', 'smm_cny', 'smm_move', 'smm_usd', 'usd_vnd', 'cny_vnd', 'fetched_at']);
    sh.setFrozenRows(1);
  }
  const all = sh.getDataRange().getValues();
  const header = all[0];
  const kept = []; const keptDates = {};
  for (var r = 1; r < all.length; r++){
    if (String(all[r][8]).indexOf('backfill') === 0) continue; // bỏ mọi dòng backfill cũ
    kept.push(all[r]); keptDates[iso(all[r][0])] = true;
  }
  const newRows = [];
  Object.keys(byDate).sort().slice(-220).forEach(d => {
    if (keptDates[d]) return;
    const v = byDate[d];
    const lme = (wmLME[d] != null) ? wmLME[d] : v.lmeWW;
    let usd = null, cny = null, smmUsd = null, tag = 'backfill-usdcny';
    if (haveUC){
      const uc = fxAt(d, ucMap, dUC);
      if (v.smm != null && uc) smmUsd = Math.round(v.smm / uc * 10) / 10; // USD/CNY lịch sử từng ngày (ECB)
    } else if (fxNow && fxNow.usd && fxNow.cny){
      usd = fxNow.usd; cny = fxNow.cny;
      if (v.smm != null) smmUsd = Math.round(v.smm * cny / usd * 10) / 10;
      tag = 'backfill-fxnay'; // tỷ giá hôm nay — xấp xỉ
    }
    newRows.push([d, lme || null, v.shfe || null, v.smm || null, v.smmMove || null, smmUsd, usd, cny, tag]);
  });
  const merged = kept.concat(newRows).sort((a, b) => (iso(a[0]) < iso(b[0]) ? -1 : 1));
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, header.length).clearContent();
  if (merged.length) sh.getRange(2, 1, merged.length, header.length).setValues(merged);
  Logger.log('✓ Backfill v2.2 (' + (haveUC ? 'tỷ giá USD/CNY lịch sử ECB ' + dUC.length + ' ngày' : 'tỷ giá HÔM NAY — xấp xỉ') + '): ' + newRows.length + ' dòng mới, LME Westmetall ' + Object.keys(wmLME).length + ' ngày, giữ ' + kept.length + ' dòng daily.');
}

// ═══ R3: THẨM ĐỊNH dữ liệu giá — chạy tay, xem Nhật ký thực thi ═══
// So LME worthwill vs Westmetall (chuẩn cash settlement) các ngày trùng + soát tỷ lệ SMM/LME bất thường.
function verifyMarketHistory(){
  const r = fetchJson_(WW_API + 'lme');
  const ww = {}; ((r && r.data && r.data.historical) || []).forEach(h => { const f = parseFloat(h.average || h.end); if (f) ww[String(h.date).slice(0, 10)] = f; });
  const html = UrlFetchApp.fetch('https://www.westmetall.com/en/markdaten.php?action=table&field=LME_Al_cash',
    { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } }).getContentText();
  const MON = { January:1, February:2, March:3, April:4, May:5, June:6, July:7, August:8, September:9, October:10, November:11, December:12 };
  const re = /<td >(\d{2})\.\s*(\w+)\s*(\d{4})<\/td>\s*<td >([\d,.]+)<\/td>/g; let m; const wm = {};
  while ((m = re.exec(html)) !== null){ if (MON[m[2]]) wm[m[3] + '-' + ('0' + MON[m[2]]).slice(-2) + '-' + m[1]] = parseFloat(m[4].replace(/,/g, '')); }
  const common = Object.keys(ww).filter(d => wm[d]).sort().slice(-30);
  if (!common.length){ Logger.log('✗ Không có ngày trùng để so'); return; }
  let sum = 0, worst = 0, worstD = '';
  common.forEach(d => { const diff = ww[d] - wm[d]; sum += Math.abs(diff); if (Math.abs(diff) > Math.abs(worst)){ worst = diff; worstD = d; } });
  Logger.log('LME worthwill vs Westmetall (' + common.length + ' ngày gần nhất): lệch TB ' + Math.round(sum / common.length) + ' $/t, lệch lớn nhất ' + Math.round(worst) + ' $/t (' + worstD + ')');
  Logger.log('→ Backfill đã ưu tiên số Westmetall; lệch <120 $/t (~3%) là bình thường (worthwill lấy trung bình phiên, WM lấy cash settlement).');
  // Soát MARKET_PRICES: tỷ lệ smm_cny/lme_usd phải nằm trong 6.0–8.5
  const sh = ss_().getSheetByName(MARKET_SHEET);
  if (sh && sh.getLastRow() > 1){
    const data = sh.getDataRange().getValues(); let bad = 0;
    for (var i = 1; i < data.length; i++){
      const lme = parseFloat(data[i][1]), smm = parseFloat(data[i][3]);
      if (lme > 0 && smm > 0){ const ratio = smm / lme; if (ratio < 6.0 || ratio > 8.5) bad++; }
    }
    Logger.log(bad === 0 ? '✓ Tỷ lệ SMM¥/LME$ toàn bộ dữ liệu trong vùng hợp lý 6.0–8.5' : ('⚠ ' + bad + ' dòng có tỷ lệ SMM/LME bất thường — kiểm tra tay tab MARKET_PRICES'));
  }
}

// CHẨN ĐOÁN: chạy hàm này để biết nguồn nào sống/chết/treo từ máy chủ Google (xem Nhật ký thực thi)
function testMarketSources(){
  const tests = [
    ['Tỷ giá GOOGLEFINANCE', function(){ const r = fetchFxRates_(); return r && r.usd ? 'USD=' + r.usd + ' CNY=' + Math.round(r.cny) + ' (' + r.src + ')' : null; }],
    ['SMM (worthwill)',     function(){ const r = wwCurrent_('smm');  return r ? r.date + ' avg=' + r.average : null; }],
    ['LME (worthwill)',     function(){ const r = wwCurrent_('lme');  return r ? r.date + ' avg=' + r.average : null; }],
    ['SHFE (worthwill)',    function(){ const r = wwCurrent_('shfe'); return r ? r.date + ' close=' + r.close_price : null; }],
    ['LME westmetall',      function(){ return fetchLMEFallback_(); }],
    ['SHFE shfe.com.cn',    function(){ return fetchSHFEFallback_(); }],
  ];
  tests.forEach(function(tt){
    const s = Date.now();
    try {
      const v = tt[1]();
      Logger.log((v != null ? '✓ SỐNG  ' : '✗ KHÔNG DỮ LIỆU  ') + tt[0] + ' → ' + v + ' (' + Math.round((Date.now() - s) / 1000) + 's)');
    } catch (e){
      Logger.log('✗ LỖI  ' + tt[0] + ': ' + e.message + ' (' + Math.round((Date.now() - s) / 1000) + 's)');
    }
  });
}

// App đọc giá: GET <url>?action=market&secret=...  → {ok, rows:[{date,lme_usd,...}]} (mới nhất TRƯỚC)
function doGet(e){
  const p = (e && e.parameter) || {};
  if (p.secret !== props_().getProperty('SECRET')) return json_({ ok: false, error: 'Sai mã bí mật' });
  if (p.action === 'market'){
    const sh = ss_().getSheetByName(MARKET_SHEET);
    if (!sh || sh.getLastRow() < 2) return json_({ ok: true, rows: [] });
    const data = sh.getDataRange().getValues();
    const H = data[0];
    const n = Math.min(parseInt(p.n) || 30, data.length - 1);
    const rows = data.slice(-n).reverse().map(r => { const o = {}; H.forEach((h, i) => o[h] = r[i] instanceof Date ? Utilities.formatDate(r[i], 'GMT+7', 'yyyy-MM-dd') : r[i]); return o; });
    return json_({ ok: true, rows: rows });
  }
  return json_({ ok: false, error: 'Action không hợp lệ' });
}

// 4) R2: Premium ĐỘNG theo quy cách — cảnh báo khi premium đợt CIF MỚI NHẤT của 1 quy cách
// cao hơn premium TRUNG BÌNH các đợt trước của CHÍNH quy cách đó > CIF_ALERT_PCT % (mặc định 10).
// premium_i = priceFC_i − SMM quy đổi USD tại ngày đợt i (đọc tab MARKET_PRICES — cần backfill).
function alertCIFvsMarket_(alerts){
  const sh = ss_().getSheetByName(MARKET_SHEET);
  if (!sh || sh.getLastRow() < 2) return;
  const md = sh.getDataRange().getValues();
  const Hm = md[0];
  const cD = Hm.indexOf('date'), cS = Hm.indexOf('smm_usd');
  if (cD < 0 || cS < 0) return;
  const smmSeries = [];
  for (var i = 1; i < md.length; i++){
    const d = md[i][cD] instanceof Date ? Utilities.formatDate(md[i][cD], 'GMT+7', 'yyyy-MM-dd') : String(md[i][cD]).slice(0, 10);
    const v = parseFloat(md[i][cS]);
    if (d && !isNaN(v) && v > 0) smmSeries.push({ d: d, v: v });
  }
  if (!smmSeries.length) return;
  smmSeries.sort(function(a, b){ return a.d < b.d ? -1 : 1; });
  const smmAt = function(iso){ var best = null; for (var x = 0; x < smmSeries.length; x++){ if (smmSeries[x].d <= iso) best = smmSeries[x].v; else break; } return best != null ? best : smmSeries[0].v; };

  const ui = sheetByGid_(GID_UPDATED_IMPORT).getDataRange().getValues();
  const Hu = ui[0];
  const uD = colIdx_(Hu, ['updatedate', 'update date', 'ngaycapnhat']),
        uA = colIdx_(Hu, ['alloy', 'mac']), uT = colIdx_(Hu, ['temper']),
        uMin = colIdx_(Hu, ['minthick', 'min thick']), uMax = colIdx_(Hu, ['maxthick', 'max thick']),
        uF = colIdx_(Hu, ['pricefc', 'price fc', 'giacif']);
  if (uF < 0 || uD < 0) return;
  const toIso = function(v){
    if (v instanceof Date) return Utilities.formatDate(v, 'GMT+7', 'yyyy-MM-dd');
    const m = String(v || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : null;
  };
  const groups = {};
  for (var r = 1; r < ui.length; r++){
    const cif = parseFloat(ui[r][uF]) || 0; if (cif <= 0) continue;
    const iso = toIso(ui[r][uD]); if (!iso) continue;
    const key = [ui[r][uA], ui[r][uT], ui[r][uMin], ui[r][uMax]].join('|');
    (groups[key] = groups[key] || []).push({ iso: iso, cif: cif, label: ui[r][uA] + ' ' + ui[r][uT] + ' ' + ui[r][uMin] + '-' + ui[r][uMax] + 'mm' });
  }
  const pct = parseFloat(props_().getProperty('CIF_ALERT_PCT')) || 10;
  const over = [];
  Object.keys(groups).forEach(function(key){
    const es = groups[key].sort(function(a, b){ return a.iso < b.iso ? -1 : 1; });
    if (es.length < 2) return; // cần ít nhất 2 đợt mới so được xu hướng
    const prems = es.map(function(e){ return e.cif - smmAt(e.iso); });
    const last = prems[prems.length - 1];
    const prior = prems.slice(0, -1);
    const avg = prior.reduce(function(a, b){ return a + b; }, 0) / prior.length;
    if (avg > 0 && (last - avg) / avg * 100 > pct){
      over.push(es[es.length - 1].label + ': premium đợt mới <b>' + Math.round(last) + ' $/t</b> vs TB trước ' + Math.round(avg) + ' $/t (+' + ((last - avg) / avg * 100).toFixed(1) + '%)');
    }
  });
  if (over.length) alerts.push('📈 <b>' + over.length + ' quy cách bị NCC tăng premium &gt;' + pct + '%</b> so các đợt trước:<br>• ' + over.join('<br>• '));
}

// ── HÀM DÒ NHANH: chạy hàm này đầu tiên khi gặp "lỗi không xác định".
// Nếu CHÍNH NÓ cũng lỗi → vấn đề ở phiên đăng nhập/hạ tầng Google, KHÔNG phải code.
function testNhanh(){
  Logger.log('✓ Apps Script chạy bình thường lúc ' + new Date());
  Logger.log('✓ Đọc được spreadsheet: ' + ss_().getName());
}
