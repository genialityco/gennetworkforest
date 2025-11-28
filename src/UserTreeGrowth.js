// UserTreeGrowth.js
import * as THREE from "three";

/* ============================================================= */
/*  CONFIGURACIÓN DE ETAPAS (igual que en world.js)             */
/* ============================================================= */
const GROWTH_STAGES = [
  { id: "GERMINATION", min: 0,   max: 5,   heightFactor: 0.25, trunkColor: 0x5b3a1a, leafColor: 0xc8e6c9, accentColor: 0xb2ffd6, glowColor: 0x9cffb0, particleColor: 0xc8ffdd, overshootMultiplier: 1.18 },
  { id: "BABY",        min: 5,   max: 20,  heightFactor: 0.40, trunkColor: 0x6d4626, leafColor: 0x9ad9a0, accentColor: 0x8dffc5, glowColor: 0x7bffd6, particleColor: 0xaaffdf, overshootMultiplier: 1.20 },
  { id: "CHILD",       min: 20,  max: 50,  heightFactor: 0.65, trunkColor: 0x7a4d24, leafColor: 0x66bb6a, accentColor: 0x6dffc2, glowColor: 0x5cfff0, particleColor: 0x84ffe6, overshootMultiplier: 1.22 },
  { id: "YOUNG_ADULT", min: 50,  max: 80,  heightFactor: 0.85, trunkColor: 0x81512a, leafColor: 0x3f9f4a, accentColor: 0x64ffd2, glowColor: 0x4effff, particleColor: 0x66ffe8, overshootMultiplier: 1.25 },
  { id: "ADULT",       min: 80,  max: 100, heightFactor: 1.00, trunkColor: 0x8b5a2b, leafColor: 0x2e7d32, accentColor: 0x52ffde, glowColor: 0x3effff, particleColor: 0x4fffe0, overshootMultiplier: 1.30 },
];

const STAGE_BY_ID = Object.fromEntries(GROWTH_STAGES.map(s => [s.id, s]));

function getGrowthStage(growth) {
  const g = Math.max(0, Math.min(100, growth ?? 0));
  const stage = GROWTH_STAGES.find(s => g >= s.min && g < s.max);
  return stage ? stage.id : "ADULT";
}

function getStageData(stageId) {
  return STAGE_BY_ID[stageId] ?? STAGE_BY_ID.ADULT;
}

function getScaleForGrowth(growth) {
  const g = Math.max(0, Math.min(100, growth ?? 0));
  return 0.35 + (g / 100) * 0.75; // de 0.35 a 1.1
}

/* ============================================================= */
/*  EFECTOS VISUALES (los mismos que usabas)                    */
/* ============================================================= */
function spawnAuraWave(treeGroup, color, scale = 1, duration = 800) {
  const geo = new THREE.SphereGeometry(3 * scale, 14, 10);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.BackSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 3 * scale;
  treeGroup.add(mesh);

  const start = performance.now();
  const anim = () => {
    const t = Math.min((performance.now() - start) / duration, 1);
    if (t >= 1) { treeGroup.remove(mesh); return; }
    const pulse = Math.sin(t * Math.PI);
    mesh.material.opacity = 0.35 * pulse;
    mesh.scale.setScalar(1 + t * 0.9);
    requestAnimationFrame(anim);
  };
  anim();
}

function spawnParticleBurst(origin, color, count = 12, speed = 1) {
  const group = new THREE.Group();
  const scene = origin.parent || origin.scene || window.scene; // fallback
  scene.add(group);

  const shapes = [
    new THREE.TetrahedronGeometry(0.14, 0),
    new THREE.OctahedronGeometry(0.12, 0),
    new THREE.BoxGeometry(0.16, 0.16, 0.04),
  ];

  for (let i = 0; i < count; i++) {
    const geo = shapes[Math.floor(Math.random() * shapes.length)];
    const mat = new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0.6,
      flatShading: true, transparent: true, opacity: 1
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(origin);
    m.position.y += 2;

    const angle = (i / count) * Math.PI * 2;
    const vel = new THREE.Vector3(
      Math.cos(angle) * (0.6 + Math.random() * 0.8) * speed,
      1.5 * speed + Math.random() * 1.2,
      Math.sin(angle) * (0.6 + Math.random() * 0.8) * speed
    );
    m.userData = {
      velocity: vel,
      spin: new THREE.Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3)
    };
    group.add(m);
  }

  const start = performance.now();
  const anim = () => {
    const elapsed = performance.now() - start;
    const t = Math.min(elapsed / 1400, 1);
    if (t >= 1) { scene.remove(group); return; }

    group.children.forEach(m => {
      m.position.add(m.userData.velocity.clone().multiplyScalar(0.016));
      m.userData.velocity.y -= 0.08 * speed;
      m.rotation.x += m.userData.spin.x;
      m.rotation.y += m.userData.spin.y;
      m.rotation.z += m.userData.spin.z;
      m.material.opacity = 1 - t;
    });
    requestAnimationFrame(anim);
  };
  anim();
}

function spawnSmokePuff(origin, color, scale = 1) {
  const group = new THREE.Group();
  const scene = origin.parent || origin.scene || window.scene;
  scene.add(group);

  for (let i = 0; i < 4; i++) {
    const geo = new THREE.IcosahedronGeometry(0.6 * scale + i * 0.2, 1);
    const mat = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.35, flatShading: true, side: THREE.DoubleSide });
    const puff = new THREE.Mesh(geo, mat);
    puff.position.copy(origin);
    puff.position.y += 1.2 + i * 0.4;
    puff.userData = { rise: 0.02 + Math.random() * 0.02, expand: 0.01 + Math.random() * 0.01 };
    group.add(puff);
  }

  const start = performance.now();
  const anim = () => {
    const elapsed = performance.now() - start;
    const t = Math.min(elapsed / 1200, 1);
    if (t >= 1) { scene.remove(group); return; }

    group.children.forEach(p => {
      p.position.y += p.userData.rise;
      const s = 1 + p.userData.expand * elapsed * 0.5;
      p.scale.setScalar(s);
      p.material.opacity = 0.35 * (1 - t);
      p.rotation.y += 0.01;
    });
    requestAnimationFrame(anim);
  };
  anim();
}

function spawnGlowPulse(treeGroup, color, scale = 1, duration = 900) {
  const geo = new THREE.RingGeometry(0.6 * scale, 1.1 * scale, 24);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.4;
  const g = new THREE.Group();
  g.add(ring);
  treeGroup.add(g);

  const start = performance.now();
  const anim = () => {
    const elapsed = performance.now() - start;
    const t = Math.min(elapsed / duration, 1);
    if (t >= 1) { treeGroup.remove(g); return; }
    const pulse = Math.sin(t * Math.PI);
    ring.material.opacity = 0.6 * pulse;
    ring.scale.setScalar(1 + t * 4 * scale);
    requestAnimationFrame(anim);
  };
  anim();
}

/* ============================================================= */
/*  CREACIÓN DEL ÁRBOL DE UN USUARIO                            */
/* ============================================================= */
export function createUserTree(scene, growth = 0, baseHeight = 2) {
  const treeGroup = new THREE.Group();
  treeGroup.traverse((obj) => {
    obj.layers.set(0);
  });
  treeGroup.position.y = 0;
  scene.add(treeGroup);

  // Estado interno
  treeGroup.userData = {
    growth: growth,
    baseHeight: baseHeight,
    currentStage: getGrowthStage(growth),
    nextEffectThreshold: Math.floor(growth) + 1,
    animation: null,
  };

  // Crear visual inicial
  updateTreeVisual(treeGroup);

  // Etiqueta de porcentaje
  const label = createGrowthLabel(growth, baseHeight);
  treeGroup.add(label);
  treeGroup.userData.growthLabel = label;

  return treeGroup;
}

/* ============================================================= */
/*  ACTUALIZAR CRECIMIENTO (llamar cuando cambie el %)          */
/* ============================================================= */
export function updateUserTreeGrowth(treeGroup, newGrowth) {
  if (!treeGroup || !treeGroup.userData) return;

  const oldGrowth = treeGroup.userData.growth;
  const newG = Math.max(0, Math.min(100, newGrowth));
  treeGroup.userData.growth = newG;

  const newStage = getGrowthStage(newG);
  const oldStage = treeGroup.userData.currentStage;

  // 1. Cambio de etapa → evolución grande
  if (newStage !== oldStage) {
    triggerStageEvolution(treeGroup, newStage, newG);
    treeGroup.userData.currentStage = newStage;
    treeGroup.userData.nextEffectThreshold = Math.floor(newG) + 1;
  }

  // 2. Efectos por cada % nuevo
  while (newG >= treeGroup.userData.nextEffectThreshold && treeGroup.userData.nextEffectThreshold <= 100) {
    const stageData = getStageData(newStage);
    setTimeout(() => {
      triggerGrowthPulse(treeGroup, stageData, newG);
    }, (treeGroup.userData.nextEffectThreshold - Math.floor(oldGrowth) - 1) * 120);
    treeGroup.userData.nextEffectThreshold++;
  }

  // 3. Actualizar etiqueta de porcentaje
  treeGroup.remove(treeGroup.userData.growthLabel);
  const newLabel = createGrowthLabel(newG, treeGroup.userData.baseHeight);
  //treeGroup.add(newLabel);
  treeGroup.userData.growthLabel = newLabel;

  // 4. Animación suave de escala
  startGrowthAnimation(treeGroup, newG);
}

/* ============================================================= */
/*  FUNCIONES INTERNAS (no exportadas)                          */
/* ============================================================= */
function updateTreeVisual(treeGroup) {
  // Borra visual anterior
  if (treeGroup.userData.visualGroup) treeGroup.remove(treeGroup.userData.visualGroup);

  const stage = getStageData(treeGroup.userData.currentStage);
  const visuals = createStageVisual(stage, treeGroup.userData.baseHeight);
  treeGroup.userData.visualGroup = visuals.group;
  treeGroup.add(visuals.group);

  // Escala inicial
  treeGroup.scale.setScalar(getScaleForGrowth(treeGroup.userData.growth));
}

function createStageVisual(stageId, baseHeight) {
  const stageData = getStageData(stageId);
  const stageGroup = new THREE.Group();
  stageGroup.name = `${stageId}_VISUAL`;

  const leaves = [];
  const accents = [];
  let trunk = null;

  const stageHeight = Math.max(0.8, baseHeight * stageData.heightFactor);
  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: stageData.trunkColor,
    flatShading: true,
    roughness: 0.7,
    metalness: 0,
  });

  const leafMaterial = new THREE.MeshStandardMaterial({
    color: stageData.leafColor,
    emissive: stageData.accentColor,
    emissiveIntensity: 0.08,
    flatShading: true,
    roughness: 0.6,
    metalness: 0,
  });

  const accentMaterial = new THREE.MeshStandardMaterial({
    color: stageData.accentColor,
    emissive: stageData.glowColor,
    emissiveIntensity: 0.2,
    flatShading: true,
    transparent: true,
    opacity: 0.85,
  });

  const addLeaf = (geometry, position) => {
    const leaf = new THREE.Mesh(geometry, leafMaterial.clone());
    leaf.position.copy(position);
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    stageGroup.add(leaf);
    leaves.push(leaf);
  };

  const addAccent = (geometry, position, rotation = new THREE.Euler()) => {
    const accent = new THREE.Mesh(geometry, accentMaterial.clone());
    accent.position.copy(position);
    accent.rotation.copy(rotation);
    accent.castShadow = true;
    stageGroup.add(accent);
    accents.push(accent);
  };

  switch (stageId) {
    case "GERMINATION": {
      const seed = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.6, 0),
        leafMaterial.clone()
      );
      seed.position.y = 0.4;
      seed.castShadow = true;
      seed.receiveShadow = true;
      stageGroup.add(seed);

      trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, stageHeight * 0.6, 6),
        trunkMaterial.clone()
      );
      trunk.position.y = stageHeight * 0.6;
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      stageGroup.add(trunk);

      const leafGeo = new THREE.ConeGeometry(0.25, 0.7, 4);
      addLeaf(leafGeo, new THREE.Vector3(0.25, stageHeight * 1.2, 0));
      addLeaf(leafGeo, new THREE.Vector3(-0.25, stageHeight * 1.2, 0));
      leaves[0].rotation.z = -0.6;
      leaves[1].rotation.z = 0.6;

      break;
    }
    case "BABY": {
      trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.22, stageHeight, 6),
        trunkMaterial.clone()
      );
      trunk.position.y = stageHeight * 0.5;
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      stageGroup.add(trunk);

      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(stageHeight * 0.35, 8, 6),
        leafMaterial.clone()
      );
      bulb.position.y = stageHeight * 0.95;
      bulb.castShadow = true;
      bulb.receiveShadow = true;
      stageGroup.add(bulb);
      leaves.push(bulb);

      const leafGeo = new THREE.ConeGeometry(
        stageHeight * 0.18,
        stageHeight * 0.7,
        5
      );
      addLeaf(
        leafGeo,
        new THREE.Vector3(stageHeight * 0.25, stageHeight * 1.15, 0)
      );
      addLeaf(
        leafGeo,
        new THREE.Vector3(-stageHeight * 0.25, stageHeight * 1.15, 0)
      );
      leaves
        .slice(-2)
        .forEach((leaf, idx) => (leaf.rotation.z = idx === 0 ? -0.8 : 0.8));

      break;
    }
    case "CHILD": {
      trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.32, stageHeight, 6),
        trunkMaterial.clone()
      );
      trunk.position.y = stageHeight * 0.5;
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      stageGroup.add(trunk);

      const branchGeometry = new THREE.CylinderGeometry(
        0.08,
        0.1,
        stageHeight * 0.6,
        5
      );
      const leftBranch = new THREE.Mesh(branchGeometry, trunkMaterial.clone());
      leftBranch.position.set(-0.35, stageHeight * 0.8, 0);
      leftBranch.rotation.z = 0.5;
      leftBranch.castShadow = true;
      stageGroup.add(leftBranch);

      const rightBranch = leftBranch.clone();
      rightBranch.position.x = 0.35;
      rightBranch.rotation.z = -0.5;
      stageGroup.add(rightBranch);

      const canopyGeo = new THREE.SphereGeometry(stageHeight * 0.45, 10, 8);
      addLeaf(canopyGeo, new THREE.Vector3(0, stageHeight * 1.35, 0));
      addLeaf(
        canopyGeo.clone(),
        new THREE.Vector3(-0.5, stageHeight * 1.2, -0.3)
      );
      addLeaf(
        canopyGeo.clone(),
        new THREE.Vector3(0.5, stageHeight * 1.2, 0.3)
      );

      addAccent(
        new THREE.ConeGeometry(0.16, 0.5, 4),
        new THREE.Vector3(0, stageHeight * 1.6, 0)
      );

      break;
    }
    case "YOUNG_ADULT": {
      trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.4, stageHeight, 8),
        trunkMaterial.clone()
      );
      trunk.position.y = stageHeight * 0.5;
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      stageGroup.add(trunk);

      const branchGeometry = new THREE.CylinderGeometry(
        0.1,
        0.12,
        stageHeight * 0.7,
        6
      );
      const branchAngles = [0.35, -0.35, 0.6, -0.6];
      branchAngles.forEach((angle, idx) => {
        const branch = new THREE.Mesh(branchGeometry, trunkMaterial.clone());
        branch.position.set(
          idx % 2 === 0 ? -0.5 : 0.5,
          stageHeight * 0.9,
          idx < 2 ? 0.4 : -0.4
        );
        branch.rotation.z = angle;
        branch.castShadow = true;
        stageGroup.add(branch);
      });

      const primaryCanopy = new THREE.SphereGeometry(stageHeight * 0.55, 10, 8);
      addLeaf(primaryCanopy, new THREE.Vector3(0, stageHeight * 1.5, 0));
      addLeaf(
        primaryCanopy.clone(),
        new THREE.Vector3(-0.7, stageHeight * 1.3, -0.4)
      );
      addLeaf(
        primaryCanopy.clone(),
        new THREE.Vector3(0.7, stageHeight * 1.3, 0.4)
      );
      addLeaf(
        primaryCanopy.clone(),
        new THREE.Vector3(0, stageHeight * 1.2, 0.7)
      );

      addAccent(
        new THREE.OctahedronGeometry(0.25, 0),
        new THREE.Vector3(0, stageHeight * 1.8, 0)
      );

      break;
    }
    case "ADULT":
    default: {
      const adultHeight = Math.max(stageHeight, baseHeight * 0.95);
      trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.55, adultHeight, 10),
        trunkMaterial.clone()
      );
      trunk.position.y = adultHeight * 0.5;
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      stageGroup.add(trunk);

      const canopyGeometry = new THREE.SphereGeometry(
        adultHeight * 0.6,
        12,
        10
      );
      const canopyPositions = [
        new THREE.Vector3(0, adultHeight * 1.6, 0),
        new THREE.Vector3(-0.9, adultHeight * 1.4, -0.4),
        new THREE.Vector3(0.9, adultHeight * 1.4, 0.4),
        new THREE.Vector3(0, adultHeight * 1.3, 0.9),
        new THREE.Vector3(0, adultHeight * 1.3, -0.9),
      ];
      canopyPositions.forEach((pos) => addLeaf(canopyGeometry, pos));

      const fruitGeometry = new THREE.DodecahedronGeometry(0.22, 0);
      canopyPositions.forEach((pos, index) => {
        if (index === 0) return;
        const fruit = new THREE.Mesh(fruitGeometry, accentMaterial.clone());
        fruit.position.copy(pos.clone().multiplyScalar(1.08));
        fruit.castShadow = true;
        stageGroup.add(fruit);
        accents.push(fruit);
      });

      break;
    }
  }

  return {
    group: stageGroup,
    trunk,
    leaves,
    accents,
  };
}


function triggerStageEvolution(treeGroup, nextStage, growth) {
  const stageData = getStageData(nextStage);
  spawnAuraWave(treeGroup, stageData.glowColor, 1.35, 1100);
  spawnParticleBurst(treeGroup, stageData.particleColor, 24, 1.4);
  spawnSmokePuff(treeGroup, stageData.accentColor, 1.2);
  spawnGlowPulse(treeGroup, stageData.glowColor, 1.3, 1200);
  updateTreeVisual(treeGroup);
  startGrowthAnimation(treeGroup, growth, { overshootMultiplier: stageData.overshootMultiplier + 0.1, duration: 1400 });
}

function triggerGrowthPulse(treeGroup, stageData, growth) {
  spawnAuraWave(treeGroup, stageData.accentColor);
  spawnParticleBurst(treeGroup, stageData.particleColor);
  spawnSmokePuff(treeGroup, stageData.accentColor, 0.9);
  spawnGlowPulse(treeGroup, stageData.glowColor);
  startGrowthAnimation(treeGroup, growth);
}

function startGrowthAnimation(treeGroup, targetGrowth, opts = {}) {
  const anim = {
    start: performance.now(),
    duration: opts.duration || 1200,
    initialScale: treeGroup.scale.x,
    finalScale: getScaleForGrowth(targetGrowth),
    overshoot: (opts.overshootMultiplier || 1.18) * getScaleForGrowth(targetGrowth),
  };
  treeGroup.userData.growthAnim = anim;
}

function applyGrowthAnimation(treeGroup, now) {
  const anim = treeGroup.userData.growthAnim;
  if (!anim) return;

  const t = Math.min((now - anim.start) / anim.duration, 1);
  let scale = anim.finalScale;

  if (t < 0.4) {
    scale = THREE.MathUtils.lerp(anim.initialScale, anim.overshoot, t / 0.4);
  } else if (t < 0.8) {
    const wave = Math.sin((t - 0.4) / 0.4 * Math.PI * 6) * 0.08 * (1 - (t - 0.4) / 0.4);
    scale = anim.finalScale + wave;
  } else {
    scale = THREE.MathUtils.lerp(anim.overshoot, anim.finalScale, (t - 0.8) / 0.2);
  }

  treeGroup.scale.setScalar(scale);
  if (t >= 1) treeGroup.userData.growthAnim = null;
}

// Etiqueta de porcentaje (igual que en tu código)
function createGrowthLabel(growth, baseHeight) {
  const g = Math.floor(growth);
  const isFull = g >= 100;
  const text = isFull ? "¡COMPLETO! 🌟" : `${g}%`;
  const color = isFull ? "#FFD700" : "#aaffaa";

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const fontSize = 180;
  ctx.font = `bold ${fontSize}px system-ui`;
  const w = ctx.measureText(text).width + 80;
  canvas.width = w;
  canvas.height = fontSize + 80;

  ctx.font = `bold ${fontSize}px system-ui`;
  ctx.beginPath();
  ctx.roundRect(0, 0, canvas.width, canvas.height, 30);
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fill();

  // 2. Dibujar el borde (stroke)
  ctx.beginPath();
  ctx.roundRect(0, 0, canvas.width, canvas.height, 30);
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 6;
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.scale.set(w / 200, (canvas.height) / 200, 1);
  sprite.position.set(0, baseHeight + 5, 0);
  return sprite;
}

/* ============================================================= */
/*  LOOP DE ANIMACIÓN (llámalo desde tu animate())              */
/* ============================================================= */
export function animateUserTree(treeGroup) {
  if (treeGroup.userData.growthAnim) {
    applyGrowthAnimation(treeGroup, performance.now());
  }
}