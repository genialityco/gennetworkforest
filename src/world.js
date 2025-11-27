// world.js (o como lo tengas llamado)
import * as THREE from "three";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ImprovedNoise } from "three/examples/jsm/math/ImprovedNoise.js";
import { createNoise3D } from "simplex-noise";
import {
  doc,
  onSnapshot,
  collection,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "./firebaseConfig.js";

const treesCollection = collection(db, "trees");
const treeObjects = new Map(); // key: treeId, value: tree metadata (group, stage visuals, etc.)

let scene,
  camera,
  renderer,
  composer,
  clock,
  mixers = [],
  trees = [],
  terrain,
  ice,
  sky,
  clouds;
// Declare global variables for new elements
let sun, sunlight, butterflies, birds, frogs;

// Tree counting
let treeCount = 0;
let MAX_TREES = 200; // Number of trees needed for 100% progress

const treesRef = doc(db, "globalCounters", "treesCounter");
const configRef = doc(db, "adminConfig", "sceneConfig");
const noise3D = createNoise3D();

// -----------------------------------------------------------------------------
// 🌱 Growth stages configuration & helpers
// -----------------------------------------------------------------------------
const GROWTH_STAGES = [
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

function getGrowthStage(growth) {
  const safeGrowth = Math.max(0, Math.min(100, growth ?? 0));
  const stage = GROWTH_STAGES.find(
    (entry) => safeGrowth >= entry.min && safeGrowth < entry.max
  );
  return stage ? stage.id : "ADULT";
}

function getStageData(stageId) {
  return STAGE_BY_ID[stageId] ?? STAGE_BY_ID.ADULT;
}

// -----------------------------------------------------------------------------
// ✨ Low-poly VFX helpers
// -----------------------------------------------------------------------------
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
      return;
    }

    const pulse = Math.sin(t * Math.PI);
    aura.material.opacity = 0.35 * pulse;
    aura.scale.setScalar(1 + t * 0.9);

    requestAnimationFrame(animateAura);
  };

  animateAura();
}

function spawnParticleBurst(
  origin,
  color,
  baseCount = 12,
  speedMultiplier = 1
) {
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
      return;
    }

    const pulse = Math.sin(t * Math.PI);
    ring.material.opacity = 0.6 * pulse;
    ring.scale.setScalar(1 + t * 4 * scaleMultiplier);

    requestAnimationFrame(animateGlow);
  };

  animateGlow();
}

// Audio
let winterAudio, springAudio;
let isWinterAudioPlaying = false;
let isSpringAudioPlaying = false;

// Flag para saber si el usuario ha permitido reproducir audio
let hasUserAllowedAudio = false;

// -----------------------------------------------------------------------------
// Tarima frontal (hasta 10 árboles destacados)
// -----------------------------------------------------------------------------
// 1 fila con 10 árboles destacados
const STAGE_SLOTS = 10;
const stageSlots = new Array(STAGE_SLOTS).fill(null);

let stageInfoCards = new Array(STAGE_SLOTS).fill(null); // cards HTML por slot

let lastPrimaryHighlightedId = null;
let recentHighlightTimeout = null;

const MAIN_STAGE_SLOT_INDEX = 5;

// Todos con el mismo z (más o menos al frente de la cámara)
// y x repartidos simétricamente
const stagePositions = [
  { x: -30, z: 23 },
  { x: -28, z: 10 },
  { x: -16, z: 25 },
  { x: -12, z: 10 },
  { x: -4.5, z: 27 },
  { x: 4.5, z: 27 },
  { x: 12, z: 10 },
  { x: 16, z: 25 },
  { x: 28, z: 10 },
  { x: 30, z: 23 },
];

// -----------------------------------------------------------------------------
// Firestore listeners
// -----------------------------------------------------------------------------

function listenToTrees() {
  onSnapshot(
    treesCollection,
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const docId = change.doc.id;
        const data = change.doc.data();

        if (change.type === "added") {
          const { x, z } = data;
          const height = 5 + Math.random() * 3;
          const treeObj = createTree(x, z, height);

          treeObj.group.userData = {
            treeId: docId,
            userName: data.userName,
            dream: data.dream,
            growth: data.growth ?? 0,
            state: data.state ?? "SEED",
            originalPosition: treeObj.group.position.clone(),
          };

          const initialGrowth = treeObj.group.userData.growth;
          const initialStage = getGrowthStage(initialGrowth);
          treeObj.group.userData.growthState = {
            lastStage: initialStage,
            nextEffectThreshold: Math.floor(Math.max(0, initialGrowth)) + 1,
            animation: null,
            initialized: true,
          };

          if (treeObj.stage !== initialStage) {
            switchTreeStage(treeObj, initialStage);
          }
          const initialScale = getScaleForGrowth(initialGrowth);
          treeObj.group.scale.setScalar(initialScale);

          const nameLabel = createTextLabel(data.userName, "#fffaf0");
          nameLabel.position.set(0, height + 7.5, 0);

          const dreamLabel = createTextLabel(`"${data.dream}"`, "#ffd6e9");
          dreamLabel.position.set(0, height + 6.2, 0);

          treeObj.group.add(nameLabel);
          treeObj.group.add(dreamLabel);

          treeObjects.set(docId, treeObj);

          treeCount++;
          treeCount = Math.min(treeCount, MAX_TREES);
        }

        if (change.type === "modified") {
          const treeObj = treeObjects.get(docId);
          if (treeObj) {
            treeObj.group.userData.growth = data.growth ?? 0;
            treeObj.group.userData.state = data.state ?? "SEED";
          }
        }

        if (change.type === "removed") {
          const treeObj = treeObjects.get(docId);
          if (treeObj) {
            scene.remove(treeObj.group);
            treeObjects.delete(docId);
            treeCount = Math.max(treeCount - 1, 0);
          }
        }
      });

      // 🔹 Actualizar el contador visible según los árboles que realmente están en escena
      updateTreesCounterUI();
    },
    (error) => {
      console.error("Error fetching trees:", error);
    }
  );
}

/**
 * Solo para leer el contador global y mostrarlo en el overlay.
 * Ya NO crea árboles. Los árboles vienen de la colección `trees`.
 */
// function listenToTreesCount() {
//   onSnapshot(
//     treesRef,
//     (docSnapshot) => {
//       if (docSnapshot.exists()) {
//         const data = docSnapshot.data();
//         const el = document.getElementById("treesValue");
//         if (el) el.innerText = data.trees;
//       } else {
//         const el = document.getElementById("treesValue");
//         if (el) el.innerText = "0";
//       }
//     },
//     (error) => {
//       console.error("Error fetching trees count:", error);
//     }
//   );
// }

function listenToSceneConfig() {
  onSnapshot(
    configRef,
    (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        if (data.maxTrees !== undefined) {
          MAX_TREES = data.maxTrees;
          console.log("maxTrees actualizado desde Firestore:", MAX_TREES);
        }
      }
    },
    (error) => {
      console.error("Error fetching scene config:", error);
    }
  );
}

// Árboles que han pedido ser vistos recientemente (para la tarima frontal)
function listenToHighlightTrees() {
  const q = query(
    treesCollection,
    orderBy("lastViewRequestAt", "desc"),
    limit(10)
  );

  onSnapshot(
    q,
    (snapshot) => {
      // 1) Conjunto de árboles que DEBEN estar destacados ahora
      const newHighlightedIds = new Set();
      snapshot.forEach((docSnap) => {
        newHighlightedIds.add(docSnap.id);
      });

      // 2) Restaurar árboles que estaban en la tarima y ya NO están en el top 10
      for (let i = 0; i < stageSlots.length; i++) {
        const oldId = stageSlots[i];
        if (!oldId) continue;

        if (!newHighlightedIds.has(oldId)) {
          const oldTree = treeObjects.get(oldId);
          if (oldTree) {
            const original = oldTree.group.userData.originalPosition;
            if (original) {
              oldTree.group.position.copy(original);
            }

            // volver a mostrar sus labels 3D
            oldTree.group.children.forEach((child) => {
              if (child.isSprite && child.userData.isLabel) {
                child.visible = true;
              }
            });

            // quitar halo si existe
            const halo = oldTree.group.getObjectByName("stageHalo");
            if (halo) {
              oldTree.group.remove(halo);
            }
          }

          stageSlots[i] = null;
        }
      }

      // 3) Limpiamos asignaciones actuales de la tarima
      for (let i = 0; i < stageSlots.length; i++) {
        stageSlots[i] = null;
      }

      // 4) Obtenemos IDs en orden (el primero es el más reciente)
      const docIds = [];
      snapshot.forEach((docSnap) => {
        docIds.push(docSnap.id);
      });

      if (docIds.length === 0) {
        // No hay destacados
        lastPrimaryHighlightedId = null;
        highlightPrimaryStageCard(null);
        return;
      }

      const mainId = docIds[0];

      // 5) Asignar el más reciente al slot central
      stageSlots[MAIN_STAGE_SLOT_INDEX] = mainId;

      // 6) Asignar el resto a cualquier slot libre
      let slotCursor = 0;
      for (let idx = 1; idx < docIds.length; idx++) {
        const treeId = docIds[idx];

        // Buscar el siguiente slot libre
        while (slotCursor < STAGE_SLOTS && stageSlots[slotCursor] !== null) {
          slotCursor++;
        }
        if (slotCursor >= STAGE_SLOTS) break;

        stageSlots[slotCursor] = treeId;
      }

      // 7) Mover árboles a sus posiciones de tarima
      for (let i = 0; i < STAGE_SLOTS; i++) {
        const treeId = stageSlots[i];
        if (!treeId) continue;
        if (!treeObjects.has(treeId)) continue;
        moveTreeToStage(treeId);
      }

      // 8) Si el destacado principal cambió, disparamos el efecto visual en su label
      if (mainId !== lastPrimaryHighlightedId) {
        highlightPrimaryStageCard(mainId);
        lastPrimaryHighlightedId = mainId;
      }
    },
    (error) => {
      console.error("Error en highlight trees:", error);
    }
  );
}

function createOverlayFrame() {
  const frameDiv = document.createElement("div");

  // Estilos para que cubra toda la pantalla
  frameDiv.style.position = "absolute";
  frameDiv.style.top = "0";
  frameDiv.style.left = "0";
  frameDiv.style.width = "100%";
  frameDiv.style.height = "100%";

  // La imagen del marco
  frameDiv.style.backgroundImage = 'url("/imagenes/MARCO.png")';
  frameDiv.style.backgroundSize = "100% 100%"; // Estirar para cubrir todo
  frameDiv.style.backgroundRepeat = "no-repeat";

  // Z-Index alto para estar encima del canvas (el canvas suele estar en 0)
  frameDiv.style.zIndex = "10";

  // CRÍTICO: Esto permite que los clics pasen a través de la imagen
  // y lleguen al canvas 3D para mover la cámara.
  frameDiv.style.pointerEvents = "none";

  document.body.appendChild(frameDiv);
}

function createScoreUI() {
  // 1. El contenedor con la imagen de fondo
  const scoreContainer = document.createElement("div");
  scoreContainer.style.position = "absolute";
  // Ajusta la posición donde quieras el puntaje (ej: arriba a la izquierda)
  scoreContainer.style.top = "10px";
  scoreContainer.style.right = "10px";
  // Ajusta el tamaño según tu imagen PUNTAJE.png
  scoreContainer.style.width = "180px";
  scoreContainer.style.height = "80px";

  // Imagen de fondo
  scoreContainer.style.backgroundImage = 'url("/imagenes/PUNTAJE.png")';
  scoreContainer.style.backgroundSize = "100% 100%"; // Ajustar imagen al contenedor
  scoreContainer.style.backgroundRepeat = "no-repeat";

  // Flexbox para centrar el número perfectamente en la imagen
  scoreContainer.style.display = "flex";
  scoreContainer.style.justifyContent = "center"; // Centrado horizontal
  scoreContainer.style.alignItems = "center"; // Centrado vertical

  scoreContainer.style.zIndex = "20"; // Encima del marco (que tiene zIndex 10)
  scoreContainer.style.pointerEvents = "none"; // Para que no bloquee clics

  // 2. El elemento de texto que solo tendrá el número
  const numberSpan = document.createElement("span");
  numberSpan.id = "treesValue"; // IMPORTANTE: Este ID es el que busca tu listenToTreesCount
  numberSpan.innerText = "0";

  // Estilos del texto (número)
  numberSpan.style.color = "#ffffff"; // Color blanco (ajusta según tu imagen)
  numberSpan.style.fontFamily = "system-ui, sans-serif";
  numberSpan.style.fontSize = "32px"; // Tamaño grande
  numberSpan.style.fontWeight = "bold";
  numberSpan.style.textShadow = "2px 2px 4px rgba(0,0,0,0.5)"; // Sombra para legibilidad

  // Opcional: Si la imagen tiene el espacio para el texto desplazado, usa padding
  numberSpan.style.paddingRight = "110px";

  scoreContainer.appendChild(numberSpan);
  document.body.appendChild(scoreContainer);
}

function createStageInfoUI() {
  const container = document.createElement("div");
  container.id = "stageInfoContainer";
  container.style.position = "absolute";
  container.style.top = "0";
  container.style.left = "0";
  container.style.width = "100%";
  container.style.height = "100%";
  container.style.pointerEvents = "none";
  container.style.zIndex = "210";
  document.body.appendChild(container);

  stageInfoCards = stageSlots.map((_, index) => {
    const card = document.createElement("div");
    card.style.position = "absolute";
    card.style.minWidth = "180px";
    card.style.maxWidth = "220px";
    card.style.padding = "10px 12px 8px";
    card.style.borderRadius = "12px";
    card.style.background =
      "linear-gradient(135deg, rgba(0,0,0,0.78), rgba(0,0,0,0.6))";
    card.style.boxShadow = "0 12px 25px rgba(0,0,0,0.5)";
    card.style.color = "#ffffff";
    card.style.fontFamily =
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    card.style.fontSize = "12px";
    card.style.opacity = "0";
    card.style.transform = "translate(-50%, 0)";
    card.style.transition = "opacity 0.25s ease-out";
    card.style.pointerEvents = "none";
    card.style.overflow = "visible";
    card.style.textAlign = "left";
    card.style.transition =
      "opacity 0.25s ease-out, transform 0.25s ease-out, box-shadow 0.25s ease-out";

    card.innerHTML = `
      <!-- Pointer que apunta al árbol -->
      <div
        class="stage-card-pointer-line"
        style="
          position:absolute;
          top:-22px;
          left:50%;
          transform:translateX(-50%);
          width:2px;
          height:18px;
          background:linear-gradient(
            to top,
            rgba(255,255,255,0.8),
            rgba(255,255,255,0)
          );
          opacity:0.9;
        "
      ></div>
      <div
        class="stage-card-pointer-dot"
        style="
          position:absolute;
          top:-26px;
          left:50%;
          transform:translateX(-50%);
          width:8px;
          height:8px;
          border-radius:999px;
          background:rgba(255,255,255,0.95);
          box-shadow:0 0 10px rgba(255,255,255,0.8);
        "
      ></div>

      <div style="font-size:10px; letter-spacing:0.14em; text-transform:uppercase; opacity:.7;">
        Árbol de
      </div>
      <div class="stage-card-name" style="font-size:22px; font-weight:600; margin-top:2px; margin-bottom:4px;">
        ---
      </div>
      <div class="stage-card-dream" style="font-size:18px; line-height:1.4; opacity:.9;">
        “...”
      </div>
    `;

    container.appendChild(card);
    return card;
  });
}

function highlightPrimaryStageCard(treeId) {
  if (!stageInfoCards || !stageSlots) return;

  // Quitar highlight anterior
  stageInfoCards.forEach((card) => {
    if (!card) return;
    card.style.boxShadow = "0 12px 25px rgba(0,0,0,0.5)";
    card.style.transform = "translate(-50%, 0) scale(1)";
    const badge = card.querySelector(".stage-card-badge");
    if (badge) {
      badge.style.opacity = "0";
    }
  });

  if (!treeId) return;

  const slotIndex = stageSlots.indexOf(treeId);
  if (slotIndex === -1) return;

  const card = stageInfoCards[slotIndex];
  if (!card) return;

  // Pequeño glow + escala para resaltar
  card.style.boxShadow =
    "0 0 0 2px rgba(255, 215, 0, 0.85), 0 0 30px rgba(255, 215, 0, 0.75)";
  card.style.transform = "translate(-50%, 0) scale(1.08)";

  // Badge "Nuevo destacado ✨"
  let badge = card.querySelector(".stage-card-badge");
  if (!badge) {
    badge = document.createElement("div");
    badge.className = "stage-card-badge";
    badge.textContent = "Nuevo destacado ✨";
    badge.style.position = "absolute";
    badge.style.top = "-10px";
    badge.style.right = "-4px";
    badge.style.padding = "3px 8px";
    badge.style.borderRadius = "999px";
    badge.style.fontSize = "9px";
    badge.style.fontWeight = "600";
    badge.style.letterSpacing = "0.08em";
    badge.style.textTransform = "uppercase";
    badge.style.background = "linear-gradient(135deg,#ffd54f,#ffb300)";
    badge.style.color = "#2b1900";
    badge.style.boxShadow = "0 0 12px rgba(0,0,0,0.5)";
    badge.style.opacity = "0";
    badge.style.transition = "opacity 0.25s ease-out";
    card.appendChild(badge);
  }
  badge.style.opacity = "1";

  // Limpiar timeout anterior si existía
  if (recentHighlightTimeout) {
    clearTimeout(recentHighlightTimeout);
  }

  // Después de unos segundos se apaga el efecto
  recentHighlightTimeout = setTimeout(() => {
    card.style.boxShadow = "0 12px 25px rgba(0,0,0,0.5)";
    card.style.transform = "translate(-50%, 0) scale(1)";
    if (badge) {
      badge.style.opacity = "0";
    }
  }, 4000); // 4 segundos de "nuevo destacado"

  // --- NUEVO: ACTIVAR EFECTO 3D EN EL ÁRBOL ---
  // Buscamos el objeto 3D usando el ID
  if (treeObjects.has(treeId)) {
    const treeObj = treeObjects.get(treeId);
    if (treeObj && treeObj.group) {
      // Lanzamos el haz de luz y el brillo
      spawnHighlightBeam(treeObj.group);
    }
  }
}

function updateTreesCounterUI() {
  const el = document.getElementById("treesValue");
  if (!el) return;

  // Número real de árboles que están en memoria / escena
  const totalTrees = treeObjects.size;
  el.innerText = String(totalTrees);
}

function createLogoUI() {
  const logoContainer = document.createElement("div");

  // Estilos de posición
  logoContainer.style.position = "absolute";
  logoContainer.style.top = "20px"; // Un poco de margen superior
  logoContainer.style.left = "20px"; // Lado IZQUIERDO (el espacio vacío)

  // Ajusta este ancho según el tamaño real de tu logo
  logoContainer.style.width = "200px";
  logoContainer.style.height = "auto";

  // Z-Index alto para estar encima del canvas y del marco
  logoContainer.style.zIndex = "25";

  // Ignorar clics para no bloquear la interacción 3D
  logoContainer.style.pointerEvents = "none";

  // Crear la imagen
  const img = document.createElement("img");
  img.src = "/imagenes/Logo-congreso-v2.png";
  img.style.width = "100%"; // Se ajusta al ancho del contenedor
  img.style.height = "auto";
  img.style.display = "block"; // Evita espacios extra debajo de la imagen

  logoContainer.appendChild(img);
  document.body.appendChild(logoContainer);
}

// -----------------------------------------------------------------------------
// ✨ Nuevo efecto: Highlight Beam (Haz de luz para destacados)
// -----------------------------------------------------------------------------
function spawnHighlightBeam(treeGroup) {
  // 1. El Haz de Luz (Cilindro alto y transparente)
  const beamHeight = 40;
  const beamGeometry = new THREE.CylinderGeometry(
    0.5,
    4,
    beamHeight,
    32,
    1,
    true
  );
  // Usamos AdditiveBlending para que parezca luz pura
  const beamMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd700, // Dorado
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false, // Importante para que no oculte cosas detrás
  });

  const beam = new THREE.Mesh(beamGeometry, beamMaterial);
  beam.position.y = beamHeight / 2; // Para que empiece desde el suelo hacia arriba
  treeGroup.add(beam);

  // 2. Partículas ascendentes (Brillitos subiendo)
  const particleGroup = new THREE.Group();
  treeGroup.add(particleGroup);
  const particles = [];
  const particleCount = 20;

  for (let i = 0; i < particleCount; i++) {
    const pGeo = new THREE.PlaneGeometry(0.5, 0.5);
    const pMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const p = new THREE.Mesh(pGeo, pMat);
    p.position.set(
      (Math.random() - 0.5) * 3,
      Math.random() * 10,
      (Math.random() - 0.5) * 3
    );
    p.userData = { speed: 0.1 + Math.random() * 0.2 };
    particleGroup.add(p);
    particles.push(p);
  }

  // 3. Animación
  const start = performance.now();
  const duration = 4000; // 4 segundos (igual que la card)

  // Guardar materiales originales para el pulso del árbol
  const meshesToPulse = [];
  treeGroup.traverse((child) => {
    if (child.isMesh && child.material && child.material.emissive) {
      meshesToPulse.push({
        mesh: child,
        originalEmissiveIntensity: child.material.emissiveIntensity || 0,
      });
    }
  });

  const animateBeam = () => {
    const elapsed = performance.now() - start;
    const t = Math.min(elapsed / duration, 1);

    if (t >= 1) {
      // Limpieza
      treeGroup.remove(beam);
      treeGroup.remove(particleGroup);

      // Restaurar intensidad original del árbol
      meshesToPulse.forEach((item) => {
        item.mesh.material.emissiveIntensity = item.originalEmissiveIntensity;
      });
      return;
    }

    // Curva de opacidad: Entra rápido, se mantiene y sale suave
    // Sin(t * PI) crea una curva de campana (0 -> 1 -> 0)
    const opacityCurve = Math.sin(t * Math.PI);

    // Animar haz de luz
    beam.material.opacity = 0.4 * opacityCurve;
    beam.rotation.y += 0.02; // Girar suavemente

    // Animar partículas
    particles.forEach((p) => {
      p.position.y += p.userData.speed;
      p.rotation.z += 0.1;
      p.material.opacity = opacityCurve;
      if (p.position.y > 15) p.position.y = 0; // Reiniciar si suben mucho
      p.lookAt(camera.position); // Billboard
    });

    // Animar pulso del árbol (Emissive boost)
    // Aumentamos la intensidad emisiva para que brille con el Bloom
    meshesToPulse.forEach((item) => {
      // Base + extra por el highlight
      item.mesh.material.emissiveIntensity =
        item.originalEmissiveIntensity + 0.8 * opacityCurve;
      // Opcional: forzar un color emisivo dorado si el original es muy oscuro
      // item.mesh.material.emissive.setHex(0xffaa00);
    });

    requestAnimationFrame(animateBeam);
  };

  animateBeam();
}

// -----------------------------------------------------------------------------
// Init escena
// -----------------------------------------------------------------------------

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcccccc);

  camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    2000
  );
  camera.position.set(0, 16, 55);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  document.body.appendChild(renderer.domElement);

  clock = new THREE.Clock();

  // Light
  const ambient = new THREE.AmbientLight(0xffffff, 0.9);
  scene.add(ambient);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(5, 10, 5);
  scene.add(directionalLight);

  // Fog (aunque el mundo está en primavera, dejamos fog suave si quieres)
  scene.fog = new THREE.Fog(0xaaaaaa, 15, 85);
  // Basic scene objects
  createSky();
  createClouds();
  createTerrain();
  createIceLayer();
  createSun();
  createButterflies();
  createBirds();
  createFrogs();

  // Marco
  createOverlayFrame();
  createScoreUI();
  createStageInfoUI(); // cards por árbol destacado

  createLogoUI();

  // Botón de audio
  addAudioStartButton();

  // Listeners Firestore
  listenToTrees(); // árboles individuales (nombre + sueño + growth)
  // listenToTreesCount(); // contador global para overlay
  listenToSceneConfig(); // configuración (MAX_TREES, etc.)
  listenToHighlightTrees(); // árboles destacados en pantalla

  // Audios (usando rutas en /public)
  winterAudio = new Audio("/8Room-Cyberpunk-Matrix.mp3");
  springAudio = new Audio("/birds-frogs-nature-8257.mp3");
  winterAudio.loop = true;
  springAudio.loop = true;

  // Setup post-processing with Bloom and color grading
  composer = new EffectComposer(renderer);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // Add Bloom effect for visual enhancement
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.4, // strength
    0.4, // radius
    0.75 // threshold
  );
  composer.addPass(bloomPass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  animate();
}

/**
 * Botón para “Start Audio” (permite al usuario autorizar reproducción).
 */
function addAudioStartButton() {
  const audioButton = document.createElement("button");
  audioButton.id = "audioStartButton";
  audioButton.textContent = "▶";
  audioButton.style.position = "absolute";
  audioButton.style.bottom = "20px";
  audioButton.style.left = "20px";
  audioButton.style.zIndex = "100";
  audioButton.style.padding = "5px 10px";
  document.body.appendChild(audioButton);

  audioButton.addEventListener("click", () => {
    hasUserAllowedAudio = true;
    // Mundo en primavera → reproducimos directamente el audio de primavera
    springAudio.play().catch((err) => console.log(err));
    isSpringAudioPlaying = true;
  });
}

// -----------------------------------------------------------------------------
// Objetos de escena
// -----------------------------------------------------------------------------

function createSun() {
  // Geometría del sol con más segmentos para suavidad
  const sunGeometry = new THREE.SphereGeometry(2, 64, 64);

  // Material con emisión para que brille
  const sunMaterial = new THREE.MeshBasicMaterial({
    color: 0xfff4e6, // Amarillo más natural
    emissive: 0xffd700,
    emissiveIntensity: 1,
  });

  sun = new THREE.Mesh(sunGeometry, sunMaterial);
  sun.position.set(30, 30, -50);
  sun.visible = false;
  scene.add(sun);

  // Halo exterior del sol (glow effect)
  const glowGeometry = new THREE.SphereGeometry(2.5, 64, 64);
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0xffaa00,
    transparent: true,
    opacity: 0.3,
    side: THREE.BackSide,
  });
  const sunGlow = new THREE.Mesh(glowGeometry, glowMaterial);
  sun.add(sunGlow);

  // Segundo halo más suave
  const glow2Geometry = new THREE.SphereGeometry(3.2, 64, 64);
  const glow2Material = new THREE.MeshBasicMaterial({
    color: 0xffdd88,
    transparent: true,
    opacity: 0.15,
    side: THREE.BackSide,
  });
  const sunGlow2 = new THREE.Mesh(glow2Geometry, glow2Material);
  sun.add(sunGlow2);

  // Luz direccional principal del sol
  sunlight = new THREE.DirectionalLight(0xfff4e6, 1.5);
  sunlight.position.copy(sun.position);
  sunlight.castShadow = true;

  // Configuración de sombras (opcional)
  sunlight.shadow.mapSize.width = 2048;
  sunlight.shadow.mapSize.height = 2048;
  sunlight.shadow.camera.near = 0.5;
  sunlight.shadow.camera.far = 500;

  scene.add(sunlight);

  // Luz ambiental suave para simular la dispersión atmosférica
  const ambientSunlight = new THREE.AmbientLight(0xfff4e6, 0.3);
  scene.add(ambientSunlight);

  // Animación sutil del sol (opcional)
  function animateSun() {
    if (sun.visible) {
      sun.rotation.y += 0.001;
      // Pulso suave en los halos
      sunGlow.scale.setScalar(1 + Math.sin(Date.now() * 0.001) * 0.05);
    }
    requestAnimationFrame(animateSun);
  }
  animateSun();
}
function createFrogs() {
  frogs = new THREE.Group();
  scene.add(frogs);

  const frogCount = 12;
  const textureLoader = new THREE.TextureLoader();
  const frogTexture = textureLoader.load("/imagenes/rana.png");

  for (let i = 0; i < frogCount; i++) {
    const material = new THREE.SpriteMaterial({
      map: frogTexture,
      transparent: true,
      opacity: 0,
    });

    const frog = new THREE.Sprite(material);
    frog.scale.set(1.2, 1.2, 1.2);

    frog.position.set(
      (Math.random() - 0.5) * 40,
      0.05, // pegada al suelo
      (Math.random() - 0.5) * 40
    );

    frog.userData = {
      baseY: frog.position.y,
      hopTimer: Math.random() * 3,
      hopInterval: 2 + Math.random() * 3,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 0.6,
        0,
        (Math.random() - 0.5) * 0.6
      ),
      noiseOffset: Math.random() * 100,
    };

    frogs.add(frog);
  }
}

function createButterflies() {
  butterflies = new THREE.Group();
  scene.add(butterflies);

  const butterflyCount = 10;
  const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff];

  const textureLoader = new THREE.TextureLoader();
  const butterflyTexture = textureLoader.load("/imagenes/mariposa.png");

  for (let i = 0; i < butterflyCount; i++) {
    const bodyGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.7,
      metalness: 0.0,
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);

    const wingMaterial = new THREE.SpriteMaterial({
      map: butterflyTexture,
      color: colors[i % colors.length],
      transparent: true,
      opacity: 0,
    });
    const leftWing = new THREE.Sprite(wingMaterial);
    leftWing.scale.set(0.5, 0.5, 1);
    leftWing.position.set(-0.2, 0, 0);

    const rightWing = new THREE.Sprite(wingMaterial);
    rightWing.scale.set(0.5, 0.5, 1);
    rightWing.position.set(0.2, 0, 0);

    const butterfly = new THREE.Group();
    butterfly.add(body, leftWing, rightWing);
    butterfly.position.set(
      (Math.random() - 0.5) * 40,
      5 + Math.random() * 5,
      (Math.random() - 0.5) * 40
    );
    butterfly.userData = {
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 0.1,
        (Math.random() - 0.5) * 0.05,
        (Math.random() - 0.5) * 0.1
      ),
      flapPhase: Math.random() * Math.PI * 2,
      noiseOffset: Math.random() * 100,
    };
    butterflies.add(butterfly);
  }
}

function createBirds() {
  birds = new THREE.Group();
  scene.add(birds);

  // Paleta de colores para los pájaros
  const birdColors = [
    0xff6b6b, // Rojo coral
    0x4ecdc4, // Turquesa
    0xffe66d, // Amarillo
    0x95e1d3, // Verde menta
    0xf38181, // Rosa salmón
  ];

  // Cargar textura para las alas
  const textureLoader = new THREE.TextureLoader();
  const wingTexture = textureLoader.load("/imagenes/bird.png");

  const birdCount = 5;
  for (let i = 0; i < birdCount; i++) {
    // Cuerpo con color único para cada pájaro
    const bodyGeometry = new THREE.SphereGeometry(0.4, 16, 16);
    bodyGeometry.scale(1, 0.5, 1.5);
    const bodyMaterial = new THREE.MeshPhongMaterial({
      color: birdColors[i % birdColors.length],
      transparent: true,
      opacity: 0,
      roughness: 0.7,
      metalness: 0.0,
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);

    // Alas con textura de imagen
    const wingGeometry = new THREE.PlaneGeometry(0.6, 0.3);
    const wingMaterial = new THREE.MeshPhongMaterial({
      map: wingTexture,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
      roughness: 0.7,
      metalness: 0.0,
    });
    const leftWing = new THREE.Mesh(wingGeometry, wingMaterial);
    leftWing.position.set(-0.3, 0, 0);
    leftWing.rotation.y = Math.PI / 2;

    const rightWing = new THREE.Mesh(wingGeometry, wingMaterial.clone());
    rightWing.position.set(0.3, 0, 0);
    rightWing.rotation.y = -Math.PI / 2;

    // Cabeza del mismo color que el cuerpo
    const headGeometry = new THREE.SphereGeometry(0.2, 16, 16);
    const headMaterial = new THREE.MeshPhongMaterial({
      color: birdColors[i % birdColors.length],
      transparent: true,
      opacity: 0,
      roughness: 0.7,
      metalness: 0.0,
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.set(0, 0, 0.6);

    const beakGeometry = new THREE.ConeGeometry(0.1, 0.2, 8);
    const beakMaterial = new THREE.MeshStandardMaterial({
      color: 0xffa500,
      transparent: true,
      opacity: 0,
      roughness: 0.7,
      metalness: 0.0,
    });
    const beak = new THREE.Mesh(beakGeometry, beakMaterial);
    beak.position.set(0, 0, 0.8);
    beak.rotation.x = Math.PI / 2;

    const bird = new THREE.Group();
    bird.add(body, leftWing, rightWing, head, beak);
    bird.position.set(
      (Math.random() - 0.5) * 100,
      15 + Math.random() * 10,
      (Math.random() - 0.5) * 100
    );
    bird.userData = {
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 0.2,
        0,
        (Math.random() - 0.5) * 0.2
      ),
      flapPhase: Math.random() * Math.PI * 2,
      noiseOffset: Math.random() * 100,
    };
    birds.add(bird);
  }
}

function createSky() {
  // Load HDR environment map (only once)
  new RGBELoader().load("/hdr/partly_cloudy_puresky.hdr", (hdr) => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = hdr;
    scene.background = hdr;
  });
}

function createClouds() {
  clouds = new THREE.Group();
  scene.add(clouds);

  const cloudMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
    roughness: 0.7,
    metalness: 0.0,
  });

  const cloudCount = 10;
  for (let i = 0; i < cloudCount; i++) {
    const cloud = new THREE.Group();
    const puffCount = 3 + Math.floor(Math.random() * 3);
    for (let j = 0; j < puffCount; j++) {
      const puffGeometry = new THREE.SphereGeometry(
        1 + Math.random() * 0.5,
        16,
        16
      );
      const puff = new THREE.Mesh(puffGeometry, cloudMaterial);
      puff.position.set(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 1,
        (Math.random() - 0.5) * 2
      );
      cloud.add(puff);
    }
    cloud.position.set(
      (Math.random() - 0.5) * 100,
      20 + Math.random() * 5,
      (Math.random() - 0.5) * 100
    );
    cloud.scale.set(2, 1, 2);
    clouds.add(cloud);
  }
}

function createTerrain() {
  const size = 100;
  const segments = 100;
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);

  const vertices = geometry.attributes.position.array;
  const noise = new ImprovedNoise();

  // Apply Perlin noise for natural terrain elevation
  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i];
    const y = vertices[i + 1];

    // Multi-octave noise for more natural terrain
    let elevation = 0;
    elevation += noise.noise(x * 0.1, y * 0.1, 0) * 3.0; // Large features
    elevation += noise.noise(x * 0.2, y * 0.2, 1) * 1.5; // Medium features
    elevation += noise.noise(x * 0.4, y * 0.4, 2) * 0.5; // Small details

    vertices[i + 2] = elevation;
  }

  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0x6ac46a, // Natural grass green
    side: THREE.DoubleSide,
    flatShading: false, // Smooth shading for natural look
    roughness: 1.0,
    metalness: 0.0,
  });

  terrain = new THREE.Mesh(geometry, material);
  terrain.rotation.x = -Math.PI / 2;
  terrain.position.y = -1;
  terrain.receiveShadow = true;
  scene.add(terrain);
}

function createIceLayer() {
  const size = 50;
  const segments = 100;
  const iceGeometry = new THREE.PlaneGeometry(size, size, segments, segments);
  const iceMaterial = new THREE.MeshStandardMaterial({
    color: 0x88ccff,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide,
    flatShading: true,
    specular: 0xffffff,
    shininess: 100,
    roughness: 0.7,
    metalness: 0.0,
  });

  ice = new THREE.Mesh(iceGeometry, iceMaterial);
  ice.rotation.x = -Math.PI / 2;
  ice.position.y = -0.9;
  scene.add(ice);
}

function createTree(x, z, height) {
  const treeGroup = new THREE.Group();
  treeGroup.position.set(x, 0, z);
  treeGroup.scale.set(0.1, 0.1, 0.1);

  scene.add(treeGroup);

  const initialStage = "GERMINATION";
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

  treeGroup.userData.growthState = {
    lastStage: initialStage,
    nextEffectThreshold: 1,
    animation: null,
    overshootStart: null,
  };

  trees.push(treeData);
  return treeData;
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
      const wobble =
        Math.sin(stretchT * Math.PI * 3) * animation.wobbleStrength;
      stageVisual.rotation.z = wobble;
    }
  } else if (t < 0.7) {
    const waveT = (t - 0.35) / 0.35;
    const damping = 1 - waveT;
    const oscillation =
      Math.sin(waveT * Math.PI * 6) * animation.waveIntensity * damping;
    scaleValue = animation.finalScale + oscillation;
    if (stageVisual) {
      stageVisual.rotation.z =
        Math.sin(waveT * Math.PI * 5) * animation.waveIntensity * 2 * damping;
      stageVisual.rotation.x =
        Math.cos(waveT * Math.PI * 4) * animation.waveIntensity * damping * 0.5;
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

function createTrunk(parent, height) {
  const trunkGeometry = new THREE.CylinderGeometry(0.5, 0.8, height, 8);
  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: 0x8b5a2b,
    roughness: 0.7,
    metalness: 0.0,
  });
  const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
  trunk.position.y = height / 2;
  parent.add(trunk);
  return trunk;
}

function createLeafCanopy(parent, trunk) {
  const canopyGroup = new THREE.Group();
  parent.add(canopyGroup);

  // Shared time uniform for all canopy leaves
  const timeUniform = { value: 0 };

  for (let i = 0; i < 5; i++) {
    const canopyGeometry = new THREE.SphereGeometry(
      2.5 - i * 0.4 + Math.random() * 0.3,
      8,
      8
    );

    const canopyMaterial = new THREE.MeshStandardMaterial({
      color: 0xddeeff,
      flatShading: true,
      roughness: 0.7,
      metalness: 0.0,
    });

    // Store time uniform reference
    canopyMaterial.userData.time = timeUniform;

    // Add wind animation shader
    canopyMaterial.onBeforeCompile = (shader) => {
      // Add time uniform
      shader.uniforms.time = timeUniform;

      // Inject uniform declaration and varying
      shader.vertexShader = `
        uniform float time;
        ${shader.vertexShader}
      `;

      // Replace the transform code to add wind effect
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `
        #include <begin_vertex>
        
        // Wind sway effect - more movement at the top
        float windStrength = (position.y + 3.0) / 6.0;
        transformed.x += sin(time * 1.5 + position.y * 0.5 + ${
          Math.random() * 6.28
        }) * windStrength * 0.15;
        transformed.z += cos(time * 1.2 + position.x * 0.3 + ${
          Math.random() * 6.28
        }) * windStrength * 0.1;
        `
      );

      // Mark that we need to update uniforms
      shader.uniforms.time = timeUniform;
    };

    canopyMaterial.customProgramCacheKey = () => "wind-shader";

    const canopy = new THREE.Mesh(canopyGeometry, canopyMaterial);
    canopy.position.set(
      (Math.random() - 0.5) * 0.5,
      trunk.position.y + 2 + i * 1.5,
      (Math.random() - 0.5) * 0.5
    );
    canopyGroup.add(canopy);
  }

  // Store time uniform on the group for easy access
  canopyGroup.userData.timeUniform = timeUniform;

  return canopyGroup;
}

function createCherryFruit() {
  const cherryGroup = new THREE.Group();

  // Fruto rojo brillante
  const cherryGeometry = new THREE.SphereGeometry(0.5, 16, 16);
  const cherryMaterial = new THREE.MeshPhongMaterial({
    color: 0xd40000,
    shininess: 100,
    specular: 0xffffff,
  });
  const cherry = new THREE.Mesh(cherryGeometry, cherryMaterial);
  cherryGroup.add(cherry);

  // Pequeño tallo verde
  const stemGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.2, 8);
  const stemMaterial = new THREE.MeshPhongMaterial({ color: 0x3d6b1f });
  const stem = new THREE.Mesh(stemGeometry, stemMaterial);
  stem.position.y = 0.15;
  stem.rotation.x = Math.PI * 0.15; // ligeramente inclinado
  cherryGroup.add(stem);

  // Brillo especular extra (opcional, para que parezca jugosa)
  cherryGeometry.translate(0, -0.02, 0); // pequeño desplazamiento para reflejo

  return cherryGroup;
}

function createCherryBlossomFlower() {
  const flowerGroup = new THREE.Group();

  const petalMaterial = new THREE.MeshStandardMaterial({
    color: 0xffb6c1,
    side: THREE.DoubleSide,
    roughness: 0.7,
    metalness: 0.0,
  });
  const petalGeometry = new THREE.CircleGeometry(0.2, 16);
  for (let i = 0; i < 5; i++) {
    const petal = new THREE.Mesh(petalGeometry, petalMaterial);
    const angle = (i / 5) * Math.PI * 2;
    petal.position.set(Math.cos(angle) * 0.3, 0, Math.sin(angle) * 0.3);
    petal.rotation.x = Math.PI / 2;
    petal.rotation.z = angle;
    flowerGroup.add(petal);
  }

  const centerGeometry = new THREE.SphereGeometry(0.1, 8, 8);
  const centerMaterial = new THREE.MeshStandardMaterial({
    color: 0xffff00,
    roughness: 0.7,
    metalness: 0.0,
  });
  const center = new THREE.Mesh(centerGeometry, centerMaterial);
  flowerGroup.add(center);

  return flowerGroup;
}

function createTextLabel(text, color = "#ffffff") {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const fontSize = 220;
  const paddingX = 40;
  const paddingY = 24;
  const maxWidth = 30000;

  context.font = `600 ${fontSize}px "Segoe UI", system-ui, -apple-system, sans-serif`;

  const textWidth = Math.min(context.measureText(text).width, maxWidth);

  // 👉 altura extra para la "colita" que apunta al árbol
  const pointerHeight = 80;

  canvas.width = textWidth + paddingX * 2;
  canvas.height = fontSize + paddingY * 2 + pointerHeight;

  context.font = `600 ${fontSize}px "Segoe UI", system-ui, -apple-system, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";

  const radius = 30;
  const bgColor = "rgba(0, 0, 0, 0.65)";
  const borderColor = "rgba(255, 255, 255, 0.35)";

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // 🔹 fondo redondeado (solo la parte del "globo", sin la colita)
  const bubbleHeight = canvas.height - pointerHeight;
  roundRect(context, 0, 0, canvas.width, bubbleHeight, radius);

  context.fillStyle = bgColor;
  context.fill();

  context.lineWidth = 4;
  context.strokeStyle = borderColor;
  context.stroke();

  // 🔹 "colita" que apunta hacia el árbol (triangulito inferior centrado)
  const tailWidth = 120; // ancho del triángulo
  const tailTopY = bubbleHeight - 2; // casi al borde inferior del globo
  const centerX = canvas.width / 2;

  context.beginPath();
  context.moveTo(centerX - tailWidth / 2, tailTopY);
  context.lineTo(centerX + tailWidth / 2, tailTopY);
  context.lineTo(centerX, canvas.height);
  context.closePath();

  context.fillStyle = bgColor;
  context.fill();
  context.strokeStyle = borderColor;
  context.stroke();

  // Texto (centrado dentro del globo, no en la colita)
  context.shadowColor = "rgba(0, 0, 0, 0.85)";
  context.shadowBlur = 6;
  context.shadowOffsetX = 2;
  context.shadowOffsetY = 3;

  context.fillStyle = color;
  context.fillText(
    text,
    canvas.width / 2,
    bubbleHeight / 2 // centrado en el globo, no contando pointer
  );

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });

  const sprite = new THREE.Sprite(material);

  // Escala en el mundo 3D
  const pixelsPerUnit = 250;
  const w = canvas.width / pixelsPerUnit;
  const h = canvas.height / pixelsPerUnit;
  sprite.scale.set(w, h, 1);

  sprite.renderOrder = 5;
  sprite.userData.isLabel = true;

  return sprite;
}

function createFlowersAndFruits(parent, trunk) {
  const flowersGroup = new THREE.Group();
  parent.add(flowersGroup);

  const flowerCount = 20;
  for (let i = 0; i < flowerCount; i++) {
    const flower = createCherryBlossomFlower();
    //const fruit = createCherryFruit();
    flower.position.set(
      (Math.random() - 0.5) * 4,
      trunk.position.y + 3 + Math.random() * 4,
      (Math.random() - 0.5) * 4
    );
    // fruit.position.set(
    //   (Math.random() - 0.5) * 4,
    //   trunk.position.y + 3 + Math.random() * 4,
    //   (Math.random() - 0.5) * 4
    // );
    flower.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
    flower.scale.set(0, 0, 0);
    flowersGroup.add(flower);
    //flowersGroup.add(fruit);
  }
  return flowersGroup;
}

// -----------------------------------------------------------------------------
// Tarima: llevar un árbol a un slot frontal
// -----------------------------------------------------------------------------

function moveTreeToStage(treeId) {
  const treeObj = treeObjects.get(treeId);
  if (!treeObj) return;

  // ¿Ya tiene slot asignado?
  let slotIndex = stageSlots.indexOf(treeId);

  // Si no, buscamos uno libre
  if (slotIndex === -1) {
    slotIndex = stageSlots.indexOf(null);

    // Si no hay slots libres, reciclamos el primero
    if (slotIndex === -1) {
      const oldId = stageSlots[0];
      if (oldId && treeObjects.get(oldId)) {
        const oldTree = treeObjects.get(oldId);
        const original = oldTree.group.userData.originalPosition;
        if (original) {
          oldTree.group.position.copy(original);
        }
        // ✅ volver a mostrar labels del árbol que sale de tarima
        oldTree.group.children.forEach((child) => {
          if (child.isSprite && child.userData.isLabel) {
            child.visible = true;
          }
        });
      }
      slotIndex = 0;
    }

    stageSlots[slotIndex] = treeId;
  }
  const stagePos = stagePositions[slotIndex];
  treeObj.group.position.set(stagePos.x, 0, stagePos.z);

  // 🔹 Añadir halo en el piso si no existe
  if (!treeObj.group.getObjectByName("stageHalo")) {
    const haloGeom = new THREE.CircleGeometry(2.5, 32);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xfff2a8,
      transparent: true,
      opacity: 0.5,
    });
    const halo = new THREE.Mesh(haloGeom, haloMat);
    halo.name = "stageHalo";
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.01;
    treeObj.group.add(halo);
  }

  // Ocultar labels flotantes
  treeObj.group.children.forEach((child) => {
    if (child.isSprite && child.userData.isLabel) {
      child.visible = false;
    }
  });
}

function showTreeLabel(meta) {
  let label = document.getElementById("treeLabel");
  if (!label) {
    label = document.createElement("div");
    label.id = "treeLabel";
    label.style.position = "absolute";
    label.style.bottom = "32px";
    label.style.right = "32px";
    label.style.maxWidth = "420px";
    label.style.padding = "16px 20px";
    label.style.borderRadius = "18px";
    label.style.background =
      "linear-gradient(135deg, rgba(0,0,0,0.78), rgba(0,0,0,0.6))";
    label.style.boxShadow = "0 18px 40px rgba(0,0,0,0.55)";
    label.style.color = "#ffffff";
    label.style.fontFamily =
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    label.style.zIndex = "200";
    label.style.backdropFilter = "blur(12px)";
    label.style.border = "1px solid rgba(255, 255, 255, 0.18)";
    label.style.pointerEvents = "none"; // solo display, no bloquea nada
    document.body.appendChild(label);
  }

  label.innerHTML = `
    <div style="font-size:12px; letter-spacing:0.12em; text-transform:uppercase; opacity:.75; margin-bottom:4px;">
      Árbol de
    </div>
    <div style="font-size:22px; font-weight:700; margin-bottom:8px;">
      ${meta.userName}
    </div>
    <div style="font-size:14px; line-height:1.5; opacity:.9;">
      “${meta.dream}”
    </div>
  `;
}

const _projVector = new THREE.Vector3();

function updateStageInfoUI() {
  if (!camera || !renderer || !stageInfoCards) return;

  for (let i = 0; i < STAGE_SLOTS; i++) {
    const treeId = stageSlots[i];
    const card = stageInfoCards[i];
    if (!card) continue;

    if (!treeId || !treeObjects.has(treeId)) {
      card.style.opacity = "0";
      continue;
    }

    const treeObj = treeObjects.get(treeId);
    const group = treeObj.group;

    // Punto de referencia: un poco por debajo del árbol (en el mundo)
    const worldPos = group.position.clone();
    worldPos.y = 0; // base del tronco

    // Proyectamos a coordenadas de pantalla
    _projVector.copy(worldPos).project(camera);

    const x = (_projVector.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-_projVector.y * 0.5 + 0.5) * window.innerHeight + 50; // un poco abajo

    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
    card.style.opacity = "1";

    // Actualizar contenido
    const nameEl = card.querySelector(".stage-card-name");
    const dreamEl = card.querySelector(".stage-card-dream");
    if (nameEl) nameEl.textContent = group.userData.userName || "—";
    if (dreamEl) dreamEl.textContent = `“${group.userData.dream || ""}”`;
  }
}

// -----------------------------------------------------------------------------
// Loop de animación
// -----------------------------------------------------------------------------

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  mixers.forEach((mixer) => mixer.update(delta));

  const elapsedTime = clock.getElapsedTime();
  const progress = 1; // mundo fijo en primavera

  // Simulate ice melting
  if (ice) {
    ice.material.opacity = 0.7 * (1 - progress);
    ice.scale.set(1 - progress * 0.5, 1, 1 - progress * 0.5);
    if (progress === 1) {
      scene.remove(ice);
      ice = null;
    }
  }

  // Terrain color
  terrain.material.color.lerpColors(
    new THREE.Color(0xddeeff),
    new THREE.Color(0x228b22),
    progress
  );

  // Clouds movement
  clouds.children.forEach((cloud) => {
    cloud.position.x += 0.02;
    if (cloud.position.x > 50) cloud.position.x = -50;
  });

  const nowMs = performance.now();

  trees.forEach((treeData) => {
    const { group } = treeData;
    const growth = group.userData?.growth ?? 0;
    const state =
      group.userData.growthState ??
      (group.userData.growthState = {
        lastStage: getGrowthStage(growth),
        nextEffectThreshold: Math.floor(Math.max(0, growth)) + 1,
        animation: null,
        initialized: true,
      });

    if (!state.initialized) {
      state.lastStage = getGrowthStage(growth);
      state.nextEffectThreshold = Math.floor(Math.max(0, growth)) + 1;
      state.initialized = true;
      if (treeData.stage !== state.lastStage) {
        switchTreeStage(treeData, state.lastStage);
      }
      const initialScale = getScaleForGrowth(growth);
      treeData.group.scale.setScalar(initialScale);
    }

    // Ensure current stage visuals match growth stage if data changes externally
    const desiredStage = getGrowthStage(growth);
    if (desiredStage !== state.lastStage) {
      triggerStageEvolution(treeData, desiredStage, growth);
      state.lastStage = desiredStage;
      state.nextEffectThreshold = Math.floor(Math.max(0, growth)) + 1;
    }

    // Trigger per-percent effects
    let effectIndex = 0;
    while (
      growth >= state.nextEffectThreshold &&
      state.nextEffectThreshold <= 100
    ) {
      const currentStageData = getStageData(desiredStage);
      const delay = effectIndex * 160;
      const scheduledGrowth = growth;
      setTimeout(
        () => triggerGrowthPulse(treeData, currentStageData, scheduledGrowth),
        delay
      );
      state.nextEffectThreshold += 1;
      effectIndex += 1;
    }

    // Apply growth animation or ease-to-target scale
    applyGrowthAnimation(treeData, nowMs);

    // Subtle emissive pulsing to keep plants alive feeling
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
  });

  const springProgress = Math.max(0, (progress - 0.7) / 0.3);
  if (springProgress > 0) {
    sun.visible = true;
    sunlight.intensity = springProgress * 0.5;

    if (scene.fog) {
      scene.fog.far = 50 + springProgress * 950;
      if (springProgress === 1) scene.fog = null;
    }

    // Butterflies
    butterflies.children.forEach((butterfly) => {
      butterfly.children.forEach((child) => {
        if (child.material) child.material.opacity = springProgress;
      });

      const noiseX =
        noise3D(butterfly.userData.noiseOffset + elapsedTime * 0.1, 0, 0) * 0.1;
      const noiseY =
        noise3D(0, butterfly.userData.noiseOffset + elapsedTime * 0.1, 0) *
        0.05;
      const noiseZ =
        noise3D(0, 0, butterfly.userData.noiseOffset + elapsedTime * 0.1) * 0.1;
      butterfly.position.add(
        butterfly.userData.velocity
          .clone()
          .add(new THREE.Vector3(noiseX, noiseY, noiseZ))
      );

      const flapAngle =
        Math.sin(elapsedTime * 5 + butterfly.userData.flapPhase) * 0.5;
      butterfly.children[1].rotation.z = flapAngle;
      butterfly.children[2].rotation.z = -flapAngle;

      if (butterfly.position.x > 50 || butterfly.position.x < -50)
        butterfly.userData.velocity.x *= -1;
      if (butterfly.position.z > 50 || butterfly.position.z < -50)
        butterfly.userData.velocity.z *= -1;
      if (butterfly.position.y > 15 || butterfly.position.y < 5)
        butterfly.userData.velocity.y *= -1;
    });

    // Birds
    birds.children.forEach((bird) => {
      bird.children.forEach((child) => {
        if (child.material) child.material.opacity = springProgress;
      });

      const noiseX =
        noise3D(bird.userData.noiseOffset + elapsedTime * 0.05, 0, 0) * 0.2;
      const noiseZ =
        noise3D(0, 0, bird.userData.noiseOffset + elapsedTime * 0.05) * 0.2;
      bird.position.add(
        bird.userData.velocity.clone().add(new THREE.Vector3(noiseX, 0, noiseZ))
      );

      const flapAngle =
        Math.sin(elapsedTime * 3 + bird.userData.flapPhase) * 0.3;
      bird.children[1].rotation.z = flapAngle;
      bird.children[2].rotation.z = -flapAngle;

      const velocity = bird.userData.velocity.clone().normalize();
      bird.lookAt(bird.position.clone().add(velocity));

      if (bird.position.x > 100 || bird.position.x < -100)
        bird.userData.velocity.x *= -1;
      if (bird.position.z > 100 || bird.position.z < -100)
        bird.userData.velocity.z *= -1;
    });

    frogs?.children.forEach((frog) => {
      // Fade-in suave en primavera
      frog.material.opacity = Math.min(1, frog.material.opacity + delta * 0.5);

      frog.userData.hopTimer += delta;

      // Cuando toca saltar
      if (frog.userData.hopTimer > frog.userData.hopInterval) {
        frog.userData.hopTimer = 0;

        // Movimiento horizontal
        frog.position.x += frog.userData.velocity.x;
        frog.position.z += frog.userData.velocity.z;

        // Rebote pequeño
        frog.userData.jumpPhase = 0;
      }

      // Animación de salto (parábola simple)
      if (frog.userData.jumpPhase !== undefined) {
        frog.userData.jumpPhase += delta * 6;
        const jumpHeight = Math.sin(frog.userData.jumpPhase) * 0.6;
        frog.position.y = frog.userData.baseY + Math.max(0, jumpHeight);

        if (frog.userData.jumpPhase >= Math.PI) {
          frog.position.y = frog.userData.baseY;
          frog.userData.jumpPhase = undefined;
        }
      }

      // Ruido suave para que no se muevan igual
      const noiseX =
        noise3D(frog.userData.noiseOffset, clock.elapsedTime * 0.2, 0) * 0.02;
      const noiseZ =
        noise3D(0, frog.userData.noiseOffset, clock.elapsedTime * 0.2) * 0.02;

      frog.position.x += noiseX;
      frog.position.z += noiseZ;

      // Mirar hacia donde "salta"
      frog.rotation.y = Math.atan2(
        frog.userData.velocity.x,
        frog.userData.velocity.z
      );

      // Límites del terreno
      if (frog.position.x > 48 || frog.position.x < -48)
        frog.userData.velocity.x *= -1;
      if (frog.position.z > 48 || frog.position.z < -48)
        frog.userData.velocity.z *= -1;
    });
  }

  // Audio primavera fija
  if (hasUserAllowedAudio) {
    if (!isSpringAudioPlaying) {
      if (!springAudio.paused) {
        // nada
      } else {
        springAudio.play().catch((err) => console.log(err));
      }
      isSpringAudioPlaying = true;
    }
    if (isWinterAudioPlaying) {
      winterAudio.pause();
      winterAudio.currentTime = 0;
      isWinterAudioPlaying = false;
    }
  }

  // Las etiquetas deben mirar siempre hacia la cámara
  treeObjects.forEach((treeObj) => {
    treeObj.group.children.forEach((child) => {
      if (child.isSprite) {
        child.quaternion.copy(camera.quaternion);
      }
    });
  });

  // Actualizar posiciones de las cards de la tarima
  updateStageInfoUI();

  composer.render();
}

// -----------------------------------------------------------------------------
// Start
// -----------------------------------------------------------------------------

init();

// Resize
window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  composer.setSize(window.innerWidth, window.innerHeight);
});
