export const CLIENT_CONFIG = {
  MOUSE_SENSITIVITY: 0.0018,         // Smooth horizontal look (yaw)
  MOUSE_PITCH_SENSITIVITY: 0.0015,   // Balanced vertical look (pitch)
  INVERT_MOUSE_X: true,              // Giữ cách di chuyển cũ: Di chuột sang trái rẽ phải, di sang phải rẽ trái
  INVERT_MOUSE_Y: true,              // Giữ cách di chuyển cũ: Đổi hướng di chuyển lên xuống của chuột

  // Camera Settings: Spacious, elevated 3rd-person view with anti-motion-sickness damping
  CAMERA_DISTANCE: 5.6,            // Kéo xa cự ly tầm nhìn thoáng đãng, giảm tốc độ trôi nền
  CAMERA_HEIGHT: 2.1,              // Nâng cao camera giúp góc nhìn bao quát, giảm chóng mặt
  CAMERA_LOOK_AHEAD_DIST: 38.0,    // Camera hướng xa về phía trước, giữ tâm ngắm cố định
  CAMERA_SMOOTH_FACTOR: 0.22,      // Damping mềm mại cho camera
  CAMERA_LOOKAT_SMOOTH: 0.25,      // Damping mềm mại cho điểm nhìn (look-at)
  
  // Aim Assist Parameters: Strictly 10m cutoff (No assist beyond 10m)
  AIM_ASSIST_CONE_DEG: 18.0,
  AIM_ASSIST_MAX_DIST: 10.0,       // Đúng chuẩn 10m: Ngoài 10m tắt hoàn toàn hỗ trợ ngắm
  AIM_ASSIST_STRENGTH: 0.55,       // Hỗ trợ hút đạn 55% trong cự ly <= 10m
  AIM_ASSIST_FRICTION: 1.0,        // Chuột 1:1 tự nhiên, không giật khựng
  AIM_ASSIST_STICKY_PULL: 0.0,     // Không kéo giật chuột làm rung lắc tâm ngắm
  
  // Visual Polish
  WING_FLAP_SPEED: 0.06,
  POSITION_LERP_FACTOR: 0.35,
  BANKING_SMOOTH_FACTOR: 0.15,

  // Forest Flight Boundaries (Symmetrical & strictly within the 76m x 76m forest)
  BOUNDS: {
    minX: -36.0,
    maxX: 36.0,
    minZ: -36.0,
    maxZ: 36.0
  }
};
