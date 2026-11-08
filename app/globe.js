/* AllEarth local Globe.GL renderer. Load assets/vendor/globe.gl.min.js first. */
(function (root) {
  'use strict';

  var EAST_ASIA = { lat: 25, lng: 128 };
  var LIMITS = { min: 0.12, max: 3.2 };
  var FEATURED_PINS = { kr: 1, jp: 1, tw: 1, th: 1, vn: 1, us: 1, fr: 1, br: 1, au: 1 };
  var MOVE_THRESHOLD = 7;
  var ZOOM_RESPONSE = 19; // Critically damped: soft start, about 250ms to 95%.

  function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
  function normalLng(value) { return ((value + 540) % 360) - 180; }
  function sameId(a, b) { return String(a || '').toLowerCase() === String(b || '').toLowerCase(); }
  function normalizedFeatures(value) {
    if (Array.isArray(value)) return value;
    if (value && Array.isArray(value.features)) return value.features;
    return [];
  }

  function createAllEarthGlobe(options) {
    options = options || {};
    var element = options.element;
    if (!element) throw new Error('createAllEarthGlobe requires options.element.');
    if (typeof root.Globe !== 'function') {
      var unavailable = new Error('Globe.GL is unavailable. Load assets/vendor/globe.gl.min.js before globe.js.');
      if (options.onError) options.onError(unavailable);
      throw unavailable;
    }

    var countries = Array.isArray(options.countries) ? options.countries.slice() : [];
    var topics = options.topics || {};
    var features = normalizedFeatures(options.features);
    var byId = Object.create(null), featureById = Object.create(null);
    var selectedId = null, globe, controls, resizeObserver;
    var reducedMotionQuery = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)');
    var reducedMotion = !!(reducedMotionQuery && reducedMotionQuery.matches);
    var destroyed = false, radius = 100, fitAltitude = LIMITS.max, homeAltitude = LIMITS.max;
    var pointerMap = Object.create(null), gestureMoved = false, suppressUntil = 0, pinLevel = null;
    var cameraMotion = null, cameraFrame = 0;
    var presentation = null, fitWidth = 0, fitHeight = 0;
    var pinLayer, pinLines, pinEntries = Object.create(null), pinObstacles = [], pinLayoutKey = '';
    var css = root.getComputedStyle(element);
    var palette = {
      ocean: css.getPropertyValue('--color-earth-ocean').trim() || '#B2D0DD',
      land: css.getPropertyValue('--color-earth-land').trim() || '#CCE2AA',
      selected: css.getPropertyValue('--color-lime').trim() || '#DEFA5F'
    };

    countries.forEach(function (country) { if (country && country.id) byId[String(country.id).toLowerCase()] = country; });
    features.forEach(function (feature) { var id = featureId(feature); if (id) featureById[id] = feature; });
    element.setAttribute('aria-label', '국가를 선택할 수 있는 3D 지구본');
    element.tabIndex = element.tabIndex >= 0 ? element.tabIndex : 0;

    function featureId(feature) {
      var p = feature && feature.properties || {};
      return String(p.id || p.ID || p.iso3 || p.ISO_A3 || p.ADM0_A3 || '').toLowerCase();
    }
    function getCountry(id) { return byId[String(id || '').toLowerCase()] || null; }
    function isSelected(feature) { return sameId(featureId(feature), selectedId); }
    function actualView() {
      var view = globe && globe.pointOfView ? globe.pointOfView() : null;
      if (!view || !Number.isFinite(view.lat) || !Number.isFinite(view.lng) || !Number.isFinite(view.altitude)) return { lat: EAST_ASIA.lat, lng: EAST_ASIA.lng, altitude: fitAltitude };
      return { lat: view.lat, lng: normalLng(view.lng), altitude: view.altitude };
    }
    function zoomInfo(view) {
      var percent = Math.round((1 - (view.altitude - LIMITS.min) / (fitAltitude - LIMITS.min)) * 100);
      return { lat: view.lat, lng: view.lng, altitude: view.altitude, zoom: clamp(percent, 0, 100), canZoomIn: view.altitude > LIMITS.min + .002, canZoomOut: view.altitude < fitAltitude - .002 };
    }
    function emitChange() {
      if (destroyed) return;
      var view = actualView();
      if (controls) controls.rotateSpeed = .12 + .28 * clamp((view.altitude - LIMITS.min) / (fitAltitude - LIMITS.min), 0, 1);
      if (globe) {
        var nextLevel = view.altitude < 1.2;
        pinLevel = nextLevel;
        layoutPins();
      }
      if (options.onChange) options.onChange(zoomInfo(view));
    }
    function refreshPolygons() { globe.polygonsData(features); }
    function setSelected(id) {
      selectedId = id ? String(id).toLowerCase() : null;
      refreshPolygons();
      // Keep the retained pin buttons in sync with country selection.
      element.querySelectorAll('.ae-globe-pin').forEach(function (pin) {
        var hot = sameId(pin.getAttribute('data-country-id'), selectedId);
        pin.setAttribute('data-selected', String(hot));
        if (pin.getAttribute('data-topic') === 'false') {
          pin.querySelector('.ae-globe-pin-visual').textContent = hot ? pin.getAttribute('data-country-id').toUpperCase() : '';
        }
      });
      layoutPins();
    }
    function hasGeometry(id) { return !!featureById[String(id || '').toLowerCase()]; }
    function pinData() {
      return countries.filter(function (country) {
        var id = String(country.id || '').toLowerCase();
        return Number.isFinite(country.lat) && Number.isFinite(country.lng) &&
          (sameId(id, selectedId) || FEATURED_PINS[id] || (pinLevel && !hasGeometry(id)));
      });
    }
    function isSuppressed() { return root.Date.now() < suppressUntil; }
    function layoutPins() {
      if (!pinLayer || destroyed) return;
      var view = actualView(), rad = Math.PI / 180, width = element.clientWidth, height = element.clientHeight;
      var camera = globe.camera();
      if (camera.updateMatrixWorld) camera.updateMatrixWorld();
      // Width/height updates are deferred by Globe.GL. Recheck after rendering
      // when the final camera projection is available, including first paint.
      var key = [view.lat, view.lng, view.altitude, width, height, selectedId, pinLevel,
        camera.projectionMatrix && camera.projectionMatrix.elements.join(',')].join('|');
      if (key === pinLayoutKey) return;
      pinLayoutKey = key;
      var visible = [];
      pinData().forEach(function (country) {
        var dot = Math.sin(country.lat * rad) * Math.sin(view.lat * rad) + Math.cos(country.lat * rad) * Math.cos(view.lat * rad) * Math.cos((country.lng - view.lng) * rad);
        if (dot <= 1 / (1 + view.altitude)) return;
        var point = globe.getScreenCoords(country.lat, country.lng, .018);
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > width || point.y < 0 || point.y > height) return;
        if (!pinEntries[country.id]) {
          var button = pinElement(country), line = root.document.createElementNS('http://www.w3.org/2000/svg', 'path');
          pinLayer.appendChild(button); pinLines.appendChild(line);
          pinEntries[country.id] = { button: button, line: line };
        }
        visible.push({ id: country.id, x: point.x, y: point.y, selected: sameId(country.id, selectedId) });
      });
      var positions = root.placeAllEarthPins(visible, width, height, presentation ? [] : pinObstacles);
      var shown = Object.create(null);
      positions.forEach(function (placed) { shown[placed.id] = true; });
      Object.keys(pinEntries).forEach(function (id) { pinEntries[id].button.hidden = !shown[id]; pinEntries[id].line.setAttribute('visibility', 'hidden'); });
      positions.forEach(function (placed) {
        var entry = pinEntries[placed.id], pin = entry.button;
        pin.hidden = false;
        pin.style.left = (placed.x - 22) + 'px'; pin.style.top = (placed.y - 22) + 'px';
        if (Math.hypot(placed.x - placed.anchorX, placed.y - placed.anchorY) > 6) {
          entry.line.setAttribute('d', 'M' + placed.anchorX + ',' + placed.anchorY + 'L' + placed.x + ',' + placed.y);
          entry.line.setAttribute('visibility', 'visible');
        }
      });
    }
    function pinElement(country) {
      var pin = root.document.createElement('button');
      pin.type = 'button'; pin.className = 'ae-globe-pin';
      var topic = topics[country.id];
      var name = country.name || country.en || country.id;
      pin.title = topic ? name + ' · ' + topic.title : name;
      pin.setAttribute('aria-label', topic ? name + ' · ' + topic.title + ' 보기' : name + ' 선택');
      pin.setAttribute('data-country-id', country.id);
      var hot = sameId(country.id, selectedId);
      pin.setAttribute('data-selected', String(hot));
      pin.setAttribute('data-topic', String(!!topic));
      var visual = root.document.createElement('span');
      visual.className = 'ae-globe-pin-visual';
      if (topic && topic.image) {
        var photo = root.document.createElement('img');
        photo.src = topic.image; photo.alt = ''; photo.draggable = false;
        photo.width = photo.height = 80; photo.decoding = 'async';
        photo.style.objectPosition = topic.imagePosition || '50% 50%';
        photo.addEventListener('error', function () {
          photo.remove(); visual.textContent = country.id.toUpperCase();
        }, { once: true });
        visual.appendChild(photo);
      } else if (hot) visual.textContent = country.id.toUpperCase();
      pin.appendChild(visual);
      pin.addEventListener('click', function (event) { event.stopPropagation(); if (!isSuppressed()) userSelect(country.id, 'marker'); });
      return pin;
    }
    function stopCameraMotion() {
      if (cameraFrame) root.cancelAnimationFrame(cameraFrame);
      if (cameraMotion && cameraMotion.resolve) cameraMotion.resolve(false);
      cameraFrame = 0; cameraMotion = null;
    }
    function writePresentationOffset(offset) {
      if (!presentation) return;
      presentation.offset = offset;
      element.style.transform = 'translate3d(' + offset.x + 'px,' + offset.y + 'px,0)';
    }
    function finishPresentation(open) {
      element.style.willChange = '';
      if (!open) { presentation = null; element.style.transform = ''; }
      controls.enabled = !open;
      pinLayoutKey = '';
      applyControlRange();
      emitChange();
    }
    function writeView(view) {
      globe.pointOfView(view, 0);
      emitChange();
    }
    function animateCamera(now) {
      cameraFrame = 0;
      var motion = cameraMotion;
      if (destroyed || !motion) return;
      var view, done;
      if (motion.kind === 'zoom') {
        // Integrate in log distance so the same input feels similar at every zoom.
        // The analytic spring keeps velocity across repeated inputs and frame rates.
        var dt = Math.max(0, now - motion.lastTime) / 1000;
        motion.lastTime = now;
        var offset = motion.logAltitude - Math.log(motion.target);
        var decay = Math.exp(-ZOOM_RESPONSE * dt);
        var step = (motion.velocity + ZOOM_RESPONSE * offset) * dt;
        motion.logAltitude = Math.log(motion.target) + (offset + step) * decay;
        motion.velocity = (motion.velocity - ZOOM_RESPONSE * step) * decay;
        view = actualView();
        view.altitude = clamp(Math.exp(motion.logAltitude), LIMITS.min, fitAltitude);
        done = Math.abs(view.altitude - motion.target) < .0001 && Math.abs(motion.velocity) < .001;
        if (done) view.altitude = motion.target;
      } else {
        var progress = clamp((now - motion.started) / motion.duration, 0, 1);
        var eased = progress < .5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        view = {
          lat: motion.from.lat + (motion.to.lat - motion.from.lat) * eased,
          lng: normalLng(motion.from.lng + normalLng(motion.to.lng - motion.from.lng) * eased),
          altitude: motion.from.altitude + (motion.to.altitude - motion.from.altitude) * eased
        };
        if (motion.kind === 'issue') writePresentationOffset({
          x: motion.fromOffset.x + (motion.toOffset.x - motion.fromOffset.x) * eased,
          y: motion.fromOffset.y + (motion.toOffset.y - motion.fromOffset.y) * eased
        });
        done = progress === 1;
      }
      writeView(view);
      if (done) {
        cameraMotion = null;
        if (motion.kind === 'issue') finishPresentation(motion.open);
        if (motion.resolve) motion.resolve(true);
      }
      else cameraFrame = root.requestAnimationFrame(animateCamera);
    }
    function moveTo(view, defaultDuration) {
      stopCameraMotion();
      var target = { lat: clamp(Number(view.lat), -89.9, 89.9), lng: normalLng(Number(view.lng)), altitude: clamp(Number(view.altitude), LIMITS.min, fitAltitude) };
      if (reducedMotion || !defaultDuration) { writeView(target); return; }
      cameraMotion = { kind: 'move', from: actualView(), to: target, started: root.performance.now(), duration: defaultDuration };
      cameraFrame = root.requestAnimationFrame(animateCamera);
    }
    function applyControlRange() {
      radius = globe.getGlobeRadius ? globe.getGlobeRadius() : 100;
      controls.minDistance = radius * (1 + LIMITS.min);
      controls.maxDistance = radius * (1 + Math.max(fitAltitude, presentation ? presentation.maxAltitude : 0));
    }
    function updateFit() {
      var width = Math.max(1, element.clientWidth || element.offsetWidth || 1);
      var height = Math.max(1, element.clientHeight || element.offsetHeight || 1);
      // Opening a sheet must not resize the WebGL surface or cancel its motion.
      if (width === fitWidth && height === fitHeight) return;
      fitWidth = width; fitHeight = height;
      stopCameraMotion();
      pinLayoutKey = '';
      var previousView = actualView();
      var wasZoomedOut = Math.abs(previousView.altitude - fitAltitude) < .002;
      if (options.pinObstacles && element.getBoundingClientRect) {
        var stageBounds = element.getBoundingClientRect();
        var visualOffset = presentation ? presentation.offset : { x: 0, y: 0 };
        pinObstacles = options.pinObstacles.map(function (node) {
          var rect = node.getBoundingClientRect();
          return { left: rect.left - stageBounds.left + visualOffset.x, right: rect.right - stageBounds.left + visualOffset.x,
            top: rect.top - stageBounds.top + visualOffset.y, bottom: rect.bottom - stageBounds.top + visualOffset.y };
        });
      }
      globe.width(width).height(height);
      var camera = globe.camera && globe.camera();
      var verticalFov = camera && camera.fov ? camera.fov * Math.PI / 180 : 50 * Math.PI / 180;
      // Match the reference's 480px ocean at 390px wide, keeping vertical room
      // for the header and bottom controls on shorter screens. Use camera distance
      // rather than CSS scaling so canvas picking and HTML pins stay aligned.
      var homeDiameter = Math.max(1, Math.min(width * 480 / 390, height - 8));
      var homeDistance = height / (homeDiameter * Math.tan(verticalFov / 2));
      homeAltitude = clamp(Math.sqrt(1 + homeDistance * homeDistance) - 1, LIMITS.min, LIMITS.max);
      // The reference-sized home globe is also the farthest allowed camera view.
      // Buttons, wheel, keyboard, native pinch and world() share this limit.
      fitAltitude = homeAltitude;
      if (presentation) {
        presentation.home.altitude = Math.min(presentation.home.altitude, fitAltitude);
        setIssueView(presentation.open, { animate: false });
        return;
      }
      applyControlRange();
      if (wasZoomedOut || previousView.altitude > fitAltitude) moveTo({ lat: previousView.lat, lng: previousView.lng, altitude: fitAltitude }, 0);
    }
    function setIssueView(open, settings) {
      settings = settings || {};
      if (destroyed || (!open && !presentation)) return Promise.resolve(true);
      var view = actualView();
      var pendingDestination = cameraMotion && cameraMotion.kind === 'move' ? cameraMotion.to : null;
      if (!presentation) presentation = { home: Object.assign({}, view), offset: { x: 0, y: 0 } };
      stopCameraMotion();
      presentation.open = open;
      var width = element.clientWidth, height = element.clientHeight;
      var screenHeight = element.parentElement ? element.parentElement.clientHeight : height + 356;
      var issueHeight = Math.max(width, screenHeight - 454);
      var diameter = Math.max(1, Math.min(width * 480 / 390, issueHeight - 8));
      var fov = (globe.camera().fov || 50) * Math.PI / 180;
      var distance = height / (diameter * Math.tan(fov / 2));
      var target = open ? {
        lat: pendingDestination ? pendingDestination.lat : view.lat,
        lng: pendingDestination ? pendingDestination.lng : view.lng,
        altitude: Math.sqrt(1 + distance * distance) - 1
      } : Object.assign({}, presentation.home);
      var offset = open ? { x: 20, y: -40 + issueHeight / 2 - (element.offsetTop + height / 2) } : { x: 0, y: 0 };
      // Only the modal presentation may exceed the home zoom limit. Restore the
      // exact pre-sheet view and control range when the reverse motion completes.
      presentation.maxAltitude = Math.max(view.altitude, target.altitude, fitAltitude);
      controls.enabled = false; applyControlRange();
      if (reducedMotion || settings.animate === false) {
        writePresentationOffset(offset); writeView(target); finishPresentation(open);
        return Promise.resolve(true);
      }
      element.style.willChange = 'transform';
      return new Promise(function (resolve) {
        cameraMotion = { kind: 'issue', open: open, from: view, to: target,
          fromOffset: presentation.offset, toOffset: offset,
          started: root.performance.now(), duration: open ? 460 : 380, resolve: resolve };
        cameraFrame = root.requestAnimationFrame(animateCamera);
      });
    }
    function coordinateBounds(geometry) {
      var lons = [], minLat = Infinity, maxLat = -Infinity;
      function visit(value) {
        if (!Array.isArray(value)) return;
        if (typeof value[0] === 'number' && typeof value[1] === 'number') { lons.push(normalLng(value[0])); minLat = Math.min(minLat, value[1]); maxLat = Math.max(maxLat, value[1]); return; }
        value.forEach(visit);
      }
      visit(geometry && geometry.coordinates);
      if (!lons.length) return null;
      var circular = lons.map(function (lon) { return lon < 0 ? lon + 360 : lon; }).sort(function (a, b) { return a - b; });
      var biggestGap = 0;
      for (var i = 0; i < circular.length; i += 1) biggestGap = Math.max(biggestGap, (i === circular.length - 1 ? circular[0] + 360 : circular[i + 1]) - circular[i]);
      return { lonSpan: 360 - biggestGap, latSpan: maxLat - minLat };
    }
    function countryAltitude(country) {
      var feature = featureById[String(country.id || '').toLowerCase()];
      var bounds = coordinateBounds(feature && feature.geometry);
      if (!bounds) return Math.min(fitAltitude, .42);
      return clamp(.15 + Math.max(bounds.lonSpan, bounds.latSpan) / 47, LIMITS.min, Math.min(fitAltitude, 2.9));
    }
    function select(id, selectOptions) {
      selectOptions = selectOptions || {};
      var country = getCountry(id);
      if (!country) return false;
      setSelected(country.id);
      if (Number.isFinite(country.lat) && Number.isFinite(country.lng)) moveTo({ lat: country.lat, lng: country.lng, altitude: countryAltitude(country) }, selectOptions.animate === false ? 0 : 560);
      else emitChange();
      return true;
    }
    function userSelect(id, source) { if (select(id, { animate: true }) && options.onSelect) options.onSelect(String(id).toLowerCase(), source); }
    function reset() { setSelected('kr'); moveTo({ lat: EAST_ASIA.lat, lng: EAST_ASIA.lng, altitude: homeAltitude }, 560); }
    function world() { var view = actualView(); moveTo({ lat: view.lat, lng: view.lng, altitude: fitAltitude }, 420); }
    function zoom(delta) {
      delta = Number(delta) || 0;
      if (!delta || destroyed) return;
      var view = actualView();
      var pending = cameraMotion && cameraMotion.kind === 'zoom' ? cameraMotion : null;
      var base = pending && Math.sign(delta) === pending.direction ? pending.target : view.altitude;
      var target = clamp(base * Math.pow(.83, delta), LIMITS.min, fitAltitude);
      if (reducedMotion) { stopCameraMotion(); view.altitude = target; writeView(view); return; }
      if (pending) { pending.target = target; pending.direction = Math.sign(delta); return; }
      stopCameraMotion();
      cameraMotion = { kind: 'zoom', target: target, direction: Math.sign(delta), logAltitude: Math.log(view.altitude), velocity: 0, lastTime: root.performance.now() };
      cameraFrame = root.requestAnimationFrame(animateCamera);
    }
    function applyMotionPreference() {
      reducedMotion = !!(reducedMotionQuery && reducedMotionQuery.matches);
      controls.enableDamping = !reducedMotion; controls.dampingFactor = reducedMotion ? 0 : .18;
      if (reducedMotion && cameraMotion) {
        var previousMotion = cameraMotion;
        var target = cameraMotion.kind === 'zoom' ? Object.assign(actualView(), { altitude: cameraMotion.target }) : cameraMotion.to;
        stopCameraMotion();
        if (previousMotion.kind === 'issue') writePresentationOffset(previousMotion.toOffset);
        writeView(target);
        if (previousMotion.kind === 'issue') finishPresentation(previousMotion.open);
      }
    }
    function onWheel(event) {
      if (!Number.isFinite(event.deltaY) || !event.deltaY) return;
      event.preventDefault(); event.stopPropagation();
      if (Object.keys(pointerMap).length) return;
      var pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1);
      zoom(-clamp(pixels, -250, 250) / 250);
    }

    try {
      globe = root.Globe({ animateIn: !reducedMotion, rendererConfig: { antialias: true, alpha: true } })(element)
        .backgroundColor('rgba(0,0,0,0)').globeImageUrl(null).showAtmosphere(false).globeCurvatureResolution(1.5)
        .polygonsData(features).polygonGeoJsonGeometry(function (feature) { return feature.geometry; })
        // Fine, equally elevated country surfaces keep shared borders aligned.
        // Selection changes color only, without lifting the coastline or its stroke.
        .polygonCapCurvatureResolution(1.5).polygonsTransitionDuration(0).polygonAltitude(.002)
        .polygonCapColor(function (feature) { return isSelected(feature) ? palette.selected : palette.land; }).polygonSideColor(palette.land)
        .polygonStrokeColor(function (feature) { return isSelected(feature) ? '#8BA76B' : 'rgba(91,123,98,.32)'; })
        .polygonLabel(function (feature) { var country = getCountry(featureId(feature)); return country ? country.name : ''; })
        .onPolygonClick(function (feature) { if (!isSuppressed()) userSelect(featureId(feature), 'globe'); })
        .htmlElementsData([]);
    } catch (error) { if (options.onError) options.onError(error); throw error; }

    pinLayer = root.document.createElement('div'); pinLayer.className = 'ae-pin-layer';
    pinLines = root.document.createElementNS('http://www.w3.org/2000/svg', 'svg'); pinLines.setAttribute('aria-hidden', 'true');
    pinLayer.appendChild(pinLines); element.appendChild(pinLayer);
    var scene = globe.scene(), originalAfterRender = scene.onAfterRender;
    function afterRender() {
      if (originalAfterRender) originalAfterRender.apply(this, arguments);
      layoutPins();
    }
    scene.onAfterRender = afterRender;

    // Supersample 1x displays too; keep the existing 2x ceiling for GPU cost.
    // The composer owns its own buffers and must match the renderer's density.
    globe.renderer().setPixelRatio(2);
    globe.postProcessingComposer().setPixelRatio(2);

    var material = globe.globeMaterial && globe.globeMaterial();
    if (material && material.color) {
      material.color.set(palette.ocean); material.shininess = 5;
      if (material.specular) material.specular.set(palette.ocean);
      // Keep the lower hemisphere within the flat paper palette while retaining a subtle 3D cue.
      if (material.emissive) { material.emissive.set('#6B7D84'); material.emissiveIntensity = .19; }
    }
    controls = globe.controls();
    controls.enablePan = false; controls.autoRotate = false; controls.enableRotate = true; controls.zoomSpeed = .65;
    controls.minPolarAngle = .01; controls.maxPolarAngle = Math.PI - .01;
    updateFit(); applyMotionPreference(); controls.addEventListener('change', emitChange);

    function onPointerDown(event) { stopCameraMotion(); pointerMap[event.pointerId] = { x: event.clientX, y: event.clientY }; if (Object.keys(pointerMap).length > 1) { gestureMoved = true; suppressUntil = root.Date.now() + 400; } }
    function onPointerMove(event) { var start = pointerMap[event.pointerId]; if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > MOVE_THRESHOLD) gestureMoved = true; }
    function onPointerEnd(event) { var wasMulti = Object.keys(pointerMap).length > 1; delete pointerMap[event.pointerId]; if (gestureMoved || wasMulti) suppressUntil = root.Date.now() + 400; if (!Object.keys(pointerMap).length) gestureMoved = false; }
    function onKeyDown(event) {
      var view = actualView();
      if (event.key === 'ArrowLeft') moveTo({ lat: view.lat, lng: view.lng - 9, altitude: view.altitude }, 150);
      else if (event.key === 'ArrowRight') moveTo({ lat: view.lat, lng: view.lng + 9, altitude: view.altitude }, 150);
      else if (event.key === 'ArrowUp') moveTo({ lat: view.lat + 7, lng: view.lng, altitude: view.altitude }, 150);
      else if (event.key === 'ArrowDown') moveTo({ lat: view.lat - 7, lng: view.lng, altitude: view.altitude }, 150);
      else if (event.key === '+' || event.key === '=') zoom(1); else if (event.key === '-') zoom(-1); else if (event.key === 'Home') reset(); else return;
      event.preventDefault();
    }
    element.addEventListener('pointerdown', onPointerDown, true); element.addEventListener('pointermove', onPointerMove, true);
    element.addEventListener('pointerup', onPointerEnd, true); element.addEventListener('pointercancel', onPointerEnd, true); element.addEventListener('keydown', onKeyDown);
    element.addEventListener('wheel', onWheel, { capture: true, passive: false });
    if (reducedMotionQuery) { if (reducedMotionQuery.addEventListener) reducedMotionQuery.addEventListener('change', applyMotionPreference); else reducedMotionQuery.addListener(applyMotionPreference); }
    if (root.ResizeObserver) { resizeObserver = new root.ResizeObserver(function () { if (!destroyed) { updateFit(); emitChange(); } }); resizeObserver.observe(element); }
    setSelected('kr');
    moveTo({ lat: EAST_ASIA.lat, lng: EAST_ASIA.lng, altitude: homeAltitude }, 0);
    if (options.onReady) options.onReady();

    return {
      select: select, zoom: zoom, reset: reset, world: world, setIssueView: setIssueView,
      getState: function () { var state = zoomInfo(actualView()); state.selectedId = selectedId; return state; },
      destroy: function () {
        if (destroyed) return;
        destroyed = true; stopCameraMotion(); if (resizeObserver) resizeObserver.disconnect(); controls.removeEventListener('change', emitChange);
        if (scene.onAfterRender === afterRender) scene.onAfterRender = originalAfterRender;
        element.removeEventListener('pointerdown', onPointerDown, true); element.removeEventListener('pointermove', onPointerMove, true);
        element.removeEventListener('pointerup', onPointerEnd, true); element.removeEventListener('pointercancel', onPointerEnd, true); element.removeEventListener('keydown', onKeyDown);
        element.removeEventListener('wheel', onWheel, true);
        if (reducedMotionQuery) { if (reducedMotionQuery.removeEventListener) reducedMotionQuery.removeEventListener('change', applyMotionPreference); else reducedMotionQuery.removeListener(applyMotionPreference); }
        if (globe._destructor) globe._destructor(); element.replaceChildren();
      }
    };
  }
  root.createAllEarthGlobe = createAllEarthGlobe;
})(window);
