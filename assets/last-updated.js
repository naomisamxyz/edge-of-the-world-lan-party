(function () {
  "use strict";

  const backgroundPreferenceKey = "edge-background-black";

  function readBackgroundPreference() {
    try {
      return localStorage.getItem(backgroundPreferenceKey) === "true";
    } catch (error) {
      return false;
    }
  }

  function saveBackgroundPreference(isBlack) {
    try {
      localStorage.setItem(backgroundPreferenceKey, String(isBlack));
    } catch (error) {
      // The toggle still works when storage is disabled.
    }
  }

  function applyBackgroundPreference(isBlack) {
    document.body.classList.toggle("background-black", isBlack);
    document.querySelectorAll("[data-last-updated]").forEach(element => {
      element.setAttribute("aria-pressed", String(isBlack));
      element.title = isBlack
        ? "Restore background image"
        : "Switch to black background";
    });
  }

  const updated = {
    datetime: "2026-09-06",
    label: "September 6, 2026",
    by: "Naomi Sam"
  };

  window.SITE_LAST_UPDATED = updated;
  if (window.CANVAS_DATA) {
    window.CANVAS_DATA.lastUpdated = { ...updated };
  }

  document.querySelectorAll("[data-last-updated]").forEach(element => {
    const time = document.createElement("time");
    time.dateTime = updated.datetime;
    time.textContent = updated.label;
    element.replaceChildren(
      document.createTextNode("Last updated "),
      time,
      document.createTextNode(" by " + updated.by)
    );
    element.setAttribute("role", "button");
    element.tabIndex = 0;

    const toggleBackground = () => {
      const isBlack = !document.body.classList.contains("background-black");
      applyBackgroundPreference(isBlack);
      saveBackgroundPreference(isBlack);
    };

    element.addEventListener("click", toggleBackground);
    element.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggleBackground();
    });
  });

  applyBackgroundPreference(readBackgroundPreference());
})();
