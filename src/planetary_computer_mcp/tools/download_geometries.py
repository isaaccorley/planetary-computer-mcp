"""
Download geometries tool for vector/GeoParquet data.
"""

from pathlib import Path
from typing import Any

import geopandas as gpd
import matplotlib.pyplot as plt
import planetary_computer as pc
from pystac_client import Client

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

    Parameters
    ----------
    collection : str
        Collection ID (e.g., "ms-buildings")
    aoi : list[float] or str
        Bounding box [W,S,E,N] or place name string
    output_dir : str, optional
        Directory to save outputs (default ".")
    limit : int or None, optional
        Maximum number of features to return

    Returns
    -------
    dict[str, Any]
        Dictionary with file paths and metadata
    """
    # Handle AOI
    if isinstance(aoi, str):
        bbox = place_to_bbox(aoi)
    elif isinstance(aoi, list):
        bbox = validate_bbox(aoi)
    else:
        raise TypeError("AOI must be a bounding box list or place name string")

    # Search STAC for parquet items intersecting bbox
    base_path, storage_options = _get_parquet_info_for_collection(collection, bbox)

    if not base_path or not storage_options:
        raise ValueError(f"No parquet data found for {collection} in bbox {bbox}")

    # Query spatially
    gdf = query_geoparquet_spatially(base_path, bbox, limit, storage_options)

    if len(gdf) == 0:
        raise ValueError(f"No geometries found for {collection} in the specified area")

    # Create output directory
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # Generate filename
    base_name = f"{collection}_{bbox[0]:.4f}_{bbox[1]:.4f}_{bbox[2]:.4f}_{bbox[3]:.4f}"
    raw_path = output_path / f"{base_name}.parquet"
    viz_path = output_path / f"{base_name}_viz.jpg"

    # Save raw Parquet
    save_geodataframe_as_parquet(gdf, str(raw_path))

    # Generate visualization
    _create_vector_visualization(gdf, str(viz_path), bbox)

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


def _get_parquet_info_for_collection(
    collection: str, bbox: list[float]
) -> tuple[str | None, dict[str, Any] | None]:
    """
    Get parquet base path and storage options for a collection.

    Parameters
    ----------
    collection : str
        Collection ID (e.g., "ms-buildings")
    bbox : list[float]
        Bounding box [west, south, east, north]

    Returns
    -------
    tuple[str | None, dict[str, Any] | None]
        Tuple of (base_path, storage_options) or (None, None)
    """
    catalog_url = "https://planetarycomputer.microsoft.com/api/stac/v1"
    client = Client.open(catalog_url)

    # Determine region based on bbox (simplified - US/Canada only for now)
    region_filter = None
    if -125 <= bbox[0] <= -66 and 24 <= bbox[1] <= 50:
        region_filter = "United States"
    elif -141 <= bbox[0] <= -52 and 41 <= bbox[1] <= 84:
        region_filter = "Canada"

    # Search for items intersecting bbox
    query_params = {}
    if region_filter:
        query_params["msbuildings:region"] = {"eq": region_filter}

    search = client.search(
        collections=[collection],
        bbox=bbox,
        query=query_params if query_params else None,
        limit=1,
    )

    items = list(search.items())
    if not items:
        return None, None

    # Sign item and extract info
    signed_item = pc.sign(items[0])
    if "data" not in signed_item.assets:
        return None, None

    asset = signed_item.assets["data"]
    base_path = asset.href
    storage_options = asset.extra_fields.get("table:storage_options", {})

    return base_path, storage_options


def _create_vector_visualization(gdf: gpd.GeoDataFrame, output_path: str, bbox: list[float]) -> str:
    """
    Create visualization for vector data with basemap.

    Parameters
    ----------
    gdf : gpd.GeoDataFrame
        GeoDataFrame with geometries
    output_path : str
        Output file path
    bbox : list[float]
        Bounding box for extent

    Returns
    -------
    str
        Path to saved visualization
    """
    import contextily as cx

    fig, ax = plt.subplots(figsize=(10, 10))

    if len(gdf) > 0:
        # Reproject to Web Mercator for basemap compatibility
        gdf_wm = gdf.to_crs(epsg=3857)

        # Plot geometries
        gdf_wm.plot(
            ax=ax,
            facecolor="steelblue",
            edgecolor="darkblue",
            alpha=0.7,
            linewidth=0.3,
        )

        # Add basemap
        cx.add_basemap(ax, source=cx.providers.CartoDB.Positron)  # type: ignore[attr-defined]

        # Set extent to bbox (convert to Web Mercator)
        from pyproj import Transformer

        transformer = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)
        xmin, ymin = transformer.transform(bbox[0], bbox[1])
        xmax, ymax = transformer.transform(bbox[2], bbox[3])
        ax.set_xlim(xmin, xmax)
        ax.set_ylim(ymin, ymax)

    ax.set_aspect("equal")
    ax.axis("off")

    # Remove all padding/margins
    plt.subplots_adjust(left=0, right=1, top=1, bottom=0)
    fig.savefig(output_path, bbox_inches="tight", pad_inches=0, dpi=150, format="jpeg")
    plt.close(fig)

    return output_path
