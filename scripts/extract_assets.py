#!/usr/bin/env python3
"""
四隅からのBFSフラッドフィル探索により、背景のスカイブルーのみを完全に透過化するスクリプト
"""
from PIL import Image
from collections import deque
import math

def bfs_transparent():
    src_path = 'doc/input/design/assets/524_master.jpeg'
    img = Image.open(src_path).convert('RGBA')
    w, h = img.size

    bg_ref = (57, 186, 215) # スカイブルー

    # 訪問済みマップ
    visited = [[False for _ in range(w)] for _ in range(h)]
    is_bg = [[False for _ in range(w)] for _ in range(h)]

    # キューに四隅と外枠を入れる
    q = deque()
    for x in range(w):
        q.append((x, 0))
        q.append((x, h - 1))
        visited[0][x] = True
        visited[h - 1][x] = True
    for y in range(h):
        q.append((0, y))
        q.append((w - 1, y))
        visited[y][0] = True
        visited[y][w - 1] = True

    def color_dist(c1, c2):
        return math.sqrt((c1[0]-c2[0])**2 + (c1[1]-c2[1])**2 + (c1[2]-c2[2])**2)

    # 閾値: 背景の青色（少しの圧縮ノイズも許容）
    # ただし黄色・白・オレンジ・影・口には絶対に侵入しない
    threshold = 40

    while q:
        cx, cy = q.popleft()
        r, g, b, _ = img.getpixel((cx, cy))
        d = color_dist((r, g, b), bg_ref)

        if d <= threshold:
            is_bg[cy][cx] = True
            for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                nx, ny = cx + dx, cy + dy
                if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx]:
                    visited[ny][nx] = True
                    nr, ng, nb, _ = img.getpixel((nx, ny))
                    nd = color_dist((nr, ng, nb), bg_ref)
                    if nd <= threshold:
                        q.append((nx, ny))

    # 出力画像
    char_img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    shadow_img = Image.new('RGBA', (w, h), (0, 0, 0, 0))

    for y in range(h):
        for x in range(w):
            r, g, b, a = img.getpixel((x, y))
            if is_bg[y][x]:
                continue
            
            # 背景との境界付近の滑らかなブレンド
            d = color_dist((r, g, b), bg_ref)
            alpha = 255
            if d < 25:
                continue

            if y < 290:
                char_img.putpixel((x, y), (r, g, b, alpha))
            else:
                shadow_img.putpixel((x, y), (r, g, b, alpha))

    char_bbox = char_img.getbbox()
    char_cropped = char_img.crop(char_bbox)
    char_cropped.save('public/assets/524_character.png')
    char_cropped.save('doc/input/design/assets/524_character.png')

    shadow_bbox = shadow_img.getbbox()
    if shadow_bbox:
        shadow_cropped = shadow_img.crop(shadow_bbox)
        shadow_cropped.save('public/assets/524_shadow.png')
        shadow_cropped.save('doc/input/design/assets/524_shadow.png')

    print("BFS Floodfill transparent extraction finished!")

if __name__ == '__main__':
    bfs_transparent()
