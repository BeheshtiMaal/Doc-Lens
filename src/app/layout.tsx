import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { WorkspaceSessionProvider } from "@/components/workspace-session";
import { TooltipProvider } from "@/components/ui/tooltip";

const instrument = localFont({ src: "../../public/fonts/instrument-sans.ttf", variable: "--font-instrument", weight: "400 700", display: "swap" });
const persian = localFont({ src: "../../public/fonts/vazirmatn.ttf", variable: "--font-persian", weight: "100 900", display: "swap" });
const wordmark = localFont({ src: "../../public/fonts/instrument-serif.ttf", variable: "--font-wordmark", weight: "400", display: "swap" });

export const metadata: Metadata = { title: "DocLens", description: "Your documents. Grounded answers." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" dir="ltr" className={"dark " + instrument.variable + " " + persian.variable + " " + wordmark.variable} suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" forcedTheme="dark" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          <WorkspaceSessionProvider><TooltipProvider>{children}</TooltipProvider></WorkspaceSessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
