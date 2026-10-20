import sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
def text_path(text, font_path, size, x=0, y=0, tracking=0):
    f = TTFont(font_path); gs = f.getGlyphSet(); cmap = f.getBestCmap(); upm = f['head'].unitsPerEm
    s = size/upm; pen = SVGPathPen(gs); cx = 0
    hmtx = f['hmtx']
    for ch in text:
        g = cmap[ord(ch)]
        tp = TransformPen(pen, (s,0,0,-s,x+cx,y))
        gs[g].draw(tp)
        cx += hmtx[g][0]*s + tracking
    return pen.getCommands(), cx - tracking
if __name__ == '__main__':
    d,w = text_path(sys.argv[1], '/usr/share/fonts/opentype/inter/InterDisplay-ExtraBold.otf', float(sys.argv[2]))
    print(w)
