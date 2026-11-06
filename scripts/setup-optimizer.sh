#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
python3 -m venv .venv
# Replit can default pip to --user, which is incompatible with a virtualenv.
# Override only the install destination; retain indexes, proxies and CA trust.
PIP_USER=false .venv/bin/python -m pip install --no-user --disable-pip-version-check -r artifacts/api-server/src/field-atlas/services/optimizer/requirements.lock.txt
.venv/bin/python -c 'from ortools.constraint_solver import pywrapcp; print("Travel optimizer ready")'
