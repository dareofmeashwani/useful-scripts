#!/usr/bin/env bash
# Convenience wrapper – delegates to the Makefile.
set -euo pipefail
cd "$(dirname "$0")"
make bundle
