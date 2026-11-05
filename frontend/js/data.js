/* ===== Product content: the six cards, their questions, ideas and resources, quick-log buttons ===== */

const GENERAL = {
  am: {
    primary: { id: 'g-am-1', text: 'What is one specific, measurable thing I will do today to work toward my goal, and when and where will I do it?', type: 'text', ph: 'Example: Walk for 10 minutes after lunch, on my street.' },
    follow: [
      { id: 'g-am-2', text: 'What is one small action I can take today that moves me toward my goal?', type: 'text' },
      { id: 'g-am-3', text: 'Why does this matter to me today?', type: 'text' },
      { id: 'g-am-4', text: 'What is most likely to get in the way, and what will I do if it happens?', type: 'text' },
      { id: 'g-am-5', text: 'How confident am I that I can accomplish this goal today?', type: 'scale', adaptive: 'lowConfidence' },
    ],
  },
  pm: {
    primary: { id: 'g-pm-1', text: 'What did I do today toward my goal? Briefly write down what I did.', type: 'text', ph: 'Example: Walked around the block after lunch.', plus: { id: 'g-pm-2', text: 'Did I meet my goal today?', type: 'yesno', adaptive: 'goalMet' } },
    follow: [
      { id: 'g-pm-3', text: 'What helped me follow through, and what got in the way?', type: 'text' },
      { id: 'g-pm-4', text: 'How did I feel after completing my goal?', type: 'mood' },
      { id: 'g-pm-5', text: 'What is one thing I can do tomorrow to make following through easier?', type: 'text' },
    ],
    notMet: { id: 'g-pm-6', text: 'If a friend were in the same situation, what would I say to encourage them? What could I adjust tomorrow?', type: 'text', ph: 'Be as kind as you would be to a friend.' },
  },
};

const BARRIERS = ['Low energy', 'Ran out of time', 'My mood', 'Forgot', 'Plans changed', 'Pain or illness', 'Something else'];

const DOMAINS = [
  {
    id: 'activity', name: 'Physical Activity', short: 'Move', icon: 'footprints',
    definition: 'Any bodily movement produced by skeletal muscles that requires energy expenditure.',
    why: 'Regular movement is linked to fewer depressive symptoms and better mood, physical functioning and overall well-being (Noetel et al., 2024).',
    practice: 'Encourage regular, enjoyable movement; gradually increase frequency, intensity and time; individualize goals based on ability and motivation.',
    ideas: ['Take a 5-minute daily walk', 'Try chair exercises', 'Take a standing and stretching break', 'Set a daily movement goal', 'Pair movement with something you already do', 'Follow a short online workout video'],
    am: [
      { id: 'act-am-1', text: 'What is my step target today?', type: 'choice', options: ['2,000', '4,000', '6,000', '8,000'] },
      { id: 'act-am-2', text: 'What is one fun activity I can do that will get my body moving for at least 10 minutes?', type: 'text', ph: 'Dancing in the kitchen, a walk with a podcast...' },
      { id: 'act-am-3', text: 'When and where will I complete my movement goal?', type: 'text', ph: 'After lunch, around the block' },
      { id: 'act-am-4', text: 'What is my backup plan if I haven’t reached my movement goal by this evening?', type: 'choice', options: ['Take a 10-minute walk', 'Short exercise or stretch video', 'Dance to 2 or 3 favorite songs', 'Movement break between tasks', 'Gentler activity (low-energy day)'] },
    ],
    pm: [
      { id: 'act-pm-1', text: 'What physical activity did I complete today? Briefly record what I did and for how long.', type: 'text', ph: '15-minute walk after dinner' },
      { id: 'act-pm-2', text: 'How did I feel afterward?', type: 'mood' },
      { id: 'act-pm-3', text: 'What would I like to try tomorrow?', type: 'text' },
    ],
    wk: ['What type of movement felt most manageable or enjoyable this week?', 'How can I build on that activity next week?'],
    resources: [
      { kind: 'Video', title: '10-minute gentle stretch, follow along', len: 10, energy: 'Low energy' },
      { kind: 'Playlist', title: 'Upbeat movement songs, 120 to 150 BPM', len: 12, energy: 'Medium energy' },
      { kind: 'Tip', title: 'Chair exercises for low-energy days', len: 5, energy: 'Low energy' },
    ],
  },
  {
    id: 'diet', name: 'Diet & Nutrition', short: 'Eat', icon: 'apple',
    definition: 'Eating patterns built around whole foods (vegetables, fruits, beans, whole grains, nuts, seeds, olive oil and fish) are associated with better mental health.',
    why: 'Diets rich in whole foods may reduce depressive symptoms and improve quality of life; Mediterranean-style changes have shown improvements (Bayes et al., 2022).',
    practice: 'Emphasize whole and minimally processed foods; increase fruits, vegetables, legumes, whole grains and healthy fats; reduce highly processed foods.',
    ideas: ['Add one fruit or vegetable daily', 'Swap one processed snack for a whole food', 'Pick one simple meal substitution', 'Set one nutrition goal for the week'],
    am: [
      { id: 'diet-am-1', text: 'What is one specific nutrition goal I want to accomplish today?', type: 'choice', options: ['Add vegetables to two meals', 'Drink water instead of sugary drinks', 'Include protein with breakfast'], other: true },
      { id: 'diet-am-2', text: 'What is one food I could add today to increase my intake of a particular nutrient, such as fiber, protein, or magnesium?', type: 'choice', options: ['Fiber: oats, beans, berries', 'Protein: eggs, yogurt, tofu', 'Magnesium: seeds, spinach, nuts'] },
      { id: 'diet-am-3', text: 'What could make this goal difficult, and how can I prepare for it?', type: 'text' },
    ],
    pm: [
      { id: 'diet-pm-1', text: 'What did I eat today? A quick, plate-based log or optional photo log is enough.', type: 'text', ph: 'Eggs and toast, big salad, rice and beans', photo: true },
      { id: 'diet-pm-2', text: 'What nutrition choice am I happy with today?', type: 'text' },
      { id: 'diet-pm-3', text: 'If I had difficulty following my plan, what contributed to it?', type: 'choice', options: ['Hunger', 'Stress', 'Convenience', 'My environment', 'Nothing, it went fine'] },
      { id: 'diet-pm-4', text: 'What could I change in my environment or meal plan to make tomorrow easier?', type: 'text' },
    ],
    wk: ['What small nutrition change was easiest to maintain this week?', 'How can I make that change more convenient?', 'Is there a nutrient or food group I would like to focus on next week?', 'Can I find one healthy recipe that fits my schedule?'],
    resources: [
      { kind: 'Food list', title: 'Affordable foods high in fiber, protein and magnesium', len: 3, energy: 'Any energy' },
      { kind: 'Recipe', title: 'Five-ingredient lentil soup (20 minutes)', len: 20, energy: 'Medium energy' },
      { kind: 'Recipe', title: 'No-cook protein breakfast ideas', len: 5, energy: 'Low energy' },
    ],
  },
  {
    id: 'mind', name: 'Mind-body & Mindfulness', short: 'Pause', icon: 'flower-2',
    definition: 'Awareness of internal states and surroundings that helps people avoid destructive or automatic habits by observing thoughts and feelings without judging or reacting.',
    why: 'Brief, regular practice may reduce depression, anxiety and perceived stress while improving emotional regulation and present-moment awareness (Linardon et al., 2024).',
    practice: 'Encourage consistent, brief practice; introduce techniques gradually; adapt to patient preferences; emphasize nonjudgmental awareness rather than perfection.',
    ideas: ['1-minute guided breathing', '5-4-3-2-1 grounding', 'Brief body scan', 'Mindful eating exercise', '2-minute guided meditation'],
    am: [
      { id: 'mind-am-1', text: 'When and where will I practice mindfulness today, and for how long?', type: 'text', ph: 'After I wake up, on the couch, 3 minutes' },
      { id: 'mind-am-2', text: 'Would I like to schedule a reminder or add the practice to my calendar?', type: 'yesno' },
      { id: 'mind-am-3', text: 'Why is practicing mindfulness important to me?', type: 'text' },
      { id: 'mind-am-4', text: 'Would I like suggestions for guided meditations, breathing exercises, music, or other mindfulness activities?', type: 'choice', options: ['1 minute', '3 minutes', '5 minutes', '10 minutes'] },
    ],
    pm: [
      { id: 'mind-pm-1', text: 'Did I practice mindfulness today? If so, what did I do and for how long?', type: 'text' },
      { id: 'mind-pm-2', text: 'Did I notice any moments when I was functioning on autopilot or experiencing rumination?', type: 'yesno' },
      { id: 'mind-pm-3', text: 'How calm or alert do I feel right now?', type: 'scale' },
      { id: 'mind-pm-4', text: 'Was there a moment today when mindfulness helped me respond differently to stress?', type: 'text' },
    ],
    wk: ['Which mindfulness practice helped me feel more present?', 'When would it be easiest to repeat that practice?', 'Are there other forms of mindfulness or meditation I would like to explore?'],
    resources: [
      { kind: 'Audio', title: '1-minute breathing reset', len: 1, energy: 'Low energy' },
      { kind: 'Audio', title: '3-minute body scan', len: 3, energy: 'Low energy' },
      { kind: 'Audio', title: '5-minute grounding, 5-4-3-2-1', len: 5, energy: 'Any energy' },
      { kind: 'Audio', title: '10-minute guided meditation for beginners', len: 10, energy: 'Medium energy' },
    ],
  },
  {
    id: 'sleep', name: 'Restorative Sleep', short: 'Rest', icon: 'moon-star',
    definition: '7 to 9 hours of quality sleep each night so the body and brain can rest, regulate and repair.',
    why: 'Consistently restorative sleep supports physical health, emotional resilience, cognitive performance and long-term disease prevention.',
    practice: 'Maintain consistent sleep and wake times; limit sleep-disrupting behaviors; assess for sleep disorders; use cognitive behavioral therapy for insomnia (CBT-I) when clinically indicated.',
    ideas: ['Keep the same wake-up time', 'Build a 10-minute bedtime routine', 'Reduce screens in the evening', 'Try a brief relaxation exercise', 'Pick one sleep-disrupting habit to change'],
    am: [
      { id: 'sleep-am-1', text: 'What time do I want to begin winding down tonight?', type: 'time', def: '21:30' },
      { id: 'sleep-am-2', text: 'What time do I plan to get into bed?', type: 'time', def: '22:15' },
      { id: 'sleep-am-3', text: 'What is one thing I can do today to support my sleep tonight?', type: 'choice', options: ['Schedule a wind-down reminder', 'Limit distracting apps at night', 'Dim screens before bed', 'Pick a relaxing activity'], other: true },
      { id: 'sleep-am-4', text: 'About what time did I fall asleep last night?', type: 'time', def: '23:00', team: true },
      { id: 'sleep-am-5', text: 'About what time did I wake up this morning?', type: 'time', def: '06:45', team: true },
    ],
    pm: [
      { id: 'sleep-pm-1', text: 'Am I putting off going to bed? If so, what is keeping me awake?', type: 'text' },
      { id: 'sleep-pm-2', text: 'Is there anything on my mind that I could write down and set aside for tomorrow?', type: 'text' },
      { id: 'sleep-pm-3', text: 'Did my previous bedtime routine seem to help me sleep?', type: 'yesno' },
      { id: 'sleep-pm-4', text: 'What is one thing I can do right now to help myself wind down?', type: 'text' },
    ],
    wk: ['What patterns have I noticed between my daily habits and how rested I feel?', 'Which parts of my bedtime routine seem to be most helpful?', 'Is there one small change I could make to improve my sleep routine next week?'],
    resources: [
      { kind: 'Setup guide', title: 'Set a wind-down reminder and Focus mode (phone settings)', len: 4, energy: 'Any energy' },
      { kind: 'Tip', title: 'Why the same wake-up time helps sleep', len: 2, energy: 'Any energy' },
      { kind: 'Audio', title: '5-minute relaxation for bedtime', len: 5, energy: 'Low energy' },
    ],
    note: 'For patients with insomnia, the bedtime questions can be individualized to CBT-I principles.',
  },
  {
    id: 'social', name: 'Social Connection', short: 'Connect', icon: 'users',
    definition: 'Having the number, quality and variety of relationships you want, and feeling that you belong and have the support and care you need.',
    why: 'High-quality relationships are linked to longer, healthier lives and can improve how people manage stress, anxiety and depression.',
    practice: 'Assess perceived loneliness and relationship quality; encourage meaningful, reciprocal relationships; consider cultural preferences and social barriers; prioritize quality over number of interactions.',
    ideas: ['Send one supportive text', 'Schedule a brief call with a friend or family member', 'Identify one trusted support person', 'Plan one enjoyable social interaction', 'Express gratitude to someone'],
    am: [
      { id: 'soc-am-1', text: 'Who is one person I would like to connect with today?', type: 'text' },
      { id: 'soc-am-2', text: 'How would I like to connect with them?', type: 'choice', options: ['Phone call', 'Text', 'Letter', 'Face to face'] },
      { id: 'soc-am-3', text: 'What is one small action I could take today to strengthen a relationship?', type: 'text' },
    ],
    pm: [
      { id: 'soc-pm-1', text: 'Did I connect with someone I feel close to today?', type: 'yesno' },
      { id: 'soc-pm-2', text: 'Did I feel supported, connected, lonely, or isolated?', type: 'choice', options: ['Supported', 'Connected', 'Lonely', 'Isolated'] },
      { id: 'soc-pm-3', text: 'Did my interactions today feel supportive or draining?', type: 'choice', options: ['Supportive', 'Mixed', 'Draining'] },
      { id: 'soc-pm-4', text: 'Did I avoid social contact today? If so, what thoughts or feelings contributed to that decision?', type: 'text' },
    ],
    wk: ['Which relationships help me feel supported?', 'What is one way I could strengthen those connections?', 'Is there someone I would like to reconnect with or spend more time with?'],
    resources: [
      { kind: 'Idea list', title: 'Low-effort ways to connect when energy is low', len: 2, energy: 'Low energy' },
      { kind: 'Tip', title: 'A two-line text that opens a conversation', len: 1, energy: 'Low energy' },
    ],
  },
  {
    id: 'substance', name: 'Avoiding Harmful Substances', short: 'Steady', icon: 'shield-check', providerTailored: true,
    definition: 'Minimizing or eliminating behaviors and exposures, such as tobacco use, excessive alcohol and drug misuse, that drive chronic illness and reduce well-being.',
    why: 'Reducing substance use lowers physical and psychological harm and may improve sleep, functioning and mental health; digital tools have reduced alcohol use (Sohi et al., 2023).',
    practice: 'Routinely screen for tobacco, alcohol and drug use; use nonjudgmental motivational interviewing; provide individualized risk-reduction plans.',
    ideas: ['Identify one trigger', 'Practice a brief craving-management technique', 'Set one reduction goal', 'Name a healthier alternative', 'Make a simple coping plan for high-risk situations'],
    am: [
      { id: 'sub-am-1', text: 'What is my substance-use goal today?', type: 'choice', options: ['Abstain today', 'Stay within my limit', 'Cut back from yesterday'] },
      { id: 'sub-am-2', text: 'If my goal is to reduce use, what is my specific limit or plan?', type: 'text' },
      { id: 'sub-am-3', text: 'Why does making this change matter to me?', type: 'text' },
      { id: 'sub-am-4', text: 'What triggers am I likely to encounter today, such as certain people, places, or stressful situations?', type: 'text' },
      { id: 'sub-am-5', text: 'What could I do instead if I experience an urge to use?', type: 'choice', options: ['Distract myself with an activity', 'Use a grounding exercise', 'Contact a support person', 'Change my environment'] },
      { id: 'sub-am-6', text: 'Who could support me in reaching my goal today?', type: 'text' },
    ],
    pm: [
      { id: 'sub-pm-1', text: 'Did I meet my substance-use goal today?', type: 'yesno' },
      { id: 'sub-pm-2', text: 'If I used, what situations, emotions, or triggers contributed to it?', type: 'text' },
      { id: 'sub-pm-3', text: 'What coping strategy could I try next time?', type: 'text' },
      { id: 'sub-pm-4', text: 'What did I gain today by following my plan, even if I only made partial progress?', type: 'text' },
    ],
    wk: ['What situations increased my risk of using this week?', 'Which coping strategies or supports were most helpful?', 'What is one adjustment I can make to support my goal next week?'],
    resources: [
      { kind: 'Coping list', title: 'Craving toolkit: distract, ground, call someone, change place', len: 3, energy: 'Any energy' },
      { kind: 'Audio', title: '3-minute urge surfing', len: 3, energy: 'Any energy' },
    ],
    note: 'Questions should follow the individual treatment plan and risk level, particularly where reducing use could involve withdrawal concerns. The provider selects or writes these.',
  },
];
const DOM = Object.fromEntries(DOMAINS.map(d => [d.id, d]));

/* quick-log buttons. Sensitive ones are provider-only and off by default. */
const QUICKLOG = [
  { id: 'drink', label: 'Drink', short: 'Drink', icon: 'wine', on: true },
  { id: 'food', label: 'Unplanned snack', short: 'Snack', icon: 'cookie', on: true },
  { id: 'urge', label: 'Craving', short: 'Craving', icon: 'flame', on: false },
  { id: 'smoke', label: 'Cigarette', short: 'Smoke', icon: 'cigarette', on: false },
  { id: 'intimacy', label: 'Sexual activity', short: 'Intimacy', icon: 'heart', on: false, sensitive: true, note: 'Provider decides if this is clinically useful.' },
  { id: 'drip', label: 'Self-harm urge', short: 'Urge', icon: 'droplet', on: false, sensitive: true, note: 'If used, show crisis resources (988) right away. Confirm with the practitioner first.' },
];

/* ===== Patients: the list comes from HK.data.patients (see hk-data.js). Nothing is generated here. =====
   A patient record: { id, name, email, state: 'active'|'invited'|'none', fav, age, pronouns, goal, invitedOn,
   lengthChosen, lengthNow, unlocked: [cardId], series: [{ d: 'YYYY-MM-DD', score: 0-100 | null }], lastActiveAt?: ISO datetime } */
const PATIENTS = [];
const PAT = {};
function hkLoadPatients(list) {
  PATIENTS.length = 0; Object.keys(PAT).forEach(k => delete PAT[k]);
  (list || []).forEach(r => {
    const p = { fav: false, age: null, pronouns: '', goal: '', invitedOn: null, ...r };
    p.lengthNow = r.lengthNow || r.lengthChosen || 'standard'; p.lengthChosen = r.lengthChosen || 'standard';
    p.unlocked = [...(r.unlocked || [])];
    p.series = (r.series && r.series.length ? r.series : [{ d: iso(TODAY), score: null }]).map(x => ({ d: typeof x.d === 'string' ? parseISO(x.d) : x.d, score: x.score == null ? null : x.score }));
    if (r.start && !r.series) p.series[0].d = parseISO(r.start);
    applyState(p); PATIENTS.push(p); PAT[p.id] = p;
  });
}

function applyState(p) {
  Object.assign(p, analyze(p));
  if (p.state === 'invited') { p.status = 'invited'; p.reason = `Invite sent ${p.invitedOn || 'recently'}`; p.lastActive = '—'; p.today = null; }
  else if (p.state === 'none') { p.status = 'none'; p.reason = 'Added, not invited yet'; p.lastActive = '—'; p.today = null; }
  else if (window.__hkBooted) syncLastActiveOne(p);
}

function analyze(p) {
  const s = p.series; let li = s.length - 1; while (li >= 0 && s[li].score == null) li--;
  if (li < 0) return { today: null, lastDate: null, daysSince: 0, delta7: 0, lastActive: 'No check-ins yet', status: 'new', reason: 'Account created, waiting for the first check-in', checkins: 0 };
  const last = s[li];
  const since = dayDiff(TODAY, last.d);
  const lastN = s.slice(-7).map(x => x.score), prevN = s.slice(-28, -7).map(x => x.score);
  const w1 = mean(lastN), w0 = mean(prevN);
  const delta = w1 != null && w0 != null ? w1 - w0 : 0;
  const count = s.filter(x => x.score != null).length;
  let clock = ''; if (p.lastActiveAt) { const t = new Date(p.lastActiveAt), h = t.getHours(); clock = `, ${((h + 11) % 12) + 1}:${String(t.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; }
  const lastActive = since === 0 ? `Today${clock}` : since === 1 ? `Yesterday${clock}` : `${since} days ago`;
  let status = 'good', reason = 'Goals mostly met this week';
  if (count < 14) { status = 'new'; reason = `Started ${dayDiff(TODAY, s[0].d)} days ago`; }
  else if (since >= 3) { status = 'attention'; reason = `No check-in for ${since} days`; }
  else if (delta <= -9) { status = 'attention'; reason = p.flag || `Score down ${Math.round(-delta)} points this week`; }
  else if (delta <= -4 || since === 2) { status = 'watch'; reason = since === 2 ? 'Missed the last two days' : `Score slipping, down ${Math.round(-delta)} points`; }
  else if (delta >= 6) { reason = `Score up ${Math.round(delta)} points this week`; }
  return { today: last.score, lastDate: last.d, daysSince: since, delta7: delta, lastActive, status, reason, checkins: count };
}

/* card scores for one day: comes from the adapter (real values), never generated here */
function domainScores(p, d, score) {
  const got = HK.provider.domainScores(p, d, score) || {}, out = {};
  p.unlocked.forEach(k => { out[k] = score == null || got[k] == null ? null : Math.round(got[k]); });
  return out;
}

const initials = n => n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
const STATUS_LABEL = { good: ['On track', 'good', 'circle-check'], watch: ['Keep an eye', 'warn', 'eye'], attention: ['Needs attention', 'bad', 'triangle-alert'], new: ['New on the app', 'info', 'sprout'], invited: ['Invite sent', 'info', 'mail'], none: ['Not invited', '', 'user-plus'] };
const LENGTH = { quick: { name: 'Quick', min: 1 }, standard: { name: 'Standard', min: 3 }, extended: { name: 'Extended', min: 5 } };
