import * as THREE from "three";
import { createNoise3D } from "simplex-noise";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebaseConfig.js";

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

  // Fog in winter
  scene.fog = new THREE.Fog(0xaaaaaa, 10, 50);

  // Basic scene objects
  createSky();
  createClouds();
  createTerrain();
  createIceLayer();
  createSun();
  createButterflies();
  createBirds();

  // Buttons
  // addTreePlantingButton();
  addAudioStartButton(); // <- AÑADIMOS BOTÓN PARA INICIAR AUDIO

  listenToTreesCount();
  listenToSceneConfig();

  // Audios (usando rutas en /public)
  winterAudio = new Audio("/8Room-Cyberpunk-Matrix.mp3");
  springAudio = new Audio("/birds-frogs-nature-8257.mp3");
  // Para bucle:
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

  // Cuando hace clic, permitimos la reproducción
  audioButton.addEventListener("click", () => {
    hasUserAllowedAudio = true;
    // Opcional: podrías esconder el botón si quieres
    // audioButton.style.display = "none";

    // Iniciamos de inmediato el audio de invierno (si la escena está todavía <70%)
    // para que el usuario escuche algo en seguida
    // (la lógica de animate() seguirá pausando/reproduciendo según el progreso).
    winterAudio.play().catch(err => console.log(err));
    isWinterAudioPlaying = true;
  });
}

/**
 * Lógica normal de Firestore
 */
function listenToTreesCount() {
  onSnapshot(
    treesRef,
    (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        document.getElementById("treesValue").innerText = data.trees;
        addTree();
      } else {
        document.getElementById("treesValue").innerText = "0";
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

function addTreePlantingButton() {
  const addTreeButton = document.createElement("button");
  addTreeButton.id = "addTreeButton";
  addTreeButton.textContent = "Plant a Tree";
  addTreeButton.style.position = "absolute";
  addTreeButton.style.top = "20px";
  addTreeButton.style.left = "20px";
  addTreeButton.style.zIndex = "100";
  addTreeButton.style.padding = "10px 20px";
  document.body.appendChild(addTreeButton);

  addTreeButton.addEventListener("click", addTree);
}

function addTree() {
  const x = (Math.random() - 0.5) * 40;
  const z = (Math.random() - 0.5) * 40;
  const height = 5 + Math.random() * 3;

  createTree(x, z, height);
  treeCount++;
  treeCount = Math.min(treeCount, MAX_TREES);
}

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
  // Actualiza la ruta de tu textura real:
  const butterflyTexture = textureLoader.load("path/to/butterfly_wing_texture.png");

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

  trees.push({ trunk, canopy, flowers, group: treeGroup });

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

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  mixers.forEach((mixer) => mixer.update(delta));

  const elapsedTime = clock.getElapsedTime();
  const progress = Math.min(treeCount / MAX_TREES, 1);

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

  // Trees, canopy, flowers
  trees.forEach(({ trunk, canopy, flowers, group }) => {
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

    const scale = 0.1 + progress * 0.9;
    group.scale.set(scale, scale, scale);

    flowers.children.forEach((flower) => {
      const flowerScale = progress;
      flower.scale.set(flowerScale, flowerScale, flowerScale);
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
        noise3D(0, butterfly.userData.noiseOffset + elapsedTime * 0.1, 0) * 0.05;
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

      // Bounds
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

  // SOLAMENTE hacemos la lógica de reproducir/pausar audio si el usuario lo ha permitido
  if (hasUserAllowedAudio) {
    if (progress < 0.7) {
      // Queremos audio de invierno
      if (!isWinterAudioPlaying) {
        if (!springAudio.paused) {
          springAudio.pause();
          springAudio.currentTime = 0;
          isSpringAudioPlaying = false;
        }
        winterAudio.play().catch((err) => console.log(err));
        isWinterAudioPlaying = true;
      }
    } else {
      // Queremos audio de primavera
      if (isWinterAudioPlaying) {
        winterAudio.pause();
        winterAudio.currentTime = 0;
        isWinterAudioPlaying = false;
      }
      if (!isSpringAudioPlaying) {
        springAudio.play().catch((err) => console.log(err));
        isSpringAudioPlaying = true;
      }
    }
  }

  renderer.render(scene, camera);
}

init();

// Resize
window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});
