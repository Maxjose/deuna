import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "De1na · Movilidad sin complicaciones",
  description: "Tu viaje en moto en Mara, Zulia.",
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
