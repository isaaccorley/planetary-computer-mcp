"""
Collection mapping and metadata for dataset auto-detection.
"""


class AmbiguousCollectionError(Exception):
    """
    Raised when query matches multiple collections ambiguously.

    Parameters
    ----------
    message : str
        Error message describing the ambiguity
    suggestions : list[dict]
        List of suggested collections, each with 'collection', 'name', 'description'
    """

    def __init__(self, message: str, suggestions: list[dict]) -> None:
        super().__init__(message)
        self.suggestions = suggestions


class NoCollectionMatchError(Exception):
    """
    Raised when query doesn't match any collection.

    Parameters
    ----------
    message : str
        Error message describing the issue
    available_categories : list[str]
        List of available data categories for user guidance
    """

    def __init__(self, message: str, available_categories: list[str]) -> None:
        super().__init__(message)
        self.available_categories = available_categories


# Collection metadata with descriptions for suggestions
COLLECTION_INFO: dict[str, dict] = {
    # Optical imagery
    "sentinel-2-l2a": {
        "name": "Sentinel-2 L2A",
        "description": "10m optical imagery, global, 5-day revisit",
        "keywords": ["sentinel-2", "sentinel", "optical", "multispectral"],
        "category": "optical",
    },
    "landsat-c2-l2": {
        "name": "Landsat Collection 2 L2",
        "description": "30m optical imagery, global, 16-day revisit",
        "keywords": ["landsat", "landsat-8", "landsat-9"],
        "category": "optical",
    },
    "naip": {
        "name": "NAIP Aerial Imagery",
        "description": "0.6-1m aerial photos, US only, updated every 2-3 years",
        "keywords": ["naip", "aerial", "high-resolution", "usda"],
        "category": "optical",
    },
    # SAR
    "sentinel-1-rtc": {
        "name": "Sentinel-1 RTC",
        "description": "10m radar imagery, global, works through clouds",
        "keywords": ["sentinel-1", "sar", "radar", "microwave"],
        "category": "sar",
    },
    # DEMs
    "cop-dem-glo-30": {
        "name": "Copernicus DEM 30m",
        "description": "30m global elevation model",
        "keywords": ["dem", "elevation", "terrain", "copernicus", "height"],
        "category": "elevation",
    },
    "alos-dem": {
        "name": "ALOS World 3D DEM",
        "description": "30m global elevation from JAXA",
        "keywords": ["alos", "dem", "elevation", "jaxa"],
        "category": "elevation",
    },
    # Land cover
    "esa-worldcover": {
        "name": "ESA WorldCover",
        "description": "10m global land cover classification",
        "keywords": ["worldcover", "land cover", "landcover", "esa", "classification"],
        "category": "land_cover",
    },
    "io-lulc-annual-v02": {
        "name": "Esri Land Use/Land Cover",
        "description": "10m annual global land use classification",
        "keywords": ["lulc", "land use", "esri", "annual"],
        "category": "land_cover",
    },
    # Climate / Weather
    "gridmet": {
        "name": "gridMET",
        "description": "4km daily climate data for CONUS (1979-present)",
        "keywords": ["gridmet", "climate", "weather", "temperature", "precipitation", "conus"],
        "category": "climate",
    },
    "terraclimate": {
        "name": "TerraClimate",
        "description": "4km monthly climate data, global (1958-present)",
        "keywords": ["terraclimate", "climate", "monthly", "global"],
        "category": "climate",
    },
    "daymet-daily-na": {
        "name": "Daymet Daily",
        "description": "1km daily weather data for North America",
        "keywords": ["daymet", "weather", "daily", "north america"],
        "category": "climate",
    },
    # Vector
    "ms-buildings": {
        "name": "Microsoft Building Footprints",
        "description": "AI-derived building polygons, global coverage",
        "keywords": ["building", "buildings", "footprint", "footprints", "microsoft"],
        "category": "vector",
    },
}

# Backward-compatible keyword mapping (for simple lookups)
COLLECTION_KEYWORDS: dict[str, str] = {
    # Optical imagery
    "sentinel-1": "sentinel-1-rtc",
    "sentinel": "sentinel-2-l2a",
    "sentinel-2": "sentinel-2-l2a",
    "naip": "naip",
    "aerial": "naip",
    "landsat": "landsat-c2-l2",
    # DEMs
    "dem": "cop-dem-glo-30",
    "elevation": "cop-dem-glo-30",
    "terrain": "cop-dem-glo-30",
    "copernicus": "cop-dem-glo-30",
    "alos": "alos-dem",
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
    "climate": "gridmet",
    "weather": "gridmet",
    "temperature": "gridmet",
    "precipitation": "gridmet",
}

# Generic terms that match multiple collections (ambiguous)
AMBIGUOUS_KEYWORDS: dict[str, list[str]] = {
    "satellite": ["sentinel-2-l2a", "landsat-c2-l2", "sentinel-1-rtc"],
    "imagery": ["sentinel-2-l2a", "landsat-c2-l2", "naip"],
    "image": ["sentinel-2-l2a", "landsat-c2-l2", "naip"],
    "remote sensing": ["sentinel-2-l2a", "landsat-c2-l2", "sentinel-1-rtc"],
    "optical": ["sentinel-2-l2a", "landsat-c2-l2", "naip"],
}

# Available data categories for error messages
AVAILABLE_CATEGORIES = [
    "optical imagery (sentinel-2, landsat, naip)",
    "radar/SAR (sentinel-1)",
    "elevation/DEM (copernicus dem, alos dem)",
    "land cover (esa worldcover, esri lulc)",
    "climate/weather (gridmet, terraclimate, daymet)",
    "building footprints (ms-buildings)",
]


def _score_collection_match(query_lower: str, collection_id: str) -> int:
    """
    Score how well a query matches a collection.

    Parameters
    ----------
    query_lower : str
        Lowercase query string to match
    collection_id : str
        Collection ID to score against

    Returns
    -------
    int
        Score (higher = better match). 0 = no match.
    """
    info = COLLECTION_INFO.get(collection_id)
    if not info:
        return 0

    score = 0
    keywords = info.get("keywords", [])

    for keyword in keywords:
        if keyword in query_lower:
            # Exact collection name = highest score
            if keyword == collection_id:
                score += 100
            # Longer keywords = more specific = higher score
            else:
                score += len(keyword) * 2

    return score


def detect_collection_from_query(query: str) -> str:
    """
    Detect collection ID from natural language query.

    Raises errors for ambiguous or unmatched queries instead of
    silently defaulting to Sentinel-2.

    Parameters
    ----------
    query : str
        User query string

    Returns
    -------
    str
        Collection ID

    Raises
    ------
    AmbiguousCollectionError
        If query matches multiple collections ambiguously.
        Contains 'suggestions' attribute with top 3 options.
    NoCollectionMatchError
        If query doesn't match any collection.
        Contains 'available_categories' attribute.
    """
    query_lower = query.lower()

    # First check for ambiguous keywords - if present AND no specific term, raise early
    ambiguous_matches: list[str] = []
    for ambig_keyword, collections in AMBIGUOUS_KEYWORDS.items():
        if ambig_keyword in query_lower:
            ambiguous_matches.extend(collections)

    # Check for specific/exact keyword matches
    matched_collections: dict[str, int] = {}

    for collection_id in COLLECTION_INFO:
        score = _score_collection_match(query_lower, collection_id)
        if score > 0:
            matched_collections[collection_id] = score

    # Also check the simple keyword mapping for backward compatibility
    # These are specific keywords like "sentinel-2", "landsat", "naip"
    specific_keyword_match = False
    for keyword, collection_id in COLLECTION_KEYWORDS.items():
        if keyword in query_lower:
            # Skip if this keyword is in ambiguous list (e.g., "satellite")
            if keyword in AMBIGUOUS_KEYWORDS:
                continue
            specific_keyword_match = True
            # Add or boost score
            current_score = matched_collections.get(collection_id, 0)
            matched_collections[collection_id] = current_score + len(keyword) * 3

    # If we have ambiguous matches but no specific keyword, raise immediately
    if ambiguous_matches and not specific_keyword_match:
        # Deduplicate while preserving order
        unique_matches = list(dict.fromkeys(ambiguous_matches))[:3]
        suggestions = [
            {
                "collection": c,
                "name": COLLECTION_INFO.get(c, {}).get("name", c),
                "description": COLLECTION_INFO.get(c, {}).get("description", ""),
            }
            for c in unique_matches
        ]
        raise AmbiguousCollectionError(
            f"Query '{query}' is ambiguous. Please specify a collection type.",
            suggestions=suggestions,
        )

    # If we have a clear winner (one collection scores much higher), return it
    if matched_collections:
        sorted_matches = sorted(matched_collections.items(), key=lambda x: x[1], reverse=True)
        top_collection, top_score = sorted_matches[0]

        # Clear winner: top score is significantly higher than second
        if len(sorted_matches) == 1 or top_score > sorted_matches[1][1] * 1.5:
            return top_collection

        # Multiple close matches = ambiguous
        close_matches = [c for c, s in sorted_matches if s >= top_score * 0.6]

        if len(close_matches) > 1:
            suggestions = [
                {
                    "collection": c,
                    "name": COLLECTION_INFO.get(c, {}).get("name", c),
                    "description": COLLECTION_INFO.get(c, {}).get("description", ""),
                }
                for c in close_matches[:3]
            ]
            raise AmbiguousCollectionError(
                f"Query '{query}' matches multiple collections. "
                "Please be more specific about the data you want.",
                suggestions=suggestions,
            )

        return top_collection

    # No matches at all
    raise NoCollectionMatchError(
        f"Could not determine collection from query: '{query}'. "
        "Please be more explicit about the type of data you want.",
        available_categories=AVAILABLE_CATEGORIES,
    )


# Collection metadata for tool routing
COLLECTION_TYPES: dict[str, str] = {
    # Raster (COG-based via STAC)
    "sentinel-2-l2a": "raster",
    "naip": "raster",
    "landsat-c2-l2": "raster",
    "cop-dem-glo-30": "raster",
    "alos-dem": "raster",
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
