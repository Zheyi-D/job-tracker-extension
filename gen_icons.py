# 生成扩展图标：紫蓝渐变圆角方块 + 白色对勾（纸面记录之意）
# 仅用标准库，无需 PIL
import struct, zlib, math, os

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'icons')


def chunk(tag, data):
    c = struct.pack('>I', len(data)) + tag + data
    c += struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    return c


def seg_dist(px, py, x1, y1, x2, y2):
    """点到线段的距离"""
    dx, dy = x2 - x1, y2 - y1
    if dx == dy == 0:
        return math.hypot(px - x1, py - y1)
    t = max(0, min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))


def make_png(size, path):
    rc = size * 0.22  # 圆角半径
    rows = bytearray()
    for y in range(size):
        rows.append(0)  # filter: none
        for x in range(size):
            # 圆角矩形 alpha（带抗锯齿）
            dx = max(rc - x, x - (size - 1 - rc), 0)
            dy = max(rc - y, y - (size - 1 - rc), 0)
            dist = math.hypot(dx, dy)
            if dist <= rc:
                alpha = 255
            elif dist < rc + 1.5:
                alpha = int(255 * (1 - (dist - rc) / 1.5))
            else:
                alpha = 0
            # 对角渐变 #667eea -> #7c5cf6
            t = (x + y) / (2.0 * size)
            r = int(0x66 + (0x7c - 0x66) * t)
            g = int(0x7e + (0x5c - 0x7e) * t)
            b = int(0xea + (0xf6 - 0xea) * t)
            # 白色对勾（两段线，带抗锯齿）
            d = min(
                seg_dist(x, y, size * 0.27, size * 0.53, size * 0.43, size * 0.69),
                seg_dist(x, y, size * 0.43, size * 0.69, size * 0.75, size * 0.33),
            )
            w = size * 0.075 + 0.5
            if d < w and alpha > 0:
                k = 1.0 if d < w - 1 else (w - d)
                r = int(r + (255 - r) * k)
                g = int(g + (255 - g) * k)
                b = int(b + (255 - b) * k)
            rows += bytes((r, g, b, alpha))
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', ihdr))
        f.write(chunk(b'IDAT', zlib.compress(bytes(rows), 9)))
        f.write(chunk(b'IEND', b''))
    print(f'written {path}')


if __name__ == '__main__':
    os.makedirs(OUT_DIR, exist_ok=True)
    for s in (16, 32, 48, 128):
        make_png(s, os.path.join(OUT_DIR, f'icon{s}.png'))
