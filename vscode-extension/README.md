# 🌍 Planetary Computer MCP — VS Code Extension

> **Access petabytes of Earth observation data through GitHub Copilot in VS Code.**

A Visual Studio Code extension that configures the Planetary Computer MCP server for GitHub Copilot, enabling AI assistants to query satellite imagery and geospatial data directly within VS Code.

This extension registers an [MCP server](https://spec.modelcontextprotocol.io/) for the [Microsoft Planetary Computer](https://planetarycomputer.microsoft.com/) STAC catalog, allowing GitHub Copilot to search and download satellite imagery, DEMs, land cover data, and vector datasets.

**Note**: This extension configures the Python-based Planetary Computer MCP server. See the [main repository](https://github.com/isaaccorley/planetary-computer-mcp) for the server implementation.

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
- **Natural Language Geocoding**: Automatically converts place names (e.g., "San Francisco", "the Alps") to geospatial coordinates—no need to manually specify bounding boxes
- **GitHub Copilot Integration**: Works seamlessly with VS Code's Copilot Chat
- **Real-time Processing**: Auto URL signing and streaming downloads

## Tools

Once configured, open Copilot Chat and use these tools:

- **`download_data`**: Unified tool for raster, DEM, land cover, and climate data

    - Natural language queries (e.g., "sentinel-2 imagery", "elevation data")
    - Place names automatically geocoded to coordinates (e.g., "Seattle", "Rocky Mountains") or explicit bounding boxes
    - Time range filtering
    - Automatic RGB visualization generation

- **`download_geometries`**: Download vector data with spatial filtering

    - Building footprints, administrative boundaries
    - GeoParquet format output
    - Map visualizations

### Example Usage

Ask your LLM Agent the following in Copilot Chat, Cursor, Claude Code, etc.

```bash
Download Sentinel-2 imagery over Seattle from June 2024

Get building footprints for San Francisco

Download elevation data for the Rocky Mountains

Find NAIP imagery of Miami Airport

Get land cover data for Iowa
```

The `download_data` tool automatically detects the dataset type from your natural language query and handles the appropriate processing pipeline.

## Supported Datasets

See the [main repository](https://github.com/isaaccorley/planetary-computer-mcp) for the complete list of supported datasets and collections.

### Performance Notes

- Large downloads may take time due to data size
- Use smaller bounding boxes for faster results
- The server uses efficient streaming downloads to minimize memory usage

## Implementation

This extension configures the Python-based Planetary Computer MCP server. For detailed information about the server implementation, supported datasets, and development:

- [Main Repository](https://github.com/isaaccorley/planetary-computer-mcp)
- [Collections Documentation](https://github.com/isaaccorley/planetary-computer-mcp/blob/main/collections.md)
- [Python API Usage](https://github.com/isaaccorley/planetary-computer-mcp#usage)

## License

Apache 2.0
