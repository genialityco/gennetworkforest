import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";

import {
  createUserTree,
  updateUserTreeGrowth,
  animateUserTree,
} from "./UserTreeGrowth";

/* ===================== */
/* Escena interna Three  */
/* ===================== */
function TreeScene({ growth }) {
  const treeRef = useRef(null);
  const { scene } = useThree();
  // Crear árbol UNA sola vez
  useEffect(() => {
    const tree = createUserTree(scene, growth, 5);

    // 🚩 CENTRAR EL ÁRBOL
    tree.position.set(0, -9, 0);

    treeRef.current = tree;

    return () => {
      scene.remove(tree);
    };
  }, [scene]);

  // Actualizar crecimiento cuando cambia % desde Firebase
  useEffect(() => {
    if (!treeRef.current) return;
    updateUserTreeGrowth(treeRef.current, growth);
  }, [growth]);

  // Loop de animación del árbol
  useFrame(() => {
    if (treeRef.current) {
      animateUserTree(treeRef.current);
    }
  });

  return null;
}

/* ===================== */
/* Componente Público    */
/* ===================== */
export function UserTree3D({ grow }) {
    return (
      <Canvas
        camera={{ position: [20, 8, 16], fov: 45 }}
        style={{
          position: "absolute",   // 🔑 CLAVE
          top: grow == 100 ? "30%": "50%" ,
          left: "28%",
          width: "45%",
          height: "40%",
          zIndex: 1               // atrás de la UI
        }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 15, 8]} intensity={1.3} />

        <TreeScene growth={grow} />
        <OrbitControls
          enablePan={false}
          minDistance={10}
          maxDistance={22}
          maxPolarAngle={Math.PI / 2.3}
        />
      </Canvas>
    );
  }