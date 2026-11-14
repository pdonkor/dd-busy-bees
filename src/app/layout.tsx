import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { RegisterServiceWorker } from "@/components/register-sw";
import "./globals.css";

export const metadata: Metadata = {
  title: "DD Busy Bees",
  description: "School management for DD Busy Bees Montessori",
  appleWebApp: { capable: true, title: "Busy Bees", statusBarStyle: "default" },
  icons: { apple: "/icon-192.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f59e0b",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Render every page per request: each one needs that request's script nonce
  // (src/middleware.ts), which a page built ahead of time can't have.
  await connection();
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
