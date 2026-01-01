"""
Geocoding utilities for converting place names to bounding boxes.
"""

import hashlib
import json
import math
import os
import time
from datetime import datetime, timedelta
from pathlib import Path

from geopy.extra.rate_limiter import RateLimiter
from geopy.geocoders import Nominatim

# Cache configuration
CACHE_TTL_SECONDS = 24 * 60 * 60  # 24 hours
CACHE_DIR = Path(
    os.environ.get("PC_MCP_CACHE_DIR", Path.home() / ".cache" / "planetary-computer-mcp")
)


def _get_cache_path() -> Path:
    """
    Get the geocoding cache file path.

    Returns
    -------
    Path
        Path to the cache JSON file
    """
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return CACHE_DIR / "geocoding_cache.json"


def _load_cache() -> dict:
    """
    Load geocoding cache from disk.

    Returns
    -------
    dict
        Cache dictionary with place names as keys
    """
    cache_path = _get_cache_path()
    if cache_path.exists():
        try:
            with open(cache_path) as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            # Corrupted or unreadable cache, start fresh
            return {}
    return {}


def _save_cache(cache: dict) -> None:
    """
    Save geocoding cache to disk.

    Parameters
    ----------
    cache : dict
        Cache dictionary to save
    """
    cache_path = _get_cache_path()
    try:
        with open(cache_path, "w") as f:
            json.dump(cache, f, indent=2)
    except OSError:
        # Silently fail on cache write errors
        pass


def _cache_key(place_name: str) -> str:
    """
    Generate a cache key from a place name.

    Normalizes the place name to handle case and whitespace variations.

    Parameters
    ----------
    place_name : str
        Place name to generate key for

    Returns
    -------
    str
        Normalized cache key
    """
    # Normalize: lowercase, strip whitespace, collapse multiple spaces
    normalized = " ".join(place_name.lower().split())
    # Use BLAKE2b for deterministic, cross-platform hashing of cache keys
    return hashlib.blake2b(normalized.encode("utf-8"), digest_size=16).hexdigest()


def _is_cache_valid(entry: dict) -> bool:
    """
    Check if a cache entry is still valid.

    Parameters
    ----------
    entry : dict
        Cache entry with 'timestamp' and 'bbox' keys

    Returns
    -------
    bool
        True if cache entry is valid and not expired
    """
    if "timestamp" not in entry or "bbox" not in entry:
        return False
    return (time.time() - entry["timestamp"]) < CACHE_TTL_SECONDS


def place_to_bbox(place_name: str, use_cache: bool = True) -> list[float]:
    """
    Convert place name to [west, south, east, north] bbox.

    Results are cached for 24 hours to reduce Nominatim API calls.

    Examples:
        "San Antonio" → [-98.79, 29.22, -98.28, 29.76]
        "New York City" → [-74.26, 40.50, -73.70, 40.92]

    Parameters
    ----------
    place_name : str
        Human-readable place name
    use_cache : bool
        Whether to use the geocoding cache. Default True.

    Returns
    -------
    list[float]
        Bounding box as [west, south, east, north]

    Raises
    ------
    ValueError
        If geocoding fails
    """
    cache_key_str = _cache_key(place_name)

    # Try cache first
    if use_cache:
        cache = _load_cache()
        if cache_key_str in cache and _is_cache_valid(cache[cache_key_str]):
            return cache[cache_key_str]["bbox"]

    # Cache miss or disabled - call Nominatim
    geolocator = Nominatim(user_agent="planetary-computer-mcp")
    geocode = RateLimiter(geolocator.geocode, min_delay_seconds=1)
    location = geocode(place_name, exactly_one=True)

    if location and hasattr(location, "raw") and location.raw.get("boundingbox"):
        bb = location.raw["boundingbox"]
        # boundingbox is [south, north, west, east] as strings
        bbox = [float(bb[2]), float(bb[0]), float(bb[3]), float(bb[1])]

        # Update cache
        if use_cache:
            cache = _load_cache()
            cache[cache_key_str] = {
                "bbox": bbox,
                "place_name": place_name,
                "timestamp": time.time(),
            }
            _save_cache(cache)

        return bbox

    # Provide helpful error message for ambiguous place names
    raise ValueError(
        f"Could not geocode: '{place_name}'. "
        "Try a more specific place name like 'Seattle, WA' instead of 'Seattle', "
        "or provide coordinates as a bbox [west, south, east, north]."
    )


def clear_geocoding_cache() -> int:
    """
    Clear the geocoding cache.

    Returns
    -------
    int
        Number of entries cleared
    """
    cache_path = _get_cache_path()
    if cache_path.exists():
        cache = _load_cache()
        count = len(cache)
        cache_path.unlink()
        return count
    return 0


def get_cache_stats() -> dict:
    """
    Get statistics about the geocoding cache.

    Returns
    -------
    dict
        Cache statistics including entry count, size, and age info
    """
    cache_path = _get_cache_path()
    if not cache_path.exists():
        return {"entries": 0, "size_bytes": 0, "valid_entries": 0}

    cache = _load_cache()
    valid_count = sum(1 for entry in cache.values() if _is_cache_valid(entry))

    return {
        "entries": len(cache),
        "valid_entries": valid_count,
        "expired_entries": len(cache) - valid_count,
        "size_bytes": cache_path.stat().st_size,
        "cache_path": str(cache_path),
    }


def validate_bbox(bbox: list[float]) -> list[float]:
    """
    Validate and normalize a bounding box.

    Parameters
    ----------
    bbox : list[float]
        [west, south, east, north]

    Returns
    -------
    list[float]
        Normalized bbox

    Raises
    ------
    ValueError
        If bbox is invalid
    """
    if len(bbox) != 4:
        raise ValueError("Bbox must have 4 elements [west, south, east, north]")

    west, south, east, north = bbox

    if west >= east:
        raise ValueError("West must be less than east")
    if south >= north:
        raise ValueError("South must be less than north")

    # Basic bounds checking
    if not (-180 <= west <= 180 and -180 <= east <= 180):
        raise ValueError("Longitude must be between -180 and 180")
    if not (-90 <= south <= 90 and -90 <= north <= 90):
        raise ValueError("Latitude must be between -90 and 90")

    return [west, south, east, north]


def calculate_bbox_area_km2(bbox: list[float]) -> float:
    """
    Calculate approximate area of bounding box in square kilometers.

    Uses the haversine formula to account for Earth's curvature.

    Parameters
    ----------
    bbox : list[float]
        Bounding box [west, south, east, north] in degrees

    Returns
    -------
    float
        Approximate area in km²
    """
    west, south, east, north = bbox

    # Earth's radius in km
    R = 6371.0

    # Convert to radians
    lat1 = math.radians(south)
    lat2 = math.radians(north)
    lon1 = math.radians(west)
    lon2 = math.radians(east)

    # Width at the center latitude (accounts for longitude compression)
    center_lat = (lat1 + lat2) / 2
    width_km = R * abs(lon2 - lon1) * math.cos(center_lat)

    # Height (constant regardless of longitude)
    height_km = R * abs(lat2 - lat1)

    return width_km * height_km


def get_default_time_range(days: int = 30) -> str:
    """
    Get ISO8601 time range for the last N days.

    Parameters
    ----------
    days : int
        Number of days to look back

    Returns
    -------
    str
        ISO8601 time range like "2024-01-01/2024-01-31"
    """
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)
    return f"{start_date.strftime('%Y-%m-%d')}/{end_date.strftime('%Y-%m-%d')}"
