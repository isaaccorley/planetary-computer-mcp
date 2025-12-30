"""
Collection mapping and metadata for dataset auto-detection.
"""

# Mapping of query keywords to collection IDs
COLLECTION_KEYWORDS: dict[str, str] = {
    # Optical imagery
    "sentinel-1": "sentinel-1-rtc",
    "sentinel": "sentinel-2-l2a",
    "sentinel-2": "sentinel-2-l2a",
    "satellite": "sentinel-2-l2a",  # Default optical
    "naip": "naip",
    "aerial": "naip",
    "landsat": "landsat-c2-l2",
    # DEMs
    "dem": "cop-dem-glo-30",
    "elevation": "cop-dem-glo-30",
    "terrain": "cop-dem-glo-30",
    "copernicus": "cop-dem-glo-30",
    "also": "also-dem",
    # Land cover
    "land cover": "esa-worldcover",
    "landcover": "esa-worldcover",
    "lulc": "io-lulc-annual-v02",
    "land use": "io-lulc-annual-v02",
    "worldcover": "esa-worldcover",
    # Vectors
    "building": "ms-buildings",
    "buildings": "ms-buildings",
    "footprint": "ms-buildings",
    # SAR
    "sar": "sentinel-1-rtc",
    "radar": "sentinel-1-rtc",
    # Climate / Weather (Zarr-based)
    "gridmet": "gridmet",
    "terraclimate": "terraclimate",
    "daymet": "daymet-daily-na",
    "climate": "gridmet",  # Default to GridMET (CONUS, 4km, 1979-2020)
    "weather": "gridmet",
    "temperature": "gridmet",
    "precipitation": "gridmet",
}


def detect_collection_from_query(query: str) -> str | None:
    """
    Detect collection ID from natural language query.

    Parameters
    ----------
    query : str
        User query string

    Returns
    -------
    str or None
        Collection ID or None if not detected
    """
    query_lower = query.lower()

    # Direct collection name matches
    for keyword, collection in COLLECTION_KEYWORDS.items():
        if keyword in query_lower:
            return collection

    # Fallback to Sentinel-2 for general imagery queries
    if any(word in query_lower for word in ["imagery", "image", "satellite", "remote sensing"]):
        return "sentinel-2-l2a"

    return None


# Collection metadata for tool routing
COLLECTION_TYPES: dict[str, str] = {
    # Raster (COG-based via STAC)
    "sentinel-2-l2a": "raster",
    "naip": "raster",
    "landsat-c2-l2": "raster",
    "cop-dem-glo-30": "raster",
    "also-dem": "raster",
    "esa-worldcover": "raster",
    "io-lulc-annual-v02": "raster",
    "sentinel-1-rtc": "raster",
    # Zarr-based climate/weather data
    "gridmet": "zarr",
    "terraclimate": "zarr",
    "daymet-daily-na": "zarr",
    "daymet-daily-hi": "zarr",
    "daymet-daily-pr": "zarr",
    "daymet-monthly-na": "zarr",
    "daymet-annual-na": "zarr",
    "era5-pds": "zarr",
    # Vector (GeoParquet)
    "ms-buildings": "vector",
}


def get_collection_type(collection_id: str) -> str:
    """
    Get the data type for a collection.

    Parameters
    ----------
    collection_id : str
        Collection ID

    Returns
    -------
    str
        "raster", "vector", or "zarr"
    """
    return COLLECTION_TYPES.get(collection_id, "raster")  # Default to raster
