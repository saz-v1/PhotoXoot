"use strict";

/**
 * @typedef {Object} Moment
 * @property {string} id Session-local identifier.
 * @property {HTMLCanvasElement[]} photos Raw pixels retained for later restyling.
 * @property {string} date Localized capture/import date displayed in the footer.
 * @property {HTMLCanvasElement[]} originalPhotos Source references in their original order.
 * @property {Object} initialSettings Initial design snapshot for resetting the editor.
 * @property {Object} settings Independent layout, styling, and export preferences.
 * @property {{zoom: number, rotation: number, mirror: boolean}[]} photoEdits Per-photo transforms.
 * @property {string} [thumbnail] JPEG data URL cached for the gallery.
 */
/** Resolve a required HTML element by its stable ID. */
const getElement = (id) => document.getElementById(id);
document.querySelectorAll("[data-panel]").forEach((button) => {
  button.onclick = () => {
    document.body.dataset.mobilePanel = button.dataset.panel;
    document
      .querySelectorAll("[data-panel]")
      .forEach((other) => other.setAttribute("aria-pressed", other === button));
    window.scrollTo({ top: 0, behavior: "instant" });
  };
});
// Browser-native filter expressions are shared by the preview and canvas export.
const MAX_MOMENTS = 12;
const MAX_IMPORT_FILES = 4;
const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
const MAX_IMPORT_DIMENSION = 1600;
const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const filters = [
  { name: "Original", value: "none" },
  { name: "Vintage", value: "sepia(.4) saturate(.8) contrast(.92)" },
  { name: "B&W", value: "grayscale(1)" },
  { name: "Warm", value: "sepia(.25) saturate(1.3)" },
  { name: "Dreamy", value: "saturate(.65) contrast(.85) brightness(1.1)" },
  { name: "Cool", value: "hue-rotate(20deg) saturate(.75)" },
];
const colors = [
  { name: "Vanilla", value: "#faf7ed" },
  { name: "Sage", value: "#dce3cf" },
  { name: "Rose", value: "#ead1ce" },
  { name: "Butter", value: "#f1e2af" },
  { name: "Sky", value: "#d2e0e4" },
  { name: "Lilac", value: "#ded6e8" },
  { name: "Midnight", value: "#363b34" },
];
// Booth settings seed new moments; the result editor keeps independent settings per moment.
const state = {
  layout: "strip",
  filter: 0,
  color: 0,
  sticker: "",
  mirror: true,
  sound: false,
};
// Transient session resources. Photos never enter persistent browser storage.
let stream = null;
let facing = "user";
let uploaded = null;
/** @type {Moment[]} */
let moments = [];
let busy = false;
// Incrementing this token invalidates pending camera requests and captures.
let generation = 0;
/** @type {Moment | null} */
let selectedMoment = null;
let toastTimer;
let selectedPhotoIndex = 0;
/** Show a temporary status message, replacing any previous toast. */
function toast(message) {
  getElement("toast").textContent = message;
  getElement("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (getElement("toast").hidden = true), 4200);
}
/** Combine the selected filter with the current brightness and contrast controls. */
function filterValue(settings = null) {
  const preset = filters[settings ? settings.filter : state.filter].value;
  const brightness = settings
    ? settings.brightness
    : getElement("brightness").value;
  const contrast = settings ? settings.contrast : getElement("contrast").value;
  return `${preset === "none" ? "" : preset} brightness(${brightness}%) contrast(${contrast}%)`.trim();
}
/** Update booth previews; saved moments use independent editor settings. */
function updatePreview() {
  getElement("video").style.filter = filterValue();
  getElement("uploadPreview").style.filter = filterValue();
  getElement("demoArt").style.filter = filterValue();
}
// Build filter and frame controls from the option catalogs.
filters.forEach((filter, index) => {
  const button = document.createElement("button");
  button.className = "filter" + (index === 0 ? " active" : "");
  button.setAttribute("aria-pressed", index === 0);
  button.textContent = filter.name;
  button.onclick = () => {
    state.filter = index;
    document.querySelectorAll(".filter").forEach((element, i) => {
      element.classList.toggle("active", i === index);
      element.setAttribute("aria-pressed", i === index);
    });
    updatePreview();
  };
  getElement("filters").append(button);
});
colors.forEach((color, index) => {
  const button = document.createElement("button");
  button.className = "swatch" + (index === 0 ? " active" : "");
  button.style.setProperty("--swatch", color.value);
  button.style.setProperty("--tick", index === 6 ? "#fff" : "#69775a");
  button.setAttribute("aria-label", color.name + " frame");
  button.setAttribute("aria-pressed", index === 0);
  button.onclick = () => {
    state.color = index;
    getElement("colorName").textContent = color.name;
    document.querySelectorAll(".swatch").forEach((element, i) => {
      element.classList.toggle("active", i === index);
      element.setAttribute("aria-pressed", i === index);
    });
    updatePreview();
  };
  getElement("swatches").append(button);
});
// Customization controls keep visible selection and aria-pressed in sync.
document.querySelectorAll(".layout").forEach((button) => {
  button.onclick = () => {
    state.layout = button.dataset.layout;
    document.querySelectorAll(".layout").forEach((element) => {
      element.classList.toggle("active", element === button);
      element.setAttribute("aria-pressed", element === button);
    });
    const count = state.layout === "single" ? 1 : 4;
    getElement("layoutCount").textContent =
      count + " photo" + (count === 1 ? "" : "s");
    getElement("captureText").textContent =
      count === 1 ? "Take a photo" : "Take 4 photos";
    getElement("boothNote").textContent =
      count === 1
        ? "1 photo, then edit and download."
        : "4 photos, then edit and download.";
    updatePreview();
  };
});
document.querySelectorAll("[data-sticker]").forEach((button) => {
  button.setAttribute("aria-pressed", button.classList.contains("active"));
  button.onclick = () => {
    state.sticker = button.dataset.sticker;
    document.querySelectorAll("[data-sticker]").forEach((element) => {
      element.classList.toggle("active", element === button);
      element.setAttribute("aria-pressed", element === button);
    });
    updatePreview();
  };
});
["brightness", "contrast", "caption"].forEach((id) =>
  getElement(id).addEventListener("input", updatePreview),
);
/** Restore styling, timer, and export defaults while retaining session photos. */
function resetCustomization() {
  document.querySelector('[data-layout="strip"]').click();
  document.querySelector(".filter").click();
  document.querySelector(".swatch").click();
  document.querySelector('[data-sticker=""]').click();
  getElement("brightness").value = 100;
  getElement("contrast").value = 100;
  getElement("caption").value = "";
  getElement("timer").value = "3";
  getElement("format").value = "png";
  updatePreview();
  toast("Style reset. Your saved photos are unchanged.");
}
getElement("resetBtn").onclick = resetCustomization;
/** Stop all media tracks and cancel pending camera work by advancing generation. */
function stopCamera() {
  generation++;
  if (stream) stream.getTracks().forEach((track) => track.stop());
  stream = null;
  getElement("video").srcObject = null;
  getElement("video").hidden = true;
  getElement("cameraLabel").textContent = "Camera off";
  getElement("cameraLabel").classList.remove("on");
  getElement("stopBtn").hidden = true;
  busy = false;
  getElement("captureBtn").disabled = false;
  getElement("countdown").hidden = true;
  if (!uploaded) {
    getElement("welcome").hidden = false;
    getElement("demoArt").hidden = false;
  }
}
const stopButton = document.createElement("button");
stopButton.id = "stopBtn";
stopButton.className = "control";
stopButton.textContent = "Stop camera";
stopButton.hidden = true;
stopButton.onclick = () => {
  stopCamera();
  toast("Camera off. Your photos stay in this tab.");
};
document
  .querySelector(".camera-controls")
  .insertBefore(stopButton, getElement("soundBtn"));
/** Request the preferred camera. Resolve true only when its preview is ready. */
async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    toast(
      "Camera needs HTTPS or localhost and a supported browser. You can still upload photos.",
    );
    return false;
  }
  const request = ++generation;
  getElement("enableBtn").disabled = true;
  getElement("enableBtn").textContent = "Opening camera…";
  try {
    const next = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: facing },
        width: { ideal: 1280 },
        height: { ideal: 960 },
      },
    });
    if (request !== generation) {
      next.getTracks().forEach((track) => track.stop());
      return false;
    }
    if (stream) stream.getTracks().forEach((track) => track.stop());
    stream = next;
    uploaded = null;
    getElement("uploadPreview").hidden = true;
    getElement("video").srcObject = stream;
    getElement("video").hidden = false;
    getElement("video").classList.toggle("mirrored", state.mirror);
    await getElement("video").play();
    if (request !== generation) return false;
    getElement("welcome").hidden = true;
    getElement("demoArt").hidden = true;
    getElement("cameraLabel").textContent = "Camera on";
    getElement("cameraLabel").classList.add("on");
    getElement("stopBtn").hidden = false;
    updatePreview();
    return true;
  } catch (error) {
    toast(
      error.name === "NotAllowedError"
        ? "Camera permission was declined. Allow it in browser settings, or upload a photo."
        : error.name === "NotFoundError"
          ? "No camera found. Try uploading your favorite photos."
          : "Camera unavailable. Close other camera apps, or upload a photo.",
    );
    return false;
  } finally {
    getElement("enableBtn").disabled = false;
    getElement("enableBtn").textContent = "Enable camera";
  }
}
getElement("enableBtn").onclick = startCamera;
getElement("mirrorBtn").onclick = () => {
  state.mirror = !state.mirror;
  getElement("mirrorBtn").classList.toggle("active", state.mirror);
  getElement("mirrorBtn").setAttribute("aria-pressed", state.mirror);
  getElement("video").classList.toggle("mirrored", state.mirror);
};
getElement("switchBtn").onclick = async () => {
  if (busy) return;
  if (!stream) {
    toast("Enable your camera first.");
    return;
  }
  facing = facing === "user" ? "environment" : "user";
  stopCamera();
  await startCamera();
};
getElement("soundBtn").onclick = () => {
  state.sound = !state.sound;
  getElement("soundBtn").classList.toggle("active", state.sound);
  getElement("soundBtn").setAttribute("aria-pressed", state.sound);
  toast(state.sound ? "Shutter sound on." : "Shutter sound off.");
};
/** Play a short synthesized shutter tone when sound is enabled. */
function shutterSound() {
  if (!state.sound) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContextClass(),
      oscillator = context.createOscillator(),
      gain = context.createGain();
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.frequency.value = 650;
    gain.gain.setValueAtTime(0.07, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.09);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.1);
    oscillator.onended = () => context.close();
  } catch {
    // Audio is optional; unavailable audio must not prevent photo capture.
  }
}
/**
 * Scale and center an image to fill a destination rectangle, like object-fit: cover.
 * The caller clips the destination when overflow must be hidden.
 * @param {CanvasRenderingContext2D} context
 * @param {HTMLVideoElement | HTMLImageElement | HTMLCanvasElement} image
 * @param {number} x Left edge in canvas pixels.
 * @param {number} y Top edge in canvas pixels.
 * @param {number} width Destination width.
 * @param {number} height Destination height.
 */
function drawCover(context, image, x, y, width, height) {
  const imageWidth = image.videoWidth || image.naturalWidth || image.width,
    imageHeight = image.videoHeight || image.naturalHeight || image.height;
  const scale = Math.max(width / imageWidth, height / imageHeight);
  context.drawImage(
    image,
    (width - imageWidth * scale) / 2 + x,
    (height - imageHeight * scale) / 2 + y,
    imageWidth * scale,
    imageHeight * scale,
  );
}
/** Copy the current video frame into a 1000 × 750 canvas, applying mirror only. */
function snapshot() {
  const canvas = document.createElement("canvas");
  canvas.width = 1000;
  canvas.height = 750;
  const context = canvas.getContext("2d");
  if (state.mirror) {
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
  }
  drawCover(context, getElement("video"), 0, 0, canvas.width, canvas.height);
  return canvas;
}
/** Resolve after a delay without blocking the browser event loop. */
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** Capture one or four raw frames after countdowns, or reuse the imported preview. */
async function capture() {
  if (busy) return;
  if (!stream && !uploaded) {
    await startCamera();
    return;
  }
  if (uploaded) {
    addMoment([uploaded]);
    return;
  }
  if (!getElement("video").videoWidth) {
    toast("Camera is warming up. Try again in a moment.");
    return;
  }
  busy = true;
  getElement("captureBtn").disabled = true;
  const token = generation,
    photos = [],
    total = state.layout === "single" ? 1 : 4,
    delay = Number(getElement("timer").value);
  try {
    for (let shot = 0; shot < total; shot++) {
      for (let n = delay; n > 0; n--) {
        if (token !== generation) return;
        getElement("countdown").textContent = n;
        getElement("countdown").hidden = false;
        getElement("captureText").textContent = `Pose ${shot + 1} of ${total}`;
        await pause(1000);
      }
      if (token !== generation) return;
      getElement("countdown").hidden = true;
      photos.push(snapshot());
      shutterSound();
      getElement("flash").classList.remove("flash");
      // Force layout so removing and re-adding the class restarts the flash animation.
      void getElement("flash").offsetWidth;
      getElement("flash").classList.add("flash");
      if (shot < total - 1) await pause(650);
    }
    addMoment(photos);
  } finally {
    busy = false;
    getElement("captureBtn").disabled = false;
    getElement("countdown").hidden = true;
    getElement("captureText").textContent =
      state.layout === "single" ? "Take a photo" : "Take 4 photos";
  }
}
getElement("captureBtn").onclick = capture;
document.addEventListener("keydown", (event) => {
  if (
    event.code === "Space" &&
    !["INPUT", "SELECT", "TEXTAREA", "BUTTON", "SUMMARY"].includes(
      document.activeElement.tagName,
    ) &&
    !document.querySelector("dialog[open]")
  ) {
    event.preventDefault();
    capture();
  }
});
getElement("uploadBtn").onclick = () => {
  if (!busy) getElement("fileInput").click();
};
/** Validate and decode up to four local files, downscale them, then create a moment. */
async function importPhotos(event) {
  const files = Array.from(event.target.files);
  if (!files.length) return;
  const images = [];
  for (const file of files.slice(0, MAX_IMPORT_FILES)) {
    if (
      !SUPPORTED_IMAGE_TYPES.includes(file.type) ||
      file.size > MAX_IMPORT_BYTES
    ) {
      toast("Choose a JPG, PNG, or WebP under 20 MB.");
      continue;
    }
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      const ratio = Math.min(
        1,
        MAX_IMPORT_DIMENSION / Math.max(image.width, image.height),
      );
      canvas.width = Math.round(image.width * ratio);
      canvas.height = Math.round(image.height * ratio);
      canvas
        .getContext("2d")
        .drawImage(image, 0, 0, canvas.width, canvas.height);
      images.push(canvas);
    } catch {
      toast("That image could not be opened. Try another photo.");
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  event.target.value = "";
  if (images.length) {
    stopCamera();
    uploaded = images[0];
    getElement("uploadPreview").src = uploaded.toDataURL("image/jpeg", 0.9);
    getElement("uploadPreview").hidden = false;
    getElement("welcome").hidden = true;
    getElement("demoArt").hidden = true;
    getElement("cameraLabel").textContent = "Uploaded photo";
    updatePreview();
    addMoment(images);
    if (images.length < 4 && state.layout !== "single")
      toast(
        "Photo added. Empty slots repeat your photos. Choose Solo shot for one.",
      );
  }
}
getElement("fileInput").onchange = importPhotos;
/** Snapshot booth defaults so editing one moment never restyles another. */
function createMomentSettings() {
  return {
    layout: state.layout,
    filter: state.filter,
    frameColor: colors[state.color].value,
    sticker: state.sticker,
    caption: getElement("caption").value.trim(),
    brightness: Number(getElement("brightness").value),
    contrast: Number(getElement("contrast").value),
    padding: 36,
    gap: 22,
    showDate: false,
    captionFont: "Georgia",
    format: getElement("format").value,
  };
}

/** Get readable footer text against any custom frame color. */
function frameTextColor(hexColor) {
  const channels = hexColor
    .slice(1)
    .match(/.{2}/g)
    .map((value) => parseInt(value, 16));
  const brightness =
    channels[0] * 0.299 + channels[1] * 0.587 + channels[2] * 0.114;
  return brightness < 140 ? "#faf7ed" : "#313d32";
}

/**
 * Compose a saved moment without modifying its raw photos. There is no branding
 * or automatic caption in exports; only explicitly chosen text is drawn.
 * @param {Moment} moment
 * @param {HTMLCanvasElement} canvas
 */
function renderMoment(moment, canvas) {
  const settings = moment.settings;
  const count = settings.layout === "single" ? 1 : 4;
  const columns = settings.layout === "grid" ? 2 : 1;
  const rows = count / columns;
  const { padding, gap } = settings;
  const width =
    settings.layout === "strip" ? 600 : settings.layout === "grid" ? 1000 : 850;
  const photoWidth = (width - padding * 2 - gap * (columns - 1)) / columns;
  const photoHeight = photoWidth * 0.75;
  const caption = settings.caption.trim();
  // Omit empty footer space when neither caption nor date has been requested.
  const footer = caption || settings.showDate ? 100 : 0;
  const photoBottom = padding + rows * photoHeight + gap * (rows - 1);
  canvas.width = width;
  canvas.height = photoBottom + padding + footer;
  const context = canvas.getContext("2d");
  context.fillStyle = settings.frameColor;
  context.fillRect(0, 0, width, canvas.height);
  for (let slot = 0; slot < count; slot++) {
    const photoIndex = slot % moment.photos.length;
    const edit = moment.photoEdits[photoIndex];
    const x = padding + (slot % columns) * (photoWidth + gap);
    const y = padding + Math.floor(slot / columns) * (photoHeight + gap);
    context.save();
    context.beginPath();
    context.rect(x, y, photoWidth, photoHeight);
    context.clip();
    context.filter = filterValue(settings);
    context.translate(x + photoWidth / 2, y + photoHeight / 2);
    context.rotate((edit.rotation * Math.PI) / 180);
    context.scale(edit.mirror ? -edit.zoom : edit.zoom, edit.zoom);
    // Swap crop dimensions for quarter turns so rotated photos still fill the slot.
    const sideways = edit.rotation % 180 !== 0;
    const cropWidth = sideways ? photoHeight : photoWidth;
    const cropHeight = sideways ? photoWidth : photoHeight;
    drawCover(
      context,
      moment.photos[photoIndex],
      -cropWidth / 2,
      -cropHeight / 2,
      cropWidth,
      cropHeight,
    );
    context.restore();
  }
  context.fillStyle = frameTextColor(settings.frameColor);
  context.textAlign = "center";
  if (caption) {
    let fontSize = Math.round(width / 26);
    const setCaptionFont = () => {
      context.font = `${settings.captionFont === "Georgia" ? "italic " : ""}${fontSize}px ${settings.captionFont}`;
    };
    setCaptionFont();
    while (
      context.measureText(caption).width > width - Math.max(padding * 2, 24) &&
      fontSize > 12
    ) {
      fontSize--;
      setCaptionFont();
    }
    context.fillText(
      caption,
      width / 2,
      photoBottom + (settings.showDate ? 45 : 60),
    );
  }
  if (settings.showDate) {
    context.font = `${Math.round(width / 65)}px Arial`;
    context.fillText(moment.date, width / 2, photoBottom + (caption ? 77 : 60));
  }
  if (settings.sticker) {
    context.save();
    context.font = `${width / 12}px Georgia`;
    context.fillStyle =
      settings.sticker === "♥"
        ? "#cc7e69"
        : frameTextColor(settings.frameColor);
    context.translate(width - Math.max(padding, width / 16), photoBottom - 12);
    context.rotate(0.15);
    context.fillText(settings.sticker, 0, 0);
    context.restore();
  }
}

// Editor inputs map to saved properties. Numeric values remain numbers in state.
const editorFields = {
  editLayout: ["layout", "string"],
  editFilter: ["filter", "number"],
  editFrameColor: ["frameColor", "string"],
  editCaption: ["caption", "string"],
  editCaptionFont: ["captionFont", "string"],
  editSticker: ["sticker", "string"],
  editBrightness: ["brightness", "number"],
  editContrast: ["contrast", "number"],
  editPadding: ["padding", "number"],
  editGap: ["gap", "number"],
  editShowDate: ["showDate", "boolean"],
  editFormat: ["format", "string"],
};

/** Render edits immediately; thumbnail caching happens when the editor closes. */
function refreshEditorPreview() {
  if (selectedMoment) renderMoment(selectedMoment, getElement("resultCanvas"));
}

/** Load the selected moment's settings and refresh its individual-photo tools. */
function syncEditor() {
  for (const [id, [property, type]] of Object.entries(editorFields)) {
    const input = getElement(id);
    if (type === "boolean") input.checked = selectedMoment.settings[property];
    else input.value = selectedMoment.settings[property];
  }
  renderPhotoTools();
  refreshEditorPreview();
}

/** Show source-photo thumbnails and the selected photo's zoom/mirror state. */
function renderPhotoTools() {
  const photos = getElement("editPhotos");
  photos.replaceChildren();
  selectedMoment.photos.forEach((photo, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", `Edit photo ${index + 1}`);
    button.setAttribute("aria-pressed", index === selectedPhotoIndex);
    const image = document.createElement("img");
    // Generate small thumbnails rather than serializing full-resolution canvases.
    const thumbnail = document.createElement("canvas");
    thumbnail.width = 96;
    thumbnail.height = 72;
    drawCover(thumbnail.getContext("2d"), photo, 0, 0, 96, 72);
    image.src = thumbnail.toDataURL("image/jpeg", 0.8);
    image.alt = "";
    button.append(image, document.createTextNode(`Photo ${index + 1}`));
    button.onclick = () => {
      selectedPhotoIndex = index;
      renderPhotoTools();
    };
    photos.append(button);
  });
  const edit = selectedMoment.photoEdits[selectedPhotoIndex];
  getElement("editZoom").value = edit.zoom;
  getElement("editPhotoMirror").setAttribute("aria-pressed", edit.mirror);
  getElement("movePhotoLeft").disabled = selectedPhotoIndex === 0;
  getElement("movePhotoRight").disabled =
    selectedPhotoIndex === selectedMoment.photos.length - 1;
}

/** Move raw pixels and their transforms together, preserving the selected photo. */
function movePhoto(direction) {
  if (!selectedMoment) return;
  const target = selectedPhotoIndex + direction;
  if (target < 0 || target >= selectedMoment.photos.length) return;
  for (const collection of [selectedMoment.photos, selectedMoment.photoEdits]) {
    [collection[selectedPhotoIndex], collection[target]] = [
      collection[target],
      collection[selectedPhotoIndex],
    ];
  }
  selectedPhotoIndex = target;
  renderPhotoTools();
  refreshEditorPreview();
}

/** Restore this moment's design and photo transforms without altering other moments. */
function resetMomentEdits() {
  if (!selectedMoment) return;
  selectedMoment.settings = { ...selectedMoment.initialSettings };
  selectedMoment.photos = [...selectedMoment.originalPhotos];
  selectedMoment.photoEdits = selectedMoment.photos.map(() => ({
    zoom: 1,
    rotation: 0,
    mirror: false,
  }));
  selectedPhotoIndex = 0;
  syncEditor();
}

filters.forEach((filter, index) => {
  getElement("editFilter").add(new Option(filter.name, String(index)));
});
for (const [id, [property, type]] of Object.entries(editorFields)) {
  getElement(id).addEventListener("input", (event) => {
    if (!selectedMoment) return;
    selectedMoment.settings[property] =
      type === "boolean"
        ? event.target.checked
        : type === "number"
          ? Number(event.target.value)
          : event.target.value;
    refreshEditorPreview();
  });
}
getElement("editZoom").oninput = (event) => {
  if (!selectedMoment) return;
  selectedMoment.photoEdits[selectedPhotoIndex].zoom = Number(
    event.target.value,
  );
  refreshEditorPreview();
};
getElement("rotatePhoto").onclick = () => {
  if (!selectedMoment) return;
  const edit = selectedMoment.photoEdits[selectedPhotoIndex];
  edit.rotation = (edit.rotation + 90) % 360;
  refreshEditorPreview();
};
getElement("editPhotoMirror").onclick = () => {
  if (!selectedMoment) return;
  const edit = selectedMoment.photoEdits[selectedPhotoIndex];
  edit.mirror = !edit.mirror;
  getElement("editPhotoMirror").setAttribute("aria-pressed", edit.mirror);
  refreshEditorPreview();
};
getElement("movePhotoLeft").onclick = () => movePhoto(-1);
getElement("movePhotoRight").onclick = () => movePhoto(1);
getElement("resetMomentBtn").onclick = resetMomentEdits;
getElement("doneEditingBtn").onclick = () => getElement("resultDialog").close();
document
  .querySelector(".editor-controls")
  .addEventListener("submit", (event) => event.preventDefault());

/** Store raw photo canvases and a thumbnail, refresh the gallery, and open the result. */
function addMoment(photos) {
  if (moments.length >= MAX_MOMENTS) {
    toast("Session full. Download or remove a moment to make room.");
    return;
  }
  const moment = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    photos,
    originalPhotos: [...photos],
    photoEdits: photos.map(() => ({ zoom: 1, rotation: 0, mirror: false })),
    settings: createMomentSettings(),
    date: new Date().toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
  };
  moment.initialSettings = { ...moment.settings };
  moments.push(moment);
  const canvas = document.createElement("canvas");
  renderMoment(moment, canvas);
  moment.thumbnail = canvas.toDataURL("image/jpeg", 0.85);
  renderGallery();
  openMoment(moment);
}
/** Open a stored moment with its own saved design and individual-photo controls. */
function openMoment(moment) {
  selectedMoment = moment;
  selectedPhotoIndex = 0;
  syncEditor();
  getElement("resultDialog").showModal();
  // Each reopening starts at the preview rather than retaining the previous scroll position.
  getElement("resultDialog").scrollTop = 0;
}
/** Rebuild gallery cards and deletion/edit handlers from the session collection. */
function renderGallery() {
  getElement("momentCount").textContent = moments.length;
  getElement("gallery").replaceChildren();
  if (!moments.length) {
    const element = document.createElement("div");
    element.className = "empty-gallery";
    const description = document.createElement("p");
    description.textContent = "No photos yet.";
    const hint = document.createElement("span");
    hint.textContent = "Capture or upload to get started.";
    element.append(description, hint);
    getElement("gallery").append(element);
    return;
  }
  moments.forEach((moment, index) => {
    const card = document.createElement("div");
    card.className = "moment";
    const image = document.createElement("img");
    image.src = moment.thumbnail;
    image.alt = `Photo moment ${index + 1}`;
    const actions = document.createElement("div");
    actions.className = "moment-actions";
    const edit = document.createElement("button");
    edit.textContent = "Edit photo";
    edit.onclick = () => openMoment(moment);
    const remove = document.createElement("button");
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Delete moment ${index + 1}`);
    remove.onclick = () => {
      moments = moments.filter((m) => m !== moment);
      renderGallery();
      toast("Moment removed from this session.");
    };
    actions.append(edit, remove);
    card.append(image, actions);
    getElement("gallery").append(card);
  });
}
/** Render the latest settings and request a PNG or JPEG browser download. */
function downloadMoment() {
  if (!selectedMoment) return;
  const canvas = getElement("resultCanvas");
  renderMoment(selectedMoment, canvas);
  const format = selectedMoment.settings.format;
  canvas.toBlob(
    (blob) => {
      if (!blob) {
        toast("Download failed. Try PNG format.");
        return;
      }
      const url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download = `photoxoot-${Date.now()}.${format === "jpeg" ? "jpg" : "png"}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast("Download started.");
    },
    "image/" + format,
    0.95,
  );
}
getElement("downloadBtn").onclick = downloadMoment;
getElement("clearBtn").onclick = () => {
  if (!moments.length && !uploaded && !stream) {
    toast("Your session is already empty.");
    return;
  }
  showInfo(
    "Clear this session?",
    '<p>This turns off your camera and removes all photos from this tab. Download your favorites first. Files already downloaded stay on your device.</p><button id="confirmClear" class="primary">Clear photos & stop camera</button>',
  );
  getElement("confirmClear").onclick = () => {
    stopCamera();
    moments = [];
    uploaded = null;
    selectedMoment = null;
    getElement("uploadPreview").removeAttribute("src");
    getElement("uploadPreview").hidden = true;
    getElement("welcome").hidden = false;
    getElement("demoArt").hidden = false;
    renderGallery();
    getElement("infoDialog").close();
    toast("Session cleared.");
  };
};
/** Open an information dialog. Content must be trusted, application-owned HTML. */
function showInfo(title, content) {
  getElement("dialogContent").innerHTML = "<h2>" + title + "</h2>" + content;
  getElement("infoDialog").showModal();
}
getElement("privacyBtn").onclick = () =>
  showInfo(
    "Your memories. Your business.",
    "<p>Your camera feed and photos are processed entirely on your device. This booth has no backend, analytics, cookies, or photo uploads. It makes no network requests for photo processing.</p><p>Photos are held in this tab’s memory and disappear when you clear the session or close the tab. Downloads stay on your device. Imported image metadata is not copied into exported photos.</p><p>Camera access only starts when you enable it. Use <strong>Stop camera</strong> to revoke this session’s access. Hosting providers still receive normal page requests when you visit.</p>",
  );
getElement("howBtn").onclick = () =>
  showInfo(
    "A moment in three little steps.",
    "<ol><li><strong>Get ready.</strong> Enable your camera, or use the upload button to choose up to four local photos.</li><li><strong>Make it yours.</strong> Pick a layout, filter, frame, caption, and sticker. Set your timer and strike a pose. Press Space to capture.</li><li><strong>Keep the magic.</strong> Preview your moment and download it as PNG or JPEG. Use the preview editor to adjust the design, crop, rotation, and photo order. Reopen a moment to keep editing its saved design.</li></ol><p>Stay in this tab until you save your favorites. Your session is temporary.</p>",
  );
document
  .querySelectorAll(".dialog-close")
  .forEach(
    (button) => (button.onclick = () => button.closest("dialog").close()),
  );
document.querySelectorAll("dialog").forEach((dialog) =>
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      const bounds = dialog.getBoundingClientRect();
      if (
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom
      )
        dialog.close();
    }
  }),
);
getElement("resultDialog").addEventListener("close", () => {
  if (selectedMoment) {
    selectedMoment.thumbnail = getElement("resultCanvas").toDataURL(
      "image/jpeg",
      0.85,
    );
    renderGallery();
  }
  selectedMoment = null;
});
/** Enter or exit viewfinder fullscreen, reporting unsupported or failed requests. */
async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (getElement("viewfinder").requestFullscreen)
      await getElement("viewfinder").requestFullscreen();
    else toast("Fullscreen is not supported by this browser.");
  } catch {
    toast("Fullscreen is not available.");
  }
}
getElement("fullscreenBtn").onclick = toggleFullscreen;
// Release hardware when leaving the page or moving this tab into the background.
window.addEventListener("pagehide", stopCamera);
document.addEventListener("visibilitychange", () => {
  if (document.hidden && stream) stopCamera();
});
