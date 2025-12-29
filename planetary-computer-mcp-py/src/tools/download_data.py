"""
Unified download_data tool for raster, DEM, land cover, and Zarr data.
"""

from pathlib import Path
from typing import Any

from ..core import (
    detect_collection_from_query,
    get_collection_type,
    place_to_bbox,
    stac_client,
    validate_bbox,
)
from ..core.raster_utils import (
    get_raster_metadata,
    load_raster_from_stac,
    save_raster_as_geotiff,
)
from ..core.visualization import (
    create_colormap_visualization,
    create_rgb_visualization,
)


def download_data(
    query: str,
    aoi: list[float] | str | None = None,
    time_range: str | None = None,
    output_dir: str = ".",
    max_cloud_cover: int = 20,
) -> dict[str, Any]:
    """
    Download satellite/raster data from Planetary Computer.

    Automatically detects collection from query, handles geocoding,
    downloads and crops data, generates visualizations.

    Args:
        query: Natural language query (e.g., "sentinel-2 imagery")
        aoi: Bounding box [W,S,E,N] or place name string
        time_range: ISO8601 datetime range (e.g., "2024-01-01/2024-01-31")
        output_dir: Directory to save outputs
        max_cloud_cover: Maximum cloud cover for optical data

    Returns:
        Dictionary with file paths and metadata
    """
    # Detect collection from query
    collection = detect_collection_from_query(query)
    if not collection:
        raise ValueError(f"Could not detect collection from query: {query}")

    # Handle AOI
    if isinstance(aoi, str):
        # Geocode place name
        bbox = place_to_bbox(aoi)
    elif isinstance(aoi, list):
        bbox = validate_bbox(aoi)
    else:
        raise ValueError("AOI must be a bounding box list or place name string")

    # Get collection type
    data_type = get_collection_type(collection)

    if data_type == "raster":
        return _download_raster_data(
            collection, bbox, time_range, output_dir, max_cloud_cover,
        )
    if data_type == "zarr":
        return _download_zarr_data(collection, bbox, time_range, output_dir)
    raise ValueError(f"Unsupported data type: {data_type}")


def _download_raster_data(
    collection: str,
    bbox: list[float],
    time_range: str | None,
    output_dir: str,
    max_cloud_cover: int,
) -> dict[str, Any]:
    """Download raster data."""
    # Search for items
    items = stac_client.search_items(
        collections=[collection],
        bbox=bbox,
        datetime=time_range,
        max_cloud_cover=max_cloud_cover,
        limit=1,  # Just one item for now
    )

    if not items:
        raise ValueError(f"No data found for {collection} in the specified area/time")

    # Load data with odc-stac
    data = load_raster_from_stac(items, bbox)

    # Create output directory
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # Generate filenames
    base_name = (
        f"{collection}_{int(bbox[0])}_{int(bbox[1])}_{int(bbox[2])}_{int(bbox[3])}"
    )
    raw_path = output_path / f"{base_name}.tif"
    viz_path = output_path / f"{base_name}_viz.jpg"

    # Save raw GeoTIFF
    save_raster_as_geotiff(data, str(raw_path))

    # Generate visualization
    if collection in ["esa-worldcover", "io-lulc-annual-v02"]:
        # Classified data
        create_colormap_visualization(data, str(viz_path), collection)
    else:
        # RGB visualization
        create_rgb_visualization(data, str(viz_path), collection)

    # Get metadata
    metadata = get_raster_metadata(data)
    metadata.update(
        {
            "collection": collection,
            "bbox": bbox,
            "time_range": time_range,
            "item_count": len(items),
        },
    )

    return {
        "raw": str(raw_path),
        "visualization": str(viz_path),
        "collection": collection,
        "metadata": metadata,
    }


def _download_zarr_data(
    collection: str,
    bbox: list[float],
    time_range: str | None,
    output_dir: str,
) -> dict[str, Any]:
    """Download Zarr data (placeholder for now)."""
    # TODO: Implement Zarr downloading with xarray
    raise NotImplementedError("Zarr download not yet implemented")
