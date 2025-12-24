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

## Tools

Once configured, open Copilot Chat and use these tools:

- **`search_stac`**: Query STAC catalog by collection, bbox, datetime, limit
- **`get_collections`**: List all collections or get detailed info for a specific collection (assets, bands, resolutions)
- **`describe_collection`**: Get structured metadata with RGB/DEM/SAR strategy and recommended tools
- **`download_asset`**: Download GeoTIFF/assets with auto URL signing
- **`download_visual`**: Download RGB images with smart rendering (JPG for optical/DEM, PNG for classified)
- **`download_multispectral`**: Download specific bands into multi-band GeoTIFF
- **`download_geometries`**: Download vector data (e.g., MS Buildings) with spatial filtering
- **`download_zarr`**: Download spatial/temporal slices from Zarr collections (Daymet, ERA5, TerraClimate)
- **`render_zarr_preview`**: Create heatmap PNG previews from downloaded Zarr data

### Example Usage

Ask your LLM Agent the following in Copilot Chat, Cursor, Claude Code, etc.

```bash
Find recent Sentinel-2 imagery over Seattle from June 2024

Download building footprints for San Francisco

Create a heatmap of the temperature data in NYC in 2000 and in 2020

Get multispectral bands for vegetation analysis in the Smoky Mountains

Download NAIP imagery of Miami Airport
```

## Tested Collections

- **Optical Imagery**: Sentinel-2 L2A, NAIP, Landsat C2 L2, HLS L30/L8
- **Digital Elevation Models**: Copernicus GLO-30, ALOS DEM
- **Land Cover**: ESA WorldCover, IO LULC, MTBS fire data
- **SAR**: Sentinel-1 RTC
- **Vector Data**: Microsoft Buildings

### Performance Issues

- Large downloads may take time due to data size
- Use smaller bounding boxes for faster results
- The server uses streaming downloads to minimize memory usage

## License

Apache 2.0
