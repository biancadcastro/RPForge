import type { Metadata } from "next";
import "./globals.css";
import "./workspace.css";
import "./atelier.css";
import "./alignment.css";
export const metadata: Metadata = {
  title: "RPForge",
  description: "Suas criações, prontas para o servidor.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
