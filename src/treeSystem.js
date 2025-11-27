import * as THREE from "three";

export const GROWTH_STAGES = [
  {
    id: "GERMINATION",
    label: "Germination",
    min: 0,
    max: 5,
    heightFactor: 0.25,
    trunkColor: 0x5b3a1a,
    leafColor: 0xc8e6c9,
    accentColor: 0xb2ffd6,
    glowColor: 0x9cffb0,
    particleColor: 0xc8ffdd,
    overshootMultiplier: 1.18,
  },
  {
    id: "BABY",
    label: "Baby Plant",
    min: 5,
    max: 20,
    heightFactor: 0.4,
    trunkColor: 0x6d4626,
    leafColor: 0x9ad9a0,
    accentColor: 0x8dffc5,
    glowColor: 0x7bffd6,
    particleColor: 0xaaffdf,
    overshootMultiplier: 1.2,
  },
  {
    id: "CHILD",
    label: "Young Plant",
    min: 20,
    max: 50,
    heightFactor: 0.65,
    trunkColor: 0x7a4d24,
    leafColor: 0x66bb6a,
    accentColor: 0x6dffc2,
    glowColor: 0x5cfff0,
    particleColor: 0x84ffe6,
    overshootMultiplier: 1.22,
  },
  {
    id: "YOUNG_ADULT",
    label: "Young Adult",
    min: 50,
    max: 80,
    heightFactor: 0.85,
    trunkColor: 0x81512a,
    leafColor: 0x3f9f4a,
    accentColor: 0x64ffd2,
    glowColor: 0x4effff,
    particleColor: 0x66ffe8,
    overshootMultiplier: 1.25,
  },
  {
    id: "ADULT",
    label: "Adult Plant",
    min: 80,
    max: 100,
    heightFactor: 1,
    trunkColor: 0x8b5a2b,
    leafColor: 0x2e7d32,
    accentColor: 0x52ffde,
    glowColor: 0x3effff,
    particleColor: 0x4fffe0,
    overshootMultiplier: 1.3,
  },
];

const STAGE_BY_ID = Object.fromEntries(
  GROWTH_STAGES.map((stage) => [stage.id, stage])
);

export function getGrowthStage(growth) {
  const safeGrowth = Math.max(0, Math.min(100, growth ?? 0));
  const stage = GROWTH_STAGES.find(
    (entry) => safeGrowth >= entry.min && safeGrowth < entry.max
  );
  return stage ? stage.id : "ADULT";
}

export function getStageData(stageId) {
  return STAGE_BY_ID[stageId] ?? STAGE_BY_ID.ADULT;
}

export function createTreeSystem({ scene }) {
  if (!scene) {
    throw new Error("createTreeSystem requires a scene reference");
  }

  const scheduledEffects = new WeakMap();

  const registerTimeout = (treeData, handle) => {
    const handles = scheduledEffects.get(treeData) ?? [];
    handles.push(handle);
    scheduledEffects.set(treeData, handles);
  };

  const clearScheduledEffects = (treeData) => {
    const handles = scheduledEffects.get(treeData);
    if (handles) {
      handles.forEach((handle) => clearTimeout(handle));
      scheduledEffects.delete(treeData);
    }
  };

  function spawnAuraWave(treeGroup, color, scaleMultiplier = 1, duration = 800) {
    const auraGeometry = new THREE.SphereGeometry(3 * scaleMultiplier, 14, 10);
    const auraMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      side: THREE.BackSide,
    });

    const aura = new THREE.Mesh(auraGeometry, auraMaterial);
    aura.position.y = 3 * scaleMultiplier;
    treeGroup.add(aura);

    const start = performance.now();

    const animateAura = () => {
      const elapsed = performance.now() - start;
      const t = Math.min(elapsed / duration, 1);
      if (t >= 1) {
        treeGroup.remove(aura);
        aura.geometry.dispose();
        aura.material.dispose();
        return;
      }

      const pulse = Math.sin(t * Math.PI);
      aura.material.opacity = 0.35 * pulse;
      aura.scale.setScalar(1 + t * 0.9);

      requestAnimationFrame(animateAura);
    };

    animateAura();
  }

  function spawnParticleBurst(origin, color, baseCount = 12, speedMultiplier = 1) {
    const group = new THREE.Group();
    scene.add(group);

    const shapes = [
      new THREE.TetrahedronGeometry(0.14, 0),
      new THREE.OctahedronGeometry(0.12, 0),
      new THREE.BoxGeometry(0.16, 0.16, 0.04),
    ];

    for (let i = 0; i < baseCount; i++) {
      const geometry = shapes[Math.floor(Math.random() * shapes.length)];
      const material = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.6,
        flatShading: true,
        transparent: true,
        opacity: 1,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(origin);
      mesh.position.y += 2;

      const angle = (i / baseCount) * Math.PI * 2;
      const speed = (0.6 + Math.random() * 0.8) * speedMultiplier;
      mesh.userData.velocity = new THREE.Vector3(
        Math.cos(angle) * speed,
        1.5 * speedMultiplier + Math.random() * 1.2,
        Math.sin(angle) * speed
      );
      mesh.userData.spin = new THREE.Vector3(
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.3
      );

      group.add(mesh);
    }

    const start = performance.now();
    const duration = 1400;

    const animateParticles = () => {
      const elapsed = performance.now() - start;
      const t = Math.min(elapsed / duration, 1);
      if (t >= 1) {
        group.children.forEach((mesh) => {
          mesh.geometry.dispose();
          mesh.material.dispose();
        });
        scene.remove(group);
        return;
      }

      group.children.forEach((mesh) => {
        mesh.position.add(mesh.userData.velocity.clone().multiplyScalar(0.016));
        mesh.userData.velocity.y -= 0.08 * speedMultiplier;
        mesh.rotation.x += mesh.userData.spin.x;
        mesh.rotation.y += mesh.userData.spin.y;
        mesh.rotation.z += mesh.userData.spin.z;
        mesh.material.opacity = 1 - t;
      });

      requestAnimationFrame(animateParticles);
    };

    animateParticles();
  }

  function spawnSmokePuff(origin, color, scaleMultiplier = 1) {
    const group = new THREE.Group();
    scene.add(group);

    for (let i = 0; i < 4; i++) {
      const geometry = new THREE.IcosahedronGeometry(
        0.6 * scaleMultiplier + i * 0.2,
        1
      );
      const material = new THREE.MeshStandardMaterial({
        color,
        transparent: true,
        opacity: 0.35,
        flatShading: true,
        side: THREE.DoubleSide,
      });

      const puff = new THREE.Mesh(geometry, material);
      puff.position.copy(origin);
      puff.position.y += 1.2 + i * 0.4;
      puff.userData.rise = 0.02 + Math.random() * 0.02;
      puff.userData.expand = 0.01 + Math.random() * 0.01;

      group.add(puff);
    }

    const start = performance.now();
    const duration = 1200;

    const animateSmoke = () => {
      const elapsed = performance.now() - start;
      const t = Math.min(elapsed / duration, 1);
      if (t >= 1) {
        group.children.forEach((puff) => {
          puff.geometry.dispose();
          puff.material.dispose();
        });
        scene.remove(group);
        return;
      }

      group.children.forEach((puff) => {
        puff.position.y += puff.userData.rise;
        const scale = 1 + puff.userData.expand * elapsed * 0.5;
        puff.scale.setScalar(scale);
        puff.material.opacity = 0.35 * (1 - t);
        puff.rotation.y += 0.01;
      });

      requestAnimationFrame(animateSmoke);
    };

    animateSmoke();
  }

  function spawnGlowPulse(treeGroup, color, scaleMultiplier = 1, duration = 900) {
    const geometry = new THREE.RingGeometry(
      0.6 * scaleMultiplier,
      1.1 * scaleMultiplier,
      24
    );
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });

    const ring = new THREE.Mesh(geometry, material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.4;

    const group = new THREE.Group();
    group.add(ring);
    treeGroup.add(group);

    const start = performance.now();

    const animateGlow = () => {
      const elapsed = performance.now() - start;
      const t = Math.min(elapsed / duration, 1);
      if (t >= 1) {
        treeGroup.remove(group);
        geometry.dispose();
        material.dispose();
        return;
      }

      const pulse = Math.sin(t * Math.PI);
      ring.material.opacity = 0.6 * pulse;
      ring.scale.setScalar(1 + t * 4 * scaleMultiplier);

      requestAnimationFrame(animateGlow);
    };

    animateGlow();
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
        leaves.slice(-2).forEach(
          (leaf, idx) => (leaf.rotation.z = idx === 0 ? -0.8 : 0.8)
        );

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
        addLeaf(canopyGeo.clone(), new THREE.Vector3(-0.5, stageHeight * 1.2, -0.3));
        addLeaf(canopyGeo.clone(), new THREE.Vector3(0.5, stageHeight * 1.2, 0.3));

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
        addLeaf(primaryCanopy.clone(), new THREE.Vector3(-0.7, stageHeight * 1.3, -0.4));
        addLeaf(primaryCanopy.clone(), new THREE.Vector3(0.7, stageHeight * 1.3, 0.4));
        addLeaf(primaryCanopy.clone(), new THREE.Vector3(0, stageHeight * 1.2, 0.7));

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
          const fruit = new THREE.Mesh(
            fruitGeometry,
            accentMaterial.clone()
          );
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

  function switchTreeStage(treeData, nextStage) {
    if (treeData.stageVisual) {
      treeData.group.remove(treeData.stageVisual);
    }

    const visuals = createStageVisual(nextStage, treeData.baseHeight);
    treeData.group.add(visuals.group);

    treeData.stage = nextStage;
    treeData.stageVisual = visuals.group;
    treeData.trunkMesh = visuals.trunk;
    treeData.leafMeshes = visuals.leaves;
    treeData.accentMeshes = visuals.accents;
  }

  function getScaleForGrowth(growth) {
    const safeGrowth = Math.max(0, Math.min(100, growth ?? 0));
    return 0.35 + (safeGrowth / 100) * 0.75;
  }

  function startGrowthAnimation(treeData, targetGrowth, options = {}) {
    const now = performance.now();
    const currentScale = treeData.group.scale.x || 0.35;
    const finalScale = getScaleForGrowth(targetGrowth);
    const overshootMultiplier = options.overshootMultiplier ?? 1.18;
    const duration = options.duration ?? 1200;

    treeData.group.userData.growthState.animation = {
      start: now,
      duration,
      initialScale: currentScale,
      finalScale,
      overshootScale: finalScale * overshootMultiplier,
      waveIntensity: options.waveIntensity ?? 0.08,
      wobbleStrength: options.wobbleStrength ?? 0.06,
    };
  }

  function applyGrowthAnimation(treeData, timestampMs) {
    const state = treeData.group.userData.growthState;
    const animation = state.animation;
    if (!animation) {
      const targetScale = getScaleForGrowth(treeData.group.userData.growth ?? 0);
      const smoothScale = THREE.MathUtils.lerp(
        treeData.group.scale.x || targetScale,
        targetScale,
        0.08
      );
      treeData.group.scale.setScalar(smoothScale);
      if (treeData.stageVisual) {
        treeData.stageVisual.rotation.z = THREE.MathUtils.lerp(
          treeData.stageVisual.rotation.z,
          0,
          0.12
        );
        treeData.stageVisual.rotation.x = THREE.MathUtils.lerp(
          treeData.stageVisual.rotation.x,
          0,
          0.12
        );
      }
      return;
    }

    const elapsed = timestampMs - animation.start;
    const t = Math.min(elapsed / animation.duration, 1);

    let scaleValue = animation.finalScale;
    const stageVisual = treeData.stageVisual;

    if (t < 0.35) {
      const stretchT = t / 0.35;
      const easeOut = 1 - Math.pow(1 - stretchT, 3);
      scaleValue = THREE.MathUtils.lerp(
        animation.initialScale,
        animation.overshootScale,
        easeOut
      );
      if (stageVisual) {
        const wobble = Math.sin(stretchT * Math.PI * 3) * animation.wobbleStrength;
        stageVisual.rotation.z = wobble;
      }
    } else if (t < 0.7) {
      const waveT = (t - 0.35) / 0.35;
      const damping = 1 - waveT;
      const oscillation = Math.sin(waveT * Math.PI * 6) * animation.waveIntensity * damping;
      scaleValue = animation.finalScale + oscillation;
      if (stageVisual) {
        stageVisual.rotation.z = Math.sin(waveT * Math.PI * 5) * animation.waveIntensity * 2 * damping;
        stageVisual.rotation.x = Math.cos(waveT * Math.PI * 4) * animation.waveIntensity * damping * 0.5;
      }
    } else {
      const settleT = (t - 0.7) / 0.3;
      const ease = 1 - Math.pow(1 - settleT, 4);
      scaleValue = THREE.MathUtils.lerp(
        animation.overshootScale,
        animation.finalScale,
        ease
      );
      if (stageVisual) {
        stageVisual.rotation.z = THREE.MathUtils.lerp(
          stageVisual.rotation.z,
          0,
          0.2
        );
        stageVisual.rotation.x = THREE.MathUtils.lerp(
          stageVisual.rotation.x,
          0,
          0.2
        );
      }
    }

    treeData.group.scale.setScalar(scaleValue);

    if (t >= 1) {
      treeData.group.scale.setScalar(animation.finalScale);
      state.animation = null;
    }
  }

  function triggerGrowthPulse(treeData, stageData, currentGrowth) {
    const group = treeData.group;
    const origin = group.position.clone();

    spawnAuraWave(group, stageData.accentColor, 1);
    spawnParticleBurst(origin, stageData.particleColor, 12, 1);
    spawnSmokePuff(origin, stageData.accentColor, 0.9);
    spawnGlowPulse(group, stageData.glowColor, 1, 900);

    startGrowthAnimation(treeData, currentGrowth, {
      overshootMultiplier: stageData.overshootMultiplier,
      waveIntensity: 0.08,
    });
  }

  function triggerStageEvolution(treeData, nextStage, currentGrowth) {
    const stageData = getStageData(nextStage);
    const group = treeData.group;
    const origin = group.position.clone();

    spawnAuraWave(group, stageData.glowColor, 1.35, 1100);
    spawnParticleBurst(origin, stageData.particleColor, 24, 1.4);
    spawnSmokePuff(origin, stageData.accentColor, 1.2);
    spawnGlowPulse(group, stageData.glowColor, 1.3, 1200);

    switchTreeStage(treeData, nextStage);

    startGrowthAnimation(treeData, currentGrowth, {
      overshootMultiplier: stageData.overshootMultiplier + 0.1,
      waveIntensity: 0.12,
      duration: 1400,
      wobbleStrength: 0.1,
    });
  }

  function createTree({
    position = new THREE.Vector3(),
    height = 8,
    initialStage = "GERMINATION",
    scale = 0.1,
  } = {}) {
    const treeGroup = new THREE.Group();
    treeGroup.position.copy(position);
    treeGroup.scale.set(scale, scale, scale);
    scene.add(treeGroup);

    const visuals = createStageVisual(initialStage, height);
    treeGroup.add(visuals.group);

    const treeData = {
      group: treeGroup,
      baseHeight: height,
      stage: initialStage,
      stageVisual: visuals.group,
      trunkMesh: visuals.trunk,
      leafMeshes: visuals.leaves,
      accentMeshes: visuals.accents,
    };

    treeGroup.userData.growth = 0;
    treeGroup.userData.growthState = {
      lastStage: initialStage,
      nextEffectThreshold: 1,
      animation: null,
      initialized: false,
    };

    return treeData;
  }

  function updateTreeLifecycle(treeData, { growth, elapsedTime, nowMs }) {
    const { group } = treeData;
    const safeGrowth = Math.max(0, Math.min(100, growth ?? 0));
    group.userData.growth = safeGrowth;

    const state = group.userData.growthState ?? (group.userData.growthState = {
      lastStage: getGrowthStage(safeGrowth),
      nextEffectThreshold: Math.floor(Math.max(0, safeGrowth)) + 1,
      animation: null,
      initialized: true,
    });

    if (!state.initialized) {
      state.lastStage = getGrowthStage(safeGrowth);
      state.nextEffectThreshold = Math.floor(Math.max(0, safeGrowth)) + 1;
      state.initialized = true;
      if (treeData.stage !== state.lastStage) {
        switchTreeStage(treeData, state.lastStage);
      }
      const initialScale = getScaleForGrowth(safeGrowth);
      treeData.group.scale.setScalar(initialScale);
    }

    const desiredStage = getGrowthStage(safeGrowth);
    if (desiredStage !== state.lastStage) {
      clearScheduledEffects(treeData);
      triggerStageEvolution(treeData, desiredStage, safeGrowth);
      state.lastStage = desiredStage;
      state.nextEffectThreshold = Math.floor(Math.max(0, safeGrowth)) + 1;
    }

    if (safeGrowth < state.nextEffectThreshold - 1) {
      state.nextEffectThreshold = Math.floor(Math.max(0, safeGrowth)) + 1;
    }

    let effectIndex = 0;
    while (safeGrowth >= state.nextEffectThreshold && state.nextEffectThreshold <= 100) {
      const currentStageData = getStageData(desiredStage);
      const delay = effectIndex * 160;
      const scheduledGrowth = safeGrowth;
      const timeout = setTimeout(() => {
        triggerGrowthPulse(treeData, currentStageData, scheduledGrowth);
      }, delay);
      registerTimeout(treeData, timeout);
      state.nextEffectThreshold += 1;
      effectIndex += 1;
    }

    applyGrowthAnimation(treeData, nowMs);

    const pulse =
      0.7 + Math.sin(elapsedTime * 2 + group.position.x * 0.2) * 0.15;
    treeData.accentMeshes?.forEach((accent) => {
      if (accent.material) {
        accent.material.opacity = THREE.MathUtils.clamp(
          0.4 + pulse * 0.5,
          0.3,
          1
        );
      }
    });

    const stageVisual = treeData.stageVisual;
    if (stageVisual) {
      stageVisual.children.forEach((child) => {
        const material = child.material;
        if (material?.userData?.time) {
          material.userData.time.value = elapsedTime;
        }
      });
    }
  }

  function disposeTree(treeData) {
    clearScheduledEffects(treeData);
    scene.remove(treeData.group);
  }

  return {
    createTree,
    switchTreeStage,
    getScaleForGrowth,
    startGrowthAnimation,
    updateTreeLifecycle,
    clearScheduledEffects,
    disposeTree,
  };
}
