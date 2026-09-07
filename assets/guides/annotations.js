/*
 * Draws the connector lines in every `.annotated` block: a short elbow from
 * each code group (`.grp`) across to its matching note (`.note`), paired by
 * order. Runs on load and on resize; the connectors are decorative, so the
 * block still reads fine without JavaScript (and the CSS hides them below the
 * two-column breakpoint anyway).
 */
(function () {
  "use strict";

  var BREAKPOINT = 800;

  function draw(block) {
    var groupsWrap = block.querySelector(".code-groups");
    var notesWrap = block.querySelector(".notes");
    var lines = block.querySelector(".connectors");
    if (!groupsWrap || !notesWrap || !lines) return;

    lines.textContent = "";
    if (window.innerWidth < BREAKPOINT) return;

    var groups = groupsWrap.querySelectorAll(".grp");
    var notes = notesWrap.querySelectorAll(".note");
    var base = block.getBoundingClientRect();
    var codeCard = block.querySelector(".code-card").getBoundingClientRect();
    var codeRight = codeCard.right - base.left;
    var notesLeft = notesWrap.getBoundingClientRect().left - base.left;
    var mid = (codeRight + notesLeft) / 2;

    var pairs = Math.min(groups.length, notes.length);
    for (var i = 0; i < pairs; i++) {
      var g = groups[i].getBoundingClientRect();
      var label = notes[i].querySelector(".note-label") || notes[i];
      var n = label.getBoundingClientRect();
      // Leave the code side near the band's label rather than its centre, so a
      // tall band (a whole class or method) still connects from the top.
      var y1 = Math.round(g.top + Math.min(g.height / 2, 14) - base.top);
      var y2 = Math.round(n.top + n.height / 2 - base.top);
      var top = Math.min(y1, y2);
      var height = Math.max(1, Math.abs(y1 - y2));

      add(lines, "conn-dot", { top: y1, left: codeRight });
      add(lines, "conn-h", { top: y1, left: codeRight, width: mid - codeRight });
      add(lines, "conn-v", { top: top, left: mid, height: height });
      add(lines, "conn-h", { top: y2, left: mid, width: notesLeft - mid });
    }
  }

  function add(parent, cls, style) {
    var el = document.createElement("div");
    el.className = cls;
    Object.keys(style).forEach(function (key) {
      el.style[key] = style[key] + "px";
    });
    parent.appendChild(el);
  }

  function drawAll() {
    document.querySelectorAll(".annotated").forEach(draw);
  }

  drawAll();
  window.addEventListener("resize", drawAll);
  window.addEventListener("load", drawAll);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(drawAll);
  }
})();
