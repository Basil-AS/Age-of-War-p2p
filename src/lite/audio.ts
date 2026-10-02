/** Procedural WebAudio sound effects — no asset files, instant load. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let volume = 0.6;
let muted = false;

let unlocked = false;
if (typeof window !== 'undefined') {
  const unlock = () => {
    unlocked = true;
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.removeEventListener(ev, unlock);
  };
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, unlock, { passive: true });
}

function ac(): AudioContext | null {
  if (muted || !unlocked) return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function setVolume(v: number) {
  volume = v;
  if (master) master.gain.value = v;
  muted = v <= 0.001;
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0, delay = 0) {
  const c = ac();
  if (!c || !master) return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

let noiseBuf: AudioBuffer | null = null;
function noise(dur: number, vol: number, freq: number, q = 1, delay = 0) {
  const c = ac();
  if (!c || !master) return;
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = c.currentTime + delay;
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t0, Math.random() * 0.5, dur + 0.05);
}

export type Sfx =
  | 'click'
  | 'buy'
  | 'spawn'
  | 'swing'
  | 'hit'
  | 'arrow'
  | 'gun'
  | 'boom'
  | 'laser'
  | 'coin'
  | 'evolve'
  | 'special'
  | 'win'
  | 'lose'
  | 'denied';

const last = new Map<string, number>();
export function sfx(name: Sfx) {
  const c = ac();
  if (!c) return;
  const now = c.currentTime;
  if (now - (last.get(name) ?? 0) < 0.035) return; // avoid machine-gun stacking
  last.set(name, now);
  switch (name) {
    case 'click':
      tone(660, 0.05, 'square', 0.07);
      break;
    case 'denied':
      tone(160, 0.12, 'sawtooth', 0.09, -60);
      break;
    case 'buy':
      tone(520, 0.07, 'triangle', 0.12);
      tone(780, 0.09, 'triangle', 0.1, 0, 0.06);
      break;
    case 'spawn':
      tone(300, 0.1, 'triangle', 0.08, 200);
      break;
    case 'swing':
      noise(0.08, 0.1, 1800, 0.8);
      break;
    case 'hit':
      noise(0.07, 0.16, 700, 1.2);
      tone(140, 0.07, 'square', 0.06, -60);
      break;
    case 'arrow':
      noise(0.1, 0.07, 3200, 2);
      break;
    case 'gun':
      noise(0.09, 0.18, 1400, 0.7);
      tone(110, 0.08, 'square', 0.07, -50);
      break;
    case 'boom':
      noise(0.45, 0.32, 160, 0.6);
      tone(70, 0.4, 'sawtooth', 0.18, -40);
      break;
    case 'laser':
      tone(1500, 0.14, 'sawtooth', 0.06, -1100);
      break;
    case 'coin':
      tone(1180, 0.06, 'square', 0.05);
      tone(1560, 0.1, 'square', 0.05, 0, 0.05);
      break;
    case 'evolve':
      [392, 494, 587, 784, 988].forEach((f, i) => {
        tone(f, 0.28, 'triangle', 0.14, 0, i * 0.09);
      });
      break;
    case 'special':
      tone(90, 1.2, 'sawtooth', 0.16, 160);
      noise(1.1, 0.14, 500, 0.5);
      break;
    case 'win':
      [523, 659, 784, 1047].forEach((f, i) => {
        tone(f, 0.4, 'triangle', 0.16, 0, i * 0.14);
      });
      break;
    case 'lose':
      [392, 349, 311, 262].forEach((f, i) => {
        tone(f, 0.5, 'sawtooth', 0.1, 0, i * 0.18);
      });
      break;
  }
}

// ───────────────────────── generative battle music ─────────────────────────
let musicOn = true;
let musicTimer: ReturnType<typeof setInterval> | null = null;
let step = 0;
let musicAge = 0;
const SCALES = [
  [0, 3, 5, 7, 10], // minor pentatonic — stone
  [0, 2, 3, 7, 8], // medieval
  [0, 2, 4, 7, 9], // renaissance (major pentatonic)
  [0, 3, 5, 6, 10], // blues-ish — modern
  [0, 1, 5, 7, 8], // dark — future
];

export function setMusicAge(a: number) {
  musicAge = a;
}
export function setMusic(on: boolean) {
  musicOn = on;
  if (!on) stopMusic();
}
export function isMusicOn() {
  return musicOn;
}

export function startMusic() {
  if (!musicOn || musicTimer || !ac() || !master) return;
  step = 0;
  musicTimer = setInterval(
    () => {
      const c = ac();
      if (!c || !master) return;
      const bpm = 96 + musicAge * 6;
      const beat = 60 / bpm / 2;
      const scale = SCALES[musicAge] as number[];
      const root = 110 * 2 ** (([0, -2, 3, -5, 7][musicAge] ?? 0) / 12);
      const t0 = 0;
      const bar = step % 16;
      if (bar % 4 === 0) tone(root / 2, beat * 1.6, 'sine', 0.22, -12, t0); // kick-ish bass
      if (bar % 8 === 4) noise(0.12, 0.05, 6000, 1, t0); // snare tick
      if (bar % 2 === 1) noise(0.03, 0.025, 9000, 2, t0); // hat
      const deg = (Math.imul(step * 2654435761, 1) >>> 8) % scale.length;
      if (step % 2 === 0 || (step * 7) % 5 === 0) {
        const f = root * 2 ** (((scale[deg] as number) + (bar < 8 ? 12 : 19)) / 12);
        tone(f, beat * 1.4, musicAge === 4 ? 'sawtooth' : 'triangle', 0.045, 0, t0);
      }
      step++;
    },
    0.5 * (60 / (96 + musicAge * 6) / 2) * 1000 * 2,
  );
}

export function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
}
