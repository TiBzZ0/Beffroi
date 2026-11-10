import type { MetadataRoute } from "next";

// Permet d'installer le jeu sur l'écran d'accueil (nécessaire aux notifications sur iPhone).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Beffroi",
    short_name: "Beffroi",
    start_url: "/",
    display: "standalone",
    background_color: "#f4ead5",
    theme_color: "#3b2f22",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
