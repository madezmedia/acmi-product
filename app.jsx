// App shell — top-level state, routing between surfaces, HITL orchestration

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "density": "regular",
  "eventSpeed": "normal",
  "showRules": true,
  "accent": "forest",
  "monoFont": "JetBrains Mono"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [surface, setSurface] = React.useState('dashboard'); // landing | dashboard | architecture
  const [currentInstance, setCurrentInstance] = React.useState('mz-prod');
  const [selectedAgentId, setSelectedAgentId] = React.useState('lg-margaux');
  const [detailOpen, setDetailOpen] = React.useState(true);
  const [hitlActive, setHitlActive] = React.useState(false);
  const [toasts, setToasts] = React.useState([]);
  const [cmdkOpen, setCmdkOpen] = React.useState(false);

  // Apply density
  React.useEffect(() => { document.body.dataset.density = t.density || 'regular'; }, [t.density]);

  // Apply accent
  React.useEffect(() => {
    const map = {
      forest:    { f: '#2d4a3e', f2: '#5a7d6f', fd: '#1c3027' },
      terracotta:{ f: '#9c4a26', f2: '#c2602e', fd: '#6b3015' },
      ink:       { f: '#1a1a1a', f2: '#4a4a48', fd: '#000000' },
    };
    const v = map[t.accent] || map.forest;
    document.documentElement.style.setProperty('--forest', v.f);
    document.documentElement.style.setProperty('--forest-2', v.f2);
    document.documentElement.style.setProperty('--forest-deep', v.fd);
  }, [t.accent]);

  // Apply mono font
  React.useEffect(() => {
    const map = {
      'JetBrains Mono': "'JetBrains Mono', ui-monospace, Menlo, monospace",
      'IBM Plex Mono':  "'IBM Plex Mono', ui-monospace, Menlo, monospace",
      'Berkeley Mono':  "'Berkeley Mono', 'IBM Plex Mono', ui-monospace, Menlo, monospace",
      'iA Writer Mono': "'iA Writer Mono', ui-monospace, Menlo, monospace",
    };
    document.documentElement.style.setProperty('--mono', map[t.monoFont] || map['JetBrains Mono']);
  }, [t.monoFont]);

  // Cmd+K
  React.useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setCmdkOpen(true); }
      if (e.key === 'Escape') setCmdkOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pushToast = (msg, tone = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(ts => [...ts, { id, msg, tone }]);
    setTimeout(() => setToasts(ts => ts.filter(x => x.id !== id)), 3200);
  };

  const triggerHitl = () => {
    setHitlActive(true);
    setSelectedAgentId('cr-hollis');
    setDetailOpen(true);
    pushToast('HITL gate fired · @hollis is waiting', 'warn');
  };

  const onApprove = () => { setHitlActive(false); pushToast('Approved · STORY-832 advancing to fact-check', 'ok'); };
  const onReject  = () => { setHitlActive(false); pushToast('Rejected · returned to @hollis with notes', 'err'); };

  // Auto-trigger HITL once on first dashboard load
  React.useEffect(() => {
    if (surface === 'dashboard' && !hitlActive) {
      const t = setTimeout(() => triggerHitl(), 6500);
      return () => clearTimeout(t);
    }
  }, []); // eslint-disable-line

  return (
    <div className="app">
      {/* Top bar */}
      <header className="topbar">
        <div className="brand">
          <span className="glyph"></span>
          ACMI <small>Ops Center</small>
        </div>
        <nav className="topnav">
          <button data-active={surface === 'landing'} onClick={() => setSurface('landing')}>Overview</button>
          <button data-active={surface === 'dashboard'} onClick={() => setSurface('dashboard')}>Dashboard</button>
          <button data-active={surface === 'architecture'} onClick={() => setSurface('architecture')}>Architecture</button>
        </nav>
        <div className="topbar-spacer"></div>
        <button className="cmd-btn" onClick={() => setCmdkOpen(true)}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="7" cy="7" r="4.5"/><path d="m11 11 3 3"/></svg>
          Search agents, stories…
          <span className="kbd" style={{marginLeft:8}}>⌘K</span>
        </button>
        <button className="btn ghost" title="HITL queue · 1 pending" onClick={triggerHitl}>
          ✋ <span style={{color: hitlActive ? 'var(--warn)' : 'var(--ink-3)', fontWeight: 600}}>1</span>
        </button>
        <InstanceSwitcher
          instances={window.ACMI.INSTANCES}
          current={currentInstance}
          onSelect={(id) => { setCurrentInstance(id); pushToast(`Switched to ${window.ACMI.INSTANCES.find(i => i.id === id).short}`, 'ok'); }}
        />
      </header>

      {/* Surface */}
      {surface === 'landing' && (
        <LandingHero
          onEnter={() => setSurface('dashboard')}
          instances={window.ACMI.INSTANCES}
          current={currentInstance}
        />
      )}
      {surface === 'architecture' && <ArchitectureDiagram />}
      {surface === 'dashboard' && (
        <div className="dash-with-detail" data-detail-open={detailOpen}>
          <Dashboard
            selectedAgentId={selectedAgentId}
            setSelectedAgentId={(id) => { setSelectedAgentId(id); setDetailOpen(true); }}
            eventSpeed={t.eventSpeed}
            hitlActive={hitlActive}
            onShowHitl={triggerHitl}
          />
          {detailOpen && (
            <div className="detail-pane">
              <AgentDetail
                agentId={selectedAgentId}
                onClose={() => setDetailOpen(false)}
                hitlActive={hitlActive}
                onApprove={onApprove}
                onReject={onReject}
                onTrigger={triggerHitl}
              />
            </div>
          )}
          {!detailOpen && (
            <button className="detail-tab" onClick={() => setDetailOpen(true)}>
              <span className="meta" style={{writingMode:'vertical-rl', transform:'rotate(180deg)', letterSpacing:'0.2em'}}>Agent · {selectedAgentId || 'none'}</span>
            </button>
          )}
        </div>
      )}

      {/* Cmd+K palette */}
      {cmdkOpen && <CmdK onClose={() => setCmdkOpen(false)} onSelect={(id) => { setSelectedAgentId(id); setSurface('dashboard'); setDetailOpen(true); setCmdkOpen(false); }} />}

      {/* Toasts */}
      <div className="toast-wrap">
        {toasts.map(t => (
          <div key={t.id} className="toast">
            <span className="swatch" style={{background: t.tone === 'ok' ? 'var(--ok-bright)' : t.tone === 'warn' ? 'var(--warn-bright)' : 'var(--err-bright)'}}/>
            {t.msg}
          </div>
        ))}
      </div>

      {/* Tweaks */}
      <TweaksPanel>
        <TweakSection label="Density" />
        <TweakRadio label="" value={t.density} options={['compact','regular','spacious']} onChange={v => setTweak('density', v)} />
        <TweakSection label="Live Timeline" />
        <TweakRadio label="Event speed" value={t.eventSpeed} options={['slow','normal','fast']} onChange={v => setTweak('eventSpeed', v)} />
        <TweakSection label="Theme" />
        <TweakColor
          label="Accent"
          value={t.accent}
          options={[
            { value: 'forest',     color: '#2d4a3e' },
            { value: 'terracotta', color: '#9c4a26' },
            { value: 'ink',        color: '#1a1a1a' },
          ].map(o => o.color)}
          onChange={hex => {
            const reverse = { '#2d4a3e':'forest', '#9c4a26':'terracotta', '#1a1a1a':'ink' };
            setTweak('accent', reverse[hex] || 'forest');
          }}
        />
        <TweakSelect label="Mono font" value={t.monoFont}
          options={['JetBrains Mono','IBM Plex Mono','Berkeley Mono','iA Writer Mono']}
          onChange={v => setTweak('monoFont', v)} />
        <TweakSection label="Demo" />
        <TweakButton label="Trigger HITL gate" onClick={triggerHitl} />
        <TweakButton label="Reset HITL" onClick={() => setHitlActive(false)} />
      </TweaksPanel>
    </div>
  );
}

// — Cmd+K
function CmdK({ onClose, onSelect }) {
  const [q, setQ] = React.useState('');
  const inputRef = React.useRef(null);
  React.useEffect(() => { inputRef.current?.focus(); }, []);
  const matches = window.ACMI.ALL_AGENTS.filter(a =>
    !q || a.label.includes(q.toLowerCase()) || a.role.includes(q.toLowerCase())
  ).slice(0, 8);
  return (
    <div className="cmdk-overlay" onClick={onClose}>
      <div className="cmdk" onClick={(e) => e.stopPropagation()}>
        <div className="cmdk-input">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--ink-4)" strokeWidth="1.5"><circle cx="7" cy="7" r="4.5"/><path d="m11 11 3 3"/></svg>
          <input ref={inputRef} placeholder="Search agents, stories, channels…" value={q} onChange={e => setQ(e.target.value)} />
          <span className="kbd">esc</span>
        </div>
        <div className="cmdk-section">
          <div className="meta" style={{padding:'8px 14px'}}>Agents</div>
          {matches.map(a => (
            <button key={a.id} className="cmdk-item" onClick={() => onSelect(a.id)}>
              <Dot status={a.status} />
              <span className="mono" style={{fontWeight:500, color:'var(--ink-1)'}}>{a.label}</span>
              <span style={{color:'var(--ink-4)', fontSize:12}}>· {a.role}</span>
              <span style={{flex:1}}></span>
              <FwPill fw={a.framework} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// CSS for app shell
const appCss = `
.dash-with-detail {
  display: grid;
  grid-template-columns: 1fr 520px;
  height: calc(100vh - 56px);
  min-height: 0;
}
.dash-with-detail[data-detail-open="false"] { grid-template-columns: 1fr 36px; }
.dash-with-detail .dash { height: 100%; }
.detail-pane {
  border-left: 1px solid var(--divider);
  background: var(--paper);
  overflow: hidden;
  display: flex; flex-direction: column;
  animation: slide-left 320ms var(--ease);
  min-height: 0;
}
@keyframes slide-left { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
.detail-tab {
  appearance: none; background: var(--paper); border: 0; border-left: 1px solid var(--divider);
  cursor: pointer; padding: 16px 8px; color: var(--ink-4);
  display: flex; align-items: center; justify-content: center;
  transition: background 160ms var(--ease);
}
.detail-tab:hover { background: var(--paper-elev); color: var(--ink-1); }

.cmdk-overlay {
  position: fixed; inset: 0; background: rgba(26,26,26,.32);
  display: grid; place-items: start center;
  padding-top: 12vh;
  z-index: 100;
  animation: cmdk-in 160ms var(--ease);
}
@keyframes cmdk-in { from { opacity: 0; } to { opacity: 1; } }
.cmdk {
  width: min(620px, 92vw);
  background: var(--paper);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  box-shadow: var(--sh-lg);
  overflow: hidden;
  animation: cmdk-pop 220ms var(--ease);
}
@keyframes cmdk-pop { from { transform: translateY(-8px) scale(.98); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }
.cmdk-input { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-bottom: 1px solid var(--divider); }
.cmdk-input input {
  flex: 1; appearance: none; border: 0; outline: 0; background: transparent;
  font-family: var(--sans); font-size: 15px; color: var(--ink-1);
}
.cmdk-section { padding: 4px 0 8px; }
.cmdk-item {
  appearance: none; border: 0; background: transparent;
  display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 8px 14px; cursor: pointer;
  font-family: var(--sans); font-size: 13px; color: var(--ink-2);
  text-align: left;
}
.cmdk-item:hover, .cmdk-item:focus { background: var(--paper-elev); outline: 0; }
`;
(function injectAppCss() {
  if (document.getElementById('acmi-app-css')) return;
  const s = document.createElement('style');
  s.id = 'acmi-app-css';
  s.textContent = appCss;
  document.head.appendChild(s);
})();

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
