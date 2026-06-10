import type { MetadataRoute } from "next";
import { CLINIC } from "@/lib/clinic";

// Web App Manifest — makes the site installable to a phone home screen as a
// standalone "app" (own icon, full-screen, no browser chrome). Next.js serves
// this at /manifest.webmanifest and auto-injects <link rel="manifest"> for us.
// Icons live in /public; theme/background colours mirror the brand teal + cream.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: CLINIC.name,
    short_name: "Manly Thai",
    description: CLINIC.tagline,
    start_url: "/",
    id: "/",
    display: "standalone",
    background_color: "#F3EFE7", // cream — splash screen
    theme_color: "#14A39F", // brand teal — status bar
    lang: "en-AU",
    dir: "ltr",
    categories: ["health", "medical", "lifestyle"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
