// HD Steel CRM — Nhắc việc tự động qua Lark bot (chạy theo lịch).
// Mỗi sáng quét Lead / Cơ hội (báo giá) / Công nợ, gom theo CBKD phụ trách,
// rồi gửi tin nhắn thẻ (interactive card) tới từng người qua Lark.
//
// Lịch chạy: cấu hình trong netlify.toml ([functions."reminders"] schedule = "0 1 * * *" = 08:00 giờ VN).
// Yêu cầu quyền (scope) Lark: im:message:send_as_bot (bật Bot cho app + phát hành lại).
// Env dùng: LARK_APP_ID, LARK_APP_SECRET, LARK_BASE_APP_TOKEN, (tùy chọn) REMINDER_KEY để chạy thử thủ công.

const https = require('https');

const LARK_HOST = 'open.larksuite.com';
const APP_TOKEN = process.env.LARK_BASE_APP_TOKEN || 'Yn1PbV03Da4vPzsW4ZEll6kzgGe';

const TBL = {
  customers    : 'tblM6Dal01bggxPA',
  opportunities: 'tbl37VKuIq1J0exL',
  receivables  : 'tblK1Edi7LuxvkK1',
  lead         : 'tblbcTihMe0QLAI6'
};

const SOON_DAYS = 3;        // "sắp đến hạn" trong vòng 3 ngày
const STALE_DAYS = 30;      // bỏ qua việc quá hạn quá lâu cho gọn (công nợ nới rộng hơn)
const OPP_OPEN = ['Mới Tiếp Nhận', 'Đang Tính Giá', 'Đã Gửi Báo Giá'];
const MAX_PER_CAT = 8;      // tối đa số dòng liệt kê mỗi nhóm trong tin nhắn

// ---------- HTTP ----------
function larkRequest(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : '';
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
    };
    const req = https.request({ hostname: LARK_HOST, path, method, headers }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { resolve({ raw: data }); } });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function getToken() {
  const res = await larkRequest('POST', '/open-apis/auth/v3/tenant_access_token/internal', {
    app_id: process.env.LARK_APP_ID, app_secret: process.env.LARK_APP_SECRET
  }, null);
  if (!res.tenant_access_token) throw new Error('Cannot get token: ' + JSON.stringify(res));
  return res.tenant_access_token;
}

async function scanAll(tableId, token) {
  let items = [], pt = null, guard = 0;
  do {
    const path = `/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${tableId}/records/search?page_size=500${pt ? `&page_token=${pt}` : ''}`;
    const r = await larkRequest('POST', path, {}, token);
    if (r.code !== 0) return { error: r };
    items = items.concat((r.data && r.data.items) || []);
    pt = r.data && r.data.has_more ? r.data.page_token : null;
    guard++;
  } while (pt && guard < 40);
  return { items };
}

// ---------- đọc field ----------
function getText(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map(x => (x && typeof x === 'object') ? (x.text ?? x.name ?? x.value ?? '') : x).join('');
  if (v.text !== undefined) return v.text;
  if (v.value !== undefined) return getText(v.value);
  if (v.name !== undefined) return v.name;
  return '';
}
function getNum(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const n = parseFloat(v.replace(/[^\d.-]/g, '')); return isNaN(n) ? 0 : n; }
  if (Array.isArray(v)) return getNum(v[0]);
  if (v.value !== undefined) return getNum(Array.isArray(v.value) ? v.value[0] : v.value);
  return 0;
}
function getDateTs(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  if (Array.isArray(v)) return getDateTs(v[0]);
  if (v.value !== undefined) return getDateTs(Array.isArray(v.value) ? v.value[0] : v.value);
  return null;
}
function getSelect(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(x => (x && x.name) || x).join(', ');
  if (v.value !== undefined) return getText(v);
  return '';
}
function linkIds(v) { return (v && Array.isArray(v.link_record_ids)) ? v.link_record_ids : []; }
// Trường người (User): lấy open_id (id) của người đầu tiên
function personId(v) { if (Array.isArray(v) && v[0] && v[0].id) return v[0].id; return null; }
function personName(v) { if (Array.isArray(v) && v[0]) return v[0].name || v[0].en_name || ''; return ''; }

// ---------- ngày (giờ Việt Nam) ----------
function bangkokTodayStart() {
  const now = Date.now();
  const bkk = new Date(now + 7 * 3600 * 1000);
  return Date.UTC(bkk.getUTCFullYear(), bkk.getUTCMonth(), bkk.getUTCDate()) - 7 * 3600 * 1000;
}
const TODAY = bangkokTodayStart();
function dayDiff(ts) { return Math.round((ts - TODAY) / 86400000); }
function dateLabel(d) { if (d < 0) return `quá hạn ${Math.abs(d)} ngày`; if (d === 0) return 'hôm nay'; if (d === 1) return 'ngày mai'; return `còn ${d} ngày`; }
function fmtShort(n) { n = Math.round(n || 0); const a = Math.abs(n); if (a >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, '') + ' tỷ'; if (a >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + ' tr'; return new Intl.NumberFormat('vi-VN').format(n) + '₫'; }
function khName(full, short) { return short || full || ''; }

// ---------- gom việc theo người ----------
async function collect(token) {
  // map khách hàng -> tên + chủ sở hữu (để suy chủ công nợ)
  const custRes = await scanAll(TBL.customers, token);
  if (custRes.error) throw new Error('customers: ' + JSON.stringify(custRes.error));
  const cust = {};
  custRes.items.forEach(it => {
    const f = it.fields || {};
    cust[it.record_id] = {
      name: khName(getText(f['TÊN KHÁCH HÀNG']), getText(f['Tên KH viết tắt'])),
      ownerId: personId(f['KD phụ trách']),
      ownerName: personName(f['KD phụ trách'])
    };
  });

  const byOwner = {}; // openId -> { name, items:[{cat,line,d}] }
  const add = (ownerId, ownerName, cat, line, d) => {
    if (!ownerId) return; // không có open_id thì không nhắn được
    if (!byOwner[ownerId]) byOwner[ownerId] = { name: ownerName || '', items: [] };
    if (ownerName && !byOwner[ownerId].name) byOwner[ownerId].name = ownerName;
    byOwner[ownerId].items.push({ cat, line, d });
  };

  // 1) Lead cần xử lý
  const leadRes = await scanAll(TBL.lead, token);
  if (!leadRes.error) leadRes.items.forEach(it => {
    const f = it.fields || {};
    const tt = getSelect(f['Trạng thái Lead']);
    if (tt === 'Đã chuyển đổi' || tt === 'Loại') return;
    const oid = personId(f['CBKD xử lý']), onm = personName(f['CBKD xử lý']);
    const ten = getText(f['Tên Doanh nghiệp/ Người gọi']) || getText(f['Tên người gọi']) || '(lead chưa tên)';
    const sdt = getText(f['Số điện thoại người gọi']);
    const hen = getDateTs(f['Ngày hẹn gọi lại']);
    if (hen) { const d = dayDiff(hen); if (d <= SOON_DAYS && d >= -STALE_DAYS) add(oid, onm, 'lead', `${ten}${sdt ? ' (' + sdt + ')' : ''} — hẹn gọi lại ${dateLabel(d)}`, d); }
    else if (tt === 'Mới') { add(oid, onm, 'lead', `${ten}${sdt ? ' (' + sdt + ')' : ''} — lead mới chưa xử lý`, -1); }
  });

  // 2) Báo giá sắp / đã hết hạn (cơ hội đang mở)
  const oppRes = await scanAll(TBL.opportunities, token);
  if (!oppRes.error) oppRes.items.forEach(it => {
    const f = it.fields || {};
    if (!OPP_OPEN.includes(getSelect(f['Trạng Thái Báo Giá']))) return;
    const ts = getDateTs(f['Ngày hết hạn báo giá']); if (!ts) return;
    const d = dayDiff(ts); if (d > SOON_DAYS || d < -STALE_DAYS) return;
    const oid = personId(f['CBKD Phụ Trách']), onm = personName(f['CBKD Phụ Trách']);
    const ids = linkIds(f['Khách hàng']);
    const kh = (ids[0] && cust[ids[0]] && cust[ids[0]].name) || getText(f['Cơ hội số']) || '(cơ hội)';
    const gt = getNum(f['Doanh Số Dự Kiến']) || getNum(f['Tổng giá trị chưa VAT']);
    add(oid, onm, 'quote', `${kh}${gt ? ' · ' + fmtShort(gt) : ''} — báo giá hết hạn ${dateLabel(d)}`, d);
  });

  // 3) Công nợ quá hạn (còn dư nợ) — chủ sở hữu suy theo KH
  const recvRes = await scanAll(TBL.receivables, token);
  if (!recvRes.error) recvRes.items.forEach(it => {
    const f = it.fields || {};
    const duno = getNum(f['Dư nợ']); if (duno <= 0) return;
    const qh = getNum(f['Số ngày quá hạn']); const han = getDateTs(f['Hạn thanh toán']);
    let d = null;
    if (qh > 0) d = -qh; else if (han) { const dd = dayDiff(han); if (dd <= SOON_DAYS) d = dd; }
    if (d === null || d > SOON_DAYS) return;
    const ids = linkIds(f['Tên khách hàng']);
    const c = ids[0] && cust[ids[0]];
    const kh = (c && c.name) || '(KH)';
    add(c && c.ownerId, c && c.ownerName, 'debt', `${kh} · HĐ ${getText(f['Số hóa đơn'])} — còn nợ ${fmtShort(duno)} (${dateLabel(d)})`, d);
  });

  return byOwner;
}

// ---------- dựng thẻ tin nhắn ----------
const CAT_TITLE = { lead: '📥 Lead cần xử lý', quote: '🏷️ Báo giá sắp/đã hết hạn', debt: '💰 Công nợ quá hạn' };
function buildCard(name, items) {
  items.sort((a, b) => a.d - b.d);
  const active = items.filter(x => x.d <= 0).length;
  const soon = items.length - active;
  const elements = [
    { tag: 'div', text: { tag: 'lark_md', content: `**Chào ${name || 'bạn'},** hôm nay bạn có **${active}** việc cần làm ngay và **${soon}** việc sắp tới:` } }
  ];
  ['lead', 'quote', 'debt'].forEach(cat => {
    const sub = items.filter(x => x.cat === cat);
    if (!sub.length) return;
    let lines = sub.slice(0, MAX_PER_CAT).map(x => `• ${x.line}`).join('\n');
    if (sub.length > MAX_PER_CAT) lines += `\n• … và ${sub.length - MAX_PER_CAT} việc khác`;
    elements.push({ tag: 'hr' });
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: `**${CAT_TITLE[cat]}** (${sub.length})\n${lines}` } });
  });
  elements.push({ tag: 'hr' });
  elements.push({ tag: 'note', elements: [{ tag: 'plain_text', content: 'Mở HD Steel CRM → mục 🔔 Nhắc việc để xử lý chi tiết.' }] });
  return {
    config: { wide_screen_mode: true },
    header: { template: active > 0 ? 'red' : 'blue', title: { tag: 'plain_text', content: '🔔 Nhắc việc hôm nay — HD Steel CRM' } },
    elements
  };
}

async function sendCard(token, openId, card) {
  return larkRequest('POST', '/open-apis/im/v1/messages?receive_id_type=open_id', {
    receive_id: openId, msg_type: 'interactive', content: JSON.stringify(card)
  }, token);
}

// ---------- handler ----------
exports.handler = async (event) => {
  // Cho phép chạy thử thủ công: /.netlify/functions/reminders?key=<REMINDER_KEY>&dry=1
  const q = (event && event.queryStringParameters) || {};
  const manual = !!q.key;
  if (manual && (!process.env.REMINDER_KEY || q.key !== process.env.REMINDER_KEY)) {
    return { statusCode: 403, body: 'Forbidden' };
  }
  const dryRun = q.dry === '1';

  try {
    const token = await getToken();
    const byOwner = await collect(token);
    const owners = Object.keys(byOwner);

    let sent = 0;
    const report = [];
    for (const oid of owners) {
      const o = byOwner[oid];
      if (!o.items.length) continue;
      report.push({ owner: o.name || oid, count: o.items.length });
      if (!dryRun) {
        const r = await sendCard(token, oid, buildCard(o.name, o.items));
        if (r.code === 0) sent++;
        else report[report.length - 1].error = r.msg || JSON.stringify(r);
      }
    }

    const summary = { ok: true, dryRun, owners: owners.length, sent, report };
    if (manual) return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(summary, null, 2) };
    return { statusCode: 200, body: JSON.stringify(summary) };
  } catch (e) {
    const msg = 'reminders error: ' + (e && e.message);
    if (manual) return { statusCode: 500, body: msg };
    return { statusCode: 500, body: msg };
  }
};
