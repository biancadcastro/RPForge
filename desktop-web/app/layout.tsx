import type { Metadata } from "next";
import "./tokens.css";
import "./globals.css";
import "./controls.css";
import "./workspace.css";
import "./atelier.css";
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
