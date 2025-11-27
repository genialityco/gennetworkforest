// world.js (o como lo tengas llamado)
import * as THREE from "three";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { createNoise3D } from "simplex-noise";
import { doc, onSnapshot, collection, query, orderBy, limit } from "firebase/firestore";
import { db } from "./firebaseConfig.js";

const treesCollection = collection(db, "trees");
const treeObjects = new Map(); // key: treeId, value: { trunk, canopy, flowers, group }

let scene,
  camera,
  renderer,
  clock,
  mixers = [],
  trees = [],
  terrain,
  ice,
  sky,
  clouds;
// Declare global variables for new elements
let sun, sunlight, butterflies, birds;

// Tree counting
let treeCount = 0;
let MAX_TREES = 200; // Number of trees needed for 100% progress

const treesRef = doc(db, "globalCounters", "treesCounter");
const configRef = doc(db, "adminConfig", "sceneConfig");
const noise3D = createNoise3D();

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

// Todos con el mismo z (más o menos al frente de la cámara)
// y x repartidos simétricamente
const stagePositions = [
  { x: -22, z: 20 },
  { x: -21, z: 14 },
  { x: -12, z: 20 },
  { x: -9, z: 14 },
  { x: -3, z: 20 },
  { x: 3, z: 20 },
  { x: 9, z: 14 },
  { x: 12, z: 20 },
  { x: 21, z: 14 },
  { x: 22, z: 20 },
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
  const q = query(treesCollection, orderBy("lastViewRequestAt", "desc"), limit(10));

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

      // 4) Asignamos los nuevos destacados a slots y los movemos al frente
      let index = 0;
      snapshot.forEach((docSnap) => {
        const treeId = docSnap.id;
        if (!treeObjects.has(treeId)) return; // por si aún no está cargado

        if (index < STAGE_SLOTS) {
          stageSlots[index] = treeId;
          moveTreeToStage(treeId);
          index++;
        }
      });
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
    card.style.background = "linear-gradient(135deg, rgba(0,0,0,0.78), rgba(0,0,0,0.6))";
    card.style.boxShadow = "0 12px 25px rgba(0,0,0,0.5)";
    card.style.color = "#ffffff";
    card.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    card.style.fontSize = "12px";
    card.style.opacity = "0";
    card.style.transform = "translate(-50%, 0)";
    card.style.transition = "opacity 0.25s ease-out";
    card.style.pointerEvents = "none";
    card.style.overflow = "visible"; // 👈 para que el pointer se vea fuera
    card.style.textAlign = "left";

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
      <div class="stage-card-name" style="font-size:14px; font-weight:600; margin-top:2px; margin-bottom:4px;">
        ---
      </div>
      <div class="stage-card-dream" style="font-size:11px; line-height:1.4; opacity:.9;">
        “...”
      </div>
    `;

    container.appendChild(card);
    return card;
  });
}

function updateTreesCounterUI() {
  const el = document.getElementById("treesValue");
  if (!el) return;

  // Número real de árboles que están en memoria / escena
  const totalTrees = treeObjects.size;
  el.innerText = String(totalTrees);
}

// -----------------------------------------------------------------------------
// Init escena
// -----------------------------------------------------------------------------

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcccccc);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 10, 40);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  clock = new THREE.Clock();

  // Light
  const ambient = new THREE.AmbientLight(0xffffff, 0.9);
  scene.add(ambient);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(5, 10, 5);
  scene.add(directionalLight);

  // Fog (aunque el mundo está en primavera, dejamos fog suave si quieres)
  scene.fog = new THREE.Fog(0xaaaaaa, 10, 50);

  // Basic scene objects
  createSky();
  createClouds();
  createTerrain();
  createIceLayer();
  createSun();
  createButterflies();
  createBirds();

  // Marco
  createOverlayFrame();
  createScoreUI();
  createStageInfoUI(); // cards por árbol destacado

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
  const sunGeometry = new THREE.SphereGeometry(2, 32, 32);
  const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
  sun = new THREE.Mesh(sunGeometry, sunMaterial);
  sun.position.set(30, 30, -50);
  sun.visible = false;
  scene.add(sun);

  sunlight = new THREE.DirectionalLight(0xffff00, 0);
  sunlight.position.copy(sun.position);
  scene.add(sunlight);
}

function createButterflies() {
  butterflies = new THREE.Group();
  scene.add(butterflies);

  const butterflyCount = 10;
  const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff];

  const textureLoader = new THREE.TextureLoader();
  const butterflyTexture = textureLoader.load("path/to/butterfly_wing_texture.png");

  for (let i = 0; i < butterflyCount; i++) {
    const bodyGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.7, metalness: 0.0 });
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
    butterfly.position.set((Math.random() - 0.5) * 40, 5 + Math.random() * 5, (Math.random() - 0.5) * 40);
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

  const birdCount = 5;
  for (let i = 0; i < birdCount; i++) {
    const bodyGeometry = new THREE.SphereGeometry(0.4, 16, 16);
    bodyGeometry.scale(1, 0.5, 1.5);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x555555,
      transparent: true,
      opacity: 0,
      roughness: 0.7,
      metalness: 0.0,
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);

    const wingGeometry = new THREE.PlaneGeometry(0.6, 0.3);
    const wingMaterial = new THREE.MeshStandardMaterial({
      color: 0x444444,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
      roughness: 0.7,
      metalness: 0.0,
    });
    const leftWing = new THREE.Mesh(wingGeometry, wingMaterial);
    leftWing.position.set(-0.3, 0, 0);
    leftWing.rotation.y = Math.PI / 2;

    const rightWing = new THREE.Mesh(wingGeometry, wingMaterial);
    rightWing.position.set(0.3, 0, 0);
    rightWing.rotation.y = -Math.PI / 2;

    const headGeometry = new THREE.SphereGeometry(0.2, 16, 16);
    const headMaterial = new THREE.MeshStandardMaterial({
      color: 0x555555,
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
    bird.position.set((Math.random() - 0.5) * 100, 15 + Math.random() * 10, (Math.random() - 0.5) * 100);
    bird.userData = {
      velocity: new THREE.Vector3((Math.random() - 0.5) * 0.2, 0, (Math.random() - 0.5) * 0.2),
      flapPhase: Math.random() * Math.PI * 2,
      noiseOffset: Math.random() * 100,
    };
    birds.add(bird);
  }
}

function createSky() {
  // Load HDR environment map (only once)
  new RGBELoader().load("/src/hdr/partly_cloudy_puresky.hdr", (hdr) => {
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
      const puffGeometry = new THREE.SphereGeometry(1 + Math.random() * 0.5, 16, 16);
      const puff = new THREE.Mesh(puffGeometry, cloudMaterial);
      puff.position.set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 1, (Math.random() - 0.5) * 2);
      cloud.add(puff);
    }
    cloud.position.set((Math.random() - 0.5) * 100, 20 + Math.random() * 5, (Math.random() - 0.5) * 100);
    cloud.scale.set(2, 1, 2);
    clouds.add(cloud);
  }
}

function createTerrain() {
  const size = 50;
  const segments = 100;
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);

  const vertices = geometry.attributes.position.array;
  for (let i = 0; i < vertices.length; i += 3) {
    vertices[i + 2] += (Math.random() - 0.5) * 2;
  }
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0xddeeff,
    side: THREE.DoubleSide,
    flatShading: true,
    roughness: 0.7,
    metalness: 0.0,
  });

  terrain = new THREE.Mesh(geometry, material);
  terrain.rotation.x = -Math.PI / 2;
  terrain.position.y = -1;
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

  const trunk = createTrunk(treeGroup, height);
  const canopy = createLeafCanopy(treeGroup, trunk);
  const flowers = createFlowersAndFruits(treeGroup, trunk);

  const treeData = { trunk, canopy, flowers, group: treeGroup };
  trees.push(treeData);

  const mixer = new THREE.AnimationMixer(treeGroup);
  const growTrack = new THREE.KeyframeTrack(".scale", [0, 5], [0.1, 0.1, 0.1, 1, 1, 1]);
  const growClip = new THREE.AnimationClip("grow", 5, [growTrack]);
  const growAction = mixer.clipAction(growClip);
  growAction.play();
  mixers.push(mixer);

  return treeData;
}

function createTrunk(parent, height) {
  const trunkGeometry = new THREE.CylinderGeometry(0.5, 0.8, height, 8);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.7, metalness: 0.0 });
  const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
  trunk.position.y = height / 2;
  parent.add(trunk);
  return trunk;
}

function createLeafCanopy(parent, trunk) {
  const canopyGroup = new THREE.Group();
  parent.add(canopyGroup);

  const canopyMaterial = new THREE.MeshStandardMaterial({
    color: 0xddeeff,
    flatShading: true,
    roughness: 0.7,
    metalness: 0.0,
  });

  for (let i = 0; i < 5; i++) {
    const canopyGeometry = new THREE.SphereGeometry(2.5 - i * 0.4 + Math.random() * 0.3, 8, 8);
    const canopy = new THREE.Mesh(canopyGeometry, canopyMaterial);
    canopy.position.set((Math.random() - 0.5) * 0.5, trunk.position.y + 2 + i * 1.5, (Math.random() - 0.5) * 0.5);
    canopyGroup.add(canopy);
  }
  return canopyGroup;
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
  const centerMaterial = new THREE.MeshStandardMaterial({ color: 0xffff00, roughness: 0.7, metalness: 0.0 });
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
    flower.position.set((Math.random() - 0.5) * 4, trunk.position.y + 3 + Math.random() * 4, (Math.random() - 0.5) * 4);
    flower.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    flower.scale.set(0, 0, 0);
    flowersGroup.add(flower);
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
    label.style.background = "linear-gradient(135deg, rgba(0,0,0,0.78), rgba(0,0,0,0.6))";
    label.style.boxShadow = "0 18px 40px rgba(0,0,0,0.55)";
    label.style.color = "#ffffff";
    label.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
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
  terrain.material.color.lerpColors(new THREE.Color(0xddeeff), new THREE.Color(0x228b22), progress);

  // Clouds movement
  clouds.children.forEach((cloud) => {
    cloud.position.x += 0.02;
    if (cloud.position.x > 50) cloud.position.x = -50;
  });

  // Trees, canopy, flowers – crecimiento individual según `growth`
  trees.forEach(({ trunk, canopy, flowers, group }) => {
    const growth = group.userData?.growth ?? 0;
    const localProgress = Math.max(0, Math.min(growth / 100, 1));

    trunk.material.color.lerpColors(new THREE.Color(0x8b5a2b), new THREE.Color(0x8b5a2b), progress);
    canopy.children.forEach((leaf) => {
      leaf.material.color.lerpColors(new THREE.Color(0xddeeff), new THREE.Color(0x228b22), progress);
    });

    // Dentro de animate(), donde ajustas el scale según growth
    const baseScale = 0.06; // antes 0.1
    const extraScale = 0.5; // antes 0.9 (máx ahora ~0.56)
    const scale = baseScale + localProgress * extraScale;
    group.scale.set(scale, scale, scale);

    flowers.children.forEach((flower) => {
      flower.scale.set(localProgress, localProgress, localProgress);
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

      const noiseX = noise3D(butterfly.userData.noiseOffset + elapsedTime * 0.1, 0, 0) * 0.1;
      const noiseY = noise3D(0, butterfly.userData.noiseOffset + elapsedTime * 0.1, 0) * 0.05;
      const noiseZ = noise3D(0, 0, butterfly.userData.noiseOffset + elapsedTime * 0.1) * 0.1;
      butterfly.position.add(butterfly.userData.velocity.clone().add(new THREE.Vector3(noiseX, noiseY, noiseZ)));

      const flapAngle = Math.sin(elapsedTime * 5 + butterfly.userData.flapPhase) * 0.5;
      butterfly.children[1].rotation.z = flapAngle;
      butterfly.children[2].rotation.z = -flapAngle;

      if (butterfly.position.x > 50 || butterfly.position.x < -50) butterfly.userData.velocity.x *= -1;
      if (butterfly.position.z > 50 || butterfly.position.z < -50) butterfly.userData.velocity.z *= -1;
      if (butterfly.position.y > 15 || butterfly.position.y < 5) butterfly.userData.velocity.y *= -1;
    });

    // Birds
    birds.children.forEach((bird) => {
      bird.children.forEach((child) => {
        if (child.material) child.material.opacity = springProgress;
      });

      const noiseX = noise3D(bird.userData.noiseOffset + elapsedTime * 0.05, 0, 0) * 0.2;
      const noiseZ = noise3D(0, 0, bird.userData.noiseOffset + elapsedTime * 0.05) * 0.2;
      bird.position.add(bird.userData.velocity.clone().add(new THREE.Vector3(noiseX, 0, noiseZ)));

      const flapAngle = Math.sin(elapsedTime * 3 + bird.userData.flapPhase) * 0.3;
      bird.children[1].rotation.z = flapAngle;
      bird.children[2].rotation.z = -flapAngle;

      const velocity = bird.userData.velocity.clone().normalize();
      bird.lookAt(bird.position.clone().add(velocity));

      if (bird.position.x > 100 || bird.position.x < -100) bird.userData.velocity.x *= -1;
      if (bird.position.z > 100 || bird.position.z < -100) bird.userData.velocity.z *= -1;
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

  renderer.render(scene, camera);
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
});
