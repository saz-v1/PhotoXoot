# PhotoXoot

PhotoXoot is a responsive photo booth built with vanilla HTML, CSS, and JavaScript. Capture a photo strip, grid, or solo photo; import local images; customize the result; and download it as PNG or JPEG.

Running the website requires no backend, runtime dependencies, package installation, or build step. Optional development tools are documented under Validation. `dist/` contains the editable source and the files served to visitors, despite its conventional build-output name.

## Quick start

From the project directory, run:

```bash
python3 -m http.server 8080 --directory dist
```

Open [localhost:8080](http://localhost:8080) and enable the camera, or import photos. The server only serves files; it does not process images.

For deployment, upload the contents of `dist/` to an HTTPS static host. Camera access requires a secure context such as HTTPS or localhost. A phone visiting a computer's ordinary HTTP LAN address may load the page but cannot necessarily use the camera. Use a modern browser supporting Canvas 2D, media capture, native dialogs, and the CSS features described below.

## GitHub Pages deployment

The public site is [PhotoXoot](https://saz-v1.github.io/PhotoXoot/).

`.github/workflows/pages.yml` deploys only `dist/` through GitHub Actions. Push website changes to `main` to publish them automatically, or run the workflow manually from the repository's Actions tab. The workflow checks JavaScript syntax, configures Pages, uploads the static site, and deploys it to the `github-pages` environment. No build or package installation is needed. The workflow runs syntax checks only; run browser regression tests locally before publishing. README-only and test-only commits do not trigger deployment.

Repository **Settings → Pages → Build and deployment → Source** must be **GitHub Actions**. Deployment status and errors appear in [Actions](https://github.com/saz-v1/PhotoXoot/actions). Files use relative asset URLs so the site works under the repository's `/PhotoXoot/` path. HTTPS supports camera access; visitors still need to grant browser permission.

This setup follows [GitHub's custom Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Project structure

```text
PhotoXoot/
├── .editorconfig      # Shared editor indentation, encoding, and newline rules
├── .prettierrc.json   # Shared formatting rules
├── .github/workflows/pages.yml # Syntax checks and GitHub Pages deployment
├── .gitignore         # Excludes dependencies, test browsers, and screenshots
├── package.json       # Development scripts and pinned testing/formatting tools
├── pnpm-lock.yaml     # Reproducible development dependency versions
├── tests/photoxoot.test.cjs # Chrome/WebKit regression tests and local test server
├── README.md          # Setup, architecture, behavior, and maintenance guide
└── dist/
    ├── index.html     # Semantic page structure and stable element IDs
    ├── style.css      # Theme tokens, components, desktop and base responsive rules
    ├── mobile.css     # Touch targets, phone panels, navigation, and safe-area rules
    ├── fonts/         # Bundled script fonts and their license notices
    ├── effects.js     # Portable RGB image effects, including Safari
    ├── stickers.js    # Resolution-independent sticker artwork
    └── app.js         # State, UI events, camera lifecycle, rendering, and exports
```

`index.html` loads `style.css` and then `mobile.css`. Later responsive rules override the base styles according to the normal CSS cascade. The script uses `defer`, so its DOM lookups run after HTML parsing. Three deferred classic scripts load in order: effects, stickers, then application behavior. There is no module loader or bundler. The interface uses system fonts; photo captions also support bundled script fonts. It uses text-labeled primary actions, restrained borders, and native disclosure controls for optional tools.

### HTML responsibilities

- **Header and introduction:** compact PhotoXoot branding, help/privacy actions, and a short capture/edit/save introduction.
- **`boothPanel`:** neutral welcome screen, camera video, imported-image preview, countdown, flash, timer, capture, and camera controls. JavaScript adds the Stop camera button.
- **`customizePanel`:** layout/filter/frame choices, caption/stickers, and image adjustments. On phones these are five separate style pages.
- **`momentsPanel`:** session count, gallery, clear-session action, and two-moment pagination on phones.
- **Mobile navigation:** Camera, Style, and Photos buttons use `data-panel` values to select `booth`, `customize`, or `moments`; `aria-controls` identifies each panel.
- **`infoDialog`:** help, privacy information, and clear-session confirmation.
- **`resultDialog`:** live composition, design and individual-photo controls, Done editing, and download actions.
- **`toast`:** temporary status feedback with `role="status"` and `aria-live="polite"`.

Element IDs are the contract between HTML and `getElement()` in JavaScript. Renaming an ID requires updating every corresponding lookup. Classes drive styling and some grouped button selectors; `data-layout` and `data-sticker` provide option values.

### CSS responsibilities

`style.css` begins with color tokens in `:root`, then document defaults and component rules. Sections cover the workspace, neutral viewfinder, camera controls, customization, gallery, footer, feedback, and dialogs. Neutral surface/text tokens and one dark action color keep the interface visually quiet. Base breakpoints adjust larger and smaller layouts, and `prefers-reduced-motion` disables animations.

`mobile.css` layers touch-friendly controls over those rules:

| Condition                                               | Behavior                                                                                                                      |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Width ≤ 900 px                                          | Single-column workspace and compact controls.                                                                                 |
| Width ≤ 750 px, or height ≤ 500 px with width ≤ 1000 px | Fixed-screen phone mode: one panel at a time, bottom navigation, paginated gallery, fullscreen editor, and safe-area spacing. |
| Width ≤ 750 px and height ≤ 650 px                      | More compact spacing and controls for short portrait screens.                                                                 |
| Height ≤ 500 px and width ≤ 1000 px                     | Landscape editor places preview beside tools; camera controls use a compact row.                                              |

Phone `main` explicitly resets desktop auto margins and fills its grid row so the flexible camera preview cannot collapse to zero height. Regression tests assert that the preview has usable height, not just that controls stay onscreen.

The `phoneLayout` media query in JavaScript must match the phone-mode CSS condition. `updateViewportSize()` sets `--app-height` and `--viewport-top` from `visualViewport`; a height reduction over 120 px enables `keyboard-open`. This is a keyboard heuristic, not a keyboard API.
On phones, JavaScript sets `body.dataset.mobilePanel`; CSS hides the other panels. Their DOM nodes and settings remain in place. On larger screens, the panels appear together. Dynamic viewport units and `env(safe-area-inset-*)` keep controls clear of browser chrome and device cutouts. The gallery uses `:has()`, so older browsers may differ in presentation.

## Application state and ownership

The app keeps booth defaults, independent settings for each moment, and temporary session resources. `openingCamera` and `busy` prevent overlapping requests; `generation` invalidates old asynchronous work. `galleryPage` tracks the phone gallery page.

| Name                          | Purpose                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `filters`, `colors`           | Option catalogs used to create buttons and render the selected styling.       |
| `state.layout`                | `strip`, `grid`, or `single`; controls output geometry and camera shot count. |
| `state.filter`, `state.color` | Indexes into the filter and frame catalogs.                                   |
| `state.sticker`               | Selected vector sticker ID, or an empty string.                               |
| `state.mirror`                | Mirrors the video preview and newly captured camera pixels.                   |
| `state.sound`                 | Enables the optional mechanical shutter sound.                                |
| `stream`                      | Active browser `MediaStream`, or `null`.                                      |
| `facing`                      | Preferred camera direction: `user` or `environment`.                          |
| `uploaded`                    | All imported photo canvases, retained as the current capture source.          |
| `moments`                     | Up to 12 session moments, each retaining its raw photo canvases.              |
| `busy`                        | Prevents overlapping capture sequences and some camera/upload actions.        |
| `generation`                  | Cancellation token for asynchronous camera requests and countdowns.           |
| `selectedMoment`              | Moment currently associated with the result dialog, or `null`.                |
| `toastTimer`                  | Timeout used to replace and dismiss status messages.                          |

Brightness, contrast, caption, timer, and export format are read directly from HTML controls rather than duplicated in `state`. The `state` object is a `const` reference with mutable properties.

Each `Moment` contains an `id`, a `photos` array of raw canvases, a localized `date`, saved `settings`, per-photo `photoEdits`, and a cached JPEG `thumbnail`. `originalPhotos` and `initialSettings` retain the original photo order and design for Reset this moment. They hold canvas references and a settings copy, not duplicate full-resolution pixels. The thumbnail is a gallery preview, not the export source.

**Each moment saves its own design.** Booth controls seed a new moment when it is created. The preview editor changes only that moment; reopening restores its settings. Closing the editor updates its gallery thumbnail. Edits are saved immediately in this tab's memory, including when closing with Escape or the backdrop. Done editing closes the editor; it does not download a file.

Booth Reset restores the starting style, timer, and format for future captures while retaining existing moments. Reset this moment restores that moment's original design, source-photo order, and unmodified photo transforms.

## Editing after capture

Every capture or import opens a live editor. Design, Patterns, Stickers, Photo, and Text buttons switch between compact tool pages. Hidden pages are removed from keyboard focus using the native `hidden` attribute. Available controls include:

- Layout: Strip, Grid, or Solo, without retaking the photos.
- Six filters, brightness, and contrast.
- Any frame color through a color picker, frame width from 0–80 px, and photo spacing from 0–40 px.
- Optional caption, seven font choices (including Vladimir Script with an Allura fallback), and an optional date.
- Plain, polka-dot, diagonal-stripe, gingham-check, or heart frames, with custom pattern color and a 16–80 px pattern scale.
- Seven drawn sticker designs (heart, daisy, bow, cherries, sparkles, smiley, and star), with adjustable size and four corner positions.
- Individual-photo zoom from 1×–2.5×, horizontal/vertical crop position, 90° rotation, mirroring, and earlier/later ordering.
- PNG or JPEG format and reset for the selected moment.

Select a source-photo thumbnail before changing its zoom, rotation, mirror, or order. Repeated output slots share their source photo's transforms. Solo displays the first source photo; use Move earlier to choose another one. Layout changes reuse the available photos rather than creating new frames.

**Exports have no watermark or automatic text.** An empty caption stays empty, and the date is off by default. When both are empty, the renderer removes the footer allocation. Branding appears only in the application interface, never in the image.

On desktop, the editor pairs a preview with the active tool page. Phone layouts fill the available visual viewport with a flexible preview, compact tools, and fixed download controls. Style settings use five sub-pages; the photo gallery shows two sets per page. This avoids document and editor scrolling while keeping every tool and saved set reachable. Landscape phones use side-by-side preview/tools. `visualViewport` resize events adapt the height when Safari's toolbar or keyboard changes; the preview hides while typing in a reduced viewport.

### Patterned frames and script captions

The editor’s Patterns tab offers plain, polka-dot, diagonal-stripe, gingham-check, and heart backgrounds with adjustable ink color and scale. `drawFramePattern()` draws beneath the photographs, and leaves the caption footer clear. Patterns are stored per moment and included in both PNG and JPEG exports.

Allura, Dancing Script, and Pacifico are bundled in `dist/fonts/` with their SIL Open Font License files from the [Google Fonts repository](https://github.com/google/fonts). No external font service is contacted. Vladimir Script uses an installed local copy, with bundled Allura as the fallback on iPhone and other devices without it; the proprietary font is not redistributed ([Microsoft font information](https://learn.microsoft.com/en-us/typography/font-list/vladimir-script)). `captionFontsReady` loads these assets, refreshes the preview, and is awaited by `downloadMoment()` to keep exported text consistent.

## Execution flow

### 1. Initialization and controls

When the deferred script runs, it defines option catalogs and session state, creates the filter/frame buttons and Stop camera control, and binds event handlers. There is no framework render loop: handlers update the affected DOM elements explicitly.

Layout, filter, frame, and sticker selection keep the visual `active` class and `aria-pressed` attribute in sync. Brightness, contrast, and caption changes call `updatePreview()`. Mobile navigation updates the selected panel and scrolls to the top.

### 2. Camera startup and shutdown

`startCamera()` checks for `navigator.mediaDevices.getUserMedia`, increments `generation`, and requests video only. Camera direction and a 1280 × 960 resolution are preferences, not guarantees. The browser controls permission and the actual camera settings.

The request remembers its generation. If the app has stopped or superseded that request before it resolves, the newly returned tracks are stopped immediately. A current stream is attached to the video element and played, the imported preview is hidden, and camera status is updated. Permission denial, missing hardware, and other failures produce user-facing messages.

`stopCamera()` increments the generation, stops all active tracks, detaches and hides the video, and resets capture UI. Pending countdowns detect the changed generation and return. `pagehide` calls this cleanup; `visibilitychange` stops an active camera when the page becomes hidden. Returning to the page requires enabling the camera again. Stopping tracks ends this stream; it does not erase the browser's saved permission decision.

### 3. Camera capture

`capture()` ignores overlapping operations and checks session capacity first. If there is no source, it starts the camera and continues into capture. With imported photos it creates a moment from the entire imported set. Settings and mirror state are snapshotted at the start; source/style controls are locked until completion or cancellation.

For video, the app waits for a valid frame, disables capture, and takes one shot for Solo or four for Strip/Grid. Each shot has its own selected countdown, followed by `snapshot()`, an optional two-part mechanical shutter sound, and a visual flash. Multiple shots are separated by 650 ms. Generation checks cancel work after camera shutdown. A `finally` block restores controls only if its generation is still current, so an older capture cannot unlock a newer one.

`snapshot()` creates a 1000 × 750 canvas, optionally mirrors its coordinate system, and center-crops the video into it. Filters are not baked into the raw frame; they are applied during final rendering. Mirror affects newly captured camera photos, not imported images or already stored camera frames.

### 4. Local image import

`importPhotos()` examines the first four selected files. It accepts JPEG, PNG, and WebP files no larger than 20 MiB each. A recognized filename extension is accepted when an iPhone file provider omits the MIME type; decoding still validates the actual image. Invalid or undecodable files are skipped with feedback.

For each valid file, an object URL feeds an `Image`; `decode()` waits for pixels. The image is copied into a canvas, preserving aspect ratio and limiting its longest edge to 1600 pixels without upscaling. Every file's object URL is revoked in `finally`.

Import stops the camera before decoding and retains all successful images. The first is displayed in the local preview, and the complete set is passed to `addMoment()`. Pressing Use uploaded photos reuses the whole set. Use camera returns to camera mode without clearing saved moments. Generation checks discard decoding results after cancellation or clearing. Selecting fewer images than a layout needs repeats the available photos in output slots. Files beyond the first four are ignored.

### 5. Composition and restyling

`renderMoment()` reads the selected moment's saved settings and rebuilds its destination canvas:

| Layout        | Output width | Columns × rows | Photo count |
| ------------- | ------------ | -------------- | ----------- |
| Classic strip | 600 px       | 1 × 4          | 4           |
| Grid          | 1000 px      | 2 × 2          | 4           |
| Solo          | 850 px       | 1 × 1          | 1           |

Default padding is 36 px and gaps are 22 px; both are editable. Footer allocation is 100 px only when a caption or date is requested, otherwise zero. Each photo slot uses a 4:3 ratio. Canvas height follows the computed slot heights, rows, gaps, padding, and footer; assigning it to a canvas converts fractional values to integer dimensions.

The renderer fills the frame and draws its selected pattern beneath the photos, leaving any caption footer clear. It then clips each photo slot and draws a centered image using `drawCover()`. `context.save()`/`restore()` isolate clipping and transforms. Filtering processes only source-photo canvases, keeping frame and footer text unfiltered. The image index wraps through the raw photo array when there are fewer photos than slots. Solo renders the first photo.

The renderer applies each source photo's zoom, crop position, rotation, and mirror inside its clipped slot. Quarter turns swap crop dimensions so the rotated image still covers its slot. Transforms and filters are applied only during composition; raw pixels stay unchanged. The caption uses the selected font and shrinks to fit down to 12 px. The date is drawn only when enabled. There is no brand text or fallback caption. Footer text contrast follows the custom frame color. Stickers are paths and ellipses drawn by `PhotoStickers.draw()`, rather than font glyphs, so their shape is consistent across browsers and export resolutions.

`filterValue(settings)` describes the preset, brightness, and contrast. The live video uses CSS filters. Saved photos, previews, thumbnails, and downloads use `PhotoEffects.filteredPhoto()`: it reads pixels with `getImageData()`, applies the preset RGB matrices while preserving alpha, and writes the processed pixels to a separate canvas. A WeakMap caches only the latest processed version of each source photo. Raw photos remain untouched. This avoids the [limited browser support of canvas filters](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/filter), including Safari versions where the old editor silently left photos unchanged. Slider redraws are coalesced into one animation frame; closing the editor renders the latest settings synchronously. Downloads first await local font loading, then render the latest settings before encoding.

### 6. Gallery and download

`addMoment()` checks the 12-moment limit, stores raw canvases, renders a JPEG thumbnail, refreshes the gallery, and opens the result dialog. `renderGallery()` reconstructs cards with edit and delete buttons. Deleting removes the moment from the collection; clearing the session also removes the imported preview and stops the camera after the in-app confirmation.

`downloadMoment()` waits for `captionFontsReady`, then redraws the selected moment with its saved settings, then uses `canvas.toBlob()` to encode PNG or JPEG. JPEG requests quality `0.95`; PNG is lossless. A temporary link with a `photoxoot-<timestamp>` filename triggers the browser download. Its object URL is revoked after ten seconds. The success toast means a download was requested; browser settings determine whether it is saved automatically or prompts for a destination.

## Function reference

The tables cover all named application functions and the public helper APIs. Private effect helpers and inline handlers are described separately.

| Function                                               | Inputs / result                                     | Responsibility                                                                                    |
| ------------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `getElement(id)`                                       | Element ID → DOM element or `null`                  | Short lookup helper; callers expect required HTML IDs to exist.                                   |
| `toast(message)`                                       | Text; no return value                               | Updates the live status region and schedules hiding after 4.2 seconds.                            |
| `filterValue(settings = null)`                         | Optional saved settings → string                    | Combines the selected preset, brightness, and contrast.                                           |
| `updatePreview()`                                      | No parameters                                       | Updates the booth video/import/demo CSS filters.                                                  |
| `resetCustomization()`                                 | No parameters                                       | Restores defaults through existing option handlers and form values.                               |
| `stopCamera()`                                         | No parameters                                       | Invalidates pending work, stops tracks, and restores camera controls.                             |
| `startCamera()`                                        | No parameters → `Promise<boolean>`                  | Requests, attaches, and starts the camera; handles stale requests and errors.                     |
| `shutterSound()`                                       | No parameters                                       | Plays the two-part mechanical shutter on the gesture-activated audio context.                     |
| `drawCover(context, image, x, y, width, height, edit)` | Drawing context, image source, destination geometry | Scales pixels to cover a rectangle, applying zoom and pan. Callers provide clipping and rotation. |
| `snapshot(mirror = state.mirror)`                      | No parameters → canvas                              | Captures raw video pixels using the capture sequence’s snapshotted mirror setting.                |
| `pause(ms)`                                            | Milliseconds → `Promise`                            | Timeout helper used for countdown and inter-shot spacing.                                         |
| `capture()`                                            | No parameters → `Promise<void>`                     | Coordinates source checks, countdowns, snapshots, cancellation, and moment creation.              |
| `importPhotos(event)`                                  | File-input change event → `Promise<void>`           | Validates, decodes, scales, and releases local files; creates the imported moment.                |
| `renderMoment(moment, canvas)`                         | Stored moment and destination canvas                | Composes photos, frame, filters, caption, date, and sticker. Mutates the destination canvas.      |
| `addMoment(photos, settings)`                          | Array of raw canvases                               | Enforces the gallery limit, creates a moment and thumbnail, then opens it.                        |
| `openMoment(moment)`                                   | Stored moment                                       | Loads the moment's saved settings and opens its editor.                                           |
| `renderGallery()`                                      | No parameters                                       | Rebuilds the count, empty state, cards, and edit/delete actions.                                  |
| `downloadMoment()`                                     | No parameters → `Promise<void>`                     | Encodes and requests download of the selected result.                                             |
| `showInfo(title, content)`                             | Trusted title and HTML content                      | Inserts application-owned information and opens the info dialog. Never pass untrusted input.      |
| `toggleFullscreen()`                                   | No parameters → `Promise<void>`                     | Toggles fullscreen on the viewfinder or reports browser limitations.                              |

### Editor function reference

| Function                                             | Responsibility                                                                                              |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `createMomentSettings()`                             | Copies booth defaults into independent settings for a newly created moment.                                 |
| `drawFramePattern(context, settings, width, height)` | Draws the selected repeating pattern under photos, using saved color and scale, with isolated canvas state. |
| `frameTextColor(hexColor)`                           | Selects light or dark footer text from the frame color's weighted brightness.                               |
| `refreshEditorPreview()`                             | Redraws the selected moment after a design or photo edit.                                                   |
| `syncEditor()`                                       | Loads saved design values into editor controls, then refreshes photo tools and composition.                 |
| `renderPhotoTools()`                                 | Creates small source-photo thumbnails and updates zoom, mirror, and reorder controls.                       |
| `movePhoto(direction)`                               | Swaps adjacent source photos and their transform records together; updates selection.                       |
| `resetMomentEdits()`                                 | Restores original settings, photo order, and identity transforms for only this moment.                      |

`editorFields` maps input IDs to saved property names and conversion types. Its input listeners convert range/select values to numbers where needed and checkbox values to booleans before rendering. Photo-transform buttons operate on `selectedPhotoIndex`. Editor form submission is prevented so Enter cannot reload the page.

### Reliability and phone helpers

| Function                                         | Responsibility                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `updateCaptureControls()`                        | Locks camera/style inputs during work and restores the correct capture/cancel labels. |
| `updateSourceView()`                             | Restores camera, upload, or empty state and exposes Use camera after imports.         |
| `prepareShutterSound()`                          | Activates a shared AudioContext during a direct user gesture for iPhone playback.     |
| `PhotoEffects.filteredPhoto(source, expression)` | Produces and caches portable pixel-filtered canvases without modifying source pixels. |
| `PhotoStickers.draw(context, id, x, y, size)`    | Draws scalable sticker artwork at a selected position.                                |
| `PhotoStickers.thumbnail(id)`                    | Generates a small transparent sticker preview.                                        |
| `selectEditorTab(tab)`                           | Updates active tool buttons and hides inactive tool pages.                            |
| `updatePhoneLayout()`                            | Opens phone style groups and updates gallery pagination after a breakpoint change.    |
| `updateViewportSize()`                           | Tracks Safari's actual visible height and keyboard state.                             |

### Helper internals and saved settings

`PhotoEffects` and `PhotoStickers` are immediately invoked functions that expose small public APIs while keeping drawing helpers and caches private. In `effects.js`, `colorMatrix(name, amount)` builds a 3 × 4 affine RGB matrix for brightness, contrast, sepia, saturation, grayscale, or hue rotation. `clamp(value)` limits channel values to 0–255. `filteredPhoto()` parses the preset expression, applies each matrix in order to each pixel, preserves alpha, and caches the result by source canvas and expression. Unsupported operation names throw an error; adding a filter operation requires adding its matrix implementation too.

`PhotoStickers.choices` is the shared catalog for both sticker pickers. `draw()` dispatches the chosen artwork using canvas paths, and `thumbnail()` renders that same artwork for selection buttons. Add new artwork and its catalog entry together so the booth, editor, and exports stay consistent.

Each moment's `settings` stores `layout`, `filter`, `frameColor`, `pattern`, `patternColor`, `patternScale`, `sticker`, `stickerSize`, `stickerPosition`, `caption`, `captionFont`, `brightness`, `contrast`, `padding`, `gap`, `showDate`, and `format`. Each `photoEdits` entry stores `zoom`, `rotation`, `mirror`, `panX`, and `panY`. Reordering swaps photos and their edit records together. `selectedPhotoIndex` identifies the source being edited; `editorRenderFrame` coalesces preview updates; `shutterAudio` owns the reusable audio context. None of these values persist across a page reload.

`captionFontsReady` is a promise, not a function. It starts loading bundled caption fonts during initialization and refreshes the preview after loading settles. The local Vladimir font lookup can fail normally; the font stack then uses bundled Allura. Other font-load failures are caught so the editor remains usable with browser fallback fonts.

### Inline event handlers

| Event or control                     | Responsibility                                                                                           |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Style tabs / editor tabs             | Select the active control page and update pressed states; editor panes use `hidden`.                     |
| Gallery previous/next                | Change `galleryPage` and redraw the visible pair of moments.                                             |
| Viewport resize/scroll               | Update visible height, top offset, and keyboard state.                                                   |
| Mobile navigation buttons            | Set the body panel attribute, update pressed state, and scroll to top.                                   |
| Filter/frame/layout/sticker buttons  | Update shared settings, visible selection, and preview. Layout also updates capture text.                |
| Brightness/contrast/caption input    | Call `updatePreview()` immediately.                                                                      |
| Mirror button                        | Toggle future capture mirroring and current video appearance.                                            |
| Flip camera button                   | Ignore while capturing; otherwise switch preferred direction, stop, and reopen.                          |
| Sound button                         | Toggle sound and announce its state.                                                                     |
| Upload button                        | Open the file chooser when capture is idle.                                                              |
| Space key                            | Capture when focus is outside inputs, selects, textareas, buttons, and summaries, and no dialog is open. |
| Clear session / confirmation         | Present the warning, then release session photos and camera resources.                                   |
| Help/privacy buttons                 | Open static application information through `showInfo()`.                                                |
| Dialog close buttons/backdrop clicks | Close the native dialog; backdrop clicks are distinguished from clicks inside its bounds.                |
| Result dialog close                  | Cache its current rendering as the thumbnail, refresh gallery, and clear selection.                      |
| Page hide / document visibility      | Stop camera hardware when leaving or hiding an active camera tab.                                        |

## Privacy and resource lifecycle

Photos and settings live in this tab's memory. There are no photo uploads, analytics, cookies, local storage, or session storage. Refreshing or closing the tab loses the session. Download favorites before leaving.

The Content Security Policy permits local scripts/styles and local/data/blob images and media, blocks app network connections with `connect-src 'none'`, and disallows embedded objects, form submissions, and base-URL changes. Inline style permission supports dynamic preview filters and color properties. Static hosting still receives normal page and asset requests.

Exports contain redrawn pixels rather than the imported file's original metadata. Camera tracks stop explicitly. Import and download object URLs are revoked after use; the shared shutter audio context is activated during a user gesture and closes when the page is hidden via pagehide. Sound uses a brief filtered-noise envelope with two clicks, rather than an oscillator beep. Removing moments releases their references, allowing garbage collection; memory reclamation timing belongs to the browser. Twelve moments can still use substantial memory because each retains raw canvases and a thumbnail.

## Coding and maintenance conventions

- Use two-space indentation, UTF-8, LF newlines, semicolons, and consistent formatting. `.editorconfig` and `.prettierrc.json` capture the conventions.
- Use descriptive identifiers and `const` for references that are not reassigned; use `let` for changing session values.
- Keep comments focused on intent, ownership, cancellation, browser behavior, and non-obvious geometry. JSDoc documents the moment shape and drawing contracts.
- Keep user-controlled text out of `innerHTML`. Caption text is drawn into a canvas; `showInfo()` accepts only trusted application HTML.
- Preserve labels, keyboard behavior, focus indicators, and pressed states when adding controls.
- Pair every new resource allocation with cleanup: media tracks, object URLs, audio contexts, and timers.
- Keep runtime processing local. Adding external fonts, APIs, or storage changes the privacy model and may require CSP changes and documentation.

To change appearance, edit HTML content or CSS component rules. Add filters and frames through the catalogs in `app.js`. The final palette entry currently represents Midnight: swatch contrast uses index `6`, so update those conditions if rearranging colors. Add a layout by updating its HTML button, shot-count rules, and `renderMoment()` geometry together. Resource limits are centralized in `MAX_MOMENTS`, `MAX_IMPORT_FILES`, `MAX_IMPORT_BYTES`, and `MAX_IMPORT_DIMENSION`.

## Validation

The website has no runtime dependencies. Development-only Playwright and Prettier dependencies are pinned in `package.json` and `pnpm-lock.yaml`. To run the regression suite:

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium webkit
pnpm test
```

Tests cover distinct pattern rendering without changing photo pixels, successful bundled-font loading and distinct caption output, real pixel changes without native canvas-filter support, PNG/JPEG output, drawn stickers, crop/reorder/reset, independent edits, cancelled imports, camera recovery, and every phone tool page at 320×568 through portrait and landscape sizes. WebKit is the Safari engine; physical camera permissions, iOS download UI, and audio playback still need device testing. Set `CHROME_EXECUTABLE` to use an installed Chrome or `TEST_BROWSERS=webkit` to run only WebKit. For syntax and formatting:

```bash
for file in dist/*.js; do node --check "$file"; done
pnpm format:check
```

Use `pnpm exec prettier --write dist README.md tests package.json` to apply formatting. Formatting tools are development utilities; the deployed app does not load them.

Before publishing, serve the site locally and check:

1. Camera permission allowed, denied, and unavailable; stopping and switching cameras; hiding the tab during a countdown.
2. Solo, Strip, and Grid capture with zero and nonzero timers; mirrored capture and optional sound.
3. One to four valid imports, invalid files, oversized files, and fewer photos than output slots.
4. Every filter/frame/sticker, brightness/contrast extremes, empty and long captions, and reset behavior.
5. Reopening and deleting moments, reaching the gallery limit, and confirming/canceling clear session.
6. PNG and JPEG downloads, including their actual dimensions and appearance.
7. Independent saved edits for two moments, reopening, per-photo rotation/mirror/zoom/order, custom colors and spacing, blank caption/date, reset, and watermark-free exports.
8. Desktop and phone widths, bottom navigation, keyboard capture, dialog focus/Escape/backdrop closing, and reduced motion.

Real camera permission, hardware switching, sound, and fullscreen need checks in the target browsers and devices. The application does not include persistent recovery, cloud sync, or sharing services.
