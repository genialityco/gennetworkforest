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
  
  // 💡 Corrección: Las propiedades se definen aquí, fuera de useMemo,
  // para que sean accesibles en todo el componente, incluyendo la función auxiliar.
  const {
    trunkHeight,
    trunkTopRadius,
    trunkBottomRadius,
    canopyCount,
    showFlowers,
    showFruits,
    canopyGrowthFactor,
    flowerSize,
    fruitSize,
    canopyYOffset,
  } = useMemo(() => {
    console.log("Calculando propiedades del árbol para grow:", grow.grow);
    const clamped = Math.min(100, Math.max(0, grow.grow));
    const normalizedGrow = clamped / 100;

    return {
      // 🌳 TRONCO
      trunkHeight: 5 + normalizedGrow * 8,
      trunkTopRadius: 0.5 + normalizedGrow * 0.8,
      trunkBottomRadius: 0.8 + normalizedGrow * 0.3,
      
      // 🍃 COPA
      canopyCount: Math.floor(1 + normalizedGrow * 6),
      canopyGrowthFactor: 0.9 + normalizedGrow * 2,
      canopyYOffset: normalizedGrow * 2,
      
      // 🌸 FLORES: Aparecen después del 50%
      showFlowers: clamped > 50 && clamped < 80,
      flowerSize: 0.4 + normalizedGrow * 0.3,
      
      // 🍒 FRUTOS: Aparecen al 80% o más
      showFruits: clamped >= 80,
      fruitSize: 0.5 + normalizedGrow * 0.5,
    };
  }, [grow]);
  
  // 💡 Función auxiliar para obtener una posición aleatoria dentro del volumen de la copa.
  const getRandomPositionInCanopy = () => {
    if (canopyCount === 0) {
      return [0, trunkHeight + 3, 0];
    }

    // 1. Determinar el rango vertical y horizontal de la copa
    const canopyTopY = trunkHeight - 1 + (canopyCount - 1) * 1.4 + canopyYOffset;
    const canopyBottomY = trunkHeight - 1 + canopyYOffset;
    const heightRange = canopyTopY - canopyBottomY;
    
    // Radio horizontal máximo (basado en la esfera de copa más baja, la más grande)
    const maxRadius = (3.4) * canopyGrowthFactor; 

    // 2. Generar coordenadas cilíndricas aleatorias
    // Altura (Y) dentro del rango
    const y = canopyBottomY + Math.random() * heightRange;
    
    // Radio (R) y Ángulo (Theta)
    // Se usa la raíz cuadrada para concentrar más elementos cerca del centro,
    // o simplemente Math.random() para distribución uniforme. Usaremos Math.random().
    const r = Math.random() * maxRadius;
    const angle = Math.random() * Math.PI * 2;
    
    // Convertir a coordenadas Cartesianas (X, Z)
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;

    return [x, y, z];
  };


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
            (3.6 - i * 0.35) * canopyGrowthFactor,
            8, 
            8
          ]}
          position={[
            (Math.random() - 0.5) * 0.6,
            trunkHeight - 1 + i * 1.4 + canopyYOffset,
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

      {/* 🌸 Flores - MODIFICADO para distribución aleatoria */}
      {showFlowers && Array.from({ length: 25 }).map((_, i) => { // Aumentado a 25 flores
        const [xPos, yPos, zPos] = getRandomPositionInCanopy();
        
        return (
          <group 
            key={`flower-${i}`}
            position={[
              xPos,
              yPos,
              zPos,
            ]}
          >
            {/* Centro de la flor (amarillo) */}
            <Sphere 
              args={[flowerSize * 0.5, 8, 8]} 
              position={[0, 0, 0]}
              castShadow
            >
              <meshStandardMaterial color="#ffd700" />
            </Sphere>
            
            {/* Pétalos (rosados) */}
            {Array.from({ length: Math.floor(grow.grow/10)*2 || 4 }).map((_, p) => (
              <Sphere
                key={p}
                args={[flowerSize * 0.6, 8, 8]}
                position={[
                  Math.cos(p * 1.26) * flowerSize * 1.2,
                  Math.sin(p * 1.26) * flowerSize * 1.2,
                  0,
                ]}
                castShadow
              >
                <meshStandardMaterial color="#ff69b4" />
              </Sphere>
            ))}
          </group>
        );
      })}


      {/* 🍒 Frutos - MODIFICADO para distribución aleatoria */}
      {showFruits &&
        Array.from({ length: Math.floor(grow.grow / 3) }).map((_, i) => { // Aumentada la cantidad de frutos
          const [xPos, yPos, zPos] = getRandomPositionInCanopy();
          
          return (
            <Sphere
              key={i}
              args={[fruitSize, 16, 16]}
              position={[
                xPos,
                yPos,
                zPos,
              ]}
              castShadow
            >
              <meshStandardMaterial color="#d40000" />
            </Sphere>
          );
        })}
    </group>
  );
}

// ------------------------------------------------------------------


/* ================= ENVIRONMENT ================= */

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

// ------------------------------------------------------------------


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

      <Tree grow={treeGrow} />
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