import type { MetadataRoute } from "next";
import { BASE } from "@/lib/base-path";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "खल्लास — Split bills",
    short_name: "खल्लास",
    description: "Scan a receipt, tap what you ate, settle up instantly.",
    id: `${BASE}/`,
    scope: `${BASE}/`,
    start_url: `${BASE}/`,
    display: "standalone",
    background_color: "#0F0F0F",
    theme_color: "#0F0F0F",
    orientation: "portrait",
    icons: [
      { src: `${BASE}/icons/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${BASE}/icons/icon-maskable-192.png`, sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: `${BASE}/icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${BASE}/icons/icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: `${BASE}/icons/icon-512.svg`, sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    categories: ["finance", "utilities"],
  };
}
