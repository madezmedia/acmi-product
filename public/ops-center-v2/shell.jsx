/* eslint-disable no-undef */
/* shell.jsx — TopBar, LeftRail, Drawer, StatusBar, helpers */

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ─── utility helpers ───────────────────────────────────────────
function fmtRel(ms) {
  const d = (Date.now() - ms) / 1000;
  if (d < 60)    return `${Math.max(1,Math.floor(d))}s ago`;
  if (d < 3600)  return `${Math.floor(d/60)}m ago`;
  if (d < 86400) return `${Math.floor(d/3600)}h ago`;
  return `${Math.floor(d/86400)}d ago`;
}
function fmtTs(ms) {
  const d = new Date(ms);
  return d.toLocaleTimeString("en-US",{hour12:false,hour:"2-digit",minute:"2-digit"});
}
function fmtTsFull(ms) {
  const d = new Date(ms);
  return d.toLocaleString("en-US",{hour12:false,month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"});
}
function fmtNextCountdown(ms) {
  if (!ms || ms <= 0) return "—";
  const s = Math.floor(ms/1000);
  if (s < 60)     return `${s}s`;
  if (s < 3600)   return `${Math.floor(s/60)}m`;
  if (s < 86400)  return `${Math.floor(s/3600)}h${Math.floor((s%3600)/60)}m`;
  return `${Math.floor(s/86400)}d`;
}
function fmtDuration(ms) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms/1000).toFixed(1)}s`;
  return `${Math.floor(ms/60000)}m${Math.floor((ms%60000)/1000)}s`;
}
function classify(kind, summary) {
  if (kind === "decision-pending" || kind === "hitl-required") return "PROPOSE";
  if (kind === "decision") return "PROPOSE";
  if (kind === "incident-correction" || /confirms?|verified|consistent/i.test(summary||"")) return "CONFIRM";
  if (/objection|concern|disagree|block/i.test(summary||"")) return "OBJECT";
  if (kind === "defer" || /defer|parked|BLOCKED/i.test(summary||"")) return "DEFER";
  return "NEUTRAL";
}
function initials(name) {
  return name.replace(/^agent:/,"").split(/[-:]/).slice(0,2).map(s=>s[0]).join("").toUpperCase();
}
function shortSrc(s) { return s.replace(/^(agent:|cron:|user:)/,""); }
function escSummary(s) {
  const m = s.match(/^\[([^\]]+)\]\s*(.*)$/s);
  if (!m) return [null, s];
  return [m[1], m[2]];
}

window.helpers = { fmtRel, fmtTs, fmtTsFull, fmtNextCountdown, fmtDuration, classify, initials, shortSrc, escSummary };

// ─── Top bar ───────────────────────────────────────────────────
function TopBar({ hitlCount, view, onSearch, liveDataSource }) {
  const srcLabel = liveDataSource === "live" ? "LIVE · ACMI"
                 : liveDataSource === "loading" ? "LOADING…"
                 : liveDataSource === "mock-fallback" ? "MOCK · fallback"
                 : "MOCK";
  const srcColor = liveDataSource === "live" ? "var(--ok)"
                 : liveDataSource === "loading" ? "var(--ink-3)"
                 : "var(--warn)";
  return (
    <header className="topbar">
      <div className="brand">
        <b>ACMI</b>
        <span style={{color:"var(--ink-2)",fontWeight:400,fontSize:15}}>Control Pad</span>
        <small>v1.1</small>
      </div>
      <span className="live" style={{color: srcColor}}>
        <span className="dot" style={{background: srcColor}}></span>
        {srcLabel} · {fmtTs(Date.now())} ET
      </span>
      <span style={{fontFamily:"JetBrains Mono, monospace",fontSize:11,color:"var(--ink-3)",textTransform:"uppercase",letterSpacing:"0.06em"}}>
        ↻ {liveDataSource === "live" ? "3s" : "14s"}
      </span>
      <div className="grow"></div>
      <div className="search">
        <span style={{color:"var(--ink-3)"}}>⌕</span>
        <input
          placeholder="Search events, work, agents…"
          onChange={(e)=>onSearch && onSearch(e.target.value)}
        />
        <span className="kbd">/</span>
      </div>
      {hitlCount > 0 && (
        <span className="hitl-pip">⚠ {hitlCount} HITL</span>
      )}
      <div className="op-id">
        <span className="avatar">M</span>
        <span>mikey</span>
      </div>
    </header>
  );
}

// ─── Status bar ────────────────────────────────────────────────
function StatusBar({ fleetActive, fleetTotal, cronEnabled, cronTotal, cronErrored, hitlPending, drift, quotaPct }) {
  return (
    <footer className="statusbar">
      <span className="seg ok">FLEET <span className="v">{fleetActive}/{fleetTotal}</span></span>
      <span className="seg">CRONS <span className="v">{cronEnabled}/{cronTotal}</span></span>
      {cronErrored > 0 && <span className="seg err">⚠ <span className="v">{cronErrored} ERRORED</span></span>}
      <span className="seg">HITL <span className="v">{hitlPending}</span></span>
      <span className="seg">DRIFT <span className="v">{drift} fields auto-fixed 24h</span></span>
      <span className="seg" style={{color:quotaPct>=80?"var(--warn)":"var(--ink-2)"}}>
        QUOTA <span className="v" style={{color:quotaPct>=80?"var(--warn)":"var(--ink-0)"}}>{quotaPct}% anthropic</span>
      </span>
      <span className="grow"></span>
      <span className="seg muted">acmi:bus · upstash · vercel · mi300x</span>
      <span className="seg muted">token:acmi:user:mikey:*</span>
    </footer>
  );
}

// ─── Left rail ─────────────────────────────────────────────────
function LeftRail({ selectedAgent, onSelectAgent, onOpenWork, onOpenThread }) {
  const { FLEET, WORK, THREADS } = window.ACMI;
  return (
    <aside className="rail">
      <div className="rail-section">
        <h4>Fleet roster<span className="count">{FLEET.length} agents</span></h4>
        {FLEET.map(a => (
          <div
            key={a.id}
            className={`agent-row ${a.status} ${selectedAgent===a.id?"selected":""} ${a.self?"self":""}`}
            onClick={()=>onSelectAgent(a.id)}
          >
            <span className="pulse-dot"></span>
            <div style={{minWidth:0}}>
              <div className="name">
                <b>{a.label}</b>
                {a.self && <span className="self-tag">YOU</span>}
              </div>
              <div className="role">{a.role}</div>
            </div>
            <span className="count">{a.pulse}</span>
          </div>
        ))}
      </div>
      <hr/>
      <div className="rail-section">
        <h4>Work items<span className="count">{WORK.length} active</span></h4>
        {WORK.slice(0,6).map(w => (
          <div key={w.id} className="work-row" onClick={()=>onOpenWork(w.id)}>
            <span className={`pri pri-${w.priority}`}>{w.priority}</span>
            <div style={{minWidth:0}}>
              <div className="title">{w.title}</div>
              <div className="meta">{w.status} · {w.phase || "—"}</div>
            </div>
          </div>
        ))}
      </div>
      <hr/>
      <div className="rail-section">
        <h4>Threads<span className="count">{THREADS.length}</span></h4>
        {THREADS.map(t => (
          <div key={t.id} className="thread-row" onClick={()=>onOpenThread(t.id)}>
            <span className="hash">#</span>
            <span className="grow">{t.label}</span>
            <span className={`unread ${t.unread===0?"zero":""}`}>{t.unread}</span>
          </div>
        ))}
      </div>
      <hr/>
      <div className="rail-section" style={{paddingBottom:20}}>
        <h4>Infrastructure</h4>
        <div className="thread-row"><span className="hash">⬡</span><span className="grow">Upstash Redis</span><span className="unread zero">ok</span></div>
        <div className="thread-row"><span className="hash">⬡</span><span className="grow">Vercel API</span><span className="unread zero">ok</span></div>
        <div className="thread-row"><span className="hash">⬡</span><span className="grow">MI300X pool</span><span className="unread zero">ok</span></div>
        <div className="thread-row"><span className="hash">⬡</span><span className="grow">Lobster Trap</span><span className="unread zero">ok</span></div>
      </div>
    </aside>
  );
}

// ─── Right drawer ──────────────────────────────────────────────
function RightDrawer({ selected, onAct, onClose, agentTimeline }) {
  if (!selected) {
    return (
      <aside className="drawer">
        <div className="drawer-empty">
          <div className="icon">⊕</div>
          <div>Select an event, work item, or agent to inspect.</div>
          <div style={{marginTop:14,fontSize:11,fontFamily:"JetBrains Mono",color:"var(--ink-4)"}}>
            ratify · defer · decline · route
          </div>
        </div>
      </aside>
    );
  }
  if (selected.type === "event") return <EventDrawer ev={selected.data} onAct={onAct} onClose={onClose} />;
  if (selected.type === "work")  return <WorkDrawer  w={selected.data} onClose={onClose} />;
  if (selected.type === "agent") return <AgentDrawer a={selected.data} timeline={agentTimeline} onClose={onClose} />;
  if (selected.type === "cron")  return <CronDrawer  c={selected.data} onAct={onAct} onClose={onClose} />;
  return null;
}

function EventDrawer({ ev, onAct, onClose }) {
  const isHITL = ev.kind === "hitl-required" || ev.kind === "decision-pending";
  return (
    <aside className="drawer">
      <div className="drawer-pane">
        <h3>Event detail <span style={{float:"right",cursor:"pointer",color:"var(--ink-3)"}} onClick={onClose}>×</span></h3>
        <div className="kv"><span className="k">Kind</span><span className="v"><span className={`kind-badge ${ev.kind}`}>{ev.kind}</span></span></div>
        <div className="kv"><span className="k">Source</span><span className="v mono">{ev.source}</span></div>
        <div className="kv"><span className="k">Ts</span><span className="v mono">{fmtTsFull(ev.ts)}</span></div>
        <div className="kv"><span className="k">Rel</span><span className="v">{fmtRel(ev.ts)}</span></div>
        <div className="kv"><span className="k">cid</span><span className="v mono">{ev.cid}</span></div>
        {ev.parentCid && <div className="kv"><span className="k">parent</span><span className="v mono">{ev.parentCid}</span></div>}
        {ev.tags && <div className="kv"><span className="k">Tags</span><span className="v">{ev.tags.map(t => <span key={t} className="tl-meta" style={{display:"inline-block",marginRight:6}}><span className="tag-pill">{t}</span></span>)}</span></div>}
      </div>
      <div className="drawer-pane">
        <h3>Summary</h3>
        <div style={{fontSize:13,lineHeight:1.55,textWrap:"pretty"}}>{ev.summary}</div>
      </div>
      <div className="drawer-pane">
        <h3>Payload preview</h3>
        <pre>{JSON.stringify({ ts: ev.ts, source: ev.source, kind: ev.kind, cid: ev.cid, ...(ev.parentCid?{parentCid:ev.parentCid}:{}), tags: ev.tags || [] }, null, 2)}</pre>
      </div>
      {isHITL && (
        <div className="drawer-pane" style={{background:"var(--paper-2)"}}>
          <h3 style={{color:"var(--err)"}}>Operator action required</h3>
          <div style={{fontSize:12,color:"var(--ink-2)",marginBottom:12}}>
            Choose a resolution. Posts a new <code>decision-*</code> event to the chain.
          </div>
          <div className="action-row">
            <button className="btn ratify"  onClick={()=>onAct(ev,"ratify")}>✓ Ratify</button>
            <button className="btn defer"   onClick={()=>onAct(ev,"defer")}>⏸ Defer 24h</button>
            <button className="btn decline" onClick={()=>onAct(ev,"decline")}>✗ Decline</button>
            <button className="btn route"   onClick={()=>onAct(ev,"route")}>↻ Route to…</button>
            <button className="btn full"    onClick={()=>onAct(ev,"note")}>💬 Add note</button>
          </div>
          <div style={{marginTop:10,fontFamily:"JetBrains Mono",fontSize:10,color:"var(--ink-3)",textTransform:"uppercase",letterSpacing:"0.08em"}}>
            ⌨ R · D · X · /
          </div>
        </div>
      )}
    </aside>
  );
}

function WorkDrawer({ w, onClose }) {
  return (
    <aside className="drawer">
      <div className="drawer-pane">
        <h3>Work item <span style={{float:"right",cursor:"pointer",color:"var(--ink-3)"}} onClick={onClose}>×</span></h3>
        <h2 style={{fontFamily:"GT Sectra,Georgia,serif",fontWeight:500,margin:"4px 0 8px",fontSize:18,letterSpacing:"-0.005em"}}>{w.title}</h2>
        <div className="kv"><span className="k">id</span><span className="v mono">{w.id}</span></div>
        <div className="kv"><span className="k">type</span><span className="v mono">{w.type}</span></div>
        <div className="kv"><span className="k">status</span><span className="v"><span className={`kind-badge ${w.status==="SHIPPED"||w.status==="LIVE"?"milestone-shipped":w.status==="BLOCKED"?"hitl":""}`}>{w.status}</span></span></div>
        <div className="kv"><span className="k">priority</span><span className="v"><span className={`pri pri-${w.priority}`} style={{display:"inline-block",padding:"2px 6px",borderRadius:3,color:"white"}}>{w.priority}</span></span></div>
        <div className="kv"><span className="k">owner</span><span className="v mono">{w.owner||"—"}</span></div>
        <div className="kv"><span className="k">phase</span><span className="v mono">{w.phase||"—"}</span></div>
        {w.deadlineIso && <div className="kv"><span className="k">deadline</span><span className="v mono">{w.deadlineIso} · {w.hoursLeft}h left</span></div>}
      </div>
      <div className="drawer-pane">
        <h3>Description</h3>
        <div style={{fontSize:13,lineHeight:1.55,textWrap:"pretty"}}>{w.desc}</div>
      </div>
      {w.tracks && (
        <div className="drawer-pane">
          <h3>Tracks claimed</h3>
          {w.tracks.map(t => <span key={t} className="kind-badge" style={{marginRight:6,marginBottom:6,display:"inline-block"}}>{t}</span>)}
        </div>
      )}
      {w.openOwners && (
        <div className="drawer-pane">
          <h3>Open owners</h3>
          {Object.entries(w.openOwners).map(([who, items]) => (
            <div key={who} style={{marginBottom:10}}>
              <div className="mono" style={{fontSize:11,color:"var(--ink-1)",fontWeight:600,marginBottom:4}}>{who}</div>
              <ul style={{margin:0,paddingLeft:18,fontSize:12,color:"var(--ink-1)"}}>
                {items.map(it => <li key={it}>{it}</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

function AgentDrawer({ a, timeline, onClose }) {
  return (
    <aside className="drawer">
      <div className="drawer-pane">
        <h3>Agent <span style={{float:"right",cursor:"pointer",color:"var(--ink-3)"}} onClick={onClose}>×</span></h3>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
          <div className="avatar" style={{width:48,height:48,borderRadius:999,background:"linear-gradient(135deg,var(--accent),var(--info))",color:"white",display:"grid",placeItems:"center",fontFamily:"JetBrains Mono",fontWeight:600,fontSize:14}}>
            {initials(a.id)}
          </div>
          <div>
            <div style={{fontFamily:"GT Sectra,Georgia,serif",fontSize:18,fontWeight:500}}>{a.label}</div>
            <div style={{fontFamily:"JetBrains Mono",fontSize:11,color:"var(--ink-3)",textTransform:"uppercase",letterSpacing:"0.06em"}}>{a.status} · {a.pulse} pulse · last 24h</div>
          </div>
        </div>
        <div style={{fontSize:13,color:"var(--ink-1)",lineHeight:1.5}}>{a.role}</div>
      </div>
      <div className="drawer-pane">
        <h3>Recent timeline ({timeline.length})</h3>
        {timeline.length === 0 && <div className="muted" style={{fontSize:12}}>No events in last 24h.</div>}
        {timeline.map(ev => (
          <div key={ev.cid} style={{padding:"8px 0",borderBottom:"1px solid var(--rule-soft)"}}>
            <div style={{fontFamily:"JetBrains Mono",fontSize:10,color:"var(--ink-3)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3}}>
              {fmtRel(ev.ts)} · <span className={`kind-badge ${ev.kind}`}>{ev.kind}</span>
            </div>
            <div style={{fontSize:12,lineHeight:1.45,color:"var(--ink-1)"}}>{ev.summary.slice(0,200)}{ev.summary.length>200?"…":""}</div>
          </div>
        ))}
      </div>
      <div className="drawer-pane">
        <h3>Quick actions</h3>
        <div className="action-row">
          <button className="btn">▶ Wake now</button>
          <button className="btn">📨 Send nudge</button>
          <button className="btn">⏸ Pause</button>
          <button className="btn">📋 Inbox</button>
        </div>
      </div>
    </aside>
  );
}

function CronDrawer({ c, onAct, onClose }) {
  const next5 = useMemo(() => {
    const arr = [];
    let t = Date.now() + c.nextMs;
    const step = c.expr.includes("* * * *") ? (c.expr.startsWith("0 ") ? 24*3600000 : 3600000) : 24*3600000;
    for (let i=0;i<5;i++) { arr.push(t); t += step; }
    return arr;
  }, [c.id]);
  const runs = useMemo(() => {
    return Array.from({length:8},(_,i)=>({
      ts: Date.now() - (i*3600000 + c.lastMs),
      status: i===0?c.status==="errored"?"error":"ok":(Math.random()<0.05?"error":"ok"),
      dur: c.durMs + Math.floor((Math.random()-0.5)*4000),
    }));
  }, [c.id]);
  return (
    <aside className="drawer">
      <div className="drawer-pane">
        <h3>Cron <span style={{float:"right",cursor:"pointer",color:"var(--ink-3)"}} onClick={onClose}>×</span></h3>
        <h2 style={{fontFamily:"GT Sectra,Georgia,serif",fontWeight:500,margin:"4px 0 8px",fontSize:18}}>{c.name}</h2>
        <div className="kv"><span className="k">source</span><span className="v mono">{c.src}</span></div>
        <div className="kv"><span className="k">id</span><span className="v mono">{c.id}</span></div>
        <div className="kv"><span className="k">schedule</span><span className="v mono">{c.expr}</span></div>
        <div className="kv"><span className="k">tz</span><span className="v mono">{c.tz}</span></div>
        <div className="kv"><span className="k">owner</span><span className="v mono">{c.owner || "—"}</span></div>
        <div className="kv"><span className="k">delivery</span><span className="v mono">{c.chan}</span></div>
        <div className="kv"><span className="k">kind</span><span className="v mono">{c.kind}</span></div>
        <div className="kv"><span className="k">enabled</span><span className="v">{c.enabled ? "true" : <span style={{color:"var(--err)"}}>false</span>}</span></div>
        <div style={{marginTop:10,fontSize:12,color:"var(--ink-2)",lineHeight:1.5}}>{c.desc}</div>
      </div>
      <div className="drawer-pane">
        <h3>Next 5 runs</h3>
        <table style={{width:"100%",fontFamily:"JetBrains Mono,monospace",fontSize:11,color:"var(--ink-1)"}}>
          <tbody>
            {next5.map((t,i)=>(
              <tr key={i}><td style={{color:"var(--ink-3)",paddingRight:10}}>#{i+1}</td><td>{fmtTsFull(t)}</td><td style={{textAlign:"right",color:"var(--accent)"}}>in {fmtNextCountdown(t-Date.now())}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="drawer-pane">
        <h3>Last 8 runs</h3>
        <table style={{width:"100%",fontFamily:"JetBrains Mono,monospace",fontSize:11}}>
          <tbody>
            {runs.map((r,i)=>(
              <tr key={i}>
                <td style={{color:"var(--ink-3)",paddingRight:10}}>{fmtRel(r.ts)}</td>
                <td style={{color:r.status==="error"?"var(--err)":"var(--ok)"}}>{r.status==="error"?"✗ error":"✓ ok"}</td>
                <td style={{textAlign:"right",color:"var(--ink-2)"}}>{fmtDuration(r.dur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="drawer-pane" style={{background:"var(--paper-2)"}}>
        <h3>Actions</h3>
        <div className="action-row">
          <button className="btn primary" onClick={()=>onAct(c,"run-now")}>▶ Run Now</button>
          <button className="btn"          onClick={()=>onAct(c,"toggle")}>{c.enabled?"⏸ Disable":"▶ Enable"}</button>
          <button className="btn"          onClick={()=>onAct(c,"snooze")}>🔁 Snooze 24h</button>
          <button className="btn"          onClick={()=>onAct(c,"edit")}>📝 Edit</button>
          <button className="btn"          onClick={()=>onAct(c,"clone")}>📋 Clone</button>
          <button className="btn"          style={{color:"var(--err)",borderColor:"var(--err)"}} onClick={()=>onAct(c,"delete")}>🗑 Delete</button>
        </div>
      </div>
    </aside>
  );
}

Object.assign(window, { TopBar, StatusBar, LeftRail, RightDrawer });
