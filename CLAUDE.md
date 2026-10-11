# Sketchroom

A Procreate-style drawing web app for the owner and beta testers: pressure-aware brushes, a brush editor, layers, a text tool with free Google Fonts, undo/redo and PNG export. Plain HTML, CSS and JavaScript. No build step and no npm. Firebase is loaded from gstatic with `<script>` tags. It is hosted on GitHub Pages (see "Hosting and accounts").

## Where it came from

It was first built in Claude and published as a private artifact (https://claude.ai/artifact/ABUSEfRXoZVgP4DKxXdc9R). This folder started as a split-up copy of that code. It has since moved off Claude's `window.claude` capabilities to Firebase and plain browser downloads, so it no longer behaves like the artifact.

`sketchroom.html` in this folder is the original single-file build, kept only for reference. It is in `.gitignore`, so it is not published. Edit the split files, not that one. It can be deleted once nobody needs it.

## File map

`index.html` loads the Firebase compat SDK first, then the scripts below as plain `<script>` tags, in this order. They share globals (every top-level function and `var` is global), so the order matters.

| File | What it holds |
| --- | --- |
| `index.html` | Page markup: top bar (with the account button), tool rail, canvas area, tabbed dock (Brushes, Edit, Layers, Color, Text) |
| `styles.css` | All styling, dark and light themes through CSS variables at the top |
| `js/firebase-config.js` | `FIREBASE_CONFIG`, the public web config from the Firebase console. `null` means "no Firebase" |
| `js/core.js` | Document size constants, `$` / `$$` helpers, SVG icons |
| `js/config.js` | Preset brushes, brush settings schema, swatches, built-in font list, the app state object `S`, `toast()` |
| `js/engine.js` | `makeTips()` (brush tip images) and `Engine` (stamps tips along a stroke), `drawPreview()` |
| `js/layers.js` | Layer objects, add/duplicate/delete/clear/reorder, undo/redo history `H` |
| `js/brushes.js` | `makeSlider()`, quick sliders, brush editor controls, brush library cards (Free brushes and My brushes grids) |
| `js/storage.js` | `store`: Google sign-in, the free library and each user's private brushes and fonts in Firestore, with a `localStorage` fallback. Also `renderAccount()` |
| `js/text.js` | Google Font loading and the text tool (ghost preview, placing text on a layer) |
| `js/canvas.js` | Pan and zoom, tool switching, color, pointer handling, strokes, eyedropper |
| `js/pad.js` | The test pad in the Edit tab and its pressure readout |
| `js/files.js` | Autosave to IndexedDB, PNG export (an `<a download>` link), "New drawing" |
| `js/app.js` | Event wiring (`wire()`), tabs, keyboard shortcuts, and `init()`. Must load last |
| `firestore.rules` | Firestore security rules. Not deployed automatically: paste into the Firebase console when changed |
| `tools/serve.ps1` | Tiny static server on http://localhost:8000 for local testing (`.claude/launch.json` runs it) |
| `favicon.svg`, `.nojekyll`, `.gitignore` | Site icon. `.nojekyll` tells GitHub Pages to serve files as they are |

## How it works

- The document is 1600 x 1200 (`DOC_W`, `DOC_H`). Each layer is its own `<canvas>` inside `#stage`. Zoom and pan are a CSS transform on `#stage` (`S.view`), so drawing coordinates are converted with `docPos()`.
- Brush settings live in one object (keys in `BASE` and `SCHEMA` in `config.js`): size, opacity, flow, hardness, spacing, roundness, angle, angleJitter, scatter, sizeJitter, pressureSize, pressureOpacity, smoothing, shape (`round`, `square`, `chalk`, `bristle`, `speckle`), follow. Saved brushes are `{ name, params, at }`, plus `by` (the admin's uid) in the free library. In the app each one also carries `where`: `'library'` or `'mine'`.
- A stroke: `Engine` stamps a pre-rendered tip along the path at `spacing`. Normal brushes draw into a separate `buffer` canvas shown above the active layer at the brush's opacity, then composite onto the layer when the pen lifts, so opacity does not build up within one stroke. The eraser draws straight onto the layer with `destination-out`.
- `Engine.stamp()` spreads the target alpha across the stamps that overlap each pixel (`this.norm`, for round, square and chalk tips). Without that, overlapping stamps pile up to solid and Flow or pen pressure has no visible effect.
- Undo: each stroke stores small before/after crops of its bounding box. Layer operations store closures. History is capped at 80 entries.
- Touch: once a pen has been seen, one finger pans and two fingers pinch-zoom. Before that, a finger draws.
- Autosave: layers are written to IndexedDB (`sketchroom` database, `doc` store, key `current`) about 2.5 seconds after a change. This is per browser and per origin.
- Shortcuts: B brush, E eraser, T text, I eyedropper, H or hold Space to pan, [ and ] change size, Ctrl/Cmd+Z undo, Shift+Ctrl/Cmd+Z redo.

## Hosting and accounts

- **Site:** GitHub Pages, served from the `main` branch, root folder, at `https://<github-user>.github.io/sketchroom/`. Pushing to `main` publishes the site within about a minute. The repo must stay public for free Pages.
- **Accounts:** Firebase Authentication with Google sign-in only, on the free Spark plan. Anyone can draw and use the presets and free brushes without signing in. Saving a brush or adding a font asks them to sign in first: `signedIn()` in `app.js` opens the popup straight from the click, so iPad Safari allows it.
- **Data (Firestore):**
  - `brushes/{id}` and `fonts/{id}`: the free library. Everyone reads, admins write.
  - `users/{uid}/brushes/{id}` and `users/{uid}/fonts/{id}`: private to that user (My brushes, Your fonts).
  - `admins/{uid}`: marks an admin (`S.canEdit`). Admins see "Add to free library", can edit or delete free brushes, and the fonts they add go to the free list.
- **Making someone an admin:** they sign in once. In Firebase console > Authentication > Users, copy their User UID. Then in Firestore > Data, start a collection `admins` (if it doesn't exist) and add a document whose ID is that UID, with any field (for example `note: "owner"`). The app can't write `admins`. Only the console can.
- **Security rules** live in `firestore.rules`. After editing that file, paste it into Firebase console > Firestore Database > Rules and press Publish.
- **Authorized domains:** sign-in only works on domains listed in Firebase console > Authentication > Settings > Authorized domains (`localhost` and `<github-user>.github.io`). A custom domain must be added there too.
- **Fallback:** if `FIREBASE_CONFIG` is `null`, the SDK fails to load, or the page is opened from `file://`, then `store.online` is false. Sign in is hidden, the free library is hidden, and My brushes and fonts use `localStorage` (`sketchroom.brushes`, `sketchroom.fonts`).
- **Drawings** are still saved only in the browser (IndexedDB). They are not in the cloud.

## Running locally

Run `tools/serve.ps1` (or start the `sketchroom` entry in `.claude/launch.json`) and open http://localhost:8000. Google sign-in needs `http://localhost`. Opening `index.html` from disk still works but uses the local fallback. Python and Node.js are not installed on the owner's PC and are not needed.

## Deploying

Commit and push to `main` on GitHub. That's all: there is no build. The Firebase compat SDK version is pinned in `index.html` (currently 12.19.0). When upgrading it, change all three script tags together.

## Conventions

- No build tools, no ES modules (browsers block modules on `file://`). If modules are wanted later, add a small dev server first.
- Keep new scripts in `js/` and list them in `index.html`. Keep `app.js` last.
- Put user-visible text in the element with `textContent`, never `innerHTML`, when it comes from users (brush names, layer names, font names).
- The `[hidden]` rule at the top of `styles.css` is needed: without it, elements styled with `display: flex` ignore the `hidden` attribute (this made the File menu stay open once).
- Pointer code must keep `touch-action: none` on the canvas area and handle `pointercancel`.

## Known issues

- Apple Pencil pressure did not visibly change brush size or opacity on the owner's iPad in Safari. The cause was not found. The Edit tab's test pad prints the pressure range of each stroke ("Pen pressure that stroke: 0.12 to 0.88") so the next session can tell whether the browser sends varying pressure. If it reports a flat range, the browser is not passing pressure through. If the range varies, the bug is in `engine.js`.
- Not tested on Android or on non-Apple styluses.
- Large canvases with many layers will be slower than a native app.

## Ideas the owner may want next

- A "request to share" button on My brushes, so testers can propose a brush for the free library and the owner approves it. Until then, only admins add to the free library.
- A homepage with a library of the user's drawings and folders for multiple artworks. The app would then move off the root (for example to `draw.html`). Saving drawings to the cloud needs Firebase Storage, which requires upgrading to the pay-as-you-go Blaze plan (it has a free monthly allowance). Firestore documents are capped at 1 MB, too small for layer images.
- Saving and loading a drawing as a file.
- Import and export of brushes as JSON.
- More tools: fill, smudge, selection, shapes, layer merge, canvas size choices.
- Installable app mode (web app manifest and a service worker) for the iPad home screen.
- Custom font upload (the claude.ai version only supports free Google Fonts by name).

## Testing

There is no test suite. Check changes by serving the folder (see "Running locally") and trying: each tab, each tool, drawing with a few brushes, undo and redo, adding and deleting layers, the text tool, and the Edit tab test pad. With Firebase on, also check three states: signed out (free brushes show, Save asks to sign in), signed in (save, update and delete My brushes) and admin (Add to free library). After any change to startup code in `app.js`, reload and confirm the tabs and canvas still respond (an error before `wire()` runs leaves the page looking alive but dead).
