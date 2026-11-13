#!/bin/sh
# What making an outreach film needs on a machine, installed only when missing.
# Safe to run again. On a Mac with Homebrew it installs ffmpeg the same way.
#   - Apple's SF Pro and SF Mono, from Apple's own download, so the app and
#     the ⌘-Tab switcher draw in the Mac's font (Linux only; a Mac has them)
#   - ffmpeg, Python's numpy, Pillow and OpenCV, and Playwright's Chromium
#   - the repo's packages, which the film builds the app's screen from
set -e
cd "$(dirname "$0")/../.."
if [ "$(uname)" = "Linux" ] && ! fc-list | grep -q "SF Pro Text"; then
  sudo apt-get update -qq && sudo apt-get install -y -qq p7zip-full cpio fontconfig
  t=$(mktemp -d)
  for f in SF-Pro SF-Mono; do
    curl -sL --max-time 300 -o "$t/$f.dmg" "https://devimages-cdn.apple.com/design/resources/download/$f.dmg"
    (cd "$t" && mkdir -p "$f" && cd "$f" && 7z x -y "../$f.dmg" >/dev/null)
  done
  find "$t" -name "*.pkg" -type f | while read -r p; do (cd "$(dirname "$p")" && 7z x -y "$p" >/dev/null); done
  find "$t" -name "Payload~" | while read -r p; do (cd "$(dirname "$p")" && cpio -idm < "$p" 2>/dev/null || true); done
  mkdir -p "$HOME/.fonts"
  find "$t" \( -name "SF-Pro-Text-*.otf" -o -name "SF-Pro-Display-*.otf" -o -name "SF-Pro.ttf" -o -name "SF-Mono-*.otf" \) -exec cp {} "$HOME/.fonts/" \;
  rm -rf "$t"
  mkdir -p "$HOME/.config/fontconfig"
  cat > "$HOME/.config/fontconfig/fonts.conf" <<'EOF'
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <alias><family>sans-serif</family><prefer><family>SF Pro Text</family></prefer></alias>
  <alias><family>system-ui</family><prefer><family>SF Pro Text</family></prefer></alias>
  <alias><family>-apple-system</family><prefer><family>SF Pro Text</family></prefer></alias>
  <alias><family>BlinkMacSystemFont</family><prefer><family>SF Pro Text</family></prefer></alias>
  <alias><family>monospace</family><prefer><family>SF Mono</family></prefer></alias>
</fontconfig>
EOF
  fc-cache -f >/dev/null
fi
command -v ffmpeg >/dev/null 2>&1 || { if command -v brew >/dev/null 2>&1; then brew install ffmpeg; else sudo apt-get update -qq && sudo apt-get install -y -qq ffmpeg; fi; }
python3 -c "import numpy, PIL, cv2" 2>/dev/null || python3 -m pip install --user -q numpy pillow opencv-python-headless
node -e "require('playwright')" 2>/dev/null || node -e "require('playwright-core')" 2>/dev/null || [ -x /opt/agentbox/chromium.sh ] || { npm i -g playwright && npx playwright install chromium; }
[ -d node_modules/vite ] || npm ci --ignore-scripts
echo "ready"
