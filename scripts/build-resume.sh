#!/usr/bin/env bash
# Regenerate Vinay_Nair_Resume.pdf from vinay/resume.html.
# The HTML is the single source of truth; both served copies of the PDF
# (repo root for legacy vawsome.com links, vinay/ for vinay.vawsome.com)
# are build artifacts of this script.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO/vinay/resume.html"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
TMP_PDF="$(mktemp -d)/resume.pdf"

[[ -f "$SRC" ]] || { echo "source not found: $SRC" >&2; exit 1; }
[[ -x "$CHROME" ]] || { echo "Google Chrome not found at: $CHROME" >&2; exit 1; }

"$CHROME" --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$TMP_PDF" "file://$SRC"

cp -f "$TMP_PDF" "$REPO/Vinay_Nair_Resume.pdf"
cp -f "$TMP_PDF" "$REPO/vinay/Vinay_Nair_Resume.pdf"

echo "Rebuilt from $SRC:"
echo "  $REPO/Vinay_Nair_Resume.pdf"
echo "  $REPO/vinay/Vinay_Nair_Resume.pdf"
