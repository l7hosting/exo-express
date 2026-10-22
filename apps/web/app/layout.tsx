import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EXO EXPRESS | Delivery Operations",
  description: "Delivery management workspace for EXO EXPRESS"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" dir="ltr">
      <body>{children}</body>
    </html>
  );
}
