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
    load_multiband_asset,
    load_raster_from_stac,
    save_raster_as_geotiff,
)
from ..core.visualization import (
    create_colormap_visualization,
    create_rgb_visualization,
)

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

    Parameters
    ----------
    query : str
        Natural language query (e.g., "sentinel-2 imagery")
    aoi : list[float] or str or None, optional
        Bounding box [W,S,E,N] or place name string
    time_range : str or None, optional
        ISO8601 datetime range (e.g., "2024-01-01/2024-01-31")
    output_dir : str, optional
        Directory to save outputs
    max_cloud_cover : int, optional
        Maximum cloud cover for optical data

    Returns
    -------
    dict[str, Any]
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
        raise TypeError("AOI must be a bounding box list or place name string")

    # Get collection type
    data_type = get_collection_type(collection)

    if data_type == "raster":
        return _download_raster_data(
            collection,
            bbox,
            time_range,
            output_dir,
            max_cloud_cover,
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

    Returns
    -------
    dict[str, Any]
        Dictionary with file paths and metadata
    """
    # Only apply cloud cover filter to collections with eo:cloud_cover property
    # Note: NAIP doesn't have cloud cover metadata
    cloud_cover_collections = ["sentinel-2-l2a", "landsat-c2-l2"]
    cloud_cover = max_cloud_cover if collection in cloud_cover_collections else None

    # Search for items
    items = stac_client.search_items(
        collections=[collection],
        bbox=bbox,
        datetime=time_range,
        max_cloud_cover=cloud_cover,
        limit=1 if collection == "sentinel-1-rtc" else 5,  # Fewer items for SAR
    )

    if not items:
        raise ValueError(f"No data found for {collection} in the specified area/time")

    # Get native resolution for collection (default to 10m if unknown)
    resolution = NATIVE_RESOLUTIONS.get(collection, 0.0001)

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

    return {
        "raw": str(raw_path),
        "visualization": str(vis_path),
        "collection": collection,
        "metadata": metadata,
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


def _create_zarr_visualization(
    data: Any,
    output_path: str,
    collection: str,
) -> None:
    """
    Create time series visualization for Zarr climate data.

    Plots spatial mean over time for the first variable.

    Parameters
    ----------
    data : Any
        xarray Dataset with climate data
    output_path : str
        Output file path for visualization
    collection : str
        Collection name for plot title

    Returns
    -------
    None
        Visualization is saved to the specified output path
    """
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
        # No time dimension - create spatial plot instead
        _create_spatial_plot(var_data, output_path, var_name, collection)
        return

    # Calculate spatial mean over time
    spatial_dims = [d for d in var_data.dims if d != time_dim]
    time_series = var_data.mean(dim=spatial_dims)

    # Create figure
    _fig, ax = plt.subplots(figsize=(12, 6))

    # Plot time series
    time_vals = data[time_dim].values
    values = time_series.values

    # Handle units (e.g., Kelvin to Celsius for temperature)
    units = var_data.attrs.get("units", "")
    if units == "K" and "temperature" in var_name.lower():
        values = values - 273.15
        units = "°C"

    ax.plot(time_vals, values, linewidth=1.5, color="#2563eb")
    ax.fill_between(time_vals, values, alpha=0.3, color="#2563eb")

    # Styling
    ax.set_xlabel("Date", fontsize=12)
    ylabel = f"{var_name}"
    if units:
        ylabel += f" ({units})"
    ax.set_ylabel(ylabel, fontsize=12)

    title = f"{collection.upper()}: {var_name}"
    ax.set_title(title, fontsize=14, fontweight="bold")

    ax.grid(True, alpha=0.3)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    # Rotate x-axis labels
    plt.xticks(rotation=45, ha="right")

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close()


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
