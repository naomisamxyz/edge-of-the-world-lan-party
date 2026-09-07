/*
 * Keeps the fixed top-right view controls (list / canvas / back to origin)
 * clear of the header. When the title or meta line grows wide enough to sit
 * under the controls, the controls drop below the header — and the more the
 * header wraps, the further down they go.
 */
(function () {
  "use strict";

  var GAP = 6;
  var header = document.querySelector(".site-header");
  if (!header) return;

  function intersects(a, b) {
    return a.right + GAP > b.left &&
           a.left < b.right &&
           a.bottom > b.top &&
           a.top < b.bottom;
  }

  // The right edge of the actual text, not of the full-width block it sits in.
  function textRect(el) {
    if (!el) return null;
    var range = document.createRange();
    range.selectNodeContents(el);
    var rect = range.getBoundingClientRect();
    range.detach();
    return rect;
  }

  function reflow() {
    var controls =
      document.querySelector(".canvas-controls") ||
      document.querySelector(".view-toggle");
    if (!controls) return;

    // Measure against the position the stylesheet would give it, not the
    // position it may already have been nudged to.
    controls.style.top = "";
    var box = controls.getBoundingClientRect();

    var hit = [
      textRect(header.querySelector(".site-title")),
      textRect(header.querySelector(".site-meta"))
    ].some(function (part) {
      return part && intersects(part, box);
    });

    if (hit) {
      controls.style.top =
        Math.round(header.getBoundingClientRect().bottom + GAP) + "px";
    }
  }

  reflow();
  addEventListener("resize", reflow, { passive: true });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(reflow);
  }
  if (window.ResizeObserver) {
    // Catches the header growing or shrinking (title wrapping, font swap)
    // even when the viewport width itself has not changed.
    new ResizeObserver(reflow).observe(header);
  }
})();
