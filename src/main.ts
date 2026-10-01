import { AudioEngine } from './audio/AudioEngine';
import { MusicSequencer, PlayMode, BeatEvent } from './audio/MusicSequencer';
import { Character524 } from './character/Character524';
import { VisualScene } from './visuals/VisualScene';
import { RhythmGame } from './game/RhythmGame';

class App {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private audioEngine: AudioEngine;
  private sequencer: MusicSequencer;
  private character: Character524;
  private scene: VisualScene;
  private rhythmGame: RhythmGame;

  private lastTime: number = 0;
  private dpr: number = 1;
  private width: number = 0;
  private height: number = 0;

  // UI要素
  private startOverlay = document.getElementById('start-overlay') as HTMLElement;
  private startBtn = document.getElementById('start-btn') as HTMLButtonElement;
  private playPauseBtn = document.getElementById('play-pause-btn') as HTMLButtonElement;
  private playIcon = document.getElementById('play-icon') as HTMLElement;
  private muteBtn = document.getElementById('mute-btn') as HTMLButtonElement;
  private muteIcon = document.getElementById('mute-icon') as HTMLElement;
  private fullscreenBtn = document.getElementById('fullscreen-btn') as HTMLButtonElement;
  private modeButtons = document.querySelectorAll<HTMLButtonElement>('.dock-segment-btn');
  private eqBars = document.querySelectorAll<HTMLElement>('.eq-bar');

  // Duolingo風HUD要素 ＆ リズムパッド
  private heartsCount = document.getElementById('hearts-count') as HTMLElement;
  private comboCount = document.getElementById('combo-count') as HTMLElement;
  private scoreVal = document.getElementById('score-val') as HTMLElement;
  private grooveBar = document.getElementById('groove-bar') as HTMLElement;
  private rhythmPads = document.querySelectorAll<HTMLButtonElement>('.rhythm-pad');

  constructor() {
    this.canvas = document.getElementById('mv-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;

    this.audioEngine = new AudioEngine();
    this.sequencer = new MusicSequencer(this.audioEngine);
    this.character = new Character524(0, 0, 130);
    this.scene = new VisualScene(window.innerWidth, window.innerHeight);
    this.rhythmGame = new RhythmGame(this.audioEngine, this.sequencer, this.character, this.scene);

    this.initEvents();
    this.syncGameStateToHUD();
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // アニメーションループ開始
    this.lastTime = performance.now();
    requestAnimationFrame(this.renderLoop);
  }

  private resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;

    this.scene.resize(this.width, this.height);

    // キャラクターの配置（画面中央、スマホならサイズ調整）
    const isMobile = this.width < 600;
    const charRadius = isMobile ? Math.min(this.width * 0.28, 110) : 135;
    this.character.setPosition(this.width / 2, this.height * 0.48, charRadius);
  }

  private initEvents(): void {
    // 1. スタートボタン（オーディオアンロック）
    this.startBtn.addEventListener('click', async () => {
      await this.audioEngine.init();
      this.sequencer.start();
      this.startOverlay.classList.remove('active');
      this.playIcon.textContent = '⏸';
      this.character.triggerBounce(1.2);
      this.scene.spawnLyric('524 AWAKE !', this.sequencer.getMode());
    });

    // 2. 再生/一時停止
    this.playPauseBtn.addEventListener('click', async () => {
      await this.audioEngine.init();
      if (this.sequencer.getIsPlaying()) {
        this.sequencer.stop();
        this.playIcon.textContent = '▶';
      } else {
        this.sequencer.start();
        this.playIcon.textContent = '⏸';
      }
    });

    // 3. ミュート切替
    this.muteBtn.addEventListener('click', () => {
      const isMuted = this.audioEngine.toggleMute();
      this.muteIcon.textContent = isMuted ? '🔇' : '🔊';
    });

    // 4. モード切替
    this.modeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode as PlayMode;
        this.setMode(mode);
      });
    });

    // 5. フルスクリーン
    this.fullscreenBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });

    // 6. ビートイベントリスナー（音楽とキャラクター・演出の同期）
    this.sequencer.onStepCallbacks.push((ev: BeatEvent) => {
      // キックやスネアで524が跳ねる
      if (ev.isDownbeat) {
        this.character.triggerBounce(ev.intensity);
        this.scene.triggerBeat(true, this.sequencer.getMode());

        // フィーバー時は高確率でしずくが落ちる
        if (this.sequencer.getMode() === 'fever' && ev.step === 0) {
          const dropped = this.character.dropSingleDroplet();
          if (dropped) {
            this.audioEngine.triggerDroplet(1.2);
          }
        }
      } else if (ev.step % 2 === 0) {
        this.scene.triggerBeat(false, this.sequencer.getMode());
      }
    });

    // 7. マウス・タッチ操作（Pointer Events）
    this.canvas.addEventListener('pointerdown', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const hit = this.character.startDrag(x, y);
      if (!hit) {
        // 背景クリックでしずく落下＆ペンタトニックチャイム
        const dropped = this.character.dropSingleDroplet();
        if (dropped) {
          this.audioEngine.triggerDroplet(1.0);
        }
        // ランダム音階
        const noteIndex = Math.floor((x / this.width) * 5);
        this.rhythmGame.handleTapInput(noteIndex);
        if (this.rhythmPads[noteIndex]) {
          this.rhythmPads[noteIndex].classList.add('active');
          setTimeout(() => this.rhythmPads[noteIndex]?.classList.remove('active'), 120);
        }
      }
    });

    window.addEventListener('pointermove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // 視線追従
      this.character.lookAtX = x;
      this.character.lookAtY = y;

      // ドラッグ中なら引っ張り更新
      if (this.character.isDragging) {
        this.character.updateDrag(x, y);
      }

      // マウスX/Yによるリアルタイムオーディオエフェクトモジュレーション
      const normX = Math.max(0, Math.min(1, x / this.width));
      const normY = Math.max(0, Math.min(1, 1 - y / this.height));
      this.audioEngine.modulateEffects(normX, normY);
    });

    window.addEventListener('pointerup', () => {
      if (this.character.isDragging) {
        const result = this.character.endDrag();
        if (result && result.tension > 0.08) {
          // 引っ張りピョン（POYON）判定トリガー
          this.rhythmGame.handlePoyonInput();
          this.scene.spawnLyric('POYON !', this.sequencer.getMode(), this.character.x, this.character.y - 80);
          this.scene.cameraShake = 6 * result.tension;
        }
      }
    });

    // 8. 5レーン・タップパッド（1〜5）のタップ・クリック操作
    this.rhythmPads.forEach((pad) => {
      const lane = parseInt(pad.dataset.lane || '0', 10);
      const trigger = (e: Event) => {
        e.stopPropagation();
        this.rhythmGame.handleTapInput(lane);
        pad.classList.add('active');
        setTimeout(() => pad.classList.remove('active'), 120);
      };
      pad.addEventListener('pointerdown', trigger);
    });

    // 9. キーボードショートカット（1〜5, Space, F, M）
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;

      if (e.code === 'Space') {
        e.preventDefault();
        this.rhythmGame.handlePoyonInput();
      } else if (e.key >= '1' && e.key <= '5') {
        const idx = parseInt(e.key, 10) - 1;
        this.rhythmGame.handleTapInput(idx);
        if (this.rhythmPads[idx]) {
          this.rhythmPads[idx].classList.add('active');
          setTimeout(() => this.rhythmPads[idx]?.classList.remove('active'), 120);
        }
      } else if (e.key.toLowerCase() === 'f') {
        // フィーバー切替
        const nextMode = this.sequencer.getMode() === 'fever' ? 'groove' : 'fever';
        this.setMode(nextMode);
      } else if (e.key.toLowerCase() === 'm') {
        const isMuted = this.audioEngine.toggleMute();
        this.muteIcon.textContent = isMuted ? '🔇' : '🔊';
      }
    });

    // 10. 音ゲー状態更新コールバックの購読
    this.rhythmGame.onStateChange = () => {
      this.syncGameStateToHUD();
    };
  }

  /**
   * Duolingo風HUDへのゲーム状態同期
   */
  private syncGameStateToHUD(): void {
    if (this.heartsCount) {
      this.heartsCount.textContent = String(this.rhythmGame.hearts);
    }
    if (this.comboCount) {
      const prevCombo = parseInt(this.comboCount.textContent || '0', 10);
      this.comboCount.textContent = String(this.rhythmGame.combo);
      if (this.rhythmGame.combo > prevCombo && this.rhythmGame.combo > 0) {
        const badge = this.comboCount.closest('.stat-badge');
        badge?.classList.remove('bounce');
        void (badge as HTMLElement)?.offsetWidth; // reflow
        badge?.classList.add('bounce');
      }
    }
    if (this.scoreVal) {
      this.scoreVal.textContent = this.rhythmGame.score.toLocaleString();
    }
    if (this.grooveBar) {
      this.grooveBar.style.width = `${this.rhythmGame.grooveGauge}%`;
    }
  }

  private setMode(mode: PlayMode): void {
    this.sequencer.setMode(mode);
    this.character.isFeverAura = (mode === 'fever');
    this.modeButtons.forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });

    if (mode === 'fever') {
      this.character.triggerDance(2.0);
      this.scene.triggerFeverBurst();
    } else {
      this.scene.spawnLyric(`${mode.toUpperCase()} MODE`, mode);
    }
  }

  /**
   * メインレンダリングループ（60fps / 120fps）
   */
  private renderLoop = (time: number): void => {
    const dt = Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;

    // オーディオ周波数解析データの取得
    const audioMetrics = this.audioEngine.getAudioMetrics();

    // ドック内のミニイコライザーバーのアニメーション
    if (this.eqBars.length >= 4) {
      const isPlaying = this.sequencer.getIsPlaying();
      this.eqBars[0].style.height = `${isPlaying ? Math.max(4, audioMetrics.bass * 22) : 4}px`;
      this.eqBars[1].style.height = `${isPlaying ? Math.max(4, audioMetrics.mid * 20) : 4}px`;
      this.eqBars[2].style.height = `${isPlaying ? Math.max(4, audioMetrics.treble * 18) : 4}px`;
      this.eqBars[3].style.height = `${isPlaying ? Math.max(4, audioMetrics.overall * 22) : 4}px`;
    }

    // 更新処理
    const mode = this.sequencer.getMode();
    this.character.update(dt, audioMetrics.overall);
    this.rhythmGame.update(dt);
    this.scene.update(dt, mode, audioMetrics);

    // 描画処理
    this.ctx.save();
    this.ctx.scale(this.dpr, this.dpr);

    // 1. カメラワーク（ズームと揺れ）
    const zoom = this.scene.cameraZoom;
    const shake = this.scene.cameraShake;
    const shakeX = (Math.random() - 0.5) * shake;
    const shakeY = (Math.random() - 0.5) * shake;

    this.ctx.translate(this.width / 2 + shakeX, this.height / 2 + shakeY);
    this.ctx.scale(zoom, zoom);
    this.ctx.translate(-this.width / 2, -this.height / 2);

    // 2. 背景グラデーション・パルス
    this.scene.drawBackground(this.ctx, mode, audioMetrics.bass);

    // 3. 524 キャラクター本体と影・しずく・波紋
    this.character.draw(this.ctx);

    // 4. 音ゲーノーツ・レーン・判定ライン・浮動スコア
    this.rhythmGame.draw(this.ctx, this.width, this.height);

    // 5. 前景パーティクル＆リリック
    this.scene.drawForeground(this.ctx);

    this.ctx.restore();

    requestAnimationFrame(this.renderLoop);
  };
}

// 起動
window.addEventListener('DOMContentLoaded', () => {
  new App();
});
