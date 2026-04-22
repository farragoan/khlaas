import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "खल्लास — Split bills, not friendships",
  description: "Scan a receipt, tap what you ate, settle up instantly.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "खल्लास",
  },
  icons: {
    apple: "/icons/icon-192.svg",
    icon: "/icons/icon-512.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#0F0F0F",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full`}>
      <body className="min-h-full flex flex-col antialiased">
        {children}
        <Toaster position="bottom-center" theme="dark" />
        <footer className="py-3 text-center text-[11px] text-zinc-600">
          <a
            href="https://dhruvnagpal.in"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-zinc-400 transition-colors"
          >
            dhruvnagpal.in
          </a>
          {" "}™ All rights reserved.
        </footer>
      </body>
    </html>
  );
}
