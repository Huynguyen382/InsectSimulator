import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

export const FOREST_SCALE = 8.0;

// Các chế độ chất lượng cánh rừng & đồ họa để người chơi tự do lựa chọn
export const FOREST_QUALITY_PRESETS = {
  performance: {
    key: 'performance',
    name: '⚡ Siêu mượt',
    label: '⚡ Siêu mượt (Đề xuất)',
    desc: 'Bán kính 28.5m, tỉa 65% tán lá lặp, camera 55m, sương mù 20-44m. Tối ưu 120-144+ FPS cho mọi máy.',
    arenaLimit: 28.5,       // Cắt gọn bán kính từ 36.5m xuống 28.5m
    foliageKeepRatio: 0.35,  // Giữ 35% tán lá đẹp nhất (loại bỏ 65% lá trùng lặp gây Alpha Overdraw nặng)
    cameraFar: 55,          // Camera chỉ render trong 55m
    fogNear: 20,            // Sương mù che nhẹ chân trời từ 20m đến 44m
    fogFar: 44,
    anisotropy: 1,          // Anisotropy = 1x nhẹ nhất cho GPU
    maxDpr: 1.0             // 1.0x DPR triệt tiêu gánh nặng Fill-rate
  },
  balanced: {
    key: 'balanced',
    name: '⚖️ Cân bằng',
    label: '⚖️ Cân bằng',
    desc: 'Bán kính 33.5m, tỉa 35% tán lá, camera 70m, sương mù 28-52m. Cân bằng giữa chi tiết và độ mượt.',
    arenaLimit: 33.5,
    foliageKeepRatio: 0.65,  // Giữ 65% tán lá (tỉa 35%)
    cameraFar: 70,
    fogNear: 28,
    fogFar: 52,
    anisotropy: 2,
    maxDpr: 1.25
  },
  high: {
    key: 'high',
    name: '🌳 Đầy đủ',
    label: '🌳 Đầy đủ',
    desc: 'Bán kính 36.5m, 100% tán lá nguyên bản, camera 85m, sương mù 35-70m. Đồ họa gốc tối đa cho GPU rời.',
    arenaLimit: 36.5,
    foliageKeepRatio: 1.0,   // Giữ trọn 100% tán lá
    cameraFar: 85,
    fogNear: 35,
    fogFar: 70,
    anisotropy: 4,
    maxDpr: 1.5
  }
};

export class AssetLoader {
  constructor(scene) {
    this.scene = scene;
    this.loader = new GLTFLoader();

    this.baseFlyModel = null;
    this.baseFoodModel = null;
    this.forestModel = null;
    this.rawForestScene = null;
    this.currentQualityKey = 'performance';
    this.sharedFoodGeometry = null;
    this.sharedFoodMaterial = null;
    this.presetMeshCache = new Map(); // In-memory cache for quality presets (0ms instant swapping)

    this.isLoaded = false;
  }

  async preloadAll(onProgress) {
    const assets = [
      { name: 'Forest', url: '/Model/a_forest_3_with_a_road_at_night_for_game.glb', weight: 65 },
      { name: 'Fly', url: '/Model/fly.glb', weight: 35 }
    ];

    let completedWeight = 0;

    const loadAsset = (asset) => {
      return new Promise((resolve) => {
        this.loader.load(
          asset.url,
          (gltf) => {
            completedWeight += asset.weight;
            if (onProgress) onProgress(completedWeight, asset.name);
            resolve({ asset, gltf });
          },
          (xhr) => {
            if (xhr.lengthComputable) {
              const itemProgress = (xhr.loaded / xhr.total) * asset.weight;
              const currentTotal = Math.min(99, Math.round(completedWeight + itemProgress));
              if (onProgress) onProgress(currentTotal, asset.name);
            }
          },
          (err) => {
            console.warn(`[AssetLoader] Fallback for ${asset.name}:`, err);
            completedWeight += asset.weight;
            if (onProgress) onProgress(completedWeight, asset.name);
            resolve({ asset, gltf: null });
          }
        );
      });
    };

    const results = await Promise.all(assets.map(loadAsset));

    for (const res of results) {
      if (!res.gltf) continue;

      if (res.asset.name === 'Forest') {
        this.rawForestScene = res.gltf.scene;
        this.processForest(this.rawForestScene, this.currentQualityKey);
      } else if (res.asset.name === 'Fly') {
        this.processFly(res.gltf.scene);
      }
    }

    this.isLoaded = true;
    if (onProgress) onProgress(100, 'Hoàn tất nạp mô hình!');
  }

  // --- FULL-SCALE FOREST (ACCURATELY CROPPED, REDUCED OVERDRAW & ZERO-STUTTER CACHING) ---
  processForest(forestScene, qualityKey) {
    if (!forestScene) return;
    this.rawForestScene = forestScene;
    if (qualityKey) this.currentQualityKey = qualityKey;

    const preset = FOREST_QUALITY_PRESETS[this.currentQualityKey] || FOREST_QUALITY_PRESETS.performance;
    const ARENA_LIMIT = preset.arenaLimit;
    const keepRatio = preset.foliageKeepRatio;

    // Apply scaling and centering transform only once
    if (!forestScene.userData.centered) {
      const dX = 0.04012177;
      const dY = 0.2679714;
      const dZ = -0.45153194;
      forestScene.scale.set(FOREST_SCALE, FOREST_SCALE, FOREST_SCALE);
      forestScene.position.set(dX * FOREST_SCALE, dY * FOREST_SCALE, dZ * FOREST_SCALE);
      forestScene.updateMatrixWorld(true);
      forestScene.userData.centered = true;
    }

    // Instant zero-cost swap if preset is already compiled and cached in memory
    if (this.presetMeshCache.has(this.currentQualityKey)) {
      if (this.forestModel) {
        this.scene.remove(this.forestModel);
      }
      this.forestModel = this.presetMeshCache.get(this.currentQualityKey);
      this.scene.add(this.forestModel);
      console.log(`[AssetLoader] Tải nhanh cánh rừng từ bộ nhớ đệm cache (${this.currentQualityKey}) 0ms!`);
      return;
    }

    // Clean up existing merged forest model (preserve cached models from disposal)
    if (this.forestModel) {
      this.scene.remove(this.forestModel);
      let isCached = false;
      for (const cached of this.presetMeshCache.values()) {
        if (cached === this.forestModel) {
          isCached = true;
          break;
        }
      }
      if (!isCached) {
        this.forestModel.traverse((child) => {
          if (child.isMesh && child.geometry) {
            child.geometry.dispose();
          }
        });
      }
      this.forestModel = null;
    }

    const materialGroups = new Map();
    const uniqueMaterials = new Set();
    const meshes = [];
    const tempBox = new THREE.Box3();
    let foliageCounter = 0;

    // Traverse and crop: lower load scope and optimize dense foliage
    forestScene.traverse((child) => {
      if (child.isMesh && child.geometry) {
        tempBox.setFromObject(child);

        // 1. Hạ phạm vi load: Cắt bỏ triệt để các vật thể ngoài ranh giới bán kính ARENA_LIMIT
        if (
          tempBox.max.x < -ARENA_LIMIT || tempBox.min.x > ARENA_LIMIT ||
          tempBox.max.z < -ARENA_LIMIT || tempBox.min.z > ARENA_LIMIT
        ) {
          return;
        }

        // 2. Giảm chi tiết cánh rừng:
        // Mặt đất (Plane) và Thân cây (Cylinder): Luôn giữ nguyên 100%
        // Tán lá (carve.photos): Tỉa thưa theo tỷ lệ keepRatio để giảm triệt để gánh nặng Alpha Overdraw
        const isFoliage = child.name && child.name.includes('carve.photos');
        if (isFoliage) {
          foliageCounter++;
          // Thuật toán tỉa lá phân bổ đều và xác định (deterministic evenly spaced sampling)
          const shouldKeep = Math.floor(foliageCounter * keepRatio) !== Math.floor((foliageCounter - 1) * keepRatio);
          if (!shouldKeep) {
            return;
          }
        }

        meshes.push(child);
      }
    });

    console.log(`[AssetLoader] Áp dụng chế độ "${preset.name}": Thu gọn bán kính ${ARENA_LIMIT}m, lọc còn ${meshes.length} vật thể...`);

    meshes.forEach((mesh) => {
      const geom = mesh.geometry.clone();
      geom.applyMatrix4(mesh.matrixWorld);

      let mat = mesh.material;
      if (Array.isArray(mat)) mat = mat[0];
      if (mat) uniqueMaterials.add(mat);

      if (!materialGroups.has(mat)) {
        materialGroups.set(mat, []);
      }
      materialGroups.get(mat).push(geom);
    });

    // Cập nhật thuộc tính vật liệu DUY NHẤT 1 LẦN cho mỗi material (tránh kích hoạt re-compilation hàng trăm lần)
    uniqueMaterials.forEach((mat) => {
      const isFoliage = mat.name && mat.name === 'Material';
      if (mat.transparent || mat.opacity < 1.0 || mat.alphaMode === 'BLEND') {
        mat.alphaTest = 0.5;
        mat.transparent = false;
        mat.depthWrite = true;
      }

      // Tối ưu Backface Culling: Thân cây và mặt đất dùng FrontSide để GPU loại bỏ 50% tam giác mặt sau
      mat.side = isFoliage ? THREE.DoubleSide : THREE.FrontSide;

      // Texture sampler theo preset
      if (mat.map) {
        mat.map.anisotropy = preset.anisotropy;
        mat.map.generateMipmaps = true;
        mat.map.minFilter = THREE.LinearMipmapLinearFilter;
        mat.map.magFilter = THREE.LinearFilter;
      }
      mat.needsUpdate = true;
    });

    let mergedSuccessfully = true;
    const mergedForest = new THREE.Group();

    for (const [mat, geoms] of materialGroups.entries()) {
      try {
        const mergedGeom = BufferGeometryUtils.mergeGeometries(geoms, false);
        // Giải phóng các bản sao hình học trung gian để tối ưu RAM
        for (let i = 0; i < geoms.length; i++) {
          geoms[i].dispose();
        }

        if (mergedGeom) {
          const mergedMesh = new THREE.Mesh(mergedGeom, mat);
          mergedMesh.matrixAutoUpdate = false;
          mergedMesh.updateMatrix();
          mergedMesh.castShadow = false;
          mergedMesh.receiveShadow = false;
          mergedMesh.frustumCulled = false; // Arena encloses viewport; saves heavy per-frame culling
          mergedForest.add(mergedMesh);
        }
      } catch (err) {
        console.warn('[AssetLoader] Forest merge notice:', err);
        mergedSuccessfully = false;
        break;
      }
    }

    if (mergedSuccessfully && mergedForest.children.length > 0) {
      this.forestModel = mergedForest;
      this.presetMeshCache.set(this.currentQualityKey, mergedForest);
      this.scene.add(this.forestModel);
      console.log(`[AssetLoader] Cánh rừng sẵn sàng: ${mergedForest.children.length} draw calls, đã lưu vào cache!`);
    } else {
      forestScene.traverse((child) => {
        if (child.isMesh) {
          child.matrixAutoUpdate = false;
          child.updateMatrix();
        }
      });
      this.forestModel = forestScene;
      this.scene.add(this.forestModel);
    }
  }

  setQuality(qualityKey) {
    if (this.currentQualityKey === qualityKey && this.forestModel) return;
    this.currentQualityKey = qualityKey;
    if (this.rawForestScene) {
      this.processForest(this.rawForestScene, qualityKey);
    }
  }

  // --- FLY MODEL ---
  processFly(flyScene) {
    flyScene.scale.set(0.00032, 0.00032, 0.00032);
    flyScene.updateMatrixWorld(true);

    flyScene.traverse((child) => {
      if (child.isMesh && child.material) {
        const m = Array.isArray(child.material) ? child.material[0] : child.material;
        if (m && m.map) {
          m.map.anisotropy = 4; // Tối ưu cân bằng độ nét và băng thông GPU
          m.map.generateMipmaps = true;
          m.map.minFilter = THREE.LinearMipmapLinearFilter;
          m.map.magFilter = THREE.LinearFilter;
        }
      }
    });

    const box = new THREE.Box3().setFromObject(flyScene);
    const center = box.getCenter(new THREE.Vector3());
    flyScene.position.sub(center);

    const flyWrapper = new THREE.Group();
    flyWrapper.add(flyScene);

    this.baseFlyModel = flyWrapper;
    console.log('[AssetLoader] Fly model ready and centered');
  }

  // --- FOOD (POOP) MODEL (PIVOT SHIFTED SO IT SITS ON GROUND) ---
  processFood(foodScene) {
    const SCALE = 0.45;
    foodScene.scale.set(SCALE, SCALE, SCALE);
    foodScene.updateMatrixWorld(true);

    // Shift geometry so bottom sits at Y = 0 (prevents sinking underground!)
    const box = new THREE.Box3().setFromObject(foodScene);
    const shiftY = -box.min.y;
    const shiftX = -(box.min.x + box.max.x) / 2;
    const shiftZ = -(box.min.z + box.max.z) / 2;

    foodScene.position.set(shiftX, shiftY, shiftZ);
    foodScene.updateMatrixWorld(true);

    const geoms = [];
    let foodMat = null;

    foodScene.traverse((child) => {
      if (child.isMesh && child.geometry) {
        const g = child.geometry.clone();
        g.applyMatrix4(child.matrixWorld);
        geoms.push(g);
        if (!foodMat && child.material) {
          foodMat = child.material;
        }
      }
    });

    if (geoms.length > 0) {
      try {
        this.sharedFoodGeometry = BufferGeometryUtils.mergeGeometries(geoms, false);
        this.sharedFoodMaterial = foodMat || new THREE.MeshStandardMaterial({
          color: 0x854d0e,
          roughness: 0.35
        });
        console.log('[AssetLoader] Food model shifted & merged successfully');
      } catch (e) {
        this.baseFoodModel = foodScene;
      }
    } else {
      this.baseFoodModel = foodScene;
    }
  }

  createFlyInstance(team) {
    const group = new THREE.Group();
    const teamColor = team === 0 ? 0x3b82f6 : 0xef4444;
    group.userData.wingNodes = [];

    if (this.baseFlyModel) {
      const flyClone = this.baseFlyModel.clone(true);

      flyClone.traverse((child) => {
        if (child.name && (child.name.includes('ALA') || child.name.includes('ALI'))) {
          group.userData.wingNodes.push(child);
          if (child.material) {
            const m = Array.isArray(child.material) ? child.material[0] : child.material;
            if (m) {
              m.transparent = true;
              m.opacity = 0.85;
              m.roughness = 0.15;
              m.metalness = 0.25;
              m.side = THREE.DoubleSide;
            }
          }
        }
      });

      group.add(flyClone);
      group.userData.flyMesh = flyClone;
    } else {
      // Fallback
      const bodyMat = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.3 });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.6, 8, 12), bodyMat);
      body.rotation.x = Math.PI / 2;
      group.add(body);

      const wingMat = new THREE.MeshStandardMaterial({
        color: 0x93c5fd,
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide
      });
      const wingL = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.8), wingMat);
      const wingR = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.8), wingMat);
      wingL.position.set(0.3, 0.3, 0);
      wingR.position.set(-0.3, 0.3, 0);
      group.add(wingL, wingR);
      group.userData.wingL = wingL;
      group.userData.wingR = wingR;
    }

    // Glowing Under-belly Indicator
    const ringGeo = new THREE.RingGeometry(0.5, 0.65, 16);
    const ringMat = new THREE.MeshBasicMaterial({
      color: teamColor,
      side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.25;
    group.add(ring);

    // Food form mesh (hiển thị khi người chơi bị bắn gục và hóa thành thức ăn)
    const foodMesh = this.createPlayerFoodMesh(team);
    foodMesh.visible = false;
    group.add(foodMesh);
    group.userData.foodMesh = foodMesh;

    this.scene.add(group);
    return group;
  }

  createPlayerFoodMesh(team) {
    this.initSharedFoodAssets();
    const { poopGeo, poopMat } = this.sharedFoodAssets;

    const group = new THREE.Group();

    // 1. Organic food model
    const foodMesh = new THREE.Mesh(poopGeo, poopMat);
    foodMesh.scale.set(0.7, 0.7, 0.7);
    foodMesh.position.y = -0.3;
    group.add(foodMesh);

    // 2. Translucent pulsing sphere aura (team colored / golden)
    const orbColor = team === 0 ? 0x60a5fa : 0xf87171;
    const orbGeo = new THREE.SphereGeometry(0.75, 12, 10);
    const orbMat = new THREE.MeshBasicMaterial({
      color: orbColor,
      wireframe: true,
      transparent: true,
      opacity: 0.45
    });
    const orb = new THREE.Mesh(orbGeo, orbMat);
    group.add(orb);

    // 3. Glowing halo ring
    const haloGeo = new THREE.RingGeometry(0.7, 0.95, 16);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.rotation.x = Math.PI / 2;
    group.add(halo);

    return group;
  }

  initSharedFoodAssets() {
    if (this.sharedFoodAssets) return;

    const brownMat = new THREE.MeshStandardMaterial({
      color: 0x6e3c1b,
      roughness: 0.35,
      metalness: 0.1
    });

    const tier1Geo = new THREE.CylinderGeometry(0.9, 1.2, 0.45, 14);
    tier1Geo.translate(0, 0.22, 0);
    const tier2Geo = new THREE.CylinderGeometry(0.6, 0.9, 0.45, 12);
    tier2Geo.translate(0, 0.60, 0);
    const tipGeo = new THREE.ConeGeometry(0.5, 0.55, 10);
    tipGeo.translate(0, 1.0, 0);

    const mergedPoopGeo = BufferGeometryUtils.mergeGeometries([tier1Geo, tier2Geo, tipGeo], false);

    const auraGeo = new THREE.RingGeometry(1.2, 1.8, 20);
    auraGeo.rotateX(-Math.PI / 2);
    auraGeo.translate(0, 0.05, 0);

    const auraMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65
    });

    const beamGeo = new THREE.CylinderGeometry(0.12, 0.6, 6.0, 10, 1, true);
    beamGeo.translate(0, 3.0, 0);

    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide
    });

    this.sharedFoodAssets = {
      poopGeo: mergedPoopGeo,
      poopMat: brownMat,
      auraGeo,
      auraMat,
      beamGeo,
      beamMat
    };
  }

  createFoodInstance() {
    this.initSharedFoodAssets();
    const { poopGeo, poopMat, auraGeo, auraMat, beamGeo, beamMat } = this.sharedFoodAssets;

    const foodGroup = new THREE.Group();
    const mesh = new THREE.Mesh(poopGeo, poopMat);
    foodGroup.add(mesh);

    const aura = new THREE.Mesh(auraGeo, auraMat);
    foodGroup.add(aura);

    const beam = new THREE.Mesh(beamGeo, beamMat);
    foodGroup.add(beam);

    this.scene.add(foodGroup);
    return foodGroup;
  }

  createBaseInstance(team, pos) {
    const group = new THREE.Group();
    group.position.set(pos.x, pos.y, pos.z);

    const isBlue = team === 0;
    const baseColor = isBlue ? 0x38bdf8 : 0xf87171;
    const coreEmissive = isBlue ? 0x0284c7 : 0xdc2626;

    // 1. Hexagonal Citadel Pedestal (Metallic stone foundation)
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x27272a,
      roughness: 0.7,
      metalness: 0.3
    });
    const pedestalGeo = new THREE.CylinderGeometry(2.8, 3.2, 0.7, 6);
    const pedestal = new THREE.Mesh(pedestalGeo, baseMat);
    pedestal.position.y = 0.35;
    group.add(pedestal);

    // Inner Honeycomb Ring
    const innerRingMat = new THREE.MeshStandardMaterial({
      color: isBlue ? 0x1e3a8a : 0x7f1d1d,
      roughness: 0.4,
      metalness: 0.6
    });
    const innerRingGeo = new THREE.CylinderGeometry(2.2, 2.5, 0.3, 6);
    const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
    innerRing.position.y = 0.75;
    group.add(innerRing);

    // 4 Pylons surrounding the core
    const pylonMat = new THREE.MeshStandardMaterial({
      color: 0x3f3f46,
      roughness: 0.5,
      metalness: 0.5
    });
    const pylonGeo = new THREE.CylinderGeometry(0.18, 0.28, 2.4, 4);
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      const px = Math.cos(angle) * 2.1;
      const pz = Math.sin(angle) * 2.1;
      const pylon = new THREE.Mesh(pylonGeo, pylonMat);
      pylon.position.set(px, 1.3, pz);
      group.add(pylon);
    }

    // 2. Glowing Core Crystal
    const crystalGeo = new THREE.OctahedronGeometry(0.95, 0);
    const crystalMat = new THREE.MeshStandardMaterial({
      color: baseColor,
      emissive: coreEmissive,
      emissiveIntensity: 0.85,
      roughness: 0.2,
      metalness: 0.8,
      flatShading: true
    });
    const crystal = new THREE.Mesh(crystalGeo, crystalMat);
    crystal.position.y = 1.85;
    group.add(crystal);

    // 3. Orbiting Energy Shield Rings
    const ringMat = new THREE.MeshBasicMaterial({
      color: baseColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65
    });
    const ring1Geo = new THREE.TorusGeometry(1.5, 0.05, 8, 24);
    const ring1 = new THREE.Mesh(ring1Geo, ringMat);
    ring1.position.y = 1.85;
    ring1.rotation.x = Math.PI / 3;
    group.add(ring1);

    const ring2Geo = new THREE.TorusGeometry(1.65, 0.04, 8, 24);
    const ring2 = new THREE.Mesh(ring2Geo, ringMat);
    ring2.position.y = 1.85;
    ring2.rotation.y = Math.PI / 4;
    group.add(ring2);

    // 4. Forcefield Energy Shield Dome
    const domeMat = new THREE.MeshBasicMaterial({
      color: baseColor,
      wireframe: true,
      transparent: true,
      opacity: 0.28
    });
    const domeGeo = new THREE.SphereGeometry(2.6, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.position.y = 0.5;
    group.add(dome);

    // 5. Sky Beacon Beam (Visible across map)
    const beamGeo = new THREE.CylinderGeometry(0.25, 0.8, 30.0, 8, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: baseColor,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 15.0;
    group.add(beam);

    // 6. Floating 3D Health Bar Billboard
    const hpCanvas = document.createElement('canvas');
    hpCanvas.width = 256;
    hpCanvas.height = 64;
    const hpTexture = new THREE.CanvasTexture(hpCanvas);
    const hpSpriteMat = new THREE.SpriteMaterial({ map: hpTexture, transparent: true });
    const hpSprite = new THREE.Sprite(hpSpriteMat);
    hpSprite.position.y = 4.2;
    hpSprite.scale.set(4.0, 1.0, 1.0);
    group.add(hpSprite);

    group.userData = {
      team,
      crystal,
      ring1,
      ring2,
      dome,
      hpSprite,
      hpCanvas,
      hpTexture,
      hp: 1000,
      maxHp: 1000,
      baseColor
    };

    this.updateBaseHealthSprite(group, 1000, 1000);
    this.scene.add(group);
    return group;
  }

  updateBaseHealthSprite(baseGroup, hp, maxHp) {
    const data = baseGroup.userData;
    if (!data || !data.hpCanvas) return;
    const ctx = data.hpCanvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 64);

    // Background panel
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(8, 8, 240, 48);

    // Border
    ctx.strokeStyle = data.team === 0 ? '#38bdf8' : '#f87171';
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 8, 240, 48);

    // Text: Base name
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    const title = data.team === 0 ? '🏰 CỨ ĐIỂM XANH' : '🏰 CỨ ĐIỂM ĐỎ';
    ctx.fillText(`${title} (${hp}/${maxHp})`, 128, 28);

    // HP Bar Track
    ctx.fillStyle = '#334155';
    ctx.fillRect(20, 36, 216, 12);

    // HP Bar Fill
    const pct = Math.max(0, Math.min(1, hp / maxHp));
    ctx.fillStyle = data.team === 0 ? '#38bdf8' : '#ef4444';
    ctx.fillRect(20, 36, Math.round(216 * pct), 12);

    data.hpTexture.needsUpdate = true;
  }
}
