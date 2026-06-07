import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Nano — Talent Platform by Sajal Tech",
    template: "%s | Nano",
  },
  description:
    "Staff augmentation talent platform — find, match, and place top engineering talent for your live requirements.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  ),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300..700&family=Space+Grotesk:wght@300..700&family=Syne:wght@400..800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-bg text-text-light antialiased">
        {children}
      </body>
    </html>
  );
}
