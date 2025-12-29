"""
Download geometries tool for vector/GeoParquet data.
"""

from pathlib import Path
from typing import Any

from ..core import (
    place_to_bbox,
    validate_bbox,
)
from ..core.vector_utils import (
    get_vector_metadata,
    query_geoparquet_spatially,
    save_geodataframe_as_parquet,
)


def download_geometries(
    collection: str,
    aoi: list[float] | str,
    output_dir: str = ".",
    limit: int | None = None,
) -> dict[str, Any]:
    """
    Download vector geometries from Planetary Computer.

    Args:
        collection: Collection ID (e.g., "ms-buildings")
        aoi: Bounding box [W,S,E,N] or place name string
        output_dir: Directory to save outputs
        limit: Maximum number of features to return

    Returns:
        Dictionary with file paths and metadata
    """
    # Handle AOI
    if isinstance(aoi, str):
        bbox = place_to_bbox(aoi)
    elif isinstance(aoi, list):
        bbox = validate_bbox(aoi)
    else:
        raise ValueError("AOI must be a bounding box list or place name string")

    # For now, assume we have parquet URLs for the collection
    # In a real implementation, we'd query STAC for asset URLs
    parquet_urls = _get_parquet_urls_for_collection(collection, bbox)

    if not parquet_urls:
        raise ValueError(f"No parquet files found for {collection}")

    # Query spatially
    gdf = query_geoparquet_spatially(parquet_urls, bbox, limit)

    if len(gdf) == 0:
        raise ValueError(f"No geometries found for {collection} in the specified area")

    # Create output directory
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # Generate filename
    base_name = (
        f"{collection}_{int(bbox[0])}_{int(bbox[1])}_{int(bbox[2])}_{int(bbox[3])}"
    )
    raw_path = output_path / f"{base_name}.parquet"
    viz_path = output_path / f"{base_name}_viz.jpg"

    # Save raw Parquet
    save_geodataframe_as_parquet(gdf, str(raw_path))

    # Generate visualization (placeholder - render map)
    _create_vector_visualization(gdf, str(viz_path))

    # Get metadata
    metadata = get_vector_metadata(gdf)
    metadata.update(
        {
            "collection": collection,
            "bbox": bbox,
        },
    )

    return {
        "raw": str(raw_path),
        "visualization": str(viz_path),
        "collection": collection,
        "metadata": metadata,
    }


def _get_parquet_urls_for_collection(collection: str, bbox: list[float]) -> list[str]:
    """
    Get parquet URLs for a collection (placeholder implementation).

    In reality, this would query STAC for the appropriate asset URLs
    covering the bbox.
    """
    # Placeholder - in real implementation, query STAC catalog
    if collection == "ms-buildings":
        # Example URLs - replace with actual STAC query
        return [
            "https://planetarycomputer.microsoft.com/api/stac/v1/collections/ms-buildings/items/msbuildings_Africa.parquet",
            "https://planetarycomputer.microsoft.com/api/stac/v1/collections/ms-buildings/items/msbuildings_Asia.parquet",
        ]
    return []


def _create_vector_visualization(gdf, output_path: str) -> str:
    """
    Create visualization for vector data (placeholder).

    In a real implementation, render a map with the geometries.
    """
    # Placeholder - create a simple plot
    import matplotlib.pyplot as plt

    if len(gdf) > 0:
        fig, ax = plt.subplots(figsize=(10, 10))
        gdf.plot(ax=ax, color="red", alpha=0.5)
        plt.axis("off")
        plt.tight_layout()
        plt.savefig(output_path, bbox_inches="tight", dpi=150)
        plt.close()
    else:
        # Empty plot
        fig, ax = plt.subplots(figsize=(10, 10))
        plt.text(0.5, 0.5, "No geometries found", transform=ax.transAxes, ha="center")
        plt.axis("off")
        plt.savefig(output_path, bbox_inches="tight", dpi=150)
        plt.close()

    return output_path
