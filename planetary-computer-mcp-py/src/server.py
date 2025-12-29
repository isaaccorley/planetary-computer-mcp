"""
MCP server entry point for Planetary Computer tools.
"""

import asyncio
import sys
from pathlib import Path

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from mcp.server import Server
from mcp.types import TextContent

from tools.download_data import download_data
from tools.download_geometries import download_geometries

# Initialize server
server = Server("planetary-computer-mcp")


@server.tool()
async def download_data_tool(
    query: str,
    aoi: str | list[float] | None = None,
    time_range: str | None = None,
    output_dir: str = ".",
    max_cloud_cover: int = 20,
) -> list[TextContent]:
    """
    Download satellite/raster data from Planetary Computer.

    Automatically detects collection from natural language queries,
    handles geocoding for place names, downloads and crops data,
    generates RGB visualizations.

    Args:
        query: Natural language query (e.g., "sentinel-2 imagery")
        aoi: Bounding box [W,S,E,N] or place name string
        time_range: ISO8601 datetime range
        output_dir: Directory to save outputs
        max_cloud_cover: Maximum cloud cover for optical data

    Returns:
        File paths and metadata
    """
    try:
        result = download_data(
            query=query,
            aoi=aoi,
            time_range=time_range,
            output_dir=output_dir,
            max_cloud_cover=max_cloud_cover,
        )

        response = f"""Successfully downloaded data:

Raw data: {result["raw"]}
Visualization: {result["visualization"]}
Collection: {result["collection"]}

Metadata:
{result["metadata"]}
"""

        return [TextContent(type="text", text=response)]

    except Exception as e:
        return [TextContent(type="text", text=f"Error downloading data: {e!s}")]


@server.tool()
async def download_geometries_tool(
    collection: str,
    aoi: list[float] | str,
    output_dir: str = ".",
    limit: int | None = None,
) -> list[TextContent]:
    """
    Download vector geometries from Planetary Computer.

    Args:
        collection: Collection ID (e.g., "ms-buildings")
        aoi: Bounding box [W,S,E,N] or place name string
        output_dir: Directory to save outputs
        limit: Maximum number of features

    Returns:
        File paths and metadata
    """
    try:
        result = download_geometries(
            collection=collection,
            aoi=aoi,
            output_dir=output_dir,
            limit=limit,
        )

        response = f"""Successfully downloaded geometries:

Raw data: {result["raw"]}
Visualization: {result["visualization"]}
Count: {result["metadata"]["count"]}

Metadata:
{result["metadata"]}
"""

        return [TextContent(type="text", text=response)]

    except Exception as e:
        return [
            TextContent(type="text", text=f"Error downloading geometries: {e!s}"),
        ]


async def main():
    """Main server entry point."""
    # Import here to avoid circular imports
    from mcp.server.stdio import stdio_server

    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            server.create_initialization_options(),
        )


if __name__ == "__main__":
    asyncio.run(main())
