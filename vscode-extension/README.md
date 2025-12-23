# 🌍 Planetary Computer MCP — VS Code Extension

> **Access petabytes of Earth observation data through GitHub Copilot in VS Code.**

A Visual Studio Code extension that configures the Planetary Computer MCP server for GitHub Copilot, enabling AI assistants to query satellite imagery and geospatial data directly within VS Code.

This extension registers an [MCP server](https://spec.modelcontextprotocol.io/) for the [Microsoft Planetary Computer](https://planetarycomputer.microsoft.com/) STAC catalog, allowing GitHub Copilot to search and download satellite imagery, DEMs, land cover data, and vector datasets.

## Sample Outputs

<table>
<tr>
<td align="center"><img src="https://raw.githubusercontent.com/isaaccorley/planetary-computer-mcp/main/assets/images/sentinel_2_l2a_alps.jpg" width="200"><br><sub><b>Sentinel-2</b><br>Alps</sub></td>
<td align="center"><img src="https://raw.githubusercontent.com/isaaccorley/planetary-computer-mcp/main/assets/images/sentinel_2_l2a_coastal-miami.jpg" width="200"><br><sub><b>Sentinel-2</b><br>Miami</sub></td>
<td align="center"><img src="https://raw.githubusercontent.com/isaaccorley/planetary-computer-mcp/main/assets/images/naip_small-seattle.jpg" width="200"><br><sub><b>NAIP</b><br>Seattle</sub></td>
<td align="center"><img src="https://raw.githubusercontent.com/isaaccorley/planetary-computer-mcp/main/assets/images/naip_medium-la.jpg" width="200"><br><sub><b>NAIP</b><br>Los Angeles</sub></td>
</tr>
<tr>
<td align="center"><img src="https://raw.githubusercontent.com/isaaccorley/planetary-computer-mcp/main/assets/images/hls2_l30_medium-la.jpg" width="200"><br><sub><b>HLS L30</b><br>Los Angeles</sub></td>
<td align="center"><img src="https://raw.githubusercontent.com/isaaccorley/planetary-computer-mcp/main/assets/images/modis_09A1_061_large-bay.jpg" width="200"><br><sub><b>MODIS</b><br>Bay Area</sub></td>
<td align="center"><img src="https://raw.githubusercontent.com/isaaccorley/planetary-computer-mcp/main/assets/images/sentinel_1_rtc_coastal-miami.jpg" width="200"><br><sub><b>Sentinel-1 SAR</b><br>Miami</sub></td>
<td align="center"><img src="https://raw.githubusercontent.com/isaaccorley/planetary-computer-mcp/main/assets/images/cop_dem_glo_30_coastal-miami.jpg" width="200"><br><sub><b>Copernicus DEM</b><br>Miami</sub></td>
</tr>
<tr>
<td align="center"><img src="https://raw.githubusercontent.com/isaaccorley/planetary-computer-mcp/main/assets/images/esa_worldcover_alps.png" width="200"><br><sub><b>ESA WorldCover</b><br>Alps</sub></td>
<td align="center"><img src="https://raw.githubusercontent.com/isaaccorley/planetary-computer-mcp/main/assets/images/io_lulc_annual_v02_rural-iowa.png" width="200"><br><sub><b>IO LULC</b><br>Iowa</sub></td>
<td align="center"><img src="https://raw.githubusercontent.com/isaaccorley/planetary-computer-mcp/main/assets/images/ms-buildings.jpg" width="200"><br><sub><b>MS Buildings</b><br>Vector Data</sub></td>
<td align="center"><img src="https://raw.githubusercontent.com/isaaccorley/planetary-computer-mcp/main/assets/images/pet_preview.png" width="200"><br><sub><b>TerraClimate PET</b><br>Zarr Preview</sub></td>
</tr>
</table>

## Features

- **One-Click Setup**: Automatically configures the MCP server in your VS Code settings
- **Satellite Imagery Access**: Query Sentinel-2, NAIP, Landsat, and HLS collections
- **Geospatial Downloads**: Download RGB images, multispectral bands, and vector data
- **GitHub Copilot Integration**: Works seamlessly with VS Code's Copilot Chat
- **Real-time Processing**: Auto URL signing and streaming downloads

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

2. Build the MCP server:

```bash
bun install
bun run build
```

3. Build and install the extension:

```bash
cd vscode-extension
bun install
bun run package
```

4. Install the generated `.vsix` file in VS Code

## Usage

### Adding the MCP Server

On first install, you'll be prompted to add the MCP server to your settings. You can also:

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Run `Planetary Computer: Add MCP Server`
3. Reload VS Code when prompted

This adds the following to your VS Code settings:

```json
{
  "github.copilot.chat.mcp.servers": {
    "planetary-computer": {
      "command": "npx",
      "args": ["-y", "planetary-computer-mcp"]
    }
  }
}
```

### Available Commands

- **`Planetary Computer: Add MCP Server`** — Add the server to your VS Code MCP settings
- **`Planetary Computer: Remove MCP Server`** — Remove the server from settings
- **`Planetary Computer: Check MCP Status`** — Check if the server is configured

### Using with GitHub Copilot

Once configured, open Copilot Chat and use these tools:

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

### Removing the Server

From the Command Palette, run `Planetary Computer: Remove MCP Server`

## Supported Data Collections

- **Optical Imagery**: Sentinel-2 L2A, NAIP, Landsat C2 L2, HLS L30/L8
- **Digital Elevation Models**: Copernicus GLO-30, ALOS DEM
- **Land Cover**: ESA WorldCover, IO LULC, MTBS fire data
- **SAR**: Sentinel-1 RTC
- **Vector Data**: Microsoft Buildings

## Configuration

The extension manages the MCP server configuration in your VS Code settings automatically. The server is spawned by VS Code's Copilot extension when needed.

### Requirements

- VS Code 1.60+
- GitHub Copilot extension
- Node.js 18+ (for running the MCP server via npx)

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
2. Test the `Add MCP Server` command
3. Verify the settings are updated correctly

### Packaging

```bash
cd vscode-extension
bun run package  # Creates .vsix file
```

## Troubleshooting

### MCP Server Not Working

- Ensure GitHub Copilot extension is installed and active
- Run `Planetary Computer: Check MCP Status` to verify configuration
- Reload VS Code after adding the MCP server
- Check that Node.js 18+ is installed (`node --version`)

### No Data Returned

- Ensure you have internet connectivity
- Check query parameters (bbox format: `[west,south,east,north]`)
- Verify collection names are correct

### Performance Issues

- Large downloads may take time due to data size
- Use smaller bounding boxes for faster results
- The server uses streaming downloads to minimize memory usage

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

Apache 2.0 - see LICENSE file for details
