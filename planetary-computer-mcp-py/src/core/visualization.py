"""
Visualization utilities for generating RGB/JPEG previews from raster data.
"""


import matplotlib.colors as mcolors
import matplotlib.pyplot as plt
import numpy as np
import xarray as xr

# ESA WorldCover colormap
ESA_WORLDCOVER_CMAP = {
    10: (0, 100, 0, 255),  # Tree cover - dark green
    20: (255, 187, 34, 255),  # Shrubland - orange
    30: (255, 255, 76, 255),  # Grassland - yellow
    40: (240, 150, 255, 255),  # Cropland - pink
    50: (250, 0, 0, 255),  # Built-up - red
    60: (180, 180, 180, 255),  # Bare/sparse - gray
    70: (240, 240, 240, 255),  # Snow/ice - white
    80: (0, 100, 200, 255),  # Water - blue
    90: (0, 150, 160, 255),  # Wetland - teal
    95: (0, 207, 117, 255),  # Mangroves - green
    100: (250, 230, 160, 255),  # Moss/lichen - beige
}


def create_rgb_visualization(
    data: xr.Dataset,
    output_path: str,
    collection: str,
    stretch: bool = True,
) -> str:
    """
    Create RGB visualization from raster data.

    Args:
        data: Xarray Dataset
        output_path: Output JPEG/PNG path
        collection: Collection ID for band selection
        stretch: Whether to stretch values for better visualization

    Returns:
        Path to saved visualization
    """
    # Select appropriate bands based on collection
    rgb_bands = get_rgb_bands_for_collection(collection)

    # Extract RGB bands
    rgb_data = []
    for band in rgb_bands:
        if band in data.data_vars:
            band_data = data[band].values
            # Take first time slice if temporal
            if "time" in data.dims:
                band_data = band_data[0]
            rgb_data.append(band_data)
        else:
            # Fallback: use first available band
            first_band = list(data.data_vars.keys())[0]
            band_data = data[first_band].values
            if "time" in data.dims:
                band_data = band_data[0]
            rgb_data.append(band_data)

    if len(rgb_data) < 3:
        # Pad with copies if not enough bands
        while len(rgb_data) < 3:
            rgb_data.append(rgb_data[0])

    # Stack into RGB array
    rgb_array = np.stack(rgb_data[:3], axis=-1)

    # Normalize to 0-255
    rgb_normalized = normalize_rgb(rgb_array, stretch=stretch)

    # Save as image
    plt.figure(figsize=(10, 10))
    plt.imshow(rgb_normalized)
    plt.axis("off")
    plt.tight_layout()
    plt.savefig(output_path, bbox_inches="tight", dpi=150)
    plt.close()

    return output_path


def create_colormap_visualization(
    data: xr.Dataset,
    output_path: str,
    collection: str,
) -> str:
    """
    Create colormap visualization for classified data.

    Args:
        data: Xarray Dataset
        output_path: Output path
        collection: Collection ID

    Returns:
        Path to saved visualization
    """
    # Get the first band as DataArray
    if isinstance(data, xr.Dataset) and len(data.data_vars) > 0:
        band_name = list(data.data_vars.keys())[0]
        band_data = data[band_name]
    elif isinstance(data, xr.DataArray):
        band_data = data
    else:
        raise ValueError("Invalid data type")

    # Extract values as numpy array
    values = np.array(band_data.values)

    # Handle temporal dimension
    if values.ndim > 2:
        values = values[0]  # Take first time slice

    # Squeeze extra dimensions
    values = np.squeeze(values)

    # Create colormap
    cmap_dict = get_colormap_for_collection(collection)
    if cmap_dict:
        # Create ListedColormap
        bounds = sorted(cmap_dict.keys())
        colors = []
        for val in bounds:
            r, g, b, a = cmap_dict[val]
            colors.append((r / 255, g / 255, b / 255, a / 255))

        cmap = mcolors.ListedColormap(colors)
        norm = mcolors.BoundaryNorm(bounds + [max(bounds) + 1], cmap.N)
    else:
        # Default grayscale
        cmap = "gray"
        norm = None
        bounds = None

    # Plot
    plt.figure(figsize=(10, 10))
    if norm:
        plt.imshow(values, cmap=cmap, norm=norm)
    else:
        plt.imshow(values, cmap=cmap)

    # Add colorbar for classified data
    if cmap_dict and bounds:
        cbar = plt.colorbar(ticks=bounds, shrink=0.8)
        cbar.set_ticklabels([f"{v}" for v in bounds])

    plt.axis("off")
    plt.tight_layout()
    plt.savefig(output_path, bbox_inches="tight", dpi=150)
    plt.close()

    return output_path


def normalize_rgb(rgb_array: np.ndarray, stretch: bool = True) -> np.ndarray:
    """
    Normalize RGB array to 0-255 range.

    Args:
        rgb_array: RGB array
        stretch: Whether to apply percentile stretch

    Returns:
        Normalized RGB array (0-255)
    """
    # Handle NaN/inf
    rgb_array = np.nan_to_num(rgb_array, nan=0, posinf=0, neginf=0)

    if stretch:
        # Percentile stretch
        p2, p98 = np.percentile(rgb_array, (2, 98), axis=(0, 1))
        rgb_array = np.clip((rgb_array - p2) / (p98 - p2), 0, 1)
    else:
        # Min-max normalization
        rgb_min = np.min(rgb_array, axis=(0, 1))
        rgb_max = np.max(rgb_array, axis=(0, 1))
        rgb_array = (rgb_array - rgb_min) / (rgb_max - rgb_min + 1e-8)

    return (rgb_array * 255).astype(np.uint8)


def get_rgb_bands_for_collection(collection: str) -> list[str]:
    """
    Get RGB band names for a collection.

    Args:
        collection: Collection ID

    Returns:
        List of band names [red, green, blue]
    """
    band_mappings = {
        "sentinel-2-l2a": ["B04", "B03", "B02"],  # R, G, B
        "landsat-c2-l2": ["red", "green", "blue"],
        "naip": ["red", "green", "blue"],
        "sentinel-1-rtc": ["vv", "vh", "vv"],  # SAR false color
    }

    return band_mappings.get(
        collection, ["B04", "B03", "B02"],
    )  # Default to Sentinel bands


def get_colormap_for_collection(
    collection: str,
) -> dict[int, tuple[int, int, int, int]] | None:
    """
    Get colormap for classified collections.

    Args:
        collection: Collection ID

    Returns:
        Dictionary mapping class values to RGBA colors, or None
    """
    if collection in ["esa-worldcover", "io-lulc-annual-v02"]:
        return ESA_WORLDCOVER_CMAP

    return None
