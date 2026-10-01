import { AudioEngine } from './audio/AudioEngine';
import { MusicSequencer, PlayMode, BeatEvent } from './audio/MusicSequencer';
import { Character524 } from './character/Character524';
import { VisualScene } from './visuals/VisualScene';
import { RhythmGame, GameResult, Difficulty } from './game/RhythmGame';

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
  private diffButtons = document.querySelectorAll<HTMLButtonElement>('.diff-btn');
  private playPauseBtn = document.getElementById('play-pause-btn') as HTMLButtonElement;
  private playIcon = document.getElementById('play-icon') as HTMLElement;
  private muteBtn = document.getElementById('mute-btn') as HTMLButtonElement;
  private muteIcon = document.getElementById('mute-icon') as HTMLElement;
  private fullscreenBtn = document.getElementById('fullscreen-btn') as HTMLButtonElement;
  private finishBtn = document.getElementById('finish-btn') as HTMLButtonElement | null;
  private modeButtons = document.querySelectorAll<HTMLButtonElement>('.dock-segment-btn');
  private eqBars = document.querySelectorAll<HTMLElement>('.eq-bar');

  // Duolingo風HUD要素 ＆ リズムパッド
  private heartsCount = document.getElementById('hearts-count') as HTMLElement;
  private comboCount = document.getElementById('combo-count') as HTMLElement;
  private scoreVal = document.getElementById('score-val') as HTMLElement;
  private grooveBar = document.getElementById('groove-bar') as HTMLElement;
  private rhythmPads = document.querySelectorAll<HTMLButtonElement>('.rhythm-pad');
  private slingPoyonBtn = document.getElementById('sling-poyon-btn') as HTMLButtonElement | null;
  private slingBionBtn = document.getElementById('sling-bion-btn') as HTMLButtonElement | null;

  // リザルト画面UI要素
  private resultOverlay = document.getElementById('result-overlay') as HTMLElement | null;
  private resultBadge = document.getElementById('result-badge') as HTMLElement | null;
  private resultDiffBadge = document.getElementById('result-diff-badge') as HTMLElement | null;
  private resultRank = document.getElementById('result-rank') as HTMLElement | null;
  private resultScoreNumber = document.getElementById('result-score-number') as HTMLElement | null;
  private resultBestBadge = document.getElementById('result-best-badge') as HTMLElement | null;
  private resultBestScore = document.getElementById('result-best-score') as HTMLElement | null;
  private resultMaxCombo = document.getElementById('result-max-combo') as HTMLElement | null;
  private resultHearts = document.getElementById('result-hearts') as HTMLElement | null;
  private resultPerfects = document.getElementById('result-perfects') as HTMLElement | null;
  private resultMisses = document.getElementById('result-misses') as HTMLElement | null;
  private shareXBtn = document.getElementById('share-x-btn') as HTMLButtonElement | null;
  private copyResultBtn = document.getElementById('copy-result-btn') as HTMLButtonElement | null;
  private copyBtnText = document.getElementById('copy-btn-text') as HTMLElement | null;
  private retryBtn = document.getElementById('retry-btn') as HTMLButtonElement | null;

  private latestResult: GameResult | null = null;

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

    // 1.5 難易度セレクター（EASY / NORMAL / HARD）
    this.diffButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const diff = (btn.dataset.diff || 'normal') as Difficulty;
        this.rhythmGame.setDifficulty(diff);
        this.diffButtons.forEach((b) => b.classList.toggle('active', b.dataset.diff === diff));
        this.audioEngine.triggerScaleNote(2);
      });
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
          // 引っ張りの強さに応じて POYON (小) または BION (大) を判定！
          this.rhythmGame.handleDragReleaseInput(result.tension);

          const targetBtn = result.tension < 0.45 ? this.slingPoyonBtn : this.slingBionBtn;
          targetBtn?.classList.add('active');
          setTimeout(() => targetBtn?.classList.remove('active'), 120);
        }
      }
    });

    // 8. 5レーン・タップパッド（1〜5）のタップ・クリック操作（スマホマルチタッチ最適化）
    this.rhythmPads.forEach((pad) => {
      const lane = parseInt(pad.dataset.lane || '0', 10);
      const trigger = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        this.rhythmGame.handleTapInput(lane);
        pad.classList.add('active');
        setTimeout(() => pad.classList.remove('active'), 120);
      };
      pad.addEventListener('pointerdown', trigger);
    });

    // 9. 引っ張りスリングボタン（POYON / BION）の操作
    this.slingPoyonBtn?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.rhythmGame.handlePoyonInput();
      this.slingPoyonBtn?.classList.add('active');
      setTimeout(() => this.slingPoyonBtn?.classList.remove('active'), 120);
    });

    this.slingBionBtn?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.rhythmGame.handleBionInput();
      this.slingBionBtn?.classList.add('active');
      setTimeout(() => this.slingBionBtn?.classList.remove('active'), 120);
    });

    // 10. キーボードショートカット（POYON/BION代替キー & ホームポジション対応）
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;

      const keyLower = e.key.toLowerCase();
      const code = e.code;

      // --- BION（大引き）の代替キー群 ---
      // Enter, 7, B, Shift+Space, ArrowDown, ArrowRight, NumpadEnter
      const isBionKey = code === 'Enter' ||
                        code === 'NumpadEnter' ||
                        e.key === '7' ||
                        keyLower === 'b' ||
                        code === 'ArrowDown' ||
                        code === 'ArrowRight' ||
                        (code === 'Space' && e.shiftKey);

      // --- POYON（ちょい引き）の代替キー群 ---
      // Space, 6, P, C, V, ArrowLeft
      const isPoyonKey = (code === 'Space' && !e.shiftKey) ||
                         e.key === '6' ||
                         keyLower === 'p' ||
                         keyLower === 'c' ||
                         keyLower === 'v' ||
                         code === 'ArrowLeft';

      if (isBionKey) {
        e.preventDefault();
        this.rhythmGame.handleBionInput();
        this.slingBionBtn?.classList.add('active');
        setTimeout(() => this.slingBionBtn?.classList.remove('active'), 120);
      } else if (isPoyonKey) {
        e.preventDefault();
        this.rhythmGame.handlePoyonInput();
        this.slingPoyonBtn?.classList.add('active');
        setTimeout(() => this.slingPoyonBtn?.classList.remove('active'), 120);
      } else if (e.key >= '1' && e.key <= '5') {
        const idx = parseInt(e.key, 10) - 1;
        this.rhythmGame.handleTapInput(idx);
        if (this.rhythmPads[idx]) {
          this.rhythmPads[idx].classList.add('active');
          setTimeout(() => this.rhythmPads[idx]?.classList.remove('active'), 120);
        }
      } else if (['a', 's', 'd', 'f', 'g'].includes(keyLower)) {
        // ホームポジション（A, S, D, F, G）による1〜5タップ
        const keyMap: Record<string, number> = { a: 0, s: 1, d: 2, f: 3, g: 4 };
        const idx = keyMap[keyLower];
        if (idx !== undefined) {
          this.rhythmGame.handleTapInput(idx);
          if (this.rhythmPads[idx]) {
            this.rhythmPads[idx].classList.add('active');
            setTimeout(() => this.rhythmPads[idx]?.classList.remove('active'), 120);
          }
        }
      } else if (keyLower === 'm') {
        const isMuted = this.audioEngine.toggleMute();
        this.muteIcon.textContent = isMuted ? '🔇' : '🔊';
      }
    });

    // 11. 音ゲー状態更新コールバックの購読
    this.rhythmGame.onStateChange = () => {
      this.syncGameStateToHUD();
    };

    // 12. 終了ボタン（🏁 リタイア・中断リザルト）
    this.finishBtn?.addEventListener('click', () => {
      if (this.sequencer.getIsPlaying()) {
        this.sequencer.stop();
        this.playIcon.textContent = '▶';
      }
      this.rhythmGame.finishEarly();
    });

    // 13. ゲームクリア＆リタイア時のリザルトモーダル表示
    this.rhythmGame.onGameClear = (result: GameResult) => {
      this.showResult(result);
    };

    this.rhythmGame.onGameRetire = (result: GameResult) => {
      this.showResult(result);
    };

    // 14. X（Twitter）共有ボタン
    this.shareXBtn?.addEventListener('click', () => {
      this.shareToX();
    });

    // 15. 結果コピーボタン
    this.copyResultBtn?.addEventListener('click', () => {
      this.copyResultText();
    });

    // 16. もう一度遊ぶ（リトライ）
    this.retryBtn?.addEventListener('click', async () => {
      this.resultOverlay?.classList.remove('active');
      this.sequencer.reset();
      this.rhythmGame.reset();
      this.syncGameStateToHUD();
      await this.audioEngine.init();
      this.sequencer.start();
      this.playIcon.textContent = '⏸';
      this.character.triggerBounce(1.5);
      this.scene.spawnLyric("RETRY ! KEEP GROOVING !", this.sequencer.getMode());
    });
  }

  /**
   * リザルトモーダルの表示（クリア時 ＆ リタイア時）
   */
  private showResult(result: GameResult): void {
    this.latestResult = result;
    this.playIcon.textContent = '▶';

    if (this.resultBadge) {
      if (result.isAllPerfect) {
        this.resultBadge.textContent = '🌈 ALL PERFECT !! 🌈';
        this.resultBadge.className = 'result-title-badge all-perfect';
      } else if (result.isFullCombo) {
        this.resultBadge.textContent = '🌟 FULL COMBO !! 🌟';
        this.resultBadge.className = 'result-title-badge full-combo';
      } else {
        this.resultBadge.textContent = result.isClear ? 'STAGE CLEAR !!' : 'SESSION RESULT';
        this.resultBadge.className = `result-title-badge ${result.isClear ? 'clear' : 'retire'}`;
      }
    }

    if (this.resultDiffBadge) {
      const diffUpper = result.difficulty.toUpperCase();
      this.resultDiffBadge.textContent = diffUpper;
      this.resultDiffBadge.className = `result-diff-pill ${result.difficulty}`;
    }

    if (this.resultRank) {
      this.resultRank.textContent = result.rank;
      this.resultRank.className = `rank-circle rank-${result.rank.toLowerCase()}`;
    }

    if (this.resultScoreNumber) {
      this.resultScoreNumber.textContent = result.score.toLocaleString();
    }

    if (this.resultBestBadge) {
      this.resultBestBadge.style.display = result.isNewBest ? 'inline-block' : 'none';
      if (result.isNewBest) {
        this.character.triggerDance(2.5);
      }
    }

    if (this.resultBestScore) {
      this.resultBestScore.textContent = result.highScore.toLocaleString();
    }

    if (this.resultMaxCombo) {
      this.resultMaxCombo.textContent = `${result.maxCombo} 🔥`;
    }

    if (this.resultHearts) {
      this.resultHearts.textContent = `${result.hearts} ❤️`;
    }

    if (this.resultPerfects) {
      this.resultPerfects.textContent = `${result.perfectCount} ✨`;
    }

    if (this.resultMisses) {
      this.resultMisses.textContent = `${result.missCount} 💤`;
    }

    this.resultOverlay?.classList.add('active');
  }

  /**
   * X（Twitter）へのスコア共有インテントURLオープン
   */
  private shareToX(): void {
    const res = this.latestResult;
    const diffUpper = (res?.difficulty || 'normal').toUpperCase();
    let badgeText = res?.isClear ? `🎉 STAGE CLEAR !! [${diffUpper}]` : `🏁 524 Web MV RESULT [${diffUpper}]`;
    if (res?.isAllPerfect) badgeText = `🌈 ALL PERFECT CLEAR !! [${diffUpper}]`;
    else if (res?.isFullCombo) badgeText = `🌟 FULL COMBO CLEAR !! [${diffUpper}]`;

    const rank = res?.rank || 'C';
    const score = (res?.score || 0).toLocaleString();
    const maxCombo = res?.maxCombo || 0;
    const perfects = res?.perfectCount || 0;
    const newBestTag = res?.isNewBest ? '\n👑 【自己ベスト新記録を更新！！】' : '';

    const text = `${badgeText}${newBestTag}
難易度: ${diffUpper}
ランク: [ ${rank} ]
スコア: ${score} pts (最大コンボ: ${maxCombo} 🔥 / PERFECT: ${perfects})
524と一緒にチル＆グルーヴ音ゲーを遊んだよ！みんなも自己ベストを目指して挑戦してみてね！✨`;

    const url = 'https://mae616.github.io/524-web-mv/';
    const hashtags = '524Beat,524_MV,音ゲー';
    const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}&hashtags=${encodeURIComponent(hashtags)}`;
    window.open(tweetUrl, '_blank', 'noopener,noreferrer');
  }

  /**
   * スコア結果をクリップボードにコピー
   */
  private async copyResultText(): Promise<void> {
    const res = this.latestResult;
    const diffUpper = (res?.difficulty || 'normal').toUpperCase();
    let badgeText = res?.isClear ? `🎉 STAGE CLEAR !! [${diffUpper}]` : `🏁 524 Web MV RESULT [${diffUpper}]`;
    if (res?.isAllPerfect) badgeText = `🌈 ALL PERFECT !! [${diffUpper}]`;
    else if (res?.isFullCombo) badgeText = `🌟 FULL COMBO !! [${diffUpper}]`;

    const rank = res?.rank || 'C';
    const score = (res?.score || 0).toLocaleString();
    const maxCombo = res?.maxCombo || 0;
    const newBestTag = res?.isNewBest ? ' 👑NEW BEST!' : '';

    const text = `${badgeText}${newBestTag}
難易度: ${diffUpper} / ランク: [ ${rank} ] / スコア: ${score} pts (最大コンボ: ${maxCombo} 🔥)
https://mae616.github.io/524-web-mv/
#524Beat #524_MV`;

    try {
      await navigator.clipboard.writeText(text);
      if (this.copyBtnText) {
        const originalText = this.copyBtnText.textContent;
        this.copyBtnText.textContent = 'コピー完了！✨';
        setTimeout(() => {
          if (this.copyBtnText) this.copyBtnText.textContent = originalText;
        }, 2000);
      }
    } catch (err) {
      console.error('クリップボードコピー失敗:', err);
    }
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
