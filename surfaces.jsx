// Surfaces: Landing hero, Architecture diagram, HITL spotlight, Switcher view

function LandingHero({ onEnter, instances, current }) {
  return (
    <div className="landing">
      <div className="landing-rule" />
      <div className="landing-grid">
        <div className="landing-l">
          <div className="meta">Issue №47 · Operations Edition · 2026</div>
          <h1 className="serif" style={{marginTop:18}}>The Ops Center<br/>for AI agent fleets.</h1>
          <p className="serif landing-lede">
            ACMI — the Agent Coordination &amp; Management Interface — is an open protocol
            for fleets of AI agents. Three slots per entity: <em>profile, signals, timeline.</em>
            One Redis. Any framework. This is the dashboard that watches all of them.
          </p>
          <div className="landing-cta">
            <button className="btn primary" style={{padding:'10px 18px', fontSize:13}} onClick={onEnter}>Open Ops Center →</button>
            <button className="btn" style={{padding:'10px 18px', fontSize:13}}>Read the protocol spec</button>
            <span className="kbd">⌘K</span>
            <span style={{color:'var(--ink-4)', fontSize:12}}>quick command</span>
          </div>
          <hr className="rule" />
          <div className="landing-stats">
            {[
              { k: 'agents online', v: '47', sub: 'across 4 instances' },
              { k: 'frameworks', v: '4', sub: 'lg, cr, ag, ad' },
              { k: 'events / min', v: '1.2k', sub: 'p95 380ms' },
              { k: 'hitl pending', v: '3', sub: 'avg wait 14m' },
            ].map(s => (
              <div key={s.k} className="landing-stat">
                <div className="landing-stat-v serif">{s.v}</div>
                <div className="meta">{s.k}</div>
                <div className="landing-stat-sub mono">{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="landing-r">
          <div className="meta" style={{marginBottom:10}}>Current instance</div>
          <div className="landing-instance">
            <div className="row gap-3" style={{marginBottom:10}}>
              <Dot status="ok" pulse />
              <span className="serif" style={{fontSize:18, fontWeight:600, color:'var(--ink-1)'}}>madezmedia / production</span>
            </div>
            <dl className="kv" style={{marginTop:10}}>
              <dt>tenant</dt><dd className="mono">madezmedia.io</dd>
              <dt>region</dt><dd className="mono">us-east-1</dd>
              <dt>redis</dt><dd className="mono">redis://upstash.io/6379</dd>
              <dt>protocol</dt><dd className="mono">acmi/v3</dd>
              <dt>connected</dt><dd className="mono">14h 22m</dd>
            </dl>
            <hr className="rule dotted" />
            <div className="meta" style={{marginBottom:8}}>Other instances</div>
            <ul className="landing-list">
              {instances.filter(i => i.id !== 'mz-prod').map(i => (
                <li key={i.id}>
                  <Dot status={i.status} />
                  <span className="mono" style={{fontSize:12, color:'var(--ink-1)'}}>{i.short}</span>
                  <span style={{color:'var(--ink-4)', fontSize:11, marginLeft:'auto'}}>{i.agents} agents</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="landing-quote">
            <div className="meta" style={{color:'var(--archive-deep)'}}>Marginalia</div>
            <p className="serif" style={{fontStyle:'italic', color:'var(--archive-deep)', fontSize:14, marginTop:6, lineHeight:1.5}}>
              "An ops center is just a newsroom for your software."
            </p>
            <div className="mono" style={{fontSize:10, color:'var(--archive)', marginTop:4}}>— b. mez, internal memo</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ArchitectureDiagram() {
  return (
    <div className="arch">
      <div className="arch-hd">
        <div className="meta">System Architecture · ACMI v3</div>
        <h2 className="serif" style={{marginTop:8}}>What connects to what.</h2>
        <p className="serif" style={{fontSize:15, lineHeight:1.55, color:'var(--ink-3)', maxWidth:640, marginTop:12}}>
          Three Redis slots per entity. Any framework writes; the Ops Center reads.
          The boundary between framework and protocol is the only contract that matters.
        </p>
      </div>
      <div className="arch-canvas">
        <svg viewBox="0 0 900 460" width="100%" height="460" style={{display:'block'}}>
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="var(--divider)" strokeWidth="0.5"/>
            </pattern>
            <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--ink-4)"/>
            </marker>
          </defs>
          <rect width="900" height="460" fill="url(#grid)" opacity="0.5"/>

          {/* Frameworks (left) */}
          <g>
            <text x="120" y="30" textAnchor="middle" fontFamily="Inter" fontSize="10" fontWeight="600" letterSpacing="2" fill="var(--ink-4)">FRAMEWORKS</text>
            {[
              { y: 60,  label: 'LangGraph',  color: '#c2602e', sub: 'agentic graphs' },
              { y: 130, label: 'CrewAI',     color: '#b8862d', sub: 'role-based crews' },
              { y: 200, label: 'Agno',       color: '#6b6f3e', sub: 'tool composition' },
              { y: 270, label: 'AutoGen',    color: '#8a4a4a', sub: 'multi-agent chat' },
              { y: 340, label: '+ adapter',  color: 'var(--ink-5)', sub: 'any python sdk' },
            ].map(b => (
              <g key={b.label}>
                <rect x="40" y={b.y} width="160" height="50" fill="var(--paper)" stroke={b.color} strokeWidth="1.5" rx="4"/>
                <text x="56" y={b.y+22} fontFamily="Source Serif 4" fontSize="14" fontWeight="600" fill="var(--ink-1)">{b.label}</text>
                <text x="56" y={b.y+38} fontFamily="JetBrains Mono" fontSize="10" fill="var(--ink-4)">{b.sub}</text>
                <line x1="200" y1={b.y+25} x2="280" y2={b.y+25} stroke="var(--ink-4)" strokeWidth="1" markerEnd="url(#arr)" />
              </g>
            ))}
          </g>

          {/* ACMI Protocol (center) */}
          <g>
            <text x="430" y="30" textAnchor="middle" fontFamily="Inter" fontSize="10" fontWeight="600" letterSpacing="2" fill="var(--forest)">ACMI PROTOCOL</text>
            <rect x="290" y="50" width="280" height="340" fill="rgba(45,74,62,.04)" stroke="var(--forest)" strokeWidth="1.5" rx="6"/>
            <text x="430" y="80" textAnchor="middle" fontFamily="Source Serif 4" fontSize="16" fontWeight="700" fill="var(--forest-deep)">Three slots per entity</text>

            {[
              { y: 110, k: 'profile',  d: 'identity, role, model, persona' },
              { y: 200, k: 'signals',  d: 'metrics, gauges, key-values' },
              { y: 290, k: 'timeline', d: 'append-only event stream' },
            ].map(s => (
              <g key={s.k}>
                <rect x="310" y={s.y} width="240" height="70" fill="var(--paper)" stroke="var(--forest-2)" strokeWidth="1" rx="4"/>
                <text x="324" y={s.y+22} fontFamily="JetBrains Mono" fontSize="12" fontWeight="600" fill="var(--forest-deep)">acmi:{s.k}:{`{id}`}</text>
                <text x="324" y={s.y+44} fontFamily="Source Serif 4" fontSize="13" fill="var(--ink-2)">{s.d}</text>
                <text x="324" y={s.y+60} fontFamily="JetBrains Mono" fontSize="10" fill="var(--ink-4)">redis hash · 1 write/sec budget</text>
              </g>
            ))}
            <text x="430" y="375" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="10" fill="var(--ink-4)">redis://upstash · sse fan-out · jsonl export</text>
          </g>

          {/* Consumers (right) */}
          <g>
            <text x="780" y="30" textAnchor="middle" fontFamily="Inter" fontSize="10" fontWeight="600" letterSpacing="2" fill="var(--ink-4)">CONSUMERS</text>
            {[
              { y: 60,  label: 'Ops Center',   sub: 'this dashboard',  hi: true },
              { y: 130, label: 'CLI',          sub: 'acmi tail / scan' },
              { y: 200, label: 'HITL Console', sub: 'approval queue' },
              { y: 270, label: 'Webhooks',     sub: 'alerts, paging' },
              { y: 340, label: 'Your script',  sub: 'redis client' },
            ].map(b => (
              <g key={b.label}>
                <line x1="580" y1={b.y+25} x2="660" y2={b.y+25} stroke="var(--ink-4)" strokeWidth="1" markerEnd="url(#arr)" />
                <rect x="660" y={b.y} width="180" height="50"
                      fill={b.hi ? 'var(--forest)' : 'var(--paper)'}
                      stroke={b.hi ? 'var(--forest-deep)' : 'var(--ink-4)'}
                      strokeWidth="1.5" rx="4"/>
                <text x="676" y={b.y+22} fontFamily="Source Serif 4" fontSize="14" fontWeight="600" fill={b.hi ? 'var(--paper)' : 'var(--ink-1)'}>{b.label}</text>
                <text x="676" y={b.y+38} fontFamily="JetBrains Mono" fontSize="10" fill={b.hi ? 'rgba(250,249,247,.7)' : 'var(--ink-4)'}>{b.sub}</text>
              </g>
            ))}
          </g>

          {/* Boundary labels */}
          <text x="245" y="430" textAnchor="middle" fontFamily="Inter" fontSize="9" letterSpacing="1.6" fill="var(--ink-5)">↑ WRITE BOUNDARY</text>
          <text x="615" y="430" textAnchor="middle" fontFamily="Inter" fontSize="9" letterSpacing="1.6" fill="var(--ink-5)">READ BOUNDARY ↑</text>
        </svg>
      </div>
    </div>
  );
}

const surfacesCss = `
.landing { padding: 60px 80px 40px; max-width: 1400px; margin: 0 auto; }
.landing-rule { width: 80px; height: 4px; background: var(--forest); margin-bottom: 24px; }
.landing-grid { display: grid; grid-template-columns: 1.6fr 1fr; gap: 80px; align-items: start; }
.landing-lede { font-size: 22px; line-height: 1.45; color: var(--ink-2); margin-top: 24px; max-width: 620px; letter-spacing: -0.005em; text-wrap: pretty; }
.landing-lede em { font-style: italic; color: var(--forest-deep); }
.landing-cta { display: flex; align-items: center; gap: 12px; margin-top: 28px; flex-wrap: wrap; }
.landing-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; }
.landing-stat-v { font-size: 40px; font-weight: 700; color: var(--ink-1); line-height: 1; letter-spacing: -0.025em; }
.landing-stat-sub { font-size: 11px; color: var(--ink-4); margin-top: 4px; }
.landing-instance { background: var(--paper-elev); border: 1px solid var(--divider); border-radius: var(--r-lg); padding: 20px; }
.landing-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.landing-list li { display: flex; align-items: center; gap: 10px; padding: 4px 0; }
.landing-quote { margin-top: 24px; padding: 16px 20px; border-left: 3px solid var(--archive); background: rgba(184,176,160,.08); border-radius: 0 var(--r-md) var(--r-md) 0; }

.arch { padding: 40px 60px; max-width: 1200px; margin: 0 auto; }
.arch-hd { margin-bottom: 32px; }
.arch-canvas { background: var(--paper); border: 1px solid var(--divider); border-radius: var(--r-md); padding: 16px; }
`;
(function injectSurfacesCss() {
  if (document.getElementById('acmi-surfaces-css')) return;
  const s = document.createElement('style');
  s.id = 'acmi-surfaces-css';
  s.textContent = surfacesCss;
  document.head.appendChild(s);
})();

Object.assign(window, { LandingHero, ArchitectureDiagram });
