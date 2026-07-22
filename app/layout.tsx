import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
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
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider appearance={{ variables: { colorPrimary: "#fbbf24" } }}>
      <html lang="en" className={`${geistSans.variable} h-full`}>
        <body className="antialiased">
          {children}
          <Toaster position="bottom-center" theme="dark" />
        </body>
      </html>
    </ClerkProvider>
  );
}
