import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ticketing System",
    short_name: "Ticketing",
    description: "Capture missing-ticket items, check image quality and extract item metadata.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a1120",
    theme_color: "#1a50a3",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
