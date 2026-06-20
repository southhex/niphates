import type { Metadata, Viewport } from "next";
import { Cinzel, IBM_Plex_Mono, Spectral } from "next/font/google";
import "./globals.css";
import { RegisterSW } from "@/components/RegisterSW";

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-cinzel",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-mono",
  display: "swap",
});

const spectral = Spectral({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-spectral",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Niphates",
  description: "Self-hosted chat for Hermes Agent, Ollama, and other LLM APIs.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Niphates",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#100E14",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  // Shrink the layout viewport when the on-screen keyboard opens, so the
  // h-[100dvh] shell contracts and the composer rides up on top of the
  // keyboard instead of being hidden behind it.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      data-theme="obsidian"
      suppressHydrationWarning
      className={`${cinzel.variable} ${ibmPlexMono.variable} ${spectral.variable}`}
    >
      <head>
        {/* Reads saved theme before first paint to prevent flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('niphates-theme')||'obsidian';document.documentElement.setAttribute('data-theme',t);})();`,
          }}
        />
      </head>
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
