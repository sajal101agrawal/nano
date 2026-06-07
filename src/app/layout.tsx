import type { Metadata } from "next";
import "./globals.css";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const metadata: Metadata = {
  title: {
    default: "Careers — Sajal Tech",
    template: "%s | Sajal Tech",
  },
  description:
    "Join Sajal Tech — the AI-powered software agency. Browse open positions and apply directly, no account needed.",
  metadataBase: new URL(APP_URL),
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.svg",
    apple: "/og-image.png",
    other: [
      { rel: "msapplication-TileImage", url: "/og-image.png" },
    ],
  },
  openGraph: {
    type: "website",
    siteName: "Sajal Tech",
    title: "Careers — Sajal Tech",
    description:
      "Join Sajal Tech — the AI-powered software agency. Browse open positions and apply directly, no account needed.",
    url: APP_URL,
    images: [
      {
        url: "/og-image.png",
        width: 1013,
        height: 341,
        alt: "Sajal Tech — AI-Powered Software Agency",
      },
    ],
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Careers — Sajal Tech",
    description:
      "Join Sajal Tech — the AI-powered software agency. Browse open positions and apply directly, no account needed.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
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
      <body className="min-h-screen bg-bg text-text-light antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
