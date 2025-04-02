import React, { useEffect, useState } from "react";
import {
  Button,
  Container,
  Text,
  Title,
  TextInput,
  Modal,
  Card,
  Group,
  ScrollArea,
} from "@mantine/core";
import {
  doc,
  setDoc,
  updateDoc,
  increment,
  onSnapshot,
  collection,
  addDoc,
  getDoc,
  getDocs,
  query,
} from "firebase/firestore";
import { db } from "./firebaseConfig";

const treesRef = doc(db, "globalCounters", "treesCounter");
const usersCollection = collection(db, "users");

async function initDoc() {
  try {
    const docSnapshot = await getDoc(treesRef);
    if (!docSnapshot.exists()) {
      await setDoc(treesRef, { trees: 0 });
      console.log("Documento inicializado en 0 porque no existía antes.");
    } else {
      console.log("Documento ya existe. No se reinicializa el valor.");
    }
  } catch (error) {
    console.error("Error initializing document:", error);
  }
}

initDoc();

export default function Home({ navigate }) {
  const [trees, setTrees] = useState("Loading...");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [isUserRegistered, setIsUserRegistered] = useState(false);
  const [showModal, setShowModal] = useState(true);
  const [people, setPeople] = useState([]);
  const [personName, setPersonName] = useState("");
  const [personCompany, setPersonCompany] = useState("");

  useEffect(() => {
    const unsubscribe = onSnapshot(treesRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        setTrees(data.trees);
      } else {
        setTrees(0);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isUserRegistered) {
      fetchPeople();
    }
  }, [isUserRegistered]);

  async function incrementTrees() {
    try {
      await updateDoc(treesRef, {
        trees: increment(1),
      });
      console.log("Incremented successfully!");
    } catch (error) {
      console.error("Error incrementing trees:", error);
    }
  }

  async function handleRegisterUser() {
    if (name.trim() === "" || company.trim() === "") {
      alert("Por favor, complete ambos campos.");
      return;
    }

    try {
      await setDoc(doc(usersCollection, name), { name, company });
      setIsUserRegistered(true);
      setShowModal(false);
    } catch (error) {
      console.error("Error registrando usuario:", error);
    }
  }

  async function handleAddPerson() {
    if (personName.trim() === "" || personCompany.trim() === "") {
      alert("Por favor, complete ambos campos.");
      return;
    }

    try {
      // Añadir la persona al Firestore
      await addDoc(collection(db, `users/${name}/people`), {
        name: personName,
        company: personCompany,
      });

      // Incrementar el contador de árboles
      await incrementTrees();

      // Limpiar los campos del formulario
      setPersonName("");
      setPersonCompany("");

      // Recargar la lista de personas
      fetchPeople();
    } catch (error) {
      console.error("Error agregando persona:", error);
    }
  }

  async function fetchPeople() {
    try {
      const q = query(collection(db, `users/${name}/people`));
      const querySnapshot = await getDocs(q);
      const fetchedPeople = querySnapshot.docs.map((doc) => doc.data());
      setPeople(fetchedPeople);
    } catch (error) {
      console.error("Error obteniendo personas:", error);
    }
  }

  return (
    <Container size="sm" style={{ marginTop: "2rem" }}>
      {/* Modal de registro */}
      <Modal
        opened={showModal}
        onClose={() => setShowModal(false)}
        title="Registro de Usuario"
        centered
        size="100%"
        styles={{
          modal: {
            width: "90%",
            maxWidth: "400px",
            borderRadius: "12px",
            padding: "20px",
          },
        }}
      >
        <TextInput
          label="Nombre"
          placeholder="Ingresa tu nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <TextInput
          label="Empresa"
          placeholder="Ingresa tu empresa"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          required
        />
        <Button fullWidth mt="md" onClick={handleRegisterUser}>
          Registrar
        </Button>
      </Modal>

      {/* Si el usuario ya está registrado, mostramos el contenido principal */}
      {isUserRegistered && (
        <>
          <Title order={2}>Bienvenido, {name}</Title>
          <Text>Empresa: {company}</Text>

          <Card mt="lg" p="md">
            <Title order={3}>Agregar Persona</Title>
            <TextInput
              label="Nombre de la persona"
              placeholder="Nombre"
              value={personName}
              onChange={(e) => setPersonName(e.target.value)}
              required
            />
            <TextInput
              label="Empresa de la persona"
              placeholder="Empresa"
              value={personCompany}
              onChange={(e) => setPersonCompany(e.target.value)}
              required
            />
            <Button mt="md" onClick={handleAddPerson}>
              Agregar Persona
            </Button>
          </Card>

          <Title order={3} mt="lg">
            Personas Agregadas
          </Title>
          <ScrollArea style={{ height: 200 }}>
            {people.map((person, index) => (
              <Card key={index} shadow="sm" padding="lg" mb="sm">
                <Group position="apart">
                  <Text>
                    <strong>Nombre:</strong> {person.name}
                  </Text>
                  <Text>
                    <strong>Empresa:</strong> {person.company}
                  </Text>
                </Group>
              </Card>
            ))}
          </ScrollArea>

          <Text size="lg" mt="lg" align="center">
            Total Árboles: {trees}
          </Text>
        </>
      )}
    </Container>
  );
}
