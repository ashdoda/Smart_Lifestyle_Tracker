# WHAT THIS FILE DOES
# Checks the patient list table: column handles, row alignment and status columns.
# These run in a headless browser (Playwright). Each line below prints PASS or FAIL.
from playwright.sync_api import sync_playwright
R=[]
def ok(n,c,i=''): R.append(c); print(('PASS ' if c else 'FAIL ')+n+(f'  [{i}]' if i!='' else ''))
with sync_playwright() as p:
    b=p.chromium.launch(); c=b.new_context(viewport={'width':1360,'height':994}); c.add_init_script("sessionStorage.setItem('hk.state',JSON.stringify({session:{role:'provider'}}))")
    pg=c.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://127.0.0.1:5173/provider-patients.html#/provider'); pg.wait_for_timeout(4500)
    W=lambda sel='.phead':pg.evaluate("(s)=>getComputedStyle(document.querySelector(s)).gridTemplateColumns.split(' ').map(x=>Math.round(parseFloat(x)))",sel)
    w0=W(); print(w0)
    ok('5 handles, not touching header edges', pg.locator('.rzh').count()==5 and pg.evaluate("(()=>{const h=document.querySelector('.rzh'),H=document.querySelector('.phead').getBoundingClientRect(),b=h.getBoundingClientRect();return b.top-H.top>=6&&H.bottom-b.bottom>=6})()"))
    ok('no handle after Domains; Domains header last', pg.evaluate("[...document.querySelectorAll('.phead > span')].map(s=>s.textContent.trim()).slice(-2)[0]")=='Domains')
    ok('rows align with header', W('.prow')==w0, (w0,W('.prow')))
    bar=lambda i:pg.evaluate(f"(()=>{{const r=document.querySelectorAll('.rzh')[{i}].getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]}})()")
    # drag status|lastday bar right 60
    x,y=bar(1); pg.mouse.move(x,y); pg.mouse.down(); pg.mouse.move(x+30,y,steps=8); pg.mouse.up(); pg.wait_for_timeout(200)
    w1=W(); ok('status +30, last full day -30', abs(w1[2]-w0[2]-30)<=2 and abs(w0[3]-w1[3]-30)<=2, (w0,w1)); ok('rows follow header', W('.prow')==w1)
    ok('other columns & total unchanged', w1[1]==w0[1] and w1[4:]==w0[4:] and sum(w1)==sum(w0))
    # min clamp: drag far left
    x,y=bar(1); pg.mouse.move(x,y); pg.mouse.down(); pg.mouse.move(x-500,y,steps=8); pg.mouse.up(); pg.wait_for_timeout(200)
    w2=W(); ok('clamped at minimum width (120)', w2[2]==120, w2)
    # name|status bar
    x,y=bar(0); pg.mouse.move(x,y); pg.mouse.down(); pg.mouse.move(x+80,y,steps=6); pg.mouse.up(); pg.wait_for_timeout(200); w3=W(); ok('name|status bar at status minimum: no change, no break', w3==w2, (w2,w3))
    # keyboard
    pg.focus('.rzh[data-i="5"]'); pg.keyboard.press('ArrowLeft'); pg.wait_for_timeout(100); w4=W(); ok('keyboard: last check-in -16, domains +16', w3[5]-w4[5]==16 and w4[6]-w3[6]==16, (w3,w4))
    # reset
    pg.dblclick('.rzh[data-i="2"]'); pg.wait_for_timeout(200); w5=W(); ok('double-click resets to default', w5==w0, (w0,w5))
    # content not overlapping at extremes
    pg.screenshot(path='shots/rz_a.png',clip={'x':0,'y':100,'width':1360,'height':330})
    # click row still navigates / domains dialog works
    pg.click('.invbtn'); pg.wait_for_timeout(600); ok('Domains dialog still opens', pg.is_visible('.cards-dlg')); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    ok('no horizontal page overflow', not pg.evaluate("document.documentElement.scrollWidth>innerWidth"))
    # sort/filter keeps widths
    x,y=bar(3); pg.mouse.move(x,y); pg.mouse.down(); pg.mouse.move(x+40,y,steps=4); pg.mouse.up(); w6=W(); pg.select_option('#sort','name'); pg.wait_for_timeout(500); ok('widths survive sort', W('.prow')==W() and W()==w6)
    # narrow desktop: handles hidden, default layout
    pg.set_viewport_size({'width':1100,'height':900}); pg.wait_for_timeout(500); ok('<=1180: handles hidden, no custom cols', not pg.is_visible('.rzh') and not pg.evaluate("document.querySelector('.plist').classList.contains('rz')"))
    pg.set_viewport_size({'width':1360,'height':994}); pg.wait_for_timeout(500); ok('back to wide: handles return', pg.is_visible('.rzh'))
    ok('no page errors', not errs, errs); print('TOTAL',sum(R),'/',len(R)); b.close()
