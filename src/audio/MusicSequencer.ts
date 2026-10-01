import { AudioEngine } from './AudioEngine';

export type PlayMode = 'chill' | 'groove' | 'fever';

export interface BeatEvent {
  step: number;     // 0〜15
  beat: number;     // 0〜3
  bar: number;      // 小節番号
  isDownbeat: boolean;
  intensity: number;
}

/**
 * 音楽シーケンサー: BPM・小節・ビート（16ステップ）を駆動し、524のアニメーションと完全同期
 */
export class MusicSequencer {
  private engine: AudioEngine;
  private isPlaying: boolean = false;
  private bpm: number = 118;
  private mode: PlayMode = 'groove';

  private currentStep: number = 0;
  private currentBar: number = 0;
  private timerId: number | null = null;
  private nextNoteTime: number = 0;

  // コールバック
  public onStepCallbacks: ((event: BeatEvent) => void)[] = [];

  // コード進行（MIDI音高）
  // Fmaj7 -> G -> Em7 -> Am7
  private chords = [
    { root: 41, notes: [65, 69, 72, 76] }, // Fmaj7 (F, A, C, E)
    { root: 43, notes: [67, 71, 74, 77] }, // G7 (G, B, D, F)
    { root: 40, notes: [64, 67, 71, 74] }, // Em7 (E, G, B, D)
    { root: 45, notes: [69, 72, 76, 79] }, // Am7 (A, C, E, G)
  ];

  // ペンタトニック・アルペジオパターン
  private arpPattern = [0, 2, 4, 7, 9, 7, 4, 2, 4, 7, 9, 11, 9, 7, 4, 0];

  constructor(engine: AudioEngine) {
    this.engine = engine;
  }

  public setBpm(newBpm: number): void {
    this.bpm = Math.max(60, Math.min(180, newBpm));
  }

  public getBpm(): number {
    return this.bpm;
  }

  public setMode(newMode: PlayMode): void {
    this.mode = newMode;
    if (newMode === 'chill') {
      this.setBpm(92);
    } else if (newMode === 'groove') {
      this.setBpm(118);
    } else if (newMode === 'fever') {
      this.setBpm(132);
    }
  }

  public getMode(): PlayMode {
    return this.mode;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public start(): void {
    if (this.isPlaying) return;
    this.isPlaying = true;
    const ctx = this.engine.getContext();
    if (!ctx) return;

    this.nextNoteTime = ctx.currentTime + 0.05;
    this.currentStep = 0;
    this.currentBar = 0;
    this.scheduleLoop();
  }

  public stop(): void {
    this.isPlaying = false;
    if (this.timerId !== null) {
      window.clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  public reset(): void {
    this.stop();
    this.currentStep = 0;
    this.currentBar = 0;
  }

  private scheduleLoop = (): void => {
    if (!this.isPlaying) return;

    const ctx = this.engine.getContext();
    if (!ctx) return;

    // 先読みスケジューリング（Web Audio Clock 精度）
    const scheduleAheadTime = 0.1;
    while (this.nextNoteTime < ctx.currentTime + scheduleAheadTime) {
      this.scheduleStep(this.currentStep, this.currentBar, this.nextNoteTime);
      this.advanceStep();
    }

    this.timerId = window.setTimeout(this.scheduleLoop, 25);
  };

  private advanceStep(): void {
    const secondsPerBeat = 60.0 / this.bpm;
    const secondsPer16th = secondsPerBeat / 4.0;
    this.nextNoteTime += secondsPer16th;

    this.currentStep = (this.currentStep + 1) % 16;
    if (this.currentStep === 0) {
      this.currentBar++;
    }
  }

  private scheduleStep(step: number, bar: number, time: number): void {
    const synth = this.engine.synth;
    if (!synth) return;

    const currentChordIndex = bar % this.chords.length;
    const chord = this.chords[currentChordIndex];

    const isBeat = step % 4 === 0;
    const beatIndex = Math.floor(step / 4);

    // 1. ドラム演奏
    const isFever = this.mode === 'fever';
    const isChill = this.mode === 'chill';

    // キック: 4つ打ち (step 0, 4, 8, 12)
    if (step % 4 === 0) {
      if (!isChill || (step === 0 || step === 8)) {
        synth.playKick(time, isFever ? 1.2 : 1.0);
      }
    }

    // スネア: 2拍目と4拍目 (step 4, 12)
    if (step === 4 || step === 12) {
      synth.playSnare(time, isFever ? 1.0 : 0.8);
    }
    // フィーバー時のゴーストスネア
    if (isFever && (step === 10 || step === 14)) {
      synth.playSnare(time, 0.4);
    }

    // ハイハット: 16分刻み (裏拍オープン)
    if (!isChill || step % 2 === 0) {
      const isOpen = (step % 4 === 2);
      synth.playHiHat(time, isOpen, isOpen ? 0.6 : 0.35);
    }

    // 2. ベースライン
    // 弾むベースパターン
    const playBassSteps = isChill ? [0, 6, 8, 14] : [0, 3, 6, 8, 10, 12, 14];
    if (playBassSteps.includes(step)) {
      const rootFreq = 440 * Math.pow(2, (chord.root - 69) / 12);
      const isOctave = (step === 3 || step === 10 || step === 14);
      const freq = isOctave ? rootFreq * 2 : rootFreq;
      synth.playBass(freq, time, isChill ? 0.35 : 0.22);
    }

    // 3. コードパッド（小節頭と半小節）
    if (step === 0 || (step === 8 && !isChill)) {
      const duration = (60.0 / this.bpm) * 2;
      chord.notes.forEach((midi) => {
        const freq = 440 * Math.pow(2, (midi - 69) / 12);
        synth.playChordNote(freq, time, duration, isFever ? 0.12 : 0.16);
      });
    }

    // 4. アルペジオ・メロディ
    if (isFever || (this.mode === 'groove' && (step % 2 === 0))) {
      const arpNoteOffset = this.arpPattern[step % this.arpPattern.length];
      const midi = chord.notes[0] + arpNoteOffset;
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      synth.playPluck(freq, time, 0.2);
    }

    // 5. アニメーションイベント通知
    // setTimeoutでブラウザメインスレッドに通知
    const delayMs = Math.max(0, (time - this.engine.getContext()!.currentTime) * 1000);
    window.setTimeout(() => {
      const event: BeatEvent = {
        step,
        beat: beatIndex,
        bar,
        isDownbeat: isBeat,
        intensity: isBeat ? (step === 0 ? 1.0 : 0.7) : 0.3,
      };
      this.onStepCallbacks.forEach((cb) => cb(event));
    }, delayMs);
  }
}
