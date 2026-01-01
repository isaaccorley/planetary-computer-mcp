"""
MCP server entry point for Planetary Computer tools.
"""

from mcp.server.fastmcp import FastMCP
from mcp.types import TextContent

from planetary_computer_mcp.core.collections import (
    AmbiguousCollectionError,
    NoCollectionMatchError,
)
from planetary_computer_mcp.tools.download_data import NoDataFoundError, download_data
from planetary_computer_mcp.tools.download_geometries import download_geometries

# Initialize server
mcp = FastMCP("planetary-computer-mcp")


@mcp.tool()
async def download_data_tool(
    query: str,
    aoi: str | list[float],
    time_range: str | None = None,
    output_dir: str = ".",
    max_cloud_cover: int = 20,
) -> list[TextContent]:
    """
    Download satellite/raster data from Microsoft Planetary Computer.

    Automatically detects collection from natural language queries,
    handles geocoding for place names, downloads and crops data,
    generates RGB visualizations.

    Parameters
    ----------
    query : str
        Natural language query describing the data you want.
        Examples: "sentinel-2 imagery", "landsat", "naip aerial photos",
        "elevation data", "land cover"
    aoi : str or list[float]
        **Required.** Area of interest as either:
        - Place name string: "Seattle, WA", "Paris, France", "Central Park, NY"
        - Bounding box list: [west, south, east, north] in degrees
          Example: [-122.4, 47.5, -122.3, 47.6]
    time_range : str or None, optional
        ISO8601 datetime range. Defaults to last 7 days if not provided.
        Examples: "2024-01-01/2024-01-31", "2024-06-01/2024-06-30"
    output_dir : str, optional
        Directory to save outputs. Defaults to current directory.
    max_cloud_cover : int, optional
        Maximum cloud cover percentage for optical data (0-100). Default: 20

    Returns
    -------
    list[TextContent]
        File paths and metadata

    Examples
    --------
    Download recent Sentinel-2 imagery of Paris:
        query="sentinel-2 imagery", aoi="Paris, France"

    Download Landsat for a specific bbox and time:
        query="landsat", aoi=[-122.4, 47.5, -122.3, 47.6], time_range="2024-06-01/2024-06-30"

    Download NAIP aerial imagery:
        query="naip aerial photos", aoi="Central Park, NY"
    """
    try:
        result = download_data(
            query=query,
            aoi=aoi,
            time_range=time_range,
            output_dir=output_dir,
            max_cloud_cover=max_cloud_cover,
        )

        # Build response with warnings if any
        response_parts = [
            "Successfully downloaded data:",
            "",
            f"Raw data: {result['raw']}",
            f"Visualization: {result['visualization']}",
            f"Collection: {result['collection']}",
        ]

        # Include warnings if present
        if result.get("warnings"):
            response_parts.append("")
            response_parts.append("Warnings:")
            response_parts.extend(f"  - {warning}" for warning in result["warnings"])

        response_parts.append("")
        response_parts.append("Metadata:")
        response_parts.append(str(result["metadata"]))

        return [TextContent(type="text", text="\n".join(response_parts))]

    except NoDataFoundError as e:
        # Handle no-data-found with actionable suggestion
        error_parts = [f"No data found: {e!s}"]

        if e.suggestion:
            error_parts.append("")
            error_parts.append("Suggested action:")
            error_parts.append(f"  Retry with time_range='{e.suggestion['suggested_time_range']}'")
            error_parts.append(f"  ({e.suggestion['suggested_days']} days instead of default 7)")

        return [TextContent(type="text", text="\n".join(error_parts))]

    except AmbiguousCollectionError as e:
        # Handle ambiguous query with collection suggestions
        error_parts = [f"Ambiguous query: {e!s}", ""]
        error_parts.append("Please specify one of these collections:")
        for suggestion in e.suggestions:
            error_parts.append(f"  - {suggestion['name']}: {suggestion['description']}")
            error_parts.append(f'    Use query: "{suggestion["collection"]}"')

        return [TextContent(type="text", text="\n".join(error_parts))]

    except NoCollectionMatchError as e:
        # Handle unrecognized query with available options
        error_parts = [f"Unknown data type: {e!s}", ""]
        error_parts.append("Available data categories:")
        for category in e.available_categories:
            error_parts.append(f"  - {category}")

        return [TextContent(type="text", text="\n".join(error_parts))]

    except Exception as e:
        return [TextContent(type="text", text=f"Error downloading data: {e!s}")]


@mcp.tool()
async def download_geometries_tool(
    collection: str,
    aoi: list[float] | str,
    output_dir: str = ".",
) -> list[TextContent]:
    """
    Download vector geometries from Planetary Computer.

    Parameters
    ----------
    collection : str
        Collection ID (e.g., "ms-buildings")
    aoi : list[float] or str
        Bounding box [W,S,E,N] or place name string
    output_dir : str, optional
        Directory to save outputs

    Returns
    -------
    list[TextContent]
        File paths and metadata
    """
    try:
        result = download_geometries(
            collection=collection,
            aoi=aoi,
            output_dir=output_dir,
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
    """
    Main server entry point.

    Initializes and runs the MCP server with planetary computer tools.
    This function sets up the FastMCP server and starts the event loop
    to handle incoming MCP protocol messages.

    Returns
    -------
    None
        The server runs indefinitely until interrupted
    """
    mcp.run()


if __name__ == "__main__":
    main()
