import { lerp } from '../utils/math';

export interface Droplet {
  x: number;
  y: number;
  vy: number;
  radius: number;
  alpha: number;
  isFalling: boolean;
  splashed: boolean;
}

export interface Ripple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
}

/**
 * 524 キャラクター物理＆アニメーションエンジン
 * 原図「524_character.png」のピクセル完全な手描きデザインをベースに、
 * Squash & Stretch、浮遊、スリングショット、視線追従、しずく物理を適用
 */
export class Character524 {
  // 基本位置とサイズ
  public x: number = 0;
  public y: number = 0;
  public baseRadius: number = 135;

  // 原図スプライト画像
  private charImage: HTMLImageElement | null = null;
  private isImageLoaded: boolean = false;

  // 変形スケール（Squash & Stretch）
  public scaleX: number = 1.0;
  public scaleY: number = 1.0;

  // 浮遊オフセット
  private floatTime: number = 0;
  public floatY: number = 0;
  public rotation: number = 0;

  // ドラッグ＆スリングショット物理
  public isDragging: boolean = false;
  private dragStartX: number = 0;
  private dragStartY: number = 0;
  public dragOffsetX: number = 0;
  public dragOffsetY: number = 0;
  private releaseVelocityX: number = 0;
  private releaseVelocityY: number = 0;

  // 視線・マウス追従
  public lookAtX: number = 0;
  public lookAtY: number = 0;
  private currentEyeOffsetX: number = 0;
  private currentEyeOffsetY: number = 0;

  // 目の跳ねアニメーション
  public eyeJumps: [number, number, number] = [0, 0, 0];
  public isBlinking: boolean = false;
  private blinkTimer: number = 0;

  // 口の変形（0: 通常, 1: 歌う/開口）
  public mouthShape: number = 0;

  // しずく（ドロップレット）と波紋
  public droplets: Droplet[] = [];
  public ripples: Ripple[] = [];

  // 原作忠実カラー
  public colors = {
    body: '#FFDA29',
    mouthTeal: '#186270',
    shadowTeal: 'rgba(40, 130, 155, 0.45)',
  };

  constructor(x: number, y: number, radius: number = 135) {
    this.x = x;
    this.y = y;
    this.baseRadius = radius;

    this.loadImage();
    this.resetDroplets();
  }

  private loadImage(): void {
    const img = new Image();
    const baseUrl = import.meta.env.BASE_URL || './';
    const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    img.src = `${cleanBase}assets/524_character.svg`;
    img.onload = () => {
      this.charImage = img;
      this.isImageLoaded = true;
    };
  }

  public setPosition(x: number, y: number, radius: number): void {
    this.x = x;
    this.y = y;
    this.baseRadius = radius;
  }

  private resetDroplets(): void {
    // 原図のしずく位置（右下の2つのしずく）
    this.droplets = [
      { x: this.baseRadius * 0.46, y: this.baseRadius * 0.88, vy: 0, radius: 9, alpha: 0.95, isFalling: false, splashed: false },
      { x: this.baseRadius * 0.58, y: this.baseRadius * 1.05, vy: 0, radius: 6.5, alpha: 0.9, isFalling: false, splashed: false },
    ];
  }

  /**
   * ビート同期のバウンス（キックやスネアで呼び出し）
   */
  public triggerBounce(intensity: number = 1.0): void {
    if (this.isDragging) return;
    // 弾むSquash & Stretch
    this.scaleX = 1.0 + 0.18 * intensity;
    this.scaleY = 1.0 - 0.15 * intensity;
    this.floatY -= 14 * intensity;

    this.eyeJumps[0] = 10 * intensity;
    setTimeout(() => { this.eyeJumps[1] = 12 * intensity; }, 35);
    setTimeout(() => { this.eyeJumps[2] = 10 * intensity; }, 70);

    this.mouthShape = 0.8;
  }

  /**
   * しずくを落とす
   */
  public dropSingleDroplet(): boolean {
    const candidate = this.droplets.find(d => !d.isFalling);
    if (candidate) {
      candidate.isFalling = true;
      candidate.vy = 2;
      return true;
    }
    if (this.droplets.length < 5) {
      this.droplets.push({
        x: (this.baseRadius * 0.48) + (Math.random() * 16 - 8),
        y: this.baseRadius * 0.88,
        vy: 2.5,
        radius: 8,
        alpha: 0.95,
        isFalling: true,
        splashed: false,
      });
      return true;
    }
    return false;
  }

  /**
   * ドラッグ開始
   */
  public startDrag(clientX: number, clientY: number): boolean {
    const dx = clientX - (this.x + this.dragOffsetX);
    const dy = clientY - (this.y + this.floatY + this.dragOffsetY);
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < this.baseRadius * 1.25) {
      this.isDragging = true;
      this.dragStartX = clientX;
      this.dragStartY = clientY;
      return true;
    }
    return false;
  }

  /**
   * ドラッグ中
   */
  public updateDrag(clientX: number, clientY: number): void {
    if (!this.isDragging) return;
    this.dragOffsetX = (clientX - this.dragStartX) * 0.7;
    this.dragOffsetY = (clientY - this.dragStartY) * 0.7;

    const dragDist = Math.sqrt(this.dragOffsetX * this.dragOffsetX + this.dragOffsetY * this.dragOffsetY);
    const stretch = Math.min(0.5, dragDist / 280);
    this.scaleX = 1.0 - stretch * 0.25;
    this.scaleY = 1.0 + stretch * 0.45;
    this.rotation = (this.dragOffsetX / 280) * 0.25;
  }

  /**
   * ドラッグ終了（スリングショット）
   */
  public endDrag(): { tension: number } | null {
    if (!this.isDragging) return null;
    this.isDragging = false;

    const dragDist = Math.sqrt(this.dragOffsetX * this.dragOffsetX + this.dragOffsetY * this.dragOffsetY);
    const tension = Math.min(1.0, dragDist / 200);

    this.releaseVelocityX = -this.dragOffsetX * 0.28;
    this.releaseVelocityY = -this.dragOffsetY * 0.28;

    this.scaleX = 1.0 + tension * 0.35;
    this.scaleY = 1.0 - tension * 0.28;

    return { tension };
  }

  /**
   * 毎フレームの物理更新
   */
  public update(dt: number, audioIntensity: number = 0): void {
    this.floatTime += dt * 2.2;

    if (!this.isDragging) {
      // ジブリ的自然浮遊・呼吸
      const naturalBreath = Math.sin(this.floatTime) * 12;
      this.floatY = lerp(this.floatY, naturalBreath, dt * 5);
      this.rotation = lerp(this.rotation, Math.sin(this.floatTime * 0.5) * 0.03, dt * 4);

      // スプリング復元
      this.scaleX = lerp(this.scaleX, 1.0 + audioIntensity * 0.06, dt * 8);
      this.scaleY = lerp(this.scaleY, 1.0 + audioIntensity * 0.06, dt * 8);

      if (Math.abs(this.dragOffsetX) > 0.1 || Math.abs(this.dragOffsetY) > 0.1) {
        this.dragOffsetX += this.releaseVelocityX;
        this.dragOffsetY += this.releaseVelocityY;
        this.releaseVelocityX = (this.releaseVelocityX - this.dragOffsetX * 0.16) * 0.82;
        this.releaseVelocityY = (this.releaseVelocityY - this.dragOffsetY * 0.16) * 0.82;
      } else {
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;
      }
    }

    // 視線追従
    const targetEyeX = ((this.lookAtX - this.x) / (window.innerWidth || 1000)) * 12;
    const targetEyeY = ((this.lookAtY - this.y) / (window.innerHeight || 800)) * 8;
    this.currentEyeOffsetX = lerp(this.currentEyeOffsetX, targetEyeX, dt * 8);
    this.currentEyeOffsetY = lerp(this.currentEyeOffsetY, targetEyeY, dt * 8);

    // まばたきタイマー
    this.blinkTimer += dt;
    if (this.blinkTimer > 3.8 + Math.sin(this.floatTime) * 1.5) {
      this.isBlinking = true;
      if (this.blinkTimer > 4.05 + Math.sin(this.floatTime) * 1.5) {
        this.isBlinking = false;
        this.blinkTimer = 0;
      }
    }

    for (let i = 0; i < 3; i++) {
      this.eyeJumps[i] = lerp(this.eyeJumps[i], 0, dt * 10);
    }
    this.mouthShape = lerp(this.mouthShape, 0, dt * 6);

    this.updateDroplets(dt);

    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.radius += dt * 80;
      r.alpha = lerp(r.alpha, 0, dt * 3.5);
      if (r.alpha < 0.02) {
        this.ripples.splice(i, 1);
      }
    }
  }

  private updateDroplets(dt: number): void {
    const floorY = this.baseRadius * 1.6;
    for (let i = 0; i < this.droplets.length; i++) {
      const d = this.droplets[i];
      if (d.isFalling) {
        d.vy += 460 * dt;
        d.y += d.vy * dt;

        if (d.y >= floorY && !d.splashed) {
          d.splashed = true;
          d.alpha = 0;
          this.ripples.push({
            x: this.x + this.dragOffsetX + d.x,
            y: this.y + floorY,
            radius: 5,
            maxRadius: 38,
            alpha: 0.65,
          });
          setTimeout(() => {
            d.isFalling = false;
            d.splashed = false;
            d.y = i === 0 ? this.baseRadius * 0.88 : this.baseRadius * 1.05;
            d.vy = 0;
            d.alpha = 0.9;
          }, 1200 + i * 400);
        }
      }
    }
  }

  /**
   * Canvasレンダリング
   */
  public draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();

    const currentX = this.x + this.dragOffsetX;
    const currentY = this.y + this.floatY + this.dragOffsetY;
    const r = this.baseRadius;

    // --- A. 床の影（原図に忠実なフラット楕円影） ---
    const shadowDist = 1.55 * r;
    const shadowScale = (1.0 - (this.floatY / 140)) * this.scaleX;
    const shadowAlpha = Math.max(0.15, 0.45 - (this.floatY / 280));

    ctx.save();
    ctx.translate(currentX, this.y + shadowDist);
    ctx.scale(shadowScale, shadowScale * 0.16);
    ctx.beginPath();
    // 原作の影のプロポーション（横幅約130、高さ約16）
    ctx.arc(0, 0, r * 0.68, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(40, 130, 155, ${shadowAlpha})`;
    ctx.fill();
    ctx.restore();

    // 波紋の描画
    this.drawRipples(ctx);

    // --- B. 524 本体描画 ---
    ctx.translate(currentX, currentY);
    ctx.rotate(this.rotation);
    ctx.scale(this.scaleX, this.scaleY);

    if (this.isImageLoaded && this.charImage) {
      // 原図スプライトの忠実な描画
      // 原作画像サイズ: 223x237
      const drawWidth = r * 2.1;
      const drawHeight = drawWidth * (237 / 223);

      // 視線・マウス追従の微細オフセットを適用
      const eyeShiftX = this.currentEyeOffsetX * 0.35;
      const eyeShiftY = this.currentEyeOffsetY * 0.35;

      ctx.save();
      ctx.translate(eyeShiftX, eyeShiftY);

      // 原作スプライトを描画
      ctx.drawImage(
        this.charImage,
        -drawWidth / 2,
        -drawHeight / 2,
        drawWidth,
        drawHeight
      );

      // まばたきオーバーレイ（3つの目が個別に愛らしくパチッと閉じる）
      if (this.isBlinking) {
        // 3つの目の中心位置（原作SVG内の比率）
        const eyeY = -drawHeight * 0.08;
        const eyeCentersX = [-drawWidth * 0.24, 0, drawWidth * 0.25];
        const bubbleR = drawWidth * 0.125;

        // 1. 各目の数字「5」「2」「4」の部分だけを白い泡でパチッとカバー
        ctx.fillStyle = '#FFFDF6';
        eyeCentersX.forEach(cx => {
          ctx.beginPath();
          ctx.arc(cx, eyeY, bubbleR, 0, Math.PI * 2);
          ctx.fill();
        });

        // 2. 3つの目にそれぞれ個別の閉じたライン（にっこり目 ^ ^ ^）を描く
        ctx.strokeStyle = this.colors.mouthTeal;
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        eyeCentersX.forEach(cx => {
          ctx.beginPath();
          // 笑顔・ウィンク風のアーチ（^）
          ctx.arc(cx, eyeY + 2, bubbleR * 0.55, Math.PI * 1.15, Math.PI * 1.85, false);
          ctx.stroke();
        });
      }

      ctx.restore();
    } else {
      // フォールバックベジエ
      this.drawFallback(ctx, r);
    }

    // 落下中のドロップレットのみ追加描画
    this.drawFallingDroplets(ctx);

    ctx.restore();
  }

  private drawFallingDroplets(ctx: CanvasRenderingContext2D): void {
    this.droplets.forEach(d => {
      if (d.isFalling && d.alpha > 0.01) {
        ctx.save();
        ctx.fillStyle = this.colors.body;
        ctx.globalAlpha = d.alpha;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    });
  }

  private drawRipples(ctx: CanvasRenderingContext2D): void {
    this.ripples.forEach(r => {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, r.radius, r.radius * 0.26, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 255, 255, ${r.alpha * 0.75})`;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.restore();
    });
  }

  private drawFallback(ctx: CanvasRenderingContext2D, r: number): void {
    ctx.fillStyle = this.colors.body;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
  }
}
