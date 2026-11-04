# Rizhu – Pixel Patch Builder

Draw an LED pixel layout, get every pixel addressed automatically, and export a
CSV fixture list you can import straight into **MADRIX 5**. Patching that
normally takes hours by hand takes a few minutes.

Made by [Rizhu](https://rizhu.netlify.app/) · **Live: https://rizhu-pixel.netlify.app/**

## Why

Patching big pixel installs by hand (facades, LED walls, ceilings) is slow and
easy to get wrong: one wrong address shifts every pixel after it, and snake
wiring and universe splits make it worse. Rizhu does the layout and the maths,
and MADRIX imports the result.

## Features

- **Draw the layout** – grids, strips and rings. Drag pixels to move an element,
  pinch or scroll to zoom, Undo / Redo (Ctrl+Z / Ctrl+Shift+Z),
  arrow keys to nudge (Shift = 10).
- **Wiring options** – start corner, along rows or columns, snake/zig-zag.
- **Auto-addressing** – RGB / RGBW / single / 5-channel pixels, max pixels per
  universe, first universe (0 or 1), "start on new universe" or "new controller
  port" per element.
- **Live checks** – overlapping pixels, negative coordinates, sACN universe limit.
- **Colour per universe** in the preview, wiring path and start markers, hover
  any pixel to see its universe, channel, controller and port.
- **Background image** – trace over a photo or plan of the building.
- **Wiring sheet** – per element start/end universe, channel and controller/port,
  as CSV or printable page for the installer.
- **Export** – MADRIX CSV fixture list (comma, semicolon or tab separated).
- **Save / open** projects as `.rizhu.json`; autosaves in the browser.
- No install, no account, works offline, runs on Windows, macOS, Linux and phones.

## Use it

Open `index.html` in a browser – that's it, no build step.

Or serve the folder locally:

```bash
npx serve .
```

## Hosting (Netlify)

`netlify.toml` holds all settings (no build step, publish the repo root,
security headers, always-fresh caching). In Netlify: **Add new site → Import an
existing project → GitHub → pixel-patch-builder → Deploy**. Every push to
`main` redeploys automatically.

## Import into MADRIX 5

1. Patch Editor → **File → Import Fixture List…**
2. Choose the exported CSV, tick **Use Header Line** (1 line) and choose the same
   separator you exported with.
3. Assign the columns: **Position X / Y / Z**, **DMX Universe**, **DMX Channel**,
   and pick a matching pixel fixture from the MADRIX fixture library.
4. Finish.

CSV columns: `Fixture ID, Fixture Name, Display Name, Position X, Position Y,
Position Z, DMX Universe, DMX Channel, Channel Count, Group, Controller, Port`.

> The import wizard lets you map columns yourself, so the exact header names are
> not critical. If you have MADRIX 5, exporting a small fixture list from its
> Patch Editor and comparing headers helps make the import fully one-click.

## Development

```
index.html        page layout
src/core.js       layout generation, addressing, validation, CSV (no DOM, unit tested)
src/app.js        UI: forms, canvas preview, drag/zoom, import/export
src/styles.css    styles (light + dark)
tests/            node:test unit tests
```

Run tests (Node 18+):

```bash
npm test
```

## Roadmap

1. **Now** – patch builder + MADRIX CSV export.
2. **Next** – camera auto-mapping (film the pixels, detect positions), more shapes
   (polyline, arc, imported SVG paths), exports for other software.
3. **Later** – desktop app (Tauri) with live Art-Net / sACN output, network
   discovery and output health monitor.
