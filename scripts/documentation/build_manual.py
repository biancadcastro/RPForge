from pathlib import Path
import json, html, shutil, re
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, Color
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader

ROOT = Path(__file__).resolve().parents[2]
DOC = ROOT / 'docs/guia-usuario'
ASSETS = DOC / 'assets'
DATA = json.loads((DOC / 'conteudo.json').read_text(encoding='utf-8-sig'))
OUT = ROOT / 'output/pdf'
OUT.mkdir(parents=True, exist_ok=True)
VERSION = DATA['version']
PDFNAME = f'Manual-RPForge-{VERSION}.pdf'
W,H = A4
M = 42
WIDTH = W-2*M
INK='#20202A'; MUTED='#62616B'; PAPER='#F4F1EA'; DARK='#14141B'; ORANGE='#FF7A32'
fontdir = Path('C:/Windows/Fonts')
pdfmetrics.registerFont(TTFont('Body', str(fontdir/'segoeui.ttf')))
pdfmetrics.registerFont(TTFont('BodyBold', str(fontdir/'segoeuib.ttf')))
pdfmetrics.registerFont(TTFont('Pixel', str(ASSETS/'PixelifySans-Bold.ttf')))
styles = {}
for key,font,size,color in [('body','Body',10.5,INK),('small','Body',8.2,MUTED),('head','BodyBold',11.5,INK),('table','Body',9.5,INK)]:
    styles[key]=ParagraphStyle(key,fontName=font,fontSize=size,leading=size*1.38,textColor=HexColor(color),spaceAfter=0)

c=canvas.Canvas(str(OUT/PDFNAME),pagesize=A4,pageCompression=1)
c.setTitle('RPForge | Guia oficial do usuário | '+VERSION)
c.setAuthor('Bianca de Castro · RPForge')
c.setSubject('Instalação, conversão de RPFs, spawns, YTYP e solução de problemas')
PAGECOUNT=len(DATA['sections'])+2
layouts=[]
def para(text,x,y,width=WIDTH,key='body',color=None):
    st=styles[key]
    if color: st=ParagraphStyle(key+'-custom',parent=st,textColor=HexColor(color))
    p=Paragraph(escape(text).replace('\n','<br/>'),st)
    _,h=p.wrap(width,H)
    p.drawOn(c,x,y-h)
    return y-h

def header(num,label):
    c.setFillColor(HexColor(PAPER));c.rect(0,0,W,H,fill=1,stroke=0)
    c.setFillColor(HexColor(ORANGE));c.rect(0,H-5,W,5,fill=1,stroke=0)
    c.drawImage(str(ASSETS/'logo-light.png'),M,H-58,91,32,mask='auto',preserveAspectRatio=True)
    c.setFont('Body',8);c.setFillColor(HexColor(MUTED));c.drawRightString(W-M,H-40,'GUIA DO USUÁRIO / '+VERSION)
    c.setStrokeColor(HexColor('#D9D5CE'));c.line(M,36,W-M,36)
    c.setFont('Body',7.5);c.drawString(M,23,'RPForge · '+label)
    c.drawRightString(W-M,23,f'{num:02d} / {PAGECOUNT:02d}')

def finish(num,label,y):
    if y<48: raise RuntimeError(f'Conteúdo ultrapassa a página {num}: {label}; y={y:.1f}')
    layouts.append({'page':num,'section':label,'bottom':round(y,1)})
    c.showPage()

# Cover
c.setFillColor(HexColor(DARK));c.rect(0,0,W,H,fill=1,stroke=0)
for x,y,size in [(W-115,H-90,20),(W-83,H-120,12),(W-155,270,38),(W-108,235,14),(62,160,12)]:
    c.setFillColor(HexColor('#252531'));c.rect(x,y,size,size,fill=1,stroke=0)
c.drawImage(str(ASSETS/'logo-dark.png'),M,H-155,265,93,mask='auto',preserveAspectRatio=True)
c.setFillColor(HexColor(ORANGE));c.rect(M,H-205,45,4,fill=1,stroke=0)
c.setFillColor(HexColor(PAPER));c.setFont('Pixel',37)
c.drawString(M,H-275,'Guia do usuário')
y=para('Do seu pacote ao primeiro addon.',M,H-306,WIDTH,'head',PAPER)
y=para(DATA['intro'],M,y-20,WIDTH-85,'body','#BDB9C6')
# Product image as a controlled inset, never redrawn.
img=ImageReader(str(ASSETS/'04-previa.png'));iw,ih=img.getSize();dh=290;dw=dh*iw/ih
c.drawImage(img,(W-dw)/2,142,dw,dh,mask='auto')
c.setFillColor(HexColor(ORANGE));c.rect(0,0,W,102,fill=1,stroke=0)
c.setFillColor(HexColor(DARK));c.setFont('BodyBold',12);c.drawString(M,68,'RPFORGE '+VERSION)
c.setFont('Body',9);c.drawString(M,48,DATA['edition']+' · '+DATA['date'])
c.drawString(M,30,'Instalar · Converter · Gerar YTYP · Resolver avisos')
c.bookmarkPage('capa');c.addOutlineEntry('Guia do usuário','capa',level=0)
c.showPage()

# Contents
header(2,'Índice')
c.bookmarkPage('indice');c.addOutlineEntry('Índice','indice',level=0)
c.setFont('Pixel',28);c.setFillColor(HexColor(INK));c.drawString(M,H-105,'Encontre seu próximo passo')
y=para('Leia na ordem para começar ou vá direto ao assunto. Os títulos abaixo são clicáveis no PDF.',M,H-128)
y-=22
for i,s in enumerate(DATA['sections']):
    num=i+3
    c.setFillColor(HexColor('#E8E4DC' if i%2==0 else PAPER));c.roundRect(M,y-27,WIDTH,30,4,fill=1,stroke=0)
    c.setFont('Body',10.3);c.setFillColor(HexColor(INK));c.drawString(M+12,y-16,s['label'])
    c.setFont('BodyBold',10);c.setFillColor(HexColor('#B84715'));c.drawRightString(W-M-12,y-16,f'{num:02d}')
    c.linkRect('',s['id'],(M,y-27,W-M,y+3),relative=0,thickness=0)
    y-=34
para('Sobre as imagens: telas do aplicativo com nomes e dados fictícios para demonstração. A imagem de YTYP mostra uma geração feita com um modelo de teste.',M,y-14,WIDTH,'small')
finish(2,'Índice',y-50)

for index,s in enumerate(DATA['sections']):
    num=index+3;header(num,s['label']);c.bookmarkPage(s['id']);c.addOutlineEntry(s['label'],s['id'],level=0)
    c.setFont('BodyBold',8.7);c.setFillColor(HexColor('#B84715'));c.drawString(M,H-84,f'{index+1:02d} / {s["label"].upper()}')
    title=Paragraph(escape(s['title']),ParagraphStyle('title',fontName='Pixel',fontSize=25,leading=29,textColor=HexColor(INK)))
    _,th=title.wrap(WIDTH,H);title.drawOn(c,M,H-102-th);y=H-102-th-14
    y=para(s['lead'],M,y);y-=18
    if s.get('image'):
        image=ImageReader(str(ASSETS/s['image']));iw,ih=image.getSize();dh=min(330,WIDTH*ih/iw);dw=dh*iw/ih
        c.drawImage(image,M+(WIDTH-dw)/2,y-dh,dw,dh,mask='auto');y-=dh+8
        y=para(s['caption'],M,y,WIDTH,'small');y-=16
    for block in s['blocks']:
        if 'table' in block:
            rows=[[Paragraph(escape(cell),styles['table']) for cell in row] for row in block['table']]
            table=Table(rows,colWidths=[WIDTH*.30,WIDTH*.70],hAlign='LEFT')
            table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),HexColor('#E1DCD2')),('ROWBACKGROUNDS',(0,1),(-1,-1),[HexColor('#ECE8E0'),HexColor(PAPER)]),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),('LINEBELOW',(0,0),(-1,0),.8,HexColor('#BDB6A9'))]))
            _,height=table.wrap(WIDTH,H);table.drawOn(c,M,y-height);y-=height+15
            continue
        start=y
        if block.get('heading'):y=para(block['heading'],M,y,WIDTH,'head');y-=5
        if block.get('body'):y=para(block['body'],M,y);y-=8
        if block.get('code'):
            lines=block['code'].split('\n');height=len(lines)*13+18
            c.setFillColor(HexColor('#E5E0D5'));c.roundRect(M,y-height,WIDTH,height,4,fill=1,stroke=0)
            c.setFillColor(HexColor(INK));c.setFont('Courier',9)
            for j,line in enumerate(lines):c.drawString(M+12,y-15-j*13,line)
            y-=height+10
        for j,item in enumerate(block.get('steps',block.get('items',[]))):
            prefix=f'{j+1}.' if 'steps' in block else '•'
            c.setFillColor(HexColor('#B84715'));c.setFont('BodyBold',10);c.drawString(M+3,y-11,prefix)
            y=para(item,M+23,y,WIDTH-23);y-=6
        if block.get('kind'):
            c.setStrokeColor(HexColor(ORANGE));c.setLineWidth(2.5);c.line(M-10,start+1,M-10,y+4)
        y-=8
    finish(num,s['label'],y)
c.save()
shutil.copyfile(OUT/PDFNAME,DOC/PDFNAME)
(ROOT/'.tools/manual-layout.json').write_text(json.dumps(layouts,ensure_ascii=False,indent=2),encoding='utf8')

# Offline web guide. All copy is embedded; file:// does not need a server or fetch.
esc=html.escape
parts=[]
for i,s in enumerate(DATA['sections']):
    body=[]
    if s.get('image'):body.append(f'<figure><button class="capture" aria-label="Ampliar captura: {esc(s["label"])}"><img loading="lazy" src="assets/{s["image"]}" alt="{esc(s["caption"])}"></button><figcaption>{esc(s["caption"])}</figcaption></figure>')
    for b in s['blocks']:
        p=[]
        if b.get('heading'):p.append('<h3>'+esc(b['heading'])+'</h3>')
        if b.get('body'):p.append('<p>'+esc(b['body'])+'</p>')
        if b.get('code'):p.append('<pre><code>'+esc(b['code'])+'</code></pre>')
        if b.get('steps'):p.append('<ol>'+''.join('<li>'+esc(t)+'</li>' for t in b['steps'])+'</ol>')
        if b.get('items'):p.append('<ul>'+''.join('<li>'+esc(t)+'</li>' for t in b['items'])+'</ul>')
        if b.get('table'):
            table=b['table'];p.append('<div class="table-scroll"><table><thead><tr>'+''.join('<th scope="col">'+esc(t)+'</th>' for t in table[0])+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+esc(t)+'</td>' for t in row)+'</tr>' for row in table[1:])+'</tbody></table></div>')
        body.append('<div class="block '+b.get('kind','')+'">'+''.join(p)+'</div>')
    parts.append(f'<section id="{s["id"]}" class="chapter" data-search><p class="eyebrow">{i+1:02d} / {esc(s["label"])}</p><h2>{esc(s["title"])}</h2><p class="lead">{esc(s["lead"])}</p>'+''.join(body)+'</section>')
nav=''.join(f'<a href="#{s["id"]}"><span>{i+1:02d}</span>{esc(s["label"])}</a>' for i,s in enumerate(DATA['sections']))
page=f'''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Guia oficial do usuário RPForge: instalação, conversão de RPF, alteração de spawn e geração de YTYP."><title>{esc(DATA['title'])}</title><link rel="icon" href="assets/symbol.png"><link rel="stylesheet" href="estilo.css"></head><body><a class="skip" href="#conteudo">Ir para o conteúdo</a><aside class="sidebar"><a class="brand" href="#topo"><img src="assets/logo-dark.png" alt="RPForge"></a><p class="nav-title">GUIA DO USUÁRIO <span>v{VERSION}</span></p><label class="search-label" for="busca">Encontre um assunto</label><input id="busca" type="search" placeholder="Buscar no guia…" autocomplete="off"><nav aria-label="Capítulos do manual">{nav}</nav><a class="pdf-link" href="{PDFNAME}">↓ Baixar o manual em PDF</a><p class="edition">{esc(DATA['edition'])}<br>{esc(DATA['date'])}</p></aside><main id="conteudo"><header id="topo" class="hero"><div><p class="eyebrow">DOCUMENTAÇÃO OFICIAL / RPForge {VERSION}</p><h1>Seu pacote.<br>Seu próximo addon.</h1><p>{esc(DATA['intro'])}</p><div class="hero-actions"><a class="primary" href="#comece">Começar a usar →</a><a href="{PDFNAME}">Ler em PDF ↗</a></div></div><img class="hero-symbol" src="assets/symbol.png" alt=""></header><div class="reading-meta"><span>Manual para quem usa o app</span><span>Windows · GTA V Legacy · FiveM</span></div><p id="sem-resultados" role="status" hidden>Nenhum assunto encontrado. Tente “spawn”, “pasta” ou “YTYP”.</p>{''.join(parts)}<footer><img src="assets/logo-light.png" alt="RPForge"><p>Guia do usuário · versão {VERSION} · {esc(DATA['date'])}<br>Capturas com exemplos fictícios. Não afiliado à Rockstar Games ou à Cfx.re.</p><a href="#topo">Voltar ao início ↑</a></footer></main><dialog id="zoom" aria-label="Captura ampliada"><button class="close" aria-label="Fechar captura ampliada">Fechar ×</button><img alt=""><p></p></dialog><script src="interacao.js"></script></body></html>'''
(DOC/'index.html').write_text(page,encoding='utf8')
print(json.dumps({'pdf':str(OUT/PDFNAME),'pages':PAGECOUNT,'html':str(DOC/'index.html'),'min_content_y':min(x['bottom'] for x in layouts)},ensure_ascii=False))
