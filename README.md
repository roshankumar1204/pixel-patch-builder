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

**Shapes**
- **Grid** – LED matrix / panel, any start corner, rows or columns, snake wiring.
- **Strip** – straight line of pixels.
- **Ring / Arc** – full ring or partial arc (Sweep °).
- **Frame** – outline of a window, door or panel, clockwise or anticlockwise.
- **Text** – two fonts: **5×7 dots** for LED matrices / pixel signs, and a
  **single-line font** (Hershey) for letters built from LED strip or neon flex.
- **Draw path** – click points on the canvas to trace any shape (building edges,
  curves, outlines). Drag the square handles to adjust, Alt-click to remove a point.

**Import**
- **Image → pixels** – a logo or picture becomes a filled pixel layout
  (transparent PNGs use the shape, other images use the dark parts; Invert swaps).
- **SVG outline** – logos and CAD drawings become LED paths (curves, circles,
  polygons, group transforms supported).
- **Points CSV** – LED positions from MariMapper or any other mapping tool
  (`x,y` / `x,y,z` / `index,x,y,z`, with or without a header).

**For every shape**
- **Rotate**, and **Repeat** it into N columns × M rows (e.g. 20 identical window
  frames in one go), optionally starting each copy on a new universe.

**Addressing and output**
- RGB / RGBW / single / 5-channel pixels, max pixels per universe, first universe
  (0 or 1), "start on new universe" or "new controller port" per element.
- Live checks – overlapping pixels, negative coordinates, sACN universe limit,
  layouts bigger than the largest MADRIX licence.
- Colour per universe, wiring path and start markers; hover any pixel to see its
  universe, channel, controller and port.
- **Export** the MADRIX CSV fixture list (comma, semicolon or tab), plus a wiring
  sheet (CSV or print) for the installer.

**Editing**
- Drag to move, arrow keys to nudge (Shift = 10), pinch or scroll to zoom,
  **Undo / Redo** (Ctrl+Z / Ctrl+Shift+Z), background image to trace over.
- Save / open projects as `.rizhu.json`; autosaves in the browser.
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
src/core.js       shapes, addressing, validation, CSV (no DOM, unit tested)
src/importers.js  CSV points, SVG geometry, image masks (no DOM, unit tested)
vendor/           svg-path-properties (MIT) and Hershey font data (MIT) - see vendor/README.md
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
2. **Next** – camera auto-mapping (film the pixels, detect positions), templates
   (common LED panels, facades), exports for other software (xLights, Resolume, WLED).
3. **Later** – desktop app (Tauri) with live Art-Net / sACN output, network
   discovery and output health monitor.
