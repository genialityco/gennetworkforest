// DreamImage.jsx
import React, { useEffect, useState } from "react";
import {
  Container,
  Card,
  Title,
  Text,
  Button,
  Loader,
  Group,
} from "@mantine/core";
import { auth, db } from "./firebaseConfig";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";

const CF_URL =
  "https://us-central1-lenovo-experiences.cloudfunctions.net/generateImageFromText";

async function generateImageFromText(text, opts) {
  if (!text?.trim()) throw new Error("Falta el texto");

  const r = await fetch(CF_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: text.trim(),
      size: opts?.size ?? "1024x1024",
    }),
    signal: opts?.signal,
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || `Error ${r.status}`);
  if (!data?.url) throw new Error("La respuesta no contiene URL");

  return String(data.url);
}

function buildPromptFromDream(dream) {
  const bannerText = `Estás un paso más cerca de lograr: ${dream}, vas por buen camino.`;

  return `Create an inspiring and emotionally uplifting image centered on goal achievement.
In the background, generate a symbolic scene connected to the dream provided. This background should visually represent progress toward an achievable, real-life goal.
A path must extend from the foreground toward the horizon, symbolizing dedication, discipline, growth, and the journey toward success.
At the end of the path, place a goal banner (meta / finish line style).
On that banner, write the following text exactly as provided, without altering, rephrasing, correcting, or changing a single character:

‘${bannerText}’

The text must be perfectly clear, crisp, readable, and identical to the original input dream.
Art direction: warm and hopeful lighting, realistic but slightly idealized style, aspirational and emotional atmosphere, vivid colors, subtle depth of field.`;
}

export default function DreamImage({ navigate }) {
  const [loading, setLoading] = useState(true);
  const [userDoc, setUserDoc] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Cargar usuario
  useEffect(() => {
    const loadUser = async () => {
      try {
        const user = auth.currentUser;
        if (!user) {
          navigate("/");
          return;
        }

        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          setUserDoc({ id: userRef.id, ...snap.data() });
        } else {
          navigate("/");
        }
      } catch (err) {
        console.error("Error cargando usuario:", err);
      } finally {
        setLoading(false);
      }
    };
    loadUser();
  }, [navigate]);

  // Generar / regenerar imagen
  async function handleGenerateImage(force = false) {
    if (!userDoc?.dream) return;
    setErrorMsg("");
    setGenerating(true);

    try {
      const prompt = buildPromptFromDream(userDoc.dream);

      const url = await generateImageFromText(prompt, { size: "1024x1024" });

      const userRef = doc(db, "users", userDoc.id);
      await updateDoc(userRef, {
        dreamImageUrl: url,
        dreamImageGeneratedAt: serverTimestamp(),
        dreamImageRegenerated: force || false,
      });

      setUserDoc((prev) => (prev ? { ...prev, dreamImageUrl: url } : prev));
    } catch (err) {
      console.error("Error generando imagen:", err);
      setErrorMsg(
        err?.message || "Hubo un problema generando la imagen, inténtalo de nuevo."
      );
    } finally {
      setGenerating(false);
    }
  }

  // Autogenerar al entrar si no tiene imagen
  useEffect(() => {
    if (!loading && userDoc && !userDoc.dreamImageUrl && !generating) {
      void handleGenerateImage();
    }
  }, [loading, userDoc]);

  // Descargar imagen
  const handleDownload = () => {
    if (!userDoc?.dreamImageUrl) return;
    try {
      const link = document.createElement("a");
      link.href = userDoc.dreamImageUrl;
      link.download = "mi-sueno.png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Error descargando imagen:", err);
      setErrorMsg("No se pudo iniciar la descarga de la imagen.");
    }
  };

  if (loading) {
    return (
      <Container
        size="sm"
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Group>
          <Loader />
          <Text>Cargando tu imagen de sueño…</Text>
        </Group>
      </Container>
    );
  }

  if (!userDoc) return null;

  const dreamImageUrl = userDoc.dreamImageUrl;

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        background: "linear-gradient(180deg, #0f172a 0%, #020617 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
      }}
    >
      <Container size="sm">
        <Card
          shadow="xl"
          radius="lg"
          p="lg"
          style={{
            backgroundColor: "rgba(15,23,42,0.9)",
            color: "white",
          }}
        >
          <Title order={3} mb="sm" ta="center">
            La imagen de tu sueño
          </Title>

          <Text size="sm" c="gray.3" ta="center" mb="md">
            “{userDoc.dream}”
          </Text>

          {generating ? (
            <Card
              radius="md"
              p="md"
              style={{
                backgroundColor: "rgba(15,23,42,0.8)",
                border: "1px dashed rgba(148,163,184,0.6)",
                marginBottom: "1rem",
              }}
            >
              <Group position="center" mb="xs">
                <Loader size="sm" />
              </Group>
              <Text size="sm" ta="center">
                Generando una imagen especial de tu sueño…
              </Text>
              <Text size="xs" c="gray.4" ta="center" mt={4}>
                Esto puede tardar unos segundos.
              </Text>
            </Card>
          ) : dreamImageUrl ? (
            <>
              <div
                style={{
                  borderRadius: "16px",
                  overflow: "hidden",
                  border: "1px solid rgba(148, 163, 184, 0.5)",
                  marginBottom: "1rem",
                }}
              >
                <img
                  src={dreamImageUrl}
                  alt="Imagen generada de tu sueño"
                  style={{
                    width: "100%",
                    display: "block",
                    objectFit: "cover",
                    maxHeight: "420px",
                  }}
                />
              </div>

              {errorMsg && (
                <Text
                  size="xs"
                  c="red.4"
                  ta="center"
                  style={{ marginBottom: "0.5rem" }}
                >
                  {errorMsg}
                </Text>
              )}

              <Group grow mb="0.5rem">
                <Button
                  radius="xl"
                  size="xs"
                  style={{
                    fontWeight: 600,
                    backgroundColor: "#FACC15",
                    color: "#000",
                  }}
                  onClick={handleDownload}
                >
                  Descargar
                </Button>

                <Button
                  radius="xl"
                  size="xs"
                  variant="outline"
                  style={{
                    fontWeight: 600,
                    borderColor: "#FACC15",
                    color: "#FACC15",
                  }}
                  onClick={() => handleGenerateImage(true)}
                >
                  Re-generar
                </Button>
              </Group>
            </>
          ) : (
            <Card
              radius="md"
              p="md"
              style={{
                backgroundColor: "rgba(15,23,42,0.8)",
                border: "1px dashed rgba(148,163,184,0.6)",
                marginBottom: "1rem",
              }}
            >
              <Text size="sm" ta="center">
                Aún no se ha generado tu imagen. 🖼️✨
              </Text>
              {errorMsg && (
                <Text
                  size="xs"
                  c="red.4"
                  ta="center"
                  style={{ marginTop: "0.5rem" }}
                >
                  {errorMsg}
                </Text>
              )}
              <Button
                fullWidth
                radius="xl"
                size="sm"
                mt="sm"
                style={{
                  fontWeight: 600,
                  backgroundColor: "#FACC15",
                  color: "#000",
                }}
                onClick={() => handleGenerateImage()}
              >
                Generar imagen ✨
              </Button>
            </Card>
          )}

          <Button
            fullWidth
            radius="xl"
            mt="sm"
            variant="white"
            style={{ fontWeight: 600 }}
            onClick={() => navigate("/")}
          >
            Ir al incio 🌱
          </Button>
        </Card>
      </Container>
    </div>
  );
}
