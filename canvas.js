(function () {
  "use strict";

  const viewport = document.querySelector("#canvas-viewport");
  const world = document.querySelector("#canvas-world");
  const lines = document.querySelector("#connections");
  const readout = document.querySelector("#zoom-readout");
  const toolbar = document.querySelector("#edit-toolbar");
  const edit = new URLSearchParams(location.search).get("edit") === "true";

  let data;
  let camera;
  let gesture = null;
  const touchPoints = new Map();
  let pinch = null;
  let selected = null;
  let selectedIds = new Set();
  let connectFrom = null;
  let disconnectFrom = null;
  let selectedConnection = null;
  let connectionEditMode = false;
  let zoomMomentumTimer = null;
  let zoomMomentumFrame = null;
  let zoomVelocity = 0;
  let zoomFocus = { x: innerWidth / 2, y: innerHeight / 2 };
  let saveWarningShown = false;
  const minimumZoom = 0.18;
  const maximumZoom = 1.6;
  const connectionGap = 10;

  function beginThumbnailLoad(image) {
    const source = image.dataset.src;
    if (!source) return;
    thumbnailObserver?.unobserve(image);
    delete image.dataset.src;
    image.src = source;
  }

  const thumbnailObserver = "IntersectionObserver" in window
    ? new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) beginThumbnailLoad(entry.target);
        });
      }, { root: viewport, rootMargin: "600px" })
    : null;

  function observeThumbnail(image) {
    if (thumbnailObserver) thumbnailObserver.observe(image);
    else beginThumbnailLoad(image);
  }

  function updateThumbnailSource(image, source) {
    if (image.hasAttribute("src")) image.src = source;
    else image.dataset.src = source;
  }

  const clamp = (number, minimum, maximum) =>
    Math.min(maximum, Math.max(minimum, number));

  function escapeHTML(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function seeded(id) {
    let hash = 2166136261;
    for (const character of id) {
      hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    }
    return () =>
      ((hash = Math.imul(hash ^ (hash >>> 13), 1274126177)) >>> 0) /
      4294967296;
  }

  function frameInterior(resource) {
    return {
      left: resource.x,
      right: resource.x + resource.width,
      top: resource.y,
      bottom: resource.y + resource.height
    };
  }

  function editableAttributes(field, item, className) {
    const classes = [className, edit ? "editable-copy" : ""]
      .filter(Boolean)
      .join(" ");
    const classAttribute = classes ? ' class="' + classes + '"' : "";
    if (!edit) return classAttribute;
    return (
      classAttribute + ' contenteditable="true" spellcheck="true"' +
      ' data-edit-field="' + field + '"' +
      (item ? ' data-edit-item="true"' : "")
    );
  }

  function bindEditableCopy(element, resource) {
    let measureFrame = null;
    const update = pruneEmptyItems => {
      if (resource.type === "week" || resource.type === "section") {
        const title = element.querySelector('[data-edit-field="title"]');
        if (title) resource.title = title.textContent.trim();
        const date = element.querySelector('[data-edit-field="date"]');
        if (date) resource.date = date.textContent.trim();
      } else if (resource.type === "text") {
        const text = element.querySelector('[data-edit-field="text"]');
        if (text) resource.text = text.innerHTML;
      } else if (resource.type === "list") {
        const description = element.querySelector(
          '[data-edit-field="description"]'
        );
        if (description) resource.description = description.innerHTML;
        const list = element.querySelector('[data-edit-field="items"]');
        if (list) {
          if (pruneEmptyItems) {
            Array.from(list.children).forEach(item => {
              if (item.matches("li") && !item.textContent.trim()) item.remove();
            });
          }
          resource.items = Array.from(list.children)
            .filter(item => item.matches("li"))
            .map(item => item.innerHTML);
        }
      }

      saveLocal();
      if (resource.heightMode === "manual") return;
      cancelAnimationFrame(measureFrame);
      measureFrame = requestAnimationFrame(() => {
        element.style.height = "auto";
        resource.height = element.offsetHeight;
        element.style.height = "";
        element.style.setProperty("--h", resource.height + "px");
        drawConnections();
        saveLocal();
      });
    };

    element.querySelectorAll("[contenteditable]").forEach(field => {
      field.addEventListener("pointerdown", event => event.stopPropagation());
      field.addEventListener("click", event => {
        if (event.target.closest("a")) event.preventDefault();
      });
      if (["text", "description"].includes(field.dataset.editField)) {
        field.addEventListener("keydown", event => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          document.execCommand("insertLineBreak", false, null);
        });
      }
      field.addEventListener("input", () => update(false));
      field.addEventListener("blur", () => update(true));
    });
  }

  function createNode(resource) {
    const element = document.createElement("div");
    let deferredImage = null;
    element.className = "canvas-object";
    element.dataset.id = resource.id;
    element.style.cssText =
      "--x:" + resource.x + "px;--y:" + resource.y + "px;" +
      "--w:" + resource.width + "px;--h:" + resource.height + "px";
    if (resource.type === "text" && Number.isFinite(Number(resource.fontSize))) {
      element.style.setProperty(
        "--text-font-size",
        Number(resource.fontSize) + "px"
      );
    }
    if (resource.type === "week") {
      element.classList.add("text-object", "week-object");
      element.innerHTML =
        '<div class="section-heading week-heading">' +
        '<div class="week-title"><h2>' +
        (edit
          ? '<span' + editableAttributes("title") + '>' + resource.title +
            "</span>"
          : '<a href="index.html#week' +
            String(resource.week).padStart(2, "0") +
            '" data-week="' + resource.week + '">' + resource.title +
            "</a>") +
        "</h2></div><time" + editableAttributes("date") + ">" +
        (resource.date || "") + "</time></div>";
    } else if (resource.type === "list") {
      element.classList.add("text-object", "list-object");
      element.innerHTML =
        (resource.description
          ? "<div" + editableAttributes(
              "description",
              false,
              "canvas-paragraph"
            ) + ">" + resource.description + "</div>"
          : "") +
        "<ul" + editableAttributes("items") + ">" +
        (resource.items || []).map(item =>
          "<li>" + item + "</li>"
        ).join("") +
        "</ul>";
    } else if (resource.type === "text") {
      element.classList.add("text-object");
      element.innerHTML =
        "<div" + editableAttributes("text", false, "canvas-paragraph") +
        ">" + resource.text + "</div>";
    } else if (resource.type === "section") {
      element.classList.add("text-object", "week-object", "section-object");
      element.innerHTML =
        '<div class="section-heading week-heading">' +
        '<div class="week-title"><h2>' +
        (edit
          ? '<span' + editableAttributes("title") + '>' + resource.title +
            "</span>"
          : '<a href="index.html#' + resource.id + '">' + resource.title +
            "</a>") +
        "</h2></div></div>";
    } else if (resource.type === "media") {
      let mediaKind = String(resource.mediaKind || "image")
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "") || "image";
      const mediaTarget = resource.url || resource.image;
      const linkFallbackImage =
        /^https:\/\/image\.thum\.io\//.test(String(resource.image || "")) ||
        (
          String(resource.image || "").startsWith("data:image/svg+xml") &&
          /link%20preview/i.test(String(resource.image || ""))
        );
      const detectedYoutubeThumbnail = youtubeThumbnail(mediaTarget);
      if (
        mediaKind === "link" &&
        detectedYoutubeThumbnail &&
        linkFallbackImage
      ) {
        mediaKind = "youtube";
        resource.mediaKind = "youtube";
        resource.image = detectedYoutubeThumbnail;
        resource.height = 135;
        resource.previewHeight = 135;
      }
      const recoverLinkThumbnail =
        mediaKind === "link" && linkFallbackImage;
      if (recoverLinkThumbnail) {
        resource.image = generatedLinkPlaceholder(resource.url);
      }
      element.classList.add("media-object", "is-" + mediaKind);
      element.style.height = "auto";
      element.innerHTML =
        '<div class="media-visual">' +
        '<img loading="lazy" decoding="async" fetchpriority="low" data-src="' +
        escapeHTML(resource.image) +
        '" width="' + Math.round(resource.width) +
        '" height="' + Math.round(resource.height) +
        '" alt="' + escapeHTML(resource.alt || resource.title) + '">' +
        (mediaKind === "youtube"
          ? '<a class="media-play" href="' + escapeHTML(mediaTarget) +
            '" target="_blank" rel="noopener" aria-label="Open video"></a>'
          : mediaKind === "link"
            ? '<a class="media-link" href="' + escapeHTML(mediaTarget) +
              '" target="_blank" rel="noopener" aria-label="Open link"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8 16 16 8"></path><path d="M10 8h6v6"></path></svg></a>'
            : "") +
        '</div><div class="media-title"><a href="' +
        escapeHTML(mediaTarget) +
        '" target="_blank" rel="noopener">' +
        escapeHTML(resource.title) + "</a>" +
        (resource.meta
          ? '<span class="media-meta">' + escapeHTML(resource.meta) + "</span>"
          : "") +
        "</div>";
      const image = element.querySelector("img");
      deferredImage = image;
      image.addEventListener("error", () => {
        if (
          mediaKind === "youtube" &&
          /\/maxresdefault\.jpg(?:$|\?)/.test(image.src)
        ) {
          resource.image = resource.image.replace(
            "/maxresdefault.jpg",
            "/hqdefault.jpg"
          );
          updateThumbnailSource(image, resource.image);
          saveLocal();
        } else if (
          mediaKind === "link" &&
          !String(resource.image || "").startsWith("data:")
        ) {
          resource.image = generatedLinkPlaceholder(resource.url);
          updateThumbnailSource(image, resource.image);
          saveLocal();
        }
      });
      image.addEventListener("load", () => {
        if (!image.naturalWidth) return;
        resource.height = Number.isFinite(resource.previewHeight)
          ? resource.previewHeight
          : image.naturalHeight * (resource.width / image.naturalWidth);
        element.style.setProperty("--h", resource.height + "px");
        drawConnections();
      });
      if (recoverLinkThumbnail) {
        linkMetadata(resource.url).then(metadata => {
          resource.image = metadata.image;
          updateThumbnailSource(image, resource.image);
          saveLocal();
        });
      }
    } else {
      element.classList.add("sigil-object");
      element.textContent = resource.text;
    }

    if (edit && ["week", "list", "text", "section"].includes(resource.type)) {
      bindEditableCopy(element, resource);
    }

    if (edit && resource.type !== "sigil") {
      const dragHandle = document.createElement("i");
      dragHandle.className = "drag-handle";
      dragHandle.title = "Drag";
      const handle = document.createElement("i");
      handle.className = "resize-handle";
      element.append(dragHandle);
      element.append(handle);
      bindEditNode(element, resource, handle, dragHandle);
    }

    world.append(element);
    if (deferredImage) observeThumbnail(deferredImage);
    const autoHeightType = ["week", "list", "text", "section"].includes(
      resource.type
    );
    if (autoHeightType && resource.heightMode !== "manual") {
      element.style.height = "auto";
      requestAnimationFrame(() => {
        resource.height = element.offsetHeight;
        element.style.height = "";
        element.style.setProperty("--h", resource.height + "px");
        drawConnections();
      });
    }
  }

  function applyCamera() {
    const zoom = camera.zoom;
    // Always scale with a transform. The CSS `zoom` property was used here for
    // crisper text while panning, but Chrome fails to scale some descendant
    // text (list items, paragraphs) under it, so headings and body copy drift
    // out of proportion as you zoom.
    const transform =
      "translate(" + camera.x + "px," + camera.y + "px) scale(" + zoom + ")";
    world.style.zoom = "";
    world.style.transform = transform;
    lines.style.zoom = "";
    lines.style.transform = transform;
    world.style.transformOrigin = "0 0";
    lines.style.transformOrigin = "0 0";
    const displayedZoom = clamp(
      ((zoom - minimumZoom) / (maximumZoom - minimumZoom)) * 100,
      0,
      100
    );
    readout.textContent = Math.round(displayedZoom) + "%";
    drawConnections();
  }

  function closestAxisPoints(
    fromMinimum,
    fromMaximum,
    toMinimum,
    toMaximum,
    fromCenter,
    toCenter
  ) {
    if (fromMaximum < toMinimum) return [fromMaximum, toMinimum];
    if (toMaximum < fromMinimum) return [fromMinimum, toMaximum];
    const overlapMinimum = Math.max(fromMinimum, toMinimum);
    const overlapMaximum = Math.min(fromMaximum, toMaximum);
    const shared = clamp(
      (fromCenter + toCenter) / 2,
      overlapMinimum,
      overlapMaximum
    );
    return [shared, shared];
  }

  function closestConnectionPoints(from, to) {
    const fromInterior = frameInterior(from);
    const toInterior = frameInterior(to);
    const x = closestAxisPoints(
      fromInterior.left,
      fromInterior.right,
      toInterior.left,
      toInterior.right,
      from.x + from.width / 2,
      to.x + to.width / 2
    );
    const y = closestAxisPoints(
      fromInterior.top,
      fromInterior.bottom,
      toInterior.top,
      toInterior.bottom,
      from.y + from.height / 2,
      to.y + to.height / 2
    );
    const deltaX = x[1] - x[0];
    const deltaY = y[1] - y[0];
    const distance = Math.hypot(deltaX, deltaY);
    const startAnchor = { x: x[0], y: y[0] };
    const endAnchor = { x: x[1], y: y[1] };
    if (distance < 1) {
      return {
        start: startAnchor,
        end: endAnchor,
        startAnchor,
        endAnchor
      };
    }
    const gap = Math.min(connectionGap, distance * 0.3);
    const unitX = deltaX / distance;
    const unitY = deltaY / distance;
    return {
      start: {
        x: x[0] + unitX * gap,
        y: y[0] + unitY * gap
      },
      end: {
        x: x[1] - unitX * gap,
        y: y[1] - unitY * gap
      },
      startAnchor,
      endAnchor
    };
  }

  function savedConnectionAnchor(resource, saved, fallback) {
    if (
      !saved || !Number.isFinite(saved.x) || !Number.isFinite(saved.y)
    ) return fallback;
    const interior = frameInterior(resource);
    return {
      x: interior.left +
        clamp(saved.x, 0, 1) * (interior.right - interior.left),
      y: interior.top +
        clamp(saved.y, 0, 1) * (interior.bottom - interior.top)
    };
  }

  function connectionAnchorRatio(resource, point) {
    const interior = frameInterior(resource);
    return {
      x: clamp(
        (point.x - interior.left) / (interior.right - interior.left || 1),
        0,
        1
      ),
      y: clamp(
        (point.y - interior.top) / (interior.bottom - interior.top || 1),
        0,
        1
      )
    };
  }

  function snapConnectionAnchor(resource, point) {
    const interior = frameInterior(resource);
    let x = clamp(point.x, interior.left, interior.right);
    let y = clamp(point.y, interior.top, interior.bottom);
    const inside =
      point.x >= interior.left && point.x <= interior.right &&
      point.y >= interior.top && point.y <= interior.bottom;
    if (inside) {
      const edges = [
        { distance: point.x - interior.left, x: interior.left, y },
        { distance: interior.right - point.x, x: interior.right, y },
        { distance: point.y - interior.top, x, y: interior.top },
        { distance: interior.bottom - point.y, x, y: interior.bottom }
      ];
      const nearest = edges.reduce((best, edge) =>
        edge.distance < best.distance ? edge : best
      );
      x = nearest.x;
      y = nearest.y;
    }
    return { x, y };
  }

  function pointToward(anchor, target) {
    const deltaX = target.x - anchor.x;
    const deltaY = target.y - anchor.y;
    const distance = Math.hypot(deltaX, deltaY);
    if (distance < 1) return { ...anchor };
    const gap = Math.min(connectionGap, distance * 0.3);
    return {
      x: anchor.x + deltaX / distance * gap,
      y: anchor.y + deltaY / distance * gap
    };
  }

  function pointOutsideFrame(anchor, saved, target) {
    const candidates = [];
    const epsilon = 0.001;
    if (saved.x <= epsilon) candidates.push({ x: -1, y: 0 });
    if (saved.x >= 1 - epsilon) candidates.push({ x: 1, y: 0 });
    if (saved.y <= epsilon) candidates.push({ x: 0, y: -1 });
    if (saved.y >= 1 - epsilon) candidates.push({ x: 0, y: 1 });
    if (!candidates.length) return pointToward(anchor, target);
    const deltaX = target.x - anchor.x;
    const deltaY = target.y - anchor.y;
    const direction = candidates.reduce((best, candidate) => {
      const score = candidate.x * deltaX + candidate.y * deltaY;
      return score > best.score ? { ...candidate, score } : best;
    }, { ...candidates[0], score: -Infinity });
    return {
      x: anchor.x + direction.x * connectionGap,
      y: anchor.y + direction.y * connectionGap
    };
  }

  function connectionGeometry(connection, from, to, manualPoints) {
    const automatic = closestConnectionPoints(from, to);
    const startAnchor = savedConnectionAnchor(
      from,
      connection.manualStart,
      automatic.startAnchor
    );
    const endAnchor = savedConnectionAnchor(
      to,
      connection.manualEnd,
      automatic.endAnchor
    );
    const startTarget = manualPoints[0] || endAnchor;
    const endTarget = manualPoints[manualPoints.length - 1] || startAnchor;
    return {
      start: connection.manualStart
        ? pointOutsideFrame(startAnchor, connection.manualStart, startTarget)
        : automatic.start,
      end: connection.manualEnd
        ? pointOutsideFrame(endAnchor, connection.manualEnd, endTarget)
        : automatic.end,
      startAnchor,
      endAnchor
    };
  }

  function automaticConnectionPoints(connection, start, end) {
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const length = Math.hypot(deltaX, deltaY);
    if (length < 1) return [start, end];

    const random = seeded(
      "connector:" + connection.from + ":" + connection.to
    );
    const normalX = -deltaY / length;
    const normalY = deltaX / length;
    const tangentX = deltaX / length;
    const tangentY = deltaY / length;
    const bend = Math.min(240, Math.max(54, length * 0.16));
    const shake = Math.min(9, Math.max(3, length * 0.009));
    const bendDirection = random() < 0.5 ? -1 : 1;
    const segments = Math.round(clamp(length / 34, 9, 36));
    const points = [start];
    let tremor = 0;
    for (let index = 1; index < segments; index += 1) {
      const progress = index / segments;
      const envelope = Math.sin(Math.PI * progress);
      tremor = tremor * 0.28 + (random() - 0.5) * shake * 2;
      const broadDrift = bendDirection * bend *
        Math.sin(Math.PI * progress);
      const sideOffset = broadDrift + tremor * envelope;
      const alongOffset = (random() - 0.5) * shake * 0.7 * envelope;
      points.push({
        x: start.x + deltaX * progress + normalX * sideOffset +
          tangentX * alongOffset,
        y: start.y + deltaY * progress + normalY * sideOffset +
          tangentY * alongOffset
      });
    }
    points.push(end);
    return points;
  }

  function smoothConnectionPath(points) {
    let pathData =
      "M " + points[0].x.toFixed(2) + " " + points[0].y.toFixed(2);
    for (let index = 1; index < points.length - 1; index += 1) {
      const point = points[index];
      const next = points[index + 1];
      const midpoint = {
        x: (point.x + next.x) / 2,
        y: (point.y + next.y) / 2
      };
      pathData +=
        " Q " + point.x.toFixed(2) + " " + point.y.toFixed(2) +
        " " + midpoint.x.toFixed(2) + " " + midpoint.y.toFixed(2);
    }
    const penultimate = points[points.length - 2];
    const end = points[points.length - 1];
    pathData +=
      " Q " + penultimate.x.toFixed(2) + " " +
      penultimate.y.toFixed(2) + " " + end.x.toFixed(2) + " " +
      end.y.toFixed(2);
    return pathData;
  }

  function beginConnectionPointMove(event, connection, pointIndex) {
    const point = connection.manualPoints[pointIndex];
    event.preventDefault();
    event.stopPropagation();
    gesture = {
      kind: "connection-point",
      startX: event.clientX,
      startY: event.clientY,
      x: point.x,
      y: point.y,
      connection,
      pointIndex
    };
  }

  function beginConnectionEndpointMove(
    event,
    connection,
    endpoint,
    resource,
    point
  ) {
    event.preventDefault();
    event.stopPropagation();
    gesture = {
      kind: "connection-endpoint",
      startX: event.clientX,
      startY: event.clientY,
      x: point.x,
      y: point.y,
      connection,
      endpoint,
      resource
    };
  }

  function drawConnections() {
    const svgNamespace = "http://www.w3.org/2000/svg";
    lines.innerHTML = "";

    const definitions = document.createElementNS(svgNamespace, "defs");
    const arrowClip = document.createElementNS(svgNamespace, "clipPath");
    arrowClip.setAttribute("id", "connection-arrow-clip");
    const arrowClipRect = document.createElementNS(svgNamespace, "rect");
    arrowClipRect.setAttribute("x", "0");
    arrowClipRect.setAttribute("y", "0");
    arrowClipRect.setAttribute("width", "32");
    arrowClipRect.setAttribute("height", "41");
    arrowClip.append(arrowClipRect);
    definitions.append(arrowClip);

    const arrowMarker = document.createElementNS(svgNamespace, "marker");
    arrowMarker.setAttribute("id", "connection-arrow");
    arrowMarker.setAttribute("viewBox", "0 0 42 41");
    arrowMarker.setAttribute("refX", "31");
    arrowMarker.setAttribute("refY", "20.5");
    arrowMarker.setAttribute("markerWidth", "16.8");
    arrowMarker.setAttribute("markerHeight", "16.4");
    arrowMarker.setAttribute("markerUnits", "userSpaceOnUse");
    arrowMarker.setAttribute("orient", "auto");

    const arrowImage = document.createElementNS(svgNamespace, "image");
    arrowImage.setAttribute("href", "assets/images/connection-arrow.png");
    arrowImage.setAttribute("width", "42");
    arrowImage.setAttribute("height", "41");
    arrowImage.setAttribute("preserveAspectRatio", "xMidYMid meet");
    arrowImage.setAttribute("transform", "translate(42 0) scale(-1 1)");
    arrowImage.setAttribute("clip-path", "url(#connection-arrow-clip)");
    arrowImage.setAttribute("class", "connection-arrow-image");
    arrowMarker.append(arrowImage);

    definitions.append(arrowMarker);
    lines.append(definitions);

    (data.connections || []).forEach(connection => {
      const from = data.resources.find(item => item.id === connection.from);
      const to = data.resources.find(item => item.id === connection.to);
      if (!from || !to) return;

      const manualPoints = Array.isArray(connection.manualPoints)
        ? connection.manualPoints
        : [];
      const { start, end } = connectionGeometry(
        connection,
        from,
        to,
        manualPoints
      );
      const points = manualPoints.length
        ? [start, ...manualPoints, end]
        : automaticConnectionPoints(connection, start, end);

      const path = document.createElementNS(svgNamespace, "path");
      path.setAttribute(
        "class",
        "connection-path" +
          (selectedConnection === connection ? " selected-connection" : "")
      );
      path.setAttribute("d", smoothConnectionPath(points));
      path.setAttribute("marker-end", "url(#connection-arrow)");
      lines.append(path);

      if (edit) {
        const hitPath = document.createElementNS(svgNamespace, "path");
        hitPath.setAttribute("class", "connection-hit-area");
        hitPath.setAttribute("d", smoothConnectionPath(points));
        hitPath.setAttribute("tabindex", "0");
        hitPath.setAttribute("role", "button");
        hitPath.setAttribute("aria-label", "Select connection");
        const selectLine = event => {
          event.preventDefault();
          event.stopPropagation();
          selectedIds.clear();
          selected = null;
          connectFrom = null;
          disconnectFrom = null;
          updateSelectionDisplay();
          selectedConnection = connection;
          connectionEditMode = false;
          drawConnections();
        };
        hitPath.addEventListener("pointerenter", () => {
          path.classList.add("is-hovered");
        });
        hitPath.addEventListener("pointerleave", () => {
          path.classList.remove("is-hovered");
        });
        hitPath.addEventListener("pointerdown", selectLine);
        hitPath.addEventListener("keydown", event => {
          if (event.key === "Enter" || event.key === " ") selectLine(event);
        });
        lines.append(hitPath);
      }

      if (
        edit && connectionEditMode && selectedConnection === connection &&
        manualPoints.length
      ) {
        [
          { endpoint: "start", resource: from, point: start },
          { endpoint: "end", resource: to, point: end }
        ].forEach(item => {
          const control = document.createElementNS(svgNamespace, "circle");
          control.setAttribute(
            "class",
            "connection-control connection-endpoint connection-endpoint-" +
              item.endpoint
          );
          control.setAttribute("cx", item.point.x);
          control.setAttribute("cy", item.point.y);
          control.setAttribute("r", "9");
          control.addEventListener("pointerdown", event =>
            beginConnectionEndpointMove(
              event,
              connection,
              item.endpoint,
              item.resource,
              item.point
            )
          );
          lines.append(control);
        });
        manualPoints.forEach((point, pointIndex) => {
          const control = document.createElementNS(svgNamespace, "circle");
          control.setAttribute("class", "connection-control");
          control.setAttribute("cx", point.x);
          control.setAttribute("cy", point.y);
          control.setAttribute("r", "7");
          control.addEventListener("pointerdown", event =>
            beginConnectionPointMove(event, connection, pointIndex)
          );
          lines.append(control);
        });
      }
    });
  }

  function editSelectedConnection() {
    if (!selectedConnection) {
      alert("Select a connection line first.");
      return;
    }
    const from = data.resources.find(
      item => item.id === selectedConnection.from
    );
    const to = data.resources.find(item => item.id === selectedConnection.to);
    if (!from || !to) return;
    if (!Array.isArray(selectedConnection.manualPoints) ||
        !selectedConnection.manualPoints.length) {
      const { start, end } = connectionGeometry(
        selectedConnection,
        from,
        to,
        []
      );
      const automaticPoints = automaticConnectionPoints(
        selectedConnection,
        start,
        end
      );
      selectedConnection.manualPoints = Array.from({ length: 6 }, (_, index) => {
        const position = Math.round(
          ((index + 1) * (automaticPoints.length - 1)) / 7
        );
        return { ...automaticPoints[position] };
      });
      saveLocal();
    }
    connectionEditMode = true;
    drawConnections();
  }

  function resetSelectedConnection() {
    if (!selectedConnection) {
      alert("Select a connection line first.");
      return;
    }
    delete selectedConnection.manualPoints;
    delete selectedConnection.manualStart;
    delete selectedConnection.manualEnd;
    connectionEditMode = false;
    drawConnections();
    saveLocal();
  }

  function centerResource(id) {
    const resource = data.resources.find(item => item.id === id);
    if (!resource) return false;
    camera.x =
      innerWidth / 2 - (resource.x + resource.width / 2) * camera.zoom;
    camera.y =
      innerHeight / 2 - (resource.y + resource.height / 2) * camera.zoom;
    applyCamera();
    return true;
  }

  function focusResource(id) {
    const resource = data.resources.find(item => item.id === id);
    if (!resource) return false;
    camera.zoom = clamp(
      data.home.zoom * 1.18,
      minimumZoom,
      maximumZoom
    );
    camera.x =
      innerWidth / 2 - (resource.x + resource.width / 2) * camera.zoom;
    camera.y =
      innerHeight * 0.22 - (resource.y + resource.height / 2) * camera.zoom;
    applyCamera();
    return true;
  }

  function centerWeek(number) {
    const resource = data.resources.find(
      item => item.week === Number(number) && item.type === "week"
    );
    return resource ? focusResource(resource.id) : false;
  }

  function nearestListAnchor() {
    let bestAnchor = "syllabus";
    let bestDistance = Infinity;
    const anchors = data.resources.filter(
      item => item.id === "syllabus" || item.type === "week"
    );
    for (const resource of anchors) {
      const screenX =
        (resource.x + resource.width / 2) * camera.zoom + camera.x;
      const screenY =
        (resource.y + resource.height / 2) * camera.zoom + camera.y;
      const distance =
        (screenX - innerWidth / 2) ** 2 + (screenY - innerHeight / 2) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestAnchor = resource.id === "syllabus"
          ? resource.id
          : "week" + String(resource.week).padStart(2, "0");
      }
    }
    return bestAnchor;
  }

  function selectedResources() {
    return data.resources.filter(resource => selectedIds.has(resource.id));
  }

  function updateSelectionDisplay() {
    world.querySelectorAll(".canvas-object").forEach(element => {
      element.classList.toggle("selected", selectedIds.has(element.dataset.id));
    });
  }

  function selectResource(resource, additive) {
    if (selectedConnection) {
      selectedConnection = null;
      connectionEditMode = false;
      drawConnections();
    }
    const group = resource.groupId
      ? data.resources.filter(item => item.groupId === resource.groupId)
      : [resource];
    const groupIds = group.map(item => item.id);
    if (!additive) {
      selectedIds = new Set(groupIds);
      selected = resource;
    } else if (groupIds.every(id => selectedIds.has(id))) {
      groupIds.forEach(id => selectedIds.delete(id));
      selected = selectedIds.size ? selectedResources().at(-1) : null;
    } else {
      groupIds.forEach(id => selectedIds.add(id));
      selected = resource;
    }
    updateSelectionDisplay();
  }

  function groupSelection() {
    const resources = selectedResources();
    if (resources.length < 2) {
      alert("Hold Shift and select at least two objects first.");
      return;
    }
    const groupId = "group-" + Date.now();
    resources.forEach(resource => {
      resource.groupId = groupId;
    });
    saveLocal();
  }

  function ungroupSelection() {
    const groupIds = new Set(
      selectedResources().map(resource => resource.groupId).filter(Boolean)
    );
    if (!groupIds.size) {
      alert("Select an object that belongs to a group first.");
      return;
    }
    data.resources.forEach(resource => {
      if (groupIds.has(resource.groupId)) delete resource.groupId;
    });
    saveLocal();
  }

  function deleteSelection() {
    if (selectedConnection) {
      if (!confirm("Delete this connection?")) return;
      data.connections = data.connections.filter(
        connection => connection !== selectedConnection
      );
      selectedConnection = null;
      connectionEditMode = false;
      drawConnections();
      saveLocal();
      return;
    }
    const ids = new Set(selectedIds);
    if (!ids.size && selected) ids.add(selected.id);
    if (!ids.size) {
      alert("Select an object first.");
      return;
    }
    const label = ids.size === 1 ? "this object" : "these objects";
    if (!confirm("Delete " + label + "?")) return;
    data.resources = data.resources.filter(resource => !ids.has(resource.id));
    data.connections = data.connections.filter(connection =>
      !ids.has(connection.from) && !ids.has(connection.to)
    );
    ids.forEach(id => {
      world.querySelector('[data-id="' + id + '"]')?.remove();
    });
    selectedIds.clear();
    selected = null;
    connectFrom = null;
    disconnectFrom = null;
    if (
      selectedConnection &&
      (ids.has(selectedConnection.from) || ids.has(selectedConnection.to))
    ) {
      selectedConnection = null;
      connectionEditMode = false;
    }
    drawConnections();
    saveLocal();
  }

  function bindEditNode(element, resource, handle, dragHandle) {
    const beginMove = event => {
      event.preventDefault();
      event.stopPropagation();
      selectResource(resource, event.shiftKey);
      if (!selectedIds.has(resource.id)) return;
      gesture = {
        kind: "move",
        startX: event.clientX,
        startY: event.clientY,
        items: selectedResources().map(item => ({
          resource: item,
          x: item.x,
          y: item.y
        }))
      };
    };

    element.addEventListener("pointerdown", event => {
      if (
        event.target.closest("a, button, [contenteditable]") ||
        event.target === handle ||
        event.target === dragHandle
      ) return;
      beginMove(event);
    });

    dragHandle.addEventListener("pointerdown", beginMove);

    handle.addEventListener("pointerdown", event => {
      event.preventDefault();
      event.stopPropagation();
      selectResource(resource, false);
      resource.heightMode = "manual";
      gesture = {
        kind: "resize",
        startX: event.clientX,
        startY: event.clientY,
        width: resource.width,
        height: resource.height,
        resource,
        element
      };
    });
  }

  function beginPinch() {
    stopZoomMomentum(false);
    const [a, b] = [...touchPoints.values()];
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    pinch = {
      startDistance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      startZoom: camera.zoom,
      worldX: (midX - camera.x) / camera.zoom,
      worldY: (midY - camera.y) / camera.zoom
    };
  }

  viewport.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    const object = event.target.closest(".canvas-object");
    if ((edit && object) || event.target.closest("a, button")) return;
    event.preventDefault();

    if (event.pointerType === "touch") {
      touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchPoints.size >= 2) {
        beginPinch();
        gesture = null;
        viewport.classList.remove("is-panning");
        return;
      }
    }

    gesture = {
      kind: "pan",
      startX: event.clientX,
      startY: event.clientY,
      x: camera.x,
      y: camera.y
    };
    viewport.classList.add("is-panning");
  });

  addEventListener("pointermove", event => {
    if (pinch && touchPoints.has(event.pointerId)) {
      touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const points = [...touchPoints.values()];
      if (points.length < 2) return;
      const [a, b] = points;
      const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const newZoom = clamp(
        pinch.startZoom * (distance / pinch.startDistance),
        minimumZoom,
        maximumZoom
      );
      camera.zoom = newZoom;
      camera.x = midX - pinch.worldX * newZoom;
      camera.y = midY - pinch.worldY * newZoom;
      applyCamera();
      return;
    }
    if (!gesture) return;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (gesture.kind === "pan") {
      camera.x = gesture.x + deltaX;
      camera.y = gesture.y + deltaY;
    } else if (gesture.kind === "move") {
      gesture.items.forEach(item => {
        item.resource.x = item.x + deltaX / camera.zoom;
        item.resource.y = item.y + deltaY / camera.zoom;
        const element = world.querySelector(
          '[data-id="' + item.resource.id + '"]'
        );
        element.style.setProperty("--x", item.resource.x + "px");
        element.style.setProperty("--y", item.resource.y + "px");
      });
    } else if (gesture.kind === "resize") {
      gesture.resource.width = Math.max(
        100,
        gesture.width + deltaX / camera.zoom
      );
      gesture.resource.height = Math.max(
        60,
        gesture.height + deltaY / camera.zoom
      );
      gesture.element.style.setProperty("--w", gesture.resource.width + "px");
      gesture.element.style.setProperty("--h", gesture.resource.height + "px");
    } else if (gesture.kind === "connection-point") {
      const point = gesture.connection.manualPoints[gesture.pointIndex];
      point.x = gesture.x + deltaX / camera.zoom;
      point.y = gesture.y + deltaY / camera.zoom;
    } else if (gesture.kind === "connection-endpoint") {
      const pointer = {
        x: gesture.x + deltaX / camera.zoom,
        y: gesture.y + deltaY / camera.zoom
      };
      const anchor = snapConnectionAnchor(gesture.resource, pointer);
      gesture.connection[
        gesture.endpoint === "start" ? "manualStart" : "manualEnd"
      ] = connectionAnchorRatio(gesture.resource, anchor);
    }
    applyCamera();
  });

  addEventListener("pointerup", event => {
    if (event.pointerType === "touch" && touchPoints.has(event.pointerId)) {
      touchPoints.delete(event.pointerId);
      if (pinch && touchPoints.size < 2) {
        pinch = null;
        applyCamera();
        saveLocal();
        const rest = [...touchPoints.values()][0];
        gesture = rest
          ? { kind: "pan", startX: rest.x, startY: rest.y, x: camera.x, y: camera.y }
          : null;
      }
      if (touchPoints.size > 0) return;
    }
    gesture = null;
    pinch = null;
    viewport.classList.remove("is-panning");
    saveLocal();
  });

  addEventListener("pointercancel", event => {
    touchPoints.delete(event.pointerId);
    if (touchPoints.size < 2) pinch = null;
    if (touchPoints.size === 0) {
      gesture = null;
      viewport.classList.remove("is-panning");
    }
  });

  function zoomAround(factor, clientX, clientY) {
    const oldZoom = camera.zoom;
    const newZoom = clamp(
      oldZoom * factor,
      minimumZoom,
      maximumZoom
    );
    if (newZoom === oldZoom) return false;
    const worldX = (clientX - camera.x) / oldZoom;
    const worldY = (clientY - camera.y) / oldZoom;
    camera.zoom = newZoom;
    camera.x = clientX - worldX * newZoom;
    camera.y = clientY - worldY * newZoom;
    applyCamera();
    return true;
  }

  function stopZoomMomentum(settle) {
    clearTimeout(zoomMomentumTimer);
    cancelAnimationFrame(zoomMomentumFrame);
    zoomMomentumTimer = null;
    zoomMomentumFrame = null;
    zoomVelocity = 0;
    if (settle) applyCamera();
  }

  function startZoomMomentum() {
    zoomMomentumTimer = null;
    const step = () => {
      if (Math.abs(zoomVelocity) < 0.00045) {
        stopZoomMomentum(true);
        return;
      }
      if (!zoomAround(Math.exp(zoomVelocity), zoomFocus.x, zoomFocus.y)) {
        stopZoomMomentum(true);
        return;
      }
      zoomVelocity *= 0.86;
      zoomMomentumFrame = requestAnimationFrame(step);
    };
    zoomMomentumFrame = requestAnimationFrame(step);
  }

  viewport.addEventListener(
    "wheel",
    event => {
      event.preventDefault();
      if (!event.ctrlKey) {
        stopZoomMomentum(false);
        camera.x -= event.deltaX;
        camera.y -= event.deltaY;
        applyCamera();
        return;
      }
      clearTimeout(zoomMomentumTimer);
      cancelAnimationFrame(zoomMomentumFrame);
      zoomMomentumFrame = null;
      const logDelta = clamp(-event.deltaY * 0.008, -0.32, 0.32);
      zoomVelocity = clamp(
        zoomVelocity * 0.35 + logDelta * 0.65,
        -0.075,
        0.075
      );
      zoomFocus = { x: event.clientX, y: event.clientY };
      zoomAround(Math.exp(logDelta), zoomFocus.x, zoomFocus.y);
      zoomMomentumTimer = setTimeout(startZoomMomentum, 55);
    },
    { passive: false }
  );

  function saveLocal() {
    if (edit) {
      try {
        localStorage.setItem("code-as-nature-layout", JSON.stringify(data));
      } catch (error) {
        if (!saveWarningShown) {
          saveWarningShown = true;
          alert(
            "This local image is too large for temporary browser storage. " +
            "You can still export resources-data.js now to preserve it."
          );
        }
      }
    }
  }

  document.querySelector("#back-origin").addEventListener("click", () => {
    if (!data) return;
    camera = { ...data.home };
    applyCamera();
  });

  document
    .querySelector("[data-view-switch]")
    .addEventListener("click", event => {
      event.preventDefault();
      const anchor = data ? nearestListAnchor() : "syllabus";
      location.href = "index.html#" + anchor;
    });

  function youtubeThumbnail(urlValue) {
    try {
      const url = new URL(urlValue);
      const hostname = url.hostname.replace(/^www\./, "");
      let videoId = "";
      if (hostname === "youtu.be") {
        videoId = url.pathname.split("/").filter(Boolean)[0] || "";
      } else if (hostname.endsWith("youtube.com")) {
        videoId = url.searchParams.get("v") || "";
        if (!videoId) {
          const parts = url.pathname.split("/").filter(Boolean);
          if (["embed", "shorts", "live"].includes(parts[0])) {
            videoId = parts[1] || "";
          }
        }
      }
      return videoId
        ? "https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg"
        : "";
    } catch (error) {
      return "";
    }
  }

  function generatedLinkPlaceholder(urlValue) {
    let hostname = "external link";
    try {
      hostname = new URL(urlValue).hostname.replace(/^www\./, "") || hostname;
    } catch (error) {
      hostname = "external link";
    }
    const label = escapeHTML(hostname.slice(0, 34));
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="420" height="310" ' +
      'viewBox="0 0 420 310">' +
      '<rect width="420" height="310" fill="#080808"/>' +
      '<text x="22" y="148" fill="#f2f2f2" font-family="monospace" ' +
      'font-size="24">' + label + "</text>" +
      '<text x="22" y="181" fill="#777" font-family="monospace" ' +
      'font-size="15">link preview</text></svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  async function linkMetadata(urlValue) {
    const fallback = {
      image: generatedLinkPlaceholder(urlValue),
      title: "",
      description: ""
    };
    let url;
    try {
      url = new URL(urlValue);
      if (!["http:", "https:"].includes(url.protocol)) return fallback;
    } catch (error) {
      return fallback;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(
        "https://api.microlink.io/?url=" + encodeURIComponent(url.href) +
          "&screenshot=true",
        { signal: controller.signal }
      );
      if (!response.ok) return fallback;
      const result = await response.json();
      const metadata = result && result.status === "success"
        ? result.data || {}
        : {};
      return {
        image: metadata.screenshot?.url || metadata.image?.url ||
          metadata.logo?.url || fallback.image,
        title: metadata.title || "",
        description: metadata.publisher || metadata.description || ""
      };
    } catch (error) {
      return fallback;
    } finally {
      clearTimeout(timeout);
    }
  }

  function chooseLocalImage() {
    return new Promise(resolve => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.hidden = true;
      document.body.append(input);
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        input.remove();
        resolve(value);
      };
      input.addEventListener("cancel", () => finish(null), { once: true });
      input.addEventListener("change", () => {
        const file = input.files?.[0];
        if (!file) {
          finish(null);
          return;
        }
        const reader = new FileReader();
        reader.addEventListener("load", () => finish({
          image: reader.result,
          name: file.name
        }), { once: true });
        reader.addEventListener("error", () => {
          alert("That image could not be loaded.");
          finish(null);
        }, { once: true });
        reader.readAsDataURL(file);
      }, { once: true });
      input.click();
    });
  }

  function readLocalImageFile(file) {
    return new Promise(resolve => {
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve({
        image: reader.result,
        name: file.name
      }), { once: true });
      reader.addEventListener("error", () => resolve(null), { once: true });
      reader.readAsDataURL(file);
    });
  }

  function mediaEditorDialog() {
    let dialog = document.querySelector("#media-editor-dialog");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.id = "media-editor-dialog";
    dialog.className = "media-editor-dialog";
    dialog.innerHTML =
      '<form class="media-editor-form">' +
      '<h2 data-media-editor-title>edit media</h2>' +
      '<label>type<select name="kind">' +
      '<option value="image">image</option>' +
      '<option value="link">link</option>' +
      '<option value="youtube">youtube</option>' +
      '</select></label>' +
      '<label>linked URL<input name="url" type="text" ' +
      'autocomplete="off" spellcheck="false"></label>' +
      '<label>title<input name="title" type="text"></label>' +
      '<label>description / metadata<input name="meta" type="text"></label>' +
      '<label>image description<input name="alt" type="text"></label>' +
      '<label>thumbnail URL or project path<input name="thumbnail" ' +
      'type="text" autocomplete="off" spellcheck="false"></label>' +
      '<label>or choose a local thumbnail<input name="localImage" ' +
      'type="file" accept="image/*"></label>' +
      '<p class="media-editor-hint" data-media-editor-hint></p>' +
      '<p class="media-editor-status" data-media-editor-status ' +
      'aria-live="polite"></p>' +
      '<div class="media-editor-actions">' +
      '<button type="button" data-media-cancel>cancel</button>' +
      '<button type="submit" data-media-save>save</button>' +
      '</div></form>';
    document.body.append(dialog);
    return dialog;
  }

  function openMediaEditor(draft, adding) {
    const dialog = mediaEditorDialog();
    const form = dialog.querySelector("form");
    const kind = form.elements.kind;
    const url = form.elements.url;
    const title = form.elements.title;
    const meta = form.elements.meta;
    const alt = form.elements.alt;
    const thumbnail = form.elements.thumbnail;
    const localImage = form.elements.localImage;
    const hint = dialog.querySelector("[data-media-editor-hint]");
    const status = dialog.querySelector("[data-media-editor-status]");
    const save = dialog.querySelector("[data-media-save]");
    const cancel = dialog.querySelector("[data-media-cancel]");
    const currentImage = String(draft.image || "");

    dialog.querySelector("[data-media-editor-title]").textContent =
      adding ? "add media" : "edit media";
    kind.value = draft.mediaKind || "image";
    url.value = draft.url || (kind.value === "image" ? "" : "https://");
    title.value = draft.title || "";
    meta.value = draft.meta || "";
    alt.value = draft.alt || "";
    thumbnail.value = currentImage.startsWith("data:") ? "" : currentImage;
    localImage.value = "";
    status.textContent = "";
    save.disabled = false;

    const updateHint = () => {
      hint.textContent = kind.value === "link"
        ? "Leave thumbnail blank to load the linked page's own image. " +
          "Type AUTO to refresh it later."
        : kind.value === "youtube"
          ? "Leave thumbnail blank to use the video's YouTube thumbnail."
          : "Choose a local image or enter an image path.";
    };
    updateHint();

    return new Promise(resolve => {
      let settled = false;
      const cleanup = () => {
        form.removeEventListener("submit", onSubmit);
        kind.removeEventListener("change", updateHint);
        cancel.removeEventListener("click", onCancel);
        dialog.removeEventListener("cancel", onDialogCancel);
      };
      const finish = value => {
        if (settled) return;
        settled = true;
        cleanup();
        if (dialog.open) dialog.close();
        resolve(value);
      };
      const onCancel = () => finish(null);
      const onDialogCancel = event => {
        event.preventDefault();
        finish(null);
      };
      const onSubmit = async event => {
        event.preventDefault();
        let mediaKind = kind.value;
        const urlValue = url.value.trim();
        const thumbnailValue = thumbnail.value.trim();
        const local = await readLocalImageFile(localImage.files?.[0]);
        let image = local?.image || currentImage;
        let automatic = null;

        const detectedYoutubeThumbnail = youtubeThumbnail(urlValue);
        if (mediaKind === "link" && detectedYoutubeThumbnail) {
          mediaKind = "youtube";
          kind.value = "youtube";
          if (meta.value.trim() === "Link") meta.value = "YouTube";
        }

        if (thumbnailValue && thumbnailValue.toUpperCase() !== "AUTO") {
          image = youtubeThumbnail(thumbnailValue) || thumbnailValue;
        }

        if (mediaKind === "youtube") {
          if (!urlValue) {
            status.textContent = "Add a YouTube URL.";
            return;
          }
          const automaticThumbnailInField =
            /\/vi\/[^/]+\/(?:maxres|hq|mq|sd)default\.jpg(?:$|\?)/i.test(
              thumbnailValue
            );
          if (!local && (
            !thumbnailValue ||
            thumbnailValue.toUpperCase() === "AUTO" ||
            automaticThumbnailInField
          )) {
            image = detectedYoutubeThumbnail;
          }
          if (!image) {
            status.textContent = "That does not look like a YouTube URL.";
            return;
          }
        } else if (mediaKind === "link") {
          if (!urlValue || urlValue === "https://") {
            status.textContent = "Add the link URL.";
            return;
          }
          const urlChanged = urlValue !== String(draft.url || "");
          const wantsAutomatic = thumbnailValue.toUpperCase() === "AUTO";
          const hasManualThumbnail = Boolean(
            local || (thumbnailValue && !wantsAutomatic)
          );
          if (
            !hasManualThumbnail &&
            (!image || adding || urlChanged || wantsAutomatic)
          ) {
            save.disabled = true;
            status.textContent = "loading the website thumbnail…";
            automatic = await linkMetadata(urlValue);
            image = automatic.image;
            save.disabled = false;
          }
        } else if (!image) {
          status.textContent = "Choose a local image or enter its path.";
          return;
        }

        const finalTitle = title.value.trim() || automatic?.title ||
          local?.name?.replace(/\.[^.]+$/, "") || "New resource";
        finish({
          mediaKind,
          title: finalTitle,
          url: mediaKind === "image" ? urlValue : (urlValue || image),
          meta: meta.value.trim() || automatic?.description ||
            (mediaKind === "youtube" ? "YouTube" :
              mediaKind === "link" ? "Link" : "Image"),
          alt: alt.value.trim() || finalTitle,
          image
        });
      };

      form.addEventListener("submit", onSubmit);
      kind.addEventListener("change", updateHint);
      cancel.addEventListener("click", onCancel);
      dialog.addEventListener("cancel", onDialogCancel);
      if (dialog.showModal) dialog.showModal();
      else dialog.setAttribute("open", "");
    });
  }

  function refreshResource(resource) {
    world.querySelector('[data-id="' + resource.id + '"]')?.remove();
    createNode(resource);
    updateSelectionDisplay();
    drawConnections();
    saveLocal();
  }

  function resizeSelectedText(direction) {
    const sizes = [9, 11, 13, 15, 18, 22, 28, 36];
    const resources = selectedResources().filter(
      resource => resource.type === "text"
    );
    if (!resources.length) {
      alert("Select a plain text object first.");
      return;
    }
    resources.forEach(resource => {
      const current = Number(resource.fontSize) || 15;
      const next = direction < 0
        ? sizes.slice().reverse().find(size => size < current)
        : sizes.find(size => size > current);
      if (next === undefined) return;
      resource.fontSize = next;
      world.querySelector('[data-id="' + resource.id + '"]')
        ?.style.setProperty("--text-font-size", next + "px");
    });
    saveLocal();
  }

  function applyMediaValues(resource, values, adding) {
    Object.assign(resource, values);
    if (values.mediaKind === "link") {
      if (adding) resource.width = 210;
      resource.height = 155;
      resource.previewHeight = 155;
    } else if (values.mediaKind === "youtube") {
      if (adding) resource.width = 240;
      resource.height = 135;
      resource.previewHeight = 135;
    } else {
      if (adding) {
        resource.width = 240;
        resource.height = 135;
      }
      delete resource.previewHeight;
    }
  }

  async function editMediaResource(resource) {
    const values = await openMediaEditor({ ...resource }, false);
    if (!values) return false;
    applyMediaValues(resource, values, false);
    refreshResource(resource);
    return true;
  }

  async function chooseThumbnail(resource) {
    return editMediaResource(resource);
  }

  async function editSelectedMedia() {
    if (!selected || selected.type !== "media") {
      alert("Select a media object first.");
      return;
    }
    await editMediaResource(selected);
  }

  async function addResource(type) {
    const resource = {
      id: "item" + Date.now(),
      type,
      x: (innerWidth / 2 - camera.x) / camera.zoom,
      y: (innerHeight / 2 - camera.y) / camera.zoom,
      width: 360,
      height: 120
    };
    if (type === "text") {
      const text = prompt("Text:", "New text");
      if (text === null) return;
      resource.text = text;
      resource.fontSize = 15;
    } else {
      resource.type = "media";
      const values = await openMediaEditor({
        mediaKind: type,
        meta: type === "youtube" ? "YouTube" :
          type === "link" ? "Link" : "Image"
      }, true);
      if (!values) return;
      applyMediaValues(resource, values, true);
    }
    data.resources.push(resource);
    createNode(resource);
    selectResource(resource, false);
    saveLocal();
  }

  async function exportFile() {
    const contents =
      "window.CANVAS_DATA = " + JSON.stringify(data, null, 2) + ";\n";
    if (window.showSaveFilePicker) {
      try {
        const handle = await showSaveFilePicker({
          suggestedName: "resources-data.js",
          types: [
            {
              description: "Canvas data",
              accept: { "text/javascript": [".js"] }
            }
          ]
        });
        const writer = await handle.createWritable();
        await writer.write(contents);
        await writer.close();
        return;
      } catch (error) {
        if (error.name === "AbortError") return;
      }
    }
    const blob = new Blob([contents], { type: "text/javascript" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "resources-data.js";
    link.click();
    URL.revokeObjectURL(link.href);
    alert(
      "Exported resources-data.js. Replace the website's existing " +
      "resources-data.js with this file to publish the edits."
    );
  }

  toolbar?.addEventListener("click", async event => {
    const action = event.target.dataset.action;
    if (!action) return;
    if (action === "add-text") await addResource("text");
    if (action === "text-smaller") resizeSelectedText(-1);
    if (action === "text-larger") resizeSelectedText(1);
    if (action === "add-image") await addResource("image");
    if (action === "add-link") await addResource("link");
    if (action === "add-youtube") await addResource("youtube");
    if (action === "edit-media") await editSelectedMedia();
    if (action === "thumbnail") {
      if (!selected || selected.type !== "media") {
        alert("Select a media object first.");
      } else {
        await chooseThumbnail(selected);
      }
    }
    if (action === "group") groupSelection();
    if (action === "ungroup") ungroupSelection();
    if (action === "delete") deleteSelection();
    if (action === "preview") {
      const previewing = document.body.classList.toggle("edit-preview");
      event.target.textContent = previewing ? "SHOW EDIT FRAMES" : "PREVIEW";
    }
    if (action === "set-home") {
      data.home = { ...camera };
      saveLocal();
    }
    if (action === "connect") {
      if (!selected || selected.type === "media") {
        alert("Select a text node first.");
        return;
      }
      if (!connectFrom) {
        disconnectFrom = null;
        connectFrom = selected.id;
        alert("Select another text node, then click CONNECT again.");
        return;
      }
      if (connectFrom === selected.id) return;
      const duplicate = data.connections.some(
        connection =>
          connection.from === connectFrom && connection.to === selected.id
      );
      if (!duplicate) {
        data.connections.push({ from: connectFrom, to: selected.id });
      }
      connectFrom = null;
      drawConnections();
      saveLocal();
    }
    if (action === "edit-connection") editSelectedConnection();
    if (action === "reset-connection") resetSelectedConnection();
    if (action === "remove-connection") {
      if (selectedConnection) {
        data.connections = data.connections.filter(
          connection => connection !== selectedConnection
        );
        selectedConnection = null;
        connectionEditMode = false;
        drawConnections();
        saveLocal();
        return;
      }
      if (!selected || selected.type === "media") {
        alert("Select a text node first.");
        return;
      }
      if (!disconnectFrom) {
        connectFrom = null;
        disconnectFrom = selected.id;
        alert(
          "Select the other connected text node, then click " +
          "REMOVE CONNECTION again."
        );
        return;
      }
      if (disconnectFrom === selected.id) return;
      const previousCount = data.connections.length;
      data.connections = data.connections.filter(connection =>
        !(
          (connection.from === disconnectFrom &&
            connection.to === selected.id) ||
          (connection.from === selected.id &&
            connection.to === disconnectFrom)
        )
      );
      disconnectFrom = null;
      if (data.connections.length === previousCount) {
        alert("Those nodes do not have a connection.");
        return;
      }
      if (
        selectedConnection &&
        !data.connections.includes(selectedConnection)
      ) {
        selectedConnection = null;
        connectionEditMode = false;
      }
      drawConnections();
      saveLocal();
    }
    if (action === "export") exportFile();
  });

  function initialize(json) {
    let cached = null;
    try {
      cached = JSON.parse(localStorage.getItem("code-as-nature-layout"));
    } catch (error) {
      cached = null;
    }
    data =
      edit && cached && cached.version === json.version ? cached : json;
    data.lastUpdated = { ...json.lastUpdated };
    if (data === cached) {
      const baseResources = new Map(
        json.resources.map(resource => [resource.id, resource])
      );
      let migratedThumbnails = false;
      data.resources.forEach(resource => {
        const base = baseResources.get(resource.id);
        if (
          resource.type === "media" &&
          (
            (
              /^https:\/\/iad\.microlink\.io\//.test(resource.image || "") ||
              (
              String(resource.image || "").startsWith("data:image/svg+xml") &&
                /link%20preview/i.test(resource.image || "")
              ) ||
              resource.image === "assets/images/link-placeholder.svg"
            ) ||
            (
              String(resource.image || "").startsWith("assets/thumbnails/") &&
              String(resource.image).split("?")[0] ===
                String(base?.image || "").split("?")[0] &&
              resource.image !== base.image
            )
          ) &&
          String(base?.image || "").startsWith("assets/thumbnails/")
        ) {
          resource.image = base.image;
          if (/^google\.com\/url\?q=/.test(resource.url || "")) {
            resource.url = base.url;
          }
          migratedThumbnails = true;
        }
      });
      const hasWeek02Details = data.resources.some(resource =>
        /^week02-(?:media|note)-/.test(resource.id)
      );
      if (!hasWeek02Details) {
        json.resources
          .filter(resource => /^week02-(?:media|note)-/.test(resource.id))
          .forEach(resource => {
            data.resources.push(JSON.parse(JSON.stringify(resource)));
          });
        migratedThumbnails = true;
      }
      [
        "week01-media-parallel-ii",
        "week01-media-parallel-iii"
      ]
        .forEach(id => {
          if (data.resources.some(resource => resource.id === id)) return;
          const resource = baseResources.get(id);
          if (!resource) return;
          data.resources.push(JSON.parse(JSON.stringify(resource)));
          migratedThumbnails = true;
        });
      const week03Content = data.resources.find(
        resource => resource.id === "week03-content"
      );
      const harawayIndex = week03Content?.items?.findIndex(item =>
        item.includes("Donna J. Haraway (2016)")
      );
      if (
        harawayIndex >= 0 &&
        week03Content.items[harawayIndex].includes("<em>“Hyperobjects")
      ) {
        week03Content.items[harawayIndex] = week03Content.items[harawayIndex]
          .replace("<em>“Hyperobjects", "“Hyperobjects")
          .replace("World”</em> — Timothy Morton", "World” — Timothy Morton");
        migratedThumbnails = true;
      }
      if (
        harawayIndex >= 0 &&
        !week03Content.items[harawayIndex].includes("Hyperobjects")
      ) {
        week03Content.items[harawayIndex] +=
          "<br>“Hyperobjects: Philosophy and Ecology After the End of the World” — Timothy Morton (2013)";
        migratedThumbnails = true;
      }
      if (migratedThumbnails) saveLocal();
    }
    camera = { ...data.home };
    data.resources.forEach(createNode);

    if (edit) {
      document.body.classList.add("edit-mode");
      toolbar.hidden = false;
    }

    applyCamera();
    requestAnimationFrame(() => {
      const weekMatch = location.hash.match(/week(\d+)/);
      const id = location.hash.slice(1);
      if (weekMatch && centerWeek(weekMatch[1])) return;
      if (
        id === "syllabus" &&
        focusResource(id)
      ) return;
      if (id && centerResource(id)) return;
      applyCamera();
    });
  }

  if (window.CANVAS_DATA) {
    initialize(window.CANVAS_DATA);
  } else {
    world.textContent = "Canvas data could not be loaded.";
  }
})();
