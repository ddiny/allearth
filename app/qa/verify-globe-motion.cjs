const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('allearth-app-prototype/globe.js', 'utf8');
function fixture(reduced = false) {
  let time = 0, sequence = 0, frames = new Map(), resize;
  let view = { lat: 25, lng: 128, altitude: 2.5 };
  const events = new Map(), query = { matches: reduced, addEventListener(_, fn) { this.change = fn; }, removeEventListener() {} };
  const element = { clientWidth: 390, clientHeight: 488, offsetTop: 208, parentElement: { clientHeight: 844 }, style: {}, tabIndex: 0,
    querySelectorAll() { return []; },
    appendChild() {},
    setAttribute() {}, addEventListener(type, fn) { events.set(type, fn); }, removeEventListener(type) { events.delete(type); }, replaceChildren() {} };
  const controls = { addEventListener() {}, removeEventListener() {} };
  const scene = { onAfterRender() {} };
  let globe, surfaceUpdates = 0;
  globe = new Proxy({}, { get(_, key) {
    if (key === 'pointOfView') return (next, duration) => {
      if (!next) return { ...view };
      assert.equal(duration, 0, 'no overlapping vendor tweens');
      view = { ...next }; return globe;
    };
    if (key === 'controls') return () => controls;
    if (key === 'width' || key === 'height') return () => { surfaceUpdates++; return globe; };
    if (key === 'scene') return () => scene;
    if (key === 'camera') return () => ({ fov: 50 });
    if (key === 'getGlobeRadius') return () => 100;
    if (key === 'globeMaterial') return () => null;
    if (key === 'renderer' || key === 'postProcessingComposer') return () => ({ setPixelRatio() {} });
    return () => globe;
  }});
  const fakeNode = () => ({ appendChild() {}, setAttribute() {}, style: {} });
  const window = { Globe: () => () => globe, Date, performance: { now: () => time },
    document: { createElement: fakeNode, createElementNS: fakeNode },
    placeAllEarthPins: require('../pin-layout.js'),
    getComputedStyle: () => ({ getPropertyValue: () => '' }), matchMedia: () => query,
    requestAnimationFrame(fn) { const id = ++sequence; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    ResizeObserver: class { constructor(fn) { resize = fn; } observe() {} disconnect() {} }
  };
  vm.runInNewContext(source, { window });
  const api = window.createAllEarthGlobe({ element, countries: [{ id: 'kr', lat: 36.5, lng: 127.8 }] });
  function advance(ms, hz = 60) {
    const until = time + ms;
    while (time < until) {
      time = Math.min(until, time + 1000 / hz);
      assert.ok(frames.size <= 1, 'one camera animation at a time');
      const batch = [...frames.values()]; frames.clear(); batch.forEach(fn => fn(time));
      const state = api.getState();
      assert.ok(state.altitude >= .12 && state.altitude <= (controls.maxDistance / 100 - 1) + 1e-9);
    }
  }
  return { api, element, events, query, controls, advance, resize: () => resize(), pending: () => frames.size, surfaceUpdates: () => surfaceUpdates };
}
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
// Maximum zoom-out must match the supplied home reference, through every input.
const cap = fixture();
for (const [width, height, diameter] of [[390, 488, 480], [320, 242, 234], [430, 576, 430 * 480 / 390]]) {
  cap.element.clientWidth = width; cap.element.clientHeight = height; cap.resize();
  const maximum = cap.api.getState().altitude;
  const projectedDiameter = height / (Math.tan(25 * Math.PI / 180) * Math.sqrt((maximum + 1) ** 2 - 1));
  close(projectedDiameter, diameter);
  close(cap.controls.maxDistance, 100 * (1 + maximum)); // Native OrbitControls pinch limit.
  assert.equal(cap.api.getState().canZoomOut, false);
  cap.api.zoom(-100); cap.advance(1000); close(cap.api.getState().altitude, maximum);
  cap.events.get('wheel')({ deltaY: 250, deltaMode: 0, preventDefault() {}, stopPropagation() {} });
  cap.advance(1000); close(cap.api.getState().altitude, maximum);
  cap.events.get('keydown')({ key: '-', preventDefault() {} });
  cap.advance(1000); close(cap.api.getState().altitude, maximum);
  cap.api.select('kr'); cap.advance(1000);
  const direction = cap.api.getState(); cap.api.world(); cap.advance(1000);
  close(cap.api.getState().altitude, maximum); close(cap.api.getState().lat, direction.lat); close(cap.api.getState().lng, direction.lng);
}
cap.element.clientWidth = 390; cap.element.clientHeight = 488; cap.resize();
assert.equal(cap.api.getState().canZoomOut, false, 'resizing down clamps to the reference limit');
cap.api.destroy();
const speed = fixture(); const speedStart = speed.api.getState().altitude;
speed.api.zoom(1); speed.advance(250);
assert.ok((speed.api.getState().altitude - speedStart * .83) / (speedStart * .17) < .05, 'zoom completes at least 95% of the step within 250ms');
const a = fixture(); const initial = a.api.getState().altitude;
a.api.zoom(1); close(a.api.getState().altitude, initial);
a.advance(100); const middle = a.api.getState().altitude;
assert.ok(middle < initial && middle > initial * .83, 'intermediate zoom frames');
a.advance(1000); close(a.api.getState().altitude, initial * .83); assert.equal(a.pending(), 0);
a.api.zoom(-1); a.advance(1000); close(a.api.getState().altitude, initial);
const b = fixture(); const c = fixture(); b.api.zoom(1); c.api.zoom(1);
b.advance(200, 60); c.advance(200, 120); close(b.api.getState().altitude, c.api.getState().altitude);
for (let i = 0; i < 12; i++) { a.api.zoom(1); a.advance(20); }
a.advance(1000); close(a.api.getState().altitude, initial * .83 ** 12);
a.api.zoom(100); a.advance(1000); close(a.api.getState().altitude, .12); assert.equal(a.api.getState().canZoomIn, false);
a.api.zoom(-100); a.advance(1000); assert.equal(a.api.getState().canZoomOut, false);
a.api.zoom(1); a.advance(70); a.api.zoom(-1); a.advance(1000); assert.equal(a.pending(), 0);
a.api.reset(); a.advance(80); a.api.world(); a.advance(1000); assert.equal(a.api.getState().canZoomOut, false);
a.advance(1000); assert.equal(a.api.getState().canZoomOut, false, 'old reset cannot resume');
a.api.zoom(1); a.advance(100); a.events.get('pointerdown')({ pointerId: 1, clientX: 0, clientY: 0 });
const interrupted = a.api.getState().altitude; a.advance(1000); close(a.api.getState().altitude, interrupted);
a.events.get('pointerup')({ pointerId: 1 });
let prevented = false, stopped = false;
a.events.get('wheel')({ deltaY: -100, deltaMode: 0, preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
a.advance(1000); assert.ok(prevented && stopped); assert.ok(a.api.getState().altitude < interrupted);
a.api.zoom(1); a.advance(50); a.element.clientWidth = 320; a.element.clientHeight = 242; a.resize(); a.advance(1000); assert.equal(a.pending(), 0);
const reduced = fixture(true); const start = reduced.api.getState().altitude;
reduced.api.zoom(1); close(reduced.api.getState().altitude, start * .83); assert.equal(reduced.pending(), 0);
a.api.zoom(1); a.advance(50); a.query.matches = true; a.query.change(); assert.equal(a.pending(), 0);
a.query.matches = false; a.query.change(); a.api.zoom(1); a.api.destroy(); assert.equal(a.pending(), 0); assert.equal(a.events.has('wheel'), false);
// A sheet is a camera/translation transition, never a WebGL resize. It must
// restore the exact pre-sheet zoom/direction, even if closed during opening.
for (const [width, height, screenHeight, top] of [[390,488,844,208],[320,242,568,198],[430,576,932,208]]) {
  const s = fixture(); Object.assign(s.element, { clientWidth: width, clientHeight: height, offsetTop: top });
  s.element.parentElement.clientHeight = screenHeight; s.resize();
  s.api.zoom(1); s.advance(1000);
  const before = s.api.getState(), updates = s.surfaceUpdates();
  s.api.select('kr'); // Country targeting and sheet motion start in the same turn.
  s.api.setIssueView(true); close(s.api.getState().altitude, before.altitude);
  s.advance(100); assert.notEqual(s.element.style.transform, 'translate3d(20px,-297px,0)');
  const during = s.api.getState(); assert.notEqual(during.altitude, before.altitude);
  s.resize(); // Redundant observer delivery must not interrupt an active motion.
  assert.equal(s.pending(), 1);
  s.advance(600); close(s.api.getState().lat, 36.5);
  assert.equal(s.surfaceUpdates(), updates, 'no backing-buffer reallocation while opening');
  const issueHeight = Math.max(width, screenHeight - 454);
  const expectedDiameter = Math.min(width * 480 / 390, issueHeight - 8);
  close(height / (Math.tan(25 * Math.PI / 180) * Math.sqrt((s.api.getState().altitude + 1) ** 2 - 1)), expectedDiameter);
  assert.equal(s.controls.enabled, false);
  s.api.setIssueView(false); s.advance(500);
  for (const key of ['lat','lng','altitude']) close(s.api.getState()[key], before[key]);
  assert.equal(s.element.style.transform, ''); assert.equal(s.controls.enabled, true);
  assert.equal(s.surfaceUpdates(), updates, 'no backing-buffer reallocation while closing');
  s.api.setIssueView(true); s.advance(80); const reversal = s.api.getState();
  s.api.setIssueView(false); close(s.api.getState().altitude, reversal.altitude);
  s.advance(60); s.api.setIssueView(true); s.advance(600); s.api.setIssueView(false); s.advance(500);
  for (const key of ['lat','lng','altitude']) close(s.api.getState()[key], before[key]);
  assert.equal(s.pending(), 0); s.api.destroy();
}
const quiet = fixture(true), quietView = quiet.api.getState();
quiet.api.setIssueView(true); assert.equal(quiet.pending(), 0);
quiet.api.setIssueView(false); close(quiet.api.getState().altitude, quietView.altitude);
const pref = fixture(); pref.api.setIssueView(true); pref.advance(80);
pref.query.matches = true; pref.query.change(); assert.equal(pref.pending(), 0);
pref.api.setIssueView(false); assert.equal(pref.element.style.transform, '');
const resizedSheet = fixture(); resizedSheet.api.setIssueView(true); resizedSheet.advance(80);
resizedSheet.element.clientHeight = 400; resizedSheet.resize(); assert.equal(resizedSheet.pending(), 0);
resizedSheet.api.setIssueView(false); resizedSheet.advance(500); assert.equal(resizedSheet.element.style.transform, '');
console.log('PASS: reference zoom cap, native controls, smooth zoom, issue open/close at 3 sizes without resize, exact view restoration, interruption/reversal, reduced motion and resize');
