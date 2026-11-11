# usage: python3 outreach-overlay.py screen.mp4 sfx.wav face.mp4 masks output.mp4 duration
import subprocess, sys
screen, sfx, face, masks, out, T1 = sys.argv[1:7]
T1 = float(T1)
OW, OH, S = 1920, 1080, 280
XR, BY = OW - 36 - S, OH - 36 - S
VDUR = float(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=duration', '-of', 'csv=p=0', face], capture_output=True, text=True).stdout.strip())
graph = (f'[1:v]tpad=stop_mode=clone:stop_duration=5,format=yuv420p,split=2[a][b];[a]gblur=sigma=10[bg];[2:v]format=gray,scale=520:520[pm];[b][pm]alphamerge[fg];'
         f'[bg][fg]overlay=format=auto,eq=contrast=1.05:saturation=1.08:brightness=0.01,scale={S}:{S}:flags=lanczos,format=rgba[f0];'
         f'[3:v]format=gray[cm];[f0][cm]alphamerge[face];'
         f'[0:v][4:v]overlay=x={XR - 40}:y={BY - 40}[s1];[s1][face]overlay=x={XR}:y={BY}:shortest=1,format=yuv420p[v];'
         f'[1:a]aresample=48000,pan=mono|c0=c0,afade=t=out:st={VDUR - 0.25}:d=0.25,apad=pad_dur=5[vo];[5:a]aresample=48000[fx];'
         f'[vo][fx]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-22:TP=-1.5:LRA=11,aresample=48000,pan=stereo|c0=c0|c1=c0,afade=t=out:st={T1 - 0.35}:d=0.35[au]')
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-filter_complex_threads', '1', '-threads', '2', '-i', screen, '-threads', '2', '-i', face,
                '-loop', '1', '-threads', '2', '-i', f'{masks}/person.png', '-loop', '1', '-threads', '2', '-i', f'{masks}/circle.png', '-loop', '1', '-threads', '2', '-i', f'{masks}/shadow.png', '-threads', '2', '-i', sfx,
                '-filter_complex', graph, '-map', '[v]', '-map', '[au]', '-t', str(T1),
                '-c:v', 'libx264', '-threads', '2', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out], check=True)
print(out)

