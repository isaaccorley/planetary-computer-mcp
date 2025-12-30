"""
Test configuration and fixtures.

Note: The RuntimeError "Loop is not running" tracebacks that appear after tests
finish are harmless cleanup warnings from fsspec's async I/O operations. They
occur when pytest exits and async event loops are forcibly cleaned up during
garbage collection. The tests themselves pass successfully.
"""
