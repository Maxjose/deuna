import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "De1na · Movilidad",
    short_name: "De1na",
    description: "Moverte sin complicarte. Mara, Zulia.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f5f7f8",
    theme_color: "#122033",
    lang: "es",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
