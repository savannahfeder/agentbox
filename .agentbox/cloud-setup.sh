#!/bin/sh
# Programs the launch-film work needs on a cloud run (video frames, the mix, mockup text).
command -v ffmpeg >/dev/null 2>&1 || { sudo apt-get update -qq && sudo apt-get install -y -qq ffmpeg fonts-inter; }
