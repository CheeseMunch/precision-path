class SoundSystem {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;
  private readyAudio: HTMLAudioElement | null = null;
  private goAudio: HTMLAudioElement | null = null;
  private gameAudio: HTMLAudioElement | null = null;
  private bgmAudio: HTMLAudioElement | null = null;
  private musicActive: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.readyAudio = new Audio('/sounds/ready.mp3');
      this.readyAudio.preload = 'auto';
      this.goAudio = new Audio('/sounds/go.mp3');
      this.goAudio.preload = 'auto';
      this.gameAudio = new Audio('/sounds/game.mp3');
      this.gameAudio.preload = 'auto';
      this.bgmAudio = new Audio('/sounds/bgm.mp3');
      this.bgmAudio.preload = 'auto';
      this.bgmAudio.loop = true;
      this.bgmAudio.volume = 0.26;

      // Seamless continuous loop while musicActive is true
      this.bgmAudio.addEventListener('timeupdate', () => {
        if (
          this.musicActive &&
          this.bgmAudio &&
          this.bgmAudio.duration > 0 &&
          this.bgmAudio.currentTime >= this.bgmAudio.duration - 0.25
        ) {
          this.bgmAudio.currentTime = 0;
          this.bgmAudio.play().catch(() => {});
        }
      });

      this.bgmAudio.addEventListener('ended', () => {
        if (this.musicActive && this.bgmAudio) {
          this.bgmAudio.currentTime = 0;
          this.bgmAudio.play().catch(() => {});
        }
      });
    }
  }

  private initCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private playClip(audio: HTMLAudioElement | null) {
    if (!this.enabled || !audio) return;
    try {
      audio.currentTime = 0;
      audio.volume = 0.85;
      audio.play().catch(() => {});
    } catch {
      // Ignore autoplay errors before user gesture
    }
  }

  public playReady() {
    this.playClip(this.readyAudio);
  }

  public playGo() {
    this.playClip(this.goAudio);
  }

  public playCountdown(final: boolean = false) {
    if (final) {
      this.playGo();
    } else {
      this.playReady();
    }
  }

  public playTierUp() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'triangle';
    osc2.type = 'sine';

    osc1.frequency.setValueAtTime(523.25, now); // C5
    osc1.frequency.exponentialRampToValueAtTime(1046.5, now + 0.35); // C6

    osc2.frequency.setValueAtTime(659.25, now); // E5
    osc2.frequency.exponentialRampToValueAtTime(1318.5, now + 0.35); // E6

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.4);
    osc2.stop(now + 0.4);
  }

  public startMusic() {
    this.musicActive = true;
    if (!this.enabled || !this.bgmAudio) return;
    try {
      this.bgmAudio.loop = true;
      this.bgmAudio.currentTime = 0;
      this.bgmAudio.volume = 0.26;
      this.bgmAudio.play().catch(() => {});
    } catch {
      // Ignore autoplay errors
    }
  }

  public ensureMusicPlaying() {
    if (!this.musicActive || !this.enabled || !this.bgmAudio) return;
    if (this.bgmAudio.paused) {
      this.bgmAudio.volume = 0.26;
      this.bgmAudio.play().catch(() => {});
    }
  }

  public stopMusic() {
    this.musicActive = false;
    if (!this.bgmAudio) return;
    try {
      this.bgmAudio.pause();
      this.bgmAudio.currentTime = 0;
    } catch {
      // Ignore
    }
  }

  public playCollision() {
    // Stop background music immediately right before "GAME!" plays
    this.stopMusic();
    if (!this.enabled) return;
    // Play the announcer "GAME!" voice effect when you lose
    this.playClip(this.gameAudio);
  }

  public playVictory() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const notes = [523.25, 659.25, 783.99, 1046.5]; // C, E, G, High C
    const now = this.ctx.currentTime;

    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.1);

      gain.gain.setValueAtTime(0.2, now + idx * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.3);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);

      osc.start(now + idx * 0.1);
      osc.stop(now + idx * 0.1 + 0.3);
    });
  }
}

export const sound = new SoundSystem();
