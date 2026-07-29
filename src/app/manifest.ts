import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FCFUND — Quản lý quỹ đội bóng",
    short_name: "FCFUND",
    description: "Quản lý thu, chi và công nợ minh bạch cho câu lạc bộ bóng đá",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f4f7f5",
    theme_color: "#173c2b",
    lang: "vi",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
