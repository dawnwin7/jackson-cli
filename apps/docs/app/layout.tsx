import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Jackson CLI",
  description: "Let agents message Jackson at any time."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
