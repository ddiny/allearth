/* Screen-space pin placement: keep 44px targets separated and inside the map. */
(function (root) {
  'use strict';
  function placePins(pins, width, height, obstacles) {
    var margin = 26, distance = 50, placed = [];
    var bounds = { left: margin, right: Math.max(margin, width - margin), top: margin, bottom: Math.max(margin, height - margin) };
    var boxes = (obstacles || []).map(function (box) {
      return { left: box.left - margin, right: box.right + margin, top: box.top - margin, bottom: box.bottom + margin };
    });
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function free(p) {
      return p.x >= bounds.left && p.x <= bounds.right && p.y >= bounds.top && p.y <= bounds.bottom &&
        !boxes.some(function (b) { return p.x > b.left && p.x < b.right && p.y > b.top && p.y < b.bottom; }) &&
        placed.every(function (q) { return Math.hypot(p.x - q.x, p.y - q.y) >= distance - .001; });
    }
    pins.slice().sort(function (a, b) { return Number(!!b.selected) - Number(!!a.selected) || a.id.localeCompare(b.id); }).forEach(function (pin) {
      var anchor = { x: clamp(pin.x, bounds.left, bounds.right), y: clamp(pin.y, bounds.top, bounds.bottom) };
      var candidates = [anchor];
      var edges = [bounds].concat(boxes);
      edges.forEach(function (b) {
        [b.left, b.right].forEach(function (x) { candidates.push({ x: x, y: anchor.y }, { x: x, y: b.top }, { x: x, y: b.bottom }); });
        [b.top, b.bottom].forEach(function (y) { candidates.push({ x: anchor.x, y: y }); });
      });
      placed.forEach(function (q, index) {
        var angle = Math.atan2(anchor.y - q.y, anchor.x - q.x);
        candidates.push({ x: q.x + Math.cos(angle) * distance, y: q.y + Math.sin(angle) * distance });
        placed.slice(0, index).forEach(function (r) {
          var dx = r.x - q.x, dy = r.y - q.y, d = Math.hypot(dx, dy);
          if (!d || d > distance * 2) return;
          var h = Math.sqrt(distance * distance - d * d / 4), mx = (q.x + r.x) / 2, my = (q.y + r.y) / 2;
          [-1, 1].forEach(function (sign) { candidates.push({ x: mx - sign * h * dy / d, y: my + sign * h * dx / d }); });
        });
        edges.forEach(function (b) {
          [b.left, b.right].forEach(function (x) {
            var square = distance * distance - (x - q.x) * (x - q.x);
            if (square >= 0) [-1, 1].forEach(function (sign) { candidates.push({ x: x, y: q.y + sign * Math.sqrt(square) }); });
          });
          [b.top, b.bottom].forEach(function (y) {
            var square = distance * distance - (y - q.y) * (y - q.y);
            if (square >= 0) [-1, 1].forEach(function (sign) { candidates.push({ x: q.x + sign * Math.sqrt(square), y: y }); });
          });
        });
      });
      var available = candidates.filter(free);
      if (!available.length) {
        for (var y = bounds.top; y <= bounds.bottom; y += 8) {
          for (var x = bounds.left; x <= bounds.right; x += 8) if (free({ x: x, y: y })) available.push({ x: x, y: y });
        }
      }
      available.sort(function (a, b) { return Math.hypot(a.x - pin.x, a.y - pin.y) - Math.hypot(b.x - pin.x, b.y - pin.y); });
      if (available.length) placed.push({ id: pin.id, x: available[0].x, y: available[0].y, anchorX: pin.x, anchorY: pin.y });
    });
    return placed;
  }
  if (typeof module === 'object' && module.exports) module.exports = placePins;
  else root.placeAllEarthPins = placePins;
})(typeof window === 'object' ? window : this);
