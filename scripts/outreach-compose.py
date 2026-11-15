import json
import subprocess
import sys
import cv2
import numpy as np

cv2.setNumThreads(2)
plan = json.load(open(sys.argv[1]))
sprite = cv2.imread(plan['pointer'], cv2.IMREAD_UNCHANGED)
if sprite is None or sprite.shape[2] != 4:
    raise ValueError('Pointer must be a transparent PNG')
encoder = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', '1920x1080', '-r', '30', '-i', '-', '-c:v', 'libx264', '-threads', '2', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', sys.argv[2]], stdin=subprocess.PIPE)
previous = None
base = None
try:
    for i, frame in enumerate(plan['frames']):
        if frame['file'] != previous:
            base = cv2.imread(frame['file'])
            if base is None:
                raise ValueError(f"Missing scene {frame['file']}")
            previous = frame['file']
        image = base.copy()
        if frame['pointer']:
            x, y = [round(value * plan['scale']) for value in frame['pointer']]
            height, width = sprite.shape[:2]
            left, top = max(0, x), max(0, y)
            right, bottom = min(image.shape[1], x + width), min(image.shape[0], y + height)
            if right > left and bottom > top:
                part = sprite[top-y:bottom-y, left-x:right-x]
                alpha = part[:, :, 3:4].astype(np.float32) / 255
                image[top:bottom, left:right] = image[top:bottom, left:right] * (1-alpha) + part[:, :, :3] * alpha
        left, top, right, bottom = frame['box']
        factor = 1920 / (right-left)
        transform = np.array([[factor/plan['scale'], 0, -left*factor], [0, factor/plan['scale'], -top*factor]], dtype=np.float64)
        finished = cv2.warpAffine(image, transform, (1920, 1080), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
        encoder.stdin.write(finished.tobytes())
        if i % 300 == 0:
            print(f'composite {i}/{len(plan["frames"])}', flush=True)
    encoder.stdin.close()
    if encoder.wait() != 0:
        raise RuntimeError('Video encoder failed')
except BaseException:
    encoder.kill()
    encoder.wait()
    raise
