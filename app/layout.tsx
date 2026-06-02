import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { CLINIC } from "@/lib/clinic";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: {
    default: `${CLINIC.name} — Remedial Therapy in ${CLINIC.address.suburb}`,
    template: `%s | ${CLINIC.name}`,
  },
  description: CLINIC.tagline,
  icons: {
    icon: "/favicon.png",
    apple: "/apple-touch-icon.png",
  },
  metadataBase: new URL(CLINIC.domain),
  openGraph: {
    type: "website",
    siteName: CLINIC.name,
    locale: "en_AU",
    images: ["/og.png"],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-AU" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased min-h-screen`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
