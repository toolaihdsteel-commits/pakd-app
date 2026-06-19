// HD Steel CRM — Lark Base Proxy CÓ PHÂN QUYỀN
// - Xác thực người dùng qua session cookie (đăng nhập Lark OAuth).
// - Nhân viên: chỉ thấy bản ghi mình phụ trách. Quản lý (MANAGER_OPEN_IDS): thấy tất cả.
// Env: LARK_APP_ID, LARK_APP_SECRET, LARK_BASE_APP_TOKEN, SESSION_SECRET, MANAGER_OPEN_IDS

const https = require('https');
const crypto = require('crypto');

const LARK_HOST = 'open.larksuite.com';
const APP_TOKEN = process.env.LARK_BASE_APP_TOKEN || 'Yn1PbV03Da4vPzsW4ZEll6kzgGe';

const TBL = {
  transactions : 'tblJQ0Zc4KenRsKX',
  customers    : 'tblM6Dal01bggxPA',
  opportunities: 'tbl37VKuIq1J0exL',
  receivables  : 'tblK1Edi7LuxvkK1',
  lead         : 'tblbcTihMe0QLAI6',
  salesorders  : 'tblVhav5PJURlIvj',
  payments     : 'tbl3u8y5yTQvi1cQ',
  quotelines   : 'tblcREyfoTeBslEi'
};

// Quản lý mặc định (nhúng trong code → push là có hiệu lực, không cần sửa Netlify).
// Có thể bổ sung thêm qua biến môi trường MANAGER_OPEN_IDS (cách nhau dấu phẩy).
const DEFAULT_MANAGER_OPEN_IDS = [
  'ou_08108c59c04146d7e75f5ac81f3db6de', // Phạm Ngọc Huy (S162)
  'ou_d3851940ff5f7b9eac4db863bd917096', // Hồ Đại Dương (D001)
  'ou_f9c601129f224d3d3acc9d0c021353e1', // Đặng Thị Hoàng Liên (D002)
  'ou_be4a318aefd3a7cb6692ef10e33e630b', // Nguyễn Thu Hương (S135)
  'ou_48e72a79a4b4f1c7a9b511a5f7c9f0ad'  // Nguyễn Duy Tân (S095)
];
// Bảng có trường người phụ trách (User) → lọc trực tiếp bằng điều kiện server
const OWNER_FIELD = {
  [TBL.transactions] : 'CBKD phụ trách',
  [TBL.customers]    : 'KD phụ trách',
  [TBL.opportunities]: 'CBKD Phụ Trách',
  [TBL.lead]         : 'CBKD xử lý'
};
// Bảng không có trường người phụ trách → lọc theo KH mình phụ trách qua trường link KH
const CUST_LINK_FIELD = {
  [TBL.receivables] : 'Tên khách hàng'
};
// ⚠️ Bảng II.6 (Đơn hàng bán) bị lỗi: records/search KHÔNG kèm view_id → Lark trả 500.
// Bắt buộc truyền view_id của view lưới để đọc được. (Các bảng khác không cần.)
const VIEW_ID = {
  [TBL.salesorders] : 'vewTTfxNa0'
};

function larkRequest(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : '';
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
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

function verifySession(cookieHeader) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  const token = (String(cookieHeader || '').match(/hd_session=([^;]+)/) || [])[1];
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expect = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  if (sig !== expect) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (p.exp && Date.now() > p.exp) return null;
    return p;
  } catch (e) { return null; }
}

function isManager(openId) {
  const env = String(process.env.MANAGER_OPEN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  const list = new Set([...DEFAULT_MANAGER_OPEN_IDS, ...env]);
  return list.has(openId);
}

function addOwnerCondition(data, field, openId) {
  data = data || {};
  const cond = { field_name: field, operator: 'is', value: [openId] };
  if (data.filter && Array.isArray(data.filter.conditions)) {
    data.filter.conjunction = data.filter.conjunction || 'and';
    data.filter.conditions.push(cond);
  } else {
    data.filter = { conjunction: 'and', conditions: [cond] };
  }
  return data;
}

function searchPath(tableId, ps, pt) {
  return `/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${tableId}/records/search?page_size=${ps}${pt ? `&page_token=${pt}` : ''}`;
}

async function ownedCustomerIds(openId, token) {
  const ids = new Set();
  let pt = null, guard = 0;
  do {
    const body = { filter: { conjunction: 'and', conditions: [{ field_name: 'KD phụ trách', operator: 'is', value: [openId] }] }, field_names: [] };
    const r = await larkRequest('POST', searchPath(TBL.customers, 500, pt), body, token);
    if (r.code !== 0) break;
    (r.data && r.data.items || []).forEach(it => ids.add(it.record_id));
    pt = r.data && r.data.has_more ? r.data.page_token : null;
    guard++;
  } while (pt && guard < 30);
  return ids;
}

// Quét toàn bộ 1 bảng (giữ sort của client), trả về mảng items
async function scanAll(tableId, sort, token, viewId) {
  let items = [], pt = null, guard = 0;
  do {
    const body = {};
    // Lark không cho dùng sort cùng view_id → ưu tiên view_id (app tự sắp xếp ở client)
    if (viewId) body.view_id = viewId;
    else if (sort) body.sort = sort;
    const r = await larkRequest('POST', searchPath(tableId, 500, pt), body, token);
    if (r.code !== 0) return { error: r };
    items = items.concat(r.data && r.data.items || []);
    pt = r.data && r.data.has_more ? r.data.page_token : null;
    guard++;
  } while (pt && guard < 30);
  return { items };
}

// ID các cơ hội (II.3) mình phụ trách
async function ownedOpportunityIds(openId, token) {
  const ids = new Set();
  let pt = null, guard = 0;
  do {
    const body = { filter: { conjunction: 'and', conditions: [{ field_name: 'CBKD Phụ Trách', operator: 'is', value: [openId] }] }, field_names: [] };
    const r = await larkRequest('POST', searchPath(TBL.opportunities, 500, pt), body, token);
    if (r.code !== 0) break;
    (r.data && r.data.items || []).forEach(it => ids.add(it.record_id));
    pt = r.data && r.data.has_more ? r.data.page_token : null;
    guard++;
  } while (pt && guard < 30);
  return ids;
}

// Đơn hàng bán (II.6) coi là "của mình" nếu: gắn KH mình phụ trách (→ I.1) HOẶC gắn cơ hội mình phụ trách.
// (Dữ liệu thực tế: KH của đơn thường suy qua Cơ hội số, trường → I.1 hay trống.)
async function ownedOrderItems(openId, token) {
  const owned = await ownedCustomerIds(openId, token);
  const ownedOpps = await ownedOpportunityIds(openId, token);
  const r = await scanAll(TBL.salesorders, null, token, VIEW_ID[TBL.salesorders]);
  if (r.error) return { error: r.error };
  const items = (r.items || []).filter(it => {
    const f = it.fields || {};
    const c = (f['→ I.1 Hồ sơ đối tác'] && f['→ I.1 Hồ sơ đối tác'].link_record_ids) || [];
    const o = (f['Cơ hội số'] && f['Cơ hội số'].link_record_ids) || [];
    return c.some(id => owned.has(id)) || o.some(id => ownedOpps.has(id));
  });
  return { items };
}
async function ownedOrderIds(openId, token) {
  const r = await ownedOrderItems(openId, token);
  const ids = new Set();
  (r.items || []).forEach(it => ids.add(it.record_id));
  return ids;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (statusCode, obj) => ({ statusCode, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const sess = verifySession(event.headers.cookie);
  if (!sess) return json(401, { code: 401, needLogin: true, msg: 'Cần đăng nhập' });

  const openId = sess.open_id;
  const manager = isManager(openId);

  try {
    const { action, table_id, data, page_token, page_size, as_owner } = JSON.parse(event.body || '{}');

    if (action === 'whoami') {
      return json(200, { code: 0, data: { open_id: openId, name: sess.name || '', isManager: manager } });
    }

    // Quản lý có thể "xem theo nhân viên" (as_owner). Nhân viên thường KHÔNG được phép (bỏ qua as_owner).
    const effManager = (manager && !as_owner);
    const effOpenId = (manager && as_owner) ? as_owner : openId;

    const token = await getToken();
    const ps = page_size || 200;
    let path, result;

    // Danh sách nhân viên (cho dropdown lọc của quản lý) — đọc từ I.6
    if (action === 'members') {
      if (!manager) return json(200, { code: 0, data: { items: [] } });
      const r = await scanAll('tblxn98hancuLXN0', null, token);
      if (r.error) return json(200, r.error);
      const items = (r.items || []).map(it => {
        const f = it.fields || {};
        const db = f['Danh Bạ'];
        const u = Array.isArray(db) ? db[0] : null;
        if (!u || !u.id) return null;
        const ten = Array.isArray(f['Tên nhân viên']) ? (f['Tên nhân viên'][0] && f['Tên nhân viên'][0].text) : f['Tên nhân viên'];
        const ma = Array.isArray(f['Mã nhân viên']) ? (f['Mã nhân viên'][0] && f['Mã nhân viên'][0].text) : f['Mã nhân viên'];
        return { open_id: u.id, name: ten || u.name || '', code: ma || '' };
      }).filter(Boolean).sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi'));
      return json(200, { code: 0, data: { items } });
    }

    switch (action) {
      case 'search': {
        let body = data || {};
        const ownerField = OWNER_FIELD[table_id];
        const custLinkField = CUST_LINK_FIELD[table_id];

        // Đơn hàng bán (II.6): của mình nếu gắn KH hoặc cơ hội mình phụ trách
        if (table_id === TBL.salesorders && !effManager) {
          const r = await ownedOrderItems(effOpenId, token);
          if (r.error) return json(200, r.error);
          return json(200, { code: 0, data: { items: r.items, total: r.items.length, has_more: false } });
        }

        // Chi tiết báo giá (II.4): lọc theo cơ hội mình phụ trách
        if (table_id === TBL.quotelines && !effManager) {
          const ownedOpps = await ownedOpportunityIds(effOpenId, token);
          const r = await scanAll(table_id, body.sort, token);
          if (r.error) return json(200, r.error);
          const items = r.items.filter(it =>
            (((it.fields && it.fields['Cơ hội số'] && it.fields['Cơ hội số'].link_record_ids) || []).some(id => ownedOpps.has(id))));
          return json(200, { code: 0, data: { items, total: items.length, has_more: false } });
        }

        // Bảng lọc theo KH mình phụ trách (Phải thu IV.2)
        if (custLinkField && !effManager) {
          const owned = await ownedCustomerIds(effOpenId, token);
          const r = await scanAll(table_id, body.sort, token, VIEW_ID[table_id]);
          if (r.error) return json(200, r.error);
          const items = r.items.filter(it =>
            (((it.fields && it.fields[custLinkField] && it.fields[custLinkField].link_record_ids) || []).some(id => owned.has(id))));
          return json(200, { code: 0, data: { items, total: items.length, has_more: false } });
        }

        // Thu tiền (IV.3): lọc theo đơn hàng thuộc KH mình phụ trách
        if (table_id === TBL.payments && !effManager) {
          const ownedOrders = await ownedOrderIds(effOpenId, token);
          const r = await scanAll(table_id, body.sort, token);
          if (r.error) return json(200, r.error);
          const items = r.items.filter(it =>
            (((it.fields && it.fields['Số đơn hàng'] && it.fields['Số đơn hàng'].link_record_ids) || []).some(id => ownedOrders.has(id))));
          return json(200, { code: 0, data: { items, total: items.length, has_more: false } });
        }

        if (ownerField && !effManager) body = addOwnerCondition(body, ownerField, effOpenId);
        // view_id KHÔNG dùng được cùng sort/field_names → bỏ chúng (app tự lọc trường + sắp xếp)
        if (VIEW_ID[table_id]) { body.view_id = VIEW_ID[table_id]; delete body.sort; delete body.field_names; }

        path = searchPath(table_id, ps, page_token);
        result = await larkRequest('POST', path, body, token);
        break;
      }

      case 'create': {
        const fields = { ...(data || {}) };
        const ownerField = OWNER_FIELD[table_id];
        if (ownerField && fields[ownerField] == null) fields[ownerField] = [{ id: openId }];
        path = `/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${table_id}/records`;
        result = await larkRequest('POST', path, { fields }, token);
        break;
      }

      case 'update': {
        const { record_id, fields } = data;
        path = `/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${table_id}/records/${record_id}`;
        result = await larkRequest('PUT', path, { fields }, token);
        break;
      }

      default:
        return json(400, { error: 'Unknown action: ' + action });
    }

    return json(200, result);
  } catch (err) {
    console.error('Proxy error:', err);
    return json(500, { error: err.message });
  }
};
