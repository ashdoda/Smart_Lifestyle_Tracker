# WHAT THIS FILE DOES
# Opens a patient page and checks the chart header buttons, ranges, zoom and key are all there.
# These run in a headless browser (Playwright). Each line below prints PASS or FAIL.
from playwright.sync_api import sync_playwright
R=[]
def ok(n,c,i=''): R.append(c); print(('PASS ' if c else 'FAIL ')+n+(f'  [{i}]' if i!='' else ''))
URL='http://127.0.0.1:5173/provider-patient.html#/provider/patient/3'
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1440,'height':900})
    ctx.add_init_script("sessionStorage.getItem('hk.state')||sessionStorage.setItem('hk.state',JSON.stringify({session:{role:'provider'}}))")
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('.ch-foot',timeout=60000); pg.wait_for_timeout(800)
    bb=lambda s:{k:round(v,1) for k,v in pg.query_selector(s).bounding_box().items()}
    ax=lambda:pg.evaluate("[...document.querySelectorAll('#chPlot .ct')].map(t=>t.textContent).filter(t=>/^[−+]?\\d+$/.test(t)).join(',')")
    ok('no legend row', pg.query_selector('.ch-legend') is None)
    ok('footer has only the hint', pg.inner_text('.ch-foot').strip().startswith('Click a day to see what counted. Drag across the chart to measure a section'), pg.inner_text('.ch-foot').strip())
    ok('Graph key beside info', pg.is_visible('#chKeyBtn') and pg.is_visible('[data-info]') and pg.is_visible('#chTblBtn'))
    ok('green zone text label hidden', not pg.evaluate("[...document.querySelectorAll('#chPlot .gzl')].some(e=>getComputedStyle(e).display!=='none')"))
    h=pg.evaluate("[...document.querySelectorAll('.ch-title .btn')].map(e=>Math.round(e.getBoundingClientRect().height))"); ok('compact header buttons 28px / info 15px', h[0]==15 and h[1]==28 and h[2]==28, h)
    ok('ranges + zoom + custom present', pg.is_visible('#ranges') and pg.is_visible('#zIn') and pg.is_visible('#zOut') and pg.is_visible('[data-r=custom]'))
    pg.click('#chKeyBtn'); pg.wait_for_timeout(300); ok('Graph key dialog', pg.is_visible('.gk') and pg.locator('.gk-list li').count()==8); pg.screenshot(path='shots/pd_key.png'); pg.click('.gk .btn.primary'); pg.wait_for_timeout(300)
    # ranges
    for r in ('7D','1M','6M','1Y','5Y'):
        pg.click(f'#ranges [data-r="{r}"]'); pg.wait_for_timeout(500)
        ok(f'range {r} pressed + axis fixed', pg.get_attribute(f'#ranges [data-r="{r}"]','aria-pressed')=='true' and '−10' in ax() and '+10' in ax(), ax())
    pg.click('#ranges [data-r="7D"]'); pg.wait_for_timeout(500)
    c0=bb('.chartcard'); p0=bb('#chPlot'); a0=ax()
    # measure
    pl=bb('#chPlot'); y=pl['y']+pl['height']*0.5
    pg.mouse.move(pl['x']+120,y); pg.mouse.down(); pg.mouse.move(pl['x']+pl['width']-120,y+60,steps=12); pg.mouse.up(); pg.wait_for_timeout(400)
    ok('measure shows band, Clear, Zoom', not pg.evaluate("document.querySelector('#selBand').classList.contains('hide')") and pg.is_visible('#selClear') and pg.is_visible('#selZoom'))
    ok('measure: card same size', bb('.chartcard')['width']==c0['width'] and bb('.chartcard')['height']==c0['height'])
    ok('measure: plot unchanged', bb('#chPlot')==p0, (p0,bb('#chPlot'))); ok('measure: axis fixed', ax()==a0, ax())
    pg.screenshot(path='shots/pd_measure.png')
    pg.click('#selClear'); pg.wait_for_timeout(200); ok('Clear', pg.evaluate("document.querySelector('#selBand').classList.contains('hide')"))
    # wheel
    pg.mouse.move(pl['x']+200,pl['y']+100); s0=pg.evaluate('scrollY'); pg.mouse.wheel(0,300); pg.wait_for_timeout(400)
    ok('plain wheel scrolls page', pg.evaluate('scrollY')>s0, (s0,pg.evaluate('scrollY')))
    ok('wheel leaves chart alone', bb('.chartcard')['width']==c0['width'] and bb('#chPlot')['height']==p0['height'] and ax()==a0)
    pg.evaluate('scrollTo(0,0)'); pg.wait_for_timeout(300)
    # day details
    pl=bb('#chPlot'); pg.mouse.click(pl['x']+pl['width']-60,pl['y']+pl['height']*0.5); pg.wait_for_timeout(500)
    ok('click opens a detail dialog', pg.is_visible('.dialog,[role=dialog]'), pg.evaluate("(document.querySelector('[role=dialog]')||{}).innerText?.slice(0,60)"))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    # rolling selection by keyboard
    pg.focus('#chPlot'); pg.keyboard.press('ArrowLeft'); pg.keyboard.press('ArrowUp'); pg.keyboard.press('Enter'); pg.wait_for_timeout(500)
    t=pg.evaluate("(document.querySelector('[role=dialog]')||{}).innerText||''"); ok('rolling-average dialog via keyboard', '7-day' in t or 'average' in t.lower(), t[:70].replace('\n',' '))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    # zoom buttons
    w0=pg.evaluate("document.querySelectorAll('#chPlot circle.cpt').length"); pg.click('#zIn'); pg.wait_for_timeout(500); w1=pg.evaluate("document.querySelectorAll('#chPlot circle.cpt').length"); ok('zoom in changes window', w1<w0,(w0,w1))
    pg.click('#zOut'); pg.wait_for_timeout(400)
    # table
    pg.click('#chTblBtn'); pg.wait_for_timeout(300); ok('Table view', pg.is_visible('#chTable table')); pg.click('#chTblBtn'); pg.wait_for_timeout(400); ok('back to chart', pg.is_visible('#chPlot'))
    # resize via grip
    pg.query_selector('#grip').scroll_into_view_if_needed(); pg.wait_for_timeout(300); c1=bb('.chartcard'); g=bb('#grip'); pg.mouse.move(g['x']+17,g['y']+17); pg.mouse.down(); pg.mouse.move(g['x']+17-120,g['y']+17+90,steps=8); pg.mouse.up(); pg.wait_for_timeout(500)
    c2=bb('.chartcard'); ok('grip resizes width and height', c2['width']<c1['width'] and c2['height']>c1['height'], (c1['width'],c1['height'],c2['width'],c2['height']))
    chat=bb('.pp-chat,#chatHost,[class*=chat]') if pg.query_selector('.pp-chat,#chatHost') else None
    pg.screenshot(path='shots/pd_resized.png')
    ok('no page errors', not errs, errs)
    
    print('TOTAL',sum(R),'/',len(R)); b.close()
