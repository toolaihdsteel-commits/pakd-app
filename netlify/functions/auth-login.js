// HD Steel CRM — Bắt đầu đăng nhập Lark (OAuth)
// Chuyển trình duyệt sang trang đăng nhập Lark để lấy "code".
const crypto = require('crypto');

const LARK_AUTH = 'https://open.larksuite.com/open-apis/authen/v1/index';

exports.handler = async (event) => {
  const host = event.headers.host;
  const redirectUri = `https://${host}/api/auth-callback`;
  const state = crypto.randomBytes(8).toString('hex');

  const url = `${LARK_AUTH}?app_id=${encodeURIComponent(process.env.LARK_APP_ID)}`
            + `&redirect_uri=${encodeURIComponent(redirectUri)}`
            + `&state=${state}`;

  return {
    statusCode: 302,
    headers: {
      Location: url,
      'Set-Cookie': `hd_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
      'Cache-Control': 'no-store'
    },
    body: ''
  };
};
