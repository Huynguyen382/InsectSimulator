import * as THREE from 'three';

export class ParticleSystem {
  constructor(scene, maxParticles = 180) {
    this.scene = scene;
    this.maxParticles = maxParticles;

    this.positions = new Float32Array(maxParticles * 3);
    this.colors = new Float32Array(maxParticles * 3);
    this.sizes = new Float32Array(maxParticles);

    this.velocities = [];
    this.lives = new Float32Array(maxParticles);
    this.maxLives = new Float32Array(maxParticles);
    this.activeCount = 0;

    for (let i = 0; i < maxParticles; i++) {
      this.velocities.push(new THREE.Vector3());
      this.lives[i] = 0;
      this.maxLives[i] = 1;
      this.sizes[i] = 0;
      // Hide inactive particles far outside viewport
      this.positions[i * 3 + 0] = 0;
      this.positions[i * 3 + 1] = -999;
      this.positions[i * 3 + 2] = 0;

      this.colors[i * 3 + 0] = 1;
      this.colors[i * 3 + 1] = 1;
      this.colors[i * 3 + 2] = 1;
    }

    this.geometry = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.positions, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', this.posAttr);

    this.colAttr = new THREE.BufferAttribute(this.colors, 3);
    this.colAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('color', this.colAttr);

    this.sizeAttr = new THREE.BufferAttribute(this.sizes, 1);
    this.sizeAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('size', this.sizeAttr);

    // Particle texture generator (soft glowing circular star)
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 15);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.3, 'rgba(255, 240, 180, 0.8)');
    grad.addColorStop(0.7, 'rgba(255, 180, 50, 0.3)');
    grad.addColorStop(1, 'rgba(255, 100, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);

    const particleTexture = new THREE.CanvasTexture(canvas);

    this.material = new THREE.PointsMaterial({
      size: 0.35,
      map: particleTexture,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);

    this.tempColor = new THREE.Color();
  }

  spawnHitSparks(x, y, z, colorHex = 0xffa500, count = 8) {
    this.tempColor.setHex(colorHex);
    const r = this.tempColor.r;
    const g = this.tempColor.g;
    const b = this.tempColor.b;

    for (let k = 0; k < count; k++) {
      const idx = this.findFreeParticleIndex();
      if (idx === -1) break;

      this.positions[idx * 3 + 0] = x;
      this.positions[idx * 3 + 1] = y;
      this.positions[idx * 3 + 2] = z;

      this.colors[idx * 3 + 0] = r;
      this.colors[idx * 3 + 1] = g;
      this.colors[idx * 3 + 2] = b;

      this.sizes[idx] = 0.25 + Math.random() * 0.25;

      const speed = 4.0 + Math.random() * 8.0;
      const angleTheta = Math.random() * Math.PI * 2;
      const anglePhi = (Math.random() - 0.5) * Math.PI;

      this.velocities[idx].set(
        Math.cos(anglePhi) * Math.cos(angleTheta) * speed,
        Math.sin(anglePhi) * speed + 2.0,
        Math.cos(anglePhi) * Math.sin(angleTheta) * speed
      );

      this.maxLives[idx] = 0.25 + Math.random() * 0.25;
      this.lives[idx] = this.maxLives[idx];
    }
  }

  spawnFoodBurst(x, y, z, count = 12) {
    for (let k = 0; k < count; k++) {
      const idx = this.findFreeParticleIndex();
      if (idx === -1) break;

      this.positions[idx * 3 + 0] = x + (Math.random() - 0.5) * 0.4;
      this.positions[idx * 3 + 1] = y + (Math.random() - 0.5) * 0.4;
      this.positions[idx * 3 + 2] = z + (Math.random() - 0.5) * 0.4;

      // Golden sparkling colors (yellow to bright amber)
      this.colors[idx * 3 + 0] = 1.0;
      this.colors[idx * 3 + 1] = 0.8 + Math.random() * 0.2;
      this.colors[idx * 3 + 2] = 0.2 + Math.random() * 0.2;

      this.sizes[idx] = 0.3 + Math.random() * 0.3;

      const speed = 2.5 + Math.random() * 4.5;
      const angle = Math.random() * Math.PI * 2;

      this.velocities[idx].set(
        Math.cos(angle) * speed,
        2.5 + Math.random() * 4.0, // Upward radiating fountain
        Math.sin(angle) * speed
      );

      this.maxLives[idx] = 0.4 + Math.random() * 0.35;
      this.lives[idx] = this.maxLives[idx];
    }
  }

  findFreeParticleIndex() {
    for (let i = 0; i < this.maxParticles; i++) {
      if (this.lives[i] <= 0) return i;
    }
    // Overwrite oldest if full
    return Math.floor(Math.random() * this.maxParticles);
  }

  update(dt) {
    let hasActive = false;
    const gravity = -14.0;

    for (let i = 0; i < this.maxParticles; i++) {
      if (this.lives[i] > 0) {
        hasActive = true;
        this.lives[i] -= dt;

        if (this.lives[i] <= 0) {
          this.positions[i * 3 + 1] = -999;
          this.sizes[i] = 0;
          continue;
        }

        // Apply velocity and gravity
        this.velocities[i].y += gravity * dt;
        this.positions[i * 3 + 0] += this.velocities[i].x * dt;
        this.positions[i * 3 + 1] += this.velocities[i].y * dt;
        this.positions[i * 3 + 2] += this.velocities[i].z * dt;

        // Fade size with remaining life
        const progress = this.lives[i] / this.maxLives[i];
        this.sizes[i] = Math.max(0.05, progress * 0.4);
      }
    }

    if (hasActive) {
      this.posAttr.needsUpdate = true;
      this.colAttr.needsUpdate = true;
      this.sizeAttr.needsUpdate = true;
    }
  }

  clear() {
    for (let i = 0; i < this.maxParticles; i++) {
      this.lives[i] = 0;
      this.positions[i * 3 + 1] = -999;
      this.sizes[i] = 0;
    }
    this.posAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
  }
}

