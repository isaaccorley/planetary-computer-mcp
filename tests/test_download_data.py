"""
Basic test for raster download functionality.
"""

import os
import shutil
import tempfile
from pathlib import Path

import pytest


# Mark as integration test since it requires network access
@pytest.mark.integration
def test_download_sentinel2_data():
    """Test downloading Sentinel-2 data."""
    from planetary_computer_mcp.tools.download_data import download_data

    # Small AOI for 10m resolution - ~1000x1000 pixels
    # 0.1 deg ~ 11km ~ 1100 pixels at 10m
    result = download_data(
        query="sentinel-2 imagery",
        aoi=[-118.3, 34.0, -118.2, 34.1],  # 0.1 x 0.1 deg
        time_range="2024-07-01/2024-07-31",
        output_dir=tempfile.mkdtemp(),
    )

    # Check that files were created and not empty
    raw_path = Path(result["raw"])
    vis_path = Path(result["visualization"])
    assert raw_path.exists()
    assert vis_path.exists()
    assert raw_path.stat().st_size > 0  # Ensure not empty
    assert vis_path.stat().st_size > 0
    assert result["collection"] == "sentinel-2-l2a"

    # Check metadata
    assert "bbox" in result["metadata"]
    assert result["metadata"]["collection"] == "sentinel-2-l2a"

    # Save visualization to samples for visual validation
    if not os.path.exists("samples"):
        os.makedirs("samples")
    vis_path = Path(result["visualization"])
    sample_path = Path("samples") / f"{result['collection']}-visual{vis_path.suffix}"
    shutil.copy(vis_path, sample_path)


@pytest.mark.integration
def test_download_sentinel1_data():
    """Test downloading Sentinel-1 data."""
    from planetary_computer_mcp.tools.download_data import download_data

    # Small AOI for 10m resolution - ~1000x1000 pixels
    result = download_data(
        query="sentinel-1 radar",
        aoi=[-118.3, 34.0, -118.2, 34.1],  # 0.1 x 0.1 deg
        time_range="2024-06-01/2024-06-30",
        output_dir=tempfile.mkdtemp(),
    )

    # Check that files were created
    assert Path(result["raw"]).exists()
    assert Path(result["visualization"]).exists()
    assert result["collection"] == "sentinel-1-rtc"

    # Check metadata
    assert "bbox" in result["metadata"]
    assert result["metadata"]["collection"] == "sentinel-1-rtc"

    # Save visualization to samples
    vis_path = Path(result["visualization"])
    sample_path = Path("samples") / f"{result['collection']}-visual{vis_path.suffix}"
    shutil.copy(vis_path, sample_path)


@pytest.mark.integration
def test_download_naip_data():
    """Test downloading NAIP data."""
    from planetary_computer_mcp.tools.download_data import download_data

    # Denver area has 30cm NAIP from 2023
    # Small AOI: 0.005 deg ~ 500m ~ 1600 pixels at 30cm
    result = download_data(
        query="naip aerial imagery",
        aoi=[-104.995, 39.745, -104.99, 39.75],  # 0.005 x 0.005 deg Denver
        time_range="2023-01-01/2024-01-01",
        output_dir=tempfile.mkdtemp(),
    )

    # Check that files were created
    assert Path(result["raw"]).exists()
    assert Path(result["visualization"]).exists()
    assert result["collection"] == "naip"

    # Check metadata
    assert "bbox" in result["metadata"]
    assert result["metadata"]["collection"] == "naip"

    # Save visualization to samples
    vis_path = Path(result["visualization"])
    sample_path = Path("samples") / f"{result['collection']}-visual{vis_path.suffix}"
    shutil.copy(vis_path, sample_path)


@pytest.mark.integration
def test_download_esa_worldcover_data():
    """Test downloading ESA WorldCover data."""
    from planetary_computer_mcp.tools.download_data import download_data

    # Small AOI for 10m resolution
    result = download_data(
        query="land cover",
        aoi=[-118.3, 34.0, -118.2, 34.1],  # 0.1 x 0.1 deg
        output_dir=tempfile.mkdtemp(),
    )

    # Check that files were created
    assert Path(result["raw"]).exists()
    assert Path(result["visualization"]).exists()
    assert result["collection"] == "esa-worldcover"

    # Check metadata
    assert "bbox" in result["metadata"]
    assert result["metadata"]["collection"] == "esa-worldcover"

    # Save visualization to samples
    vis_path = Path(result["visualization"])
    sample_path = Path("samples") / f"{result['collection']}-visual{vis_path.suffix}"
    shutil.copy(vis_path, sample_path)


@pytest.mark.integration
def test_download_dem_data():
    """Test downloading DEM data."""
    from planetary_computer_mcp.tools.download_data import download_data

    # Small AOI for 30m resolution
    result = download_data(
        query="elevation dem",
        aoi=[-118.3, 34.0, -118.2, 34.1],  # 0.1 x 0.1 deg
        output_dir=tempfile.mkdtemp(),
    )

    # Check that files were created
    assert Path(result["raw"]).exists()
    assert Path(result["visualization"]).exists()
    assert result["collection"] == "cop-dem-glo-30"

    # Check metadata
    assert "bbox" in result["metadata"]
    assert result["metadata"]["collection"] == "cop-dem-glo-30"

    # Save visualization to samples
    vis_path = Path(result["visualization"])
    sample_path = Path("samples") / f"{result['collection']}-visual{vis_path.suffix}"
    shutil.copy(vis_path, sample_path)


@pytest.mark.integration
def test_download_landsat_data():
    """Test downloading Landsat data."""
    from planetary_computer_mcp.tools.download_data import download_data

    # Small AOI for 30m resolution - ~370x370 pixels
    result = download_data(
        query="landsat imagery",
        aoi=[-118.3, 34.0, -118.2, 34.1],  # 0.1 x 0.1 deg
        time_range="2024-07-01/2024-07-31",
        output_dir=tempfile.mkdtemp(),
    )

    # Check that files were created
    assert Path(result["raw"]).exists()
    assert Path(result["visualization"]).exists()
    assert result["collection"] == "landsat-c2-l2"

    # Check metadata
    assert "bbox" in result["metadata"]
    assert result["metadata"]["collection"] == "landsat-c2-l2"

    # Save visualization to samples
    vis_path = Path(result["visualization"])
    sample_path = Path("samples") / f"{result['collection']}-visual{vis_path.suffix}"
    shutil.copy(vis_path, sample_path)


@pytest.mark.integration
def test_download_ms_buildings():
    """Test downloading MS Buildings vector data."""
    from planetary_computer_mcp.tools.download_geometries import download_geometries

    # Small AOI in a dense urban area (Seattle downtown)
    # Should have plenty of building footprints
    result = download_geometries(
        collection="ms-buildings",
        aoi=[-122.345, 47.605, -122.335, 47.615],  # 0.01 x 0.01 deg Seattle
        output_dir=tempfile.mkdtemp(),
        limit=1000,
    )

    # Check that files were created
    raw_path = Path(result["raw"])
    vis_path = Path(result["visualization"])
    assert raw_path.exists()
    assert vis_path.exists()
    assert raw_path.stat().st_size > 0
    assert vis_path.stat().st_size > 0
    assert result["collection"] == "ms-buildings"

    # Check metadata
    assert "count" in result["metadata"]
    assert result["metadata"]["count"] > 0
    assert "bbox" in result["metadata"]

    # Save visualization to samples
    sample_path = Path("samples") / f"{result['collection']}-visual{vis_path.suffix}"
    shutil.copy(vis_path, sample_path)


@pytest.mark.integration
def test_download_gridmet_climate_data():
    """Test downloading GridMET climate data (Zarr-based)."""
    from planetary_computer_mcp.tools.download_data import download_data

    # Small AOI in California for GridMET (4km resolution, CONUS coverage)
    # GridMET has data from 1979-2020
    result = download_data(
        query="gridmet temperature",
        aoi=[-118.3, 34.0, -118.1, 34.2],  # 0.2 x 0.2 deg LA area
        time_range="2020-06-01/2020-06-07",  # One week in 2020
        output_dir=tempfile.mkdtemp(),
    )

    # Check that files were created
    raw_path = Path(result["raw"])
    vis_path = Path(result["visualization"])
    assert raw_path.exists()
    assert vis_path.exists()
    assert raw_path.stat().st_size > 0
    assert vis_path.stat().st_size > 0
    assert result["collection"] == "gridmet"

    # Check file extension (should be .nc for NetCDF)
    assert raw_path.suffix == ".nc"

    # Check metadata
    assert "variables" in result["metadata"]
    assert "time_range" in result["metadata"]
    assert result["metadata"]["collection"] == "gridmet"

    # Save visualization to samples
    sample_path = Path("samples") / f"{result['collection']}-visual{vis_path.suffix}"
    shutil.copy(vis_path, sample_path)


@pytest.mark.integration
def test_download_terraclimate_data():
    """Test downloading TerraClimate data (Zarr-based)."""
    from planetary_computer_mcp.tools.download_data import download_data

    # TerraClimate is global monthly climate data at ~4km resolution
    result = download_data(
        query="terraclimate",
        aoi=[-118.3, 34.0, -118.1, 34.2],  # 0.2 x 0.2 deg LA area
        time_range="2020-01-01/2020-03-31",  # 3 months in 2020
        output_dir=tempfile.mkdtemp(),
    )

    # Check that files were created
    raw_path = Path(result["raw"])
    vis_path = Path(result["visualization"])
    assert raw_path.exists()
    assert vis_path.exists()
    assert raw_path.stat().st_size > 0
    assert vis_path.stat().st_size > 0
    assert result["collection"] == "terraclimate"

    # Check file extension
    assert raw_path.suffix == ".nc"

    # Check metadata
    assert "variables" in result["metadata"]
    assert result["metadata"]["collection"] == "terraclimate"

    # Save visualization to samples
    sample_path = Path("samples") / f"{result['collection']}-visual{vis_path.suffix}"
    shutil.copy(vis_path, sample_path)
