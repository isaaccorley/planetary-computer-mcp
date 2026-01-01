"""
Download geometries tool for vector/GeoParquet data.
"""

from pathlib import Path
from typing import Any

import geopandas as gpd
import matplotlib.pyplot as plt
import planetary_computer as pc
from pystac_client import Client
from shapely.geometry import box

from ..core import (
    place_to_bbox,
    validate_bbox,
)
from ..core.vector_utils import (
    get_vector_metadata,
    query_geoparquet_by_quadkey,
    save_geodataframe_as_parquet,
)

# Collections that use quadkey partitioning with known structure
# Format: {collection: {base_path_template, account_name, quadkey_level}}
QUADKEY_COLLECTIONS = {
    "ms-buildings": {
        # Path pattern: RegionName={region}/quadkey={qk}/
        "base_path": "footprints/global/2022-07-06/ml-buildings.parquet",
        "account_name": "bingmlbuildings",
        "quadkey_level": 9,
    }
}


def download_geometries(
    collection: str,
    aoi: list[float] | str,
    output_dir: str = ".",
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

    # Get data using appropriate method
    if collection in QUADKEY_COLLECTIONS:
        gdf = _download_quadkey_collection(collection, bbox)
    else:
        gdf = _download_stac_collection(collection, bbox)

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


def _download_quadkey_collection(collection: str, bbox: list[float]) -> gpd.GeoDataFrame:
    """
    Download from quadkey-partitioned collection (e.g., MS Buildings).

    Optimized path that uses known collection structure to minimize API calls.

    Parameters
    ----------
    collection : str
        Collection ID
    bbox : list[float]
        Bounding box [west, south, east, north]

    Returns
    -------
    gpd.GeoDataFrame
        GeoDataFrame with geometries
    """
    config = QUADKEY_COLLECTIONS.get(collection)
    if not config:
        return _download_quadkey_via_stac(collection, bbox)

    # Determine regions for bbox
    regions = _get_regions_for_bbox(bbox)

    # Get SAS token via targeted STAC item search (one item)
    catalog_url = "https://planetarycomputer.microsoft.com/api/stac/v1"
    client = Client.open(catalog_url)

    # Search for one item to get credentials (faster than intersects query)
    search = client.search(
        collections=[collection],
        bbox=bbox,
        limit=1,
    )

    items = list(search.items())
    if not items:
        return gpd.GeoDataFrame()

    # Sign to get SAS token
    signed_item = pc.sign(items[0])
    if "data" not in signed_item.assets:
        return _download_quadkey_via_stac(collection, bbox)

    storage_options = signed_item.assets["data"].extra_fields.get("table:storage_options", {})
    if not storage_options:
        return _download_quadkey_via_stac(collection, bbox)

    # Query each region's quadkey partitions directly
    all_gdfs: list[gpd.GeoDataFrame] = []

    for region in regions:
        base_href = f"abfs://{config['base_path']}/RegionName={region}"
        gdf = query_geoparquet_by_quadkey(
            base_href=base_href,
            bbox=bbox,
            storage_options=storage_options,
            quadkey_level=config["quadkey_level"],
        )
        if len(gdf) > 0:
            all_gdfs.append(gdf)

    if not all_gdfs:
        return gpd.GeoDataFrame()

    import pandas as pd

    return gpd.GeoDataFrame(pd.concat(all_gdfs, ignore_index=True), crs="EPSG:4326")


def _get_regions_for_bbox(bbox: list[float]) -> list[str]:
    """
    Get MS Buildings region names that may contain the bbox.

    For now, uses simple heuristics. Could be enhanced with proper
    reverse geocoding.

    Parameters
    ----------
    bbox : list[float]
        Bounding box [west, south, east, north]

    Returns
    -------
    list[str]
        List of region names to query
    """
    west, south, east, north = bbox

    regions = []

    # North America
    if -170 < west < -50 and 24 < north < 72:
        if south > 24 and north < 50 and west > -130:
            regions.append("United States")
        if north > 41 and west < -52:
            regions.append("Canada")
        if south < 33 and west > -118 and east < -86:
            regions.append("Mexico")

    # If no match, default to US (most common case)
    if not regions:
        regions = ["United States"]

    return regions


def _download_quadkey_via_stac(collection: str, bbox: list[float]) -> gpd.GeoDataFrame:
    """
    Download quadkey collection via STAC item search (slower fallback).

    Parameters
    ----------
    collection : str
        Collection ID
    bbox : list[float]
        Bounding box [west, south, east, north]

    Returns
    -------
    gpd.GeoDataFrame
        GeoDataFrame with geometries
    """
    catalog_url = "https://planetarycomputer.microsoft.com/api/stac/v1"
    client = Client.open(catalog_url)

    # Search to find the region item(s) and get credentials
    aoi_geom = box(bbox[0], bbox[1], bbox[2], bbox[3])
    search = client.search(
        collections=[collection],
        intersects=aoi_geom,
        limit=10,
    )

    items = list(search.items())
    if not items:
        return gpd.GeoDataFrame()

    # Sign items to get storage credentials
    signed_items = [pc.sign(item) for item in items]

    # Process each matching region item
    all_gdfs: list[gpd.GeoDataFrame] = []
    for item in signed_items:
        if "data" not in item.assets:
            continue

        data_asset = item.assets["data"]
        storage_options = data_asset.extra_fields.get("table:storage_options", {})
        if not storage_options:
            continue

        # Query using quadkey-based approach
        gdf = query_geoparquet_by_quadkey(
            base_href=data_asset.href,
            bbox=bbox,
            storage_options=storage_options,
            quadkey_level=9,
        )
        if len(gdf) > 0:
            all_gdfs.append(gdf)

    if not all_gdfs:
        return gpd.GeoDataFrame()

    import pandas as pd

    return gpd.GeoDataFrame(pd.concat(all_gdfs, ignore_index=True), crs="EPSG:4326")


def _download_stac_collection(collection: str, bbox: list[float]) -> gpd.GeoDataFrame:
    """
    Download from STAC-based collection where items map directly to parquet files.

    Parameters
    ----------
    collection : str
        Collection ID
    bbox : list[float]
        Bounding box [west, south, east, north]

    Returns
    -------
    gpd.GeoDataFrame
        GeoDataFrame with geometries
    """
    from ..core.vector_utils import query_geoparquet_from_items

    catalog_url = "https://planetarycomputer.microsoft.com/api/stac/v1"
    client = Client.open(catalog_url)

    aoi_geom = box(bbox[0], bbox[1], bbox[2], bbox[3])
    search = client.search(
        collections=[collection],
        intersects=aoi_geom,
        limit=100,
    )

    items = list(search.items())
    if not items:
        return gpd.GeoDataFrame()

    signed_items = [pc.sign(item) for item in items]

    # Get storage options from first item
    if "data" not in signed_items[0].assets:
        return gpd.GeoDataFrame()

    storage_options = signed_items[0].assets["data"].extra_fields.get("table:storage_options", {})

    return query_geoparquet_from_items(signed_items, bbox, storage_options)


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
