import sys; sys.path.insert(0,'.')
from textpath import text_path
XB='/usr/share/fonts/opentype/inter/InterDisplay-ExtraBold.otf'
SB='/usr/share/fonts/opentype/inter/InterDisplay-SemiBold.otf'
MD='/usr/share/fonts/opentype/inter/InterDisplay-Medium.otf'
OUT='/home/claude/opspacebank/brand/'

DEFS='''
<linearGradient id="osDisk" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#1FA672"/><stop offset=".55" stop-color="#0A5139"/><stop offset="1" stop-color="#03241A"/></linearGradient>
<linearGradient id="osCol" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#B4EDD1"/></linearGradient>
<linearGradient id="osOrbit" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9FE8C4"/><stop offset="1" stop-color="#3CC48C"/></linearGradient>
<linearGradient id="osBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0B2E24"/><stop offset="1" stop-color="#021510"/></linearGradient>
<clipPath id="osFront"><rect x="-40" y="268" width="600" height="200"/></clipPath>
'''
ORBIT = 'transform="rotate(-16 256 268)"'
MARK = f'''
<g {ORBIT}><ellipse cx="256" cy="268" rx="238" ry="66" fill="none" stroke="url(#osOrbit)" stroke-width="13" opacity=".9"/></g>
<circle cx="256" cy="256" r="176" fill="url(#osDisk)"/>
<g fill="#FFFFFF"><circle cx="196" cy="140" r="4" opacity=".8"/><circle cx="318" cy="128" r="3" opacity=".6"/><circle cx="356" cy="176" r="2.5" opacity=".5"/><circle cx="150" cy="190" r="2.5" opacity=".5"/><circle cx="270" cy="112" r="2" opacity=".5"/></g>
<path d="M146 238 L256 166 L366 238 Z" fill="#DDF7EA"/>
<circle cx="256" cy="214" r="13" fill="#F2C14E"/>
<rect x="152" y="248" width="208" height="16" rx="4" fill="#DDF7EA"/>
<rect x="170" y="274" width="34" height="68" rx="6" fill="url(#osCol)"/>
<rect x="239" y="274" width="34" height="68" rx="6" fill="url(#osCol)"/>
<rect x="308" y="274" width="34" height="68" rx="6" fill="url(#osCol)"/>
<rect x="146" y="350" width="220" height="15" rx="4" fill="#DDF7EA"/>
<rect x="128" y="372" width="256" height="15" rx="4" fill="#9FE8C4"/>
<g {ORBIT}><g clip-path="url(#osFront)"><ellipse cx="256" cy="268" rx="238" ry="66" fill="none" stroke="url(#osOrbit)" stroke-width="13"/></g>
<circle cx="472" cy="296" r="20" fill="#F2C14E"/><circle cx="466" cy="290" r="7" fill="#FFF1C4" opacity=".8"/></g>
'''
def svg(w,h,body,title): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" role="img" aria-label="{title}"><title>{title}</title><defs>{DEFS}</defs>{body}</svg>\n'
def at(x,y,s,body=MARK): return f'<g transform="translate({x} {y}) scale({s})">{body}</g>'

open(OUT+'logo-mark.svg','w').write(svg(512,512,MARK,'OpSpaceBank — знак'))
open(OUT+'logo-icon.svg','w').write(svg(512,512,'<rect width="512" height="512" rx="112" fill="url(#osBg)"/>'+at(46,46,0.82),'OpSpaceBank'))
open(OUT+'logo-icon-maskable.svg','w').write(svg(512,512,'<rect width="512" height="512" fill="url(#osBg)"/>'+at(102,102,0.6),'OpSpaceBank'))
SMALL='''<circle cx="256" cy="256" r="236" fill="url(#osDisk)"/>
<path d="M112 232 L256 128 L400 232 Z" fill="#DDF7EA"/><rect x="118" y="248" width="276" height="24" rx="6" fill="#DDF7EA"/>
<rect x="140" y="286" width="50" height="86" rx="8" fill="#FFFFFF"/><rect x="231" y="286" width="50" height="86" rx="8" fill="#FFFFFF"/><rect x="322" y="286" width="50" height="86" rx="8" fill="#FFFFFF"/>
<rect x="104" y="384" width="304" height="26" rx="6" fill="#9FE8C4"/><circle cx="430" cy="110" r="44" fill="#F2C14E"/>'''
open(OUT+'logo-icon-small.svg','w').write(svg(512,512,SMALL,'OpSpaceBank'))

def word(size, x, y, dark):
    d1,w1 = text_path('OpSpace', XB, size, x, y)
    d2,w2 = text_path('Bank', SB, size, x+w1+size*0.04, y)
    c1 = '#FFFFFF' if dark else '#062A20'
    c2 = '#5FD3A0' if dark else '#13875C'
    return f'<path d="{d1}" fill="{c1}"/><path d="{d2}" fill="{c2}"/>', w1+size*0.04+w2

# горизонтальный
for dark in (False, True):
    t, tw = word(104, 212, 124, dark)
    tag, _ = text_path('ПОМОЩНИК БАНКА', MD, 25, 216, 170, 7)
    tc = '#9FC7B5' if dark else '#587266'
    W = int(212+tw+20)
    open(OUT+f'logo-horizontal-{"dark" if dark else "light"}.svg','w').write(svg(W,196, at(0,4,188/512)+t+f'<path d="{tag}" fill="{tc}"/>','OpSpaceBank — помощник банка'))
# вертикальный
for dark in (False, True):
    t, tw = word(96, 0, 0, dark); W = 760
    t, tw = word(96, (W-tw)/2, 500, dark)
    open(OUT+f'logo-vertical-{"dark" if dark else "light"}.svg','w').write(svg(W,540, at((W-420)/2, -6, 420/512)+t,'OpSpaceBank'))
print('ok')
