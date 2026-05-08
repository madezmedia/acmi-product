// Dashboard view — 4 panels + comms
const { useState: useStateD, useEffect: useEffectD, useRef: useRefD, useMemo: useMemoD } = React;

// MI300X Live Activity — surfaces the GPU team's chain activity at the top
// of the dashboard. Reads from window.ACMI.CHAIN (loaded by data-live.jsx
// from /api/chain). Designed to be the first thing judges see during the
// AMD demo recording.
function MI300XLivePanel() {
  const chain = (window.ACMI && window.ACMI.CHAIN) || { chains: [], events: [], chainCount: 0, eventCount: 0 };
  const recent = (chain.chains || []).slice(0, 5);
  const totalChains = chain.chainCount || 0;
  const lastEvent = (chain.events || [])[0];
  const isLive = lastEvent && (Date.now() - lastEvent.ts < 10 * 60 * 1000);
  return (
    <div className="panel mi300x-live" style={{
      gridColumn: "1 / -1",
      marginBottom: 12,
      borderTop: "3px solid var(--forest)",
    }}>
      <div className="panel-hd" style={{ background: "var(--paper-elev)" }}>
        <div className="row gap-3">
          <h4 style={{ color: "var(--forest-deep)" }}>
            MI300X Team — Live Activity
          </h4>
          <span className="hd-meta">
            <span className={"sd " + (isLive ? "ok pulse" : "warn")} style={{ display: "inline-block", marginRight: 6 }} />
            {totalChains} chains · {chain.eventCount || 0} events · 192GB HBM3
          </span>
        </div>
        <div className="row gap-2" style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--ink-4)" }}>
          <span>llama 70b</span><span>·</span>
          <span>qwen 32b</span><span>·</span>
          <span>mistral 24b</span><span>·</span>
          <span>qwen 7b</span>
        </div>
      </div>
      <div className="panel-bd flush" style={{ padding: "8px 14px 12px" }}>
        {recent.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--ink-4)", padding: "8px 0" }}>
            Waiting for the first chain to land. <span style={{ fontFamily: "var(--mono)", fontSize: 11 }}>acmi:thread:demo-amd-chain:timeline</span>
          </div>
        )}
        {recent.map((c) => {
          const time = new Date(c.started_ts).toISOString().slice(11, 19);
          const wallSec = c.wall_clock_ms ? (c.wall_clock_ms / 1000).toFixed(1) + "s" : "—";
          const tokensOut = (c.steps || []).reduce((s, e) => s + (e.tokens_out || 0), 0);
          return (
            <div key={c.cid} style={{
              display: "grid",
              gridTemplateColumns: "60px 130px 1fr 90px 80px",
              gap: 8,
              padding: "6px 0",
              borderBottom: "1px solid var(--divider)",
              fontSize: 12,
              alignItems: "baseline",
            }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--ink-4)" }}>{time}</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-2)" }}>{c.cid}</span>
              <span className="row gap-1" style={{ fontSize: 11 }}>
                {(c.steps || []).map((s, i) => (
                  <React.Fragment key={i}>
                    <span style={{
                      padding: "1px 6px",
                      borderRadius: 3,
                      background: s.kind === "research-output" ? "rgba(45,74,62,0.10)"
                                : s.kind === "synthesis-output" ? "rgba(184,134,45,0.10)"
                                : s.kind === "publish-output" ? "rgba(194,96,46,0.10)"
                                : "rgba(122,122,120,0.10)",
                      color: s.kind === "research-output" ? "var(--forest-deep)"
                           : s.kind === "synthesis-output" ? "var(--warn)"
                           : s.kind === "publish-output" ? "var(--fw-lg)"
                           : "var(--ink-3)",
                      fontFamily: "var(--mono)",
                      fontSize: 10,
                    }}>
                      {(s.kind || "").replace("-output", "").replace("-request", "•")}
                    </span>
                    {i < (c.steps || []).length - 1 && <span style={{ color: "var(--ink-5)" }}>→</span>}
                  </React.Fragment>
                ))}
              </span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-3)", textAlign: "right" }}>{wallSec}</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-3)", textAlign: "right" }}>{tokensOut}t</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Dashboard({ selectedAgentId, setSelectedAgentId, eventSpeed, onShowHitl, hitlActive }) {
  const [expandedMap, setExpandedMap] = React.useState({});
  const [events, setEvents] = React.useState(window.ACMI.SEED_EVENTS);
  const [eventCounter, setEventCounter] = React.useState(0);
  const [activeTab, setActiveTab] = React.useState('all'); // events filter

  const toggleExpand = (id) => setExpandedMap(m => ({ ...m, [id]: !(m[id] !== undefined ? m[id] : true) }));

  // Live event loop
  React.useEffect(() => {
    const interval = ({ slow: 5200, normal: 2400, fast: 1100 })[eventSpeed] || 2400;
    const t = setInterval(() => {
      const pool = window.ACMI.EVENT_POOL;
      const agents = window.ACMI.ALL_AGENTS.filter(a => a.status === 'ok' || a.status === 'warn');
      const a = agents[Math.floor(Math.random() * agents.length)];
      const p = pool[Math.floor(Math.random() * pool.length)];
      const fwMap = { langgraph: 'lg', crewai: 'cr', agno: 'ag', autogen: 'ad' };
      const now = new Date();
      const stamp = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
      const newEvent = { t: stamp, a: a.label, kind: p.kind, text: p.text, fw: fwMap[a.framework], tone: p.tone, _new: true };
      setEvents(prev => [newEvent, ...prev.slice(0, 49)]);
      setEventCounter(c => c + 1);
    }, interval);
    return () => clearInterval(t);
  }, [eventSpeed]);

  // Clear "new" flag after animation
  React.useEffect(() => {
    if (events.length && events[0]._new) {
      const t = setTimeout(() => setEvents(prev => prev.map(e => ({ ...e, _new: false }))), 800);
      return () => clearTimeout(t);
    }
  }, [eventCounter]);

  return (
    <div className="dash">
      {/* MI300X Live Activity — front-and-center for AMD demo recording */}
      <MI300XLivePanel />

      {/* Top row: Tree | Pipeline+Timeline | Kanban */}
      <div className="dash-top">
        {/* Panel 1: Fleet */}
        <div className="panel dash-tree">
          <div className="panel-hd">
            <div className="row gap-3">
              <h4>Fleet</h4>
              <span className="hd-meta">{window.ACMI.ALL_AGENTS.length} agents · 4 teams</span>
            </div>
            <button className="btn ghost" style={{padding:'2px 6px', fontSize:11}}>+</button>
          </div>
          <div className="panel-bd">
            <div className="tree-root">
              <TreeNode
                node={window.ACMI.FLEET}
                depth={0}
                selectedId={selectedAgentId}
                onSelect={setSelectedAgentId}
                expandedMap={expandedMap}
                toggleExpand={toggleExpand}
                isLast={true}
                prefix=""
              />
            </div>
            <div style={{borderTop:'1px dashed var(--border)', marginTop:16, paddingTop:10}}>
              <div className="meta" style={{marginBottom:8}}>Status legend</div>
              <div style={{display:'flex', flexDirection:'column', gap:6, fontSize:12, color:'var(--ink-3)'}}>
                <div className="row gap-2"><Dot status="ok" /> active &middot; emitting signals</div>
                <div className="row gap-2"><Dot status="warn" /> degraded &middot; high latency</div>
                <div className="row gap-2"><Dot status="err" /> offline &middot; needs intervention</div>
                <div className="row gap-2"><Dot status="idle" /> idle &middot; awaiting work</div>
              </div>
            </div>
          </div>
        </div>

        {/* Panel 2: Pipeline + swimlanes */}
        <div className="panel dash-pipe">
          <div className="panel-hd">
            <div className="row gap-3">
              <h4>Active Pipeline</h4>
              <span className="hd-meta">STORY-832 · "Letter from a former editor"</span>
            </div>
            <div className="row gap-2">
              <span className="pill ghost">5 of 7</span>
              <button className="btn ghost" style={{padding:'2px 8px', fontSize:11}}>View all pipelines →</button>
            </div>
          </div>
          <div className="panel-bd" style={{display:'flex', flexDirection:'column', gap:18}}>
            {/* Pipeline track */}
            <div className="pl-track">
              {window.ACMI.PIPELINE.map((s, i) => (
                <PipelineNode
                  key={s.id}
                  step={s}
                  isLast={i === window.ACMI.PIPELINE.length - 1}
                  isHitl={s.hitl}
                  glow={s.hitl && hitlActive}
                />
              ))}
            </div>

            {/* Swimlanes timeline */}
            <div className="swim-wrap">
              <div className="swim-head">
                <div className="meta" style={{flex:1}}>Last 6 hours · swimlanes</div>
                <div className="row gap-3" style={{fontSize:11, color:'var(--ink-4)'}}>
                  <span><i className="evt-dot ok" /> success</span>
                  <span><i className="evt-dot warn" /> hitl</span>
                  <span><i className="evt-dot err" /> error</span>
                </div>
              </div>
              <div className="swim">
                {[
                  { fw: 'lg', name: 'langgraph', evts: [10, 25, 40, 55, 70, 78] },
                  { fw: 'cr', name: 'crewai',    evts: [15, 35, 50, 62, 88], hitlAt: [62] },
                  { fw: 'ag', name: 'agno',      evts: [20, 45], errAt: [45] },
                  { fw: 'ad', name: 'autogen',   evts: [12, 28, 42, 58, 72, 84] },
                ].map(lane => (
                  <div key={lane.fw} className={`swim-row fw-${lane.fw}`}>
                    <div className="swim-lbl">
                      <FwPill fw={lane.fw} />
                      <span className="mono" style={{fontSize:11, color:'var(--ink-4)', marginLeft:6}}>{lane.name}</span>
                    </div>
                    <div className="swim-track">
                      {lane.evts.map((pct, i) => {
                        const isErr = lane.errAt && lane.errAt.includes(pct);
                        const isHit = lane.hitlAt && lane.hitlAt.includes(pct);
                        return (
                          <i key={i}
                             className={`swim-dot ${isErr ? 'err' : isHit ? 'warn' : 'ok'} ${isHit ? 'hitl-glow' : ''}`}
                             style={{ left: pct + '%' }} />
                        );
                      })}
                    </div>
                  </div>
                ))}
                <div className="swim-axis">
                  <span>−6h</span><span>−4h</span><span>−2h</span><span>now</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Panel 3: Kanban */}
        <div className="panel dash-kanban">
          <div className="panel-hd">
            <div className="row gap-3">
              <h4>Stories</h4>
              <span className="hd-meta">9 in flight</span>
            </div>
            <button className="btn ghost" style={{padding:'2px 8px', fontSize:11}}>+ New</button>
          </div>
          <div className="panel-bd flush">
            <div className="kb-grid">
              {Object.entries(window.ACMI.KANBAN).map(([col, cards]) => (
                <div key={col} className="kb-col">
                  <div className="kb-col-hd">
                    <span className="meta">{col}</span>
                    <span className="count">{cards.length}</span>
                  </div>
                  <div className="kb-list">
                    {cards.map(c => <KanbanCard key={c.id} card={c} isLive={c.live} />)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom row: Comms + Live events */}
      <div className="dash-bot">
        <div className="panel dash-comms">
          <div className="panel-hd">
            <div className="row gap-3">
              <h4>Comms <span style={{color:'var(--ink-5)', fontWeight:400, textTransform:'none', letterSpacing:0}}>· #newsroom</span></h4>
              <span className="hd-meta">7 messages · 2 humans</span>
            </div>
            <div className="row gap-2">
              <button className="btn ghost" style={{padding:'2px 8px', fontSize:11}}># channels</button>
              <button className="btn ghost" style={{padding:'2px 8px', fontSize:11}}>DMs</button>
            </div>
          </div>
          <div className="panel-bd">
            {window.ACMI.COMMS.map(m => {
              const quoteOf = m.quote ? window.ACMI.COMMS.find(x => x.id === m.quote) : null;
              return <CommsMessage key={m.id} m={m} quoteOf={quoteOf} />;
            })}
          </div>
          <div className="cm-input">
            <span className="mono" style={{color:'var(--ink-4)', fontSize:11}}>👤 you</span>
            <input placeholder="Reply to #newsroom — Cmd+Enter to send, @mention an agent…" />
            <button className="btn primary" style={{fontSize:11, padding:'4px 10px'}}>Send</button>
          </div>
        </div>

        <div className="panel dash-events">
          <div className="panel-hd">
            <div className="row gap-3">
              <h4>Live Events</h4>
              <span className="hd-meta"><span className="sd ok pulse" style={{display:'inline-block', marginRight:6}}/>tail -f timeline</span>
            </div>
            <div className="row gap-1">
              {['all', 'tool', 'emit', 'gate', 'err'].map(k => (
                <button key={k}
                  onClick={() => setActiveTab(k)}
                  className="btn ghost"
                  data-active={activeTab === k}
                  style={{
                    padding:'2px 8px', fontSize:10,
                    fontFamily:'var(--mono)',
                    background: activeTab === k ? 'var(--paper-elev)' : 'transparent',
                    color: activeTab === k ? 'var(--ink-1)' : 'var(--ink-4)',
                    borderColor: activeTab === k ? 'var(--border)' : 'transparent'
                  }}>
                  {k}
                </button>
              ))}
            </div>
          </div>
          <div className="panel-bd flush">
            <ul className="evt-list">
              {events
                .filter(e => activeTab === 'all' || e.kind === activeTab)
                .map((e, i) => (
                <li key={i} className={`evt-row ${e._new ? 'new' : ''}`}>
                  <span className="evt-time mono">{e.t}</span>
                  <span className={`evt-dot ${e.tone}`} />
                  <span className="evt-agent mono">{e.a}</span>
                  <FwPill fw={e.fw} />
                  <span className="evt-kind mono">{e.kind}</span>
                  <span className="evt-text mono">{e.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

const dashCss = `
.dash {
  display: flex; flex-direction: column;
  height: calc(100vh - 56px);
  padding: 14px;
  gap: 14px;
  background: var(--paper-elev);
}
.dash-top {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(420px, 2fr) minmax(360px, 1.3fr);
  gap: 14px;
  flex: 1.3;
  min-height: 0;
}
.dash-bot {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: 14px;
  flex: 1;
  min-height: 0;
}
.dash-tree, .dash-pipe, .dash-kanban, .dash-comms, .dash-events { min-height: 0; }
.dash-comms { display: flex; flex-direction: column; }
.dash-comms .panel-bd { padding-top: 0; padding-bottom: 0; }
.cm-input {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid var(--divider);
  background: var(--paper);
}
.cm-input input {
  flex: 1; appearance: none;
  background: var(--paper-elev);
  border: 1px solid var(--divider);
  border-radius: var(--r-md);
  padding: 7px 10px;
  font-family: var(--sans); font-size: 13px; color: var(--ink-2);
}
.cm-input input:focus { outline: 0; border-color: var(--forest); background: var(--paper); }

/* Swim */
.swim-wrap { display: flex; flex-direction: column; gap: 6px; }
.swim-head { display: flex; align-items: center; gap: 12px; }
.swim { background: var(--paper-elev); border: 1px solid var(--divider); border-radius: var(--r-md); padding: 12px 14px; position: relative; }
.swim-row { display: grid; grid-template-columns: 130px 1fr; align-items: center; padding: 7px 0; gap: 14px; border-bottom: 1px dashed var(--border); }
.swim-row:last-of-type { border-bottom: 0; }
.swim-lbl { display: flex; align-items: center; }
.swim-track { position: relative; height: 14px; background: linear-gradient(to right, transparent 0%, transparent calc(100% - 1px), var(--border) calc(100% - 1px)); }
.swim-track::before {
  content: ''; position: absolute; left: 0; right: 0; top: 50%;
  height: 1px; background: var(--border);
}
.swim-dot {
  position: absolute; top: 50%; transform: translate(-50%, -50%);
  width: 8px; height: 8px; border-radius: 50%;
  border: 1.5px solid var(--paper);
}
.swim-dot.ok   { background: var(--ok-bright); }
.swim-dot.warn { background: var(--warn-bright); }
.swim-dot.err  { background: var(--err-bright); }
.swim-axis { display: grid; grid-template-columns: repeat(4, 1fr); padding-left: 144px; padding-top: 4px; font-family: var(--mono); font-size: 10px; color: var(--ink-5); }
.evt-dot { display:inline-block; width:8px; height:8px; border-radius:50%; }
.evt-dot.ok { background: var(--ok-bright); }
.evt-dot.warn { background: var(--warn-bright); }
.evt-dot.err { background: var(--err-bright); }

/* Kanban grid */
.kb-grid { display: flex; gap: 8px; overflow-x: auto; padding: 12px 12px 12px; }
.kb-col { min-width: 180px; max-width: 200px; flex-shrink: 0; }

/* Live events */
.evt-list { list-style: none; margin: 0; padding: 0; font-family: var(--mono); font-size: 11.5px; }
.evt-row {
  display: grid;
  grid-template-columns: 64px 10px 76px 30px 50px 1fr;
  align-items: center;
  gap: 8px;
  padding: 5px 14px;
  border-bottom: 1px solid var(--paper-elev);
  color: var(--ink-3);
  white-space: nowrap;
}
.evt-row.new { animation: evt-in 600ms var(--ease); background: rgba(45,74,62,.06); }
@keyframes evt-in {
  from { background: rgba(45,74,62,.18); transform: translateX(-4px); opacity: 0; }
  to   { background: rgba(45,74,62,.0);  transform: translateX(0);    opacity: 1; }
}
.evt-time { color: var(--ink-5); font-size: 10.5px; }
.evt-agent { color: var(--ink-1); font-weight: 500; }
.evt-kind { color: var(--ink-4); text-transform: uppercase; letter-spacing: 0.04em; font-size: 10px; }
.evt-text { color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; }
`;
(function injectDashCss() {
  if (document.getElementById('acmi-dash-css')) return;
  const s = document.createElement('style');
  s.id = 'acmi-dash-css';
  s.textContent = dashCss;
  document.head.appendChild(s);
})();

window.Dashboard = Dashboard;
