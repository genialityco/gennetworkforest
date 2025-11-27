import React, { useEffect, useState } from "react";
import {
  Container,
  Card,
  Title,
  Text,
  TextInput,
  Button,
  Stack,
  Group,
  Loader,
} from "@mantine/core";
import {
  doc,
  getDoc,
  setDoc,
  addDoc,
  collection,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, ensureAnonymousUser, auth } from "./firebaseConfig";
import { signOut } from "firebase/auth";

const usersCollection = collection(db, "users");
const treesCollection = collection(db, "trees");

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

export default function Home({ navigate }) {
  const [loading, setLoading] = useState(true);
  const [userDoc, setUserDoc] = useState(null); // { name, dream, treeId }
  const [name, setName] = useState("");
  const [dream, setDream] = useState("");
  const [creating, setCreating] = useState(false);
  const [watering, setWatering] = useState(false);
  const [fertilizing, setFertilizing] = useState(false);

  // Nueva: controla 2da y 3ra pantalla cuando ya hay usuario
  // "intro" = pantalla de presentación, "care" = pantalla de cuidar
  const [careScreen, setCareScreen] = useState("intro");

  // 1) Arranque: sesión anónima + cargar usuario
  useEffect(() => {
    const init = async () => {
      try {
        const user = await ensureAnonymousUser();
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          const data = snap.data();
          setUserDoc({ id: userRef.id, ...data });
          setName(data.name ?? "");
          setDream(data.dream ?? "");
        }
      } catch (e) {
        console.error("Error inicializando sesión:", e);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // 2) Crear usuario + árbol
  async function handleCreateUserAndTree() {
    if (!name.trim() || !dream.trim()) {
      alert("Por favor escribe tu nombre y tu sueño.");
      return;
    }
    const user = auth.currentUser;
    if (!user) return;

    setCreating(true);
    try {
      const { x, z } = getRandomTreePosition();

      const treeDoc = await addDoc(treesCollection, {
        userId: user.uid,
        userName: name.trim(),
        dream: dream.trim(),
        growth: 0,
        state: "SEED",
        x,
        z,
        createdAt: serverTimestamp(),
      });

      const userRef = doc(db, "users", user.uid);
      const userData = {
        name: name.trim(),
        dream: dream.trim(),
        treeId: treeDoc.id,
        createdAt: serverTimestamp(),
      };
      await setDoc(userRef, userData, { merge: true });

      setUserDoc({ id: userRef.id, ...userData });
      setCareScreen("intro"); // al crear por primera vez, empieza en la pantalla de presentación
    } catch (err) {
      console.error("Error creando usuario/árbol:", err);
      alert("Ocurrió un error, inténtalo de nuevo.");
    } finally {
      setCreating(false);
    }
  }

  // Helper para actualizar growth
  async function updateGrowth(delta) {
    if (!userDoc?.treeId) return;
    const treeRef = doc(db, "trees", userDoc.treeId);
    const snap = await getDoc(treeRef);
    if (!snap.exists()) return;

    const data = snap.data();
    let growth = (data.growth || 0) + delta;
    if (growth > 100) growth = 100;
    if (growth < 0) growth = 0;

    let state = "SEED";
    if (growth >= 30 && growth < 70) state = "SPROUT";
    else if (growth >= 70) state = "BLOOM";

    await updateDoc(treeRef, {
      growth,
      state,
    });
  }

  async function handleWater() {
    try {
      setWatering(true);
      await updateGrowth(10);
    } catch (err) {
      console.error("Error regando planta:", err);
    } finally {
      setWatering(false);
    }
  }

  async function handleFertilize() {
    try {
      setFertilizing(true);
      await updateGrowth(20);
    } catch (err) {
      console.error("Error abonando planta:", err);
    } finally {
      setFertilizing(false);
    }
  }

  async function handleViewTree() {
    if (!userDoc?.treeId) return;

    try {
      const treeRef = doc(db, "trees", userDoc.treeId);
      await updateDoc(treeRef, {
        lastViewRequestAt: serverTimestamp(),
      });
      alert("Tu árbol se está mostrando en el bosque 🌳✨");
    } catch (err) {
      console.error("Error enviando solicitud de vista:", err);
      alert("No pudimos mostrar tu árbol, inténtalo de nuevo.");
    }
  }

  // Función para cerrar sesión
  const handleLogout = async () => {
    try {
      await signOut(auth); // Cierra sesión en Firebase
      setUserDoc(null); // Limpia el estado del usuario local
      setName(""); // Limpia el formulario
      setDream("");
      setCareScreen("intro"); // Resetea la pantalla
      // Opcional: recargar la página para asegurar una sesión anónima nueva y limpia
      // window.location.reload();
    } catch (error) {
      console.error("Error al salir:", error);
    }
  };

  // Componente visual del botón para no repetir código
  const LogoutButton = () => (
    <Button
      variant="subtle"
      color="red"
      compact
      onClick={handleLogout}
      style={{
        position: "absolute",
        top: "20px",
        right: "20px",
        zIndex: 1000,
        backgroundColor: "rgba(255, 255, 255, 0.8)", // Fondo semitransparente para que se vea
        backdropFilter: "blur(4px)",
      }}
    >
      ✖ Salir
    </Button>
  );

  // --- Cargando ---
  if (loading) {
    return (
      <Container
        size="lg"
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Group>
          <Loader />
          <Text>Cargando tu jardín…</Text>
        </Group>
      </Container>
    );
  }

  // --- PANTALLA 1: FORMULARIO INICIAL (sin userDoc) ---
  if (!userDoc) {
    return (
      <div
        style={{
          minHeight: "100vh",
          width: "100%",
          backgroundImage:
            'url("/imagenes/FORMULARIO/APP_CONGRESO-DE-EDUACION_FONDO.jpg")',
          backgroundSize: "cover",
          backgroundPosition: "center",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "2rem 1.5rem",
        }}
      >
        {/* Logo formulario */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <img
            src="/imagenes/FORMULARIO/LOGO.png"
            alt="Logo congreso"
            height={150}
            style={{ marginTop: "10%", objectFit: "contain" }}
          />
        </div>

        <Container size="sm" style={{ marginBottom: "2rem" }}>
          <Card
            shadow="xl"
            radius="lg"
            p="lg"
            style={{ backgroundColor: "rgba(255,255,255,0.92)" }}
          >
            <Title order={2} mb="sm" ta="center">
              Planta tu sueño 🌱
            </Title>
            <Text size="sm" c="dimmed" mb="md" ta="center">
              Escribe tu nombre y el sueño que quieres plantar en este bosque.
            </Text>

            <Stack>
              <TextInput
                label="Tu nombre"
                placeholder="Ej: Naty"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
              />
              <TextInput
                label="Tu sueño"
                placeholder="Ej: Tener mi propio estudio creativo"
                value={dream}
                onChange={(e) => setDream(e.currentTarget.value)}
              />

              <Button
                mt="md"
                fullWidth
                size="lg"
                radius="xl"
                style={{
                  fontWeight: 700,
                  fontSize: "1.1rem",
                }}
                onClick={handleCreateUserAndTree}
                loading={creating}
              >
                INSCRÍBETE
              </Button>
            </Stack>
          </Card>
        </Container>
      </div>
    );
  }

  // --- PANTALLA 2: PRESENTACIÓN (HOME) ---
  if (careScreen === "intro") {
    return (
      <div
        style={{
          minHeight: "100vh",
          width: "100%",
          backgroundImage:
            'url("/imagenes/HOME/APP_CONGRESO-DE-EDUACION_HOME.jpg")',
          backgroundSize: "cover",
          backgroundPosition: "center",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "1.5rem",
          position: "relative",
        }}
      >
        <LogoutButton />
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <img
            src="/imagenes/HOME/LOGO_CONGRESO-HOME.png"
            alt="Logo Congreso Home"
            style={{ maxWidth: "80%", height: "auto", objectFit: "contain" }}
          />
        </div>

        {/* Contenido central */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
          }}
        >
          <img
            src="/imagenes/HOME/ICONO_HOME.png"
            alt="Icono planta"
            style={{
              width: 120,
              height: 120,
              objectFit: "contain",
            }}
          />

          <Card
            radius="lg"
            p="md"
            style={{
              backgroundColor: "rgba(255,255,255,0.92)",
              maxWidth: 320,
              textAlign: "center",
            }}
          >
            <Title order={4} mb="xs">
              ¡Hola, {userDoc.name}!
            </Title>
            <Text size="sm" c="dimmed">
              Ya plantaste tu sueño. Ahora vamos a cuidarlo para que crezca.
            </Text>
            <Text mt="xs" size="sm" fw={500}>
              “{userDoc.dream}”
            </Text>
          </Card>

          <Button
            radius="xl"
            size="lg"
            style={{
              marginTop: "1rem",
              backgroundColor: "#FACC15", // amarillo
              color: "#000",
              fontWeight: 700,
              fontSize: "1rem",
            }}
            onClick={() => setCareScreen("care")}
          >
            Ir a cuidar mi planta
          </Button>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <img
            src="/imagenes/HOME/TEXTO_FOOTER_HOME.png"
            alt="Texto footer"
            style={{ maxWidth: "90%", height: "auto", objectFit: "contain" }}
          />
        </div>
      </div>
    );
  }

  // --- PANTALLA 3: CUIDAR LA PLANTA (REGAR / ABONAR / VER MI ÁRBOL) ---
  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        backgroundImage:
          'url("/imagenes/CUIDAR/APP_CONGRESO-DE-EDUACION_FONDO.jpg")',
        backgroundSize: "cover",
        backgroundPosition: "center",
        position: "relative",
      }}
    >
      <div
        style={{
          height: "100%",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "1.5rem",
        }}
      >
        <LogoutButton />
        {/* Logo superior */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <img
            src="/imagenes/CUIDAR/LOGO.png"
            alt="Logo cuidar"
            height={80}
            style={{ objectFit: "contain" }}
          />
        </div>

        {/* Texto + sueño */}
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: "1rem",
            }}
          >
            <img
              src="/imagenes/CUIDAR/TEXTO.png"
              alt="Tu idea ya nació, aquí la haremos crecer juntos"
              style={{ maxWidth: "90%", height: "auto" }}
            />
          </div>

          <Card
            radius="lg"
            p="md"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.9)",
            }}
          >
            <Text size="sm" c="dimmed">
              Has plantado este sueño:
            </Text>
            <Text mt="xs" fw={600}>
              “{userDoc.dream}”
            </Text>
          </Card>
        </div>

        {/* Acciones */}
        <div style={{ marginTop: "1.5rem", marginBottom: "0.5rem" }}>
          <Group justify="space-around" style={{ marginBottom: "1.5rem" }}>
            {/* Regar */}
            <button
              onClick={handleWater}
              disabled={watering}
              aria-label="Regar planta"
              style={{
                border: "none",
                background: "none",
                padding: 0,
              }}
            >
              <img
                src="/imagenes/CUIDAR/ICONO-01.png"
                alt="Regar planta"
                style={{
                  width: 90,
                  height: 90,
                  objectFit: "contain",
                  opacity: watering ? 0.6 : 1,
                }}
              />
            </button>

            {/* Abonar */}
            <button
              onClick={handleFertilize}
              disabled={fertilizing}
              aria-label="Abonar planta"
              style={{
                border: "none",
                background: "none",
                padding: 0,
              }}
            >
              <img
                src="/imagenes/CUIDAR/ICONO-02.png"
                alt="Abonar planta"
                style={{
                  width: 90,
                  height: 90,
                  objectFit: "contain",
                  opacity: fertilizing ? 0.6 : 1,
                }}
              />
            </button>
          </Group>

          <Button
            fullWidth
            radius="xl"
            variant="white"
            style={{
              fontWeight: 600,
              backgroundColor: "rgba(255,255,255,0.9)",
            }}
            onClick={handleViewTree}
          >
            Ver mi árbol 🌳
          </Button>
        </div>
      </div>
    </div>
  );
}
