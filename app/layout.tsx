import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mój chatbot",
  description: "Prosty chatbot",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}
