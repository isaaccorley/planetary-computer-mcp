"""
UX tests for natural language query prompts.

Tests the end-to-end functionality and performance of various user prompts.
Each test times execution to establish performance baselines.

Run with: uv run pytest tests/test_prompts.py -v
"""

import tempfile
import time
from pathlib import Path

import pytest

# Mark all tests in this module as UX tests (excluded from CI)
pytestmark = pytest.mark.ux


# =============================================================================
# Optical Imagery Prompts
# =============================================================================


@pytest.mark.parametrize(
    ("query", "expected_collection"),
    [
        ("sentinel-2 imagery", "sentinel-2-l2a"),
        ("sentinel imagery of los angeles", "sentinel-2-l2a"),
        ("sentinel-2 data", "sentinel-2-l2a"),
        ("get me sentinel-2 for this area", "sentinel-2-l2a"),
    ],
)
def test_sentinel2_prompts(query: str, expected_collection: str) -> None:
    """Test Sentinel-2 natural language queries.

    Parameters
    ----------
    query : str
        Natural language query to test.
    expected_collection : str
        Expected STAC collection ID.
    """
    from planetary_computer_mcp.tools.download_data import download_data

    start = time.perf_counter()
    result = download_data(
        query=query,
        aoi=[-118.3, 34.0, -118.2, 34.1],
        time_range="2024-07-01/2024-07-31",
        output_dir=tempfile.mkdtemp(),
    )
    elapsed = time.perf_counter() - start

    assert result["collection"] == expected_collection
    assert Path(result["raw"]).exists()
    assert Path(result["visualization"]).exists()
    print(f"\n  Query: '{query}' -> {expected_collection} in {elapsed:.2f}s")


@pytest.mark.parametrize(
    ("query", "expected_collection"),
    [
        ("landsat imagery", "landsat-c2-l2"),
        ("landsat data", "landsat-c2-l2"),
        ("landsat-8 imagery", "landsat-c2-l2"),
    ],
)
def test_landsat_prompts(query: str, expected_collection: str) -> None:
    """Test Landsat natural language queries.

    Parameters
    ----------
    query : str
        Natural language query to test.
    expected_collection : str
        Expected STAC collection ID.
    """
    from planetary_computer_mcp.tools.download_data import download_data

    start = time.perf_counter()
    result = download_data(
        query=query,
        aoi=[-118.3, 34.0, -118.2, 34.1],
        time_range="2024-07-01/2024-07-31",
        output_dir=tempfile.mkdtemp(),
    )
    elapsed = time.perf_counter() - start

    assert result["collection"] == expected_collection
    assert Path(result["raw"]).exists()
    print(f"\n  Query: '{query}' -> {expected_collection} in {elapsed:.2f}s")


@pytest.mark.parametrize(
    ("query", "expected_collection"),
    [
        ("naip aerial photos", "naip"),
        ("aerial imagery", "naip"),
    ],
)
@pytest.mark.slow
def test_naip_prompts(query: str, expected_collection: str) -> None:
    """Test NAIP natural language queries (slow - ~40s each).

    Parameters
    ----------
    query : str
        Natural language query to test.
    expected_collection : str
        Expected STAC collection ID.
    """
    from planetary_computer_mcp.tools.download_data import download_data

    start = time.perf_counter()
    result = download_data(
        query=query,
        aoi=[-118.3, 34.0, -118.2, 34.1],
        time_range="2022-01-01/2022-12-31",
        output_dir=tempfile.mkdtemp(),
    )
    elapsed = time.perf_counter() - start

    assert result["collection"] == expected_collection
    assert Path(result["raw"]).exists()
    print(f"\n  Query: '{query}' -> {expected_collection} in {elapsed:.2f}s")


# =============================================================================
# SAR / Radar Prompts
# =============================================================================


@pytest.mark.parametrize(
    ("query", "expected_collection"),
    [
        ("sentinel-1 radar", "sentinel-1-rtc"),
        ("sar imagery", "sentinel-1-rtc"),
        ("radar data", "sentinel-1-rtc"),
        ("sentinel-1 data", "sentinel-1-rtc"),
    ],
)
def test_sar_prompts(query: str, expected_collection: str) -> None:
    """Test SAR/radar natural language queries.

    Parameters
    ----------
    query : str
        Natural language query to test.
    expected_collection : str
        Expected STAC collection ID.
    """
    from planetary_computer_mcp.tools.download_data import download_data

    start = time.perf_counter()
    result = download_data(
        query=query,
        aoi=[-118.3, 34.0, -118.2, 34.1],
        time_range="2024-07-01/2024-07-31",
        output_dir=tempfile.mkdtemp(),
    )
    elapsed = time.perf_counter() - start

    assert result["collection"] == expected_collection
    assert Path(result["raw"]).exists()
    print(f"\n  Query: '{query}' -> {expected_collection} in {elapsed:.2f}s")


# =============================================================================
# Elevation / DEM Prompts
# =============================================================================


@pytest.mark.parametrize(
    ("query", "expected_collection"),
    [
        ("elevation data", "cop-dem-glo-30"),
        ("dem", "cop-dem-glo-30"),
        ("digital elevation model", "cop-dem-glo-30"),
        ("terrain data", "cop-dem-glo-30"),
        ("copernicus dem", "cop-dem-glo-30"),
    ],
)
def test_dem_prompts(query: str, expected_collection: str) -> None:
    """Test DEM/elevation natural language queries.

    Parameters
    ----------
    query : str
        Natural language query to test.
    expected_collection : str
        Expected STAC collection ID.
    """
    from planetary_computer_mcp.tools.download_data import download_data

    start = time.perf_counter()
    result = download_data(
        query=query,
        aoi=[-118.3, 34.0, -118.2, 34.1],
        time_range="2021-01-01/2021-12-31",
        output_dir=tempfile.mkdtemp(),
    )
    elapsed = time.perf_counter() - start

    assert result["collection"] == expected_collection
    assert Path(result["raw"]).exists()
    print(f"\n  Query: '{query}' -> {expected_collection} in {elapsed:.2f}s")


# =============================================================================
# Land Cover Prompts
# =============================================================================


@pytest.mark.parametrize(
    ("query", "expected_collection"),
    [
        ("land cover", "esa-worldcover"),
        ("landcover classification", "esa-worldcover"),
        ("worldcover", "esa-worldcover"),
        ("esa worldcover", "esa-worldcover"),
    ],
)
def test_landcover_prompts(query: str, expected_collection: str) -> None:
    """Test land cover natural language queries.

    Parameters
    ----------
    query : str
        Natural language query to test.
    expected_collection : str
        Expected STAC collection ID.
    """
    from planetary_computer_mcp.tools.download_data import download_data

    start = time.perf_counter()
    result = download_data(
        query=query,
        aoi=[-118.3, 34.0, -118.2, 34.1],
        time_range="2021-01-01/2021-12-31",
        output_dir=tempfile.mkdtemp(),
    )
    elapsed = time.perf_counter() - start

    assert result["collection"] == expected_collection
    assert Path(result["raw"]).exists()
    print(f"\n  Query: '{query}' -> {expected_collection} in {elapsed:.2f}s")


@pytest.mark.parametrize(
    ("query", "expected_collection"),
    [
        ("lulc", "io-lulc-annual-v02"),
        ("land use", "io-lulc-annual-v02"),
        ("esri land use", "io-lulc-annual-v02"),
    ],
)
def test_lulc_prompts(query: str, expected_collection: str) -> None:
    """Test LULC natural language queries.

    Parameters
    ----------
    query : str
        Natural language query to test.
    expected_collection : str
        Expected STAC collection ID.
    """
    from planetary_computer_mcp.tools.download_data import download_data

    start = time.perf_counter()
    result = download_data(
        query=query,
        aoi=[-118.3, 34.0, -118.2, 34.1],
        time_range="2022-01-01/2022-12-31",
        output_dir=tempfile.mkdtemp(),
    )
    elapsed = time.perf_counter() - start

    assert result["collection"] == expected_collection
    assert Path(result["raw"]).exists()
    print(f"\n  Query: '{query}' -> {expected_collection} in {elapsed:.2f}s")


# =============================================================================
# Climate / Weather Prompts
# =============================================================================


@pytest.mark.parametrize(
    ("query", "expected_collection"),
    [
        ("gridmet climate data", "gridmet"),
        ("gridmet temperature", "gridmet"),
        ("climate data", "gridmet"),
        ("weather data", "gridmet"),
        ("temperature data", "gridmet"),
        ("precipitation data", "gridmet"),
    ],
)
def test_gridmet_prompts(query: str, expected_collection: str) -> None:
    """Test GridMET climate natural language queries.

    Parameters
    ----------
    query : str
        Natural language query to test.
    expected_collection : str
        Expected STAC collection ID.
    """
    from planetary_computer_mcp.tools.download_data import download_data

    start = time.perf_counter()
    result = download_data(
        query=query,
        aoi=[-118.3, 34.0, -118.2, 34.1],
        time_range="2020-06-01/2020-06-07",
        output_dir=tempfile.mkdtemp(),
    )
    elapsed = time.perf_counter() - start

    assert result["collection"] == expected_collection
    assert Path(result["raw"]).exists()
    print(f"\n  Query: '{query}' -> {expected_collection} in {elapsed:.2f}s")


@pytest.mark.parametrize(
    ("query", "expected_collection"),
    [
        ("terraclimate", "terraclimate"),
        ("terraclimate monthly", "terraclimate"),
    ],
)
def test_terraclimate_prompts(query: str, expected_collection: str) -> None:
    """Test TerraClimate natural language queries.

    Parameters
    ----------
    query : str
        Natural language query to test.
    expected_collection : str
        Expected STAC collection ID.
    """
    from planetary_computer_mcp.tools.download_data import download_data

    start = time.perf_counter()
    result = download_data(
        query=query,
        aoi=[-118.3, 34.0, -118.2, 34.1],
        time_range="2020-01-01/2020-03-31",
        output_dir=tempfile.mkdtemp(),
    )
    elapsed = time.perf_counter() - start

    assert result["collection"] == expected_collection
    assert Path(result["raw"]).exists()
    print(f"\n  Query: '{query}' -> {expected_collection} in {elapsed:.2f}s")


# =============================================================================
# Vector / Building Footprint Prompts
# =============================================================================


@pytest.mark.parametrize(
    ("query", "expected_collection"),
    [
        ("building footprints", "ms-buildings"),
        ("buildings", "ms-buildings"),
        ("microsoft buildings", "ms-buildings"),
    ],
)
def test_buildings_query_detection(query: str, expected_collection: str) -> None:
    """Test MS Buildings query detection (collection detection only).

    Parameters
    ----------
    query : str
        Natural language query to test.
    expected_collection : str
        Expected STAC collection ID.
    """
    from planetary_computer_mcp.core.collections import detect_collection_from_query

    start = time.perf_counter()
    collection = detect_collection_from_query(query)
    elapsed = time.perf_counter() - start

    assert collection == expected_collection
    print(f"\n  Query: '{query}' -> {expected_collection} in {elapsed * 1000:.2f}ms")


def test_buildings_download():
    """Test MS Buildings download (uses collection ID directly)."""
    from planetary_computer_mcp.tools.download_geometries import download_geometries

    start = time.perf_counter()
    result = download_geometries(
        collection="ms-buildings",
        aoi=[-122.35, 47.62, -122.34, 47.63],  # Seattle downtown
        output_dir=tempfile.mkdtemp(),
    )
    elapsed = time.perf_counter() - start

    assert result["collection"] == "ms-buildings"
    assert Path(result["raw"]).exists()
    print(f"\n  Buildings download completed in {elapsed:.2f}s")


# =============================================================================
# Place Name Geocoding Prompts
# =============================================================================


@pytest.mark.parametrize(
    "place_name",
    [
        # Use specific smaller locations that geocode to <1000 km²
        "Golden Gate Park, San Francisco",
        "Manhattan, NY",
        "Eiffel Tower, Paris",
        "Hyde Park, London",
        "Shibuya, Tokyo",
    ],
)
def test_geocoding_prompts(place_name: str) -> None:
    """Test place name geocoding in queries.

    Parameters
    ----------
    place_name : str
        Place name to geocode.
    """
    from planetary_computer_mcp.tools.download_data import download_data

    start = time.perf_counter()
    result = download_data(
        query="sentinel-2 imagery",
        aoi=place_name,
        time_range="2024-06-01/2024-08-31",  # Wider time range for better data availability
        output_dir=tempfile.mkdtemp(),
        max_cloud_cover=50,  # Higher cloud cover tolerance
    )
    elapsed = time.perf_counter() - start

    assert result["collection"] == "sentinel-2-l2a"
    assert Path(result["raw"]).exists()
    assert "bbox" in result["metadata"]
    print(f"\n  Place: '{place_name}' geocoded in {elapsed:.2f}s")


# =============================================================================
# Ambiguous Query Error Handling
# =============================================================================


@pytest.mark.parametrize(
    "query",
    [
        "satellite imagery",
        "imagery",
        "satellite data",
        "remote sensing data",
    ],
)
def test_ambiguous_queries_raise_error(query: str) -> None:
    """Test that ambiguous queries raise helpful errors.

    Parameters
    ----------
    query : str
        Ambiguous query that should raise an error.
    """
    from planetary_computer_mcp.core.collections import (
        AmbiguousCollectionError,
        detect_collection_from_query,
    )

    start = time.perf_counter()
    with pytest.raises(AmbiguousCollectionError) as exc_info:
        detect_collection_from_query(query)
    elapsed = time.perf_counter() - start

    # Should have suggestions
    assert len(exc_info.value.suggestions) > 0
    print(f"\n  Query: '{query}' raised AmbiguousCollectionError in {elapsed:.4f}s")
    print(f"  Suggestions: {[s['collection'] for s in exc_info.value.suggestions]}")


@pytest.mark.parametrize(
    "query",
    [
        "random nonsense data",
        "xyz123",
        "foobar qux",
    ],
)
def test_unknown_queries_raise_error(query: str) -> None:
    """Test that unknown queries raise helpful errors.

    Parameters
    ----------
    query : str
        Unknown query that should raise an error.
    """
    from planetary_computer_mcp.core.collections import (
        NoCollectionMatchError,
        detect_collection_from_query,
    )

    start = time.perf_counter()
    with pytest.raises(NoCollectionMatchError) as exc_info:
        detect_collection_from_query(query)
    elapsed = time.perf_counter() - start

    # Should have available categories
    assert len(exc_info.value.available_categories) > 0
    print(f"\n  Query: '{query}' raised NoCollectionMatchError in {elapsed:.4f}s")


# =============================================================================
# Performance Baseline Tests
# =============================================================================


def test_collection_detection_speed():
    """Benchmark collection detection speed across all query types."""
    from planetary_computer_mcp.core.collections import detect_collection_from_query

    queries = [
        "sentinel-2 imagery",
        "landsat data",
        "naip aerial",
        "radar sar",
        "elevation dem",
        "land cover",
        "gridmet climate",
        "terraclimate",
        "buildings",
    ]

    times = []
    for query in queries:
        start = time.perf_counter()
        detect_collection_from_query(query)
        elapsed = time.perf_counter() - start
        times.append((query, elapsed))

    print("\n  Collection Detection Benchmark:")
    print("  " + "-" * 50)
    for query, elapsed in times:
        print(f"  {query:<30} {elapsed * 1000:.3f}ms")
    print("  " + "-" * 50)
    avg_ms = sum(t for _, t in times) / len(times) * 1000
    print(f"  Average: {avg_ms:.3f}ms")

    # All detections should be < 10ms
    for query, elapsed in times:
        assert elapsed < 0.01, f"Detection for '{query}' took {elapsed * 1000:.1f}ms (>10ms)"


def test_download_timing_summary():
    """Summary test that downloads one of each type and reports timing."""
    from planetary_computer_mcp.tools.download_data import download_data
    from planetary_computer_mcp.tools.download_geometries import download_geometries

    results = []

    # Raster - Sentinel-2
    start = time.perf_counter()
    download_data(
        query="sentinel-2",
        aoi=[-118.3, 34.0, -118.2, 34.1],
        time_range="2024-07-01/2024-07-31",
        output_dir=tempfile.mkdtemp(),
    )
    results.append(("Sentinel-2 (raster)", time.perf_counter() - start))

    # Raster - DEM
    start = time.perf_counter()
    download_data(
        query="dem",
        aoi=[-118.3, 34.0, -118.2, 34.1],
        time_range="2021-01-01/2021-12-31",
        output_dir=tempfile.mkdtemp(),
    )
    results.append(("DEM (raster)", time.perf_counter() - start))

    # Zarr - GridMET
    start = time.perf_counter()
    download_data(
        query="gridmet",
        aoi=[-118.3, 34.0, -118.2, 34.1],
        time_range="2020-06-01/2020-06-07",
        output_dir=tempfile.mkdtemp(),
    )
    results.append(("GridMET (zarr)", time.perf_counter() - start))

    # Vector - Buildings (uses collection ID directly)
    start = time.perf_counter()
    download_geometries(
        collection="ms-buildings",
        aoi=[-122.35, 47.62, -122.34, 47.63],
        output_dir=tempfile.mkdtemp(),
    )
    results.append(("Buildings (vector)", time.perf_counter() - start))

    print("\n  Download Timing Summary:")
    print("  " + "=" * 50)
    for name, elapsed in results:
        print(f"  {name:<25} {elapsed:.2f}s")
    print("  " + "=" * 50)
    total = sum(t for _, t in results)
    print(f"  Total: {total:.2f}s")
