// QR decoding worker (worker_threads). jsQR is synchronous and can run for seconds on
// adversarial images, so it never runs on the main thread: src/lib/tickets/fingerprint.ts
// spawns this file per scan, enforces a time budget and terminates it.
//
// Message in:  { data: Uint8Array (raw 8-bit pixels), channels: 1 | 3 | 4, width, height,
//                inversionAttempts: 'dontInvert' | 'attemptBoth' }
// Message out: { payload: string | null }
import { parentPort } from 'node:worker_threads';
import jsQR from 'jsqr';

// jsQR wants RGBA; sharp hands over 1 channel after grayscale() and 3 otherwise.
function toRgba(data, channels, width, height) {
  const n = width * height;
  const out = new Uint8ClampedArray(n * 4);
  const gray = channels < 3;
  for (let i = 0, s = 0; i < n; i++, s += channels) {
    out[i * 4] = data[s];
    out[i * 4 + 1] = data[gray ? s : s + 1];
    out[i * 4 + 2] = data[gray ? s : s + 2];
    out[i * 4 + 3] = 255;
  }
  return out;
}

parentPort.on('message', ({ data, channels, width, height, inversionAttempts }) => {
  let payload = null;
  try {
    const code = jsQR(toRgba(data, channels, width, height), width, height, { inversionAttempts });
    payload = code ? code.data : null;
  } catch {
    payload = null;
  }
  parentPort.postMessage({ payload });
});
