# Personalised outreach replay

Record the approved app sequence once with `recordTemplate` from
`lib/outreach-record.mjs`. Keep the template directory, demo app build,
voice and face cut, masks and sounds with the private outreach assets.
None of those belongs in this public repository.

Each lead supplies the existing `film.json`, homepage, logo and headline
image. Rendering replays saved DOM states and camera positions without
driving the app again. It uses no model. The brief and headline checks
still run before rendering.

For a queue, `targets.json` holds `{slug, input, output}` entries. `input`
is the film JSON path and `output` is the next version's MP4 filename.
The batch command renders one lead at a time, overlays the retained voice
and face, checks every frame and the ending audio, and saves review stills.
Failed exports never replace finished files.

```
node scripts/outreach-batch.mjs TEMPLATE targets.json APP_DIST face.mp4 MASKS SOUNDS OUTPUT
```

Set `OUTREACH_PYTHON` to the Python interpreter with NumPy installed.
Set `OUTREACH_COMPOSITOR_PYTHON` if OpenCV is in a different interpreter.
The batch caches app screenshots at the approved recording's resolution,
then composites the pointer and camera. Scroll positions and hover changes
invalidate the cache. No live app actions run during a lead's render.

```
node --experimental-strip-types scripts/outreach-render.mjs TEMPLATE film.json screen.mp4 APP_DIST
python3 scripts/outreach-sounds.py TEMPLATE/manifest.json SOUNDS sfx.wav
python3 scripts/outreach-overlay.py screen.mp4 sfx.wav face.mp4 MASKS final.mp4 97.1
python3 scripts/outreach-check.py final.mp4 face.mp4 REVIEW_DIRECTORY
```

Use `PLAYWRIGHT_MODULE` to point to an installed Playwright module if it
is not in this checkout. Images use the paths in `film.json`, falling back
to its directory when an old machine's path no longer exists. A corrected
headline image needs its explicit path in the JSON.

For a review frame, append `--at 7` to the renderer command and use a
`.jpg` output. Review the opening, Home, Team, code, headlines, teammate
reply and ending at full window size before approving an export.

`outreach-prepare.mjs RAW_TEMPLATE TEMPLATE` bridges holds up to 300 ms only
when the content and scroll positions are unchanged. It keeps their times
in the manifest. The renderer rejects capture gaps over 150 ms and a homepage or switcher
remaining after 5.4 seconds. Pointer positions interpolate between samples.
Missing or ambiguous company fields fail the render.
Encoders use two threads. Speech must continue through the end of
“questions”, around 96.3 seconds. Scan completed exports for transient
flashes, inspect logos on the sidebar, and keep all films unsent until
approved.
