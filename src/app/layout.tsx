import type { Metadata, Viewport } from "next";
import { config } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";

config.autoAddCss = false;

export const metadata: Metadata = {
  title: {
    default: "FCFUND",
    template: "%s · FCFUND",
  },
  description: "Quản lý quỹ minh bạch cho câu lạc bộ bóng đá",
  applicationName: "FCFUND",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FCFUND",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#173c2b",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
