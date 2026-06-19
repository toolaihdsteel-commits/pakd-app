// HD Steel CRM — Lark gọi lại sau khi đăng nhập (nhận "code")
// Đổi code -> app_access_token -> user_access_token (open_id, name), rồi tạo session cookie ký HMAC.
const https = require('https');
const crypto = require('crypto');

const HOST = 'open.larksuite.com';

function larkPost(path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname: HOST, path, method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(data), ...headers }
    };
    const req = https.request(options, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch (e) { resolve({ raw: buf }); } });
    });
    req.on('error', reject);
    req.write(data); req.end();
  });
}

function sign(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return body + '.' + sig;
}

function page(msg) {
  return `<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:40px;text-align:center">
  <h3>${msg}</h3><p><a href="/api/auth-login">Thử đăng nhập lại</a></p></body>`;
}
const htmlResp = (code, msg) => ({ statusCode: code, headers: { 'Content-Type': 'text/html; charset=utf-8' }, body: page(msg) });

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const code = q.code, state = q.state;
  const cookie = event.headers.cookie || '';
  const stateCookie = (cookie.match(/hd_state=([^;]+)/) || [])[1];

  if (!code) return htmlResp(400, 'Thiếu mã đăng nhập (code).');
  if (!state || state !== stateCookie) return htmlResp(400, 'Sai trạng thái đăng nhập (state). Vui lòng thử lại.');

  const secret = process.env.SESSION_SECRET;
  if (!secret) return htmlResp(500, 'Chưa cấu hình SESSION_SECRET trên Netlify.');

  try {
    const appTok = await larkPost('/open-apis/auth/v3/app_access_token/internal', {
      app_id: process.env.LARK_APP_ID, app_secret: process.env.LARK_APP_SECRET
    });
    if (!appTok.app_access_token) return htmlResp(500, 'Không lấy được app_access_token: ' + (appTok.msg || ''));

    const r = await larkPost('/open-apis/authen/v1/access_token',
      { grant_type: 'authorization_code', code },
      { Authorization: 'Bearer ' + appTok.app_access_token });
    if (r.code !== 0 || !r.data || !r.data.open_id) return htmlResp(401, 'Đăng nhập thất bại: ' + (r.msg || JSON.stringify(r)));

    const MAX_AGE = 90 * 24 * 3600; // 90 ngày — đăng nhập 1 lần dùng lâu dài
    const session = sign({ open_id: r.data.open_id, name: r.data.name || '', exp: Date.now() + MAX_AGE * 1000 }, secret);

    return {
      statusCode: 302,
      headers: {
        Location: '/',
        'Set-Cookie': `hd_session=${session}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`,
        'Cache-Control': 'no-store'
      },
      body: ''
    };
  } catch (e) {
    return htmlResp(500, 'Lỗi hệ thống: ' + e.message);
  }
};
