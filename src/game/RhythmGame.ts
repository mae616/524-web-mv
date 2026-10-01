import { AudioEngine } from '../audio/AudioEngine';
import { MusicSequencer, BeatEvent } from '../audio/MusicSequencer';
import { Character524 } from '../character/Character524';
import { VisualScene } from '../visuals/VisualScene';

export type NoteType = 'tap' | 'poyon' | 'bion'; // tap: 1〜5, poyon: ちょい引き(Space/短引), bion: 大引き(長引/大引)

export interface Note {
  id: number;
  type: NoteType;
  lane: number;          // 0〜4 (tap), -1 (poyon/bion)
  targetTime: number;    // ヒットすべきAudioContext時間
  hit: boolean;
  missed: boolean;
  yProgress: number;     // 0.0 (上部出現) 〜 1.0 (判定ライン)
}

export type Judgment = 'PERFECT' | 'GREAT' | 'GOOD' | 'MISS';

export interface GameResult {
  isClear: boolean;
  score: number;
  maxCombo: number;
  hearts: number;
  perfectCount: number;
  greatCount: number;
  goodCount: number;
  missCount: number;
  rank: 'S' | 'A' | 'B' | 'C';
}

export interface FloatingScore {
  text: string;
  x: number;
  y: number;
  color: string;
  alpha: number;
  vy: number;
}

/**
 * 音ゲー（リズムゲーム）エンジン
 * 中毒性の高いペンタトニック調和、524引っ張りアクション（POYON / BION）、Duolingo的ライブヘルスシステムを統括
 */
export class RhythmGame {
  private audioEngine: AudioEngine;
  private sequencer: MusicSequencer;
  private character: Character524;
  private scene: VisualScene;

  // ゲーム状態
  public score: number = 0;
  public combo: number = 0;
  public maxCombo: number = 0;
  public hearts: number = 5;
  public maxHearts: number = 5;
  public grooveGauge: number = 20; // 0〜100%

  // 判定カウント統計
  public perfectCount: number = 0;
  public greatCount: number = 0;
  public goodCount: number = 0;
  public missCount: number = 0;

  // ステージ進行
  public targetBars: number = 16; // 1ステージ16小節（約45秒）
  public currentBar: number = 0;
  public isCompleted: boolean = false;

  public notes: Note[] = [];
  public floatingScores: FloatingScore[] = [];

  private nextNoteId: number = 1;
  private noteSpeed: number = 1.35; // ノーツの移動時間（秒）

  // コールバック
  public onStateChange: (() => void) | null = null;
  public onGameClear: ((result: GameResult) => void) | null = null;
  public onGameRetire: ((result: GameResult) => void) | null = null;

  constructor(
    audioEngine: AudioEngine,
    sequencer: MusicSequencer,
    character: Character524,
    scene: VisualScene
  ) {
    this.audioEngine = audioEngine;
    this.sequencer = sequencer;
    this.character = character;
    this.scene = scene;

    this.bindSequencerEvents();
  }

  private bindSequencerEvents(): void {
    // 音楽シーケンサーのビートに合わせてノーツを自動生成（譜面自動生成）
    this.sequencer.onStepCallbacks.push((ev: BeatEvent) => {
      const ctx = this.audioEngine.getContext();
      if (!ctx || !this.sequencer.getIsPlaying()) return;

      this.currentBar = ev.bar;

      // 目標小節に達したら新規ノーツの生成を停止（ステージクリア移行）
      if (ev.bar >= this.targetBars) return;

      const mode = this.sequencer.getMode();
      const targetTime = ctx.currentTime + this.noteSpeed;

      // 2小節に1回、またはFEVERの小節頭に「大きく引っ張る BION ノーツ」
      if (ev.step === 0 && ev.bar % 2 === 0 && (mode === 'groove' || mode === 'fever')) {
        this.spawnNote('bion', -1, targetTime);
      }
      // 4拍に一度、または小節の折り返しに「ちょい引き POYON ノーツ」
      else if (ev.step === 8 && (mode === 'groove' || mode === 'fever')) {
        this.spawnNote('poyon', -1, targetTime);
      }
      // 通常のTapノーツ（1〜5）
      else if (ev.step % 4 === 0 || (mode === 'fever' && ev.step % 2 === 0)) {
        const lane = (ev.beat + ev.bar) % 5;
        this.spawnNote('tap', lane, targetTime);
      }
    });
  }

  private spawnNote(type: NoteType, lane: number, targetTime: number): void {
    this.notes.push({
      id: this.nextNoteId++,
      type,
      lane,
      targetTime,
      hit: false,
      missed: false,
      yProgress: 0,
    });
  }

  /**
   * キー入力またはタップ判定（lane: 0〜4）
   */
  public handleTapInput(lane: number): Judgment | null {
    const ctx = this.audioEngine.getContext();
    if (!ctx) return null;

    const currentTime = ctx.currentTime;
    // 最も判定ラインに近い該当レーンのノーツを探索
    const candidate = this.notes
      .filter(n => !n.hit && !n.missed && n.type === 'tap' && n.lane === lane)
      .sort((a, b) => Math.abs(a.targetTime - currentTime) - Math.abs(b.targetTime - currentTime))[0];

    if (!candidate) {
      // ノーツがない空打ちでも、ペンタトニックの美しい音が鳴ってアドリブ演奏になる（快感設計）
      this.audioEngine.triggerScaleNote(lane);
      this.character.triggerBounce(0.5);
      return null;
    }

    const diff = Math.abs(candidate.targetTime - currentTime);
    return this.judgeNote(candidate, diff, lane, 0.5);
  }

  /**
   * 524引っ張りリリース判定（小引き tension < 0.45: POYON / 大引き tension >= 0.45: BION）
   */
  public handleDragReleaseInput(tension: number): Judgment | null {
    const ctx = this.audioEngine.getContext();
    if (!ctx) return null;

    const currentTime = ctx.currentTime;
    const actionType: NoteType = tension < 0.45 ? 'poyon' : 'bion';

    // 最も判定ラインに近い poyon または bion ノーツを探索
    const candidate = this.notes
      .filter(n => !n.hit && !n.missed && (n.type === 'poyon' || n.type === 'bion'))
      .sort((a, b) => Math.abs(a.targetTime - currentTime) - Math.abs(b.targetTime - currentTime))[0];

    if (!candidate) {
      // ノーツがない時でも引っ張った強さに応じて心地よい音が鳴る
      if (actionType === 'poyon') {
        this.audioEngine.triggerPoyon(tension);
        this.character.triggerBounce(1.0);
      } else {
        this.audioEngine.triggerBion(tension);
        this.character.triggerBounce(1.6);
      }
      return null;
    }

    const diff = Math.abs(candidate.targetTime - currentTime);
    return this.judgeNote(candidate, diff, -1, tension);
  }

  /**
   * Spaceキー等からのショートカット
   */
  public handlePoyonInput(): Judgment | null {
    return this.handleDragReleaseInput(0.3);
  }

  public handleBionInput(): Judgment | null {
    return this.handleDragReleaseInput(0.8);
  }

  private judgeNote(note: Note, diff: number, lane: number, tension: number = 0.5): Judgment {
    let judgment: Judgment = 'MISS';

    if (diff <= 0.08) {
      judgment = 'PERFECT';
    } else if (diff <= 0.16) {
      judgment = 'GREAT';
    } else if (diff <= 0.24) {
      judgment = 'GOOD';
    } else if (diff <= 0.35) {
      judgment = 'MISS';
    } else {
      return 'MISS';
    }

    note.hit = true;

    // 音響・キャラクターリアクション
    if (judgment !== 'MISS') {
      this.combo++;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;

      const isFever = this.sequencer.getMode() === 'fever';
      const scoreMul = isFever ? 2 : 1;

      if (judgment === 'PERFECT') {
        this.perfectCount++;
        this.score += (note.type === 'bion' ? 500 : 300) * scoreMul;
        this.grooveGauge = Math.min(100, this.grooveGauge + (note.type === 'bion' ? 12 : 7));
        this.character.triggerHappy(0.7);
        if (this.combo >= 3) {
          this.character.triggerDance(0.8);
        }
      } else if (judgment === 'GREAT') {
        this.greatCount++;
        this.score += (note.type === 'bion' ? 300 : 180) * scoreMul;
        this.grooveGauge = Math.min(100, this.grooveGauge + 5);
        this.character.triggerBounce(1.1);
        if (this.combo >= 5) {
          this.character.triggerDance(0.5);
        }
      } else {
        this.goodCount++;
        this.score += 80 * scoreMul;
        this.grooveGauge = Math.min(100, this.grooveGauge + 2);
        this.character.triggerBounce(0.8);
      }

      // サウンドトリガー＆専用リリック
      if (note.type === 'bion') {
        this.audioEngine.triggerBion(tension);
        this.scene.spawnLyric('BION !!', this.sequencer.getMode(), undefined, undefined, true);
        this.scene.cameraShake = 8;
        this.character.triggerBounce(1.8);
      } else if (note.type === 'poyon') {
        this.audioEngine.triggerPoyon(tension);
        this.scene.spawnLyric('POYON !', this.sequencer.getMode(), undefined, undefined, true);
        this.scene.cameraShake = 4;
        this.character.triggerBounce(1.2);
      } else {
        this.audioEngine.triggerScaleNote(lane >= 0 ? lane : 2);
        if (judgment === 'PERFECT') {
          this.scene.spawnLyric('PERFECT !', this.sequencer.getMode(), undefined, undefined, true);
          this.scene.cameraShake = 5;
        } else if (judgment === 'GREAT') {
          this.scene.spawnLyric('GREAT', this.sequencer.getMode());
        }
      }

      // コンボボーナス（10コンボごとにハート回復）
      if (this.combo % 10 === 0 && this.hearts < this.maxHearts) {
        this.hearts++;
        this.scene.spawnLyric('♥ 1 UP !', this.sequencer.getMode(), undefined, undefined, true);
      }

      // グルーヴゲージ満タンで自動FEVER突入！（中毒性の爆発）
      if (this.grooveGauge >= 100 && this.sequencer.getMode() !== 'fever') {
        this.triggerFeverUpgrade();
      }
    } else {
      this.handleMiss();
    }

    this.spawnJudgmentEffect(judgment);
    this.onStateChange?.();
    return judgment;
  }

  private handleMiss(): void {
    this.missCount++;
    this.combo = 0;
    this.hearts = Math.max(0, this.hearts - 1);
    this.grooveGauge = Math.max(0, this.grooveGauge - 12);

    // 524が「あちゃ〜！」と焦り汗をかくDuolingo風リアクション
    this.character.triggerSweat(1.2);
    this.scene.cameraShake = 8;
    this.scene.spawnLyric('MISS...', this.sequencer.getMode());

    // ライフゼロ時はCHILLに自動縮退（ゲームオーバーで挫折させない優しいDuolingo思想）
    if (this.hearts === 0) {
      this.hearts = 3;
      this.sequencer.setMode('chill');
      this.character.isFeverAura = false;
      this.scene.spawnLyric('KEEP GROOVING !', 'chill', undefined, undefined, true);
    }
  }

  /**
   * ゲーム結果の算出（S / A / B / C ランク）
   */
  public calculateResult(isClear: boolean): GameResult {
    let rank: 'S' | 'A' | 'B' | 'C' = 'C';
    if (this.score >= 8000 || (isClear && this.missCount === 0)) {
      rank = 'S';
    } else if (this.score >= 5000) {
      rank = 'A';
    } else if (this.score >= 2500) {
      rank = 'B';
    }

    return {
      isClear,
      score: this.score,
      maxCombo: this.maxCombo,
      hearts: this.hearts,
      perfectCount: this.perfectCount,
      greatCount: this.greatCount,
      goodCount: this.goodCount,
      missCount: this.missCount,
      rank,
    };
  }

  /**
   * 途中終了（リタイア）
   */
  public finishEarly(): GameResult {
    this.isCompleted = true;
    this.sequencer.stop();
    const result = this.calculateResult(false);
    this.onGameRetire?.(result);
    return result;
  }

  /**
   * ステージクリアトリガー
   */
  private triggerGameClear(): void {
    this.isCompleted = true;
    this.sequencer.stop();
    const result = this.calculateResult(true);
    this.audioEngine.triggerClearVoiceAndFanfare();
    this.character.triggerDance(3.0);
    this.character.isFeverAura = true;
    this.onGameClear?.(result);
  }

  /**
   * 次のゲームへのリセット
   */
  public reset(): void {
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.hearts = 5;
    this.grooveGauge = 20;
    this.perfectCount = 0;
    this.greatCount = 0;
    this.goodCount = 0;
    this.missCount = 0;
    this.currentBar = 0;
    this.isCompleted = false;
    this.notes = [];
    this.floatingScores = [];
    this.character.isFeverAura = false;
    this.onStateChange?.();
  }

  private triggerFeverUpgrade(): void {
    this.sequencer.setMode('fever');
    this.character.isFeverAura = true;
    this.character.triggerDance(2.0);
    this.scene.triggerFeverBurst();
    this.character.triggerBounce(2.0);
  }

  private spawnJudgmentEffect(judgment: Judgment): void {
    const colors: Record<Judgment, string> = {
      PERFECT: '#FFD538',
      GREAT: '#00E5FF',
      GOOD: '#69F0AE',
      MISS: '#FF5252',
    };

    const screenW = typeof window !== 'undefined' ? window.innerWidth : 800;
    const screenH = typeof window !== 'undefined' ? window.innerHeight : 600;

    this.floatingScores.push({
      text: judgment,
      x: screenW * 0.5 + (Math.random() - 0.5) * 60,
      y: screenH * 0.65,
      color: colors[judgment],
      alpha: 1.0,
      vy: -70,
    });
  }

  /**
   * 毎フレームの更新（ノーツの落下と通過ミス判定、クリア判定）
   */
  public update(dt: number): void {
    // リザルト表示中または完了時はゲーム進行・ミス判定を完全停止
    if (this.isCompleted || !this.sequencer.getIsPlaying()) {
      for (let i = this.floatingScores.length - 1; i >= 0; i--) {
        const f = this.floatingScores[i];
        f.y += f.vy * dt;
        f.alpha -= dt * 1.5;
        if (f.alpha <= 0) {
          this.floatingScores.splice(i, 1);
        }
      }
      return;
    }

    const ctx = this.audioEngine.getContext();
    if (!ctx) return;

    const currentTime = ctx.currentTime;

    // ノーツ更新
    for (let i = this.notes.length - 1; i >= 0; i--) {
      const n = this.notes[i];
      const remainingTime = n.targetTime - currentTime;
      n.yProgress = 1.0 - (remainingTime / this.noteSpeed);

      // 通過ミス判定
      if (!n.hit && !n.missed && remainingTime < -0.22) {
        n.missed = true;
        this.handleMiss();
        this.spawnJudgmentEffect('MISS');
        this.onStateChange?.();
      }

      // 画面外ノーツの破棄
      if (n.yProgress > 1.3 || (n.hit && n.yProgress > 1.05)) {
        this.notes.splice(i, 1);
      }
    }

    // ステージ完走判定（規定小節に達し、全ノーツ通過完了でクリア！）
    if (!this.isCompleted && this.currentBar >= this.targetBars && this.notes.length === 0 && this.sequencer.getIsPlaying()) {
      this.triggerGameClear();
    }

    // 浮動スコアテキストの更新
    for (let i = this.floatingScores.length - 1; i >= 0; i--) {
      const f = this.floatingScores[i];
      f.y += f.vy * dt;
      f.alpha -= dt * 1.5;
      if (f.alpha <= 0) {
        this.floatingScores.splice(i, 1);
      }
    }
  }

  /**
   * Canvas上のリズムゲーム描画（レーン、ノーツ、判定ライン）
   */
  public draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const isPlaying = this.sequencer.getIsPlaying();
    if (!isPlaying) return;

    ctx.save();

    // DOMの各リズムパッドの位置を取得してレーンX座標を完全一致させる
    const padElements = typeof document !== 'undefined' ? document.querySelectorAll<HTMLElement>('.rhythm-pad') : null;
    const lanePositions: number[] = [];
    let calculatedTargetY = height * 0.73;

    if (padElements && padElements.length === 5) {
      padElements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        lanePositions.push(rect.left + rect.width / 2);
        calculatedTargetY = rect.top - 10;
      });
    } else {
      const defaultLaneWidth = 70;
      const defaultStartX = width * 0.5 - defaultLaneWidth * 2;
      for (let i = 0; i < 5; i++) {
        lanePositions.push(defaultStartX + i * defaultLaneWidth);
      }
    }

    // POYON / BION ボタンのDOM位置を取得（線はないが、キーの真上から降ってくる）
    const poyonEl = typeof document !== 'undefined' ? document.getElementById('sling-poyon-btn') : null;
    const bionEl = typeof document !== 'undefined' ? document.getElementById('sling-bion-btn') : null;

    let poyonX = width * 0.72;
    let bionX = width * 0.85;

    if (poyonEl) {
      const rect = poyonEl.getBoundingClientRect();
      poyonX = rect.left + rect.width / 2;
    } else if (lanePositions.length >= 5) {
      poyonX = lanePositions[4] + 80;
    }

    if (bionEl) {
      const rect = bionEl.getBoundingClientRect();
      bionX = rect.left + rect.width / 2;
    } else if (lanePositions.length >= 5) {
      bionX = lanePositions[4] + 160;
    }

    const targetY = calculatedTargetY;
    const spawnY = height * 0.12;

    // 1. ガイドレーン（光の道）の薄い描画（1〜5のレーンのみ！ POYON・BIONには線を描かない）
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
      const lx = lanePositions[i];
      ctx.beginPath();
      ctx.moveTo(lx, spawnY);
      ctx.lineTo(lx, targetY + 10);
      ctx.stroke();
    }

    // 2. 判定ラインのグロー（1〜5キーのライン）
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(lanePositions[0] - 25, targetY);
    ctx.lineTo(lanePositions[4] + 25, targetY);
    ctx.stroke();

    // 3. 降ってくるノーツの描画
    this.notes.forEach(n => {
      if (n.hit) return;

      const ny = spawnY + (targetY - spawnY) * n.yProgress;
      const isFever = this.sequencer.getMode() === 'fever';

      if (n.type === 'tap') {
        const nx = lanePositions[n.lane] || (width * 0.5);
        const radius = 18;

        // ノーツバブル（ペンタトニックのカラフルな光）
        const colors = ['#FFD538', '#FF6B8B', '#00E5FF', '#A15EFF', '#69F0AE'];
        const noteColor = colors[n.lane % colors.length];

        ctx.save();
        ctx.fillStyle = noteColor;
        ctx.shadowColor = noteColor;
        ctx.shadowBlur = isFever ? 14 : 8;

        ctx.beginPath();
        ctx.arc(nx, ny, radius, 0, Math.PI * 2);
        ctx.fill();

        // ノーツ内の数字（1〜5）
        ctx.fillStyle = '#185869';
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(n.lane + 1), nx, ny);
        ctx.restore();

      } else if (n.type === 'poyon') {
        // POYON ノーツ（線なしで POYON キーの真上から降ってくる）
        const nx = poyonX;
        const radius = 22;

        ctx.save();
        ctx.fillStyle = '#1dd1a1';
        ctx.shadowColor = '#1dd1a1';
        ctx.shadowBlur = isFever ? 18 : 12;

        // ぷるぷるジェリーバブル
        ctx.beginPath();
        ctx.ellipse(nx, ny, radius * 1.15, radius * 0.95, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = '900 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('POYON', nx, ny - 2);
        ctx.font = '10px system-ui, sans-serif';
        ctx.fillText('🤏', nx, ny + 9);
        ctx.restore();

      } else if (n.type === 'bion') {
        // BION ノーツ（線なしで BION キーの真上から降ってくる）
        const nx = bionX;
        const radius = 26;

        ctx.save();
        ctx.fillStyle = '#ffd538';
        ctx.shadowColor = '#ff6b8b';
        ctx.shadowBlur = isFever ? 24 : 16;

        // パワフルなダブルリングバブル
        ctx.beginPath();
        ctx.arc(nx, ny, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ff6b8b';
        ctx.lineWidth = 3.5;
        ctx.stroke();

        ctx.fillStyle = '#185869';
        ctx.font = '900 12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('BION', nx, ny - 3);
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillText('🚀', nx, ny + 9);
        ctx.restore();
      }
    });

    // 4. 浮動スコア・判定テキストの描画
    this.floatingScores.forEach(f => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, f.alpha);
      ctx.fillStyle = f.color;
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 12;
      ctx.font = '900 24px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    });

    ctx.restore();
  }
}
