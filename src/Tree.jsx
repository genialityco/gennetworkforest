import * as THREE from "three";
import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import {
  Cylinder,
  Sphere,
  OrbitControls,
} from "@react-three/drei";

/* ================= TREE ================= */

function Tree({ grow }) {
  const {
    trunkHeight,
    trunkTopRadius,
    trunkBottomRadius,
    canopyCount,
    showFruits,
    canopyGrowthFactor, // Nuevo factor para el tamaño de la copa
    fruitSize,          // Nuevo factor para el tamaño del fruto
    canopyYOffset,      // Nuevo factor para la posición Y de la copa
  } = useMemo(() => {
    console.log("Calculando propiedades del árbol para grow:", grow.grow);
    const clamped = Math.min(100, Math.max(0, grow.grow)); // Asegura que grow esté entre 1 y 100
    const normalizedGrow = clamped / 100; // Valor entre 0 y 1 para un escalado fácil

    return {
      // 🌳 TRONCO: Mayor factor de crecimiento
      trunkHeight: 5 + normalizedGrow * 8,    // Crece hasta 9 de altura
      trunkTopRadius: 0.5 + normalizedGrow * 0.8, // Crece hasta 1.3 de radio superior
      trunkBottomRadius: 0.8 + normalizedGrow * 0.3, // También puede crecer ligeramente la base
      
      // 🍃 COPA
      canopyCount: Math.floor(1 + normalizedGrow * 6), // Crece hasta 7 esferas de copa
      canopyGrowthFactor: 0.9 + normalizedGrow * 2,    // La copa puede ser hasta 3 veces más grande
      canopyYOffset: normalizedGrow * 2,             // La copa se eleva más a medida que crece el tronco
      
      // 🍒 FRUTOS: Aparecen antes y crecen en tamaño
      showFruits: clamped > 30, // Aparecen al 30% del crecimiento
      fruitSize: 0.5 + normalizedGrow * 0.5, // Crece hasta 1.0 de radio
    };
  }, [grow]);

  return (
    <group scale={0.1} castShadow>
      {/* 🌳 Tronco */}
      <Cylinder
        args={[
          trunkTopRadius,
          trunkBottomRadius,
          trunkHeight,
          8,
        ]}
        position={[0, trunkHeight / 2, 0]}
        castShadow
      >
        <meshStandardMaterial
          color="#8b5a2b"
          roughness={0.7}
        />
      </Cylinder>

      {/* 🍃 Copa */}
      {Array.from({ length: canopyCount }).map((_, i) => (
        <Sphere
          key={i}
          args={[
            (3.6 - i * 0.35) * canopyGrowthFactor, // Aplica el factor de crecimiento al radio
            8, 
            8
          ]}
          position={[
            (Math.random() - 0.5) * 0.6,
            trunkHeight - 1 + i * 1.4 + canopyYOffset, // Ajusta la posición Y de la copa
            (Math.random() - 0.5) * 0.6,
          ]}
          castShadow
        >
          <meshStandardMaterial
            color="#1f7a3b"
            flatShading
          />
        </Sphere>
      ))}

      {/* 🍒 Frutos */}
      {showFruits &&
        Array.from({ length: 5 }).map((_, i) => (
          <Sphere
            key={i}
            args={[fruitSize, 16, 16]} // Aplica el factor de tamaño del fruto
            position={[
              Math.cos(i * 1.5) * 7 * canopyGrowthFactor * 0.5, // Distribución más amplia en una copa grande
              trunkHeight + 1.5 + canopyYOffset, // Se posiciona más arriba con el crecimiento
              Math.sin(i * 1.5) * 7 * canopyGrowthFactor * 0.5,
            ]}
            castShadow
          >
            <meshStandardMaterial color="#d40000" />
          </Sphere>
        ))}
    </group>
  );
}

/* ================= ENVIRONMENT ================= */

// ... (El resto del código de Ground, Sky, Sun, y UserTree3D permanece igual)

function Ground() {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0, 0]}
      receiveShadow
    >
      <planeGeometry args={[100, 100]} />
      <meshStandardMaterial
        color="#5a8f3a"
        roughness={0.9}
      />
    </mesh>
  );
}

function Sky() {
  return (
    <mesh>
      <sphereGeometry args={[200, 32, 32]} />
      <meshBasicMaterial
        color="#87ceeb"
        side={THREE.BackSide}
      />
    </mesh>
  );
}

function Sun() {
  return (
    <>
      {/* Sol visible */}
      <Sphere position={[30, 40, -30]} args={[3, 32, 32]}>
        <meshBasicMaterial color="#fff176" />
      </Sphere>

      {/* Luz del sol */}
      <directionalLight
        position={[30, 40, -30]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={150}
        shadow-camera-left={-50}
        shadow-camera-right={50}
        shadow-camera-top={50}
        shadow-camera-bottom={-50}
      />
    </>
  );
}

/* ================= SCENE ================= */

export function UserTree3D(treeGrow) {
  return (
    <Canvas
      shadows
      camera={{ position: [4, 6, 8], fov: 50 }}
    >
      {/* Atmósfera */}
      <fog attach="fog" args={["#cce0ff", 20, 80]} />

      <Sky />
      <Sun />

      <ambientLight intensity={0.35} />

      <Tree grow={treeGrow} /> {/* grow=80 para mostrar el árbol crecido */}
      <Ground />

      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        minDistance={3}
        maxDistance={20}
      />
    </Canvas>
  );
}
export default UserTree3D;