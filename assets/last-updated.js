(function () {
  "use strict";

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
  });
})();
