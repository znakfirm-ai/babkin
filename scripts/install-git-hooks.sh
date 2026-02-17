#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOK_PATH="$ROOT_DIR/.git/hooks/pre-push"

cat > "$HOOK_PATH" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."/frontend
npm run build
EOF

chmod +x "$HOOK_PATH"

echo "pre-push hook installed. Push will be blocked if frontend build fails."
