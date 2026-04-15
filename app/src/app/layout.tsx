import type { Metadata } from "next";
import "./globals.css";
import "@/styles/globe.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://isaaccorley.github.io/planetary-computer-mcp"),
  title: "Planetary Computer MCP",
  description:
    "Zero-install Model Context Protocol server for hacking on the Planetary Computer from any MCP client.",
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Planetary Computer MCP",
  },
  twitter: {
    card: "summary_large_image",
    creator: "@isaaccorley_",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        <link rel="dns-prefetch" href="https://cdn.jsdelivr.net" />
        <link rel="preconnect" href="https://raw.githubusercontent.com" />
        <link rel="dns-prefetch" href="https://raw.githubusercontent.com" />
      </head>
      <body className="antialiased">
        <main>{children}</main>
      </body>
    </html>
  );
}
