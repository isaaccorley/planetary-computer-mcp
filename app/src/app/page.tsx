import Image from "next/image";
import type { Metadata } from "next";
import { InstallationGrid } from "@/components/installation-grid";
import type { InstallationCard } from "@/components/installation-grid";
import { SpinningGlobe } from "@/components/spinning-globe";
import { Footer } from "@/components/footer";

const heroStats = [
  { label: "STAC Collections", value: "100+", detail: "Optical, SAR, DEM, Land Cover" },
  { label: "Zero install", value: "uvx", detail: "No docker containers" },
  { label: "Outputs", value: "geotiff, zarr, jpg, png", detail: "Allow agents to see EO data" },
];

const mcpConfigSnippet = `{
  "mcpServers": {
    "planetary-computer": {
      "command": "uvx",
      "args": ["planetary-computer-mcp"]
    }
  }
}`;

const installationCards: InstallationCard[] = [
  {
    label: "vscode extension",
    href: "https://marketplace.visualstudio.com/items?itemName=isaaccorley.planetary-computer-mcp",
    description: "Install in VSCode, Cursor, Antigrain, etc.",
    iconSrc: "/icons/vscode-logo.webp",
    iconAlt: "VS Code logo",
  },
  {
    label: "pypi package",
    href: "https://pypi.org/project/planetary-computer-mcp/",
    description: "Run instantly via uvx",
    iconSrc: "/icons/pypi-logo.webp",
    iconAlt: "PyPI logo",
  },
  {
    label: "mcp.json",
    description: "Click to copy and paste to your mcp.json config file",
    iconSrc: "/icons/mcp-logo.webp",
    iconAlt: "MCP logo",
    copyText: mcpConfigSnippet,
  },
];

const builtWithCards = [
  {
    label: "xarray",
    description: "N-Dim geotiff processing",
    href: "https://xarray.pydata.org/en/stable/",
    icon: (
      <Image
        src="/icons/xarray.webp"
        alt="xarray logo"
        width={40}
        height={40}
        className="object-contain"
      />
    ),
  },
  {
    label: "zarr",
    description: "Toolkit for reading/writing Zarr climate datasets",
    href: "https://zarr.readthedocs.io/en/stable/",
    icon: (
      <Image
        src="/icons/zarr.webp"
        alt="zarr logo"
        width={40}
        height={40}
        className="object-contain"
      />
    ),
  },
  {
    label: "geopandas",
    description: "Library for processing geometry collections",
    href: "https://geopandas.org/en/stable/",
    icon: (
      <Image
        src="/icons/geopandas.webp"
        alt="Geopandas logo"
        width={40}
        height={40}
        className="object-contain"
      />
    ),
  },
];

const sampleShots = [
  {
    title: "Sentinel-2 L2A",
    location: "Los Angeles · Optical",
    src: "/samples/sentinel_2_l2a_medium-la.webp",
  },
  {
    title: "Sentinel-1 RTC",
    location: "Coastal Miami · SAR",
    src: "/samples/sentinel_1_rtc_coastal-miami.webp",
  },
  {
    title: "NAIP",
    location: "Los Angeles · 0.6m RGBIR",
    src: "/samples/naip_medium-la.webp",
  },
  {
    title: "ESA WorldCover",
    location: "Rural Iowa · Categorical",
    src: "/samples/esa_worldcover_rural-iowa.png",
  },
  {
    title: "MTBS Fire",
    location: "Northern California · Burn severity",
    src: "/samples/mtbs_fire-ca.png",
  },
  {
    title: "COP DEM",
    location: "Coastal Miami · Elevation",
    src: "/samples/cop_dem_glo_30_coastal-miami.webp",
  },
  {
    title: "Daymet Max Temp",
    location: "Texas · Tmax",
    src: "/samples/daymet_tmax-tx.webp",
  },
  {
    title: "TerraClimate PET",
    location: "California · Reference Evapotranspiration",
    src: "/samples/terraclimate_pet-ca.webp",
  },
];

const heroGallery = sampleShots;

export const metadata: Metadata = {
  title: "Planetary Computer MCP",
  description:
    "Zero-install Model Context Protocol server for hacking on the Planetary Computer from any MCP client.",
  icons: {
    icon: "/icons/logo.webp",
  },
  openGraph: {
    title: "Planetary Computer MCP",
    description:
      "Zero-install Model Context Protocol server for hacking on the Planetary Computer from any MCP client.",
    url: "https://isaaccorley.github.io/planetary-computer-mcp",
    type: "article",
    siteName: "Planetary Computer MCP",
  },
  twitter: {
    card: "summary_large_image",
    title: "Planetary Computer MCP",
    description:
      "Zero-install Model Context Protocol server for hacking on the Planetary Computer from any MCP client.",
    creator: "@isaaccorley_",
  },
  alternates: {
    canonical: "https://isaaccorley.github.io/planetary-computer-mcp",
  },
};

export default function PlanetaryComputerMCPPage() {
  return (
    <div className="relative min-h-screen bg-[#040312] text-slate-100 overflow-hidden">
      <div className="globe-background" aria-hidden>
        <div className="globe-inner">
          <SpinningGlobe />
          <div className="globe-gradient" />
        </div>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 py-16 space-y-24">
        <section className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-8">
            <p className="text-emerald-300 uppercase tracking-[0.35em] text-xs">
              Planetary computer · mcp server
            </p>
            <h1 className="text-4xl md:text-5xl text-white font-serif">
              Enabling Agents with Tools to Observe the Earth
            </h1>
            <p className="text-base text-slate-200/80 max-w-2xl">
              Plug Microsoft Planetary Computer's STAC catalog into VS Code, Cursor, Claude, or any
              MCP-aware agent. Let agents pull EO modalities they need: optical, SAR, DEM, land
              cover, and render it in RGB to observe and reason about satellite scenes.
            </p>

            <div className="bg-black/25 backdrop-blur border border-emerald-400/40 rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap gap-4 text-sm text-emerald-200/90 font-mono">
                <code className="text-lg text-emerald-200">uvx planetary-computer-mcp</code>
                <span className="text-xs uppercase tracking-[0.2em] text-emerald-300/70">
                  zero install · no API keys · no docker containers
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-3 text-sm">
                {heroStats.map((stat) => (
                  <div
                    key={stat.label}
                    className="border border-white/10 rounded-lg p-3 bg-white/5"
                  >
                    <p className="text-xs uppercase tracking-widest text-emerald-200/80">
                      {stat.label}
                    </p>
                    <p className="text-2xl text-white font-serif">{stat.value}</p>
                    <p className="text-xs text-slate-300/70">{stat.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.3em] text-emerald-300 font-semibold">
                installation
              </p>
              <InstallationGrid cards={installationCards} />
            </div>

            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.3em] text-emerald-300 font-semibold">
                built with
              </p>
              <div className="grid gap-3 md:grid-cols-3">
                {builtWithCards.map((item) => (
                  <a
                    key={item.label}
                    className="border border-white/10 rounded-2xl p-4 bg-black/20 backdrop-blur flex flex-col items-center gap-3 text-center"
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                      {item.icon}
                    </div>
                    <div className="space-y-1 text-center">
                      <p className="text-sm text-white font-serif font-semibold">{item.label}</p>
                      <p className="text-xs text-slate-300/80 font-medium">{item.description}</p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div className="relative">
            <div
              className="absolute -inset-4 bg-gradient-to-b from-cyan-500/20 to-emerald-500/10 blur-3xl"
              aria-hidden
            />
            <div className="relative h-full rounded-3xl border border-white/20 bg-black/25 backdrop-blur p-4 flex flex-col gap-4">
              <div className="text-center space-y-1">
                <p className="text-xs uppercase tracking-[0.4em] text-cyan-200 font-semibold">
                  sample scenes
                </p>
                <p className="text-xs text-slate-300/80 font-medium">
                  Render MSI, SAR, DEM, LULC, and more to RGB images for agentic analysis.
                </p>
              </div>
              <div className="grid gap-3 grid-cols-2">
                {heroGallery.map((shot) => (
                  <div
                    key={shot.title}
                    className="relative rounded-2xl overflow-hidden border border-white/10 aspect-square"
                  >
                    <Image
                      src={shot.src}
                      alt={`${shot.title} sample scene`}
                      fill
                      className="object-cover transition duration-500 hover:scale-105"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                      <p className="text-[0.65rem] uppercase tracking-widest text-white font-semibold">
                        {shot.title}
                      </p>
                      <p className="text-sm text-white font-serif font-semibold">{shot.location}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
        <Footer />
      </div>
    </div>
  );
}
