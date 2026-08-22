# Chuyển sang Deploy tự động — làm đúng thứ tự này

Mọi thứ phía mã nguồn đã xong. Còn 4 bước, trong đó **bước 2 chỉ anh làm được**
(đổi cài đặt trên tài khoản GitHub).

> **Vì sao thứ tự quan trọng:** repo `pakd-app` hiện đang phục vụ trang web bằng
> **bản build** nằm sẵn trên nhánh `main`. Nếu đẩy mã nguồn lên `main` trong khi
> Pages vẫn để chế độ "Deploy from a branch", Pages sẽ phục vụ thẳng
> `index.html` của mã nguồn — file này trỏ tới `/src/main.jsx` vốn chỉ tồn tại
> lúc chạy `npm run dev` → **trang trắng ngay lập tức**.

---

## Bước 1 — Sao lưu trạng thái hiện tại của remote

Một lệnh, không sửa gì, chỉ để có đường lùi.

```bash
cd "D:\Co-work\Code PAKD Mua\pakd-vite"; git push origin refs/remotes/origin/main:refs/heads/backup-truoc-tu-dong-deploy
```

Sau lệnh này, toàn bộ bản build cũ + lịch sử upload tay được giữ nguyên ở nhánh
`backup-truoc-tu-dong-deploy` trên GitHub. Có sự cố thì khôi phục được.

---

## Bước 2 — Đổi nguồn xuất bản của Pages ⚠ **LÀM TRƯỚC KHI PUSH**

1. Mở https://github.com/toolaihdsteel-commits/pakd-app/settings/pages
2. Mục **Build and deployment** → **Source**
3. Đang là *Deploy from a branch* → đổi thành **GitHub Actions**

Không cần bấm Save, GitHub tự lưu.

Từ lúc này tới khi Actions build xong ở bước 3, trang có thể tạm không truy cập
được (khoảng **2–4 phút**). Nên làm ngoài giờ cao điểm.

---

## Bước 3 — Đẩy mã nguồn lên

Nhánh `main` ở máy đã gộp sẵn toàn bộ công việc (9 commit). Lịch sử ở máy và
trên GitHub không chung gốc — máy anh là bản chuẩn — nên cần `--force-with-lease`:

```bash
git push --force-with-lease origin main
```

Dùng `--force-with-lease` chứ không phải `--force`: nếu có ai vừa đẩy gì lên
remote mà mình chưa biết, lệnh sẽ **từ chối** thay vì đè mất.

Nếu bị lỗi xác thực SSH thì chuyển sang HTTPS rồi chạy lại:

```bash
git remote set-url --push origin https://github.com/toolaihdsteel-commits/pakd-app.git
```

---

## Bước 4 — Theo dõi và xác nhận

Mở https://github.com/toolaihdsteel-commits/pakd-app/actions

Sẽ thấy workflow **Build & Deploy GitHub Pages** chạy qua các bước:
cài phụ thuộc → kiểm chứng và build → kiểm kết quả build → xuất bản.

Xong (dấu ✓ xanh) thì mở https://toolaihdsteel-commits.github.io/pakd-app/
và bấm **Ctrl+F5**.

---

## Từ nay về sau

```bash
git add -A; git commit -m "mô tả thay đổi"; git push
```

Push xong là GitHub tự build và xuất bản. **Không còn phải chạy `npm run build`
rồi upload thư mục `dist` bằng tay nữa.**

Thư mục `dist/` đã nằm trong `.gitignore` — đúng như vậy, vì bản build do
GitHub tạo ra, không phải thứ cần lưu trong Git.

### Hai cổng chặn tự động

| Workflow | Chạy khi nào | Tác dụng |
|---|---|---|
| `kiem-tra.yml` | push nhánh bất kỳ (trừ `main`), và mọi Pull Request | Bắt lỗi **trước** khi gộp vào `main` |
| `deploy.yml` | push `main` | Kiểm chứng lại rồi mới xuất bản |

Cả hai đều chạy `npm run verify`: kiểm TDZ, render 4 tab, kiểm toán đường SMM,
rồi build. **Hỏng bất kỳ bước nào là dừng — trang thật giữ nguyên bản cũ.**

Muốn kiểm ở máy trước khi push:

```bash
npm run verify
```

---

## Nếu có sự cố

**Trang trắng sau khi push** — gần như chắc chắn bước 2 chưa làm hoặc chưa ăn.
Vào lại Settings → Pages kiểm tra Source đã là *GitHub Actions* chưa, rồi vào
tab Actions bấm **Re-run all jobs** ở lượt chạy gần nhất.

**Cần quay về nguyên trạng cũ:**

```bash
git push --force origin backup-truoc-tu-dong-deploy:main
```

rồi đổi Pages Source ngược lại thành *Deploy from a branch* → `main` → `/ (root)`.

**Workflow đỏ** — mở lượt chạy, xem bước nào hỏng. Nếu là bước "Kiểm chứng và
build" thì lỗi nằm trong mã nguồn: chạy `npm run verify` ở máy sẽ ra đúng lỗi đó.

---

## Một việc nên làm sau khi ổn định

Vào Settings → Branches, thêm luật bảo vệ `main`: bắt buộc qua Pull Request và
phải xanh `kiem-tra.yml` mới cho gộp. Khi đó không ai đẩy nhầm thẳng lên trang
thật được nữa.
