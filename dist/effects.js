"use strict";

/**
 * Portable photo effects. CanvasRenderingContext2D.filter is not available in
 * all Safari versions, so saved photos are filtered through ImageData instead.
 * CSS filter strings still drive the live video, using the same preset values.
 */
const PhotoEffects = (() => {
  const cache = new WeakMap();
  const clamp = (value) => Math.max(0, Math.min(255, value));

  /** Convert one CSS color operation into a 3 × 4 affine RGB matrix. */
  function colorMatrix(name, amount) {
    if (name === "brightness")
      return [amount, 0, 0, 0, 0, amount, 0, 0, 0, 0, amount, 0];
    if (name === "contrast") {
      const offset = 255 * (0.5 - amount * 0.5);
      return [amount, 0, 0, offset, 0, amount, 0, offset, 0, 0, amount, offset];
    }
    if (name === "sepia") {
      return [
        1 - 0.607 * amount,
        0.769 * amount,
        0.189 * amount,
        0,
        0.349 * amount,
        1 - 0.314 * amount,
        0.168 * amount,
        0,
        0.272 * amount,
        0.534 * amount,
        1 - 0.869 * amount,
        0,
      ];
    }
    if (name === "saturate" || name === "grayscale") {
      const saturation = name === "grayscale" ? 1 - amount : amount;
      const inverse = 1 - saturation;
      return [
        0.213 * inverse + saturation,
        0.715 * inverse,
        0.072 * inverse,
        0,
        0.213 * inverse,
        0.715 * inverse + saturation,
        0.072 * inverse,
        0,
        0.213 * inverse,
        0.715 * inverse,
        0.072 * inverse + saturation,
        0,
      ];
    }
    if (name === "hue-rotate") {
      const angle = (amount * Math.PI) / 180;
      const cos = Math.cos(angle),
        sin = Math.sin(angle);
      return [
        0.213 + cos * 0.787 - sin * 0.213,
        0.715 - cos * 0.715 - sin * 0.715,
        0.072 - cos * 0.072 + sin * 0.928,
        0,
        0.213 - cos * 0.213 + sin * 0.143,
        0.715 + cos * 0.285 + sin * 0.14,
        0.072 - cos * 0.072 - sin * 0.283,
        0,
        0.213 - cos * 0.213 - sin * 0.787,
        0.715 - cos * 0.715 + sin * 0.715,
        0.072 + cos * 0.928 + sin * 0.072,
        0,
      ];
    }
    throw new Error(`Unsupported color operation: ${name}`);
  }

  /** Preserve alpha and raw source pixels; retain only the last effect per source. */
  function filteredPhoto(source, expression) {
    const previous = cache.get(source);
    if (previous?.expression === expression) return previous.canvas;
    const matrices = [
      ...expression.matchAll(/([a-z-]+)\(([-\d.]+)(%|deg)?\)/g),
    ].map(([, name, value, unit]) =>
      colorMatrix(name, Number(value) / (unit === "%" ? 100 : 1)),
    );
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(source, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = pixels.data;
    for (let i = 0; i < data.length; i += 4) {
      let red = data[i],
        green = data[i + 1],
        blue = data[i + 2];
      for (const matrix of matrices) {
        const nextRed = clamp(
          matrix[0] * red + matrix[1] * green + matrix[2] * blue + matrix[3],
        );
        const nextGreen = clamp(
          matrix[4] * red + matrix[5] * green + matrix[6] * blue + matrix[7],
        );
        blue = clamp(
          matrix[8] * red + matrix[9] * green + matrix[10] * blue + matrix[11],
        );
        red = nextRed;
        green = nextGreen;
      }
      data[i] = red;
      data[i + 1] = green;
      data[i + 2] = blue;
    }
    context.putImageData(pixels, 0, 0);
    cache.set(source, { expression, canvas });
    return canvas;
  }
  return { filteredPhoto };
})();
