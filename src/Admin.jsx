import React, { useEffect, useState } from "react";
import {
  doc,
  setDoc,
  onSnapshot,
  updateDoc,
  increment,
  addDoc,
  collection,
  getDocs,
  writeBatch,
  serverTimestamp,
  // 👇 nuevos
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "./firebaseConfig";
import {
  Button,
  Container,
  TextInput,
  Title,
  Text,
  Card, // 👈 nuevo
  Stack, // 👈 nuevo
  Group, // 👈 nuevo
  Badge, // 👈 opcional para marcar DEMO/destacado
} from "@mantine/core";

// Doc donde guardaremos configuración global
const configRef = doc(db, "adminConfig", "sceneConfig");
// Doc del contador de árboles
const treesRef = doc(db, "globalCounters", "treesCounter");

// 👇 colecciones para pruebas / reset
const treesCollection = collection(db, "trees");
const usersCollection = collection(db, "users");

// Zona que queremos reservar SOLO para destacados
const STAGE_ZONE = {
  minX: -25,
  maxX: 25,
  minZ: 8, // delante
  maxZ: 30,
};

function getRandomTreePosition() {
  let x, z;

  do {
    // área general del bosque
    x = (Math.random() - 0.5) * 40; // -20 a 20
    z = (Math.random() - 0.5) * 40; // -20 a 20
    // repetimos mientras caiga DENTRO de la zona de tarima
  } while (
    x > STAGE_ZONE.minX &&
    x < STAGE_ZONE.maxX &&
    z > STAGE_ZONE.minZ &&
    z < STAGE_ZONE.maxZ
  );

  return { x, z };
}

export default function Admin({ navigate }) {
  const [maxTrees, setMaxTrees] = useState(200);
  const [currentTrees, setCurrentTrees] = useState(0);
  const [busy, setBusy] = useState(false); // para deshabilitar botones en acciones pesadas

  // 👉 lista local de árboles
  const [treesList, setTreesList] = useState([]);

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

    // 👇 Suscribirse a la lista de árboles para mostrarlos en el admin
    const qTrees = query(
      treesCollection,
      orderBy("createdAt", "desc"),
      limit(50) // muestra hasta 50 más recientes
    );

    const unsubTreesList = onSnapshot(qTrees, (snapshot) => {
      const items = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() });
      });
      setTreesList(items);
    });

    return () => {
      unsubConfig();
      unsubTrees();
      unsubTreesList();
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

  // Restablecer solo el contador de árboles a 0
  async function handleResetTrees() {
    try {
      await setDoc(treesRef, { trees: 0 });
      alert("Se ha restablecido el conteo de árboles a 0.");
    } catch (error) {
      console.error("Error resetting trees:", error);
    }
  }

  // Añadir 1 al contador (modo antiguo)
  async function handleAddTree() {
    try {
      await updateDoc(treesRef, {
        trees: increment(1),
      });
    } catch (error) {
      console.error("Error adding tree:", error);
    }
  }

  // -----------------------------------------------------------
  // ✅ Crear árbol aleatorio al 100% de crecimiento
  // -----------------------------------------------------------
  async function handleCreateRandomTree() {
    try {
      setBusy(true);

      const randomNames = [
        "Demo Ana",
        "Demo Juan",
        "Demo Naty",
        "Demo Carlos",
        "Demo Laura",
      ];
      const randomDreams = [
        "Tener mi propio estudio creativo",
        "Viajar por el mundo",
        "Escribir un libro",
        "Lanzar mi emprendimiento",
        "Cambiar la vida de muchas personas",
      ];

      const name = randomNames[Math.floor(Math.random() * randomNames.length)];
      const dream =
        randomDreams[Math.floor(Math.random() * randomDreams.length)];

      const { x, z } = getRandomTreePosition();

      const growth = 100;
      const state = "BLOOM";

      await addDoc(treesCollection, {
        userName: name,
        dream,
        growth,
        state,
        x,
        z,
        createdAt: serverTimestamp(),
        // 👇 ya NO seteamos lastViewRequestAt aquí
        isDemo: true,
      });

      try {
        await updateDoc(treesRef, {
          trees: increment(1),
        });
      } catch (e) {
        await setDoc(treesRef, { trees: 1 }, { merge: true });
      }
    } catch (error) {
      console.error("Error creando árbol aleatorio:", error);
      alert("No se pudo crear el árbol de prueba.");
    } finally {
      setBusy(false);
    }
  }

  // -----------------------------------------------------------
  // ⭐ Pasar árbol a destacado (tarima)
  // -----------------------------------------------------------
  async function handleMarkAsHighlighted(treeId) {
    try {
      setBusy(true);
      const treeRef = doc(db, "trees", treeId);
      await updateDoc(treeRef, {
        lastViewRequestAt: serverTimestamp(),
      });
      alert("Árbol enviado a destacados 🌟");
    } catch (error) {
      console.error("Error marcando árbol como destacado:", error);
      alert("No se pudo enviar el árbol a destacados.");
    } finally {
      setBusy(false);
    }
  }

  // -----------------------------------------------------------
  // 🔴 Reiniciar mundo: borrar árboles (y opcionalmente usuarios)
  // -----------------------------------------------------------
  async function handleResetWorld() {
    const sure = window.confirm(
      "Esto eliminará TODOS los árboles y (opcional) usuarios.\n" +
        "¿Seguro que quieres reiniciar el mundo?"
    );
    if (!sure) return;

    try {
      setBusy(true);

      const batch = writeBatch(db);

      // 1) Borrar todos los árboles
      const treesSnap = await getDocs(treesCollection);
      treesSnap.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });

      // 2) (Opcional) borrar usuarios vinculados
      const usersSnap = await getDocs(usersCollection);
      usersSnap.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });

      // 3) Dejar contador en 0
      batch.set(treesRef, { trees: 0 });

      await batch.commit();

      alert("Mundo reiniciado: se borraron árboles y registros.");
    } catch (error) {
      console.error("Error reiniciando mundo:", error);
      alert("No se pudo reiniciar el mundo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Container>
      <Title order={2} mb="md">
        Panel de Administración
      </Title>

      <Text>
        <strong>Árboles actuales (contador global):</strong> {currentTrees}
      </Text>

      <TextInput
        mt="md"
        label="Máximo de árboles en la escena"
        value={maxTrees}
        type="number"
        onChange={(e) => setMaxTrees(Number(e.target.value))}
      />
      <Button mt="sm" onClick={handleSaveMaxTrees} disabled={busy}>
        Guardar Máximo
      </Button>

      <Button color="red" mt="sm" onClick={handleResetTrees} disabled={busy}>
        Restablecer contador a 0
      </Button>

      <Button mt="sm" onClick={handleAddTree} disabled={busy}>
        Añadir 1 árbol al contador
      </Button>

      <Button mt="sm" onClick={handleCreateRandomTree} disabled={busy}>
        Crear árbol demo 100% 🌸
      </Button>

      <Button
        mt="sm"
        color="red"
        variant="outline"
        onClick={handleResetWorld}
        disabled={busy}
      >
        Reiniciar mundo (borrar árboles y registros)
      </Button>

      {/* -------------------------------------------------- */}
      {/* 🔍 Lista de árboles creados + botón "Pasar a destacado" */}
      {/* -------------------------------------------------- */}
      <Title order={3} mt="xl" mb="xs">
        Árboles creados
      </Title>
      <Text size="sm" c="dimmed" mb="sm">
        Usa “Pasar a destacado” para subirlo a la tarima frontal.
      </Text>

      <Stack gap="xs">
        {treesList.length === 0 ? (
          <Text size="sm" c="dimmed">
            Aún no hay árboles en la colección.
          </Text>
        ) : (
          treesList.map((tree) => {
            const isHighlighted = !!tree.lastViewRequestAt;
            return (
              <Card
                key={tree.id}
                withBorder
                shadow="xs"
                radius="md"
                mb="xs"
                style={{ backgroundColor: "rgba(255,255,255,0.9)" }}
              >
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Text fw={600}>{tree.userName || "Sin nombre"}</Text>
                    <Text size="sm" c="dimmed">
                      “{tree.dream || "Sin sueño"}”
                    </Text>
                    <Text size="xs" c="dimmed" mt={4}>
                      Growth: {tree.growth ?? 0}% {tree.isDemo ? "· DEMO" : ""}
                    </Text>
                  </div>

                  <Stack gap={4} align="flex-end">
                    {tree.isDemo && (
                      <Badge size="xs" color="pink">
                        Demo
                      </Badge>
                    )}
                    {isHighlighted && (
                      <Badge size="xs" color="yellow">
                        En destacados
                      </Badge>
                    )}
                    <Button
                      size="xs"
                      compact
                      mt="xs"
                      disabled={busy}
                      onClick={() => handleMarkAsHighlighted(tree.id)}
                    >
                      Pasar a destacado
                    </Button>
                  </Stack>
                </Group>
              </Card>
            );
          })
        )}
      </Stack>

      <Button mt="xl" variant="outline" onClick={() => navigate("/")}>
        Volver al Home
      </Button>
    </Container>
  );
}
