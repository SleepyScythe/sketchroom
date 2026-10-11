# Sketchroom

A Procreate-style drawing web app for the owner and beta testers. It has:
- pressure-aware brushes and a brush editor
- smudge, fill, line, shapes, and select & move
- layers with lock, merge and image import for tracing
- a color wheel with saved colors
- a text tool with Google Fonts and uploaded font files
- undo/redo, PNG export and drawing files
- install to the iPad home screen.

 Plain HTML, CSS and JavaScript. No build step and no npm. Firebase is loaded from gstatic with `<script>` tags. It is hosted on GitHub Pages (see "Hosting and accounts").

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
| `js/layers.js` | Layer objects, add/duplicate/delete/clear/reorder, lock (`toggleLock`), `mergeDown()`, `importImage()`, `canDraw(L)`, undo/redo history `H` |
| `js/brushes.js` | `makeSlider()`, quick sliders, brush editor controls, brush library cards. The Free brushes grid shows the built-in `PRESETS` followed by the Firestore free library. The other grid is My brushes. Also the owner's "Suggested for the free library" cards (`renderRequests()`), and brush file import/export (`cleanParams()`) |
| `js/storage.js` | `store`: Google sign-in, the free library, each user's private brushes, fonts, saved colors and uploaded font files, and brush suggestions, all in Firestore, with a `localStorage` fallback. Also `renderAccount()` |
| `js/text.js` | Google Font loading, uploaded font files (`uploadFont()`, `registerUploadedFont()`), and the text tool (ghost preview, placing text on a layer) |
| `js/canvas.js` | Pan and zoom, tool switching, pointer handling, brush and eraser strokes, eyedropper. `onDown` sends the other tools to `tools.js` / `select.js`. Those set `drag = { id, move, end, cancel }` |
| `js/tools.js` | The quick settings at the top of the dock (`updateQuick()`, `quickTitle()`), fill (`fillAt`), line and shapes (`beginShape`), smudge (`beginSmudge`) |
| `js/select.js` | Selection (rectangle or freehand) and moving the selected pixels (`S.sel`, `dropSelection()`, `deleteSelection()`) |
| `js/color.js` | `setColor()`, the color wheel (`makeWheel()`: a hue ring around a saturation/brightness square), saved and recent colors, and the quick color pop-up that opens from the color circle on the tool rail. `initColor()` runs from `init()` |
| `js/pad.js` | The test pad in the Edit tab and its pressure readout |
| `js/files.js` | Autosave to IndexedDB, `downloadBlob()`, PNG export, drawing files (`.sketchroom.json`: save and open), "New drawing" |
| `js/app.js` | Event wiring (`wire()`), tabs, keyboard shortcuts, and `init()`. Must load last |
| `firestore.rules` | Firestore security rules. Not deployed automatically: paste into the Firebase console when changed |
| `tools/serve.ps1` | Tiny static server on http://localhost:8000 for local testing (`.claude/launch.json` runs it) |
| `favicon.svg`, `.nojekyll`, `.gitignore` | Site icon. `.nojekyll` tells GitHub Pages to serve files as they are |
| `manifest.webmanifest`, `sw.js`, `icons/` | Installable app. The manifest and the `apple-*` meta tags let it go on the home screen. `sw.js` is a network-first service worker, so it opens offline but never serves stale files when online. The PNG icons were drawn with System.Drawing from the favicon's curve |

## How it works

- The document is 1600 x 1200 (`DOC_W`, `DOC_H`). Each layer is its own `<canvas>` inside `#stage`. Zoom and pan are a CSS transform on `#stage` (`S.view`), so drawing coordinates are converted with `docPos()`.
- Brush settings live in one object (keys in `BASE` and `SCHEMA` in `config.js`): size, opacity, flow, hardness, spacing, roundness, angle, angleJitter, scatter, sizeJitter, pressureSize, pressureOpacity, smoothing, shape (`round`, `square`, `chalk`, `bristle`, `speckle`), follow. Saved brushes are `{ name, params, at }`, plus `by` (the admin's uid) in the free library. In the app each one also carries `where`: `'library'` or `'mine'`.
- A stroke: `Engine` stamps a pre-rendered tip along the path at `spacing`. Normal brushes draw into a separate `buffer` canvas shown above the active layer at the brush's opacity, then composite onto the layer when the pen lifts, so opacity does not build up within one stroke. The eraser draws straight onto the layer with `destination-out`.
- `Engine.stamp()` spreads the target alpha across the stamps that overlap each pixel (`this.norm`, for round, square and chalk tips). Without that, overlapping stamps pile up to solid and Flow or pen pressure has no visible effect.
- Undo: each stroke stores small before/after crops of its bounding box. Layer operations store closures. History is capped at 80 entries.
- Touch: once a pen has been seen, one finger pans and two fingers pinch-zoom. Before that, a finger draws.
- Autosave: layers are written to IndexedDB (`sketchroom` database, `doc` store, key `current`) about 2.5 seconds after a change. This is per browser and per origin.
- Shortcuts: B brush, E eraser, S smudge, G fill, L line, U shapes, M select, T text, I eyedropper, H or hold Space to pan, [ and ] change size, Ctrl/Cmd+Z undo, Shift+Ctrl/Cmd+Z redo. Esc closes the color pop-up, Esc or Enter drops a selection, and Delete clears the selected pixels.
- **Tools and the quick panel:** the top of the dock shows settings for the current tool. `#qPaint` holds Size and Opacity, and its Opacity slider is relabeled "Strength" for smudge. `#qFill`, `#qShape` and `#qSelect` belong to their tools. `curParams()` is `S.eraser`, `S.smudge` or `S.brush`.
  - **Lock:** `L.locked` stops every tool, Clear and Merge. All of them call `canDraw(L)`. It is saved in autosave and drawing files.
  - **Fill:** a scanline flood fill on the active layer (or on all visible layers with the checkbox), with a Tolerance setting. Colors are compared premultiplied. The filled area is painted normally, plus a 2px ring painted with `destination-over`, so it tucks under antialiased line edges without a halo.
  - **Line and Shapes:** use the current brush with smoothing forced to 0. They preview in `buffer` and land as one undo step. Shapes can be a rectangle or ellipse, outline or filled. Shift snaps lines to 15 degree steps and makes shapes square or round.
  - **Smudge:** carries a patch of the layer along the stroke (`S.smudge`: size, opacity as strength, hardness). Pen pressure scales the strength.
  - **Select & move:** rectangle or freehand. Dragging inside lifts the pixels into a floating canvas drawn on `overlay`. They land on the layer as one undo step when the selection is dropped: another tool, another layer, a layer button, undo, Deselect, a new selection, or autosave.
  - **Import image:** goes under the active layer, scaled to fit, locked, at 40% opacity, as one undo step.
- **Color:** `S.color` is the hex in use, and `S.hsv` keeps hue and saturation so they survive at black, white and greys. Always change color through `setColor(hex, remember, hsv)`, which redraws both wheels (Color tab and pop-up) and every swatch. `remember` adds the color to Recent.
  - **Saved colors** (`S.saved`, max 60) start as `SWATCHES`. The + button adds the current color, and the pencil toggles remove mode. They are stored in `users/{uid}/settings/colors` when signed in, or in `localStorage` `sketchroom.colors` when signed out. On a user's first sign-in, the browser's list seeds the account doc. After that, the account doc wins.
  - **Recent** (12) is per browser, in `sketchroom.recent`.
  - **The pop-up** opens from `#colorChip`, which sits on the tool rail just under the hand (grab) tool. It stays open while you draw on the canvas, so you can switch colors between strokes. The chip, its × button, Esc, or a tap anywhere else in the interface (tabs, top bar, dock) closes it. The owner asked for this behavior.

## Hosting and accounts

- **Site:** GitHub Pages, served from the `main` branch, root folder, at https://sleepyscythe.github.io/sketchroom/ (repo https://github.com/SleepyScythe/sketchroom). Pushing to `main` publishes the site within about a minute. The repo must stay public for free Pages.
- **Firebase project:** `sketchroom-abab3`, owned by the owner's Google account. Firestore is in `nam5` (United States). Google Analytics and Gemini are off. Console: https://console.firebase.google.com/project/sketchroom-abab3
- **Accounts:** Firebase Authentication with Google sign-in only, on the free Spark plan. Testers see "Sketchroom" on the Google sign-in screen. Anyone can draw and use the presets and free brushes without signing in. Saving a brush or adding a font asks them to sign in first: `signedIn()` in `app.js` opens the popup straight from the click, so iPad Safari allows it.
- **Data (Firestore):**
  - `brushes/{id}` and `fonts/{id}`: the free library. Everyone reads, admins write.
  - `users/{uid}/brushes/{id}` and `users/{uid}/fonts/{id}`: private to that user (My brushes, Your fonts).
  - `users/{uid}/settings/colors`: that user's saved colors `{ colors: [...hex], at }`.
  - `users/{uid}/uploadedFonts/{id}`: uploaded font files `{ family, data (base64), at }`. The file limit is 700 KB, which keeps each document under Firestore's 1 MB cap. They are registered with `FontFace` on sign-in.
  - `requests/{uid}_{brushId}`: a tester's suggestion for the free library `{ name, params, at, by, byName, brushId }`. The tester and admins can read it. Admins see the suggestions in the Brushes tab and can Add (which copies the brush to `brushes` and deletes the request) or Decline.
  - `admins/{uid}`: marks an admin (`S.canEdit`). Admins see "Add to free library", can edit or delete free brushes, and the fonts they add go to the free list.
- **Making someone an admin:** they sign in once. In Firebase console > Authentication > Users, copy their User UID. Then in Firestore > Data, start a collection `admins` (if it doesn't exist) and add a document whose ID is that UID, with any field (for example `note: "owner"`). The app can't write `admins`. Only the console can.
- **Security rules** live in `firestore.rules`. After editing that file, paste it into Firebase console > Firestore Database > Rules and press Publish.
- **Authorized domains:** sign-in only works on domains listed in Firebase console > Authentication > Settings > Authorized domains (currently `localhost`, `sketchroom-abab3.firebaseapp.com`, `sketchroom-abab3.web.app` and `sleepyscythe.github.io`). A custom domain must be added there too.
- **Fallback:** if `FIREBASE_CONFIG` is `null`, the SDK fails to load, or the page is opened from `file://`, then `store.online` is false. Sign in is hidden, the free library is hidden, and My brushes and fonts use `localStorage` (`sketchroom.brushes`, `sketchroom.fonts`).
- **Drawings** are still saved only in the browser (IndexedDB). They are not in the cloud. File > Save drawing file / Open drawing file moves them between devices.
- **Home-screen app (iPad):** Safari's Share menu has Add to Home Screen. On iOS the home-screen app has its own storage, separate from Safari, so drawings, Recent colors and sign-in do not carry over. Google sign-in from inside the home-screen app has not been tested. Firebase's popup flow can fail in iOS standalone mode. If it does, the fallback is to sign in from Safari, or to set `display` to `browser` in the manifest.

## Running locally

Run `tools/serve.ps1` (or start the `sketchroom` entry in `.claude/launch.json`) and open http://localhost:8000. Google sign-in needs `http://localhost`. Opening `index.html` from disk still works but uses the local fallback. Python and Node.js are not installed on the owner's PC and are not needed.

## Deploying

Commit and push to `main` on GitHub. There is no build, but **bump the `?v=` number** on `styles.css` and every `js/` script tag in `index.html` before each push that changes CSS or JS. GitHub Pages lets browsers cache files for 10 minutes (`max-age=600`), and a normal reload refetches `index.html` but reuses cached scripts. Without the bump, a visitor can get the new page with old scripts, startup throws, and the page shows no brushes and no Sign in button (this happened on 2026-10-11). Git push works from Claude's shell (credentials are cached in Git Credential Manager). The Firebase compat SDK version is pinned in `index.html` (currently 12.19.0). When upgrading it, change all three script tags together.

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

- A homepage with a library of the user's drawings and folders for multiple artworks. **The owner chose to wait for the cloud version** rather than a device-only library (2026-10-11). The app would then move off the root (for example to `draw.html`). Saving drawings to the cloud needs Firebase Storage, which requires upgrading to the pay-as-you-go Blaze plan (it has a free monthly allowance). Firestore documents are capped at 1 MB, too small for layer images.
- Canvas size per drawing (comes with the library): the library's "Create new" button lets people pick their canvas size. The owner does not want a fixed size forever. `DOC_W` / `DOC_H` are constants today, and layers, the buffer, the overlay, undo crops and autosave all assume them, so they need to become per-document values.
- Further off, if Sketchroom becomes an app: a pixel art mode with pixel tiles (a grid canvas), building on the existing layers.
- Painting limited to the inside of a selection (as in Procreate). Today a selection only moves or deletes pixels, and switching tools drops it.
- Transform for a selection (scale and rotate), not just move.

## Testing

There is no test suite. Check changes by serving the folder (see "Running locally") and trying: each tab, each tool, drawing with a few brushes, undo and redo, adding and deleting layers, the text tool, the Edit tab test pad, and the color pop-up (drag the wheel, pick, add and remove saved colors, then tap the canvas to close it without drawing). With Firebase on, also check three states: signed out (free brushes show, Save asks to sign in), signed in (save, update and delete My brushes, suggest a brush, upload a font) and admin (Add to free library, Add or Decline suggestions). For the tools, check:
- fill inside a shape outline, then undo
- line with Shift
- filled and outline shapes
- smudge across an edge
- select, move, Deselect, and undo the move
- lock a layer and try to draw on it
- merge down, then undo
- import an image
- save and reopen a drawing file
- brush export and import. After any change to startup code in `app.js`, reload and confirm the tabs and canvas still respond (an error before `wire()` runs leaves the page looking alive but dead).
