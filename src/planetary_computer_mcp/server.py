"""
MCP server entry point for Planetary Computer tools.
"""

from mcp.server.fastmcp import FastMCP
from mcp.types import TextContent

from planetary_computer_mcp.tools.download_data import download_data
from planetary_computer_mcp.tools.download_geometries import download_geometries

# Initialize server
mcp = FastMCP("planetary-computer-mcp")


@mcp.tool()
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


@mcp.tool()
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


def main() -> None:
    """Main server entry point."""
    mcp.run()


if __name__ == "__main__":
    main()
