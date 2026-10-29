export const CLIENT_CONFIG = {
  MOUSE_SENSITIVITY: 0.0018,         // Smooth horizontal look (yaw)
  MOUSE_PITCH_SENSITIVITY: 0.0015,   // Balanced vertical look (pitch) - eliminating vertical sluggishness
  INVERT_MOUSE_X: true,              // Di chuột sang trái rẽ phải, di sang phải rẽ trái
  INVERT_MOUSE_Y: true,               // Đổi hướng di chuyển lên xuống của chuột

  // Camera Settings: Spacious, elevated 3rd-person view with clear crosshair sightlines
  CAMERA_DISTANCE: 4.8,            // Increased from 3.2 to 4.8 for spacious view
  CAMERA_HEIGHT: 1.65,             // Elevated so fly model is in lower-third of screen
  CAMERA_LOOK_AHEAD_DIST: 35.0,    // Camera aims downfield, keeping crosshair clear of model
  CAMERA_SMOOTH_FACTOR: 0.16,      // Smooth camera position damping
  CAMERA_LOOKAT_SMOOTH: 0.22,      // Smooth look-at target interpolation
  
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
