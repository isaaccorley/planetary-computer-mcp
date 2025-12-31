"""
Unified download_data tool for raster, DEM, land cover, and Zarr data.
"""

from pathlib import Path
from typing import Any

from ..core import (
    calculate_bbox_area_km2,
    detect_collection_from_query,
    get_collection_type,
    get_default_time_range,
    place_to_bbox,
    stac_client,
    validate_bbox,
)
from ..core.raster_utils import (
    get_raster_metadata,
    load_multiband_asset,
    load_raster_from_stac,
    save_raster_as_geotiff,
)
from ..core.visualization import (
    create_colormap_visualization,
    create_rgb_visualization,
)

# AOI size limits in km²
AOI_WARN_THRESHOLD_KM2 = 100  # Warn user about large AOI
AOI_REJECT_THRESHOLD_KM2 = 1000  # Reject AOIs larger than this

# Default time range in days
DEFAULT_TIME_RANGE_DAYS = 7  # Default to last week

# Resolution scaling factors based on AOI size
RESOLUTION_SCALE_THRESHOLDS = [
    (10, 1),  # < 10 km²: native resolution
    (50, 2),  # 10-50 km²: 2x coarser
    (100, 4),  # 50-100 km²: 4x coarser
    (500, 8),  # 100-500 km²: 8x coarser
    (1000, 16),  # 500-1000 km²: 16x coarser
]

# Adaptive search limits based on AOI size
# Larger AOIs need more items to find good coverage
SEARCH_LIMIT_THRESHOLDS = [
    (10, 1),  # < 10 km²: 1 item (small area, single scene covers it)
    (50, 2),  # 10-50 km²: 2 items
    (100, 5),  # 50-100 km²: 5 items
    (500, 10),  # 100-500 km²: 10 items
    (1000, 20),  # 500-1000 km²: 20 items (large area, may need multiple scenes)
]


class NoDataFoundError(Exception):
    """
    Raised when no data is found, with suggestion for retry.

    Parameters
    ----------
    message : str
        Error message describing the issue
    suggestion : dict or None
        Optional dict with retry suggestion (time_range, days, etc.)
    """

    def __init__(self, message: str, suggestion: dict | None = None) -> None:
        super().__init__(message)
        self.suggestion = suggestion


# Native resolutions in degrees (approximate at equator)
# These match the native pixel size of each collection
NATIVE_RESOLUTIONS: dict[str, float] = {
    # Optical imagery
    "sentinel-2-l2a": 0.0001,  # 10m
    "landsat-c2-l2": 0.00027,  # 30m
    "naip": 0.000003,  # ~0.3m (30cm for recent imagery)
    "hls2-l30": 0.00027,  # 30m (HLS Landsat)
    "hls2-s30": 0.00027,  # 30m (HLS Sentinel-2)
    "modis-09A1-061": 0.0045,  # 500m
    "aster-l1t": 0.00014,  # 15m (VNIR bands)
    "planet-nicfi": 0.000043,  # 4.77m
    # SAR
    "sentinel-1-rtc": 0.0001,  # 10m
    "sentinel-1-grd": 0.0001,  # 10m
    "alos-palsar": 0.000113,  # 12.5m
    # DEMs
    "cop-dem-glo-30": 0.00027,  # 30m
    "cop-dem-glo-90": 0.00081,  # 90m
    "copernicus-dem": 0.00027,  # 30m
    "alos-dem": 0.00027,  # 30m
    "nasadem": 0.00027,  # 30m
    "3dep-seamless": 0.00009,  # 10m (varies by region)
    # Land cover
    "esa-worldcover": 0.0001,  # 10m
    "io-lulc-annual-v02": 0.0001,  # 10m
    "usda-cdl": 0.00027,  # 30m
    "usgs-lcmap": 0.00027,  # 30m
    "nrcan-landcover": 0.00027,  # 30m
    "esa-cci": 0.0027,  # 300m
    "gap": 0.00027,  # 30m
    "drcog-lulc": 0.000009,  # 1m
    "chesapeake": 0.000009,  # 1m
    # Climate
    "gridmet": 0.036,  # 4km
    "terraclimate": 0.036,  # 4km
    "gpm-imerg-hhr": 0.001,  # 0.1°
    # Water
    "jrc-gsw": 0.00027,  # 30m
    # Other
    "deltares-floods": 0.00081,  # 90m
    "gnatsgo": 0.00027,  # 30m
    "io-biodiversity": 0.0001,  # 10m
}

# Number of bands per collection (for size estimation)
COLLECTION_BANDS: dict[str, int] = {
    "sentinel-2-l2a": 3,  # RGB for visualization
    "landsat-c2-l2": 3,  # RGB
    "naip": 4,  # RGBN
    "sentinel-1-rtc": 2,  # VV, VH
    "cop-dem-glo-30": 1,  # elevation
    "cop-dem-glo-90": 1,
    "alos-dem": 1,
    "esa-worldcover": 1,  # classification
    "io-lulc-annual-v02": 1,
    "gridmet": 1,  # single variable
    "terraclimate": 1,
}

# Bytes per pixel (float32 = 4 bytes, int16 = 2 bytes)
BYTES_PER_PIXEL: dict[str, int] = {
    "sentinel-2-l2a": 2,  # uint16
    "landsat-c2-l2": 2,  # uint16
    "naip": 1,  # uint8
    "sentinel-1-rtc": 4,  # float32
    "cop-dem-glo-30": 4,  # float32
    "esa-worldcover": 1,  # uint8
    "io-lulc-annual-v02": 1,  # uint8
    "gridmet": 4,  # float32
}


def estimate_download_size(
    collection: str,
    bbox: list[float],
    resolution: float,
) -> dict[str, Any]:
    """
    Estimate the download size for a raster request.

    Parameters
    ----------
    collection : str
        Collection ID
    bbox : list[float]
        Bounding box [west, south, east, north]
    resolution : float
        Output resolution in degrees

    Returns
    -------
    dict[str, Any]
        Estimation with keys: pixels, bands, size_bytes, size_mb, size_str
    """
    west, south, east, north = bbox

    # Calculate pixel dimensions
    width_deg = abs(east - west)
    height_deg = abs(north - south)

    width_pixels = int(width_deg / resolution)
    height_pixels = int(height_deg / resolution)
    total_pixels = width_pixels * height_pixels

    # Get band count and bytes per pixel
    num_bands = COLLECTION_BANDS.get(collection, 3)  # Default to 3 bands
    bytes_per_pixel = BYTES_PER_PIXEL.get(collection, 4)  # Default to float32

    # Calculate size (uncompressed in-memory size)
    size_bytes = total_pixels * num_bands * bytes_per_pixel

    # Convert to human-readable
    size_mb = size_bytes / (1024 * 1024)
    if size_mb < 1:
        size_str = f"{size_bytes / 1024:.1f} KB"
    elif size_mb < 1024:
        size_str = f"{size_mb:.1f} MB"
    else:
        size_str = f"{size_mb / 1024:.1f} GB"

    return {
        "width_pixels": width_pixels,
        "height_pixels": height_pixels,
        "total_pixels": total_pixels,
        "bands": num_bands,
        "bytes_per_pixel": bytes_per_pixel,
        "size_bytes": size_bytes,
        "size_mb": size_mb,
        "size_str": size_str,
        "resolution_deg": resolution,
    }


def get_adaptive_search_limit(aoi_area_km2: float) -> int:
    """
    Get adaptive search limit based on AOI size.

    Larger AOIs may need more items to find good scene coverage.
    Small AOIs typically need only 1 item.

    Parameters
    ----------
    aoi_area_km2 : float
        Area of the bounding box in km²

    Returns
    -------
    int
        Recommended search limit (1-20)
    """
    for threshold, limit in SEARCH_LIMIT_THRESHOLDS:
        if aoi_area_km2 < threshold:
            return limit
    # Default to max for very large AOIs
    return SEARCH_LIMIT_THRESHOLDS[-1][1]


def download_data(
    query: str,
    aoi: list[float] | str,
    time_range: str | None = None,
    output_dir: str = ".",
    max_cloud_cover: int = 20,
) -> dict[str, Any]:
    """
    Download satellite/raster data from Microsoft Planetary Computer.

    Automatically detects collection from query, handles geocoding,
    downloads and crops data, generates visualizations.

    Parameters
    ----------
    query : str
        Natural language query describing the data you want.
        Examples: "sentinel-2 imagery", "landsat", "naip aerial photos",
        "elevation data", "land cover"
    aoi : list[float] or str
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
    dict[str, Any]
        Dictionary containing:
        - raw: Path to raw GeoTIFF/NetCDF file
        - visualization: Path to visualization image (JPG)
        - collection: Detected collection ID
        - metadata: Dict with CRS, resolution, bounds, etc.
        - warnings: List of any warnings (e.g., large AOI)

    Raises
    ------
    NoDataFoundError
        If no data found in time range. Contains 'suggestion' attribute with
        recommended retry parameters (expanded time range).

    Examples
    --------
    >>> # Download recent Sentinel-2 imagery of Paris
    >>> download_data("sentinel-2 imagery", "Paris, France")

    >>> # Download Landsat data for a specific time and bbox
    >>> download_data(
    ...     "landsat",
    ...     [-122.4, 47.5, -122.3, 47.6],
    ...     time_range="2024-06-01/2024-06-30"
    ... )

    >>> # Download NAIP aerial imagery
    >>> download_data("naip aerial photos", "Central Park, NY")
    """
    warnings_list: list[str] = []

    # Detect collection from query (raises AmbiguousCollectionError or NoCollectionMatchError)
    collection = detect_collection_from_query(query)

    # Handle AOI - now required
    if isinstance(aoi, str):
        # Geocode place name
        bbox = place_to_bbox(aoi)
    elif isinstance(aoi, list):
        bbox = validate_bbox(aoi)
    else:
        raise TypeError(
            "AOI is required. Provide either:\n"
            "  - A place name like 'Seattle, WA' or 'Paris, France'\n"
            "  - A bounding box like [-122.4, 47.5, -122.3, 47.6]"
        )

    # Validate AOI size
    aoi_area_km2 = calculate_bbox_area_km2(bbox)

    if aoi_area_km2 > AOI_REJECT_THRESHOLD_KM2:
        raise ValueError(
            f"AOI too large ({aoi_area_km2:.0f} km²). "
            f"Maximum allowed is {AOI_REJECT_THRESHOLD_KM2} km². "
            "Try a smaller area like a city neighborhood or specific location."
        )

    if aoi_area_km2 > AOI_WARN_THRESHOLD_KM2:
        warnings_list.append(
            f"Large AOI ({aoi_area_km2:.0f} km²). "
            "Download may take several minutes. Consider using a smaller area for faster results."
        )

    # Handle time range - default to last week
    used_default_time_range = False
    if time_range is None:
        time_range = get_default_time_range(days=DEFAULT_TIME_RANGE_DAYS)
        used_default_time_range = True
        warnings_list.append(
            f"No time range specified. Using last {DEFAULT_TIME_RANGE_DAYS} days: {time_range}. "
            "Specify time_range like '2024-06-01/2024-06-30' for specific dates."
        )

    # Get collection type
    data_type = get_collection_type(collection)

    if data_type == "raster":
        result = _download_raster_data(
            collection,
            bbox,
            time_range,
            output_dir,
            max_cloud_cover,
            aoi_area_km2,
            used_default_time_range,
        )
    elif data_type == "zarr":
        result = _download_zarr_data(collection, bbox, time_range, output_dir)
    else:
        raise ValueError(f"Unsupported data type: {data_type}")

    # Add warnings to result
    if warnings_list:
        result["warnings"] = warnings_list

    return result


def _download_raster_data(
    collection: str,
    bbox: list[float],
    time_range: str | None,
    output_dir: str,
    max_cloud_cover: int,
    aoi_area_km2: float,
    used_default_time_range: bool = False,
) -> dict[str, Any]:
    """
    Download raster data.

    Parameters
    ----------
    collection : str
        Collection ID (e.g., "sentinel-2-l2a")
    bbox : list[float]
        Bounding box [west, south, east, north]
    time_range : str or None
        ISO8601 datetime range
    output_dir : str
        Directory to save outputs
    max_cloud_cover : int
        Maximum cloud cover for optical data
    aoi_area_km2 : float
        Area of the bounding box in km² (for resolution scaling)
    used_default_time_range : bool
        Whether the default time range was used (for suggestion on retry)

    Returns
    -------
    dict[str, Any]
        Dictionary with file paths and metadata
    """
    # Only apply cloud cover filter to collections with eo:cloud_cover property
    # Note: NAIP doesn't have cloud cover metadata
    cloud_cover_collections = ["sentinel-2-l2a", "landsat-c2-l2"]
    cloud_cover = max_cloud_cover if collection in cloud_cover_collections else None

    # Use adaptive search limit based on AOI size
    # Larger AOIs may need more items to find good coverage
    search_limit = get_adaptive_search_limit(aoi_area_km2)

    # Search for items
    items = stac_client.search_items(
        collections=[collection],
        bbox=bbox,
        datetime=time_range,
        max_cloud_cover=cloud_cover,
        limit=search_limit,
        sortby="-datetime",  # Sort by datetime descending (most recent first)
    )

    if not items:
        # Provide helpful suggestion to expand time range
        expanded_days = DEFAULT_TIME_RANGE_DAYS + 7  # Suggest expanding by 1 week
        expanded_time_range = get_default_time_range(days=expanded_days)

        suggestion = {
            "action": "retry_with_expanded_time_range",
            "suggested_time_range": expanded_time_range,
            "suggested_days": expanded_days,
            "message": (
                f"No data found for {collection} in the last {DEFAULT_TIME_RANGE_DAYS} days. "
                f"Try expanding the time range to {expanded_days} days: {expanded_time_range}"
            ),
        }

        if used_default_time_range:
            raise NoDataFoundError(
                f"No {collection} data found in the last {DEFAULT_TIME_RANGE_DAYS} days "
                f"for this area. Suggestion: expand time_range to '{expanded_time_range}' "
                f"(last {expanded_days} days) and retry.",
                suggestion=suggestion,
            )
        else:
            raise NoDataFoundError(
                f"No {collection} data found for time range '{time_range}' in this area. "
                "Try a different time range or expand your search window.",
                suggestion=None,
            )

    # Get native resolution for collection (default to 10m if unknown)
    native_resolution = NATIVE_RESOLUTIONS.get(collection, 0.0001)

    # Scale resolution based on AOI size to prevent massive downloads
    resolution_scale = 1
    for threshold, scale in RESOLUTION_SCALE_THRESHOLDS:
        if aoi_area_km2 <= threshold:
            resolution_scale = scale
            break
    else:
        resolution_scale = 16  # Maximum scaling for very large AOIs

    resolution = native_resolution * resolution_scale

    # Estimate download size and add to metadata
    size_estimate = estimate_download_size(collection, bbox, resolution)

    # Only load bands needed for visualization to speed up processing
    # NAIP: multi-band single asset - use specialized loader
    # Others: separate band assets - use odc-stac
    if collection == "naip":
        # NAIP has 4-band 'image' asset (R,G,B,NIR)
        data = load_multiband_asset(
            items,
            asset_name="image",
            bbox=bbox,
            resolution=resolution,
            band_names=["red", "green", "blue", "nir"],
        )
    elif collection in ["sentinel-2-l2a", "landsat-c2-l2", "sentinel-1-rtc"]:
        from ..core.visualization import get_rgb_bands_for_collection

        bands = get_rgb_bands_for_collection(collection)
        data = load_raster_from_stac(items, bbox, bands=bands, resolution=resolution)
    else:
        data = load_raster_from_stac(items, bbox, resolution=resolution)

    # Generate visualization
    raw_path = Path(output_dir) / f"{collection}-data.tif"
    vis_path = Path(output_dir) / f"{collection}-visual.jpg"

    save_raster_as_geotiff(data, str(raw_path))

    # Collections that use RGB visualization (optical + SAR)
    rgb_collections = ["sentinel-2-l2a", "landsat-c2-l2", "naip", "sentinel-1-rtc"]

    if collection in rgb_collections:
        create_rgb_visualization(data, str(vis_path), collection)
    else:
        create_colormap_visualization(data, str(vis_path), collection)

    # Extract metadata
    metadata = get_raster_metadata(data)
    metadata["collection"] = collection
    metadata["bbox"] = bbox
    if time_range:
        metadata["datetime"] = time_range

    # Add size estimate to metadata
    metadata["size_estimate"] = size_estimate

    return {
        "raw": str(raw_path),
        "visualization": str(vis_path),
        "collection": collection,
        "metadata": metadata,
        "download_info": {
            "estimated_size": size_estimate["size_str"],
            "dimensions": f"{size_estimate['width_pixels']}x{size_estimate['height_pixels']} pixels",
            "resolution_deg": size_estimate["resolution_deg"],
        },
    }


def _download_zarr_data(
    collection: str,
    bbox: list[float],
    time_range: str | None,
    output_dir: str,
) -> dict[str, Any]:
    """
    Download Zarr climate/weather data.

    Loads data from Planetary Computer's Zarr-based collections,
    subsets by bbox and time range, saves as NetCDF, and creates
    visualizations (time series, spatial heatmaps, and animations).

    Parameters
    ----------
    collection : str
        Collection ID (e.g., "gridmet")
    bbox : list[float]
        Bounding box [west, south, east, north]
    time_range : str or None
        ISO8601 datetime range
    output_dir : str
        Directory to save outputs

    Returns
    -------
    dict[str, Any]
        Dictionary with file paths and metadata
    """
    from ..core.zarr_utils import (
        get_zarr_metadata,
        load_and_compute_zarr,
        save_zarr_subset_as_netcdf,
    )

    # Load and compute Zarr data
    data = load_and_compute_zarr(
        collection_id=collection,
        bbox=bbox,
        time_range=time_range,
    )

    if len(data.data_vars) == 0:
        raise ValueError(f"No data found for {collection} in the specified area/time")

    # Save as NetCDF
    raw_path = Path(output_dir) / f"{collection}-data.nc"
    save_zarr_subset_as_netcdf(data, str(raw_path))

    # Create visualizations based on data structure
    visualizations = _create_zarr_visualizations(data, collection, output_dir)

    # Extract metadata
    metadata = get_zarr_metadata(data)
    metadata["collection"] = collection
    metadata["bbox"] = bbox
    if time_range:
        metadata["datetime"] = time_range

    result = {
        "raw": str(raw_path),
        "collection": collection,
        "metadata": metadata,
    }
    result.update(visualizations)

    return result


def _create_zarr_visualizations(
    data: Any,
    collection: str,
    output_dir: str,
) -> dict[str, str]:
    """
    Create multiple visualizations for Zarr climate data.

    Creates time series plots, spatial heatmaps, and animations as appropriate.

    Parameters
    ----------
    data : Any
        xarray Dataset with climate data
    collection : str
        Collection name
    output_dir : str
        Directory to save visualizations

    Returns
    -------
    dict[str, str]
        Dictionary mapping visualization type to file path
    """
    visualizations = {}

    # Get the first data variable
    var_name = next(iter(data.data_vars))
    var_data = data[var_name]

    # Find time dimension
    time_dim = None
    for dim in ["time", "day"]:
        if dim in var_data.dims:
            time_dim = dim
            break

    # Create spatial heatmap as primary visualization (single time point)
    if time_dim is not None:
        # Create heatmap for the middle time slice as main visualization
        middle_idx = len(data[time_dim]) // 2
        spatial_data = var_data.isel({time_dim: middle_idx})
        spatial_path = Path(output_dir) / f"{collection}-visualization.jpg"
        _create_spatial_snapshot(
            spatial_data, str(spatial_path), var_name, collection, data[time_dim].values[middle_idx]
        )
        visualizations["visualization"] = str(spatial_path)

        # Create animation if we have multiple time steps (GIF of spatial heatmaps)
        if len(data[time_dim]) > 3:  # Only create animation for meaningful time series
            animation_path = Path(output_dir) / f"{collection}-animation.gif"
            _create_zarr_animation(data, str(animation_path), collection)
            visualizations["animation"] = str(animation_path)
    else:
        # No time dimension - create spatial plot as main visualization
        spatial_path = Path(output_dir) / f"{collection}-visualization.jpg"
        _create_spatial_plot(var_data, str(spatial_path), var_name, collection)
        visualizations["visualization"] = str(spatial_path)

    return visualizations


def _create_zarr_animation(
    data: Any,
    output_path: str,
    collection: str,
) -> None:
    """
    Create animated GIF showing temporal evolution of climate data.

    Parameters
    ----------
    data : Any
        xarray Dataset with climate data
    output_path : str
        Output file path for animation (.gif)
    collection : str
        Collection name for plot title

    Returns
    -------
    None
        Animation is saved to the specified output path
    """
    import matplotlib.animation as animation
    import matplotlib.pyplot as plt

    # Get the first data variable
    var_name = next(iter(data.data_vars))
    var_data = data[var_name]

    # Find time dimension
    time_dim = None
    for dim in ["time", "day"]:
        if dim in var_data.dims:
            time_dim = dim
            break

    if time_dim is None:
        raise ValueError("Cannot create animation: no time dimension found")

    # Get time values for display
    time_vals = data[time_dim].values
    n_frames = min(len(time_vals), 10)  # Limit to 10 frames for faster generation

    # Set up the figure - smaller size for tighter zoom
    fig, ax = plt.subplots(figsize=(8, 6))

    # Handle units (e.g., Kelvin to Celsius for temperature)
    units = var_data.attrs.get("units", "")
    display_units = units
    if units == "K" and "temperature" in var_name.lower():
        display_units = "°C"

    # Create colormap
    cmap = plt.get_cmap("RdYlBu_r")  # Red-Yellow-Blue reversed (warm=cold)

    # Get data for first frame to set up colorbar
    first_frame_data = var_data.isel({time_dim: 0})
    plot_data = first_frame_data.values
    if units == "K" and "temperature" in var_name.lower():
        plot_data = plot_data - 273.15

    # Create initial plot with colorbar - reduce shrink for tighter layout
    im = ax.imshow(plot_data, cmap=cmap, aspect="auto", origin="upper")
    cbar = plt.colorbar(im, ax=ax, shrink=0.85)
    cbar.set_label(f"{var_name} ({display_units})")

    def animate(frame_idx: int) -> list:
        ax.clear()

        # Get data for this frame
        frame_data = var_data.isel({time_dim: frame_idx})

        # Handle units conversion
        plot_data = frame_data.values
        if units == "K" and "temperature" in var_name.lower():
            plot_data = plot_data - 273.15

        # Create heatmap - use origin="upper" for north-up orientation
        im = ax.imshow(plot_data, cmap=cmap, aspect="auto", origin="upper")

        # Add timestamp
        timestamp = str(time_vals[frame_idx])[:10]  # YYYY-MM-DD format
        ax.set_title(
            f"{collection.upper()}: {var_name}\n{timestamp}", fontsize=14, fontweight="bold"
        )

        ax.axis("off")
        return [im]

    # Create animation
    # Sample frames evenly across the time series
    frame_indices = [int(i * (len(time_vals) - 1) / (n_frames - 1)) for i in range(n_frames)]
    anim = animation.FuncAnimation(fig, animate, frames=frame_indices, interval=500, blit=False)

    # Save as GIF - use tight layout like static plots
    plt.tight_layout()
    anim.save(output_path, writer="pillow", fps=2, dpi=100)
    plt.close(fig)


def _create_spatial_snapshot(
    var_data: Any,
    output_path: str,
    var_name: str,
    collection: str,
    timestamp: Any = None,
) -> None:
    """
    Create spatial heatmap for a specific time slice.

    Parameters
    ----------
    var_data : Any
        xarray DataArray for a specific time slice
    output_path : str
        Output file path for visualization
    var_name : str
        Variable name for plot title
    collection : str
        Collection name for plot title
    timestamp : Any, optional
        Timestamp for the data slice

    Returns
    -------
    None
        Visualization is saved to the specified output path
    """
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(10, 8))

    # Handle units (e.g., Kelvin to Celsius for temperature)
    units = var_data.attrs.get("units", "")
    display_units = units
    plot_data = var_data.values
    if units == "K" and "temperature" in var_name.lower():
        plot_data = plot_data - 273.15
        display_units = "°C"

    # Create colormap - use appropriate colors for different variables
    if "temperature" in var_name.lower():
        cmap = plt.get_cmap("RdYlBu_r")  # Warm colors for temperature
    elif "precipitation" in var_name.lower() or "pr" in var_name.lower():
        cmap = plt.get_cmap("Blues")  # Blue for precipitation
    else:
        cmap = plt.get_cmap("viridis")  # Default

    # Get 2D slice if needed
    if plot_data.ndim > 2:
        for dim in plot_data.shape:
            if dim not in [plot_data.shape[-2], plot_data.shape[-1]]:  # Keep spatial dims
                plot_data = plot_data[0]  # Take first slice of extra dims

    im = ax.imshow(plot_data, cmap=cmap, aspect="auto", origin="upper")
    cbar = plt.colorbar(im, ax=ax, shrink=0.85)
    cbar.set_label(f"{var_name} ({display_units})")

    # Create title
    title = f"{collection.upper()}: {var_name}"
    if timestamp is not None:
        timestamp_str = str(timestamp)[:10] if hasattr(timestamp, "__str__") else str(timestamp)
        title += f"\n{timestamp_str}"

    ax.set_title(title, fontsize=14, fontweight="bold")
    ax.axis("off")

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close(fig)


def _create_spatial_plot(
    var_data: Any,
    output_path: str,
    var_name: str,
    collection: str,
) -> None:
    """
    Create spatial heatmap for data without time dimension.

    Parameters
    ----------
    var_data : Any
        xarray DataArray to visualize
    output_path : str
        Output file path for visualization
    var_name : str
        Variable name for plot title
    collection : str
        Collection name for plot title

    Returns
    -------
    None
        Visualization is saved to the specified output path
    """
    import matplotlib.pyplot as plt

    _fig, ax = plt.subplots(figsize=(10, 8))

    # Get 2D slice if needed
    plot_data = var_data
    if plot_data.ndim > 2:
        # Take first slice of extra dimensions
        for dim in plot_data.dims:
            if dim not in ["lat", "lon", "x", "y", "latitude", "longitude"]:
                plot_data = plot_data.isel({dim: 0})

    im = ax.imshow(plot_data.values, aspect="auto", cmap="viridis", origin="upper")
    plt.colorbar(im, ax=ax, label=var_data.attrs.get("units", ""))

    ax.set_title(f"{collection.upper()}: {var_name}", fontsize=14, fontweight="bold")
    ax.axis("off")

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close()
