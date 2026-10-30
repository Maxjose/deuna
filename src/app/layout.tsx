import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "De1na · Movilidad sin complicaciones",
  description: "Tu viaje en moto en Mara, Zulia.",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "De1na" },
  icons: { apple: "/app-icon/180" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#122033",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
