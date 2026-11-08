#!/bin/sh
# What a cloud run of this project needs that the sandbox image lacks.
# zip: scripts/cloud-gateway-setup.mjs packs the cloud server with it, and a test runs that.
command -v zip >/dev/null 2>&1 || { sudo apt-get update -qq && sudo apt-get install -y -qq zip; }
# Xvfb and Electron's libraries: a cloud run can then start the real app under
# `xvfb-run` and watch it launch, screenshot itself and quit, which is how the
# Linux quit was measured (tests/a-quit-held-for-the-last-counts-still-ends-the-app).
# The image carries xvfb-run WITHOUT xauth or the GTK libraries, so asking for
# xvfb-run alone skipped the rest and Electron refused to start.
if ! command -v xauth >/dev/null 2>&1 || ! ldconfig -p 2>/dev/null | grep -q 'libgtk-3\.so\.0'; then
  sudo apt-get update -qq
  sudo apt-get install -y -qq xvfb xauth libgtk-3-0 libnss3 libasound2
fi
# ffmpeg: design rounds film a flow drawn over the real app, frame by frame.
command -v ffmpeg >/dev/null 2>&1 || { sudo apt-get update -qq && sudo apt-get install -y -qq ffmpeg; }
# python3-venv: the pre-push hook installs semgrep into a venv (scripts/security-scan-the-push.mjs).
python3 -c 'import ensurepip' >/dev/null 2>&1 || { sudo apt-get update -qq && sudo apt-get install -y -qq python3-venv; }
