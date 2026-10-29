import * as THREE from 'three';

export class SceneManager {
  constructor(containerId = 'game-container') {
    this.container = document.getElementById(containerId);

    // Three.js Core Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xbbe5fd);
    // Natural daytime atmospheric haze softly blending forest perimeter into the sunny sky dome
    this.scene.fog = new THREE.Fog(0xbbe5fd, 28, 52);

    this.camera = new THREE.PerspectiveCamera(
      65,
      window.innerWidth / window.innerHeight,
      0.1,
      70
    );

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
      alpha: false // Opaque canvas avoids expensive browser compositing blends
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    // Optimized retina resolution (1.25x offers crisp clarity with 45% less fill-rate strain)
    const baseDpr = window.devicePixelRatio || 1;
    this.maxPixelRatio = Math.min(baseDpr, 1.25);
    this.currentPixelRatio = this.maxPixelRatio;
    this.renderer.setPixelRatio(this.currentPixelRatio);
    this.renderer.shadowMap.enabled = false;

    // Cinematic Color Management & Filmic Tone Mapping for smooth tonal gradations & highlight rolloff
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.container.appendChild(this.renderer.domElement);

    this.treeMeshes = [];

    // Performance statistics & adaptive DPR
    this.frameCount = 0;
    this.lastTime = performance.now();
    this.fpsElement = document.getElementById('fps-counter');
    this.drawCallElement = document.getElementById('drawcall-counter');
    this.lowFpsStreak = 0;
    this.highFpsStreak = 0;

    this.sharedShadowGeo = null;
    this.sharedShadowMat = null;

    this.initDaySky();
    this.initLights();
    this.initDustMotes();
    this.initBoundaryBarrier();
    this.initResizeListener();
  }

  initDustMotes() {
    const count = 75;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3 + 0] = (Math.random() - 0.5) * 54;
      pos[i * 3 + 1] = 1.0 + Math.random() * 9.0;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 54;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xfef08a,
      size: 0.22,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: true
    });

    this.dustPoints = new THREE.Points(geo, mat);
    this.dustPoints.frustumCulled = false;
    this.scene.add(this.dustPoints);
    this.dustTime = 0;
  }

  updateDustMotes(dt) {
    if (!this.dustPoints) return;
    this.dustTime += dt;
    const pos = this.dustPoints.geometry.attributes.position.array;
    const count = pos.length / 3;
    for (let i = 0; i < count; i++) {
      pos[i * 3 + 1] += Math.sin(this.dustTime * 0.8 + i) * 0.15 * dt;
      pos[i * 3 + 0] += Math.cos(this.dustTime * 0.5 + i) * 0.1 * dt;
      if (pos[i * 3 + 1] < 1.0) pos[i * 3 + 1] = 9.5;
      else if (pos[i * 3 + 1] > 10.0) pos[i * 3 + 1] = 1.2;
    }
    this.dustPoints.geometry.attributes.position.needsUpdate = true;
  }

  createBlobShadowMesh() {
    if (!this.sharedShadowGeo || !this.sharedShadowMat) {
      this.sharedShadowGeo = new THREE.PlaneGeometry(1.4, 1.4);
      this.sharedShadowGeo.rotateX(-Math.PI / 2);

      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
      grad.addColorStop(0, 'rgba(8, 20, 12, 0.7)');
      grad.addColorStop(0.4, 'rgba(8, 20, 12, 0.45)');
      grad.addColorStop(0.75, 'rgba(8, 20, 12, 0.15)');
      grad.addColorStop(1, 'rgba(8, 20, 12, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);

      const tex = new THREE.CanvasTexture(canvas);
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearFilter;

      this.sharedShadowMat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        fog: true
      });
    }

    const shadow = new THREE.Mesh(this.sharedShadowGeo, this.sharedShadowMat);
    shadow.matrixAutoUpdate = false;
    this.scene.add(shadow);
    return shadow;
  }

  // --- DAYTIME SKYDOME SCALED TO FIT FOREST BOUNDARY ---
  initDaySky() {
    // 1. Skydome scaled to fit exactly the forest arena boundary (Radius 54m)
    // Symmetrical forest arena has corners at sqrt(36^2 + 36^2) = 50.9m; ground ends at ~53m.
    const skyRadius = 54;
    const skyGeo = new THREE.SphereGeometry(skyRadius, 32, 20);

    // Create high-res vertical daytime gradient texture
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 512);

    // Natural daylight sky gradient:
    grad.addColorStop(0.0, '#0284c7');  // Deep bright sky blue at zenith
    grad.addColorStop(0.25, '#38bdf8'); // Vibrant sunny blue
    grad.addColorStop(0.55, '#7dd3fc'); // Azure daytime sky
    grad.addColorStop(0.72, '#bae6fd'); // Atmospheric sky layer
    grad.addColorStop(0.85, '#e0f2fe'); // Sunny horizon haze meeting the tree line
    grad.addColorStop(0.92, '#f0fdf4'); // Soft forest ground contact
    grad.addColorStop(1.0, '#bbf7d0');  // Soft foliage green tint below horizon

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 512);

    const skyTex = new THREE.CanvasTexture(canvas);
    skyTex.magFilter = THREE.LinearFilter;
    skyTex.minFilter = THREE.LinearFilter;

    const skyMat = new THREE.MeshBasicMaterial({
      map: skyTex,
      side: THREE.BackSide,
      fog: false
    });

    const skydome = new THREE.Mesh(skyGeo, skyMat);
    // Offset slightly downwards so horizon cleanly aligns with forest terrain ground level
    skydome.position.set(0, -3, 0);
    skydome.matrixAutoUpdate = false;
    skydome.updateMatrix();
    skydome.frustumCulled = false;
    this.scene.add(skydome);

    // 2. Radiant Daytime Sun (Placed inside the 54m sky dome at r ~ 47m)
    const sunGroup = new THREE.Group();
    sunGroup.position.set(28, 35, 22);

    // Sun Core Disk
    const sunGeo = new THREE.SphereGeometry(3.0, 16, 16);
    const sunMat = new THREE.MeshBasicMaterial({
      color: 0xfffef2,
      fog: false
    });
    const sunMesh = new THREE.Mesh(sunGeo, sunMat);
    sunGroup.add(sunMesh);

    // Sun Inner Corona Halo
    const haloGeo = new THREE.RingGeometry(3.0, 9.0, 32);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.55,
      fog: false
    });
    const haloMesh = new THREE.Mesh(haloGeo, haloMat);
    haloMesh.lookAt(-28, -35, -22);
    sunGroup.add(haloMesh);

    // Outer soft golden sunlight flare
    const outerHaloGeo = new THREE.RingGeometry(8.5, 18.0, 32);
    const outerHaloMat = new THREE.MeshBasicMaterial({
      color: 0xfde047,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.22,
      fog: false
    });
    const outerHaloMesh = new THREE.Mesh(outerHaloGeo, outerHaloMat);
    outerHaloMesh.lookAt(-28, -35, -22);
    sunGroup.add(outerHaloMesh);

    sunGroup.matrixAutoUpdate = false;
    sunGroup.updateMatrix();
    this.scene.add(sunGroup);
  }

  // --- FOREST ARENA BOUNDARY BARRIER (VISUAL LIMITS) ---
  initBoundaryBarrier() {
    // Translucent perimeter boundary cage matching exact forest bounds (X: -36 to 36, Z: -36 to 36)
    const barrierGeo = new THREE.BoxGeometry(72, 24, 72);
    // Inverted box to see subtle boundary lines from inside
    const barrierMat = new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      wireframe: true,
      transparent: true,
      opacity: 0.08,
      fog: false
    });
    const barrierMesh = new THREE.Mesh(barrierGeo, barrierMat);
    barrierMesh.position.set(0, 10, 0);
    barrierMesh.matrixAutoUpdate = false;
    barrierMesh.updateMatrix();
    this.scene.add(barrierMesh);
  }

  initLights() {
    // Rich daytime hemisphere lighting: clear sky blue above + lush forest greenery reflection below
    const hemiLight = new THREE.HemisphereLight(0xbae6fd, 0x2e4e1a, 2.0);
    this.scene.add(hemiLight);

    // Warm golden sunlight matching sun direction (28, 35, 22)
    const sunLight = new THREE.DirectionalLight(0xfffaed, 2.6);
    sunLight.position.set(28, 40, 22);
    this.scene.add(sunLight);

    // Soft sky ambient fill light from opposite angle to prevent dark shaded areas in the forest
    const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.85);
    fillLight.position.set(-25, 30, -25);
    this.scene.add(fillLight);
  }

  setupTreeObstacles(trees) {
    // Tree collisions and line-of-sight are computed with fast 2D circle math.
    // Keeping 83 invisible 3D meshes out of the Three.js scene graph saves 83 frustum checks every frame!
    this.treeObstacles = trees;
  }

  setQuality(preset) {
    if (!preset) return;
    this.camera.far = preset.cameraFar;
    this.camera.updateProjectionMatrix();

    if (this.scene.fog) {
      this.scene.fog.near = preset.fogNear;
      this.scene.fog.far = preset.fogFar;
    }

    const baseDpr = window.devicePixelRatio || 1;
    this.maxPixelRatio = Math.min(baseDpr, preset.maxDpr);
    this.currentPixelRatio = this.maxPixelRatio;
    this.renderer.setPixelRatio(this.currentPixelRatio);
    console.log(`[SceneManager] Quality preset applied: ${preset.name} (Far: ${preset.cameraFar}m, Fog: [${preset.fogNear}, ${preset.fogFar}]m, DPR: ${this.currentPixelRatio})`);
  }

  // Pre-compile GPU shader pipelines ahead of time to eliminate first-frame hitches
  compileScene() {
    if (this.renderer && this.scene && this.camera) {
      try {
        this.renderer.compile(this.scene, this.camera);
        console.log('[SceneManager] GPU Shader programs pre-compiled successfully');
      } catch (err) {
        console.warn('[SceneManager] Pre-compile notice:', err);
      }
    }
  }

  initResizeListener() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  render(dt = 0.016) {
    if (this.dustPoints) {
      this.updateDustMotes(dt);
    }

    this.renderer.render(this.scene, this.camera);

    this.frameCount++;
    const now = performance.now();
    const elapsed = now - this.lastTime;
    if (elapsed >= 500) {
      const fps = Math.round((this.frameCount * 1000) / elapsed);
      if (this.fpsElement) this.fpsElement.innerText = fps;
      if (this.drawCallElement && this.renderer.info) {
        this.drawCallElement.innerText = this.renderer.info.render.calls;
      }

      // Stabilized Adaptive DPR: avoids micro-stutters by requiring sustained frame drops (Debounce 2s)
      if (fps < 42 && this.currentPixelRatio > 1.0) {
        this.lowFpsStreak++;
        this.highFpsStreak = 0;
        if (this.lowFpsStreak >= 4) {
          this.currentPixelRatio = Math.max(1.0, this.currentPixelRatio - 0.2);
          this.renderer.setPixelRatio(this.currentPixelRatio);
          this.lowFpsStreak = 0;
        }
      } else if (fps >= 58 && this.currentPixelRatio < this.maxPixelRatio) {
        this.highFpsStreak++;
        this.lowFpsStreak = 0;
        if (this.highFpsStreak >= 6) {
          this.currentPixelRatio = Math.min(this.maxPixelRatio, this.currentPixelRatio + 0.15);
          this.renderer.setPixelRatio(this.currentPixelRatio);
          this.highFpsStreak = 0;
        }
      } else {
        this.lowFpsStreak = 0;
        this.highFpsStreak = 0;
      }

      this.frameCount = 0;
      this.lastTime = now;
    }
  }
}
