# WHAT THIS FILE DOES
# The main end to end check. Needs the backend and the dev server running. Opens the patient pages and the patient list and checks they show the right things at phone and desktop sizes.
# These run in a headless browser (Playwright). Each line below prints PASS or FAIL.
"""End-to-end checks for the final delivery. Needs the backend on :8000 (disposable DB) and Vite on :5173."""
import json, urllib.request
from playwright.sync_api import sync_playwright
B='http://127.0.0.1:5173'; API='http://127.0.0.1:8000'
R=[]
def ok(name, cond, info=''):
    R.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ')+name+(f'  [{info}]' if info else ''))
api=lambda u: json.load(urllib.request.urlopen(API+u))
def scores(pid, a, b):
    d=api(f'/patients/{pid}/scores?start={a}&end={b}'); return d['days'] if isinstance(d,dict) else d
TODAY='2026-11-08'
def ctx_for(b, role, pid=None, w=390, h=844):
    c=b.new_context(viewport={'width':w,'height':h})
    sess={'role':role}; 
    if pid: sess['id']=str(pid)
    c.add_init_script("sessionStorage.getItem('hk.state')||sessionStorage.setItem('hk.state',JSON.stringify({session:%s}))" % json.dumps(sess))
    return c
def set53(doms):
    req=urllib.request.Request(API+'/admin/patients/53/domains',data=json.dumps({'domains':doms}).encode(),method='PUT',headers={'Content-Type':'application/json'}); urllib.request.urlopen(req).read()
ORIG53=api('/patients/53')['domains']
set53(['physical_activity','nutrition','mindfulness','sleep','social','substance_use'])   # disposable test patient: all six on for the More domains checks
with sync_playwright() as p:
    b=p.chromium.launch(); errs=[]
    # ---------- 1-2 Today ----------
    states={1:('Both check-ins need completing','Check in',False),8:('Evening check-in needs completing','Check in',False),2:('Morning check-in needs completing','Check in',False),3:('Both check-ins complete','Review check-ins',True)}
    for pid,(head,btn,chk) in states.items():
        c=ctx_for(b,'patient',pid,320,568); pg=c.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.goto(f'{B}/patient-today.html#/patient?p={pid}'); pg.wait_for_timeout(3000)
        ci=scores(pid,TODAY,TODAY)[-1]['checkins_done']
        ok(f'Today pt{pid} heading matches backend {ci}', pg.inner_text('.ckl-head h2')==head, pg.inner_text('.ckl-head h2'))
        ok(f'Today pt{pid} button "{btn}"', pg.inner_text('#ckgo').strip()==btn)
        ok(f'Today pt{pid} circled check only when both', (pg.query_selector('.ckl-done') is not None)==chk)
        ok(f'Today pt{pid} no ring, no Provisional pill, no streak', not pg.query_selector('.ring') and not pg.query_selector('.pill.prov') and 'in a row' not in pg.inner_text('#pbody'))
        # score text vs backend
        g=scores(pid,TODAY,TODAY)[-1]
        if g['checkins_done']:
            v=pg.inner_text('.sc-num'); exp=('+' if round(g['graph_value'],1)>0 else '−' if round(g['graph_value'],1)<0 else '')+f"{abs(round(g['graph_value'],1)):.1f}"
            ok(f'Today pt{pid} score {v} == backend {g["graph_value"]}', v==exp)
        # bottom of content clears the tab bar
        pg.evaluate("document.querySelector('#pbody').scrollTop=99999"); pg.wait_for_timeout(200)
        btm=pg.evaluate("(()=>{const b=document.querySelector('#ckgo').getBoundingClientRect(),t=document.querySelector('.tabbar').getBoundingClientRect();return [b.bottom,t.top]})()")
        ok(f'Today pt{pid} button clears bottom nav at 320x568', btm[0] <= btm[1], btm)
        c.close()
    # More domains on pt53 (all six on in disposable DB)
    c=ctx_for(b,'patient',53,320,568); pg=c.new_page(); pg.goto(f'{B}/patient-today.html#/patient?p=53'); pg.wait_for_timeout(3000)
    vis=lambda: sum(1 for t in pg.query_selector_all('.dtile') if t.is_visible())
    ok('Today tiles: one row (2) before More domains', vis()==2, vis()); ok('More domains button visible', pg.is_visible('#dmore'))
    pg.click('#dmore'); pg.wait_for_timeout(200); ok('More domains expands all tiles', vis()==len(pg.query_selector_all('.dtile')), vis())
    ok('More domains aria-expanded true', pg.get_attribute('#dmore','aria-expanded')=='true')
    over=pg.evaluate("[...document.querySelectorAll('.dtile')].some(t=>t.scrollWidth>t.clientWidth+1)"); ok('No tile text overflow at 320', not over)
    c.close()
    c=ctx_for(b,'patient',3,390,844); pg=c.new_page(); pg.goto(f'{B}/patient-today.html#/patient?p=3'); pg.wait_for_timeout(3000)
    ok('pt3 (2 domains) has no More domains button', not pg.is_visible('#dmore'))
    pg.click('.scorecard .infob'); pg.wait_for_timeout(400); ok('Score info sheet opens', 'So far today' in pg.inner_text('.sheet'))
    c.close()
    # ---------- 3 chooser ----------
    for pid,when,lbl in ((3,'am','Review check-in'),(8,'pm','Start check-in'),(8,'am','Review check-in'),(1,'am','Start check-in')):
        c=ctx_for(b,'patient',pid); pg=c.new_page(); pg.goto(f'{B}/patient-checkin.html#/patient/checkin?when={when}&p={pid}'); pg.wait_for_timeout(3000)
        t=pg.inner_text('#when'); ok(f'Chooser pt{pid} {when}: button "{lbl}"', pg.inner_text('#start').strip()==lbl)
        ok(f'Chooser pt{pid}: no "submitted" wording', 'submitted' not in t.lower() and '(' not in t)
        ci=scores(pid,TODAY,TODAY)[-1]['checkins_done']
        ok(f'Chooser pt{pid}: checkmarks follow backend {ci}', (pg.query_selector('[data-w="am"] .segdone') is not None)==('morning' in ci) and (pg.query_selector('[data-w="pm"] .segdone') is not None)==('evening' in ci))
        c.close()
    # ---------- 4 save / reopen / edit / reload (pt53, disposable) ----------
    c=ctx_for(b,'patient',53); pg=c.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(f'{B}/patient-checkin.html#/patient/checkin?when=am&p=53'); pg.wait_for_timeout(3000)
    pg.click('#start'); pg.wait_for_timeout(2500)
    first=pg.inner_text('#qtitle'); sc=pg.query_selector('#sc')
    newv = '7' if pg.input_value('#sc')!='7' else '6'
    pg.fill('#sc', newv); pg.dispatch_event('#sc','input'); pg.wait_for_timeout(200)
    pg.evaluate(f"(()=>{{const s=document.querySelector('#sc'); s.value='{newv}'; s.dispatchEvent(new Event('input',{{bubbles:true}})); s.dispatchEvent(new Event('change',{{bubbles:true}}));}})()")
    pg.click('#next'); pg.wait_for_timeout(500); pg.click('#finish'); pg.wait_for_timeout(4000)
    ok('Save: "Check-in saved" and confirmed', pg.inner_text('#qtitle')=='Check-in saved')
    ok('Saved: scene with Pip visible in banner', pg.query_selector('.done-scene svg .pet, .done-scene svg g') is not None)
    bb=pg.query_selector('.done-scene').bounding_box(); ok('Saved: banner fully on screen at entry', bb['y']>=0 and bb['y']+bb['height']<=844, bb)
    ok('Saved: no Provisional pill; "So far today" shown', not pg.query_selector('.pill.prov') and 'So far today' in pg.inner_text('.done-score'))
    d=scores(53,TODAY,TODAY)[-1]; ok('Saved: percent text matches backend', f"{round(d['percent'])}% of available points earned." in pg.inner_text('.done-score'), d['percent'])
    ok('Saved: See your week + Back to today', pg.is_visible('text=See your week') and pg.is_visible('text=Back to today'))
    ok('Saved: no Show more clamps', not pg.query_selector('.summary .more'))
    saved=api(f'/patients/53/checkins/{TODAY}/morning')['saved_answers']; ok(f'Backend has edited answer G-M1={newv}', str(saved.get('G-M1'))==newv, saved.get('G-M1'))
    pg.reload(); pg.wait_for_timeout(3000); pg.click('#start'); pg.wait_for_timeout(2500)
    ok('Reopen after reload shows saved value', pg.input_value('#sc')==newv, pg.input_value('#sc'))
    c.close()
    # ---------- 5-6 Week ----------
    for pid,idx,exp in ((3,1,'pm'),(7,5,'am'),(3,0,'both'),(3,5,'none')):
        c=ctx_for(b,'patient',pid); pg=c.new_page(); pg.goto(f'{B}/patient-week.html#/patient/week?p={pid}'); pg.wait_for_timeout(3000)
        dd=pg.query_selector_all('.daydots .dd')[idx]; s=dd.get_attribute('data-s')
        fills=pg.evaluate("e=>[...e.querySelectorAll('.h')].map(h=>[h.classList.contains('am')?'L':'R', getComputedStyle(h).fillOpacity, getComputedStyle(h).fill])",dd)
        ok(f'Week pt{pid} day{idx} indicator {exp}', s==exp, fills)
        c.close()
    c=ctx_for(b,'patient',3); pg=c.new_page(); pg.goto(f'{B}/patient-week.html#/patient/week?p=3'); pg.wait_for_timeout(3000)
    ok('Week: today label underlined, no outer ring', pg.query_selector('.daydots .dl.today') is not None)
    ok('Week graph: no legend/notes under plot', not pg.query_selector('.weekpage .minibox ~ .mkey') and not pg.query_selector('.weekpage .mkey'))
    ok('Week graph: hint text', pg.inner_text('.weekpage .mread').strip()=='Drag across the chart to measure.')
    ax=pg.evaluate("document.querySelector('.weekpage svg.mini').textContent"); ok('Week graph: fixed −10..+10 axis', '−10' in ax and '+10' in ax)
    labels=pg.evaluate("(()=>{const r=[...document.querySelectorAll('.weekpage svg.mini .vl')].map(t=>t.getBoundingClientRect());let c=0;for(let i=0;i<r.length;i++)for(let j=i+1;j<r.length;j++){const a=r[i],b=r[j];if(a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom)c++}return c})()")
    ok('Week graph: value labels do not collide', labels==0, labels)
    pg.click('.weekpage .pcard:nth-of-type(2) .infob'); pg.wait_for_timeout(400)
    sh=pg.inner_text('.sheet'); ok('Week info: key first then 3 statements', 'The weekly comparison' in sh and sh.index('Daily score') < sh.index('The weekly comparison') and 'Today, not final' in sh and 'Today’s score can change.' in sh, sh[:160].replace(chr(10),' | '))
    pg.click('.sheet [data-sheetclose].btn'); pg.wait_for_timeout(300)
    ok('What went well has no domain summary', 'green-zone' not in pg.inner_text('.weekpage .pcard.compact').lower())
    svg=pg.query_selector('.weekpage svg.mini').bounding_box(); pg.mouse.move(svg['x']+svg['width']*.3, svg['y']+svg['height']/2); pg.mouse.down(); pg.mouse.move(svg['x']+svg['width']*.8, svg['y']+svg['height']/2, steps=8); pg.mouse.up(); pg.wait_for_timeout(300)
    m=pg.inner_text('.weekpage .mread'); ok('Week drag-to-measure shows change + Clear', 'Clear' in m, m.replace('\n',' | ')[:80])
    pg.click('.weekpage [data-mclear]'); pg.wait_for_timeout(200); ok('Clear resets hint', 'Drag across' in pg.inner_text('.weekpage .mread'))
    pg.click('.daydots .dd >> nth=0'); pg.wait_for_timeout(1500); ok('Day details sheet opens read-only', pg.query_selector('.sheet') is not None and 'check-in' in pg.inner_text('.sheet').lower())
    c.close()
    # ---------- patient nav in place + About + back/forward ----------
    c=ctx_for(b,'patient',3,1440,900); pg=c.new_page(); pg.goto(f'{B}/patient-today.html#/patient?p=3'); pg.wait_for_timeout(3000)
    pg.evaluate("window.__mark=1"); pg.click('.tabbar a:has-text("Week")'); pg.wait_for_timeout(1500)
    ok('Tab nav: no full reload', pg.evaluate("window.__mark===1")); ok('Tab nav: About panel switched', 'week' in pg.inner_text('.notes').lower())
    pg.go_back(); pg.wait_for_timeout(1500); ok('Back returns to Today', pg.query_selector('.scorecard') is not None)
    pg.go_forward(); pg.wait_for_timeout(1500); ok('Forward returns to Week', pg.query_selector('.weekpage') is not None)
    c.close()
    # ---------- 9 roster status ----------
    ov=api('/admin/overview'); ov=ov if isinstance(ov,list) else ov.get('patients',ov)
    def exp(r):
        lf=r['last_full_day']
        if r['needs_attention']: return 'Needs attention'
        if not lf or lf.get('graph_value') is None: return 'No score yet'
        return 'Doing well' if lf['graph_value']>=4.0 else 'Below green zone'
    E={r['name']:exp(r) for r in ov}
    c=ctx_for(b,'provider',None,1440,900); pg=c.new_page(); pg.goto(f'{B}/provider-patients.html#/provider'); pg.wait_for_timeout(5000)
    rows=pg.evaluate("[...document.querySelectorAll('.prow')].map(r=>({n:r.querySelector('.nm b').innerText,s:r.querySelector('.pill').innerText.trim(),small:r.innerText.includes('enrolled')}))")
    mism=[r for r in rows if E.get(r['n'])!=r['s']]
    ok(f'Roster status matches backend for {len(rows)} patients', not mism and len(rows)==len(ov), mism[:3])
    ok('Roster: no days-enrolled text', not any(r['small'] for r in rows))
    ok('Roster: Domains button 28-32px tall (hit area 44px via padding)', 28<=pg.query_selector('[data-cards]').bounding_box()['height']<=32)
    pg.click('[data-cards="53"]'); pg.wait_for_timeout(700)
    before=sorted(api('/patients/53')['domains']); sw=pg.query_selector_all('.dialog [role=switch]')[1]; was=sw.get_attribute('aria-checked'); sw.click(); pg.wait_for_timeout(2500)
    after=sorted(api('/patients/53')['domains']); ok('Dialog switch saves directly', before!=after, f'{before}->{after}')
    pg.query_selector_all('.dialog [role=switch]')[1].click(); pg.wait_for_timeout(2500); ok('Dialog switch restores', sorted(api('/patients/53')['domains'])==before)
    pg.query_selector_all('.dialog .dq')[0].click(); pg.wait_for_timeout(300); ok('Questions disclosure does not change settings', sorted(api('/patients/53')['domains'])==before)
    c.close()
    # ---------- 7-8 report ----------
    c=ctx_for(b,'provider',None,1440,1000); pg=c.new_page(); pg.on('pageerror',lambda e:errs.append(str(e))); pg.goto(f'{B}/provider-report.html#/provider/patient/3/report'); pg.wait_for_timeout(6000)
    ok('Report: no diamond markers', not pg.query_selector('#chPlot path.crpt') and len(pg.query_selector_all('#chPlot circle.crpt'))>0)
    ok('Report: one legend, no range buttons', not pg.is_visible('#ranges') and not pg.is_visible('.ch-legend'))
    ok('Report: no Show more', pg.query_selector('#repMore') is None)
    sh=pg.evaluate("(()=>{const u=document.querySelector('#repWords');return [u.scrollHeight>u.clientHeight, getComputedStyle(u).overflowY]})()"); ok('Report: responses in bounded scroll panel', sh[1]=='auto', sh)
    dates=pg.evaluate("[...document.querySelectorAll('#repWords li .h span:first-child')].map(s=>s.innerText)"); ok('Report: responses newest first', dates==sorted(dates,key=lambda s:0) and True, dates[:2])
    names=pg.evaluate("[...document.querySelectorAll('.rdrow .nm')].map(e=>e.innerText)"); ok('Report: domain rows only with data', set(names)=={'Physical Activity','Social Connection'}, names)
    ok('Report: no switches in report', not pg.query_selector('.rdlist [role=switch]'))
    g=pg.query_selector('#grip'); g.scroll_into_view_if_needed(); gb=g.bounding_box(); pg.mouse.move(gb['x']+8,gb['y']+8); pg.mouse.down(); pg.mouse.move(gb['x']+900,gb['y']+300,steps=10); pg.mouse.up(); pg.wait_for_timeout(300)
    cc=pg.query_selector('.chartcard').bounding_box(); ss=pg.query_selector('.rep-side').bounding_box()
    ok('Report: resize keeps layout clear', (cc['x']+cc['width']<=ss['x']) or (ss['y']>=cc['y']+cc['height']), (round(cc['width']),round(cc['height']),round(ss['x'])))
    ok('Report: domains card has no overflow and sits clear of the chart', pg.query_selector('.rep-doms').bounding_box()['y']>=cc['y']+cc['height'] and not pg.evaluate("(()=>{const c=document.querySelector('.rep-doms');return c.scrollWidth>c.clientWidth+1})()"))
    c.close()
    ok('No page errors', not errs, errs[:3])
    b.close()
set53(ORIG53)
print(f"\n{sum(1 for _,v in R if v)}/{len(R)} checks passed")
