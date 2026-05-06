// Shared components for ACMI Ops Center

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// — Status dot
function Dot({ status, pulse }) {
  return (
    <span className={`sd ${status || 'idle'} ${pulse && status === 'ok' ? 'pulse' : ''}`} />
  );
}

// — Framework pill
function FwPill({ fw, label }) {
  const map = { langgraph: 'lg', crewai: 'cr', agno: 'ag', autogen: 'ad', lg: 'lg', cr: 'cr', ag: 'ag', ad: 'ad' };
  const code = map[fw] || 'ag';
  const labelMap = { lg: 'LG', cr: 'CR', ag: 'AG', ad: 'AD' };
  return <span className={`pill fw-${code}`}>{label || labelMap[code]}</span>;
}

// — Instance switcher (multi-ACMI)
function InstanceSwitcher({ instances, current, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const cur = instances.find(i => i.id === current) || instances[0];
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="instance-switch" onClick={() => setOpen(o => !o)}>
        <Dot status={cur.status} pulse />
        <span className="name">{cur.short}</span>
        <span className="count mono">· {cur.agents} agents</span>
        <svg className="chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="dropdown">
          <header>
            <div className="meta" style={{ marginBottom: 2 }}>ACMI Instance</div>
            <div style={{ fontSize: 12, color: 'var(--ink-4)' }}>4 connected · last sync 2s ago</div>
          </header>
          <ul>
            {instances.map(i => (
              <li key={i.id} data-current={i.id === current} onClick={() => { onSelect(i.id); setOpen(false); }}>
                <Dot status={i.status} />
                <div>
                  <div className="nm">{i.name}</div>
                  <div className="sub">{i.tenant} · {i.region}</div>
                </div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--ink-4)' }}>{i.agents}</div>
              </li>
            ))}
          </ul>
          <footer>
            <button>+ Connect new ACMI instance</button>
          </footer>
        </div>
      )}
    </div>
  );
}

// — Tree node renderer (UNIX tree)
function TreeNode({ node, depth, selectedId, onSelect, expandedMap, toggleExpand, isLast, prefix }) {
  const isTeam = !!node.children;
  const expanded = expandedMap[node.id] !== undefined ? expandedMap[node.id] : node.expanded;

  // Build prefix segment
  const branch = depth === 0 ? '' : (isLast ? '└── ' : '├── ');
  const linePrefix = prefix + branch;

  return (
    <>
      <div
        className="tree-row"
        data-active={selectedId === node.id}
        data-team={isTeam}
        onClick={() => isTeam ? toggleExpand(node.id) : onSelect(node.id)}
      >
        <span className="tree-prefix">{linePrefix}</span>
        {isTeam ? (
          <span className="tree-toggle">{expanded ? '▾' : '▸'}</span>
        ) : (
          <Dot status={node.status} pulse={node.status === 'ok' && node.busy} />
        )}
        <span className="tree-label">
          {isTeam ? (
            <>
              <span style={{ color: 'var(--ink-1)', fontWeight: 600 }}>{node.label}/</span>
            </>
          ) : (
            <>
              <span className="mono" style={{ color: 'var(--ink-1)' }}>{node.label}</span>
              <span style={{ color: 'var(--ink-4)', fontSize: 12 }}> · {node.role}</span>
            </>
          )}
        </span>
        {!isTeam && node.hitl && <span title="HITL waiting" className="hitl-mark">✋</span>}
        {isTeam && node.framework && <FwPill fw={node.framework} />}
      </div>
      {isTeam && expanded && node.children.map((c, idx) => (
        <TreeNode
          key={c.id}
          node={c}
          depth={depth + 1}
          selectedId={selectedId}
          onSelect={onSelect}
          expandedMap={expandedMap}
          toggleExpand={toggleExpand}
          isLast={idx === node.children.length - 1}
          prefix={prefix + (depth === 0 ? '' : (isLast ? '    ' : '│   '))}
        />
      ))}
    </>
  );
}

// Tree styles injected once
const treeCss = `
.tree-root { font-family: var(--mono); font-size: 12.5px; line-height: 1.7; }
.tree-row {
  display: flex; align-items: center; gap: 8px;
  padding: 2px 8px; margin: 0 -8px;
  border-radius: var(--r-md);
  cursor: pointer;
  white-space: nowrap;
  transition: background 120ms var(--ease);
}
.tree-row:hover { background: var(--paper-elev); }
.tree-row[data-active="true"] {
  background: rgba(45,74,62,.08);
  box-shadow: inset 2px 0 0 var(--forest);
}
.tree-row[data-active="true"] .tree-label { color: var(--forest-deep); }
.tree-prefix { color: var(--ink-5); user-select: none; white-space: pre; }
.tree-toggle { color: var(--ink-4); width: 10px; display: inline-block; text-align: center; }
.tree-label { font-family: var(--mono); color: var(--ink-2); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.hitl-mark { font-size: 12px; filter: hue-rotate(-20deg) saturate(1.4); }
`;

// — Pipeline node
function PipelineNode({ step, isLast, isHitl, glow }) {
  const fwMap = { langgraph: 'fw-lg', crewai: 'fw-cr', agno: 'fw-ag', autogen: 'fw-ad' };
  return (
    <div className="pl-step">
      <div className={`pl-node ${step.status} ${glow ? 'hitl-glow' : ''}`}>
        {isHitl && <span className="pl-hitl">✋</span>}
        <div className="pl-node-name">{step.name}</div>
        <div className="pl-node-meta">
          <FwPill fw={step.fw} />
          <span className="mono" style={{ fontSize: 11, color: 'var(--ink-4)' }}>@{step.agent}</span>
        </div>
      </div>
      {!isLast && <div className={`pl-edge ${step.status === 'done' ? 'done' : ''}`} />}
    </div>
  );
}

const pipelineCss = `
.pl-track { display: flex; align-items: stretch; padding: 4px 0; overflow-x: auto; }
.pl-step { display: flex; align-items: center; flex-shrink: 0; }
.pl-node {
  position: relative;
  width: 132px; padding: 10px 12px;
  border: 1px solid var(--divider);
  border-radius: var(--r-md);
  background: var(--paper);
  display: flex; flex-direction: column; gap: 6px;
  transition: all 240ms var(--ease);
}
.pl-node.done   { background: var(--paper); opacity: .7; }
.pl-node.done .pl-node-name { text-decoration: line-through; text-decoration-color: var(--ink-5); }
.pl-node.active { border-color: var(--forest); background: rgba(45,74,62,.04); box-shadow: var(--sh-md); }
.pl-node.active .pl-node-name::after {
  content: ''; display: inline-block;
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--forest); margin-left: 6px; vertical-align: middle;
  animation: pulse-dot 1.4s ease-in-out infinite;
}
@keyframes pulse-dot { 0%,100% { opacity:.4; } 50% { opacity: 1; } }
.pl-node.queued { background: var(--paper-elev); }
.pl-node-name { font-size: 12.5px; font-weight: 600; color: var(--ink-1); letter-spacing: -0.005em; }
.pl-node-meta { display: flex; align-items: center; gap: 6px; }
.pl-edge {
  width: 28px; height: 1.5px; background: var(--border);
  position: relative;
  flex-shrink: 0;
  align-self: center;
}
.pl-edge.done { background: var(--ink-3); }
.pl-edge::after {
  content: '▸'; position: absolute; right: -4px; top: 50%; transform: translateY(-50%);
  color: var(--border); font-size: 11px; line-height: 1;
}
.pl-edge.done::after { color: var(--ink-3); }
.pl-hitl {
  position: absolute; top: -8px; right: -8px;
  width: 22px; height: 22px;
  display: grid; place-items: center;
  background: var(--paper);
  border: 1.5px solid var(--warn-bright);
  border-radius: 50%;
  font-size: 12px;
  box-shadow: 0 0 0 3px rgba(234,179,8,.18), var(--sh-sm);
  z-index: 2;
}
`;

// — Kanban card
function KanbanCard({ card, isLive }) {
  return (
    <div className={`kb-card ${isLive ? 'live' : ''}`}>
      <div className="kb-card-id mono">{card.id}</div>
      <div className="kb-card-title">{card.title}</div>
      <div className="kb-card-meta">
        <span className="mono">@{card.owner}</span>
        <span style={{ color: 'var(--ink-5)' }}>·</span>
        <span style={{ color: 'var(--ink-4)' }}>{card.age}</span>
        <span style={{ flex: 1 }}></span>
        <span className="kb-evidence" title={`${card.evidence} sources`}>
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6 10l4-4M5 11a3 3 0 010-4l2-2M11 5l2-2a3 3 0 014 4l-2 2" strokeLinecap="round"/>
          </svg>
          {card.evidence}
        </span>
        <FwPill fw={card.fw} />
      </div>
      {isLive && <div className="kb-live"><span className="sd ok pulse" /> LIVE</div>}
    </div>
  );
}

const kanbanCss = `
.kb-col { display: flex; flex-direction: column; min-width: 0; }
.kb-col-hd {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 10px; margin-bottom: 6px;
  border-bottom: 1px solid var(--divider);
}
.kb-col-hd .meta { font-size: 10px; }
.kb-col-hd .count { font-family: var(--mono); font-size: 10px; color: var(--ink-4); }
.kb-list { display: flex; flex-direction: column; gap: 6px; padding: 0 4px; }
.kb-card {
  background: var(--paper);
  border: 1px solid var(--divider);
  border-radius: var(--r-md);
  padding: 9px 10px;
  display: flex; flex-direction: column; gap: 5px;
  cursor: grab;
  position: relative;
  transition: box-shadow 160ms var(--ease), border-color 160ms var(--ease);
}
.kb-card:hover { box-shadow: var(--sh-md); border-color: var(--ink-5); }
.kb-card.live { border-color: var(--forest); background: rgba(45,74,62,.03); }
.kb-card-id { font-size: 10px; color: var(--ink-4); letter-spacing: 0.04em; }
.kb-card-title { font-size: 12.5px; font-weight: 500; color: var(--ink-1); line-height: 1.35; letter-spacing: -0.005em; }
.kb-card-meta { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--ink-3); }
.kb-evidence { display: inline-flex; align-items: center; gap: 3px; color: var(--ink-4); font-family: var(--mono); font-size: 10.5px; }
.kb-live {
  position: absolute; top: -7px; right: 8px;
  display: flex; align-items: center; gap: 4px;
  background: var(--paper); padding: 1px 6px;
  border: 1px solid var(--forest); border-radius: var(--r-pill);
  font-size: 9px; font-weight: 600; letter-spacing: 0.1em;
  color: var(--forest);
}
`;

// — Comms message
function CommsMessage({ m, quoteOf }) {
  const isHuman = m.fw === 'human';
  const isSystem = m.fw === 'sys';
  return (
    <div className={`cm ${isSystem ? 'cm-sys' : ''} ${isHuman ? 'cm-human' : ''}`}>
      <div className="cm-gutter">
        <div className={`cm-avatar fw-${m.fw}`}>
          {isHuman ? '👤' : isSystem ? '⚙' : m.who.charAt(0).toUpperCase()}
        </div>
      </div>
      <div className="cm-body">
        <div className="cm-meta">
          <span className="cm-name mono">{m.who}</span>
          {!isHuman && !isSystem && <FwPill fw={m.fw} />}
          {isHuman && <span className="pill" style={{background:'rgba(74,124,89,.12)', color:'#2f5a3a', borderColor:'rgba(74,124,89,.3)'}}>HUMAN</span>}
          {isSystem && <span className="pill ghost">SYS</span>}
          <span className="cm-role">· {m.role}</span>
          <span className="cm-time mono">{m.time}</span>
        </div>
        {quoteOf && (
          <div className="cm-quote">
            <span className="mono" style={{color:'var(--ink-4)'}}>{quoteOf.who}: </span>
            <span>{quoteOf.text.slice(0, 90)}{quoteOf.text.length > 90 ? '…' : ''}</span>
          </div>
        )}
        <div className="cm-text">{m.text}</div>
        {m.payload && <pre className="cm-payload mono">{m.payload}</pre>}
        {m.replies > 0 && (
          <div className="cm-replies">
            <span className="mono">↳ {m.replies} {m.replies === 1 ? 'reply' : 'replies'}</span>
          </div>
        )}
      </div>
    </div>
  );
}

const commsCss = `
.cm { display: grid; grid-template-columns: 36px 1fr; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--divider); }
.cm:last-child { border-bottom: 0; }
.cm-gutter { padding-top: 2px; }
.cm-avatar {
  width: 30px; height: 30px; border-radius: 50%;
  display: grid; place-items: center;
  font-family: var(--sans); font-weight: 600; font-size: 12px;
  color: var(--ink-1);
  background: var(--paper-elev);
  border: 1px solid var(--divider);
}
.cm-avatar.fw-lg { background: rgba(194,96,46,.12); color: #92481f; border-color: rgba(194,96,46,.3); }
.cm-avatar.fw-cr { background: rgba(184,134,45,.12); color: #7a591f; border-color: rgba(184,134,45,.3); }
.cm-avatar.fw-ag { background: rgba(107,111,62,.12); color: #4d5028; border-color: rgba(107,111,62,.3); }
.cm-avatar.fw-ad { background: rgba(138,74,74,.12); color: #62302f; border-color: rgba(138,74,74,.3); }
.cm-avatar.fw-human { background: rgba(74,124,89,.15); color: #2f5a3a; border-color: rgba(74,124,89,.35); font-size: 14px; }
.cm-avatar.fw-sys   { background: var(--paper-deep); color: var(--ink-3); }
.cm-meta { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; margin-bottom: 4px; }
.cm-name { font-size: 12.5px; font-weight: 600; color: var(--ink-1); }
.cm-role { font-size: 11px; color: var(--ink-4); }
.cm-time { font-size: 11px; color: var(--ink-5); margin-left: auto; }
.cm-text { font-family: var(--serif); font-size: 14.5px; line-height: 1.55; color: var(--ink-2); letter-spacing: -0.005em; }
.cm-quote {
  border-left: 2px solid var(--archive);
  padding: 4px 10px; margin-bottom: 6px;
  background: rgba(184,176,160,.08);
  border-radius: 0 var(--r-sm) var(--r-sm) 0;
  font-size: 12.5px; color: var(--ink-4);
  font-family: var(--serif);
  font-style: italic;
}
.cm-payload {
  margin: 6px 0 0; padding: 8px 10px;
  background: var(--paper-elev);
  border: 1px solid var(--divider);
  border-radius: var(--r-sm);
  font-size: 11.5px; color: var(--ink-3);
  white-space: pre-wrap; overflow-x: auto;
}
.cm-replies { margin-top: 6px; font-size: 11px; color: var(--ink-4); }
.cm-sys .cm-text { font-family: var(--mono); font-size: 12px; color: var(--ink-3); }
`;

// inject all CSS
(function injectCss() {
  if (document.getElementById('acmi-comp-css')) return;
  const s = document.createElement('style');
  s.id = 'acmi-comp-css';
  s.textContent = treeCss + pipelineCss + kanbanCss + commsCss;
  document.head.appendChild(s);
})();

Object.assign(window, {
  Dot, FwPill, InstanceSwitcher, TreeNode, PipelineNode, KanbanCard, CommsMessage,
});
