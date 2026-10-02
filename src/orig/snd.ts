/** Plays the original game's own sound effects + music (ids from the SWF) through WebAudio. */
export class OrigAudio {
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private buffers = new Map<number, Promise<AudioBuffer | null>>();
  private last = new Map<number, number>();
  private music: AudioBufferSourceNode | null = null;
  private unlocked = false;
  sfxVolume = 0.6;
  musicVolume = 0.35;
  musicOn = true;
  constructor(private urlFor: (id: number) => string | null) {
    if (typeof window !== 'undefined') {
      const un = () => {
        this.unlocked = true;
        void this.ctx?.resume();
        for (const e of ['pointerdown', 'keydown', 'touchstart']) window.removeEventListener(e, un);
        if (this.wantMusic) this.startMusic();
      };
      for (const e of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(e, un, { passive: true });
    }
  }
  private wantMusic = false;
  private ensure(): AudioContext | null {
    if (!this.unlocked) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.sfxGain = this.ctx.createGain();
        this.musicGain = this.ctx.createGain();
        this.sfxGain.gain.value = this.sfxVolume;
        this.musicGain.gain.value = this.musicVolume;
        this.sfxGain.connect(this.ctx.destination);
        this.musicGain.connect(this.ctx.destination);
      } catch {
        return null;
      }
    }
    return this.ctx;
  }
  setSfx(v: number) {
    this.sfxVolume = v;
    if (this.sfxGain) this.sfxGain.gain.value = v;
  }
  setMusicVolume(v: number) {
    this.musicVolume = v;
    if (this.musicGain) this.musicGain.gain.value = v;
  }
  private load(id: number): Promise<AudioBuffer | null> {
    let p = this.buffers.get(id);
    if (!p) {
      const url = this.urlFor(id);
      p = !url
        ? Promise.resolve(null)
        : fetch(url)
            .then((r) => r.arrayBuffer())
            .then((b) => this.ctx?.decodeAudioData(b) ?? null)
            .catch(() => null);
      this.buffers.set(id, p);
    }
    return p;
  }
  /** fire-and-forget; identical sounds within 45 ms collapse into one (units attack in unison) */
  play(id: number, gain = 1) {
    const ctx = this.ensure();
    if (!ctx || this.sfxVolume <= 0.001) return;
    const now = ctx.currentTime;
    if (now - (this.last.get(id) ?? -1) < 0.045) return;
    this.last.set(id, now);
    void this.load(id).then((buf) => {
      if (!buf || !this.sfxGain) return;
      const s = ctx.createBufferSource();
      s.buffer = buf;
      if (gain !== 1) {
        const g = ctx.createGain();
        g.gain.value = gain;
        s.connect(g).connect(this.sfxGain);
      } else s.connect(this.sfxGain);
      s.start();
    });
  }
  startMusic(id = 1035) {
    this.wantMusic = true;
    if (!this.musicOn) return;
    const ctx = this.ensure();
    if (!ctx || this.music) return;
    void this.load(id).then((buf) => {
      if (!buf || !this.musicGain || this.music || !this.wantMusic) return;
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.connect(this.musicGain);
      s.start();
      this.music = s;
    });
  }
  stopMusic() {
    this.wantMusic = false;
    try {
      this.music?.stop();
    } catch {
      /* already stopped */
    }
    this.music = null;
  }
  setMusicOn(on: boolean) {
    this.musicOn = on;
    if (!on) {
      this.wantMusic = false;
      try {
        this.music?.stop();
      } catch {
        /* */
      }
      this.music = null;
    }
  }
}
