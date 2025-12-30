#!/usr/bin/env python3
import ast
import os
import sys


def has_docstring(node):
    """Check if a function node has a docstring."""
    return ast.get_docstring(node) is not None


def find_functions_without_docstrings(filepath):
    """Find all functions without docstrings in a file."""
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    try:
        tree = ast.parse(content, filepath)
    except SyntaxError:
        return []

    functions_without_docs = []

    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name != "__init__":
            if not has_docstring(node):
                functions_without_docs.append(node.name)

    return functions_without_docs


def main():
    base_path = "src/planetary_computer_mcp"
    total_functions = 0
    functions_without_docs = 0

    for root, dirs, files in os.walk(base_path):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for file in files:
            if file.endswith(".py"):
                filepath = os.path.join(root, file)
                funcs = find_functions_without_docstrings(filepath)
                if funcs:
                    print(
                        f"{filepath}: {len(funcs)} functions without docstrings: {', '.join(funcs[:5])}"
                    )
                    if len(funcs) > 5:
                        print(f"  ... and {len(funcs) - 5} more")
                    functions_without_docs += len(funcs)
                total_functions += len(funcs)

    print(f"\nTotal: {functions_without_docs}/{total_functions} functions missing docstrings")


if __name__ == "__main__":
    main()
