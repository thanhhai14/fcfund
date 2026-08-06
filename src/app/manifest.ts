import type { MetadataRoute } from "next";
import { APP_NAME } from "@/lib/constants";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP_NAME} — Quản lý quỹ đội bóng`,
    short_name: APP_NAME,
    description: "Quản lý thu, chi và công nợ minh bạch cho câu lạc bộ bóng đá",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f7f4f5",
    theme_color: "#06385f",
    lang: "vi",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
