# The app draws the company's logo small on a dark sidebar. A dark mark on a
# transparent background would vanish there, so it goes on a white rounded
# square, the way an app icon would. Anything else is left as it is.
# usage: python3 logo-on-dark.py <logo.png>
import sys
from PIL import Image, ImageDraw
p = sys.argv[1]
im = Image.open(p).convert('RGBA')
px = [(r, g, b) for r, g, b, a in im.getdata() if a > 128]
clear = sum(1 for *_, a in im.getdata() if a < 32) / (im.width * im.height)
lum = sum(0.299 * r + 0.587 * g + 0.114 * b for r, g, b in px) / max(1, len(px))
if clear > 0.2 and lum < 90:
    S = max(im.size); pad = int(S * 0.18)
    tile = Image.new('RGBA', (S + 2 * pad, S + 2 * pad), (0, 0, 0, 0))
    ImageDraw.Draw(tile).rounded_rectangle((0, 0, tile.width - 1, tile.height - 1), radius=int(tile.width * 0.22), fill=(255, 255, 255, 255))
    tile.alpha_composite(im, ((tile.width - im.width) // 2, (tile.height - im.height) // 2))
    tile.save(p)
    print(f'{p}: dark mark ({lum:.0f}) on white')
else:
    print(f'{p}: kept ({lum:.0f}, {clear:.0%} clear)')
