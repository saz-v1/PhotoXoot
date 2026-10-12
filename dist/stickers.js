"use strict";

/** Resolution-independent sticker art: consistent shapes on Safari and exports. */
const PhotoStickers = (() => {
  const choices = [
    { id: "", name: "None" },
    { id: "heart", name: "Heart" },
    { id: "daisy", name: "Daisy" },
    { id: "bow", name: "Bow" },
    { id: "cherries", name: "Cherries" },
    { id: "sparkles", name: "Sparkles" },
    { id: "smile", name: "Smiley" },
    { id: "star", name: "Star" },
  ];

  /** Draw within a normalized 100-pixel square, centered at x/y. */
  function draw(context, id, x, y, size) {
    if (!id) return;
    context.save();
    context.translate(x, y);
    context.scale(size / 100, size / 100);
    context.lineWidth = 3;
    context.lineJoin = "round";
    context.lineCap = "round";
    const ellipse = (cx, cy, rx, ry, color, angle = 0) => {
      context.beginPath();
      context.ellipse(cx, cy, rx, ry, angle, 0, Math.PI * 2);
      context.fillStyle = color;
      context.fill();
    };
    const path = (points, color, stroke = "#fffaf4") => {
      context.beginPath();
      points(context);
      context.closePath();
      context.fillStyle = color;
      context.fill();
      context.strokeStyle = stroke;
      context.stroke();
    };
    const star = (cx, cy, outer, inner, points, color) =>
      path((ctx) => {
        for (let i = 0; i < points * 2; i++) {
          const angle = -Math.PI / 2 + (i * Math.PI) / points;
          const radius = i % 2 ? inner : outer;
          const px = cx + Math.cos(angle) * radius,
            py = cy + Math.sin(angle) * radius;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
      }, color);
    if (id === "heart") {
      path((ctx) => {
        ctx.moveTo(0, 36);
        ctx.bezierCurveTo(-62, -4, -30, -50, 0, -23);
        ctx.bezierCurveTo(30, -50, 62, -4, 0, 36);
      }, "#ea7f9a");
      ellipse(-18, -17, 5, 9, "#ffd9e3", 0.6);
    } else if (id === "daisy") {
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4;
        ellipse(
          Math.cos(angle) * 24,
          Math.sin(angle) * 24,
          19,
          11,
          "#fffaf3",
          angle,
        );
      }
      ellipse(0, 0, 15, 15, "#efbc58");
      ellipse(-4, -4, 3, 3, "#ffe9a7");
    } else if (id === "bow") {
      path((ctx) => {
        ctx.moveTo(-6, 1);
        ctx.lineTo(-26, 42);
        ctx.lineTo(-34, 29);
        ctx.lineTo(-46, 31);
        ctx.lineTo(-18, -5);
      }, "#c87091");
      path((ctx) => {
        ctx.moveTo(6, 1);
        ctx.lineTo(26, 42);
        ctx.lineTo(34, 29);
        ctx.lineTo(46, 31);
        ctx.lineTo(18, -5);
      }, "#c87091");
      path((ctx) => {
        ctx.moveTo(0, -3);
        ctx.bezierCurveTo(-60, -59, -61, 35, 0, 7);
        ctx.bezierCurveTo(61, 35, 60, -59, 0, -3);
      }, "#eca3bd");
      ellipse(0, 1, 10, 12, "#d881a2");
    } else if (id === "cherries") {
      context.beginPath();
      context.moveTo(-21, 19);
      context.quadraticCurveTo(-17, -19, 12, -36);
      context.quadraticCurveTo(10, -3, 25, 16);
      context.strokeStyle = "#6d8663";
      context.lineWidth = 5;
      context.stroke();
      ellipse(-1, -30, 17, 7, "#91a27a", 0.3);
      ellipse(-23, 22, 18, 18, "#c75670");
      ellipse(24, 25, 18, 18, "#dd6b81");
      ellipse(-28, 16, 4, 6, "#ffd8df", 0.4);
      ellipse(20, 19, 4, 6, "#ffd8df", 0.4);
    } else if (id === "sparkles") {
      star(-12, 7, 32, 8, 4, "#e4b85f");
      star(27, -26, 17, 5, 4, "#eccd85");
      ellipse(28, 26, 4, 4, "#e4b85f");
    } else if (id === "smile") {
      ellipse(0, 0, 39, 39, "#f3d887");
      ellipse(-13, -8, 3, 5, "#735643");
      ellipse(13, -8, 3, 5, "#735643");
      ellipse(-24, 7, 7, 4, "#eaa999");
      ellipse(24, 7, 7, 4, "#eaa999");
      context.beginPath();
      context.arc(0, 1, 18, 0.25, Math.PI - 0.25);
      context.strokeStyle = "#735643";
      context.stroke();
    } else if (id === "star") {
      star(0, 0, 43, 21, 5, "#c6b5e3");
      ellipse(-9, -2, 2.5, 4, "#695883");
      ellipse(9, -2, 2.5, 4, "#695883");
    }
    context.restore();
  }
  function thumbnail(id) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 96;
    draw(canvas.getContext("2d"), id, 48, 48, 86);
    return canvas.toDataURL();
  }
  return { choices, draw, thumbnail };
})();
