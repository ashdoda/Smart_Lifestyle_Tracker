# WHAT THIS FILE DOES
# Checks Pip walks left and right, comes back to the middle, and that the page has no errors.
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
    pg.click('#finish'); 
    pg.wait_for_selector('.done-scene .pet',timeout=15000); t0=pg.evaluate('performance.now()')
    shots=[(0.5,'a'),(1.0,'b'),(1.9,'c'),(2.5,'d'),(3.2,'e'),(4.3,'f'),(6.2,'g')]
    last=0
    X=lambda:pg.evaluate("(()=>{const e=document.querySelector('.done-scene .pwalk').getBoundingClientRect();return Math.round(e.left+e.width/2)})()")
    xs=[]
    for t,n in shots:
        pg.wait_for_timeout(int((t-last)*1000)); last=t
        pg.locator('.done-scene').screenshot(path=f'shots/pip_{n}.png'); xs.append(X())
    print('center x over time',xs)
    ok('walks left then right then returns to centre', min(xs)<xs[-1]-30 and max(xs)>xs[-1]+30 and abs(xs[-1]-xs[0])<8, xs)
    ok('arms hidden after celebration, smile kept', pg.evaluate("(()=>{const p=document.querySelector('.done-scene .pet');return !p.classList.contains('cheer')&&p.classList.contains('cheered')&&getComputedStyle(p.querySelector('.arms')).display==='none'&&getComputedStyle(p.querySelector('.f-happy')).display!=='none'})()"))
    ok('no page errors', not errs, errs); print('TOTAL',sum(R),'/',len(R)); b.close()
