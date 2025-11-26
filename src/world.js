// world.js (o como lo tengas llamado)
import * as THREE from "three";
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
const STAGE_SLOTS = 10;
const stageSlots = new Array(STAGE_SLOTS).fill(null); // guarda treeId o null

// 2 filas x 5 columnas delante de la cámara
const stagePositions = [
  { x: -20, z: 18 },
  { x: -10, z: 18 },
  { x: 0, z: 18 },
  { x: 10, z: 18 },
  { x: 20, z: 18 },
  { x: -20, z: 10 },
  { x: -10, z: 10 },
  { x: 0, z: 10 },
  { x: 10, z: 10 },
  { x: 20, z: 10 },
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

          // Guarda metadata en el grupo
          treeObj.group.userData = {
            treeId: docId,
            userName: data.userName,
            dream: data.dream,
            growth: data.growth ?? 0,
            state: data.state ?? "SEED",
            originalPosition: treeObj.group.position.clone(),
          };

          // Etiquetas flotantes
          const nameLabel = createTextLabel(data.userName, "#fffaf0");
          nameLabel.position.set(0, height + 2.5, 0);

          const dreamLabel = createTextLabel(`"${data.dream}"`, "#ffd6d6");
          dreamLabel.position.set(0, height + 1.2, 0);

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
function listenToTreesCount() {
  onSnapshot(
    treesRef,
    (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        const el = document.getElementById("treesValue");
        if (el) el.innerText = data.trees;
      } else {
        const el = document.getElementById("treesValue");
        if (el) el.innerText = "0";
      }
    },
    (error) => {
      console.error("Error fetching trees count:", error);
    }
  );
}

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
      // Limpiamos asignaciones actuales de la tarima
      for (let i = 0; i < stageSlots.length; i++) {
        stageSlots[i] = null;
      }

      let index = 0;
      snapshot.forEach((docSnap) => {
        const treeId = docSnap.id;
        if (!treeObjects.has(treeId)) return; // por si aún no está cargado

        // asignar a slot y moverlo al frente
        if (index < STAGE_SLOTS) {
          stageSlots[index] = treeId;
          moveTreeToStage(treeId);
          index++;
        }
      });

      // Opcional: mostrar label del árbol MÁS reciente
      const firstDoc = snapshot.docs[0];
      if (firstDoc) {
        const metaTree = treeObjects.get(firstDoc.id);
        if (metaTree && metaTree.group && metaTree.group.userData) {
          showTreeLabel(metaTree.group.userData);
        }
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
  scoreContainer.style.alignItems = "center";     // Centrado vertical
  
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

  // Botón de audio
  addAudioStartButton();

  // Listeners Firestore
  listenToTrees(); // árboles individuales (nombre + sueño + growth)
  listenToTreesCount(); // contador global para overlay
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
  const butterflyTexture = textureLoader.load(
    "path/to/butterfly_wing_texture.png"
  );

  for (let i = 0; i < butterflyCount; i++) {
    const bodyGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8);
    const bodyMaterial = new THREE.MeshPhongMaterial({ color: 0x333333 });
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

  const birdCount = 5;
  for (let i = 0; i < birdCount; i++) {
    const bodyGeometry = new THREE.SphereGeometry(0.4, 16, 16);
    bodyGeometry.scale(1, 0.5, 1.5);
    const bodyMaterial = new THREE.MeshPhongMaterial({
      color: 0x555555,
      transparent: true,
      opacity: 0,
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);

    const wingGeometry = new THREE.PlaneGeometry(0.6, 0.3);
    const wingMaterial = new THREE.MeshPhongMaterial({
      color: 0x444444,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
    });
    const leftWing = new THREE.Mesh(wingGeometry, wingMaterial);
    leftWing.position.set(-0.3, 0, 0);
    leftWing.rotation.y = Math.PI / 2;

    const rightWing = new THREE.Mesh(wingGeometry, wingMaterial);
    rightWing.position.set(0.3, 0, 0);
    rightWing.rotation.y = -Math.PI / 2;

    const headGeometry = new THREE.SphereGeometry(0.2, 16, 16);
    const headMaterial = new THREE.MeshPhongMaterial({
      color: 0x555555,
      transparent: true,
      opacity: 0,
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.set(0, 0, 0.6);

    const beakGeometry = new THREE.ConeGeometry(0.1, 0.2, 8);
    const beakMaterial = new THREE.MeshPhongMaterial({
      color: 0xffa500,
      transparent: true,
      opacity: 0,
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
  const skyGeometry = new THREE.SphereGeometry(500, 32, 32);
  const skyMaterial = new THREE.MeshBasicMaterial({
    color: 0xadd8e6,
    side: THREE.BackSide,
  });
  sky = new THREE.Mesh(skyGeometry, skyMaterial);
  scene.add(sky);
}

function createClouds() {
  clouds = new THREE.Group();
  scene.add(clouds);

  const cloudMaterial = new THREE.MeshPhongMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
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
  const size = 50;
  const segments = 100;
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);

  const vertices = geometry.attributes.position.array;
  for (let i = 0; i < vertices.length; i += 3) {
    vertices[i + 2] += (Math.random() - 0.5) * 2;
  }
  geometry.computeVertexNormals();

  const material = new THREE.MeshPhongMaterial({
    color: 0xddeeff,
    side: THREE.DoubleSide,
    flatShading: true,
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
  const iceMaterial = new THREE.MeshPhongMaterial({
    color: 0x88ccff,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide,
    flatShading: true,
    specular: 0xffffff,
    shininess: 100,
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
  const growTrack = new THREE.KeyframeTrack(
    ".scale",
    [0, 5],
    [0.1, 0.1, 0.1, 1, 1, 1]
  );
  const growClip = new THREE.AnimationClip("grow", 5, [growTrack]);
  const growAction = mixer.clipAction(growClip);
  growAction.play();
  mixers.push(mixer);

  return treeData;
}

function createTrunk(parent, height) {
  const trunkGeometry = new THREE.CylinderGeometry(0.5, 0.8, height, 8);
  const trunkMaterial = new THREE.MeshPhongMaterial({ color: 0x8b5a2b });
  const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
  trunk.position.y = height / 2;
  parent.add(trunk);
  return trunk;
}

function createLeafCanopy(parent, trunk) {
  const canopyGroup = new THREE.Group();
  parent.add(canopyGroup);

  const canopyMaterial = new THREE.MeshPhongMaterial({
    color: 0xddeeff,
    flatShading: true,
  });

  for (let i = 0; i < 5; i++) {
    const canopyGeometry = new THREE.SphereGeometry(
      2.5 - i * 0.4 + Math.random() * 0.3,
      8,
      8
    );
    const canopy = new THREE.Mesh(canopyGeometry, canopyMaterial);
    canopy.position.set(
      (Math.random() - 0.5) * 0.5,
      trunk.position.y + 2 + i * 1.5,
      (Math.random() - 0.5) * 0.5
    );
    canopyGroup.add(canopy);
  }
  return canopyGroup;
}

function createCherryBlossomFlower() {
  const flowerGroup = new THREE.Group();

  const petalMaterial = new THREE.MeshPhongMaterial({
    color: 0xffb6c1,
    side: THREE.DoubleSide,
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
  const centerMaterial = new THREE.MeshPhongMaterial({ color: 0xffff00 });
  const center = new THREE.Mesh(centerGeometry, centerMaterial);
  flowerGroup.add(center);

  return flowerGroup;
}

function createTextLabel(text, color = "#ffffff") {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const fontSize = 150; // más pequeño que 64 para que no se vean gigantes
  const paddingX = 40;
  const paddingY = 24;
  const maxWidth = 30000; // por si algún sueño es larguísimo

  context.font = `600 ${fontSize}px "Segoe UI", system-ui, -apple-system, sans-serif`;

  // Medir texto (si quieres, aquí podrías hacer un wrap a varias líneas, pero lo dejamos simple)
  const textWidth = Math.min(context.measureText(text).width, maxWidth);

  canvas.width = textWidth + paddingX * 2;
  canvas.height = fontSize + paddingY * 2;

  // Hay que reconfigurar después de cambiar width/height
  context.font = `600 ${fontSize}px "Segoe UI", system-ui, -apple-system, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";

  // Fondo redondeado tipo “pill”
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

  roundRect(
    context,
    0,
    0,
    canvas.width,
    canvas.height,
    radius
  );

  // Relleno
  context.fillStyle = bgColor;
  context.fill();

  // Borde suave
  context.lineWidth = 4;
  context.strokeStyle = borderColor;
  context.stroke();

  // Sombra del texto
  context.shadowColor = "rgba(0, 0, 0, 0.85)";
  context.shadowBlur = 6;
  context.shadowOffsetX = 2;
  context.shadowOffsetY = 3;

  // Texto
  context.fillStyle = color;
  context.fillText(
    text,
    canvas.width / 2,
    canvas.height / 2
  );

  // Texture y sprite
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false, // así siempre se ve encima de las hojas
  });

  const sprite = new THREE.Sprite(material);

  // Escala en el mundo 3D (ajusta si los ves muy grandes/pequeños)
  const pixelsPerUnit = 250; // subir = más pequeño, bajar = más grande
  const w = canvas.width / pixelsPerUnit;
  const h = canvas.height / pixelsPerUnit;
  sprite.scale.set(w, h, 1);

  sprite.renderOrder = 999;
  sprite.userData.isLabel = true; // para identificar en el loop si luego quieres animarlos

  return sprite;
}


function createFlowersAndFruits(parent, trunk) {
  const flowersGroup = new THREE.Group();
  parent.add(flowersGroup);

  const flowerCount = 20;
  for (let i = 0; i < flowerCount; i++) {
    const flower = createCherryBlossomFlower();
    flower.position.set(
      (Math.random() - 0.5) * 4,
      trunk.position.y + 3 + Math.random() * 4,
      (Math.random() - 0.5) * 4
    );
    flower.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
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
      }
      slotIndex = 0;
    }

    stageSlots[slotIndex] = treeId;
  }

  const stagePos = stagePositions[slotIndex];

  // Guardar posición original si aún no la teníamos
  if (!treeObj.group.userData.originalPosition) {
    treeObj.group.userData.originalPosition = treeObj.group.position.clone();
  }

  treeObj.group.position.set(stagePos.x, 0, stagePos.z);
}

function showTreeLabel(meta) {
  let label = document.getElementById("treeLabel");
  if (!label) {
    label = document.createElement("div");
    label.id = "treeLabel";
    label.style.position = "absolute";
    label.style.bottom = "20px";
    label.style.right = "20px";
    label.style.maxWidth = "320px";
    label.style.padding = "12px 16px";
    label.style.borderRadius = "12px";
    label.style.background = "rgba(0,0,0,0.7)";
    label.style.color = "#fff";
    label.style.fontFamily = "system-ui, sans-serif";
    label.style.zIndex = "200";
    document.body.appendChild(label);
  }

  // label.innerHTML = `
  //   <div style="font-size:13px; opacity:.8;">Árbol de</div>
  //   <div style="font-size:18px; font-weight:600;">${meta.userName}</div>
  //   <div style="margin-top:8px; font-size:14px;">"${meta.dream}"</div>
  // `;
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

  // Sky color
  sky.material.color.lerpColors(
    new THREE.Color(0xadd8e6),
    new THREE.Color(0x87ceeb),
    progress
  );

  // Clouds movement
  clouds.children.forEach((cloud) => {
    cloud.position.x += 0.02;
    if (cloud.position.x > 50) cloud.position.x = -50;
  });

  // Trees, canopy, flowers – crecimiento individual según `growth`
  trees.forEach(({ trunk, canopy, flowers, group }) => {
    const growth = group.userData?.growth ?? 0;
    const localProgress = Math.max(0, Math.min(growth / 100, 1));

    trunk.material.color.lerpColors(
      new THREE.Color(0x8b5a2b),
      new THREE.Color(0x8b5a2b),
      progress
    );
    canopy.children.forEach((leaf) => {
      leaf.material.color.lerpColors(
        new THREE.Color(0xddeeff),
        new THREE.Color(0x228b22),
        progress
      );
    });

    const scale = 0.1 + localProgress * 0.9;
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
