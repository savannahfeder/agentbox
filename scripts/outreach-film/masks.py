# The face bubble's masks: where the face stays sharp, and the circle.
import sys
from PIL import Image, ImageDraw, ImageFilter
out = sys.argv[1]
S = 520
m = Image.new('L', (S, S), 0)
d = ImageDraw.Draw(m)
d.ellipse((262 - 152, 230 - 195, 262 + 152, 230 + 195), fill=255)
d.polygon([(140, 300), (390, 300), (440, 390), (560, 430), (560, 560), (-40, 560), (-40, 430), (95, 390)], fill=255)
m.filter(ImageFilter.GaussianBlur(14)).save(f'{out}/person.png')
D = int(sys.argv[2]) if len(sys.argv) > 2 else 300
big = Image.new('L', (D * 4, D * 4), 0)
ImageDraw.Draw(big).ellipse((0, 0, D * 4 - 1, D * 4 - 1), fill=255)
big.resize((D, D), Image.LANCZOS).save(f'{out}/circle.png')
# A soft shadow a little wider than the bubble, so it sits on the screen.
P = 40
sh = Image.new('L', (D + 2 * P, D + 2 * P), 0)
ImageDraw.Draw(sh).ellipse((P, P + 6, P + D, P + D + 6), fill=150)
sh = sh.filter(ImageFilter.GaussianBlur(14))
rgba = Image.new('RGBA', sh.size, (0, 0, 0, 0)); rgba.putalpha(sh)
rgba.save(f'{out}/shadow.png')
