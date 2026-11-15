class SoundSystem {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;
  // Default volume set to 30% (0.30)
  public volume: number = 0.3;
  private readonly baseBgmVolume = 0.14;
  private readonly baseSfxVolume = 0.95;
  private readyAudio: HTMLAudioElement | null = null;
  private goAudio: HTMLAudioElement | null = null;
  private gameAudio: HTMLAudioElement | null = null;
  private failureAudio: HTMLAudioElement | null = null;
  private levelCompleteAudio: HTMLAudioElement | null = null;
  private storyCompleteAudio: HTMLAudioElement | null = null;
  private bgmAudio: HTMLAudioElement | null = null;
  private musicActive: boolean = false;
  private musicPaused: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const savedVol = localStorage.getItem('precision_volume_v3');
      if (savedVol !== null && !Number.isNaN(Number(savedVol))) {
        this.volume = Math.max(0, Math.min(1, Number(savedVol)));
        this.enabled = this.volume > 0;
      }

      this.readyAudio = new Audio('/sounds/ready.mp3');
      this.readyAudio.preload = 'auto';
      this.goAudio = new Audio('/sounds/go.mp3');
      this.goAudio.preload = 'auto';
      this.gameAudio = new Audio('/sounds/game.mp3');
      this.gameAudio.preload = 'auto';
      this.failureAudio = new Audio('/sounds/failure.mp3');
      this.failureAudio.preload = 'auto';
      this.levelCompleteAudio = new Audio('/sounds/level-complete.mp3');
      this.levelCompleteAudio.preload = 'auto';
      this.storyCompleteAudio = new Audio('/sounds/story-complete.mp3?v=3');
      this.storyCompleteAudio.preload = 'auto';
      this.bgmAudio = new Audio('/sounds/bgm.mp3');
      this.bgmAudio.preload = 'auto';
      this.bgmAudio.loop = true;
      this.bgmAudio.volume = this.baseBgmVolume * this.volume;

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

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    this.enabled = this.volume > 0;
    if (typeof window !== 'undefined') {
      localStorage.setItem('precision_volume_v3', String(this.volume));
    }
    if (this.bgmAudio) {
      this.bgmAudio.volume = this.baseBgmVolume * this.volume;
      if (this.volume === 0 && !this.bgmAudio.paused) {
        this.bgmAudio.pause();
      } else if (this.volume > 0 && this.musicActive && !this.musicPaused && this.bgmAudio.paused) {
        this.bgmAudio.play().catch(() => {});
      }
    }
  }

  private playClip(audio: HTMLAudioElement | null, scale: number = 1) {
    if (!this.enabled || this.volume <= 0 || !audio) return;
    try {
      audio.currentTime = 0;
      audio.volume = Math.min(1, this.baseSfxVolume * this.volume * scale);
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
    this.musicPaused = false;
    if (!this.enabled || this.volume <= 0 || !this.bgmAudio) return;
    try {
      this.bgmAudio.loop = true;
      this.bgmAudio.currentTime = 0;
      this.bgmAudio.volume = this.baseBgmVolume * this.volume;
      this.bgmAudio.play().catch(() => {});
    } catch {
      // Ignore autoplay errors
    }
  }

  public pauseMusic() {
    this.musicPaused = true;
    if (!this.bgmAudio) return;
    try {
      this.bgmAudio.pause();
    } catch {
      // Ignore
    }
  }

  public resumeMusic() {
    this.musicPaused = false;
    if (!this.musicActive || !this.enabled || this.volume <= 0 || !this.bgmAudio) return;
    try {
      this.bgmAudio.volume = this.baseBgmVolume * this.volume;
      this.bgmAudio.play().catch(() => {});
    } catch {
      // Ignore
    }
  }

  public ensureMusicPlaying() {
    if (!this.musicActive || this.musicPaused || !this.enabled || this.volume <= 0 || !this.bgmAudio) return;
    if (this.bgmAudio.paused) {
      this.bgmAudio.volume = this.baseBgmVolume * this.volume;
      this.bgmAudio.play().catch(() => {});
    }
  }

  public stopMusic() {
    this.musicActive = false;
    this.musicPaused = false;
    if (!this.bgmAudio) return;
    try {
      this.bgmAudio.pause();
      this.bgmAudio.currentTime = 0;
    } catch {
      // Ignore
    }
  }

  public playFailure() {
    if (!this.enabled) return;
    // Play the announcer "Failure..." voice effect when a player is eliminated in multiplayer
    this.playClip(this.failureAudio);
  }

  public playLevelComplete(keepMusic: boolean = false) {
    if (!keepMusic) this.stopMusic();
    if (!this.enabled) return;
    this.playClip(this.levelCompleteAudio, 0.9);
  }

  public playStoryComplete() {
    this.stopMusic();
    if (!this.enabled) return;
    this.playClip(this.storyCompleteAudio, 0.9);
  }

  public playCollision() {
    // Stop background music immediately right before "GAME!" plays
    this.stopMusic();
    if (!this.enabled) return;
    // Play the announcer "GAME!" voice effect when the game ends (lowered to 67%)
    this.playClip(this.gameAudio, 0.67);
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
