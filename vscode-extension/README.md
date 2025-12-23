# Planetary Computer MCP — VS Code Extension

A Visual Studio Code extension that provides seamless integration with the Planetary Computer MCP server, enabling AI assistants to query satellite imagery and geospatial data directly within VS Code.

This extension implements an [MCP server](https://spec.modelcontextprotocol.io/) for the [Microsoft Planetary Computer](https://planetarycomputer.microsoft.com/) STAC catalog, allowing AI assistants to search and download satellite imagery, DEMs, land cover data, and vector datasets.

## Features

- **Satellite Imagery Access**: Query Sentinel-2, NAIP, Landsat, and HLS collections
- **Geospatial Downloads**: Download RGB images, multispectral bands, and vector data
- **Real-time Processing**: Auto URL signing and streaming downloads
- **VS Code Integration**: Native commands to start/stop the MCP server
- **Output Monitoring**: Server logs visible in VS Code's output panel

## Installation

### Option 1: Install from VSIX (Recommended)

1. Download the latest `.vsix` file from the [GitHub Releases](https://github.com/isaaccorley/planetary-computer-mcp/releases)
2. In VS Code: `Extensions` → `...` → `Install from VSIX...`
3. Select the downloaded `.vsix` file

### Option 2: Build from Source

1. Clone the repository:

```bash
git clone https://github.com/isaaccorley/planetary-computer-mcp.git
cd planetary-computer-mcp
```

1. Build the MCP server:

```bash
bun install
bun run build
```

1. Build and install the extension:

```bash
cd vscode-extension
bun install
bun run package
```

1. Install the generated `.vsix` file in VS Code

## Usage

### Starting the Server

1. Open VS Code with the extension installed
2. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
3. Run `Planetary Computer: Start MCP Server`
4. The server will start and show logs in the `Planetary Computer MCP` output channel

### Using with AI Assistants

Once the server is running, AI assistants can use these tools:

- **`search_stac`**: Query satellite imagery by location, date, and collection
- **`download_visual`**: Download RGB satellite images
- **`download_multispectral`**: Download specific spectral bands
- **`download_geometries`**: Download vector data (buildings, etc.)
- **`list_collections`**: Browse available data collections

### Example Queries

```bash
Find recent Sentinel-2 imagery over Seattle from June 2024

Download building footprints for San Francisco

Create a heatmap of the temperature data in NYC in 2000 and in 2020

Get multispectral bands for vegetation analysis in the Smoky Mountains

Download NAIP imagery of Miami Airport
```

### Stopping the Server

From the Command Palette, run `Planetary Computer: Stop MCP Server`

## Supported Data Collections

- **Optical Imagery**: Sentinel-2 L2A, NAIP, Landsat C2 L2, HLS L30/L8
- **Digital Elevation Models**: Copernicus GLO-30, ALOS DEM
- **Land Cover**: ESA WorldCover, IO LULC, MTBS fire data
- **SAR**: Sentinel-1 RTC
- **Vector Data**: Microsoft Buildings

## Configuration

The extension automatically detects the compiled server in your workspace. For custom setups:

1. Ensure `dist/src/index.js` exists in the workspace root
2. The extension uses Node.js stdio transport for communication
3. Server logs appear in VS Code's `Planetary Computer MCP` output channel

## Development

### Prerequisites

- Node.js 18+
- Bun (recommended for building)

### Building

```bash
# Build the MCP server
bun run build

# Build the extension
cd vscode-extension
bun run compile
```

### Testing

1. Press `F5` in VS Code to launch Extension Development Host
2. Test the `Start MCP Server` command
3. Check the output channel for server logs

### Packaging

```bash
cd vscode-extension
bun run package  # Creates .vsix file
```

## Troubleshooting

### Server Won't Start

- Verify `dist/src/index.js` exists in workspace root
- Check that Node.js 18+ is installed
- Review the `Planetary Computer MCP` output channel for errors

### No Data Returned

- Ensure you have internet connectivity
- Check query parameters (bbox format: `[west,south,east,north]`)
- Verify collection names are correct

### Performance Issues

- Large downloads may take time due to data size
- Use smaller bounding boxes for faster results
- The extension uses streaming downloads to minimize memory usage

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

Apache 2.0 - see LICENSE file for details
