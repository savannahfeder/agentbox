#!/bin/sh
# What a cloud run of this project needs that the sandbox image lacks.
# zip: scripts/cloud-gateway-setup.mjs packs the cloud server with it, and a test runs that.
command -v zip >/dev/null 2>&1 || { sudo apt-get update -qq && sudo apt-get install -y -qq zip; }
# ffmpeg: the personalized outreach videos are cut and encoded with it.
command -v ffmpeg >/dev/null 2>&1 || { sudo apt-get update -qq && sudo apt-get install -y -qq ffmpeg; }
# Inter stands in for the Mac's system font in those videos, and DejaVu Sans
# Mono carries the symbols Claude Code draws in a terminal.
fc-list | grep -q "Inter" || { sudo apt-get update -qq && sudo apt-get install -y -qq fonts-inter fonts-dejavu-core; }
# Xvfb and Electron's libraries: a cloud run can then start the real app under
# `xvfb-run` and watch it launch, screenshot itself and quit, which is how the
# Linux quit was measured (tests/a-quit-held-for-the-last-counts-still-ends-the-app).
command -v xvfb-run >/dev/null 2>&1 || {
  sudo apt-get update -qq
  sudo apt-get install -y -qq xvfb xauth libgtk-3-0 libnss3 libasound2
}
