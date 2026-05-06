// Agent detail panel — Profile / Signals / Timeline / HITL

function AgentDetail({ agentId, onClose, hitlActive, onApprove, onReject, onTrigger }) {
  const [tab, setTab] = React.useState('profile');
  const agent = window.ACMI.ALL_AGENTS.find(a => a.id === agentId);

  React.useEffect(() => {
    if (hitlActive && agent && (agent.id === 'cr-hollis' || agent.hitl)) {
      setTab('hitl');
    }
  }, [hitlActive, agentId]);

  if (!agent) {
    return (
      <div className="ad-empty">
        <div style={{textAlign:'center', maxWidth:300}}>
          <div className="meta" style={{marginBottom:8}}>No agent selected</div>
          <p className="serif" style={{fontSize:18, color:'var(--ink-3)', lineHeight:1.4}}>Click an agent in the fleet tree to see profile, signals, timeline, and HITL queue.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ad">
      <div className="ad-hd">
        <div className="ad-hd-l">
          <Dot status={agent.status} pulse />
          <div>
            <div className="row gap-2" style={{alignItems:'baseline'}}>
              <h3 className="mono" style={{fontFamily:'var(--mono)', fontSize:18, fontWeight:600, color:'var(--ink-1)'}}>{agent.label}</h3>
              <span className="meta" style={{textTransform:'none', letterSpacing:0, fontSize:13, color:'var(--ink-3)'}}>· {agent.role}</span>
            </div>
            <div className="row gap-3" style={{marginTop:4}}>
              <FwPill fw={agent.framework} />
              <span className="mono" style={{fontSize:11, color:'var(--ink-4)'}}>{agent.model}</span>
              <span className="mono" style={{fontSize:11, color:'var(--ink-4)'}}>· last signal {agent.last} ago</span>
            </div>
          </div>
        </div>
        <div className="row gap-2">
          <button className="btn ghost" onClick={onTrigger} title="Trigger HITL gate (demo)">↯ Trigger HITL</button>
          <button className="btn">Open in Redis</button>
          <button className="btn ghost" onClick={onClose}>×</button>
        </div>
      </div>

      <div className="ad-tabs">
        {[
          { k: 'profile',  l: 'Profile' },
          { k: 'signals',  l: 'Signals' },
          { k: 'timeline', l: 'Timeline' },
          { k: 'hitl',     l: 'HITL', badge: (agent.hitl || hitlActive) ? '1' : null, glow: hitlActive },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} data-active={tab === t.k} className={t.glow ? 'hitl-glow' : ''}>
            {t.l}
            {t.badge && <span className="ad-tab-badge">{t.badge}</span>}
          </button>
        ))}
      </div>

      <div className="ad-bd">
        {tab === 'profile' && <ProfileTab agent={agent} />}
        {tab === 'signals' && <SignalsTab agent={agent} />}
        {tab === 'timeline' && <TimelineTab agent={agent} />}
        {tab === 'hitl' && <HitlTab agent={agent} hitlActive={hitlActive} onApprove={onApprove} onReject={onReject} />}
      </div>
    </div>
  );
}

function ProfileTab({ agent }) {
  const profile = [
    { k: 'agent.id',       v: agent.id },
    { k: 'role',           v: agent.role },
    { k: 'tenant',         v: 'madezmedia.io' },
    { k: 'framework',      v: agent.framework },
    { k: 'model',          v: agent.model },
    { k: 'version',        v: 'v3.2.1' },
    { k: 'capabilities',   v: 'web.fetch, archive.search, redis.timeline, signals.emit' },
    { k: 'redis.key',      v: `acmi:profile:${agent.id}` },
    { k: 'created',        v: '2026-03-14T09:22:11Z' },
    { k: 'last_deployed',  v: '2026-04-29T11:08:33Z' },
  ];
  const persona = `A staff ${agent.role} in the madezmedia newsroom. Operates with editorial restraint: prefers fewer, well-evidenced claims over comprehensive coverage. Will not file a draft without at least three independent sources and will flag a fact-check pause for any quoted figure older than 24 months.`;
  return (
    <div className="ad-grid">
      <section className="ad-section">
        <div className="meta" style={{marginBottom:8}}>Identity</div>
        <dl className="kv">
          {profile.map(p => (
            <React.Fragment key={p.k}>
              <dt>{p.k}</dt>
              <dd className="mono">{p.v}</dd>
            </React.Fragment>
          ))}
        </dl>
      </section>
      <section className="ad-section">
        <div className="meta" style={{marginBottom:8}}>Persona</div>
        <p className="serif" style={{fontSize:15, lineHeight:1.55, color:'var(--ink-2)', textWrap:'pretty'}}>{persona}</p>
        <hr className="rule dotted" />
        <div className="meta" style={{marginBottom:8}}>Connections</div>
        <div className="ad-conn">
          <div className="ad-conn-pill mono">→ saoirse <span style={{color:'var(--ink-4)'}}>(fact-check handoff)</span></div>
          <div className="ad-conn-pill mono">→ vera <span style={{color:'var(--ink-4)'}}>(art brief)</span></div>
          <div className="ad-conn-pill mono">← bentley <span style={{color:'var(--ink-4)'}}>(assignments)</span></div>
        </div>
      </section>
    </div>
  );
}

function SignalsTab({ agent }) {
  const signals = window.ACMI.SIGNALS['lg-margaux'];
  const gauges = signals.filter(s => s.t === 'gauge');
  const kvs = signals.filter(s => s.t === 'kv');

  return (
    <div className="ad-grid">
      <section className="ad-section">
        <div className="meta" style={{marginBottom:12}}>Performance gauges · 7-day</div>
        <div className="gauge-grid">
          {gauges.map(g => (
            <div key={g.k} className="gauge">
              <svg viewBox="0 0 100 60" width="100%" height="80">
                <path d="M 10 55 A 40 40 0 0 1 90 55" fill="none" stroke="var(--divider)" strokeWidth="6" strokeLinecap="round" />
                <path d="M 10 55 A 40 40 0 0 1 90 55"
                      fill="none" stroke="var(--forest)" strokeWidth="6" strokeLinecap="round"
                      strokeDasharray="125.6" strokeDashoffset={125.6 * (1 - g.v)} />
                <text x="50" y="45" textAnchor="middle" fontFamily="Source Serif 4" fontSize="20" fontWeight="700" fill="var(--ink-1)">
                  {(g.v * 100).toFixed(0)}
                </text>
                <text x="68" y="45" fontFamily="Inter" fontSize="9" fill="var(--ink-4)">%</text>
              </svg>
              <div className="gauge-k mono">{g.k}</div>
              <div className="gauge-meta">{g.meta}</div>
            </div>
          ))}
        </div>
      </section>
      <section className="ad-section">
        <div className="meta" style={{marginBottom:12}}>Operational signals</div>
        <dl className="kv">
          {kvs.map(s => (
            <React.Fragment key={s.k}>
              <dt>{s.k}</dt>
              <dd className="mono">{s.v}</dd>
            </React.Fragment>
          ))}
        </dl>
        <hr className="rule dotted" />
        <div className="meta" style={{marginBottom:8}}>Sparkline · tokens / hour</div>
        <svg viewBox="0 0 320 60" width="100%" height="60" style={{display:'block'}}>
          <polyline fill="none" stroke="var(--forest)" strokeWidth="1.5"
            points="0,40 20,35 40,42 60,30 80,38 100,22 120,28 140,18 160,32 180,12 200,24 220,16 240,28 260,22 280,30 300,18 320,26" />
          <polyline fill="rgba(45,74,62,.10)" stroke="none"
            points="0,40 20,35 40,42 60,30 80,38 100,22 120,28 140,18 160,32 180,12 200,24 220,16 240,28 260,22 280,30 300,18 320,26 320,60 0,60" />
        </svg>
      </section>
    </div>
  );
}

function TimelineTab({ agent }) {
  const items = [
    { t: '14:18:31', kind: 'emit',  text: 'profile.updated tokens=12,431', tone: 'ok' },
    { t: '14:17:02', kind: 'tool',  text: 'archive.search("awagami papermaking")', tone: 'ok' },
    { t: '14:15:48', kind: 'emit',  text: 'signals.push(confidence=0.88)', tone: 'ok' },
    { t: '14:12:17', kind: 'state', text: 'transitioned DRAFT → REVIEWING', tone: 'ok' },
    { t: '14:08:44', kind: 'tool',  text: 'web.fetch(awagami.co.jp/process)', tone: 'ok' },
    { t: '14:04:11', kind: 'emit',  text: 'profile.updated last_signal=14:04:11', tone: 'ok' },
    { t: '13:58:36', kind: 'gate',  text: 'HITL gate cleared (assignment.scope)', tone: 'warn' },
    { t: '13:51:08', kind: 'tool',  text: 'redis.xadd(timeline:bentley)', tone: 'ok' },
    { t: '13:47:55', kind: 'emit',  text: 'signals.push(latency_p95=380ms)', tone: 'ok' },
    { t: '13:42:30', kind: 'state', text: 'spawned by bentley · seed=STORY-849', tone: 'ok' },
  ];
  return (
    <div className="ad-section">
      <div className="row" style={{justifyContent:'space-between', marginBottom:10}}>
        <div className="meta">Timeline · most recent first</div>
        <div className="row gap-2">
          <span className="mono" style={{fontSize:11, color:'var(--ink-4)'}}>redis://acmi:timeline:{agent.id}</span>
          <button className="btn ghost" style={{fontSize:11}}>Export JSONL</button>
        </div>
      </div>
      <ul className="evt-list" style={{borderTop:'1px solid var(--divider)'}}>
        {items.map((e, i) => (
          <li key={i} className="evt-row" style={{padding:'7px 0', gridTemplateColumns:'70px 10px 60px 1fr'}}>
            <span className="evt-time mono">{e.t}</span>
            <span className={`evt-dot ${e.tone}`} />
            <span className="evt-kind mono">{e.kind}</span>
            <span className="evt-text mono">{e.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HitlTab({ agent, hitlActive, onApprove, onReject }) {
  const [decision, setDecision] = React.useState(null);
  const handle = (kind) => {
    setDecision(kind);
    if (kind === 'approve') onApprove();
    if (kind === 'reject') onReject();
  };

  if (!hitlActive && !agent.hitl) {
    return (
      <div className="ad-section" style={{textAlign:'center', padding:'40px 20px'}}>
        <div style={{fontSize:32, marginBottom:8}}>✓</div>
        <div className="meta" style={{marginBottom:6}}>HITL queue empty</div>
        <p style={{color:'var(--ink-4)'}}>No human approvals required for this agent.</p>
      </div>
    );
  }

  return (
    <div className={`ad-section hitl-card ${hitlActive ? 'active' : ''}`}>
      <div className="hitl-card-hd">
        <div>
          <div className="meta" style={{color:'var(--warn)'}}>✋ Human approval required</div>
          <h3 className="serif" style={{fontSize:22, marginTop:4, color:'var(--ink-1)'}}>Copy edit · STORY-832</h3>
          <p style={{marginTop:6, color:'var(--ink-3)'}}>
            <span className="mono">hollis</span> has finished line edits and is requesting your sign-off before fact-check enters parallel review.
          </p>
        </div>
        <div className="hitl-meta">
          <div><span className="mono" style={{color:'var(--ink-4)'}}>gate:</span> <span className="mono">copy.edit/approve</span></div>
          <div><span className="mono" style={{color:'var(--ink-4)'}}>opened:</span> <span className="mono">14:17:58</span></div>
          <div><span className="mono" style={{color:'var(--ink-4)'}}>ttl:</span> <span className="mono">23h 41m remaining</span></div>
        </div>
      </div>

      <div className="hitl-diff">
        <div className="meta" style={{marginBottom:8}}>Proposed changes · 3 edits</div>
        <pre className="hitl-diff-body mono">
{`@@ line 47 @@
- Editors say the trade is dying.
+ Editors describe the trade as in retreat — though the data on
+ small-press circulation tells a more complicated story.

@@ line 62 @@
- The 2019 IRS data shows...
+ IRS Form 990 filings from 2019 show...

@@ line 88 @@
- "It's never been worse," she says.
+ "It's never been worse," she said in our March interview.`}
        </pre>
      </div>

      <div className="hitl-actions">
        {decision && (
          <div className="hitl-decided" data-kind={decision}>
            {decision === 'approve' && <>✓ Approved · pushing to fact-check queue</>}
            {decision === 'reject' && <>✕ Rejected · returning to <span className="mono">@hollis</span> with notes</>}
            {decision === 'edit' && <>↻ Editing · opening inline editor</>}
            {decision === 'defer' && <>⏸ Deferred · re-queued for 6h</>}
          </div>
        )}
        {!decision && (
          <>
            <button className="btn ok"   onClick={() => handle('approve')}>✓ Approve <span className="kbd" style={{marginLeft:6, background:'rgba(74,124,89,.15)', borderColor:'rgba(74,124,89,.3)', color:'#2f5a3a'}}>A</span></button>
            <button className="btn warn" onClick={() => handle('edit')}>✎ Edit  <span className="kbd" style={{marginLeft:6, background:'rgba(184,134,45,.15)', borderColor:'rgba(184,134,45,.3)', color:'#8a611c'}}>E</span></button>
            <button className="btn err"  onClick={() => handle('reject')}>✕ Reject <span className="kbd" style={{marginLeft:6, background:'rgba(185,74,58,.15)', borderColor:'rgba(185,74,58,.3)', color:'#8a3325'}}>R</span></button>
            <button className="btn ghost" onClick={() => handle('defer')}>⏸ Defer 6h</button>
            <span style={{flex:1}}></span>
            <span className="meta" style={{fontSize:11}}>j/k to navigate · ⌘↵ to confirm</span>
          </>
        )}
      </div>
    </div>
  );
}

const adCss = `
.ad { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--paper); }
.ad-empty { display: grid; place-items: center; height: 100%; color: var(--ink-4); padding: 40px; }
.ad-hd {
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 18px 24px; border-bottom: 1px solid var(--divider); background: var(--paper);
  gap: 16px;
}
.ad-hd-l { display: flex; align-items: flex-start; gap: 14px; }
.ad-hd-l > .sd { margin-top: 8px; }
.ad-tabs { display: flex; gap: 0; padding: 0 24px; border-bottom: 1px solid var(--divider); background: var(--paper); flex-shrink: 0; }
.ad-tabs button {
  appearance: none; background: transparent; border: 0;
  padding: 10px 16px; font-family: var(--sans); font-size: 12.5px; font-weight: 500;
  color: var(--ink-4); cursor: pointer;
  border-bottom: 2px solid transparent;
  letter-spacing: -0.005em;
  display: inline-flex; align-items: center; gap: 6px;
  transition: all 160ms var(--ease);
  margin-bottom: -1px;
}
.ad-tabs button:hover { color: var(--ink-1); }
.ad-tabs button[data-active="true"] { color: var(--forest-deep); border-bottom-color: var(--forest); }
.ad-tab-badge {
  display: inline-grid; place-items: center;
  min-width: 16px; height: 16px; padding: 0 4px;
  font-family: var(--mono); font-size: 10px; font-weight: 600;
  background: var(--warn-bright); color: #5a4815;
  border-radius: var(--r-pill);
}
.ad-bd { flex: 1; overflow: auto; padding: 20px 24px; }
.ad-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.ad-section {
  background: var(--paper);
  border: 1px solid var(--divider);
  border-radius: var(--r-md);
  padding: 16px 18px;
}
.kv {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 6px 14px;
  margin: 0;
}
.kv dt { font-family: var(--mono); font-size: 11.5px; color: var(--ink-4); }
.kv dd { margin: 0; font-size: 12.5px; color: var(--ink-1); overflow: hidden; text-overflow: ellipsis; }
.ad-conn { display: flex; flex-direction: column; gap: 6px; }
.ad-conn-pill {
  background: var(--paper-elev);
  border: 1px solid var(--divider);
  border-radius: var(--r-md);
  padding: 6px 10px; font-size: 12px; color: var(--ink-2);
}
.gauge-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.gauge { background: var(--paper-elev); border: 1px solid var(--divider); border-radius: var(--r-md); padding: 12px; text-align: center; }
.gauge-k { font-size: 11px; color: var(--ink-2); margin-top: 4px; }
.gauge-meta { font-size: 10px; color: var(--ink-5); margin-top: 2px; }

.hitl-card { animation: slide-up 360ms var(--ease); border-color: var(--warn-bright) !important; background: linear-gradient(180deg, rgba(234,179,8,.04), var(--paper) 60%); }
.hitl-card.active { box-shadow: 0 0 0 4px rgba(234,179,8,.10); }
.hitl-card-hd { display: flex; gap: 24px; justify-content: space-between; align-items: flex-start; padding-bottom: 14px; border-bottom: 1px dashed var(--border); }
.hitl-meta { font-size: 11.5px; color: var(--ink-3); display: flex; flex-direction: column; gap: 4px; text-align: right; }
.hitl-diff { padding: 14px 0; }
.hitl-diff-body {
  font-size: 12px; line-height: 1.6;
  background: var(--paper-elev);
  border: 1px solid var(--divider);
  border-radius: var(--r-sm);
  padding: 12px 14px;
  margin: 0;
  overflow-x: auto;
  color: var(--ink-2);
  white-space: pre;
}
.hitl-actions { display: flex; align-items: center; gap: 8px; padding-top: 12px; border-top: 1px solid var(--divider); flex-wrap: wrap; }
.hitl-decided { font-size: 13px; color: var(--ink-1); padding: 8px 12px; background: var(--paper-elev); border-radius: var(--r-md); border: 1px solid var(--divider); }
.hitl-decided[data-kind="approve"] { color: #2f5a3a; background: rgba(74,124,89,.10); border-color: rgba(74,124,89,.3); }
.hitl-decided[data-kind="reject"]  { color: #8a3325; background: rgba(185,74,58,.10); border-color: rgba(185,74,58,.3); }
`;
(function injectAdCss() {
  if (document.getElementById('acmi-ad-css')) return;
  const s = document.createElement('style');
  s.id = 'acmi-ad-css';
  s.textContent = adCss;
  document.head.appendChild(s);
})();

window.AgentDetail = AgentDetail;
