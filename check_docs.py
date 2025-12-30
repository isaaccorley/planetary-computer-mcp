#!/usr/bin/env python3
import os
import ast
from numpydoc.validate import validate

errors = []
for root, dirs, files in os.walk("src/planetary_computer_mcp"):
    dirs[:] = [d for d in dirs if not d.startswith(".")]
    for file in files:
        if file.endswith(".py"):
            filepath = os.path.join(root, file)
            try:
                file_errors = validate(filepath, config_file=".numpydoc_validation.yaml")[1]
                errors.extend(file_errors)
            except Exception as e:
                print(f"Error validating {filepath}: {e}")

for error in errors[:50]:  # Show first 50 errors
    print(f"{error[0]}: {error[1]}")
