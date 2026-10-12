<<<<<<< HEAD
# PhotoXoot
PhotoBooth
=======
# Little Moments

A mobile-friendly photo booth built with vanilla HTML, CSS, and JavaScript. Everything happens in the browser: no backend, dependencies, API keys, or build step.

## Project structure

```text
little-moments/
├── README.md          # This guide
└── dist/              # The complete website; upload this folder to a static host
    ├── index.html     # Page structure, camera preview, controls, gallery, and dialogs
    ├── style.css      # Main theme, desktop layout, and shared component styles
    ├── mobile.css     # Mobile overrides, larger touch controls, and bottom navigation
    └── app.js         # Camera, photo processing, settings, gallery, and downloads
```

`index.html` loads `style.css` first, then `mobile.css`, so mobile rules can override the main styles. It loads `app.js` after the HTML has been parsed.

## Run it locally

Extract the ZIP, open a terminal in the project folder, and run:

```bash
python3 -m http.server 8080 --directory dist
```

Open **http://localhost:8080** in a modern browser and allow camera access when prompted. No package installation is needed.

To put it online, upload the contents of `dist/` to a static host with HTTPS. Camera access requires HTTPS or localhost. Opening a plain HTTP address from your phone to your computer may show the site, but camera access can be blocked.

## How it works

1. **Choose your photos.** Enable the camera, or import up to four JPG, PNG, or WebP images from your device. Imports accept files up to 20 MB each.
2. **Customize the result.** Select a strip, grid, or solo layout. Add filters, brightness, contrast, a frame color, caption, and sticker.
3. **Capture a moment.** The camera uses the browser's `getUserMedia()` API. A timer runs before each shot, and JavaScript copies the video frame onto an HTML canvas. A strip or grid captures four shots; a solo layout captures one.
4. **Build the finished image.** Another canvas combines the photos with your chosen styling. Imported photos repeat to fill a four-photo layout if you select fewer than four.
5. **Save it.** The gallery holds up to 12 moments for the current session. Download converts the finished canvas into a PNG or JPEG file on your device.

On phones, bottom navigation switches between **Camera**, **Customize**, and **My moments**. Larger screens show the sections together. On desktop, Space also triggers capture when you are not typing or using another control.

## Inside the JavaScript

- `state` holds layout, filter, frame color, sticker, mirror, and sound choices.
- `startCamera()` and `stopCamera()` manage the camera stream.
- `capture()` handles the countdown and calls `snapshot()` for each photo.
- `renderMoment()` draws the finished layout and decorations.
- `moments` keeps the original photos in memory; `renderGallery()` shows their thumbnails.
- The download button uses `canvas.toBlob()` to create the image file.

Customization settings are shared across the session. To restyle an existing moment, change the controls, then reopen it using **Edit & save**.

## Privacy and session behavior

Photos stay in this tab's memory. The app does not upload them, track visitors, use cookies, or save photos to browser storage. Refreshing or closing the tab loses the session, so download your favorites first.

**Stop camera** stops the active stream. The camera also stops when the page is hidden or closed. **Clear session** removes the session photos and turns off the camera; downloaded files remain on your device.

Exports redraw image pixels and do not copy imported photo metadata. The page's Content Security Policy blocks network connections from app code. A static hosting provider still receives normal requests for the page and its files.

## Make changes

Edit `index.html` for page content, `style.css` for the main appearance, and `mobile.css` for phone layouts. Edit `app.js` for behavior; its `filters` and `colors` arrays define the available filter and frame options. Reload the browser to see your changes.
>>>>>>> aa9110d (Add mobile-specific styles and base styles for improved responsiveness)
