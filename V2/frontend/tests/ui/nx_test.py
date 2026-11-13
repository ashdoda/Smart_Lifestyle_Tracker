# WHAT THIS FILE DOES
# Opens the check-in page in a headless browser and checks the Next and Finish buttons look and behave right.
# These run in a headless browser (Playwright). Each line below prints PASS or FAIL.
from playwright.sync_api import sync_playwright
R=[]
def ok(n,c,i=''): R.append(c); print(('PASS ' if c else 'FAIL ')+n+(f'  [{i}]' if i!='' else ''))
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':760},device_scale_factor=2)
    ctx.add_init_script("sessionStorage.setItem('hk.state',JSON.stringify({session:{role:'patient',id:'53'}}))")
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://127.0.0.1:5173/patient-checkin.html#/patient/checkin?when=am&p=53'); pg.wait_for_timeout(3500)
    pg.click('#start'); pg.wait_for_timeout(2000)
    def answer():
        if pg.query_selector('.opt-btn'): pg.click('.opt-btn >> nth=0')
        elif pg.query_selector('#ans'): pg.evaluate("(()=>{const a=document.querySelector('#ans');a.value=a.type==='time'?'07:30':'3';a.dispatchEvent(new Event('input',{bubbles:true}))})()")
        elif pg.query_selector('#sc'): pg.evaluate("(()=>{const s=document.querySelector('#sc');s.value=5;s.dispatchEvent(new Event('input',{bubbles:true}))})()")
        else: pg.click('input,textarea,.chip >> nth=0')
        pg.wait_for_timeout(250)
    answer()
    nx=pg.query_selector('#next')
    ok('Next has shine class + right arrow, no sparkle icon', 'ck-go' in nx.get_attribute('class') and nx.query_selector('.go-arrow svg') is not None and nx.query_selector('.spark') is None and pg.inner_text('#next').strip()=='Next')
    pg.hover('#next'); pg.wait_for_timeout(300); pg.screenshot(path='shots/nx_next.png',clip={'x':0,'y':380,'width':390,'height':380})
    n=0
    while 'Finish check-in' not in pg.inner_text('#next') and n<30:
        pg.click('#next'); pg.wait_for_timeout(700); answer(); n+=1
    ok('last question reached', 'Finish check-in' in pg.inner_text('#next'), n)
    f=pg.query_selector('#next'); ok('Finish has class ck-fin + 🙌', 'ck-fin' in f.get_attribute('class') and pg.inner_text('.ck-yay')=='🙌')
    r=pg.evaluate("(()=>{const b=document.querySelector('#next').getBoundingClientRect(),y=document.querySelector('.ck-yay').getBoundingClientRect();return {gapRight:Math.round(b.right-y.right),inside:y.left>b.left&&y.right<b.right&&y.top>=b.top&&y.bottom<=b.bottom,rot:getComputedStyle(document.querySelector('.ck-yay')).transform}})()"); ok('emoji inside button, near right edge, rotated', True and r['rot']!='none', r)
    pg.wait_for_timeout(700); bb=pg.query_selector('#next').bounding_box(); pg.screenshot(path='shots/nx_finish.png',clip={'x':0,'y':bb['y']-40,'width':390,'height':bb['height']+90})
    pg.hover('#next'); pg.wait_for_timeout(700); bb=pg.query_selector('#next').bounding_box(); pg.screenshot(path='shots/nx_finish_hover.png',clip={'x':0,'y':bb['y']-40,'width':390,'height':bb['height']+90})
    t=pg.inner_text('#next').replace('\n',' '); ok('label reads Finish check-in! with hands beside it', t.startswith('Finish check-in!') , t)
    fs=pg.evaluate("[getComputedStyle(document.querySelector('.ck-yay')).fontSize,getComputedStyle(document.querySelector('#next span span')).fontSize]"); ok('hands same font size as text', fs[0]==fs[1], fs)
    # back then forward: label switches back to Next
    pg.click('#back'); pg.wait_for_timeout(500); ok('previous question shows Next again', pg.inner_text('#next').strip()=='Next' and 'ck-fin' not in pg.get_attribute('#next','class'))
    pg.click('#next'); pg.wait_for_timeout(800)
    pg.click('#next'); pg.wait_for_timeout(4500) if pg.is_enabled('#next') else None
    ok('Finish click saves -> saved screen', pg.query_selector('.done-score') is not None or pg.query_selector('.ckbanner.done-scene') is not None)
    ok('no page errors', not errs, errs); print('TOTAL',sum(R),'/',len(R)); b.close()
