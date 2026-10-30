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
        src: "/app-icon/192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/app-icon/512",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/app-icon/512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
