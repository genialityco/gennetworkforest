import React, { useEffect, useState } from "react";
import {
  doc,
  setDoc,
  onSnapshot,
  updateDoc,
  increment,
} from "firebase/firestore";
import { db } from "./firebaseConfig";
import { Button, Container, TextInput, Title, Text } from "@mantine/core";

// Doc donde guardaremos configuración global
const configRef = doc(db, "adminConfig", "sceneConfig");
// Doc del contador de árboles
const treesRef = doc(db, "globalCounters", "treesCounter");

export default function Admin({ navigate }) {
  const [maxTrees, setMaxTrees] = useState(200);
  const [currentTrees, setCurrentTrees] = useState(0);

  // Cargar la config inicial y suscribirse a cambios
  useEffect(() => {
    // Suscribirse a cambios en sceneConfig
    const unsubConfig = onSnapshot(configRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        if (data.maxTrees !== undefined) {
          setMaxTrees(data.maxTrees);
        }
      }
    });

    // Suscribirse al contador de árboles
    const unsubTrees = onSnapshot(treesRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        setCurrentTrees(docSnapshot.data().trees);
      }
    });

    return () => {
      unsubConfig();
      unsubTrees();
    };
  }, []);

  // Guardar maxTrees en Firestore
  async function handleSaveMaxTrees() {
    try {
      await setDoc(configRef, { maxTrees });
      alert("¡Configuración guardada!");
    } catch (error) {
      console.error("Error saving maxTrees:", error);
    }
  }

  // Restablecer el contador de árboles a 0
  async function handleResetTrees() {
    try {
      await setDoc(treesRef, { trees: 0 });
      alert("Se ha restablecido el conteo de árboles a 0.");
    } catch (error) {
      console.error("Error resetting trees:", error);
    }
  }

  // *** Nuevo método para agregar 1 árbol al contador ***
  async function handleAddTree() {
    try {
      await updateDoc(treesRef, {
        trees: increment(1),
      });
    } catch (error) {
      console.error("Error adding tree:", error);
    }
  }

  return (
    <Container>
      <Title order={2} mb="md">
        Panel de Administración
      </Title>

      <Text>
        <strong>Árboles actuales:</strong> {currentTrees}
      </Text>

      <TextInput
        mt="md"
        label="Máximo de árboles en la escena"
        value={maxTrees}
        type="number"
        onChange={(e) => setMaxTrees(Number(e.target.value))}
      />
      <Button mt="sm" onClick={handleSaveMaxTrees}>
        Guardar Máximo
      </Button>

      <Button color="red" mt="sm" onClick={handleResetTrees}>
        Restablecer a 0
      </Button>

      {/* Botón para añadir 1 árbol */}
      <Button mt="sm" onClick={handleAddTree}>
        Añadir 1 árbol
      </Button>

      <Button mt="xl" variant="outline" onClick={() => navigate("/")}>
        Volver al Home
      </Button>
    </Container>
  );
}
