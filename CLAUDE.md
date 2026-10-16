# Sketchroom

A drawing web app in the style of tablet painting apps, for the owner and beta testers. It has:
- a homepage library of images, folders and projects, saved in each user's account
- a chosen canvas size for each image, and pixel-art tilesets with crisp pixel tools
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
| `index.html` | Two views: `#home` (the library) and `#editor` (top bar, tool rail, canvas, and the floating panel, Layers, tools menu and tool strip), plus the dialogs (`<dialog>`: New image, name, Move, Draw together, username, profile, contact) |
| `styles.css` | All styling, dark and light themes through CSS variables at the top |
| `js/firebase-config.js` | `FIREBASE_CONFIG`, the public web config from the Firebase console. `null` means "no Firebase" |
| `js/core.js` | `DOC_W` / `DOC_H` (the open image's size, changed by `setDocSize()`), `$` / `$$` helpers, SVG icons |
| `js/config.js` | Preset brushes, brush settings schema, swatches, built-in font list, the app state object `S`, `toast()` |
| `js/engine.js` | `makeTips()` (brush tip images) and `Engine` (stamps tips along a stroke), `drawPreview()` |
| `js/layers.js` | Layer objects, add/duplicate/delete/clear/reorder, lock (`toggleLock`), `mergeDown()`, `importImage()`, `canDraw(L)`, undo/redo history `H` |
| `js/brushes.js` | `makeSlider()`, quick sliders, `curParams()`, brush editor controls, brush library cards (Free brushes = `PRESETS` + the Firestore free library, then My brushes), the owner's suggestion cards (`renderRequests()`), brush file import/export |
| `js/storage.js` | `store`: Google sign-in, and everything kept in accounts (free library, private brushes, fonts, saved colors, uploaded fonts, suggestions, library items, layer files in Cloud Storage), with a `localStorage` fallback. `store.ready` resolves once the first sign-in state is known. Also `renderAccount()` |
| `js/text.js` | Google Font loading, uploaded font files (`uploadFont()`, `registerUploadedFont()`), the text tool |
| `js/canvas.js` | Pan and zoom (`maxZoom()`), tool switching, the Pen / Finger switch (`setInputMode`), pen pressure, pointer handling, brush and eraser strokes, eyedropper. `onDown` sends the other tools to `tools.js` / `select.js` / `pixel.js`, which set `drag = { id, move, end, cancel }` |
| `js/color.js` | `setColor()`, the color wheel, saved and recent colors, the quick color pop-up |
| `js/tools.js` | The tool strip over the canvas (`updateQuick()`, `quickTitle()`, `MORE_TOOLS`), fill (`fillAt`), line and shapes (`beginShape`), smudge (`beginSmudge`) |
| `js/select.js` | Selection (rectangle or freehand) and moving the selected pixels (`S.sel`, `dropSelection()`, `deleteSelection()`) |
| `js/pixel.js` | Pixel art: `isPixel()`, the pixel pencil and eraser (`beginPixelStroke`), pixel line and shapes (`drawPixelShape`), the pixel/tile grid (`drawGrid`), hard-edged selection masks (`hardMask`) |
| `js/pad.js` | The test pad in the Edit tab, its pressure readout and the Pen pressure setting |
| `js/files.js` | Saving the open image in IndexedDB (`saveDoc`, `idbGet/Put/Del`), `downloadBlob()`, PNG export (with a scale for pixel art), drawing files (`.sketchroom.json`), "Clear drawing" (`newDoc`) |
| `js/document.js` | The open image (`S.doc`): `setDocSize()`, `applyDocMode()`, `useLayers()`, opening the quick sketch or a library image (`openSketch`, `openImage`), cloud saving (`cloudSave`, `leaveDoc`), thumbnails |
| `js/library.js` | The homepage: cards, breadcrumbs, Create new (Image / Folder / Project / Import a file), Open / Rename / Move to… / Duplicate / Delete, the quick sketch banner, and the page addresses (`route()`) |
| `js/importbrush.js` | `readBrushFile()`: Import brushes reads Sketchroom `.json`, `.brush` / `.brushset` (zip + `Brush.archive` binary plist + `Shape.png`), Photoshop `.abr` (sampled tips, v1/v2/v6, same layout GIMP reads) and PNG/JPG pictures. Includes a small bplist/NSKeyedArchiver reader and lazy-loads fflate for unzipping |
| `js/profile.js` | Usernames and profiles (`needUsername`, `claimUsername`, the profile page `#/profile`, the Edit profile dialog), the contact form, and the owner's inbox |
| `js/background.js` | The generated art behind the signed-in pages: `paintBackground(canvas, settings)`, its styles (`BG_PAINTERS`), and `BG_LIBRARY`, the settings the site uses. Self-contained, so the preview page can load it alone |
| `tools/background-preview.html` | Not linked from the site. A pretend library with an edit panel for the background art; open http://localhost:8000/tools/background-preview.html. It starts from `BG_LIBRARY`, and the current settings are in `window.bgSettings` |
| `js/friends.js` | Friends: requests, the friends page `#/friends`, a friend's view-only library `#/u/<uid>` and the image viewer (`showFriendImage`, which draws the visible layers onto one canvas) |
| `js/news.js` | "What's new": the patch notes (`NEWS`) that pop up over the library once per account (`maybeShowNews`), and the footer link that reopens them. For each update: change `NEWS.version` and the notes |
| `js/live.js` | Drawing together, live: layer shadows and pixel diffs (`liveTouch`, `liveFlush`, `liveDiff`), applying others' changes (`livePx`, `liveLayers`), `liveStart` / `liveStop`, `shareFor`, the Live badge. Loads after `document.js` |
| `legal.html` | Terms of use, Privacy policy and Credits (with the Lucide/Feather license texts). Linked from the homepage footer and the profile page |
| `LICENSE`, `THIRD_PARTY_NOTICES.md` | The owner's code is "all rights reserved". Third-party licenses (icons, fonts, Firebase) |
| `js/landing.js` | The sample drawing sheet on the signed-out homepage (pencil, marker, ink, spray). Self-contained, nothing saved. Loads before `app.js` |
| `js/app.js` | Event wiring (`wire()`), tabs, keyboard shortcuts, and `init()`. Must load last |
| `firestore.rules`, `storage.rules` | Security rules for Firestore and Cloud Storage. Not deployed automatically: paste into the Firebase console when changed |
| `tools/serve.ps1` | Tiny static server on http://localhost:8000 for local testing (`.claude/launch.json` runs it) |
| `favicon.svg`, `.nojekyll`, `.gitignore` | Site icon. `.nojekyll` tells GitHub Pages to serve files as they are |
| `manifest.webmanifest`, `sw.js`, `icons/` | Installable app. `sw.js` is a network-first service worker, so it opens offline but never serves stale files when online. The PNG icons were drawn with System.Drawing from the favicon's curve |

## How it works

- **Pages** (`route()` in `library.js`, driven by the URL hash):
  - `#/` is the library's top level. `#/c/<id>` is inside a project or folder.
  - `#/d/<id>` opens an image in the editor. `#/sketch` opens the quick sketch.
  - Leaving an image always goes through `leaveDoc()`, which saves first.
  - `#/profile` is your profile, `#/friends` the friends page. `#/u/<uid>` is a friend's library, with `/c/<id>` for inside a project or folder and `/d/<id>` to view an image.
  - The library needs sign-in. Signed out, the homepage offers Sign in and Quick sketch. The quick sketch is one drawing kept only in the browser, under IndexedDB key `current` (the same key the single-drawing app used before the library existed).
- **Library items** (`users/{uid}/items/{id}`): `{ type: 'project' | 'folder' | 'image', name, parent ('' = top level), created, updated }`.
  - Images add `w`, `h`, `px` (pixel art `{ tile, cols, rows }` or null), `layers` (`[{ id, name, visible, opacity, blend, locked }]`), `active`, `count` and `thumb` (a small data URL for the card).
  - The owner chose flexible nesting: projects hold folders and images, folders hold images, and anything can sit at the top level. Folders can't hold folders, and projects only sit at the top level.
  - Deleting a project or folder deletes everything inside it, Storage files included.
  - `private` (true or false) hides an item from friends. Make private / Show to friends in the card menu applies to the item and everything inside it (`setPrivate`). New items, copies and moved items take the privacy of the project or folder they land in (`privateAt`). An image can't be shown to friends while its folder or project is private.
  - Items made before friends existed had no `private` field. Friends' queries ask for `private == false`, which skips them, so `fillPrivacy()` gives each one the flag after every server snapshot of your library. It does not change `updated`.
- **Each layer's pixels** are a PNG in Cloud Storage at `users/{uid}/images/{imageId}/{layerId}.png`.
- **Saving an image:**
  - Every change is written to IndexedDB (`img:<id>`) about 2.5 s later.
  - `cloudSave()` then uploads only layers with `L.dirty` set. `recordCrop`, `restore`, clear, merge and new layers set it.
  - Files of removed layers are deleted, and the item's meta and thumbnail are updated. Once everything is up, the IndexedDB copy is deleted.
  - When an image opens, an unsynced IndexedDB copy that is newer than the cloud wins, so offline work isn't lost.
  - **Safety:** while an image is loading (`S.doc.loading`) or failed to load (`S.doc.broken`), the canvas only holds a blank placeholder. Nothing saves, and drawing is blocked. Before this guard existed, a failed load followed by leaving the image overwrote the cloud copy with a blank layer (found in testing on 2026-10-11).
- **Canvas size:** `DOC_W` / `DOC_H` change per image through `setDocSize()`, which also resizes the stroke `buffer`, the `overlay` and `#stage`. Layers must be rebuilt after it (`makeLayer` uses the current size).
  - Regular images go up to 4096 per side.
  - Pixel art goes up to 2048 per side: tile size × tiles across and down, tiles 8–64 px, 1–64 tiles each way.
- **Pixel art** (`S.doc.px` set, `isPixel()`):
  - Display: `#stage` gets the `pixel` class (pixelated rendering, checkerboard), and the body gets `pixeldoc`, which hides Smudge and shows the Brushes tab note.
  - Tools: brush, eraser, line and shapes draw whole pixels. Sizes come from `S.pxPen` / `S.pxEraser` through `curParams()`.
  - Fill has no soft ring, and selections use hard masks.
  - `#grid` is a screen-sized canvas over the viewport that draws tile lines, plus pixel lines from 8× zoom, redrawn on every `applyView()`.
  - Zoom goes up to 64×. File > Export PNG, 8× bigger scales up with hard edges.
- The document is in document pixels. Each layer is its own `<canvas>` inside `#stage`. Zoom and pan are a CSS transform on `#stage` (`S.view`), so drawing coordinates are converted with `docPos()`.
- **Background art** (2026-10-12): signed in, every homepage view (library, profile, friends, a friend's library) has generated art behind it.
  - **How it's drawn:** a fixed `#libBg` canvas painted by `paintBackground(…, BG_LIBRARY)`, under `#libShade` (the page color at `shade` %, so it works in dark and light mode).
  - **When it repaints:** `showLibraryBg()` in `library.js` only repaints when the window size changes. The seed makes it the same picture every time.
  - **Not shown:** on the signed-out landing page or in the editor.
  - **Current settings:** the owner picked them in the preview: flow strokes, all ten theme colors, everything at 100, around the edges, shade 35, seed 68199.
  - **Changing it:** pick new settings in `tools/background-preview.html`, read `window.bgSettings` from that page, and copy them into `BG_LIBRARY`.
- **Built-in brushes:** `PRESETS` in `config.js`, about 50 brushes, each with a `cat` from `BRUSH_CATS` (Sketching, Inking, Tattoo, Markers, Painting, Airbrush & spray, Lettering, Texture). The Brushes tab shows them grouped by category. Keep ids stable. Use `presetById()` rather than an index.
- **Image tips and imported brushes:**
  - **Tips:** a brush can carry `params.tip`, a PNG data URL (white, with the shape in alpha, at most 256 px), used when `params.shape === 'image'`. `makeTips` colors it through its alpha. Tips decode asynchronously through `tipImage()`, which redraws the previews once ready.
  - **Source tag:** `params.src` records where a brush came from (`'painter'`, `'abr'` or `'image'`).
  - **Privacy:** brushes from other apps (`isImported()`) can't be suggested or added to the free library, because they may belong to someone else.
  - **Settings mapping:** `.brush` settings are mapped by best-guess key names (`maxSize`, `paintSize`, `plotSpacing`, `plotJitter`, `plotSmoothing`, `shapeRotation`, `shapeScatter`, `maxOpacity`, `dynamicsPressureSize`, `dynamicsPressureOpacity`, `dynamicsJitterSize`).
  - **Not supported:** grain textures, dual brushes and other advanced settings.
  - **iPad:** the import file input has no `accept` filter on purpose, because iPad greys out unknown extensions like `.brushset` otherwise.
  - **Testing:** the readers were tested with files generated in the browser, not yet with real files from other apps.
- **Built-in fonts:** `FONT_GROUPS` in `config.js` lists about 90 Google Fonts (tattoo and blackletter, stencil, script, graffiti, pixel and more). Only the two interface fonts are in the `<link>` in `index.html`. Text fonts load from Google Fonts the first time they are picked (`loadFamily`). Check that a family exists before adding it (`fonts.googleapis.com/css2?family=Name` must return 200). Families with no regular 400 weight, like UnifrakturCook, fail and can't be used.
- **Usernames and profiles:**
  - Every account picks a username on first sign-in, with a random `artist1234` suggestion. Closing the box without picking keeps a random one, changeable later.
  - Other people only ever see the username, never the Google name or email: the account button, brush suggestions (`byName: '@username'`) and contact messages all use it.
  - Profile fields: display name, pronouns, location, bio, up to 3 links (https only), a 160 px picture stored as a data URL in the profile, and a color.
  - The profile page also shows counts, the account box (the email, visible only to the user) and, for admins, the inbox.
- **Friends** (`friends.js`, done 2026-10-12):
  - **Adding:** add a friend by username on the friends page. That writes `friendRequests/{from}_{to}`. If they already sent you one, adding them accepts theirs instead.
  - **Accepting:** `store.acceptFriendRequest` writes `users/{me}/friends/{them}` and `users/{them}/friends/{me}` (`{ since }`) and deletes the request, all in one batch. The rules only allow each side while the request exists and only if the same batch deletes it.
  - **Removing:** either friend can remove the friendship, which deletes both sides.
  - **What friends see:** each other's profile, and every library item with `private == false` (read only), including those images' layer PNGs. The image viewer composites the visible layers with their opacity and blend, on white (pixel art on a checkerboard). Nothing is saved, and friends can't copy or export.
  - **Notifications:** pending requests put a dot on the account button and a count on the library's Friends button.
  - **Testing note:** the accept and view paths were tested on 2026-10-12 with a fake second account created in the console (since deleted) and the Rules Playground. They have not yet been tried by two real people.
- **Drawing together** (`live.js`, built 2026-10-12):
  - **Sharing:** the owner of an image picks up to 5 friends in the Draw together dialog (the people button in the editor's top bar, or "Draw together…" in a card's menu). That writes `shares/{owner}_{imageId}`. Unticking everyone deletes it.
  - **Friends' side:** shared images show under "Shared with you" at the top of their library (`watchSharedItems` follows each owner's item for the card). They open at `#/s/<owner>/<imageId>`. `openImage(id, token, { owner, item })` loads the owner's layers, and `cloudSave` saves into the owner's item and files (`doc.owner`). Friends may only change the layers, thumbnail, active layer, count and updated (the rules check it).
  - **Live changes:** while a shared image is open (`shareFor(S.doc)`), `S.live` keeps a shadow copy of each layer.
    - **Finding what changed:** after any change, `liveFlush` diffs the touched area against the shadow.
    - **Sending:** it sends only the changed pixels, as `shares/{sid}/ops` docs: `px` ops (tiles up to 256 × 256, a patch PNG plus a mask PNG unless the whole tile changed) and `layers` ops (the full layer list plus deleted ids).
    - **Receiving:** incoming ops are applied in server order to the layer and its shadow, so they're never echoed back.
    - **Same person on two devices:** ops are skipped by tab (`LIVE_CID`), so two of your own devices also stay in sync.
  - **Strokes as they're drawn** (the owner asked for this after testing with a friend):
    - **Sending:** a brush stroke is also streamed as `stroke` ops about every 100 ms (`liveStrokeBegin` / `liveStrokePoint` / `liveStrokeSend` from `beginStroke`, `addPoints`, `endStroke` and `abortStroke`). Each carries its points as flat `[x, y, pressure, …]`, and the first one also carries the brush (`params`) and color.
    - **Receiving:** the others draw it with their own `Engine` into a preview canvas right above that layer (`liveStrokeOp`, kept in place by `livePlacePreviews` from `renderStack`).
    - **Swapping in the real stroke:** the preview is dropped 150 ms after that tab's px ops arrive (or 5 s after `done`, or at once on `cancel`).
    - **Skipped:** previews are not replayed when an image opens.
    - **Not streamed:** the eraser, smudge, pixel art and the other tools still appear when finished.
    - **Tested 2026-10-12 through Firestore:** the friend's tab showed the stroke about 0.3 s after it started and grew every 0.1 s. The finished pixels replaced it about 0.6 s after the pen lifted, covering nearly the same pixels.
    - **Cost:** about 10 Firestore writes a second per person while their pen is down, plus a read per write for each other person in the image.
  - **Hooks:** `liveTouch` is called from `recordCrop`, `restore`, `restoreChanged`, `clearLayer` and `mergeDown`. `liveSoon` is called from `renderLayers` and `scheduleSave`. A layer with no shadow (new, duplicated, imported) is sent whole.
  - **Opening and saving:**
    - **Opening:** `openImage` loads the saved copy, then `liveStart` replays the ops from a minute before the item's `updated`. Drawing stays blocked until that's done.
    - **Saving:** each person's `cloudSave` uploads the layers they changed.
    - **Cleanup:** the owner deletes ops over 10 minutes old (and older than 5 minutes before the last save) when opening.
  - **Starting and stopping:**
    - **Owner:** `liveSharesChanged` starts or stops the session when the owner shares or unshares while the image is open.
    - **Friend:** a friend who loses access gets a permission error from the ops listener and is sent to the library (`liveLost`).
  - **New images:** an image with no saved layers gets a first layer id made from the image id (`'l' + id`), so everyone starts on the same layer.
  - **Known limits:**
    - Two people changing the very same pixels at the same moment can end up slightly different until the next save.
    - Soft edges lose a little color precision through PNG.
    - There's no presence list yet (the Live pill's tooltip names the people the image is shared with), and no live cursor.
  - **Testing note (2026-10-12):**
    - Two tabs with a fake server (BroadcastChannel) matched pixel for pixel: strokes, layers, undo, delete, fill, and crossing strokes drawn at once.
    - Two tabs of the owner's account through Firestore synced in about 0.3 s, and the image reopened with both layers.
    - The friend's read access to the item, its ops and its layer files, and a stranger's denial, were checked in the Rules Playground with a temporary test friend (deleted).
    - **Not yet tried:** two real people.
- **Contact form:** writes to `messages`. Only admins read them, in the inbox on their profile page. An unread message adds a dot to the account button.
- Brush settings live in one object (keys in `BASE` and `SCHEMA` in `config.js`). Saved brushes are `{ name, params, at }`, plus `by` (the admin's uid) in the free library, and each carries `where` (`'library'` or `'mine'`) in the app.
- A stroke: `Engine` stamps a pre-rendered tip along the path at `spacing`. Brushes draw into the separate `buffer` canvas shown above the active layer at the brush's opacity, then composite onto the layer when the pen lifts. The eraser draws straight onto the layer with `destination-out`. `Engine.stamp()` spreads alpha across overlapping stamps (`this.norm`), so Flow and pen pressure show.
- Undo: each stroke stores before/after crops of its bounding box, and layer operations store closures. History is capped at 80 entries and resets when another image opens. Undo and redo of a stroke only put back the pixels that stroke changed (`restoreChanged`), so a friend's nearby changes survive while drawing together.
- **Pen / Finger switch** (bottom of the rail, `S.inputMode`, localStorage `sketchroom.input`, the owner asked for it on 2026-10-12):
  - **Pen:** pens and the mouse draw, and a finger moves the canvas (one finger pans, two pinch-zoom).
  - **Finger:** fingers, pens and the mouse all draw. Two fingers still pinch-zoom.
  - **Not set yet:** the first pen stroke switches it to Pen, with a toast.
- **Pen pressure** (`canvas.js`): each pen stroke (brush, eraser, smudge and the test pad) uses `newPressure()` / `samplePressure()` / `finishPressure()`. Each sample records three sources:
  - `'pointer'`: the pointer event's pressure.
  - `'force'`: Safari's stylus `Touch.force`, from touch events tracked by `trackStylus`.
  - `'speed'`: made-up pressure from screen speed (`speedPressure()`). Slow is heavy and fast is light, and strokes start a little light.
    - **Smoothing:** the speed is averaged over about 90 ms of time (`SPEED_TAU`), not per event, so it's the same at any event rate and the line swells and thins gradually.
    - **Scale:** log-like from holding still (full weight) to 4 px/ms (`SPEED_FAST`, lightest). Each halving of speed adds about the same weight, so slower always means heavier.
    - **Changed 2026-10-16** at the owner's request: before, every speed under about 0.2 px/ms was full weight, so slowing down jumped straight to one size. Normal-speed strokes (around 0.5 to 1 px/ms) now come out a bit lighter than before.
  - **Choosing a source:** after each pen stroke the working source is stored in `S.pen.src`:
    - pointer if it changed at all (a real sensor never sends the exact same value for a whole stroke)
    - otherwise force if that changed
    - otherwise speed
  - **Edit tab "Pen pressure":** sets `S.pen.mode`: Automatic (`auto`, uses `src`), From the pen (`pen`), From drawing speed (`speed`) or Off (`off`).
  - **Speed slider:** "How much speed changes the stroke" sets `S.pen.speed`, 0 to 100, default 60. 60 is the original curve, 0 is always full pressure, and 100 is 1.67× as strong (`speedEffect()`). It only shows while speed makes the pressure (`updatePenUI` in `pad.js`).
  - **Saved:** all three are saved per browser in localStorage `sketchroom.pen`.
  - **Fingers and mouse:** always draw at full pressure.
  - **Why:** a stuck low value made every pressure brush thin and faint.
- Shortcuts: B brush, E eraser, S smudge, G fill, L line, U shapes, M select, T text, I eyedropper, H or hold Space to pan, [ and ] change size, Ctrl/Cmd+Z undo, Shift+Ctrl/Cmd+Z redo. Esc closes the color pop-up. Esc or Enter drops a selection, and Delete clears the selected pixels.
- **The editor layout** (redesigned 2026-10-12 at the owner's request):
  - **The rail:** Brush, Eraser, the color chip, **…** (the other tools in a menu, `MORE_TOOLS`), the tall Size and Opacity sliders (`makeVSlider`, relabeled "Strength" for smudge), Layers, and the Pen / Finger switch.
  - **Popouts:** the top bar's Brushes button opens a floating panel with the Brushes, Edit, Color and Text tabs (`openPanel`, `showTab`). Layers opens its own popout next to the rail. They float over the canvas (`.pop`, absolutely placed in `.work`), so opening or closing them never resizes the canvas area, and the zoom stays where it was (the owner asked for this). The panel and Layers stay open while drawing.
  - **Tool strip:** while a tool from the … menu is picked, a strip at the top of the canvas names it and holds its settings (`#qFill`, `#qShape`, `#qSelect`, `#qText`). On narrow screens it hides while the panel is open.
  - **Removed:** the four-corners Fit button. Zoom with −, 100%, +, pinch, the mouse wheel or Ctrl and +/−.
  - **Phones:** the top bar can't widen the page (`.app` has a `minmax(0, 1fr)` column) and the drawing's title shrinks first. Before that fix, the header stretched the editor wider than the screen.
  - **Lock:** `L.locked` stops every tool, Clear and Merge, all through `canDraw(L)`.
  - **Fill:** a scanline flood fill on the active layer (or all visible layers), with a Tolerance setting and premultiplied color comparison. It adds a 2px ring painted with `destination-over`, so it tucks under antialiased edges (no ring for pixel art).
  - **Line and Shapes:** use the current brush with smoothing 0, preview in `buffer`, and land as one undo step. Shift snaps lines to 15° steps and makes shapes square or round.
  - **Smudge:** carries a patch of the layer along the stroke (`S.smudge`: size, opacity as strength, hardness).
  - **Select & move:** dragging inside a selection lifts the pixels into a floating canvas on `overlay`. They land as one undo step when the selection is dropped: another tool, layer, layer button, undo, Deselect, new selection, autosave or cloud save.
  - **Import image** (Layers tab): goes under the active layer, scaled to fit, locked, at 40% opacity.
- **Color:** always change color through `setColor(hex, remember, hsv)`. `S.hsv` keeps hue and saturation at black, white and greys.
  - Saved colors (`S.saved`, max 60) live in `users/{uid}/settings/colors` when signed in, or in `localStorage` when signed out.
  - Recent is per browser.
  - The color pop-up opens from `#colorChip` on the rail, beside it. It stays open while drawing (the owner asked for this) and closes from the chip, ×, Esc, or a tap elsewhere in the interface.

## Hosting and accounts

- **Site:** GitHub Pages, served from the `main` branch, root folder, at https://sleepyscythe.github.io/sketchroom/ (repo https://github.com/SleepyScythe/sketchroom). Pushing to `main` publishes the site within about a minute. The repo must stay public for free Pages.
- **Firebase project:** `sketchroom-abab3`, owned by the owner's Google account. Console: https://console.firebase.google.com/project/sketchroom-abab3
  - **Plan:** Blaze (pay as you go) since 2026-10-11. Monthly budget alert ("Firebase Project sketchroom-abab3" in Google Cloud > Billing > Budgets & alerts): $5, raised to $20 on 2026-10-12 at the owner's request, emailing at 50%, 90% and 100%. It only alerts, it doesn't stop spending (no spend cap is set). The billing account was on a free trial with $300 credit.
  - **Firestore:** in `nam5`. Google Analytics and Gemini are off.
  - **Cloud Storage:** default bucket `gs://sketchroom-abab3.firebasestorage.app` in US-EAST1, a no-cost location, so the free allowance applies. Its **CORS** allows GET from `https://sleepyscythe.github.io` and `http://localhost:8000`. It was set from Google Cloud Shell:
    ```
    gcloud storage buckets update gs://sketchroom-abab3.firebasestorage.app --cors-file=cors.json
    ```
    Without CORS, opening a library image fails with a CORS error, because the browser can't download the layer PNGs. A custom domain must be added to the CORS list (and to the Authorized domains).
- **Accounts:** Firebase Authentication with Google sign-in only. Testers see "Sketchroom" on the Google sign-in screen. `signedIn()` in `app.js` opens the popup straight from the click, so iPad Safari allows it.
- **Data (Firestore):**
  - `brushes/{id}` and `fonts/{id}`: the free library. Everyone reads, admins write.
  - `users/{uid}/brushes`, `users/{uid}/fonts`: My brushes and Your fonts.
  - `users/{uid}/settings/colors`: saved colors.
  - `users/{uid}/settings/news`: `{ seen, at }`, the "What's new" version this account has closed. This browser also remembers it in localStorage `sketchroom.newsSeen.<uid>`, in case saving fails.
  - `users/{uid}/uploadedFonts/{id}`: uploaded font files `{ family, data (base64), at }`, 700 KB max.
  - `users/{uid}/items/{id}`: the library (see "How it works"). Friends can read items with `private == false`.
  - `users/{uid}/friends/{friendUid}`: `{ since }`, readable only by `uid`. Written on both sides when a request is accepted.
  - `friendRequests/{from}_{to}`: `{ from, to, at }`, readable and deletable by those two people. Can only be sent to someone with a profile who isn't already a friend.
  - `shares/{owner}_{imageId}`: `{ owner, image, members (up to 5 of the owner's friends), name, at }`, written only by the owner. Members can read and update that image's item (limited fields) and read and write its layer files.
  - `shares/{sid}/ops/{opId}`: live changes `{ by, at (server time), seq, cid, kind: 'px' | 'layers' | 'stroke', … }`. The owner and members read and create them. The author or the owner deletes them.
  - `requests/{uid}_{brushId}`: a tester's suggestion for the free library. Admins Add or Decline it in the Brushes tab.
  - `profiles/{uid}`: the public profile `{ username, displayName, bio, pronouns, location, links, avatar, color, joined, updated }`. Any signed-in person can read it, and only its owner can write it.
  - `usernames/{name}`: `{ uid }` reserves a username. It is create-only. `store.saveProfile` writes the profile and the new name, and deletes the old name, in one batch, and the rules check both sides with `getAfter`, so names are unique.
  - `messages/{id}`: contact form messages `{ uid, username, topic, text, contact, at, read }`. Any signed-in person can create one, and only admins can read, update `read`, or delete.
  - `admins/{uid}`: marks an admin (`S.canEdit`).
- **Making someone an admin:** they sign in once. In Firebase console > Authentication > Users, copy their User UID. In Firestore > Data, add a document with that UID as its ID to the `admins` collection, with any field (for example `note: "owner"`). Only the console can write `admins`.
- **Security rules:** `firestore.rules` and `storage.rules`. After editing one, paste it into Firebase console > Firestore Database > Rules (or Storage > Rules) and press Publish.
  - **Storage reads Firestore:** the Storage rules call `firestore.exists()` / `firestore.get()` to check friendship and the item's `private` flag. That needed a one-time IAM role for the Storage service account. The owner approved it, and it was attached from the console's "Provision cross-service rules" dialog on 2026-10-12. Each friend's layer download costs a couple of Firestore reads.
  - **Drawing together:** the rules for `shares` and its ops, the members' access to the item and its layer files, and the friend check (up to 5 members, one `exists` each) were published on 2026-10-12.
  - **Order:** publish rules before pushing code that writes new fields (`validItem` uses `hasOnly`, so the old rules reject unknown fields).
- **Authorized domains:** sign-in only works on domains listed in Authentication > Settings > Authorized domains (`localhost`, `sketchroom-abab3.firebaseapp.com`, `sketchroom-abab3.web.app`, `sleepyscythe.github.io`).
- **Fallback:** if `FIREBASE_CONFIG` is `null`, the SDK fails to load, or the page is opened from `file://`, then `store.online` is false. The homepage then offers only the quick sketch, and brushes and fonts use `localStorage`.
- **Home-screen app (iPad):** Safari's Share menu has Add to Home Screen. On iOS the home-screen app has its own storage, separate from Safari, so the quick sketch, Recent colors and sign-in don't carry over. Library images are in the account, so they do once signed in. Google sign-in from inside the home-screen app has not been tested. Firebase's popup flow can fail in iOS standalone mode. If it does, the fallback is to sign in from Safari, or to set `display` to `browser` in the manifest.

## Running locally

Run `tools/serve.ps1` (or start the `sketchroom` entry in `.claude/launch.json`) and open http://localhost:8000. Google sign-in and library images work on `http://localhost:8000` (it is an authorized domain and in the bucket's CORS list). Opening `index.html` from disk still works but uses the local fallback. Python and Node.js are not installed on the owner's PC and are not needed.

When testing in the built-in browser, **navigating to the same URL with a different `#` does not reload the page**, so the old scripts keep running. Use `location.reload()` after editing JS.

## Deploying

Commit and push to `main` on GitHub. For a release the owner should hear about, update the notes in `js/news.js`: a new `NEWS.version`, `NEWS.when` and the items. Every signed-in person then sees them once. There is no build, but **bump the `?v=` number** on `styles.css` and every `js/` script tag in `index.html` before each push that changes CSS or JS.
- **Why:** GitHub Pages lets browsers cache files for 10 minutes (`max-age=600`), and a normal reload refetches `index.html` but reuses cached scripts. Without the bump, a visitor can get the new page with old scripts, startup throws, and the page looks dead (this happened on 2026-10-11).
- **Pushing:** git push works from Claude's shell (credentials are cached in Git Credential Manager).
- **Firebase SDK:** the compat SDK version is pinned in `index.html` (currently 12.19.0). Change all four script tags (app, auth, firestore, storage) together.

## Conventions

- No build tools, no ES modules (browsers block modules on `file://`). If modules are wanted later, add a small dev server first.
- Keep new scripts in `js/` and list them in `index.html`. Keep `app.js` last.
- Put user-visible text in the element with `textContent`, never `innerHTML`, when it comes from users (brush names, layer names, font names, library item names).
- The `[hidden]` rule at the top of `styles.css` is needed: without it, elements styled with `display: flex` ignore the `hidden` attribute.
- Pointer code must keep `touch-action: none` on the canvas area and handle `pointercancel`.
- Anything that changes a layer's pixels must leave `L.dirty = true` (`recordCrop` and `restore` do), or the change won't reach the cloud.
- **Copyright care** (the owner can't afford legal trouble):
  - Don't use another app's name, logo, icons, artwork or exact brush names, anywhere in the site or the public repo.
  - Brush names stay generic, describing real-world tools.
  - Only use fonts with open licenses (Google Fonts).
  - Icons based on Lucide or Feather must keep their credit in `legal.html` and `THIRD_PARTY_NOTICES.md`.
  - Any new third-party code or asset gets its license added to both.
  - If the site starts collecting new kinds of personal data, update the Privacy section of `legal.html` (and its date).

## Known issues

- **Pen pressure on the owner's iPad** (2026-10-12): the test pad showed a flat 0.12 for every point. The owner doesn't know which stylus they have, so it may have no pressure sensor (Apple Pencil USB-C, Logitech Crayon), or Safari may send stale values. Automatic mode now handles both cases (see "Pen pressure"). Confirmed on the iPad the same day: Automatic settled on `'speed'` (the readout said the pen has no pressure sensor), so the owner's stylus has no pressure sensor and their strokes use speed pressure.
- Not tested on Android or on non-Apple styluses.
- Large canvases with many layers use a lot of memory (each layer is w × h × 4 bytes, plus a full copy during each stroke for undo). The New image dialog warns above 9 megapixels.
- Opening a library image always downloads every layer (no local cache once synced).

## Ideas the owner may want next

- Painting limited to the inside of a selection (as in other tablet painting apps). Today a selection only moves or deletes pixels, and switching tools drops it.
- Transform for a selection (scale and rotate), not just move.
- Pixel art extras: tile preview (see a tile repeated), symmetry or mirror drawing, an indexed palette, exporting each tile as its own PNG.
- **Next up (owner, 2026-10-11):**
  - **Usernames:** done 2026-10-12, with profiles (see "How it works").
  - **Friends list:** done 2026-10-12 (see "How it works"). Possible next steps: an activity feed of friends' new images, likes or comments, and copying a friend's image (only with their permission).
- **Privacy rule:** never write a user's email into Firestore or anything other users can see. `requests.byName` uses `@username` or "A tester". `S.myName` may fall back to the email, but only for the user's own screen.

## Testing

There is no test suite. Check changes by serving the folder (see "Running locally") and trying the checks below.

**Editor:**
- each tab and each tool
- drawing with a few brushes, undo and redo
- adding and deleting layers
- the text tool and the Edit tab test pad
- the color pop-up

**With Firebase on:**
- signed out: the homepage offers Sign in and Quick sketch
- signed in: My brushes, suggest a brush, upload a font, plus the library checks below
- admin: Add to free library, Add or Decline suggestions

**Library:**
- create an image, folder and project
- draw, go back to the library, and reopen the image: it must come back from the cloud, with every layer
- Move to…, Rename, Duplicate, Delete (a project deletes everything in it)
- Import a file (a drawing file and a picture)
- the quick sketch's "Add it to the library"
- a pixel art tileset: pencil, eraser, line, shapes, fill, select and move with hard edges, Export PNG 8× bigger

**Friends** (needs two accounts):
- send a request by username, then cancel it
- accept and decline from the other account
- open each other's libraries, folders and images
- make an item private and confirm it disappears for the friend
- remove the friend

**Drawing together** (two accounts that are friends, or two tabs of one account for the owner's side):
- share an image with a friend from the editor's people button. It shows under Shared with you for them
- both open it: strokes, new and deleted layers, layer opacity and undo show up on the other side
- leave and reopen: everything drawn is still there
- untick the friend: their open copy goes back to the library

**Editor layout:**
- the … menu picks a tool and closes, and the tool strip shows its settings
- the rail sliders change size and opacity
- the panel and Layers open and close without moving the zoom
- the Pen / Finger switch: in Pen a finger moves the canvas, and in Finger it draws

**Tools:**
- fill inside an outline
- line with Shift
- shapes
- smudge
- select, move and undo
- lock a layer
- merge down
- import an image
- save and reopen a drawing file
- brush export and import

**After any change to startup code** in `app.js`, reload and confirm the homepage and editor still respond.
