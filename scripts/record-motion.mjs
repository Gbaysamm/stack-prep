// Record an animation from /dev/motion as an MP4, for reviewing it (founder, 18 Nov 2026).
//
//   FFMPEG=<path to ffmpeg> node scripts/record-motion.mjs <name> [laptop|phone] [seconds]
//
// Opens /dev/motion in a headless Edge, waits until the page has loaded and settled (fonts,
// images, nothing still moving), then starts recording, plays the named animation and records
// for the given seconds (default 4). Every painted frame is kept with its time, so the video
// plays at the real speed. Writes recordings/<name>-<laptop|phone>.mp4 (git ignores the folder).
// BASE picks the server (default http://localhost:5173).
import { spawnSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [name = 'celebrate', mode = 'laptop', seconds = '4'] = process.argv.slice(2);
const BASE = process.env.BASE ?? 'http://localhost:5173';
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
const EDGE = process.env.EDGE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'recordings');
mkdirSync(outDir, { recursive: true });
const [w, h] = mode === 'phone' ? [390, 844] : [1280, 800];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9300 + Math.floor(Math.random() * 600);
const profile = mkdtempSync(join(tmpdir(), 'edge-rec-'));
const browser = spawn(EDGE, [
  '--headless=new',
  '--mute-audio',
  '--no-first-run',
  '--hide-scrollbars',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  'about:blank',
]);

let target;
for (let i = 0; i < 80 && !target; i++) {
  await sleep(250);
  try {
    target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page');
  } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
const frames = [];
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  } else if (message.method === 'Page.screencastFrame') {
    const { data, metadata, sessionId } = message.params;
    frames.push({ data, time: metadata.timestamp });
    ws.send(JSON.stringify({ id: ++id, method: 'Page.screencastFrameAck', params: { sessionId } }));
  }
});
const send = (method, params = {}) =>
  new Promise((r) => {
    const n = ++id;
    pending.set(n, r);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const evaluate = async (expression) =>
  (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: mode === 'phone' });
await send('Page.navigate', { url: `${BASE}/dev/motion` });

// Settled: the document loaded, the fonts in, the list drawn, and a quiet moment after.
for (let i = 0; i < 80; i++) {
  await sleep(250);
  if ((await evaluate('document.readyState')) === 'complete') break;
}
await evaluate('document.fonts.ready.then(() => true)');
for (let i = 0; i < 40 && !(await evaluate("!!document.querySelector('.mo-list button')")); i++) await sleep(250);
await sleep(1200);

await send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 });
await sleep(500);
const played = await evaluate(`(() => {
  const button = [...document.querySelectorAll('.mo-list button')].find((b) => b.dataset.name === ${JSON.stringify(name)});
  if (!button) return false;
  button.click();
  return true;
})()`);
if (!played) {
  console.error(`No animation called "${name}" on /dev/motion.`);
  process.exit(1);
}
await sleep(Number(seconds) * 1000);
await send('Page.stopScreencast');
browser.kill();

if (frames.length < 2) {
  console.error('Nothing was recorded.');
  process.exit(1);
}

// Each frame shown until the next one, so the video keeps the real timing.
const work = mkdtempSync(join(tmpdir(), 'motion-frames-'));
const list = [];
frames.forEach((frame, index) => {
  const file = join(work, `f${String(index).padStart(5, '0')}.jpg`);
  writeFileSync(file, Buffer.from(frame.data, 'base64'));
  const next = frames[index + 1];
  const duration = next ? Math.max(0.001, next.time - frame.time) : 0.5;
  list.push(`file '${file.replace(/\\/g, '/')}'`, `duration ${duration.toFixed(4)}`);
});
list.push(`file '${join(work, `f${String(frames.length - 1).padStart(5, '0')}.jpg`).replace(/\\/g, '/')}'`);
const listFile = join(work, 'frames.txt');
writeFileSync(listFile, list.join('\n'));
const output = join(outDir, `${name}-${mode}.mp4`);
const encoded = spawnSync(
  FFMPEG,
  ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-vf', 'fps=60,scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output],
  { encoding: 'utf8' },
);
rmSync(work, { recursive: true, force: true });
if (encoded.status !== 0) {
  console.error(encoded.stderr.slice(-800));
  process.exit(1);
}
console.log(`${frames.length} frames → ${output}`);
process.exit(0);
