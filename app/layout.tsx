import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@/components/ui/sonner";
import { BASE } from "@/lib/base-path";
import { PwaRegister } from "@/components/pwa-register";
import { InstallPrompt } from "@/components/install-prompt";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "खल्लास — Split bills, not friendships",
  description: "Scan a receipt, tap what you ate, settle up instantly.",
  manifest: `${BASE}/manifest.webmanifest`,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "खल्लास",
  },
  icons: {
    apple: [{ url: `${BASE}/icons/apple-touch-icon.png`, sizes: "180x180", type: "image/png" }],
    icon: [
      { url: `${BASE}/icons/icon-192.png`, sizes: "192x192", type: "image/png" },
      { url: `${BASE}/icons/icon-512.svg`, type: "image/svg+xml" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#1b140f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const themeInit = `try{var t=localStorage.getItem("khlaas-theme");if(t==="sunrise"||t==="playful"||t==="pastel"){document.documentElement.dataset.theme=t;var c={sunrise:"#1b140f",playful:"#0a1618",pastel:"#181322"}[t];var m=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<m.length;i++)m[i].setAttribute("content",c)}}catch(e){}`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider appearance={{ variables: { colorPrimary: "#ff7a50" } }}>
      <html lang="en" data-theme="sunrise" suppressHydrationWarning className={`${geistSans.variable} h-full`}>
        <head>
          <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        </head>
        <body className="antialiased">
          <ThemeProvider>
            {children}
            <PwaRegister />
            <InstallPrompt />
          </ThemeProvider>
          <Toaster position="bottom-center" theme="dark" />
        </body>
      </html>
    </ClerkProvider>
  );
}
