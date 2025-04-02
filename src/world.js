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
// Add global variables for tree counting

let treeCount = 0;
let MAX_TREES = 200; // Number of trees needed for 100% progress

const treesRef = doc(db, "globalCounters", "treesCounter");
const configRef = doc(db, "adminConfig", "sceneConfig");
const noise3D = createNoise3D();

let winterAudio, springAudio;
let isWinterAudioPlaying = false;
let isSpringAudioPlaying = false;

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcccccc);

  camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    2000 // Increase far plane to see skybox
  );
  camera.position.set(0, 10, 40); // Move camera higher and further back
  camera.lookAt(0, 0, 0); // Ensure camera is oriented towards the center of the scene

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

  // Add fog for a winter atmosphere
  scene.fog = new THREE.Fog(0xaaaaaa, 10, 50);

  // Create sky
  createSky();

  // Create clouds
  createClouds();

  // Create natural landscape terrain
  createTerrain();

  // Create ice layer
  createIceLayer();

  // Create sun and sunlight
  createSun();

  // Create butterflies
  createButterflies();

  // Create birds
  createBirds();

  addTreePlantingButton();

  listenToTreesCount();
  listenToSceneConfig();
  // Create multiple trees distributed across the terrain
  //   for (let i = 0; i < 20; i++) {
  //     const x = (Math.random() - 0.5) * 40;
  //     const z = (Math.random() - 0.5) * 40;
  //     const height = 5 + Math.random() * 3;
  //     createTree(x, z, height);
  //   }

  winterAudio = new Audio("/8Room-Cyberpunk-Matrix.mp3");
  springAudio = new Audio("/birds-frogs-nature-8257.mp3");
  // Si quieres que el audio se repita en bucle, descomenta:
  winterAudio.loop = true;
  springAudio.loop = true;

  animate();
}

function listenToTreesCount() {
  onSnapshot(
    treesRef,
    (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        document.getElementById("treesValue").innerText = data.trees;

        // Podrías controlar aquí cuántos árboles “fisicamente” tienes en la escena
        // Por ejemplo, si data.trees sube a 10 y treeCount es 5, añades 5 árboles más, etc.
        // Por ahora, este ejemplo simplemente añade uno cada vez:
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
          MAX_TREES = data.maxTrees; // Actualizamos la variable global
          console.log("maxTrees actualizado desde Firestore:", MAX_TREES);
        }
      }
    },
    (error) => {
      console.error("Error fetching scene config:", error);
    }
  );
}


listenToTreesCount();

function addTreePlantingButton() {
  // Add tree planting button
  const addTreeButton = document.createElement("button");
  addTreeButton.id = "addTreeButton";
  addTreeButton.textContent = "Plant a Tree";
  addTreeButton.style.position = "absolute";
  addTreeButton.style.top = "20px";
  addTreeButton.style.left = "20px";
  addTreeButton.style.zIndex = "100";
  addTreeButton.style.padding = "10px 20px";
  document.body.appendChild(addTreeButton);

  // Add event listener
  addTreeButton.addEventListener("click", addTree);
}

// New function to add trees
function addTree() {
  const x = (Math.random() - 0.5) * 40;
  const z = (Math.random() - 0.5) * 40;
  const height = 5 + Math.random() * 3;

  createTree(x, z, height);

  treeCount++;
  treeCount = Math.min(treeCount, MAX_TREES); // Cap at maximum
}
// Function to create the sun and sunlight
function createSun() {
  // Create sun
  const sunGeometry = new THREE.SphereGeometry(2, 32, 32);
  const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 }); // Bright yellow
  sun = new THREE.Mesh(sunGeometry, sunMaterial);
  sun.position.set(30, 30, -50); // Position in the sky
  sun.visible = false; // Start invisible
  scene.add(sun);

  // Create sunlight
  sunlight = new THREE.DirectionalLight(0xffff00, 0); // Start with zero intensity
  sunlight.position.copy(sun.position);
  scene.add(sunlight);
}

// Function to create butterflies
function createButterflies() {
  butterflies = new THREE.Group();
  scene.add(butterflies);

  const butterflyCount = 10; // Number of butterflies
  const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff]; // Colorful butterflies

  // Load a butterfly wing texture (you'll need to provide a texture image)
  const textureLoader = new THREE.TextureLoader();
  const butterflyTexture = textureLoader.load(
    "path/to/butterfly_wing_texture.png"
  ); // Replace with actual path

  for (let i = 0; i < butterflyCount; i++) {
    // Create butterfly body
    const bodyGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8);
    const bodyMaterial = new THREE.MeshPhongMaterial({ color: 0x333333 }); // Dark body
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);

    // Create butterfly wings (two sprites for left and right wings)
    const wingMaterial = new THREE.SpriteMaterial({
      map: butterflyTexture,
      color: colors[i % colors.length],
      transparent: true,
      opacity: 0, // Start invisible
    });
    const leftWing = new THREE.Sprite(wingMaterial);
    leftWing.scale.set(0.5, 0.5, 1);
    leftWing.position.set(-0.2, 0, 0); // Position left wing

    const rightWing = new THREE.Sprite(wingMaterial);
    rightWing.scale.set(0.5, 0.5, 1);
    rightWing.position.set(0.2, 0, 0); // Position right wing

    // Group butterfly parts
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
      flapPhase: Math.random() * Math.PI * 2, // For wing flapping animation
      noiseOffset: Math.random() * 100, // For organic movement
    };
    butterflies.add(butterfly);
  }
}

// Function to create birds
function createBirds() {
  birds = new THREE.Group();
  scene.add(birds);

  const birdCount = 5; // Number of birds

  for (let i = 0; i < birdCount; i++) {
    // Create bird body (ellipsoid shape)
    const bodyGeometry = new THREE.SphereGeometry(0.4, 16, 16);
    bodyGeometry.scale(1, 0.5, 1.5); // Stretch into bird-like shape
    const bodyMaterial = new THREE.MeshPhongMaterial({
      color: 0x555555, // Grayish bird color
      transparent: true,
      opacity: 0, // Start invisible
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);

    // Create bird wings (two planes for flapping)
    const wingGeometry = new THREE.PlaneGeometry(0.6, 0.3);
    const wingMaterial = new THREE.MeshPhongMaterial({
      color: 0x444444,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0, // Start invisible
    });
    const leftWing = new THREE.Mesh(wingGeometry, wingMaterial);
    leftWing.position.set(-0.3, 0, 0);
    leftWing.rotation.y = Math.PI / 2; // Orient wing

    const rightWing = new THREE.Mesh(wingGeometry, wingMaterial);
    rightWing.position.set(0.3, 0, 0);
    rightWing.rotation.y = -Math.PI / 2; // Orient wing

    // Create bird head
    const headGeometry = new THREE.SphereGeometry(0.2, 16, 16);
    const headMaterial = new THREE.MeshPhongMaterial({
      color: 0x555555,
      transparent: true,
      opacity: 0, // Start invisible
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.set(0, 0, 0.6); // Position head at front

    // Create bird beak
    const beakGeometry = new THREE.ConeGeometry(0.1, 0.2, 8);
    const beakMaterial = new THREE.MeshPhongMaterial({
      color: 0xffa500, // Orange beak
      transparent: true,
      opacity: 0, // Start invisible
    });
    const beak = new THREE.Mesh(beakGeometry, beakMaterial);
    beak.position.set(0, 0, 0.8); // Position beak on head
    beak.rotation.x = Math.PI / 2;

    // Group bird parts
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
      flapPhase: Math.random() * Math.PI * 2, // For wing flapping animation
      noiseOffset: Math.random() * 100, // For organic movement
    };
    birds.add(bird);
  }
}

function createSky() {
  // Create a skybox
  const skyGeometry = new THREE.SphereGeometry(500, 32, 32); // Large sphere to encompass scene
  const skyMaterial = new THREE.MeshBasicMaterial({
    color: 0xadd8e6, // Start with a pale winter blue
    side: THREE.BackSide, // Render inside of sphere
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

  const cloudCount = 10; // Number of clouds
  for (let i = 0; i < cloudCount; i++) {
    const cloud = new THREE.Group();
    const puffCount = 3 + Math.floor(Math.random() * 3); // 3-5 puffs per cloud
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
      (Math.random() - 0.5) * 100, // Spread clouds across the sky
      20 + Math.random() * 5, // Height above terrain
      (Math.random() - 0.5) * 100
    );
    cloud.scale.set(2, 1, 2); // Flatten clouds slightly
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
    color: 0xddeeff, // Start with a snowy color for winter
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
    color: 0x88ccff, // Light blue for ice
    transparent: true,
    opacity: 0.7, // Semi-transparent
    side: THREE.DoubleSide,
    flatShading: true,
    specular: 0xffffff, // Add some shininess for ice
    shininess: 100,
  });

  ice = new THREE.Mesh(iceGeometry, iceMaterial);
  ice.rotation.x = -Math.PI / 2;
  ice.position.y = -0.9; // Slightly above terrain
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

  // Animate growth
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
    color: 0xddeeff, // Start with a frosty color for winter
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

  // Petals (resembling 🌸)
  const petalMaterial = new THREE.MeshPhongMaterial({
    color: 0xffb6c1,
    side: THREE.DoubleSide,
  });
  const petalGeometry = new THREE.CircleGeometry(0.2, 16); // Small circular petals
  for (let i = 0; i < 5; i++) {
    // 5 petals for cherry blossom
    const petal = new THREE.Mesh(petalGeometry, petalMaterial);
    const angle = (i / 5) * Math.PI * 2; // Distribute petals in a circle
    petal.position.set(Math.cos(angle) * 0.3, 0, Math.sin(angle) * 0.3);
    petal.rotation.x = Math.PI / 2; // Lay flat
    petal.rotation.z = angle; // Rotate to face outward
    flowerGroup.add(petal);
  }

  // Center of the flower (yellow stamen)
  const centerGeometry = new THREE.SphereGeometry(0.1, 8, 8);
  const centerMaterial = new THREE.MeshPhongMaterial({ color: 0xffff00 });
  const center = new THREE.Mesh(centerGeometry, centerMaterial);
  flowerGroup.add(center);

  return flowerGroup;
}

function createFlowersAndFruits(parent, trunk) {
  const flowersGroup = new THREE.Group();
  parent.add(flowersGroup);

  const flowerCount = 20; // Number of flowers per tree
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
    ); // Random rotation for natural look
    flower.scale.set(0, 0, 0); // Start invisible (will grow with tree)
    flowersGroup.add(flower);
  }

  return flowersGroup;
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  mixers.forEach((mixer) => mixer.update(delta));

  //   const elapsedTime = clock.getElapsedTime();
  //   const totalDuration = 10; // Total animation duration in seconds
  //   const progress = Math.min(elapsedTime / totalDuration, 1); // Progress from 0 to 1

  const elapsedTime = clock.getElapsedTime(); // Keep for animations that still need time
  const progress = Math.min(treeCount / MAX_TREES, 1); // Progress based on tree count

  // Simulate ice melting
  if (ice) {
    ice.material.opacity = 0.7 * (1 - progress); // Fade out ice
    ice.scale.set(1 - progress * 0.5, 1, 1 - progress * 0.5); // Shrink ice
    if (progress === 1) {
      scene.remove(ice); // Remove ice when fully melted
      ice = null;
    }
  }

  // Transition terrain color from snowy to green
  terrain.material.color.lerpColors(
    new THREE.Color(0xddeeff), // Snowy color
    new THREE.Color(0x228b22), // Green color
    progress
  );

  // Transition sky color from pale winter blue to bright spring blue
  sky.material.color.lerpColors(
    new THREE.Color(0xadd8e6), // Pale winter blue
    new THREE.Color(0x87ceeb), // Bright spring blue
    progress
  );

  // Animate clouds
  clouds.children.forEach((cloud) => {
    cloud.position.x += 0.02; // Move clouds horizontally
    if (cloud.position.x > 50) cloud.position.x = -50; // Wrap around
  });

  // Transition tree colors, animate growth, and add flowers
  trees.forEach(({ trunk, canopy, flowers, group }) => {
    // Transition trunk color (if desired, you can keep it constant)
    trunk.material.color.lerpColors(
      new THREE.Color(0x8b5a2b), // Winter trunk (darker)
      new THREE.Color(0x8b5a2b), // Normal trunk
      progress
    );

    // Transition canopy color from frosty to green
    canopy.children.forEach((leaf) => {
      leaf.material.color.lerpColors(
        new THREE.Color(0xddeeff), // Frosty color
        new THREE.Color(0x228b22), // Green color
        progress
      );
    });

    // Ensure tree growth is synchronized with melting
    //const growthProgress = Math.min(elapsedTime / totalDuration, 1);
    const growthProgress = progress; // Use the same tree-based progress
    const scale = 0.1 + growthProgress * 0.9; // Grow from 0.1 to 1
    group.scale.set(scale, scale, scale);

    // Animate flower growth (flowers appear as tree grows)
    flowers.children.forEach((flower) => {
      const flowerScale = growthProgress; // Flowers grow with tree
      flower.scale.set(flowerScale, flowerScale, flowerScale);
    });
  });

  // Animation updates for spring effects (replace the existing spring effects block)
  const springProgress = Math.max(0, (progress - 0.7) / 0.3); // Spring effects start at 70% of animation

  // Spring effects (sun, sunlight, fog removal, butterflies, birds)
  if (springProgress > 0) {
    // Show sun and increase sunlight intensity
    sun.visible = true;
    sunlight.intensity = springProgress * 0.5; // Max intensity 0.5

    // Remove fog
    if (scene.fog) {
      scene.fog.far = 50 + springProgress * 950; // Extend fog far plane
      if (springProgress === 1) scene.fog = null; // Remove fog completely
    }

    // Animate butterflies
    butterflies.children.forEach((butterfly) => {
      // Fade in butterfly
      butterfly.children.forEach((child) => {
        if (child.material) child.material.opacity = springProgress;
      });

      // Organic movement using noise
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

      // Flap wings
      const flapAngle =
        Math.sin(elapsedTime * 5 + butterfly.userData.flapPhase) * 0.5;
      butterfly.children[1].rotation.z = flapAngle; // Left wing
      butterfly.children[2].rotation.z = -flapAngle; // Right wing

      // Keep butterflies within bounds
      if (butterfly.position.x > 50 || butterfly.position.x < -50)
        butterfly.userData.velocity.x *= -1;
      if (butterfly.position.z > 50 || butterfly.position.z < -50)
        butterfly.userData.velocity.z *= -1;
      if (butterfly.position.y > 15 || butterfly.position.y < 5)
        butterfly.userData.velocity.y *= -1;
    });

    // Animate birds
    birds.children.forEach((bird) => {
      // Fade in bird
      bird.children.forEach((child) => {
        if (child.material) child.material.opacity = springProgress;
      });

      // Organic movement using noise
      const noiseX =
        noise3D(bird.userData.noiseOffset + elapsedTime * 0.05, 0, 0) * 0.2;
      const noiseZ =
        noise3D(0, 0, bird.userData.noiseOffset + elapsedTime * 0.05) * 0.2;
      bird.position.add(
        bird.userData.velocity.clone().add(new THREE.Vector3(noiseX, 0, noiseZ))
      );

      // Flap wings
      const flapAngle =
        Math.sin(elapsedTime * 3 + bird.userData.flapPhase) * 0.3;
      bird.children[1].rotation.z = flapAngle; // Left wing
      bird.children[2].rotation.z = -flapAngle; // Right wing

      // Orient bird to face movement direction
      const velocity = bird.userData.velocity.clone().normalize();
      bird.lookAt(bird.position.clone().add(velocity));

      // Keep birds within bounds
      if (bird.position.x > 100 || bird.position.x < -100)
        bird.userData.velocity.x *= -1;
      if (bird.position.z > 100 || bird.position.z < -100)
        bird.userData.velocity.z *= -1;
    });
  }

  if (progress < 0.7) {
    // Queremos audio de invierno
    if (!isWinterAudioPlaying) {
      // Si estaba sonando el de primavera, lo paramos
      if (!springAudio.paused) {
        springAudio.pause();
        springAudio.currentTime = 0;
        isSpringAudioPlaying = false;
      }
      // Iniciamos o resumimos el de invierno
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

  renderer.render(scene, camera);
}

init();

// Handle window resize
window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});
