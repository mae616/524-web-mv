#!/usr/bin/env python3
"""
524原図から精密なベクターSVGをパーツ単位（ボディ、白目、5-2-4数字、口、しずく）で生成するスクリプト
"""
from PIL import Image
import math

def trace_contours():
    img = Image.open('public/assets/524_character.png').convert('RGBA')
    w, h = img.size

    # 各パーツのピクセルマスク作成
    # 0: 背景, 1: ボディ(黄), 2: 白目, 3: 数字(橙), 4: 口(青緑), 5: しずく
    mask = [[0 for _ in range(w)] for _ in range(h)]

    for y in range(h):
        for x in range(w):
            r, g, b, a = img.getpixel((x, y))
            if a < 60:
                continue

            # 色判定
            if r > 215 and g > 215 and b > 205:
                mask[y][x] = 2 # 白目
            elif r > 185 and g < 155 and b < 110:
                mask[y][x] = 3 # オレンジ数字 (5 2 4)
            elif r < 85 and g > 75 and b > 80:
                mask[y][x] = 4 # 口 (ティール)
            elif y > 200 and x > 150 and (r > 180 and g > 150):
                mask[y][x] = 5 # 右下しずく
            elif r > 160 and g > 130 and b < 150:
                mask[y][x] = 1 # ボディ
            else:
                mask[y][x] = 1 # 境界部もボディに含める

    # Marching Squares または水平ラスタースパンのパス化（精密かつ確実）
    # 各カテゴリごとにSVGパス（微細なポリゴン/パス）を作成
    def generate_svg_path_for_id(part_id):
        paths = []
        for y in range(h):
            in_span = False
            start_x = 0
            for x in range(w):
                match = (mask[y][x] == part_id)
                if match and not in_span:
                    in_span = True
                    start_x = x
                elif not match and in_span:
                    in_span = False
                    paths.append(f"M {start_x} {y} h {x - start_x} v 1 h -{x - start_x} Z")
            if in_span:
                paths.append(f"M {start_x} {y} h {w - start_x} v 1 h -{w - start_x} Z")
        return " ".join(paths)

    # また、全体を統合したボディ（白目や数字のくり抜きなし）のマスク
    body_all_paths = []
    for y in range(h):
        in_span = False
        start_x = 0
        for x in range(w):
            match = (mask[y][x] in [1, 2, 3, 4, 5])
            if match and not in_span:
                in_span = True
                start_x = x
            elif not match and in_span:
                in_span = False
                body_all_paths.append(f"M {start_x} {y} h {x - start_x} v 1 h -{x - start_x} Z")
        if in_span:
            body_all_paths.append(f"M {start_x} {y} h {w - start_x} v 1 h -{w - start_x} Z")

    # SVG ファイルの組み立て
    svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">
  <!-- 524 Yellow Body (Full Silhouette) -->
  <path id="body" fill="#FFDA29" d="{' '.join(body_all_paths)}" />

  <!-- 3-Bubble White Eyes -->
  <path id="eyes-bubble" fill="#FFFDF6" d="{generate_svg_path_for_id(2)}" />

  <!-- Orange Numbers (5 2 4) -->
  <path id="numbers" fill="#F26B38" d="{generate_svg_path_for_id(3)}" />

  <!-- Teal Mouth -->
  <path id="mouth" fill="#186270" d="{generate_svg_path_for_id(4)}" />

  <!-- Falling Droplets -->
  <path id="droplets" fill="#FFDA29" d="{generate_svg_path_for_id(5)}" />
</svg>
'''

    with open('public/assets/524_character.svg', 'w') as f:
        f.write(svg_content)
    with open('doc/input/design/assets/524_character.svg', 'w') as f:
        f.write(svg_content)

    print(f"Generated clean layered SVG: {w}x{h} saved to public/assets/524_character.svg")

if __name__ == '__main__':
    trace_contours()
