#!/usr/bin/env bash
# Regenerate docs/img/print_loop.gif by recording print_loop.py with
# asciinema and rendering the cast through agg.
#
# Requires:
#   asciinema  -> sudo apt install asciinema
#   agg        -> https://github.com/asciinema/agg/releases/latest
#                 (drop the musl binary at ~/.local/bin/agg, chmod +x)
#
# Run from anywhere; paths are anchored to the script's location.
# After this script finishes:
#   uv run pytest tests/test_samples.py::test_sample_code_to_gif
# regenerates docs/img/code-to-gif.gif from the new print_loop.gif.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
SCRIPT="$HERE/print_loop.py"
CAST="$HERE/print_loop.cast"
GIF="$REPO_ROOT/docs/img/print_loop.gif"

for tool in asciinema agg python; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        echo "Missing required tool: $tool" >&2
        exit 1
    fi
done

asciinema rec --overwrite -c "python $SCRIPT" "$CAST"
agg --font-size 18 "$CAST" "$GIF"

echo
echo "Wrote $CAST"
echo "Wrote $GIF"
echo "Next: uv run pytest tests/test_samples.py::test_sample_code_to_gif"
