import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { AppProviders } from "@/components/providers/AppProviders";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ISG Pulso",
  description: "Chatbot / IA para clientes ISG",
  icons: {
    icon: [
      { url: "/logos/favicon.ico", sizes: "any" },
      { url: "/logos/pulso-icon.svg", type: "image/svg+xml" },
    ],
    apple: "/logos/pulso-180.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={jetbrainsMono.variable}>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
