"""
Geocoding utilities for converting place names to bounding boxes.
"""

from geopy.extra.rate_limiter import RateLimiter
from geopy.geocoders import Nominatim


def place_to_bbox(place_name: str) -> list[float]:
    """
    Convert place name to [west, south, east, north] bbox.

    Examples:
        "San Antonio" → [-98.79, 29.22, -98.28, 29.76]
        "New York City" → [-74.26, 40.50, -73.70, 40.92]

    Args:
        place_name: Human-readable place name

    Returns:
        Bounding box as [west, south, east, north]

    Raises:
        ValueError: If geocoding fails
    """
    geolocator = Nominatim(user_agent="planetary-computer-mcp")
    geocode = RateLimiter(geolocator.geocode, min_delay_seconds=1)
    location = geocode(place_name, exactly_one=True)

    if location and hasattr(location, "raw") and location.raw.get("boundingbox"):
        bb = location.raw["boundingbox"]
        # boundingbox is [south, north, west, east] as strings
        return [float(bb[2]), float(bb[0]), float(bb[3]), float(bb[1])]

    raise ValueError(f"Could not geocode: {place_name}")


def validate_bbox(bbox: list[float]) -> list[float]:
    """
    Validate and normalize a bounding box.

    Args:
        bbox: [west, south, east, north]

    Returns:
        Normalized bbox

    Raises:
        ValueError: If bbox is invalid
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
