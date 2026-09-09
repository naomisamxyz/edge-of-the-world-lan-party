(function () {
  "use strict";

  var guides = [
    ["first-project-setup.html", "⭐︎ First Project Setup ⭐︎"],
    ["unity-introduction.html", "⟡ Unity Introduction ⟡"],
    ["unity-best-practice.html", "༺ Unity Best Practice ༻"],
    ["player-and-controls.html", "༺ Player and Controls ༻"],
    ["environment-i.html", "⚔︎ Environment I ⚔︎"],
    ["ai-tools.html", "❖ AI Tools ❖"],
    ["events.html", "✧ Events ✧"],
    ["characters.html", "❥ Characters <span class=\"mirror-symbol\">❥</span>"],
    ["interface.html", "✢ Interface ✢"],
    ["scenes-menus.html", "♦︎ Scenes, Menus ♦︎"],
    ["dont-destroy-on-load.html", "⌗ Don’t Destroy on Load ⌗"],
    ["video.html", "⠿ Video ⠿"],
    ["export-and-distribution.html", "☁︎ Export and Distribution ☁︎"],
    ["alternative-controls-and-sensors.html", "𖦹 Alternative Controls and Sensors 𖦹"],
    ["audioreactivity.html", "༶ Audioreactivity ༶"],
    ["multiplayer-game.html", "⟷ Multiplayer Game ⟷"],
    ["environment-ii.html", "◇ Environment II ◇"],
    ["ai-integration.html", "✣ AI Integration ✣"]
  ];

  var disabledGuides = new Set([
    "player-and-controls.html",
    "environment-i.html",
    "ai-tools.html",
    "events.html",
    "characters.html",
    "interface.html",
    "scenes-menus.html",
    "dont-destroy-on-load.html",
    "video.html",
    "export-and-distribution.html",
    "alternative-controls-and-sensors.html",
    "audioreactivity.html",
    "multiplayer-game.html",
    "environment-ii.html",
    "ai-integration.html"
  ]);

  var sharedHeader = [
    '<pre class="header-ornament">⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀\n⣄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣤⣰⠦⠔⠛⠃⠉⠉⠉⠙⣶⢢⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀\n⠈⠳⣤⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣠⣴⡶⠟⠛⠛⠐⠢⡀⠀⠀⠀⠀⠀⠀⠀⢀⣀⣴⠮⠵⠋⠛⠋⠐⠒⠛⠠⢦⡄⡠⠴⠽⠯⠤⣀⣀⣀⣀⣀⡀⠀⠀⠀⠀⠀⠀\n⠀⠀⠈⠹⠿⣷⣶⣰⣀⣰⣶⠾⠿⠈⠉⢏⢇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣀⡶⠉⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢹⢏⠆⣰⡶⠏⠉⠉⠉⠉⠹⠿⣷⣆⣀⠀⠀⠀\n⠀⠀⠀⠀⠀⠀⠈⠉⠉⠁⠈⢙⡿⢯⠟⠉⠉⠚⠲⠤⠤⠤⠤⢤⡶⣲⠽⠃⠁⠀⠀⠀⠀⠀⠀⠀⠀⠉⠐⠢⠤⠤⠶⠟⠛⠉⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠙⠳⣄⠀\n⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠳⠽⣤⣤⣤⣤⡄⠶⠴⠖⠚⠋⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠆</pre>',
    '<h1 class="site-title">IIMC-457/IIMC-657: Edge of the World LAN Party</h1>',
    '<p class="site-meta"><span>Fall 2026</span><span>Wednesdays, 1:00–3:50 PM</span><span>September 9–December 9</span><span>Main Building, C108 Studio</span></p>',
    '<a class="site-home-link" href="../../index.html" aria-label="Edge of the World LAN Party home"></a>'
  ].join("");

  document.querySelectorAll("[data-site-header]").forEach(function (header) {
    header.innerHTML = sharedHeader;
  });

  document.querySelectorAll("[data-site-navigation]").forEach(function (nav) {
    var onGuide = document.body.classList.contains("guide-page");
    var currentFile = window.location.pathname.split("/").pop() || "index.html";
    var parts = [];

    if (onGuide) {
      parts.push('<a href="../../index.html">&larr; Course home</a>');
    } else {
      parts.push('<span class="current">&larr; Course home</span>');
    }

    guides.forEach(function (guide) {
      var file = guide[0];
      var label = guide[1];
      if (onGuide && currentFile === file) {
        parts.push('<span class="current">' + label + "</span>");
      } else if (disabledGuides.has(file)) {
        parts.push(
          '<a class="is-disabled-guide" role="link" aria-disabled="true" tabindex="0" data-href="' +
          (onGuide ? file : "assets/guides/" + file) + '">' + label + "</a>"
        );
      } else {
        parts.push('<a href="' + (onGuide ? file : "assets/guides/" + file) + '">' + label + "</a>");
      }
    });

    nav.innerHTML = parts.join("");
  });

  function markExternalLinks(root) {
    var links = [];
    if (root.nodeType === 1 && root.matches("a[href]")) links.push(root);
    if (root.querySelectorAll) {
      links = links.concat(Array.from(root.querySelectorAll("a[href]")));
    }
    links.forEach(function (link) {
      try {
        var url = new URL(link.getAttribute("href"), window.location.href);
        if (!/^https?:$/.test(url.protocol) || url.origin === window.location.origin) return;
        link.target = "_blank";
        link.rel = "noopener";
      } catch (error) {
        // Leave incomplete or nonstandard links unchanged.
      }
    });
  }

  markExternalLinks(document);
  new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      mutation.addedNodes.forEach(markExternalLinks);
    });
  }).observe(document.body, { childList: true, subtree: true });
})();
