# WHAT THIS FILE DOES
# Opens the weekly report and checks the chart Measure tool, axis and scrolling work.
# These run in a headless browser (Playwright). Each line below prints PASS or FAIL.
from playwright.sync_api import sync_playwright
R=[]
def ok(n,c,i=''): R.append(c); print(('PASS ' if c else 'FAIL ')+n+(f'  [{i}]' if i!='' else ''))
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1440,'height':900})
    ctx.add_init_script("sessionStorage.getItem('hk.state')||sessionStorage.setItem('hk.state',JSON.stringify({session:{role:'provider'}}))")
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://127.0.0.1:5173/provider-report.html#/provider/patient/1/report'); pg.wait_for_timeout(6000)
    bb=lambda s:{k:round(v,1) for k,v in pg.query_selector(s).bounding_box().items()}
    pg.query_selector('.chartcard').scroll_into_view_if_needed()
    c0=bb('.chartcard'); p0=bb('#chPlot'); ax0=pg.evaluate("[...document.querySelectorAll('#chPlot .ct')].map(t=>t.textContent).filter(t=>/^[−+]?\\d+$/.test(t)).join(',')")
    pl=bb('#chPlot'); y=pl['y']+pl['height']*0.5
    pg.mouse.move(pl['x']+120,y); pg.mouse.down(); pg.mouse.move(pl['x']+pl['width']-120,y,steps=12); pg.mouse.up(); pg.wait_for_timeout(400)
    c1=bb('.chartcard'); p1=bb('#chPlot'); ax1=pg.evaluate("[...document.querySelectorAll('#chPlot .ct')].map(t=>t.textContent).filter(t=>/^[−+]?\\d+$/.test(t)).join(',')")
    ok('Measure shows band + Clear', pg.is_visible('#selClear') and not pg.evaluate("document.querySelector('#selBand').classList.contains('hide')"))
    ok('Measure does not resize card', c0['width']==c1['width'] and c0['height']==c1['height'], (c0['height'],c1['height']))
    ok('Measure does not move/resize plot', p0==p1, (p0,p1))
    ok('Axis stays −10..+10', ax0==ax1 and '−10' in ax1 and '+10' in ax1, ax1)
    pg.screenshot(path='shots/rep_measure.png')
    pg.click('#selClear'); pg.wait_for_timeout(200); ok('Clear hides band', pg.evaluate("document.querySelector('#selBand').classList.contains('hide')"))
    # wheel scrolls the page over the plot, with and without ctrl
    s0=pg.evaluate('scrollY'); pl=bb('#chPlot'); pg.mouse.move(pl['x']+200,pl['y']+100); pg.mouse.wheel(0,300); pg.wait_for_timeout(400)
    ok('Wheel over plot scrolls page', pg.evaluate('scrollY')>s0, (s0,pg.evaluate('scrollY')))
    ok('Wheel does not change chart', bb('.chartcard')['width']==c0['width'] and bb('.chartcard')['height']==c0['height'])
    # hint position
    ok('Hint kept in footer', 'Click a day to see what counted. Drag across the chart to measure a section' in pg.inner_text('.chartcard .ch-foot'))
    ok('No persistent legends', not pg.is_visible('.chartcard .ch-legend') and not any(e.is_visible() for e in pg.query_selector_all('.chartcard .ch-foot .kitem:not(.hint)')) and not pg.is_visible('#chPlot .gzl'))
    # header controls
    h2=bb('.chartcard h2'); info=bb('.chartcard [data-info]'); key=bb('#chKeyBtn'); tbl=bb('#chTblBtn')
    ok('Graph key beside info button', key['x']>info['x'] and abs((key['y']+key['height']/2)-(info['y']+info['height']/2))<2 and key['x']-(info['x']+info['width'])<24, (info,key))
    ok('Info outline ≈ capital L height (14px)', 13<=info['height']<=17, info['height'])
    ok('Controls vertically centred with title', abs((tbl['y']+tbl['height']/2)-(h2['y']+h2['height']/2))<3)
    tgt=pg.evaluate("(()=>{const r=e=>{const a=getComputedStyle(e,'::after');return [e.offsetWidth-parseFloat(a.left)-parseFloat(a.right), e.offsetHeight-parseFloat(a.top)-parseFloat(a.bottom)]};return ['[data-info]','#chKeyBtn','#chTblBtn'].map(s=>r(document.querySelector('.chartcard '+s)))})()")
    ok('Invisible targets ≥ 40px tall', all(t[1]>=40 for t in tgt), tgt)
    pg.focus('.chartcard [data-info]'); pg.keyboard.press('Tab'); f=pg.evaluate("document.activeElement.id"); ok('Keyboard focus reaches Graph key', f=='chKeyBtn')
    pg.keyboard.press('Enter'); pg.wait_for_timeout(500)
    t=pg.inner_text('.dialog'); ok('Graph key dialog lists every mark', all(x in t for x in ['Daily score','7-day average','Green zone','First day’s score','Today, not final','Latest finished day','No score that day','Measured section']))
    pg.screenshot(path='shots/rep_key.png'); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.click('.chartcard [data-info]'); pg.wait_for_timeout(400); ok('Info stays score-calculation help', 'How the lifestyle score works' in pg.inner_text('.dialog') and 'Graph key' not in pg.inner_text('.dialog')); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.click('#chTblBtn'); pg.wait_for_timeout(400); ok('Table view shows table', pg.is_visible('#chTable') and 'Nov' in pg.inner_text('#chTable')); pg.click('#chTblBtn'); pg.wait_for_timeout(300); ok('Table view toggles back', pg.is_visible('#chPlot'))
    # vertical + horizontal resize, then narrowing restores
    g=bb('#grip'); pg.mouse.move(g['x']+10,g['y']+10); pg.mouse.down(); pg.mouse.move(g['x']+80,g['y']+160,steps=10); pg.mouse.up(); pg.wait_for_timeout(300)
    c2=bb('.chartcard'); ok('Grip resizes width and height', c2['width']>c0['width'] and c2['height']>c0['height'], (c2['width'],c2['height']))
    g=bb('#grip'); pg.mouse.move(g['x']+10,g['y']+10); pg.mouse.down(); pg.mouse.move(g['x']+600,g['y'],steps=10); pg.mouse.up(); pg.wait_for_timeout(300)
    ok('Wide chart -> column moves below', pg.get_attribute('#repRow','data-mode')=='below')
    d=bb('.rep-doms'); a=bb('.rep-side .card'); w=bb('.rep-words')
    ok('Below: Domains left, Attention right, tops aligned', d['x']<a['x'] and abs(d['y']-a['y'])<1, (d['y'],a['y']))
    ok('Below: Written directly under Attention', abs(w['x']-a['x'])<1 and w['y']>a['y']+a['height'])
    ok('No horizontal page overflow', not pg.evaluate("document.documentElement.scrollWidth>document.documentElement.clientWidth"))
    g=bb('#grip'); pg.mouse.move(g['x']+10,g['y']+10); pg.mouse.down(); pg.mouse.move(g['x']-700,g['y'],steps=10); pg.mouse.up(); pg.wait_for_timeout(300)
    ok('Narrowing restores side-by-side', pg.get_attribute('#repRow','data-mode')=='side')
    a=bb('.rep-side .card'); c3=bb('.chartcard'); ok('Side: Attention beside chart, no overlap', a['x']>=c3['x']+c3['width'] and abs(a['y']-c3['y'])<1)
    pg.keyboard.press('Escape')
    # narrow screen stack
    pg.set_viewport_size({'width':760,'height':900}); pg.wait_for_timeout(600)
    order=[bb(s)['y'] for s in ('.chartcard','.rep-doms','.rep-side .card','.rep-words')]
    ok('Narrow: Chart, Domains, Attention, Written', pg.get_attribute('#repRow','data-mode')=='stack' and order==sorted(order), order)
    ok('Narrow: no horizontal overflow', not pg.evaluate("document.documentElement.scrollWidth>document.documentElement.clientWidth"))
    pg.screenshot(path='shots/rep_narrow.png',full_page=True)
    pg.set_viewport_size({'width':1440,'height':900}); pg.wait_for_timeout(600)
    ok('Wide again restores side layout', pg.get_attribute('#repRow','data-mode')=='side')
    ok('No page errors', not errs, errs[:2])
    b.close()
print(f'{sum(R)}/{len(R)} passed')
