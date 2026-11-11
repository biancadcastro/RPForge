import type { Metadata } from "next";
import "./tokens.css";
import "./globals.css";
import "./workspace.css";
import "./atelier.css";
import "./controls.css";
export const metadata: Metadata = {
  title: "RPForge",
  description: "Você cria. O RPForge organiza.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
