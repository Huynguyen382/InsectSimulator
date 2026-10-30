# 🪰 InsectSimulator 3v3 Arena

Đấu trường không chiến côn trùng 3D nhiều người chơi thời gian thực (3v3 Insect Aerial Combat Web Game), phát triển với **Three.js**, **Node.js (Express)** và **WebSockets (`ws`)**.

---

## 📖 Hướng Dẫn Chơi Game (Game Guide)

### 1. 🎮 Bảng Phím Điều Khiển (Controls)
| Phím / Thao tác | Chức năng |
| :--- | :--- |
| **W / A / S / D** (hoặc Phím Mũi tên) | Bay Tiến / Lùi / Lượn Trái / Lượn Phải theo góc nhìn 3D |
| **Space (Phím cách)** | Bay vút lên cao / Tán cây rừng |
| **Shift / Phím C** | Hạ độ cao sát mặt đất |
| **Di chuyển chuột** | Xoay đổi góc nhìn 360° tự do |
| **Chuột trái (Left Click)** | Bắn đạn tiêu hao (Tự động hỗ trợ hút đạn 45% trong phạm vi 10m) |
| **Phím H / F1** | Bật / Tắt bảng Hướng dẫn chiến thuật & phím tắt ngay trong game |
| **Phím ESC** | Tạm dừng chuột / Mở bảng Xác nhận Thoát trận |
| **Phím F8** | Đổi nhanh chất lượng đồ họa rừng: Siêu mượt ⚡ / Cân bằng ⚖️ / Đầy đủ 🌳 |
| **📱 Cần gạt ảo (Joystick)** | Di chuyển bay lượn 360° linh hoạt trên màn hình cảm ứng điện thoại |
| **📱 Vuốt màn hình bên phải** | Xoay góc nhìn camera 360° ngắm bắn mượt mà |
| **📱 Nút cảm ứng ảo** | Bắn đạn 🎯, Bay lên cao ▲ (Space), Hạ sát đất ▼ (Shift) |
| **Bộ gõ Tiếng Việt** | Tích hợp công nghệ chống kẹt phím, thoải mái bật Unikey/EVKey gõ Telex/VNI mà không bị trôi phím! |

---

### 2. 📱 Ghép Trận Cùng Nền Tảng (Mobile-Mobile & PC-PC)
- **Tự động nhận diện thiết bị**: Game tự động phát hiện thiết bị di động (màn hình cảm ứng) hoặc PC (chuột + bàn phím). Người chơi cũng có thể chủ động chuyển đổi chế độ ở sảnh chính.
- **Tách biệt hàng đợi tuyệt đối**: 
  - Hàng đợi **Mobile** chỉ ghép trận với người chơi **Mobile** (+ Bot AI).
  - Hàng đợi **PC** chỉ ghép trận với người chơi **PC** (+ Bot AI).
- **Rào cản Custom Room**: Phòng do người chơi PC tạo chỉ cho phép người chơi PC tham gia; phòng Mobile chỉ cho phép người chơi Mobile tham gia.

---

### 3. 🏰 Mục Tiêu & Luật Chơi 3v3
- **Phá Hủy Cứ Điểm Đối Phương (1000 HP) — THẮNG NGAY LẬP TỨC**:
  - Mỗi phe (Xanh vs Đỏ) sở hữu 1 Cứ Điểm năng lượng phát sáng tại căn cứ.
  - Đội nào tập trung hỏa lực bắn nổ Cứ Điểm đối phương trước sẽ **CHIẾN THẮNG TUYỆT ĐỐI NGAY LẬP TỨC**!
- **Đua Điểm Hạ Gục (15 Kills)**:
  - Phe đầu tiên tiêu diệt đủ 15 mạng đối thủ sẽ giành chiến thắng.
- **Hết Giờ (5 Phút)**:
  - Nếu hết thời gian 5 phút mà chưa Cứ Điểm nào nổ, phe có Cứ Điểm còn nhiều % máu hơn sẽ thắng. Nếu máu bằng nhau, phe có nhiều điểm hạ gục hơn sẽ thắng.

---

### 3. ⚡ Cơ Chế Đạn & Bãi Thức Ăn (💩)
- **Băng đạn sẵn sàng 20 viên**: Bạn bước vào trận và hồi sinh với đầy đủ **20 / 20 viên đạn**.
- **Nạp đạn siêu tốc**: Khi hết đạn hoặc bị thương, bay lại gần các bãi thức ăn (💩) có cột sáng vàng trong **2 giây** để:
  - **Nạp đầy 20 viên đạn** ngay lập tức.
  - **Hồi phục ngay +35 HP**!
- **Vòng đời thức ăn**: Bãi thức ăn tự biến mất sau 22s nếu không ai ăn, và bãi mới sẽ mọc lại sau 12s.

---

### 4. 💩 Dạng Thức Ăn Tàng Hình & Hồi Sinh Thần Tốc
- Khi bị bắn cạn máu, bạn **chưa chết hẳn** mà biến thành một đống thức ăn (💩) rơi xuống đất và có **10 giây trốn thoát**.
- **Trốn thoát thành công sau 10s**: Bạn **tự động hồi sinh làm ruồi ngay tại chỗ** với **70% HP** và **20 viên đạn** đầy đủ để phản công bất ngờ!
- **Cảnh giác**: Nếu bị đối thủ bay lại gần nạp đạn **3 lần** trước khi hết 10s, bạn sẽ bị tiêu diệt hoàn toàn và phải đợi 5 giây hồi sinh tại Căn Cứ.

---

### 5. 🌟 Lên Cấp & Nâng Cấp Kỹ Năng (Rogue-lite Upgrades)
- Tích lũy XP khi hạ gục đối thủ, hỗ trợ đồng đội hoặc ăn thức ăn.
- Khi lên cấp, màn hình sẽ cho bạn chọn 1 trong 3 nâng cấp ngẫu nhiên: *Tăng sát thương, Bay nhanh hơn, Máu trâu hơn, Mở rộng túi đạn, Ăn nhanh hơn, Tự hồi phục ngoài giao tranh*.

---

### 6. 🤖 Cơ Chế Thay Thế Bot AI
- Nếu có người chơi thoát trận giữa chừng, Bot AI thông minh sẽ tự động tiếp quản nhân vật để đảm bảo quân số 3v3 luôn công bằng cho đồng đội!

---

## ⚡ Tự Động Ping Giữ Server OnRender (Anti Sleep / Spin Down)
- Dịch vụ miễn phí của Render (render.com) thường tự động "ngủ" (spin down) sau 15 phút nếu không có request.
- Server đã được tích hợp sẵn cơ chế **Keep-Alive Self-Ping tự động 14 phút một lần** tới endpoint `/health` (sử dụng biến môi trường `RENDER_EXTERNAL_URL`), giúp server luôn thức 24/7 và người chơi không bị chờ 50s cold start!

---

## 🚀 Hướng Dẫn Chạy Cục Bộ (Run Locally)

```bash
# 1. Cài đặt thư viện
npm install

# 2. Đóng gói & mã hóa mã nguồn bảo mật
npm run build

# 3. Khởi động server
npm start
```

Truy cập game tại: `http://localhost:3000`

---

## 🛠️ Công Nghệ Sử Dụng
- **Client**: Vanilla JavaScript (ES Modules), Three.js, WebGL, esbuild & javascript-obfuscator.
- **Server**: Node.js, Express, WebSocket (`ws`).
- **Bảo mật**: Khóa truy cập `/src` (403 Forbidden), Debugger Trap, Chặn F12/Ctrl+Shift+I/Chuột phải, Build mã hóa xáo trộn Production.

