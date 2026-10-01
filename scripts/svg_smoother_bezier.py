#!/usr/bin/env python3
"""
Chaikinの平滑化アルゴリズムを用いて、524の輪郭から一切の階段状ノイズを排除し、
アニメーション品質の滑らかなベジエ曲線パスを生成するスクリプト
"""
from PIL import Image
import math

def get_contours_for_mask(mask, w, h):
    """
    ピクセルマスクの境界線を抽出してループパスの座標リストを生成
    """
    # 各エッジ（水平・垂直）を収集
    # エッジは ((x1, y1), (x2, y2))
    edges = set()
    for y in range(h):
        for x in range(w):
            if mask[y][x]:
                # 4近傍をチェック
                # 上
                if y == 0 or not mask[y-1][x]:
                    edges.add(((x, y), (x + 1, y)))
                # 下
                if y == h - 1 or not mask[y+1][x]:
                    edges.add(((x + 1, y + 1), (x, y + 1)))
                # 左
                if x == 0 or not mask[y][x-1]:
                    edges.add(((x, y + 1), (x, y)))
                # 右
                if x == w - 1 or not mask[y][x+1]:
                    edges.add(((x + 1, y), (x + 1, y + 1)))

    # エッジをループに接続
    edge_map = {}
    for p1, p2 in edges:
        edge_map.setdefault(p1, []).append(p2)

    loops = []
    visited_edges = set()

    for start_p in list(edge_map.keys()):
        for next_p in edge_map[start_p]:
            if (start_p, next_p) in visited_edges:
                continue

            loop = [start_p]
            curr = next_p
            visited_edges.add((start_p, next_p))

            while curr != start_p and curr in edge_map:
                loop.append(curr)
                found = False
                for np in edge_map[curr]:
                    if (curr, np) not in visited_edges:
                        visited_edges.add((curr, np))
                        curr = np
                        found = True
                        break
                if not found:
                    break

            if len(loop) > 8: # 小さすぎるノイズは除去
                loops.append(loop)

    return loops

def chaikin_smooth(points, iterations=3):
    """
    Chaikinのアルゴリズムでポリゴンの角を丸め、有機的で滑らかなスプラインにする
    """
    for _ in range(iterations):
        new_points = []
        n = len(points)
        for i in range(n):
            p0 = points[i]
            p1 = points[(i + 1) % n]
            # 1/4 と 3/4 の位置に新しい点を挿入
            q = (p0[0] * 0.75 + p1[0] * 0.25, p0[1] * 0.75 + p1[1] * 0.25)
            r = (p0[0] * 0.25 + p1[0] * 0.75, p0[1] * 0.25 + p1[1] * 0.75)
            new_points.append(q)
            new_points.append(r)
        points = new_points
    return points

def loops_to_svg_path(loops):
    path_cmds = []
    for loop in loops:
        smoothed = chaikin_smooth(loop, iterations=3)
        if not smoothed:
            continue
        cmd = f"M {smoothed[0][0]:.2f} {smoothed[0][1]:.2f}"
        for pt in smoothed[1:]:
            cmd += f" L {pt[0]:.2f} {pt[1]:.2f}"
        cmd += " Z"
        path_cmds.append(cmd)
    return " ".join(path_cmds)

def main():
    img = Image.open('public/assets/524_character.png').convert('RGBA')
    w, h = img.size
    pixels = img.load()

    # マスクの作成
    # 1: ボディ全体
    # 2: 白目
    # 3: 数字
    # 4: 口
    # 5: しずく
    masks = {
        'body': [[False for _ in range(w)] for _ in range(h)],
        'eyes': [[False for _ in range(w)] for _ in range(h)],
        'numbers': [[False for _ in range(w)] for _ in range(h)],
        'mouth': [[False for _ in range(w)] for _ in range(h)],
        'droplets': [[False for _ in range(w)] for _ in range(h)],
    }

    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a < 70:
                continue

            masks['body'][y][x] = True

            if r > 215 and g > 215 and b > 205:
                masks['eyes'][y][x] = True
            elif r > 185 and g < 155 and b < 110:
                masks['numbers'][y][x] = True
            elif r < 85 and g > 75 and b > 80:
                masks['mouth'][y][x] = True
            elif y > 200 and x > 150 and r > 180 and g > 150:
                masks['droplets'][y][x] = True

    svg_parts = {}
    for part, m in masks.items():
        loops = get_contours_for_mask(m, w, h)
        svg_parts[part] = loops_to_svg_path(loops)

    svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">
  <!-- 524 Yellow Body (Smooth Vector Outline) -->
  <path id="body" fill="#FFDA29" d="{svg_parts['body']}" />

  <!-- 3-Bubble White Eyes -->
  <path id="eyes-bubble" fill="#FFFDF6" d="{svg_parts['eyes']}" />

  <!-- Orange Numbers (5 2 4) -->
  <path id="numbers" fill="#F26B38" d="{svg_parts['numbers']}" />

  <!-- Teal Mouth -->
  <path id="mouth" fill="#186270" d="{svg_parts['mouth']}" />

  <!-- Droplets -->
  <path id="droplets" fill="#FFDA29" d="{svg_parts['droplets']}" />
</svg>
'''
    with open('public/assets/524_character.svg', 'w') as f:
        f.write(svg_content)
    with open('doc/input/design/assets/524_character.svg', 'w') as f:
        f.write(svg_content)

    print("Ultra-smooth Chaikin Bézier SVG generated!")

if __name__ == '__main__':
    main()
