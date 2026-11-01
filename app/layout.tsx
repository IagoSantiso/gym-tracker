import type { Metadata, Viewport } from "next";
import { RegisterSW } from "@/components/RegisterSW";
import { AppShell } from "@/components/shell/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "NEXO",
  description: "Salud y rendimiento personal: entrenamiento, nutrición, diabetes tipo 1 y recuperación. Local-first y offline.",
  applicationName: "NEXO",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "NEXO", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0c110e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/** Aplica el tema antes de pintar para evitar parpadeo (lee la preferencia cacheada). */
const themeScript = `try{var t=localStorage.getItem('nexo-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light'}catch(e){document.documentElement.dataset.theme='dark'}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
        <RegisterSW />
      </body>
    </html>
  );
}
