"""Rebuild the 53-second AI Okan introduction. Requires Pillow, NumPy, ffmpeg."""
from pathlib import Path
import json, math, subprocess, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
SCENES = json.loads((ROOT / 'script.json').read_text())
W, H, FPS, SR = 1280, 720, 24, 44100
BG, INK, ORANGE = '#fff8ed', '#382b27', '#e75d31'
font_path = '/System/Library/Fonts/ヒラギノ角ゴシック W7.ttc'
regular_path = '/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc'
def font(size, bold=True):
    return ImageFont.truetype(font_path if bold else regular_path, size)
okan = Image.open(ROOT.parents[1] / 'ai-okan/public/okan.png').convert('RGBA')
total = sum(s['duration'] for s in SCENES)

def frame(i, t):
    s = SCENES[i]
    im = Image.new('RGB', (W,H), BG)
    d = ImageDraw.Draw(im)
    d.rectangle((0,0,W,9),fill=ORANGE)
    d.text((55,35),'AIおかん',font=font(26),fill=INK)
    d.text((1000,40),'AI木曜会 × AGI Lab',font=font(17,False),fill=INK)
    # Warm circular portrait stage, with a gentle animated entrance.
    d.ellipse((815,145,1365,695),fill='#f6d49c')
    for x,y,r in [(1135,140,12),(806,560,8),(1190,595,14)]:
        d.ellipse((x-r,y-r,x+r,y+r),fill=ORANGE)
    enter = 1 - (1-min(1,t/.65))**3
    size = int(475 + 9*math.sin(t*.8))
    pic = okan.resize((size,size),Image.Resampling.LANCZOS)
    im.paste(pic,(int(813+(1-enter)*160),int(205+math.sin(t*1.6)*4)),pic)
    d = ImageDraw.Draw(im)
    x = int(65-(1-enter)*24)
    d.rounded_rectangle((x,139,x+min(740,30+len(s['label'])*24),184),radius=22,fill=ORANGE)
    d.text((x+16,147),s['label'],font=font(22),fill='white')
    title_size = 91 if i==6 else 67
    for j,line in enumerate(s['title']):
        d.text((x,223+j*101),line,font=font(title_size),fill=ORANGE if (j==1 or i==6) else INK)
    sub_y = 456 if i!=6 else 376
    d.text((65,sub_y),s['sub'],font=font(24,False),fill=INK)
    if i==6:
        d.rounded_rectangle((65,453,483,519),radius=32,fill=ORANGE)
        d.text((94,470),'あんたなら、できるで。',font=font(27),fill='white')
        d.text((65,560),'ひとりでは続かなかった挑戦に。',font=font(23,False),fill=INK)
    if s.get('note'):
        d.text((65,556),s['note'],font=font(18,False),fill='#76655a')
    d.line((65,646,1215,646),fill='#e7d9ca',width=2)
    # Seven segment timeline makes the short story easy to follow.
    for j in range(7):
        xx=65+j*58
        d.rounded_rectangle((xx,673,xx+43,678),radius=2,fill=ORANGE if j<=i else '#e7d9ca')
    d.text((1123,662),f'{i+1:02d} / 07',font=font(18,False),fill='#76655a')
    # Short soft fade between chapters.
    fade=min(1,t/.20,(s['duration']-t)/.20)
    if fade<1: im=Image.blend(Image.new('RGB',(W,H),BG),im,max(0,fade))
    return im

def soundtrack():
    music=np.zeros(total*SR,dtype=np.float32)
    # Original light marimba-like score, created here without stock audio.
    notes=[60,64,67,72,67,64,62,67,71,74,71,67,57,60,64,69,64,60,55,59,62,67,62,59]
    beat=.5
    for n,start in enumerate(np.arange(0,total,beat)):
        tt=np.arange(int(.75*SR))/SR
        freq=440*2**((notes[n%len(notes)]-69)/12)
        tone=(np.sin(2*np.pi*freq*tt)+.3*np.sin(2*np.pi*freq*2*tt))*np.exp(-tt*7)*(1-np.exp(-tt*100))*.025
        ix=int(start*SR); length=min(len(tone),len(music)-ix)
        music[ix:ix+length]+=tone[:length]
    cursor=0
    for i,s in enumerate(SCENES):
        raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(ROOT/'audio'/f'{i}.aiff'),'-ar',str(SR),'-ac','1','-f','f32le','-'])
        voice=np.frombuffer(raw,dtype=np.float32)
        if len(voice)/SR>s['duration']-.7: raise ValueError(f'Voice too long: {i}')
        ix=int((cursor+.4)*SR)
        music[ix:ix+len(voice)]+=voice*.88
        cursor+=s['duration']
    music[:int(.2*SR)]*=np.linspace(0,1,int(.2*SR))
    music[-SR:]*=np.linspace(1,0,SR)
    with wave.open(str(ROOT/'soundtrack.wav'),'wb') as out:
        out.setnchannels(1);out.setsampwidth(2);out.setframerate(SR)
        out.writeframes((np.clip(music,-1,1)*32767).astype('<i2').tobytes())

if __name__=='__main__':
    soundtrack()
    cmd=['ffmpeg','-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-', '-i',str(ROOT/'soundtrack.wav'),'-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart','-shortest',str(ROOT/'AI-okan-intro.mp4')]
    proc=subprocess.Popen(cmd,stdin=subprocess.PIPE)
    for i,s in enumerate(SCENES):
        frame(i,1).save(ROOT/f'scene-{i+1}.jpg',quality=90)
        for n in range(s['duration']*FPS): proc.stdin.write(frame(i,n/FPS).tobytes())
        print(f'Scene {i+1}/7 rendered',flush=True)
    proc.stdin.close()
    if proc.wait(): raise RuntimeError('ffmpeg failed')
    frame(6,1).save(ROOT/'poster.jpg',quality=95)
    board=Image.new('RGB',(1280,3*240),BG)
    for j in range(6):
        board.paste(frame(j,1).resize((426,240)),((j%3)*426,(j//3)*240))
    board.paste(frame(6,1).resize((426,240)),(426,480))
    board.save(ROOT/'storyboard.jpg',quality=95)
    print(f'Complete: {total}s',flush=True)
