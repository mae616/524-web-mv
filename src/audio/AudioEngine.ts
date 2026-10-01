import { Synth } from './Synth';
import { getPentatonicFrequency } from '../utils/math';

/**
 * オーディオエンジン: Web Audio APIのコンテキスト、ルーティング、アナライザー、エフェクト統括
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayGain: GainNode | null = null;

  public synth: Synth | null = null;
  private isMuted: boolean = false;
  private isInitialized: boolean = false;

  private frequencyData: Uint8Array<ArrayBuffer> | null = null;
  private isIosUnlocked: boolean = false;

  /**
   * モバイル・デスクトップ両対応の完全オーディオ初期化＆アンロック
   */
  public async init(): Promise<void> {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioContextClass();
    }

    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (_) {}
    }

    // iOS / Android WebKit用ダミー無音バッファ再生によるハードウェアアンロック
    try {
      const buffer = this.ctx.createBuffer(1, 1, 22050);
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.ctx.destination);
      source.start(0);
    } catch (_) {}

    // iOSサイレントスイッチ対策（無音WAVによるPlaybackオーディオセッション昇格）
    this.unlockIosAudioSession();

    if (this.isInitialized) {
      return;
    }

    // マスターゲイン
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.7, this.ctx.currentTime);

    // ダイナミクスコンプレッサー（音割れ防止＆温かみ）
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-18, this.ctx.currentTime);
    this.compressor.knee.setValueAtTime(12, this.ctx.currentTime);
    this.compressor.ratio.setValueAtTime(4, this.ctx.currentTime);
    this.compressor.attack.setValueAtTime(0.005, this.ctx.currentTime);
    this.compressor.release.setValueAtTime(0.15, this.ctx.currentTime);

    // 周波数アナライザー
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.8;
    this.frequencyData = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));

    // 空間・フィルターエフェクト
    this.filterNode = this.ctx.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.setValueAtTime(8000, this.ctx.currentTime);
    this.filterNode.Q.setValueAtTime(2.0, this.ctx.currentTime);

    this.delayNode = this.ctx.createDelay(1.0);
    this.delayNode.delayTime.setValueAtTime(0.25, this.ctx.currentTime);
    this.delayGain = this.ctx.createGain();
    this.delayGain.gain.setValueAtTime(0.25, this.ctx.currentTime);

    // ルーティング
    // synth -> filterNode -> masterGain -> compressor -> analyser -> destination
    this.filterNode.connect(this.masterGain);
    this.masterGain.connect(this.compressor);
    this.compressor.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // ディレイループ
    this.filterNode.connect(this.delayNode);
    this.delayNode.connect(this.delayGain);
    this.delayGain.connect(this.delayNode);
    this.delayGain.connect(this.masterGain);

    this.synth = new Synth(this.ctx, this.filterNode);
    this.isInitialized = true;

    // 画面復帰時の自動再開リスナー
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
      });
    }
  }

  /**
   * iOSのマナーモード（消音スイッチ）貫通＆メディアセッション初期化
   */
  private unlockIosAudioSession(): void {
    if (this.isIosUnlocked || typeof document === 'undefined') return;
    try {
      const silenceWav = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
      const audio = new Audio(silenceWav);
      audio.volume = 0.01;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          this.isIosUnlocked = true;
          audio.pause();
        }).catch(() => {});
      }
    } catch (_) {}
  }

  public getContext(): AudioContext | null {
    return this.ctx;
  }

  /**
   * ミュートの切り替え
   */
  public toggleMute(): boolean {
    if (!this.masterGain || !this.ctx) return this.isMuted;
    this.isMuted = !this.isMuted;
    const targetGain = this.isMuted ? 0.0 : 0.7;
    this.masterGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.05);
    return this.isMuted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  /**
   * マウス座標によるリアルタイム・フィルター・エフェクト変調
   * @param normalizedX 0.0〜1.0（ローパスフィルター開閉: 400Hz〜16000Hz）
   * @param normalizedY 0.0〜1.0（ディレイフィードバック: 0.05〜0.45）
   */
  public modulateEffects(normalizedX: number, normalizedY: number): void {
    if (!this.ctx || !this.filterNode || !this.delayGain) return;
    const freq = 400 * Math.pow(40, normalizedX); // 指数カーブで自然なフィルター
    this.filterNode.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.05);

    const feedback = 0.05 + normalizedY * 0.4;
    this.delayGain.gain.setTargetAtTime(feedback, this.ctx.currentTime, 0.05);
  }

  /**
   * ペンタトニックスケールの音をトリガー（ユーザー演奏/クリック用）
   */
  public triggerScaleNote(scaleIndex: number): void {
    if (!this.synth || !this.ctx) return;
    const freq = getPentatonicFrequency(scaleIndex);
    this.synth.playPluck(freq, this.ctx.currentTime, 0.35);
  }

  /**
   * ちょっと引っ張り「ポヨン♪」音（軽やかなバウンス）
   */
  public triggerPoyon(tension: number = 0.3): void {
    if (!this.synth || !this.ctx) return;
    this.synth.playPoyon(tension, this.ctx.currentTime);
  }

  /**
   * 大きく引っ張り「ビヨ〜〜ン♪」音（リッチなウォブル）
   */
  public triggerBion(tension: number = 0.8): void {
    if (!this.synth || !this.ctx) return;
    this.synth.playBion(tension, this.ctx.currentTime);
  }

  /**
   * 汎用バウンス音（ビヨ〜ン）
   */
  public triggerBoing(tension: number): void {
    if (!this.synth || !this.ctx) return;
    this.synth.playBoing(tension, this.ctx.currentTime);
  }

  /**
   * ドロップレット音（ポチャン）
   */
  public triggerDroplet(pitchMod: number = 1.0): void {
    if (!this.synth || !this.ctx) return;
    this.synth.playDroplet(this.ctx.currentTime, pitchMod);
  }

  /**
   * PERFECT判定時のクリスタルベルチャイム
   */
  public triggerPerfectChime(): void {
    if (!this.synth || !this.ctx) return;
    this.synth.playPerfectChime(this.ctx.currentTime);
  }

  /**
   * ステージクリア時のファンファーレ ＆ クリアボイス
   */
  public triggerClearVoiceAndFanfare(): void {
    if (!this.synth || !this.ctx) return;
    this.synth.playClearFanfare(this.ctx.currentTime);

    // Web Speech API によるクリアボイス（ブラウザ標準の合成音声で「ステージクリア！」）
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance('ステージクリア！おめでとう！');
        utterance.lang = 'ja-JP';
        utterance.pitch = 1.35; // 高めで元気なキャラクターボイス
        utterance.rate = 1.15;
        window.speechSynthesis.speak(utterance);
      } catch {
        // 音声合成が利用できない環境では安全にスキップ
      }
    }
  }

  /**
   * オーディオビジュアライザー用データ（低音/中音/高音の強度を0.0〜1.0で返す）
   */
  public getAudioMetrics(): { bass: number; mid: number; treble: number; overall: number } {
    if (!this.analyser || !this.frequencyData) {
      return { bass: 0, mid: 0, treble: 0, overall: 0 };
    }

    this.analyser.getByteFrequencyData(this.frequencyData);
    const length = this.frequencyData.length;

    let bassSum = 0;
    const bassCount = Math.floor(length * 0.15);
    for (let i = 0; i < bassCount; i++) {
      bassSum += this.frequencyData[i];
    }
    const bass = bassSum / (bassCount * 255);

    let midSum = 0;
    const midCount = Math.floor(length * 0.4);
    for (let i = bassCount; i < bassCount + midCount; i++) {
      midSum += this.frequencyData[i];
    }
    const mid = midSum / (midCount * 255);

    let trebleSum = 0;
    const trebleCount = length - (bassCount + midCount);
    for (let i = bassCount + midCount; i < length; i++) {
      trebleSum += this.frequencyData[i];
    }
    const treble = trebleSum / (trebleCount * 255);

    return {
      bass,
      mid,
      treble,
      overall: (bass * 0.5 + mid * 0.3 + treble * 0.2),
    };
  }
}
