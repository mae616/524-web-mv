/**
 * Web Audio API を用いたプロシージャル・シンセサイザー音源群
 * 外部音源ファイル不要で、軽量かつ自由自在な音響表現を実現
 */

export class Synth {
  private ctx: AudioContext;
  private masterNode: AudioNode;

  constructor(ctx: AudioContext, masterNode: AudioNode) {
    this.ctx = ctx;
    this.masterNode = masterNode;
  }

  /**
   * ポヨンと弾むキックドラム
   */
  public playKick(time: number = this.ctx.currentTime, intensity: number = 1.0): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    const startFreq = 140 * intensity;
    const endFreq = 38;

    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(endFreq, time + 0.12);

    gain.gain.setValueAtTime(0.8 * intensity, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);

    osc.connect(gain);
    gain.connect(this.masterNode);

    osc.start(time);
    osc.stop(time + 0.25);
  }

  /**
   * 軽快でタイトなスネア / クラップ
   */
  public playSnare(time: number = this.ctx.currentTime, intensity: number = 0.8): void {
    // ノイズ成分
    const bufferSize = this.ctx.sampleRate * 0.15;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.setValueAtTime(1000, time);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.4 * intensity, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterNode);

    // トーン成分（アタック）
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, time);
    osc.frequency.exponentialRampToValueAtTime(80, time + 0.08);

    oscGain.gain.setValueAtTime(0.5 * intensity, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);

    osc.connect(oscGain);
    oscGain.connect(this.masterNode);

    noise.start(time);
    noise.stop(time + 0.15);
    osc.start(time);
    osc.stop(time + 0.09);
  }

  /**
   * クリスピーなハイハット
   */
  public playHiHat(time: number = this.ctx.currentTime, open: boolean = false, intensity: number = 0.5): void {
    const duration = open ? 0.2 : 0.04;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7000, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35 * intensity, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterNode);

    source.start(time);
    source.stop(time + duration);
  }

  /**
   * 温かみのあるグルーヴ・シンセベース
   */
  public playBass(freq: number, time: number = this.ctx.currentTime, duration: number = 0.25): void {
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 3, time);
    filter.frequency.exponentialRampToValueAtTime(freq * 1.2, time + duration);

    gain.gain.setValueAtTime(0.55, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterNode);

    osc.start(time);
    osc.stop(time + duration);
  }

  /**
   * ドリーミーなコード・シンセパッド
   */
  public playChordNote(freq: number, time: number = this.ctx.currentTime, duration: number = 1.0, gainVal: number = 0.15): void {
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc1.type = 'triangle';
    osc2.type = 'sine';

    osc1.frequency.setValueAtTime(freq, time);
    osc2.frequency.setValueAtTime(freq * 1.003, time); // わずかなデチューンで広がり

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, time);

    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(gainVal, time + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterNode);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + duration);
    osc2.stop(time + duration);
  }

  /**
   * きらめくアルペジオ・メロディプラック
   */
  public playPluck(freq: number, time: number = this.ctx.currentTime, duration: number = 0.3): void {
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 4, time);
    filter.frequency.exponentialRampToValueAtTime(freq * 0.8, time + duration);

    gain.gain.setValueAtTime(0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterNode);

    osc.start(time);
    osc.stop(time + duration);
  }

  /**
   * シグネチャ表現: 524ちょっと引っ張り「ポヨンッ♪」音（フィルターモジュレーション強化）
   * @param tension 0.0〜0.45（軽やかな引っ張り）
   */
  public playPoyon(tension: number = 0.3, time: number = this.ctx.currentTime): void {
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'triangle';

    const startFreq = 400 + tension * 260;
    const peakFreq = startFreq * 1.5;

    // スプリングピッチスイープ（急上昇してポンッと跳ね返る）
    osc1.frequency.setValueAtTime(startFreq, time);
    osc1.frequency.exponentialRampToValueAtTime(peakFreq, time + 0.07);
    osc1.frequency.exponentialRampToValueAtTime(startFreq * 0.9, time + 0.22);

    osc2.frequency.setValueAtTime(startFreq * 2, time);
    osc2.frequency.exponentialRampToValueAtTime(peakFreq * 2, time + 0.07);
    osc2.frequency.exponentialRampToValueAtTime(startFreq * 1.8, time + 0.22);

    // バンドパスフィルターでゴムまりのような弾力質感を付与
    filter.type = 'bandpass';
    filter.Q.setValueAtTime(3.2, time);
    filter.frequency.setValueAtTime(startFreq * 1.2, time);
    filter.frequency.exponentialRampToValueAtTime(peakFreq * 1.6, time + 0.07);
    filter.frequency.exponentialRampToValueAtTime(startFreq, time + 0.24);

    gain.gain.setValueAtTime(0.4, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.26);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterNode);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + 0.26);
    osc2.stop(time + 0.26);
  }

  /**
   * シグネチャ表現: 524大きく引っ張り「ビヨ〜〜ン♪」音（深みのあるウォブル弾力音）
   * @param tension 0.45〜1.0（ダイナミックな大引っ張り）
   */
  public playBion(tension: number = 0.8, time: number = this.ctx.currentTime): void {
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc1.type = 'triangle';
    osc2.type = 'sawtooth';

    const startFreq = 280 + tension * 260;
    const dropFreq = 120 + tension * 40;

    // ピッチベンド＆うねり
    osc1.frequency.setValueAtTime(startFreq, time);
    osc1.frequency.exponentialRampToValueAtTime(dropFreq, time + 0.26);
    osc1.frequency.linearRampToValueAtTime(dropFreq * 1.45, time + 0.42);
    osc1.frequency.exponentialRampToValueAtTime(dropFreq * 0.95, time + 0.65);

    osc2.frequency.setValueAtTime(startFreq * 1.01, time); // わずかなデチューンで太い厚み
    osc2.frequency.exponentialRampToValueAtTime(dropFreq * 1.01, time + 0.26);
    osc2.frequency.linearRampToValueAtTime(dropFreq * 1.45 * 1.01, time + 0.42);
    osc2.frequency.exponentialRampToValueAtTime(dropFreq * 0.95 * 1.01, time + 0.65);

    // ローパスフィルターにレゾナンスを効かせてビヨ〜〜ン感を強調
    filter.type = 'lowpass';
    filter.Q.setValueAtTime(6.0, time);
    filter.frequency.setValueAtTime(2400, time);
    filter.frequency.exponentialRampToValueAtTime(450, time + 0.35);
    filter.frequency.exponentialRampToValueAtTime(900, time + 0.5);
    filter.frequency.exponentialRampToValueAtTime(300, time + 0.68);

    gain.gain.setValueAtTime(0.48, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.7);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterNode);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + 0.7);
    osc2.stop(time + 0.7);
  }

  /**
   * PERFECT判定時のきらめくクリスタルチャイム音
   */
  public playPerfectChime(time: number = this.ctx.currentTime): void {
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'sine';

    // C6 (1046.5Hz) と G6 (1567.9Hz) の澄んだ協和ベル
    osc1.frequency.setValueAtTime(1046.5, time);
    osc2.frequency.setValueAtTime(1567.9, time);

    gain.gain.setValueAtTime(0.22, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.masterNode);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + 0.35);
    osc2.stop(time + 0.35);
  }

  /**
   * 汎用バウンス音（互換性維持用）
   */
  public playBoing(tension: number, time: number = this.ctx.currentTime): void {
    if (tension < 0.45) {
      this.playPoyon(tension, time);
    } else {
      this.playBion(tension, time);
    }
  }

  /**
   * シグネチャ表現: ドロップレット（しずく）の「ポチャン♪」音
   */
  public playDroplet(time: number = this.ctx.currentTime, pitchMod: number = 1.0): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    const baseFreq = (700 + Math.random() * 200) * pitchMod;
    osc.frequency.setValueAtTime(baseFreq, time);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.8, time + 0.08);

    gain.gain.setValueAtTime(0.25, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

    osc.connect(gain);
    gain.connect(this.masterNode);

    osc.start(time);
    osc.stop(time + 0.15);
  }

  /**
   * ステージクリア・ファンファーレ ＆ ボイス調ジングル
   */
  public playClearFanfare(time: number = this.ctx.currentTime): void {
    // 祝祭のアルペジオメロディ（C4, E4, G4, C5, E5, G5, C6）
    const fanfareNotes = [261.6, 329.6, 392.0, 523.3, 659.3, 784.0, 1046.5];
    fanfareNotes.forEach((freq, i) => {
      const noteTime = time + i * 0.09;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, noteTime);

      const duration = i === fanfareNotes.length - 1 ? 1.4 : 0.28;
      gain.gain.setValueAtTime(0.35, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + duration);

      osc.connect(gain);
      gain.connect(this.masterNode);

      osc.start(noteTime);
      osc.stop(noteTime + duration);
    });

    // フォルマントボイス調チャイム（歓声のような「イェ〜イ！」）
    const voiceOsc = this.ctx.createOscillator();
    const formantFilter = this.ctx.createBiquadFilter();
    const voiceGain = this.ctx.createGain();

    voiceOsc.type = 'sawtooth';
    voiceOsc.frequency.setValueAtTime(320, time + 0.65);
    voiceOsc.frequency.exponentialRampToValueAtTime(440, time + 0.85);
    voiceOsc.frequency.exponentialRampToValueAtTime(380, time + 1.2);

    formantFilter.type = 'bandpass';
    formantFilter.frequency.setValueAtTime(900, time + 0.65);
    formantFilter.Q.setValueAtTime(4.0, time + 0.65);

    voiceGain.gain.setValueAtTime(0.001, time + 0.65);
    voiceGain.gain.linearRampToValueAtTime(0.35, time + 0.75);
    voiceGain.gain.exponentialRampToValueAtTime(0.001, time + 1.5);

    voiceOsc.connect(formantFilter);
    formantFilter.connect(voiceGain);
    voiceGain.connect(this.masterNode);

    voiceOsc.start(time + 0.65);
    voiceOsc.stop(time + 1.5);
  }
}
