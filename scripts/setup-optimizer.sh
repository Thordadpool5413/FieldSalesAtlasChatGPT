#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
python3 -m venv .venv
.venv/bin/python -m pip install --disable-pip-version-check -r artifacts/api-server/src/field-atlas/services/optimizer/requirements.lock.txt
.venv/bin/python -c 'from ortools.constraint_solver import pywrapcp; print("Travel optimizer ready")'
