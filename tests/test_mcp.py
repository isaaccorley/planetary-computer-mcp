"""
Basic MCP server integration tests using stdio protocol.

These tests verify the full MCP tool call flow for download_data and download_geometries.
"""

import json
import subprocess
import tempfile
import time
from pathlib import Path

import pytest


@pytest.mark.integration
@pytest.mark.slow  # Downloads ~91MB parquet file, takes 15-25s
def test_mcp_download_data_tool():
    """Test MCP server download_data tool call with sentinel-2 imagery."""
    # Start server process with stdio
    proc = subprocess.Popen(
        ["uv", "run", "python", "-m", "planetary_computer_mcp.server"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,  # Line buffered
    )

    try:
        # Give server time to start
        time.sleep(2)

        # Send initialize message
        init_msg = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "test-client", "version": "1.0.0"},
            },
        }
        proc.stdin.write(json.dumps(init_msg) + "\n")
        proc.stdin.flush()

        # Read initialize response
        response_line = proc.stdout.readline().strip()
        if not response_line:
            stderr = proc.stderr.read()
            pytest.fail(f"Server failed to respond to initialize. stderr: {stderr}")

        init_response = json.loads(response_line)
        assert init_response["id"] == 1
        assert "result" in init_response
        # Tools are listed via tools/list, not in initialize response

        # Send initialized notification
        initialized_msg = {"jsonrpc": "2.0", "method": "notifications/initialized"}
        proc.stdin.write(json.dumps(initialized_msg) + "\n")
        proc.stdin.flush()

        # Send tools/list to get available tools
        tools_list_msg = {"jsonrpc": "2.0", "id": 3, "method": "tools/list"}
        proc.stdin.write(json.dumps(tools_list_msg) + "\n")
        proc.stdin.flush()

        # Read tools/list response
        response_line = proc.stdout.readline().strip()
        if not response_line:
            stderr = proc.stderr.read()
            pytest.fail(f"Server failed to respond to tools/list. stderr: {stderr}")

        tools_response = json.loads(response_line)
        assert tools_response["id"] == 3
        assert "result" in tools_response
        assert "tools" in tools_response["result"]

        # Verify download_data tool is available
        tools = tools_response["result"]["tools"]
        tool_names = [tool["name"] for tool in tools]
        assert "download_data_tool" in tool_names

        # Send tool call for download_data
        temp_dir = tempfile.mkdtemp()
        tool_call_msg = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {
                "name": "download_data_tool",
                "arguments": {
                    "query": "sentinel-2 imagery",
                    "aoi": [-118.3, 34.0, -118.2, 34.1],
                    "time_range": "2024-07-01/2024-07-31",
                    "output_dir": temp_dir,
                },
            },
        }
        proc.stdin.write(json.dumps(tool_call_msg) + "\n")
        proc.stdin.flush()

        # Read tool call response (with timeout for slow operation)
        import select

        # Wait up to 60 seconds for response (MS Buildings download can take 15-25s)
        timeout = 60
        start_time = time.time()
        response_line = None

        while time.time() - start_time < timeout:
            # Check if data is available
            ready, _, _ = select.select([proc.stdout], [], [], 1.0)
            if ready:
                response_line = proc.stdout.readline().strip()
                if response_line:
                    break

        if not response_line:
            stderr = proc.stderr.read()
            pytest.fail(
                f"Server failed to respond to tool call within {timeout}s. stderr: {stderr}"
            )

        tool_response = json.loads(response_line)
        assert tool_response["id"] == 2
        assert "result" in tool_response

        # Check tool result structure
        result = tool_response["result"]
        assert "content" in result
        assert len(result["content"]) > 0
        text_content = result["content"][0]["text"]

        # Parse the text for paths
        lines = text_content.split("\n")
        raw_line = next(line for line in lines if line.startswith("Raw data:"))
        vis_line = next(line for line in lines if line.startswith("Visualization:"))
        collection_line = next(line for line in lines if line.startswith("Collection:"))

        raw_path = raw_line.split(": ")[1]
        vis_path = vis_line.split(": ")[1]
        collection = collection_line.split(": ")[1]

        # Verify files were created
        assert Path(raw_path).exists()
        assert Path(vis_path).exists()
        assert collection == "sentinel-2-l2a"

    finally:
        # Clean up
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


@pytest.mark.integration
@pytest.mark.slow  # Downloads ~91MB parquet file, takes 15-25s
def test_mcp_download_geometries_tool():
    """Test MCP server download_geometries tool call with MS Buildings."""
    # Start server process with stdio
    proc = subprocess.Popen(
        ["uv", "run", "python", "-m", "planetary_computer_mcp.server"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,  # Line buffered
    )

    try:
        # Give server time to start
        time.sleep(2)

        # Send initialize message
        init_msg = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "test-client", "version": "1.0.0"},
            },
        }
        proc.stdin.write(json.dumps(init_msg) + "\n")
        proc.stdin.flush()

        # Read initialize response
        response_line = proc.stdout.readline().strip()
        if not response_line:
            stderr = proc.stderr.read()
            pytest.fail(f"Server failed to respond to initialize. stderr: {stderr}")

        init_response = json.loads(response_line)
        assert init_response["id"] == 1
        assert "result" in init_response
        # Tools are listed via tools/list, not in initialize response

        # Send initialized notification
        initialized_msg = {"jsonrpc": "2.0", "method": "notifications/initialized"}
        proc.stdin.write(json.dumps(initialized_msg) + "\n")
        proc.stdin.flush()

        # Send tools/list to get available tools
        tools_list_msg = {"jsonrpc": "2.0", "id": 3, "method": "tools/list"}
        proc.stdin.write(json.dumps(tools_list_msg) + "\n")
        proc.stdin.flush()

        # Read tools/list response
        response_line = proc.stdout.readline().strip()
        if not response_line:
            stderr = proc.stderr.read()
            pytest.fail(f"Server failed to respond to tools/list. stderr: {stderr}")

        tools_response = json.loads(response_line)
        assert tools_response["id"] == 3
        assert "result" in tools_response
        assert "tools" in tools_response["result"]

        # Verify download_geometries tool is available
        tools = tools_response["result"]["tools"]
        tool_names = [tool["name"] for tool in tools]
        assert "download_geometries_tool" in tool_names

        # Send tool call for download_geometries
        # Use a small AOI (~0.01 deg) to keep test fast - still downloads full quadkey partition
        # but filters to a small area
        temp_dir = tempfile.mkdtemp()
        tool_call_msg = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {
                "name": "download_geometries_tool",
                "arguments": {
                    "collection": "ms-buildings",
                    "aoi": [-118.25, 34.04, -118.24, 34.05],  # Small LA area (~1km x 1km)
                    "output_dir": temp_dir,
                },
            },
        }
        proc.stdin.write(json.dumps(tool_call_msg) + "\n")
        proc.stdin.flush()

        # Read tool call response (with timeout for slow operation)
        import select

        # Wait up to 60 seconds for response (MS Buildings download can take 15-25s)
        timeout = 60
        start_time = time.time()
        response_line = None

        while time.time() - start_time < timeout:
            # Check if data is available
            ready, _, _ = select.select([proc.stdout], [], [], 1.0)
            if ready:
                response_line = proc.stdout.readline().strip()
                if response_line:
                    break

        if not response_line:
            stderr = proc.stderr.read()
            pytest.fail(
                f"Server failed to respond to tool call within {timeout}s. stderr: {stderr}"
            )

        tool_response = json.loads(response_line)
        assert tool_response["id"] == 2
        assert "result" in tool_response

        # Check tool result structure
        result = tool_response["result"]
        assert "content" in result
        assert len(result["content"]) > 0
        text_content = result["content"][0]["text"]

        print(f"DEBUG: MCP response:\n{text_content[:500]}...")  # Debug first 500 chars

        # Parse the text for paths
        lines = text_content.split("\n")
        raw_line = next(line for line in lines if line.startswith("Raw data:"))
        vis_line = next(line for line in lines if line.startswith("Visualization:"))
        count_line = next(line for line in lines if line.startswith("Count:"))

        raw_path = raw_line.split(": ")[1]
        vis_path = vis_line.split(": ")[1]
        count = int(count_line.split(": ")[1])

        # Verify files were created
        assert Path(raw_path).exists()
        assert Path(vis_path).exists()
        assert count > 0  # Should have found some buildings

        # Verify parquet can be read with geopandas
        import geopandas as gpd

        gdf = gpd.read_parquet(raw_path)
        assert len(gdf) == count
        assert gdf.crs == "EPSG:4326"
        assert "geometry" in gdf.columns
        assert len(gdf) > 0  # Should have geometries

    finally:
        # Clean up
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
