// Drives the running DragonFruit webview over CDP and profiles a gesture.
//
//   npm run profile:df -- eval "<js expression>"
//   npm run profile:df -- hover <xPct> <yPct> <moves> [label]
//   npm run profile:df -- sweep <xPct> <yPct> <moves> '<[[x,y],…]>' [label]
//   npm run profile:df -- click <xPct> <yPct> [label]
//   npm run profile:df -- key <key> <ctrl|shift|alt|none> <times> [label]
//   npm run profile:df -- scan <cols> <rows> [js probe]
//   npm run profile:df -- shot <file.png> [xPct] [yPct]
//
// Start the app with the port open first:
//
//   WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222 \
//     src-tauri/target/debug/dragonfruit-desktop.exe [scene.voxl]
//
// Input goes through CDP, so it is trusted and the app's own handlers run; a CPU
// profile covers everything the gesture triggers, including the React commits and
// R3F renders that follow it, not just the handler. Set `CDP_FILTER` to a regex
// to show only matching frames. See docs/dev/performance-debugging.md.

const [, , mode, ...rest] = process.argv;

const targets = await (await fetch('http://127.0.0.1:9222/json')).json();
const page = targets.find((t) => t.type === 'page' && t.url.includes('localhost:3005') && !t.url.includes('splashscreen'));
if (!page) {
  console.error('no page target');
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
});

function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? JSON.stringify(result.exceptionDetails));
  }
  return result.result.value;
}

const frame = () => evaluate('new Promise((r) => requestAnimationFrame(() => r(1)))');

await send('Runtime.enable');
await send('Profiler.enable');
await send('Page.enable');

if (mode === 'eval') {
  console.log(JSON.stringify(await evaluate(rest.join(' ')), null, 1));
  ws.close();
  process.exit(0);
}

const rect = await evaluate(`(() => { const r = document.querySelector('canvas').getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height }; })()`);

if (mode === 'scan') {
  const cols = Number(rest[0] ?? 6);
  const rows = Number(rest[1] ?? 5);
  const probe = rest[2] ?? 'String(window.__dragonfruitLastImmediateModelHoverId)';
  const hits = [];
  for (let r = 0; r < rows; r += 1) {
    const row = [];
    for (let c = 0; c < cols; c += 1) {
      const px = rect.left + rect.width * ((c + 0.5) / cols);
      const py = rect.top + rect.height * ((r + 0.5) / rows);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: px, y: py, buttons: 0, pointerType: 'mouse' });
      await frame();
      row.push(await evaluate(probe));
    }
    hits.push(row);
    console.log(`row ${r}: ${row.join('  ')}`);
  }
  console.log('rect', JSON.stringify(rect));
  ws.close();
  process.exit(0);
}

if (mode === 'shot') {
  const file = rest[0];
  if (rest[1] !== undefined) {
    const px = rect.left + rect.width * Number(rest[1]);
    const py = rect.top + rect.height * Number(rest[2]);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: px, y: py, buttons: 0, pointerType: 'mouse' });
    await frame();
    await frame();
  }
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  const { writeFileSync } = await import('node:fs');
  writeFileSync(file, Buffer.from(data, 'base64'));
  console.log('wrote', file);
  ws.close();
  process.exit(0);
}

const keyMods = { ctrl: 2, shift: 8, alt: 1 };
const xPct = Number(rest[0]);
const yPct = Number(rest[1]);
const moves = Number(rest[2] ?? 1);
const label = (mode === 'sweep' ? rest[4] : rest[3]) ?? `${mode} ${rest[0]},${rest[1]}`;
const x = rect.left + rect.width * xPct;
const y = rect.top + rect.height * yPct;

await send('Profiler.start');
const t0 = Date.now();
if (mode === 'hover') {
  for (let i = 0; i < moves; i += 1) {
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: x + (i % 3),
      y: y + (i % 2),
      button: 'none',
      buttons: 0,
      pointerType: 'mouse',
    });
    await frame();
  }
} else if (mode === 'sweep') {
  const pts = JSON.parse(rest[3]);
  for (let i = 0; i < moves; i += 1) {
    const [sx, sy] = pts[i % pts.length];
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: rect.left + rect.width * sx,
      y: rect.top + rect.height * sy,
      buttons: 0,
      pointerType: 'mouse',
    });
    await frame();
  }
} else if (mode === 'key') {
  const key = rest[0];
  const mods = keyMods[rest[1]] ?? 0;
  for (let i = 0; i < moves; i += 1) {
    for (const type of ['keyDown', 'keyUp']) {
      await send('Input.dispatchKeyEvent', {
        type,
        key,
        code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
        windowsVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0,
        modifiers: mods,
      });
    }
    await frame();
  }
} else if (mode === 'click') {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0, pointerType: 'mouse' });
  await frame();
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1, pointerType: 'mouse' });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1, pointerType: 'mouse' });
  await frame();
}
await frame();
const wall = Date.now() - t0;
const { profile } = await send('Profiler.stop');

const self = new Map();
for (const node of profile.nodes) {
  const f = node.callFrame;
  const name = `${f.functionName || '(anonymous)'} @ ${f.url.split('/').slice(-1)[0]}:${f.lineNumber + 1}`;
  self.set(name, (self.get(name) ?? 0) + (node.hitCount ?? 0));
}
const total = [...self.values()].reduce((a, b) => a + b, 0) || 1;
const durationMs = (profile.endTime - profile.startTime) / 1000;
console.log(`${label}: ${moves} ${mode}(s), ${wall} ms wall, ${durationMs.toFixed(1)} ms profiled, ${total} samples`);
const filter = process.env.CDP_FILTER ? new RegExp(process.env.CDP_FILTER, 'i') : null;
const ranked = [...self.entries()].sort((a, b) => b[1] - a[1]);
const shown = filter ? ranked.filter(([n]) => filter.test(n)) : ranked;
for (const [name, hits] of shown.slice(0, filter ? 14 : 18)) {
  console.log(`  ${((hits / total) * 100).toFixed(1).padStart(5)}%  ${hits.toString().padStart(5)}  ${name}`);
}
ws.close();
