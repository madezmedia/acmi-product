// Mock data for ACMI Ops Center — editorial/content fleet flavoring

const INSTANCES = [
  { id: 'mz-prod',     name: 'madezmedia / production', short: 'mz-prod',  agents: 22, status: 'ok',   tenant: 'madezmedia.io', region: 'us-east-1', current: true },
  { id: 'mz-staging',  name: 'madezmedia / staging',    short: 'mz-stage', agents:  8, status: 'ok',   tenant: 'staging.madezmedia.io', region: 'us-east-1' },
  { id: 'client-vox',  name: 'Vox Editorial',           short: 'vox-ed',   agents: 14, status: 'warn', tenant: 'vox.client.acmi', region: 'us-west-2' },
  { id: 'personal',    name: 'personal / weekend',      short: 'p-mez',    agents:  3, status: 'ok',   tenant: 'mez.local',     region: 'local' },
];

// Org tree — editorial agency flavor
const FLEET = {
  id: 'bentley',
  label: 'bentley',
  role: 'editor-in-chief',
  status: 'ok',
  framework: 'orchestrator',
  expanded: true,
  children: [
    {
      id: 'newsroom',
      label: 'newsroom',
      role: 'team',
      framework: 'langgraph',
      expanded: true,
      children: [
        { id: 'lg-margaux',  label: 'margaux',   role: 'features writer', framework: 'langgraph', status: 'ok',   model: 'claude-sonnet-4-5', last: '2m', signals: 84 },
        { id: 'lg-otto',     label: 'otto',      role: 'reporter',        framework: 'langgraph', status: 'ok',   model: 'claude-sonnet-4-5', last: '11s', signals: 92, hitl: false, busy: true },
        { id: 'lg-priya',    label: 'priya',     role: 'investigations',  framework: 'langgraph', status: 'warn', model: 'claude-opus-4',  last: '4m', signals: 71 },
        { id: 'lg-ines',     label: 'ines',      role: 'columnist',       framework: 'langgraph', status: 'ok',   model: 'claude-haiku-4-5', last: '38s', signals: 66 },
      ],
    },
    {
      id: 'desk',
      label: 'copy-desk',
      role: 'team',
      framework: 'crewai',
      expanded: true,
      children: [
        { id: 'cr-hollis',   label: 'hollis',    role: 'copy editor',     framework: 'crewai',    status: 'ok',   model: 'claude-haiku-4-5', last: '1m', signals: 78, hitl: true },
        { id: 'cr-saoirse',  label: 'saoirse',   role: 'fact-checker',    framework: 'crewai',    status: 'ok',   model: 'claude-sonnet-4-5', last: '20s', signals: 88 },
        { id: 'cr-julien',   label: 'julien',    role: 'style guide',     framework: 'crewai',    status: 'idle', model: 'claude-haiku-4-5', last: '12m', signals: 41 },
      ],
    },
    {
      id: 'art',
      label: 'art-dept',
      role: 'team',
      framework: 'agno',
      expanded: false,
      children: [
        { id: 'ag-vera',     label: 'vera',      role: 'art director',    framework: 'agno',      status: 'ok',   model: 'claude-opus-4',     last: '5m',  signals: 73 },
        { id: 'ag-felix',    label: 'felix',     role: 'illustration',    framework: 'agno',      status: 'err',  model: 'claude-sonnet-4-5', last: '47m', signals: 12 },
      ],
    },
    {
      id: 'ops',
      label: 'distribution',
      role: 'team',
      framework: 'autogen',
      expanded: true,
      children: [
        { id: 'ad-niko',     label: 'niko',      role: 'social ops',      framework: 'autogen',   status: 'ok',   model: 'claude-haiku-4-5', last: '8s',  signals: 95 },
        { id: 'ad-thea',     label: 'thea',      role: 'newsletter',      framework: 'autogen',   status: 'ok',   model: 'claude-sonnet-4-5', last: '2m',  signals: 81 },
        { id: 'ad-bram',     label: 'bram',      role: 'syndication',     framework: 'autogen',   status: 'warn', model: 'claude-haiku-4-5', last: '6m',  signals: 58 },
      ],
    },
  ],
};

// Flatten fleet for searches
function flattenFleet(node, out = []) {
  if (!node.children) {
    out.push(node);
  } else {
    if (node.id !== 'bentley' && !['newsroom','desk','art','ops'].includes(node.id)) out.push(node);
    node.children.forEach(c => flattenFleet(c, out));
  }
  return out;
}
const ALL_AGENTS = flattenFleet(FLEET);

// Pipeline / workflow steps
const PIPELINE = [
  { id: 'intake',    name: 'Brief intake',    fw: 'langgraph', agent: 'otto',     status: 'done' },
  { id: 'research',  name: 'Source research', fw: 'langgraph', agent: 'priya',    status: 'done' },
  { id: 'draft',     name: 'Draft',           fw: 'langgraph', agent: 'margaux',  status: 'active' },
  { id: 'fact',      name: 'Fact-check',     fw: 'crewai',     agent: 'saoirse',  status: 'queued' },
  { id: 'copy',      name: 'Copy edit',      fw: 'crewai',     agent: 'hollis',   status: 'queued', hitl: true },
  { id: 'art',       name: 'Art direction',  fw: 'agno',       agent: 'vera',     status: 'queued' },
  { id: 'publish',   name: 'Publish',        fw: 'autogen',    agent: 'thea',     status: 'queued' },
];

// Kanban
const KANBAN = {
  DRAFT: [
    { id: 'STORY-841', title: 'On the quiet rebellion of small magazines', owner: 'margaux', age: '14h', evidence: 4, fw: 'lg' },
    { id: 'STORY-844', title: 'A river of fonts',                          owner: 'ines',    age: '6h',  evidence: 2, fw: 'lg' },
    { id: 'STORY-849', title: 'After the algorithm: longform returns',     owner: 'otto',    age: '40m', evidence: 7, fw: 'lg', live: true },
  ],
  READY: [
    { id: 'STORY-836', title: 'The economics of independent bookstores',   owner: 'priya',   age: '2d',  evidence: 11, fw: 'lg' },
    { id: 'STORY-839', title: 'Profile: paper-makers of Awagami',          owner: 'margaux', age: '1d',  evidence: 6,  fw: 'lg' },
  ],
  SHIPPED: [
    { id: 'STORY-832', title: 'Letter from a former editor',               owner: 'hollis',  age: '4h',  evidence: 3,  fw: 'cr' },
  ],
  DEPLOYED: [
    { id: 'STORY-829', title: 'Why we still print',                        owner: 'thea',    age: '12h', evidence: 5,  fw: 'ad' },
    { id: 'STORY-825', title: 'Three women, one zine',                     owner: 'ines',    age: '1d',  evidence: 8,  fw: 'lg' },
  ],
  LIVE: [
    { id: 'STORY-820', title: 'The last letterpress in Brooklyn',          owner: 'margaux', age: '3d',  evidence: 9,  fw: 'lg' },
  ],
};

// Comms thread
const COMMS = [
  { id: 1, who: 'otto',     fw: 'lg',  role: 'reporter',
    text: "Sources confirmed for the Awagami profile — three master papermakers agreed to interviews. Drafting outline now.",
    time: '14:02', replies: 1 },
  { id: 2, who: 'priya',    fw: 'lg',  role: 'investigations',
    text: "Cross-referenced the small-magazine economics piece against the 2019 IRS data. Numbers hold. Pushing to READY.",
    time: '14:08' },
  { id: 3, who: 'human',    fw: 'human', role: 'editor',
    text: "Hollis — pause on STORY-832 line edits. Want to read it once more before fact-check.",
    time: '14:11', replies: 2 },
  { id: 4, who: 'hollis',   fw: 'cr',  role: 'copy editor',
    text: "Acknowledged. Holding at line 47. Pushing the open queue to saoirse for parallel review.",
    time: '14:11', quote: 3 },
  { id: 5, who: 'system',   fw: 'sys', role: 'system',
    text: "HITL gate triggered: copy.edit/STORY-832/approve — awaiting human input.",
    time: '14:12', payload: '{"agent":"hollis","gate":"approve","ttl":"24h"}' },
  { id: 6, who: 'margaux',  fw: 'lg',  role: 'features writer',
    text: "Final draft on STORY-849 is ready for fact-check. The quiet rebellion thesis holds across all four interviews.",
    time: '14:17', replies: 0 },
  { id: 7, who: 'saoirse',  fw: 'cr',  role: 'fact-checker',
    text: "Picking up STORY-849. Two claims flagged for citation; will return them within the hour.",
    time: '14:18' },
];

// Live-ish event stream (will be appended to)
const SEED_EVENTS = [
  { t: '14:18:42', a: 'saoirse', kind: 'state', text: 'transitioned ASSIGNED → REVIEWING',     fw: 'cr', tone: 'ok' },
  { t: '14:18:31', a: 'margaux', kind: 'emit',  text: 'profile.updated tokens=12,431',          fw: 'lg', tone: 'ok' },
  { t: '14:18:14', a: 'otto',    kind: 'tool',  text: 'web.fetch(awagami.co.jp/process)',       fw: 'lg', tone: 'ok' },
  { t: '14:17:58', a: 'hollis',  kind: 'gate',  text: 'HITL gate opened (copy.edit/approve)',   fw: 'cr', tone: 'warn' },
  { t: '14:17:30', a: 'felix',   kind: 'err',   text: 'tool.timeout(image.gen) — retrying 1/3', fw: 'ag', tone: 'err' },
  { t: '14:16:55', a: 'priya',   kind: 'emit',  text: 'signals.push(confidence=0.88)',          fw: 'lg', tone: 'ok' },
  { t: '14:16:21', a: 'vera',    kind: 'tool',  text: 'figma.query(brand.guidelines)',          fw: 'ag', tone: 'ok' },
  { t: '14:15:48', a: 'niko',    kind: 'emit',  text: 'distribution.scheduled (linkedin, 14)',  fw: 'ad', tone: 'ok' },
  { t: '14:15:09', a: 'thea',    kind: 'state', text: 'newsletter.draft → READY',               fw: 'ad', tone: 'ok' },
  { t: '14:14:36', a: 'ines',    kind: 'tool',  text: 'archive.search(letterpress, 1924-)',     fw: 'lg', tone: 'ok' },
];

// Possible new events used for live timeline
const EVENT_POOL = [
  { kind: 'tool',  text: 'archive.search(quote-of-the-day)',          tone: 'ok' },
  { kind: 'emit',  text: 'profile.updated last_signal=now',           tone: 'ok' },
  { kind: 'state', text: 'queued → in_progress',                       tone: 'ok' },
  { kind: 'tool',  text: 'web.fetch(typeofnewspapers.com)',           tone: 'ok' },
  { kind: 'emit',  text: 'signals.push(latency_p95=420ms)',           tone: 'ok' },
  { kind: 'gate',  text: 'HITL gate ping (still waiting)',            tone: 'warn' },
  { kind: 'tool',  text: 'redis.xadd(timeline:bentley)',              tone: 'ok' },
  { kind: 'emit',  text: 'profile.updated tokens=8,201',              tone: 'ok' },
];

// Detail-panel signals (gauge data)
const SIGNALS = {
  'lg-margaux': [
    { k: 'task.completion',    v: 0.84, t: 'gauge', meta: '7d avg' },
    { k: 'evidence.density',   v: 0.71, t: 'gauge', meta: '6 sources / story' },
    { k: 'reply.latency.p95',  v: '420ms', t: 'kv'  },
    { k: 'tokens.window',      v: '12,431 / 200k', t: 'kv' },
    { k: 'cost.7d',            v: '$24.18', t: 'kv' },
    { k: 'tool.calls.7d',      v: '1,204', t: 'kv' },
    { k: 'errors.7d',          v: '2 (0.1%)', t: 'kv' },
  ],
};

window.ACMI = {
  INSTANCES, FLEET, ALL_AGENTS, PIPELINE, KANBAN, COMMS,
  SEED_EVENTS, EVENT_POOL, SIGNALS,
  flattenFleet,
};
