// src/main.js

import * as THREE from 'three';
import { Tween,Easing } from '@tweenjs/tween.js';

let scene, camera, renderer;
let treeRoot;
let  tween;

const params = {
  maxDepth: 6,        // how many levels of branching
  trunkLength: 5,     // initial trunk length
  trunkThickness: 0.5 // initial trunk thickness
};

init();
animate();

/**
 * Initialize the scene, camera, renderer, lights, etc.
 */
function init() {
  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb); // a light sky color

  // Camera
  camera = new THREE.PerspectiveCamera(
    60,                 // field of view
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 5, 12);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.getElementById('canvas-container').appendChild(renderer.domElement);

  // Handle window resize
  window.addEventListener('resize', onWindowResize, false);

  // Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(10, 20, 10);
  scene.add(dirLight);

  // Create a ground (optional, for visual reference)
  const groundGeometry = new THREE.PlaneGeometry(100, 100);
  const groundMaterial = new THREE.MeshPhongMaterial({ color: 0x228B22 });
  const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.y = -1;
  scene.add(groundMesh);

  // Create the root for our tree
  treeRoot = new THREE.Group();
  scene.add(treeRoot);

  // Start the tree creation from a "seed"
  createBranch(treeRoot, params.trunkLength, params.trunkThickness, params.maxDepth);
}

/**
 * Recursively creates branches, each of which "grows" via TWEEN.
 * @param {THREE.Object3D} parent - The parent to attach the new branch to.
 * @param {number} length - The length of the current branch.
 * @param {number} thickness - The thickness (radius) of the current branch.
 * @param {number} depth - Remaining recursion depth.
 */
function createBranch(parent, length, thickness, depth) {
  if (depth <= 0) return;

  // Cylinder geometry for a low-poly look (few radial segments)
  const radialSegments = 6; // fewer segments -> more faceted (low poly)
  const geometry = new THREE.CylinderGeometry(
    thickness,   // top radius
    thickness,   // bottom radius
    length,      // height
    radialSegments,
    1,
    false
  );
  // Translate so the cylinder base is at y=0 and extends upward
  geometry.translate(0, length / 2, 0);

  // Random color for fun (HSL with random hue)
  const hue = Math.random() * 360;
  const material = new THREE.MeshPhongMaterial({
    color: new THREE.Color(`hsl(${hue}, 75%, 50%)`),
    flatShading: true
  });

  // Create mesh and add to parent
  const branchMesh = new THREE.Mesh(geometry, material);
  parent.add(branchMesh);

  // Start scaled down (Y=0) so it looks like it's growing
  branchMesh.scale.y = 0;

  // Animate the scale.y to 1 over 1 second
  tween = new Tween(branchMesh.scale)
    .to({ y: 1 }, 1000)
    .easing(Easing.Sinusoidal.Out)
    .start()
    .onComplete(() => {
      // Once grown, create child branches from its tip
      // We randomly decide how many branches to spawn (1-3).
      const branchCount = Math.floor(Math.random() * 3) + 1;
      for (let i = 0; i < branchCount; i++) {
        // Random angle around Z or Y can give a spread
        const angleZ = (Math.random() * Math.PI) - Math.PI / 2;
        const angleY = (Math.random() * Math.PI * 2);

        // Slightly shorter child branches
        const childLength = length * (0.5 + Math.random() * 0.3);
        const childThickness = thickness * 0.7;

        // Create a group to hold the child branch so we can rotate it
        const childGroup = new THREE.Group();
        branchMesh.add(childGroup);

        // Position at the top of the current branch
        childGroup.position.set(0, length, 0);

        // Random rotation to spread out branches
        childGroup.rotation.z = angleZ;
        childGroup.rotation.y = angleY;

        // Recursively generate child
        createBranch(childGroup, childLength, childThickness, depth - 1);
      }
    });
}

/**
 * Animate loop: update TWEENs and re-render scene.
 */
function animate(time) {
  requestAnimationFrame(animate);
  tween.update(time);
  renderer.render(scene, camera);
}

/**
 * Keep the scene responsive to resize events.
 */
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}