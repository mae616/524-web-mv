#!/usr/bin/env python3
"""
524の輪郭から一切の凹凸・ギザギザ・階段ノイズを排除し、
極めて滑らかなアニメーション品質のベクターSVGを生成するスクリプト。
ガウシアンブラーによるサブピクセル等値線抽出 ＆ 移動平均スプライン平滑化を適用。
"""
from PIL import Image, ImageFilter
import math

def trace_contour_from_grayscale(gray_img, threshold=128):
    """
    グレースケール画像の等値線（サブピクセル補間）を抽出
    """
    w, h = gray_img.size
    pixels = gray_img.load()

    # 水平・垂直方向のエッジ交点を検出
    # 各セル (x, y) - (x+1, y+1) におけるマーチングスクエア
    segments = []

    for y in range(h - 1):
        for x in range(w - 1):
            # 4隅の値
            v00 = pixels[x, y]
            v10 = pixels[x + 1, y]
            v11 = pixels[x + 1, y + 1]
            v01 = pixels[x, y + 1]

            # 2値化コード
            c = 0
            if v00 >= threshold: c |= 1
            if v10 >= threshold: c |= 2
            if v11 >= threshold: c |= 4
            if v01 >= threshold: c |= 8

            if c == 0 or c == 15:
                continue

            # サブピクセル交点計算
            def lerp_p(p1, p2, v1, v2):
                if abs(v2 - v1) < 1e-5:
                    t = 0.5
                else:
                    t = (threshold - v1) / (v2 - v1)
                t = max(0.0, min(1.0, t))
                return (p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t)

            top = lerp_p((x, y), (x + 1, y), v00, v10)
            right = lerp_p((x + 1, y), (x + 1, y + 1), v10, v11)
            bottom = lerp_p((x, y + 1), (x + 1, y + 1), v01, v11)
            left = lerp_p((x, y), (x, y + 1), v00, v01)

            # ケースごとの線分追加
            if c in (1, 14): segments.append((left, top))
            elif c in (2, 13): segments.append((top, right))
            elif c in (3, 12): segments.append((left, right))
            elif c in (4, 11): segments.append((right, bottom))
            elif c in (5, 10):
                segments.append((left, top))
                segments.append((right, bottom))
            elif c in (6, 9): segments.append((top, bottom))
            elif c in (7, 8): segments.append((left, bottom))

    # 線分をつなげて連続ループにする
    loops = []
    if not segments:
        return loops

    # 空間インデックスによる高速結合
    tolerance = 1.2
    used = [False] * len(segments)

    for i in range(len(segments)):
        if used[i]:
            continue

        loop = [segments[i][0], segments[i][1]]
        used[i] = True

        while True:
            last = loop[-1]
            found = False
            best_idx = -1
            best_dist = 9999
            reverse_seg = False

            for j in range(len(segments)):
                if used[j]:
                    continue
                p1, p2 = segments[j]
                d1 = math.hypot(last[0] - p1[0], last[1] - p1[1])
                d2 = math.hypot(last[0] - p2[0], last[1] - p2[1])

                if d1 < tolerance and d1 < best_dist:
                    best_dist = d1
                    best_idx = j
                    reverse_seg = False
                elif d2 < tolerance and d2 < best_dist:
                    best_dist = d2
                    best_idx = j
                    reverse_seg = True

            if best_idx >= 0:
                used[best_idx] = True
                p1, p2 = segments[best_idx]
                if reverse_seg:
                    loop.append(p1)
                else:
                    loop.append(p2)
                found = True

            if not found or math.hypot(loop[0][0] - loop[-1][0], loop[0][1] - loop[-1][1]) < 0.8:
                break

        if len(loop) > 20: # ノイズ除去
            loops.append(loop)

    return loops

def smooth_polyline(points, window_size=9, iterations=2):
    """
    移動平均＋ガウシアン重み付けによる頂点平滑化（ジッターの完全除去）
    """
    pts = list(points)
    n = len(pts)
    if n < window_size:
        return pts

    half = window_size // 2

    for _ in range(iterations):
        new_pts = []
        for i in range(n):
            sx = 0.0
            sy = 0.0
            weight_sum = 0.0
            for k in range(-half, half + 1):
                idx = (i + k) % n
                # ガウシアン風重み
                w = math.exp(-0.5 * (k / (half * 0.5)) ** 2)
                sx += pts[idx][0] * w
                sy += pts[idx][1] * w
                weight_sum += w
            new_pts.append((sx / weight_sum, sy / weight_sum))
        pts = new_pts

    return pts

def chaikin_subdivide(points, iterations=2):
    """Chaikin細分化"""
    pts = list(points)
    for _ in range(iterations):
        new_pts = []
        n = len(pts)
        for i in range(n):
            p0 = pts[i]
            p1 = pts[(i + 1) % n]
            new_pts.append((p0[0] * 0.75 + p1[0] * 0.25, p0[1] * 0.75 + p1[1] * 0.25))
            new_pts.append((p0[0] * 0.25 + p1[0] * 0.75, p0[1] * 0.25 + p1[1] * 0.75))
        pts = new_pts
    return pts

def loop_to_path_d(loop):
    if not loop:
        return ""
    # 移動平均平滑化
    smoothed = smooth_polyline(loop, window_size=9, iterations=3)
    # Chaikinでなめらかに細分化
    subdivided = chaikin_subdivide(smoothed, iterations=2)

    d = f"M {subdivided[0][0]:.2f} {subdivided[0][1]:.2f}"
    for pt in subdivided[1:]:
        d += f" L {pt[0]:.2f} {pt[1]:.2f}"
    d += " Z"
    return d

def main():
    img = Image.open('public/assets/524_character.png').convert('RGBA')
    w, h = img.size
    pixels = img.load()

    # 各パーツのマスク画像を作成
    mask_body = Image.new('L', (w, h), 0)
    mask_outline = Image.new('L', (w, h), 0)
    mask_eyes = Image.new('L', (w, h), 0)
    mask_numbers = Image.new('L', (w, h), 0)
    mask_mouth = Image.new('L', (w, h), 0)
    mask_droplets = Image.new('L', (w, h), 0)

    p_body = mask_body.load()
    p_outline = mask_outline.load()
    p_eyes = mask_eyes.load()
    p_num = mask_numbers.load()
    p_mouth = mask_mouth.load()
    p_drop = mask_droplets.load()

    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a < 40:
                continue

            # 外周のアウトライン（エメラルド〜シアン系）
            is_outline_color = (g > 150 and b > 140 and r < 140) or (g > 140 and r < 80)
            if is_outline_color:
                p_outline[x, y] = 255

            # ボディ（外周含む全体）
            p_body[x, y] = 255

            # 白目
            if r > 210 and g > 210 and b > 200:
                p_eyes[x, y] = 255
            # 数字（オレンジ）
            elif r > 185 and g < 155 and b < 110:
                p_num[x, y] = 255
            # 口（ティール）
            elif r < 85 and g > 75 and b > 80:
                p_mouth[x, y] = 255
            # 右下の水滴
            elif y > 200 and x > 150 and r > 180 and g > 150:
                p_drop[x, y] = 255

    # ガウシアンブラーをかけて階段ノイズを完全に溶かす（半径2.2px）
    smooth_body = mask_body.filter(ImageFilter.GaussianBlur(radius=2.2))
    smooth_eyes = mask_eyes.filter(ImageFilter.GaussianBlur(radius=1.8))
    smooth_num = mask_numbers.filter(ImageFilter.GaussianBlur(radius=1.2))
    smooth_mouth = mask_mouth.filter(ImageFilter.GaussianBlur(radius=1.5))
    smooth_drop = mask_droplets.filter(ImageFilter.GaussianBlur(radius=1.5))

    # 各パーツの等値線をトレース
    body_loops = trace_contour_from_grayscale(smooth_body, threshold=120)
    eyes_loops = trace_contour_from_grayscale(smooth_eyes, threshold=120)
    num_loops = trace_contour_from_grayscale(smooth_num, threshold=120)
    mouth_loops = trace_contour_from_grayscale(smooth_mouth, threshold=120)
    drop_loops = trace_contour_from_grayscale(smooth_drop, threshold=120)

    # 最大のループ（メイン外形）をソート
    body_loops.sort(key=lambda l: len(l), reverse=True)
    eyes_loops.sort(key=lambda l: len(l), reverse=True)
    num_loops.sort(key=lambda l: len(l), reverse=True)
    mouth_loops.sort(key=lambda l: len(l), reverse=True)
    drop_loops.sort(key=lambda l: len(l), reverse=True)

    d_body = " ".join([loop_to_path_d(l) for l in body_loops[:2]])
    d_eyes = " ".join([loop_to_path_d(l) for l in eyes_loops[:4]])
    d_num = " ".join([loop_to_path_d(l) for l in num_loops[:6]])
    d_mouth = " ".join([loop_to_path_d(l) for l in mouth_loops[:2]])
    d_drop = " ".join([loop_to_path_d(l) for l in drop_loops[:4]])

    svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">
  <defs>
    <!-- 外周エメラルド枠線のフィルター -->
    <filter id="outline-glow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.8" flood-color="#18B8A6" flood-opacity="0.85" />
    </filter>
  </defs>

  <!-- エメラルドグリーンの外周線（原図に忠実な縁取り） -->
  <path id="body-outline" fill="#18B8A6" stroke="#18B8A6" stroke-width="4.5" stroke-linejoin="round" stroke-linecap="round" d="{d_body}" />

  <!-- 524 Yellow Body (Ultra-smooth) -->
  <path id="body" fill="#FFDA29" d="{d_body}" />

  <!-- 3-Bubble White Eyes -->
  <path id="eyes-bubble" fill="#FFFDF6" d="{d_eyes}" />

  <!-- Orange Numbers (5 2 4) -->
  <path id="numbers" fill="#F26B38" d="{d_num}" />

  <!-- Teal Mouth -->
  <path id="mouth" fill="#186270" d="{d_mouth}" />

  <!-- Droplets -->
  <path id="droplets" fill="#FFDA29" stroke="#18B8A6" stroke-width="2" d="{d_drop}" />
</svg>
'''

    with open('public/assets/524_character.svg', 'w') as f:
        f.write(svg_content)
    with open('doc/input/design/assets/524_character.svg', 'w') as f:
        f.write(svg_content)

    print("Ultra-smooth Subpixel SVG generated successfully!")

if __name__ == '__main__':
    main()
