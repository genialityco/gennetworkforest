import * as THREE from 'three';

let scene, camera, renderer, clock, mixers = [], trees = [], terrain, ice;

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcccccc);

  camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(0, 7, 20);

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

  // Create natural landscape terrain
  createTerrain();

  // Create ice layer
  createIceLayer();

  // Create multiple trees distributed across the terrain
  for (let i = 0; i < 20; i++) {
    const x = (Math.random() - 0.5) * 40;
    const z = (Math.random() - 0.5) * 40;
    const height = 5 + Math.random() * 3;
    createTree(x, z, height);
  }

  animate();
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
  createFlowersAndFruits(treeGroup, trunk);

  trees.push({ trunk, canopy, group: treeGroup });

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
  const trunkMaterial = new THREE.MeshPhongMaterial({ color: 0x8B5A2B });
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
    flatShading: true 
  });
  
  for (let i = 0; i < 5; i++) {
    const canopyGeometry = new THREE.SphereGeometry(2.5 - i * 0.4 + Math.random() * 0.3, 8, 8);
    const canopy = new THREE.Mesh(canopyGeometry, canopyMaterial);
    canopy.position.set((Math.random() - 0.5) * 0.5, trunk.position.y + 2 + i * 1.5, (Math.random() - 0.5) * 0.5);
    canopyGroup.add(canopy);
  }
  return canopyGroup;
}

function createFlowersAndFruits(parent, trunk) {
  const flowerColors = [0xFF69B4, 0xFFB6C1];

  for (let i = 0; i < 20; i++) {
    const flowerGroup = new THREE.Group();
    flowerGroup.position.set(
      (Math.random() - 0.5) * 4,
      trunk.position.y + 3 + Math.random() * 4,
      (Math.random() - 0.5) * 4
    );
    parent.add(flowerGroup);
  }
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  mixers.forEach(mixer => mixer.update(delta));
  
  const elapsedTime = clock.getElapsedTime();
  const totalDuration = 10; // Total animation duration in seconds
  const progress = Math.min(elapsedTime / totalDuration, 1); // Progress from 0 to 1

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
    new THREE.Color(0x228B22), // Green color
    progress
  );

  // Transition tree colors and animate growth
  trees.forEach(({ trunk, canopy, group }) => {
    // Transition trunk color (if desired, you can keep it constant)
    trunk.material.color.lerpColors(
      new THREE.Color(0x8B5A2B), // Winter trunk (darker)
      new THREE.Color(0x8B5A2B), // Normal trunk
      progress
    );

    // Transition canopy color from frosty to green
    canopy.children.forEach(leaf => {
      leaf.material.color.lerpColors(
        new THREE.Color(0xddeeff), // Frosty color
        new THREE.Color(0x228B22), // Green color
        progress
      );
    });

    // Ensure tree growth is synchronized with melting
    const growthProgress = Math.min(elapsedTime / totalDuration, 1);
    const scale = 0.1 + growthProgress * 0.9; // Grow from 0.1 to 1
    group.scale.set(scale, scale, scale);
  });

  renderer.render(scene, camera);
}

init();

// Handle window resize
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});