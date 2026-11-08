const assert = require('node:assert/strict');
const place = require('../pin-layout.js');
let seed = 83021;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
function verify(pins, w, h, obstacles = []) {
  const result = place(pins, w, h, obstacles);
  assert.equal(result.length, pins.length, 'keep every issue in supported viewports');
  assert.deepEqual(result, place(pins, w, h, obstacles), 'stable positions for identical camera state');
  for (let i = 0; i < result.length; i++) {
    const p = result[i];
    assert.ok(p.x >= 26 && p.x <= w - 26 && p.y >= 26 && p.y <= h - 26, 'entire hit target fits');
    for (const q of result.slice(0, i)) assert.ok(Math.hypot(p.x - q.x, p.y - q.y) >= 49.999, '44px targets have at least 6px separation');
    for (const b of obstacles) assert.ok(!(p.x > b.left - 26 && p.x < b.right + 26 && p.y > b.top - 26 && p.y < b.bottom + 26), 'controls remain unobstructed');
  }
  return result;
}
for (const [w, h] of [[320,242],[390,488],[430,576]]) {
  const controls = [{left:w-68,right:w-16,top:h-172,bottom:h-20}];
  for (let sample = 0; sample < 150; sample++) {
    verify(Array.from({length:9}, (_,i)=>({id:`c${i}`,x:random()*w,y:random()*h,selected:i===2})), w, h, controls);
  }
  verify(Array.from({length:9}, (_,i)=>({id:`c${i}`,x:4,y:4,selected:i===2})), w, h, controls);
}
const stable = verify([{id:'a',x:80,y:80,selected:true},{id:'b',x:200,y:140}],390,488);
assert.deepEqual(stable.map(p=>[p.x,p.y]),[[80,80],[200,140]], 'uncrowded pins stay at their country');
console.log('PASS: 453 dense/random layouts, no overlap, target bounds, controls, deterministic placement and unchanged isolated anchors');
