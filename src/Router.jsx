import React, { useState, useEffect } from "react";
import Home from "./Home";
import Admin from "./Admin";

// Componente que simula un router básico leyendo el pathname
export default function Router() {
  const [route, setRoute] = useState(window.location.pathname);

  useEffect(() => {
    // Escuchamos cambios de historial (cuando el usuario navega con atrás/adelante)
    const handlePopState = () => {
      setRoute(window.location.pathname);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  // Función de "navegación" manual
  const navigate = (path) => {
    // Cambiamos la URL sin recargar la página
    window.history.pushState({}, "", path);
    // Actualizamos nuestro estado interno para forzar el render con la nueva ruta
    setRoute(path);
  };

  // Lógica de enrutamiento simple:
  // - Si el pathname es "/admin", renderizamos <Admin />
  // - Sino, renderizamos <Home />
  if (route === "/admin") {
    return <Admin navigate={navigate} />;
  } else {
    return <Home navigate={navigate} />;
  }
}
