import * as THREE from "three";

// Scene Setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(1, 1, 1);
scene.add(directionalLight);

camera.position.z = 5;

class FantasyTree {
  constructor(seed) {
    this.seed = seed;
    this.growthProgress = 0;
    this.trunk = this.createTrunk();
    this.branches = [];
    scene.add(this.trunk);
  }

  createTrunk() {
    const geometry = new THREE.CylinderGeometry(0.1, 0.1, 0.2, 8);
    const material = new THREE.MeshLambertMaterial({
      color: 0x8b4513,
      flatShading: true,
    });
    const trunk = new THREE.Mesh(geometry, material);
    trunk.position.y = 0.1;
    return trunk;
  }

  grow(deltaTime) {
    this.growthProgress = Math.min(1, this.growthProgress + 0.005 * deltaTime);

    // Grow trunk height
    this.trunk.scale.y = THREE.MathUtils.lerp(0.1, 3, this.growthProgress);
    this.trunk.position.y = this.trunk.scale.y / 2;

    // Add branches once the trunk is tall enough
    if (this.growthProgress > 0.3 && this.branches.length === 0) {
      this.createBranch(
        this.trunk,
        new THREE.Vector3(0, this.trunk.scale.y, 0), // Start at the top of the trunk
        new THREE.Vector3(0, 1, 0), // Initial direction (up)
        1, // Initial length
        0
      ); // Depth (starting at 0)
    }

    // Animate branches
    this.branches.forEach((branch) => this.animateBranch(branch));
  }

  createBranch(parent, startPosition, direction, length, depth) {
    const geometry = new THREE.CylinderGeometry(0.05, 0.05, length, 6);
    const material = new THREE.MeshLambertMaterial({
      color: 0x556b2f,
      flatShading: true,
    });
    const branch = new THREE.Mesh(geometry, material);

    // Position and orient the branch
    branch.position.copy(startPosition);

    const upVector = new THREE.Vector3(0, 1, 0);
    // Calculate the quaternion that rotates upVector to direction
    branch.quaternion.setFromUnitVectors(upVector, direction.normalize());

    // Add the branch to the parent
    parent.add(branch);
    this.branches.push(branch);

    // Create sub-branches if not too deep
    if (depth < 3) {
      const numSubBranches = 2 + Math.floor(Math.random() * 2); // 2-3 sub-branches
      for (let i = 0; i < numSubBranches; i++) {
        const subBranchLength = length * 0.7; // Sub-branches are 70% shorter
        // Create a random rotation around the Y-axis (up) to spread branches
        const subBranchDirection = direction.clone().applyAxisAngle(
          new THREE.Vector3(0, 1, 0), // Rotate around Y-axis (up)
          (Math.PI / 4) * (Math.random() - 0.5) // Random angle between -45° and 45°
        );
        const subBranchStart = new THREE.Vector3(0, length, 0).applyQuaternion(branch.quaternion).add(startPosition);

        this.createBranch(branch, subBranchStart, subBranchDirection, subBranchLength, depth + 1);
      }
    }
    // Inside the createBranch() method, after creating sub-branches:
    if (depth === 3) {
      // Add leaves only to the deepest branches
      const leafGeometry = new THREE.ConeGeometry(0.1, 0.2, 4);
      const leafMaterial = new THREE.MeshLambertMaterial({
        color: 0x32cd32,
        flatShading: true,
      });
      const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
      leaf.position.copy(new THREE.Vector3(0, length, 0).applyQuaternion(branch.quaternion).add(startPosition));
      parent.add(leaf);
    }
  }

  animateBranch(branch) {
    branch.rotation.z += Math.sin(Date.now() * 0.001 + branch.uuid) * 0.01;
  }
}

// Create the tree with a random seed
const tree = new FantasyTree(Math.random());

// Animation Loop
const clock = new THREE.Clock();
function animate() {
  const deltaTime = clock.getDelta();
  tree.grow(deltaTime * 1000);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

// Handle window resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
