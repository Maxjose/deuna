import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { PwaRegistration } from "@/components/pwa-registration";
import { LaunchScreen } from "@/components/launch-screen";
import { HapticFeedback } from "@/components/haptic-feedback";
const manrope = localFont({ src: "./fonts/manrope-latin.woff2", weight: "200 800", display: "swap", variable: "--font-brand" });
export const metadata: Metadata = {
  title: "De1na · Movilidad sin complicaciones",
  description: "Tu viaje en moto en Mara, Zulia.",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "De1na" },
  icons: {
    apple: "/icons/apple-touch-icon.png",
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/icons/icon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
    ],
  },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#122033",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={manrope.variable}>
      <body>
        <PwaRegistration />
        <HapticFeedback />
        <LaunchScreen>{children}</LaunchScreen>
      </body>
    </html>
  );
}
