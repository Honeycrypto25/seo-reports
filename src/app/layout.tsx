import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SEO Report Hub",
  description: "Advanced SEO Analytics & Reporting Platform",
};

import { Providers } from "@/components/auth/Providers";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} bg-background text-foreground antialiased min-h-screen selection:bg-primary selection:text-white`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
