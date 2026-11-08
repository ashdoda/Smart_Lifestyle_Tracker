// WHAT THIS FILE DOES
// Small helper functions for check-in answers: whether an answer was filled in, whether a question should show, and what gets sent when saving.
// True when an answer actually has something in it (blank, "none" or "n/a" count as empty)
export function filled(v){return v!=null && (Array.isArray(v)?v.length>0:typeof v==='string'?!['','n/a','na','none','nothing','no','-','null'].includes(v.trim().toLowerCase().replace(/\.$/,'')):true)}
// True when a question should be shown, based on the answer to an earlier question
export function visible(q,answers){const c=q.show_if;if(!c)return true;return 'equals' in c?answers[c.question]===c.equals:c.filled?filled(answers[c.question]):true}
// A save replaces the whole period, so carry forward unchanged saved answers.
// Builds the answers to send when saving, keeping earlier answers that were not changed
export function submission(questions,saved,edits,context={}){const combined={...saved,...edits};return Object.fromEntries(questions.filter(q=>visible(q,{...context,...combined})&&combined[q.id]!=null).map(q=>[q.id,combined[q.id]]))}
// Shows a score as text, or a dash when there is no score
export function scoreText(v){return v==null?'—':String(v)}
let queue=Promise.resolve();
// One request at a time: overlapping requests can make the server answer 500, so calls are queued.
export function request(path,options={}){const run=()=>send(path,options);const next=queue.then(run,run);queue=next.catch(()=>{});return next}
async function send(path,options){let r;try{r=await fetch('/api'+path,{...options,headers:{'Content-Type':'application/json',...options.headers}})}catch{throw new Error('Cannot reach the server. Check the connection and try again.')}const raw=await r.text();let data;try{data=JSON.parse(raw)}catch{throw new Error(`The server could not complete this request (${r.status}). Please retry.`)}if(!r.ok){const e=new Error(typeof data.detail==='string'?data.detail:'Please check your answers and try again.');e.fields=data.detail?.errors||{};throw e}return data}
