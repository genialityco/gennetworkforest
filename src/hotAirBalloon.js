import * as THREE from "three";

export function createLowPolyBalloon() {
  const balloonGroup = new THREE.Group();

  const colors = [0x003e74, 0x0075c9, 0x5cc8ff, 0xffd400, 0xffffff];

  const balloonGeo = new THREE.IcosahedronGeometry(2.2, 0);
  const balloonMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    flatShading: true,
    vertexColors: true,
  });

  const colorAttr = new Float32Array(balloonGeo.attributes.position.count * 3);
  for (let i = 0; i < balloonGeo.attributes.position.count; i++) {
    const c = new THREE.Color(colors[Math.floor(Math.random() * colors.length)]);
    colorAttr[i * 3 + 0] = c.r;
    colorAttr[i * 3 + 1] = c.g;
    colorAttr[i * 3 + 2] = c.b;
  }
  balloonGeo.setAttribute("color", new THREE.BufferAttribute(colorAttr, 3));

  const balloonMesh = new THREE.Mesh(balloonGeo, balloonMat);
  balloonMesh.position.y = 2.5;
  balloonMesh.castShadow = true;
  balloonMesh.receiveShadow = true;
  balloonGroup.add(balloonMesh);

  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#8B5A2B";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "white";
  ctx.font = "bold 80px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const text = "Congreso Internacional de Educación";
  const maxWidth = 900;
  const lines = [];
  const words = text.split(" ");
  let line = "";

  for (const word of words) {
    const test = `${line}${word} `;
    if (ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = `${word} `;
    } else {
      line = test;
    }
  }
  lines.push(line);

  const lineHeight = 90;
  const startY = canvas.height / 2 - (lines.length * lineHeight) / 2;
  lines.forEach((row, index) => {
    ctx.fillText(row.trim(), canvas.width / 2, startY + index * lineHeight);
  });

  const textTexture = new THREE.CanvasTexture(canvas);
  textTexture.anisotropy = 16;
  textTexture.needsUpdate = true;

  const basketMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x8b5a2b }),
    new THREE.MeshStandardMaterial({ color: 0x8b5a2b }),
    new THREE.MeshStandardMaterial({ map: textTexture }),
    new THREE.MeshStandardMaterial({ color: 0x8b5a2b }),
    new THREE.MeshStandardMaterial({ map: textTexture }),
    new THREE.MeshStandardMaterial({ color: 0x8b5a2b }),
  ];

  const basketGeo = new THREE.BoxGeometry(0.8, 0.6, 0.8);
  const basketMesh = new THREE.Mesh(basketGeo, basketMaterials);
  basketMesh.position.y = 0.2;
  basketMesh.castShadow = true;
  basketMesh.receiveShadow = true;
  balloonGroup.add(basketMesh);

  const ropeMaterial = new THREE.MeshStandardMaterial({
    color: 0xcccccc,
    flatShading: true,
  });
  const ropeGeo = new THREE.CylinderGeometry(0.03, 0.03, 2, 6, 1, true);

  const ropePositions = [
    [-0.3, 1.5, -0.3],
    [0.3, 1.5, -0.3],
    [-0.3, 1.5, 0.3],
    [0.3, 1.5, 0.3],
  ];

  ropePositions.forEach((pos) => {
    const rope = new THREE.Mesh(ropeGeo, ropeMaterial);
    rope.position.set(pos[0], 1.4, pos[2]);
    balloonGroup.add(rope);
  });

  balloonGroup.scale.set(1, 1.2, 1);

  return balloonGroup;
}
