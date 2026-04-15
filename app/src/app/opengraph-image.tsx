import { generateOgImage, ogSize } from "@/lib/og-image";

export const dynamic = "force-static";
export const alt = "Planetary Computer MCP";
export const size = ogSize;
export const contentType = "image/png";

export default function Image() {
  return generateOgImage(
    "Planetary Computer MCP",
    "Zero-install Model Context Protocol server for hacking on the Planetary Computer.",
  );
}
