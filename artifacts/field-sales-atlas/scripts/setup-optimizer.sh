#!/usr/bin/env bash
set -eu
python3 -m venv .venv
.venv/bin/python -m pip install --disable-pip-version-check -r services/optimizer/requirements.lock.txt
.venv/bin/python -c 'from ortools.constraint_solver import pywrapcp; print("Travel optimizer ready")'
