// HD Steel CRM — Đăng xuất: xoá session cookie
exports.handler = async () => ({
  statusCode: 302,
  headers: {
    Location: '/',
    'Set-Cookie': `hd_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
    'Cache-Control': 'no-store'
  },
  body: ''
});
