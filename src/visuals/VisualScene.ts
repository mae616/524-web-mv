import { lerp } from '../utils/math';
import { PlayMode } from '../audio/MusicSequencer';

export interface FloatingLyric {
  text: string;
  x: number;
  y: number;
  scale: number;
  alpha: number;
  vx: number;
  vy: number;
  color: string;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  type: 'bubble' | 'star' | 'note';
}

/**
 * ビジュアルシーン: MV演出、背景、パーティクル、タイポグラフィ、カメラワーク
 */
export class VisualScene {
  private width: number = 0;
  private height: number = 0;

  // カメラワーク
  public cameraZoom: number = 1.0;
  private targetCameraZoom: number = 1.0;
  public cameraShake: number = 0;

  // 背景カラーパルス
  private bgPulse: number = 0;

  // エフェクトオブジェクト
  public particles: Particle[] = [];
  public lyrics: FloatingLyric[] = [];

  // 定期リリックキュー
  private lyricPhrases = ['5 - 2 - 4', 'POYON !', 'BOUNCE !', 'FEEL THE GROOVE', 'LET\'S DANCE', '524 BEAT'];
  private lyricIndex = 0;

  constructor(width: number, height: number) {
    this.resize(width, height);
  }

  public resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  /**
   * ビート時のカメラズーム＆パルス
   */
  public triggerBeat(isDownbeat: boolean, mode: PlayMode): void {
    this.cameraZoom = isDownbeat ? 1.03 : 1.015;
    this.bgPulse = isDownbeat ? 1.0 : 0.5;

    // ダウンビートでたまにリリック発現
    if (isDownbeat && Math.random() > 0.4) {
      this.spawnLyric(this.lyricPhrases[this.lyricIndex % this.lyricPhrases.length], mode);
      this.lyricIndex++;
    }

    // パーティクル発生
    const count = isDownbeat ? (mode === 'fever' ? 15 : 6) : 2;
    for (let i = 0; i < count; i++) {
      this.spawnParticle(mode);
    }
  }

  /**
   * フィーバー突入時の大爆発
   */
  public triggerFeverBurst(): void {
    this.cameraShake = 12;
    this.cameraZoom = 1.08;
    this.spawnLyric('★ FEVER TIME ★', 'fever', this.width / 2, this.height * 0.28, true);

    for (let i = 0; i < 35; i++) {
      this.spawnParticle('fever');
    }
  }

  /**
   * リリックポップ
   */
  public spawnLyric(text: string, mode: PlayMode, x?: number, y?: number, big: boolean = false): void {
    const posX = x ?? (this.width * 0.2 + Math.random() * this.width * 0.6);
    const posY = y ?? (this.height * 0.35 + Math.random() * this.height * 0.3);

    const colors = mode === 'fever'
      ? ['#FFD538', '#FF6B8B', '#FFFDF6', '#00F0FF']
      : ['#FFFDF6', '#FFD538', '#F26B38'];

    this.lyrics.push({
      text,
      x: posX,
      y: posY,
      scale: big ? 1.8 : 0.8,
      alpha: 1.0,
      vx: (Math.random() - 0.5) * 30,
      vy: -60 - Math.random() * 40,
      color: colors[Math.floor(Math.random() * colors.length)],
    });
  }

  /**
   * パーティクル生成
   */
  public spawnParticle(mode: PlayMode): void {
    const types: ('bubble' | 'star' | 'note')[] = ['bubble', 'star', 'note'];
    const type = types[Math.floor(Math.random() * types.length)];

    const colors = mode === 'fever'
      ? ['#FFD538', '#FF4E78', '#00E5FF', '#FFFDF6', '#A15EFF']
      : ['#FFFDF6', '#FFE57F', '#80DEEA', '#FFAB91'];

    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * (mode === 'fever' ? 180 : 90);

    this.particles.push({
      x: this.width * 0.5 + (Math.random() - 0.5) * 160,
      y: this.height * 0.5 + (Math.random() - 0.5) * 160,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 25,
      radius: mode === 'fever' ? 5 + Math.random() * 8 : 4 + Math.random() * 5,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 1.0,
      life: 0,
      maxLife: 1.2 + Math.random() * 1.0,
      type,
    });
  }

  /**
   * 毎フレームの更新
   */
  public update(dt: number, mode: PlayMode, audioMetrics: { bass: number; mid: number; treble: number }): void {
    // カメラズームのスプリング減衰（フィーバー時はオーディオ高音で微細振動）
    const targetZoom = this.targetCameraZoom + (mode === 'fever' ? audioMetrics.treble * 0.03 : 0);
    this.cameraZoom = lerp(this.cameraZoom, targetZoom, dt * 6);
    this.cameraShake = lerp(this.cameraShake, 0, dt * 8);

    // 背景パルス減衰
    this.bgPulse = lerp(this.bgPulse, 0, dt * 4);

    // パーティクル更新
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 25 * dt; // 微小な浮遊感/重力
      p.alpha = Math.max(0, 1.0 - p.life / p.maxLife);

      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
      }
    }

    // リリック更新
    for (let i = this.lyrics.length - 1; i >= 0; i--) {
      const l = this.lyrics[i];
      l.x += l.vx * dt;
      l.y += l.vy * dt;
      l.scale = lerp(l.scale, 1.0, dt * 4);
      l.alpha = lerp(l.alpha, 0, dt * 1.5);

      if (l.alpha < 0.02) {
        this.lyrics.splice(i, 1);
      }
    }
  }

  /**
   * 背景と演出の描画
   */
  public drawBackground(ctx: CanvasRenderingContext2D, mode: PlayMode, audioBass: number): void {
    const w = this.width;
    const h = this.height;

    // モードに応じたグラデーション
    let topColor = '#38B6D8';
    let bottomColor = '#25829C';

    if (mode === 'chill') {
      topColor = '#4CA3C4';
      bottomColor = '#1F5E72';
    } else if (mode === 'fever') {
      topColor = '#4B2A75';
      bottomColor = '#1A6D88';
    }

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, topColor);
    grad.addColorStop(1, bottomColor);

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // オーディオ低音（キック）による中央の光パルス
    const pulseStrength = (this.bgPulse * 0.4 + audioBass * 0.6);
    if (pulseStrength > 0.05) {
      ctx.save();
      const glowGrad = ctx.createRadialGradient(
        w / 2, h / 2, 50,
        w / 2, h / 2, Math.max(w, h) * 0.6
      );
      glowGrad.addColorStop(0, `rgba(255, 255, 255, ${pulseStrength * 0.15})`);
      glowGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // ドットグリッドの背景（レトロフューチャー＆Web感）
    this.drawSubtleGrid(ctx, mode);
  }

  private drawSubtleGrid(ctx: CanvasRenderingContext2D, mode: PlayMode): void {
    ctx.save();
    const spacing = 50;
    const dotAlpha = mode === 'fever' ? 0.2 : 0.12;
    ctx.fillStyle = `rgba(255, 255, 255, ${dotAlpha})`;

    for (let x = spacing; x < this.width; x += spacing) {
      for (let y = spacing; y < this.height; y += spacing) {
        ctx.beginPath();
        ctx.arc(x, y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /**
   * 前景エフェクト（パーティクルとリリック）の描画
   */
  public drawForeground(ctx: CanvasRenderingContext2D): void {
    // 1. パーティクル
    this.particles.forEach((p) => {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;

      if (p.type === 'bubble') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'star') {
        ctx.font = `${Math.round(p.radius * 2.5)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✦', p.x, p.y);
      } else {
        ctx.font = `${Math.round(p.radius * 2.5)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('♪', p.x, p.y);
      }
      ctx.restore();
    });

    // 2. リリック / タイポグラフィ
    this.lyrics.forEach((l) => {
      ctx.save();
      ctx.globalAlpha = l.alpha;
      ctx.translate(l.x, l.y);
      ctx.scale(l.scale, l.scale);

      ctx.font = `900 ${Math.round(36)}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 縁取り
      ctx.strokeStyle = 'rgba(24, 82, 102, 0.4)';
      ctx.lineWidth = 6;
      ctx.strokeText(l.text, 0, 0);

      // 文字本体
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, 0, 0);

      ctx.restore();
    });
  }
}
