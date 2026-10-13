const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium, webkit } = require("playwright");

const root = path.resolve(__dirname, "../dist");
let server, baseURL;
before(async () => {
  server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const filename = path.join(
      root,
      pathname === "/" ? "index.html" : pathname,
    );
    if (!filename.startsWith(root + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    try {
      response.setHeader(
        "Content-Type",
        { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }[
          path.extname(filename)
        ] || "application/octet-stream",
      );
      response.end(await fs.readFile(filename));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseURL = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function settle(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}
async function fixture(page, count = 4) {
  const encoded = await page.evaluate(
    (count) =>
      Array.from({ length: count }, (_, index) => {
        const canvas = document.createElement("canvas");
        canvas.width = 160;
        canvas.height = 120;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = ["rgb(200,100,50)", "#39a269", "#5285ce", "#efba62"][
          index % 4
        ];
        ctx.fillRect(0, 0, 160, 120);
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, 20, 20);
        return canvas.toDataURL().split(",")[1];
      }),
    count,
  );
  return encoded.map((data, index) => ({
    name: `photo-${index}.png`,
    mimeType: "image/png",
    buffer: Buffer.from(data, "base64"),
  }));
}
async function upload(page, count = 4) {
  await page.locator("#fileInput").setInputFiles(await fixture(page, count));
  await page.locator("#resultDialog[open]").waitFor();
  await settle(page);
}
async function sample(page) {
  return page
    .locator("#resultCanvas")
    .evaluate((canvas) => [
      ...canvas.getContext("2d").getImageData(150, 150, 1, 1).data,
    ]);
}
async function select(page, id, value) {
  await page.locator(`#${id}`).selectOption(value);
  await settle(page);
}
async function tab(page, name) {
  await page.locator(`[data-editor-tab="${name}"]`).click();
}
async function checkVisibleBounds(page, selector) {
  const failures = await page.locator(selector).evaluateAll((elements) =>
    elements.flatMap((element) => {
      const rect = element.getBoundingClientRect();
      if (
        !rect.width ||
        !rect.height ||
        getComputedStyle(element).visibility === "hidden"
      )
        return [];
      const height = visualViewport?.height || innerHeight;
      return rect.left < -1 ||
        rect.top < -1 ||
        rect.right > innerWidth + 1 ||
        rect.bottom > height + 1
        ? [
            {
              id: element.id,
              text: element.textContent.slice(0, 30),
              rect: { top: rect.top, bottom: rect.bottom, right: rect.right },
              height,
            },
          ]
        : [];
    }),
  );
  assert.deepEqual(
    failures,
    [],
    "Visible controls must remain inside the viewport",
  );
}

for (const engine of (process.env.TEST_BROWSERS || "chromium,webkit").split(
  ",",
)) {
  test(
    `${engine}: PhotoXoot regression suite`,
    { timeout: 180000 },
    async (t) => {
      const browser = await (engine === "webkit" ? webkit : chromium).launch({
        headless: true,
        ...(engine === "chromium" && process.env.CHROME_EXECUTABLE
          ? { executablePath: process.env.CHROME_EXECUTABLE }
          : {}),
        ...(engine === "chromium"
          ? {
              args: [
                "--use-fake-device-for-media-stream",
                "--use-fake-ui-for-media-stream",
              ],
            }
          : {}),
      });
      try {
        await t.test(
          "patterns preserve photos and script fonts load for export",
          async () => {
            const page = await browser.newPage();
            await page.goto(baseURL);
            await upload(page);
            const original = await sample(page);
            await tab(page, "patterns");
            const bitmaps = new Set();
            for (const pattern of [
              "solid",
              "dots",
              "stripes",
              "checks",
              "hearts",
            ]) {
              await select(page, "editPattern", pattern);
              bitmaps.add(
                await page
                  .locator("#resultCanvas")
                  .evaluate((c) => c.toDataURL()),
              );
              assert.deepEqual(
                await sample(page),
                original,
                "Pattern stays beneath the photos",
              );
            }
            assert.equal(bitmaps.size, 5);
            await tab(page, "text");
            await page.locator("#editCaption").fill("Sweet little memories");
            const captions = new Set();
            for (const font of [
              "Georgia",
              "Allura",
              '"Dancing Script"',
              "Pacifico",
            ]) {
              await select(page, "editCaptionFont", font);
              assert.ok(
                await page.evaluate(async (font) => {
                  await captionFontsReady;
                  return document.fonts.check(`24px ${font}`);
                }, font),
              );
              await settle(page);
              captions.add(
                await page
                  .locator("#resultCanvas")
                  .evaluate((c) => c.toDataURL()),
              );
            }
            assert.equal(captions.size, 4);
            await page.close();
          },
        );
        await t.test(
          "filters change pixels even without native canvas filters; PNG/JPEG match preview",
          async () => {
            const page = await browser.newPage();
            const errors = [];
            page.on("pageerror", (error) => errors.push(error.message));
            // Simulate older iPhone Safari where setting context.filter has no effect.
            await page.addInitScript(() =>
              Object.defineProperty(
                CanvasRenderingContext2D.prototype,
                "filter",
                { configurable: true, get: () => "none", set: () => {} },
              ),
            );
            await page.goto(baseURL);
            await upload(page);
            const original = await sample(page);
            assert.deepEqual(original, [200, 100, 50, 255]);
            for (const value of ["1", "2", "3", "4", "5"]) {
              await select(page, "editFilter", value);
              const pixel = await sample(page);
              assert.notDeepEqual(
                pixel,
                original,
                `Preset ${value} changes pixels`,
              );
              if (value === "2")
                assert(
                  Math.max(...pixel.slice(0, 3)) -
                    Math.min(...pixel.slice(0, 3)) <=
                    1,
                  "B&W is grayscale",
                );
            }
            await select(page, "editFilter", "0");
            await page.locator("#editBrightness").fill("60");
            await settle(page);
            assert.deepEqual(await sample(page), [120, 60, 30, 255]);
            assert.deepEqual(
              await page.evaluate(() => [
                ...selectedMoment.photos[0]
                  .getContext("2d")
                  .getImageData(40, 40, 1, 1).data,
              ]),
              original,
              "Raw photos remain unchanged",
            );
            await select(page, "editFilter", "2");
            for (const format of ["png", "jpeg"]) {
              await select(page, "editFormat", format);
              const pending = page.waitForEvent("download");
              await page.locator("#downloadBtn").click();
              const download = await pending;
              const bytes = await fs.readFile(await download.path());
              const actual = await page.evaluate(
                async ({ data, format }) => {
                  const image = new Image();
                  image.src = `data:image/${format};base64,${data}`;
                  await image.decode();
                  const canvas = document.createElement("canvas");
                  canvas.width = image.width;
                  canvas.height = image.height;
                  canvas.getContext("2d").drawImage(image, 0, 0);
                  return [
                    ...canvas.getContext("2d").getImageData(150, 150, 1, 1)
                      .data,
                  ];
                },
                { data: bytes.toString("base64"), format },
              );
              const preview = await sample(page);
              assert(
                actual
                  .slice(0, 3)
                  .every((value, i) => Math.abs(value - preview[i]) <= 2),
              );
            }
            assert.deepEqual(errors, []);
            await page.close();
          },
        );
        await t.test(
          "drawn stickers, crop, reorder, independent saved edits, and reset",
          async () => {
            const page = await browser.newPage();
            await page.goto(baseURL);
            await upload(page);
            const raw = await page
              .locator("#resultCanvas")
              .evaluate((c) => c.toDataURL());
            await tab(page, "stickers");
            for (const id of [
              "heart",
              "daisy",
              "bow",
              "cherries",
              "sparkles",
              "smile",
              "star",
            ]) {
              await select(page, "editSticker", id);
              assert.notEqual(
                await page
                  .locator("#resultCanvas")
                  .evaluate((c) => c.toDataURL()),
                raw,
              );
            }
            await select(page, "editStickerPosition", "top-left");
            await page.locator("#editStickerSize").fill("1.6");
            await settle(page);
            await tab(page, "photo");
            await page.locator("#editZoom").fill("2");
            await page.locator("#editPanX").fill("80");
            await page.locator("#rotatePhoto").click();
            await page.locator("#editPhotoMirror").click();
            await page.locator("#movePhotoRight").click();
            await settle(page);
            assert.deepEqual(
              await page.evaluate(() => selectedMoment.photoEdits[1]),
              { zoom: 2, rotation: 90, mirror: true, panX: 80, panY: 0 },
            );
            await tab(page, "text");
            await page.locator("#editCaption").fill("Our photo strip");
            await page.locator("#editShowDate").check();
            await page.locator("#doneEditingBtn").click();
            await upload(page, 1);
            assert.equal(
              await page.evaluate(() => selectedMoment.settings.caption),
              "",
            );
            await page.locator("#doneEditingBtn").click();
            await page.locator(".moment-actions button").first().click();
            assert.equal(
              await page.evaluate(() => selectedMoment.settings.caption),
              "Our photo strip",
            );
            await page.locator("#resetMomentBtn").click();
            await settle(page);
            assert.equal(
              await page
                .locator("#resultCanvas")
                .evaluate((c) => c.toDataURL()),
              raw,
            );
            await page.locator("#doneEditingBtn").click();
            assert(
              await page.locator("#useCameraBtn").isVisible(),
              "Uploaded photos do not hide camera recovery",
            );
            await page.locator("#captureBtn").click();
            await page.locator("#resultDialog[open]").waitFor();
            assert.equal(
              await page.evaluate(() => selectedMoment.photos.length),
              1,
            );
            await page.close();
          },
        );
        await t.test(
          "phone pages, every editor tab, gallery paging, and short keyboard viewport fit",
          async () => {
            const page = await browser.newPage();
            await page.goto(baseURL);
            for (const viewport of [
              { width: 320, height: 568 },
              { width: 375, height: 667 },
              { width: 390, height: 844 },
              { width: 844, height: 390 },
            ]) {
              await page.setViewportSize(viewport);
              await settle(page);
              for (const section of ["booth", "customize", "moments"]) {
                await page.locator(`[data-panel="${section}"]`).click();
                await settle(page);
                assert(
                  await page.evaluate(
                    () =>
                      document.documentElement.scrollHeight <=
                        innerHeight + 1 &&
                      document.documentElement.scrollWidth <= innerWidth + 1,
                  ),
                );
                if (section === "customize")
                  for (const style of [
                    "layout",
                    "filter",
                    "frame",
                    "extras",
                    "adjust",
                  ]) {
                    await page
                      .locator(`button[data-style-tab="${style}"]`)
                      .click();
                    await checkVisibleBounds(
                      page,
                      "#customizePanel button, #customizePanel input, #customizePanel select",
                    );
                  }
                await checkVisibleBounds(
                  page,
                  "#boothPanel button, #boothPanel select, .mobile-nav button",
                );
              }
              await page.locator('[data-panel="booth"]').click();
              await upload(page);
              for (const section of [
                "design",
                "patterns",
                "stickers",
                "photo",
                "text",
              ]) {
                await tab(page, section);
                await settle(page);
                if (viewport.width === 320) {
                  await fs.mkdir(path.resolve(__dirname, "../test-results"), {
                    recursive: true,
                  });
                  await page.screenshot({
                    path: path.resolve(
                      __dirname,
                      `../test-results/${engine}-${section}.png`,
                    ),
                  });
                }
                await checkVisibleBounds(
                  page,
                  "#resultDialog button, #resultDialog input, #resultDialog select",
                );
                assert(
                  await page
                    .locator("#resultDialog")
                    .evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
                  "Editor does not scroll",
                );
              }
              await page.locator("#doneEditingBtn").click();
            }
            await page.setViewportSize({ width: 390, height: 844 });
            await page.locator('[data-panel="moments"]').click();
            assert.equal(await page.locator(".moment").count(), 2);
            await page.locator("#previousGalleryPage").click();
            assert.equal(
              await page.locator("#galleryPageLabel").textContent(),
              "1 / 2",
            );
            await page.locator(".moment-actions button").first().click();
            await tab(page, "text");
            // VisualViewport shrink from an iPhone keyboard follows this same CSS path.
            await page.evaluate(() => {
              document.documentElement.style.setProperty(
                "--app-height",
                "360px",
              );
              document.body.classList.add("keyboard-open");
            });
            await checkVisibleBounds(
              page,
              "#resultDialog button, #resultDialog input, #resultDialog select",
            );
            await page.close();
          },
        );
        await t.test(
          "cancelled decode does not restore photos after clearing; uploads retain all sources",
          async () => {
            const page = await browser.newPage();
            await page.goto(baseURL);
            await upload(page);
            await page.locator("#doneEditingBtn").click();
            await page.locator("#captureBtn").click();
            await page.locator("#resultDialog[open]").waitFor();
            assert.equal(
              await page.evaluate(() => selectedMoment.photos.length),
              4,
            );
            await page.locator("#doneEditingBtn").click();
            await page.evaluate(() => {
              const decode = HTMLImageElement.prototype.decode;
              window.releaseDecode = null;
              HTMLImageElement.prototype.decode = function () {
                const image = this;
                return new Promise((resolve) => {
                  window.releaseDecode = () => decode.call(image).then(resolve);
                });
              };
            });
            await page
              .locator("#fileInput")
              .setInputFiles(await fixture(page, 1));
            await page.waitForFunction(
              () => typeof window.releaseDecode === "function",
            );
            await page.locator("#clearBtn").click();
            await page.locator("#confirmClear").click();
            await page.evaluate(() => window.releaseDecode());
            await settle(page);
            assert.equal(await page.locator("#momentCount").textContent(), "0");
            assert.equal(await page.evaluate(() => uploaded), null);
            assert.equal(
              await page.locator("#resultDialog").evaluate((el) => el.open),
              false,
            );
            await page.close();
          },
        );
        if (engine === "chromium")
          await t.test(
            "capture cancellation, restart, failed playback cleanup, and first-click capture",
            async () => {
              const context = await browser.newContext({
                permissions: ["camera"],
              });
              const page = await context.newPage();
              await page.goto(baseURL);
              await page.locator("#timer").selectOption("0");
              await page.locator("#captureBtn").click();
              await page.locator("#resultDialog[open]").waitFor();
              assert.equal(
                await page.evaluate(() => selectedMoment.photos.length),
                4,
              );
              await page.locator("#doneEditingBtn").click();
              await page.locator("#timer").selectOption("3");
              await page.locator("#captureBtn").click();
              await page.locator("#countdown:not([hidden])").waitFor();
              await page.locator("#stopBtn").click();
              await page.locator("#enableBtn").click();
              await page.locator("#cameraLabel.on").waitFor();
              await page.locator("#timer").selectOption("0");
              await page.locator("#captureBtn").click();
              await page.locator("#resultDialog[open]").waitFor();
              assert.equal(
                await page.locator("#momentCount").textContent(),
                "2",
              );
              await page.locator("#doneEditingBtn").click();
              await page.locator("#stopBtn").click();
              await page.evaluate(() => {
                HTMLMediaElement.prototype.play = () =>
                  Promise.reject(new Error("Playback failure"));
              });
              await page.locator("#enableBtn").click();
              await page.waitForFunction(() => !openingCamera);
              assert.equal(await page.evaluate(() => stream), null);
              assert.equal(await page.locator("#enableBtn").isEnabled(), true);
              await context.close();
            },
          );
      } finally {
        await browser.close();
      }
    },
  );
}
