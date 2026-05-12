/* eslint-disable no-undef */
/* views-core.jsx — Timeline, Events table, Kanban, Calendar, Docs, Todos */

const { useState: useStateV, useEffect: useEffectV, useMemo: useMemoV, useRef: useRefV } = React;
const H = window.helpers;

// ─── TIMELINE ──────────────────────────────────────────────────
function TimelineView({ events, onSelect, selectedCid, filters, onFilterChange, newCids }) {
  const kinds = ["decision-pending","hitl-required","milestone-shipped","work-completed","incident-resolved","cron-run","intel-delivered","drift-delta","audit-finding","roundtable-open","decision","incident-correction","signals-update","nudge","lobstertrap-decision"];
  const f = filters;

  const filtered = events.filter(ev => {
    if (f.kinds.length && !f.kinds.includes(ev.kind)) return false;
    if (f.sources.length && !f.sources.includes(ev.source)) return false;
    if (f.hideCron && ev.kind === "cron-run") return false;
    if (f.query && !(ev.summary.toLowerCase().includes(f.query.toLowerCase()) || ev.cid.toLowerCase().includes(f.query.toLowerCase()))) return false;
    return true;
  });

  return (
    <>
      <div className="view-header">
        <div>
          <h2>Timeline</h2>
          <div className="sub">live · {filtered.length} events · newest first</div>
        </div>
        <div className="sub">corr-chain depth shown via indent ↳</div>
      </div>
      <div className="view-toolbar">
        <span className="chip" style={{borderColor:"transparent",color:"var(--ink-3)"}}>filter</span>
        <span className={`chip ${f.kinds.includes("hitl-required")||f.kinds.includes("decision-pending")?"active":""}`}
          onClick={()=>onFilterChange(prev=>{
            const has = prev.kinds.includes("decision-pending");
            return {...prev, kinds: has ? [] : ["decision-pending","hitl-required"]};
          })}>
          ⚠ HITL only
        </span>
        <span className={`chip ${f.kinds.includes("milestone-shipped")?"active":""}`}
          onClick={()=>onFilterChange(prev=>({...prev,kinds:prev.kinds.includes("milestone-shipped")?prev.kinds.filter(k=>k!=="milestone-shipped"):[...prev.kinds,"milestone-shipped"]}))}>
          ✓ Shipped
        </span>
        <span className={`chip ${f.hideCron?"active":""}`}
          onClick={()=>onFilterChange(prev=>({...prev,hideCron:!prev.hideCron}))}>
          {f.hideCron?"☑":"☐"} Hide cron-runs
        </span>
        <span className="chip" onClick={()=>onFilterChange({kinds:[],sources:[],hideCron:false,query:""})}>
          <span className="x">×</span> clear
        </span>
        <span className="spacer"></span>
        <span className="chip" style={{borderColor:"transparent",color:"var(--ink-3)"}}>density via ⌘D · ratify with R</span>
      </div>
      <div className="view-body">
        <div className="scroll" data-screen-label="Timeline">
          {filtered.map(ev => (
            <TLRow key={ev.cid} ev={ev} onSelect={onSelect} selected={selectedCid===ev.cid} isNew={newCids.has(ev.cid)} />
          ))}
          {filtered.length === 0 && (
            <div style={{padding:40,textAlign:"center",color:"var(--ink-3)"}}>
              No events match the current filter.
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function TLRow({ ev, onSelect, selected, isNew }) {
  const [prefix, body] = H.escSummary(ev.summary);
  return (
    <div
      className={`tl-row depth-${ev.depth||0} ${selected?"selected":""} ${isNew?"new-event":""}`}
      onClick={()=>onSelect({type:"event",data:ev})}
    >
      <div className="tl-ts">
        <span className="rel">{H.fmtRel(ev.ts)}</span>
        {H.fmtTs(ev.ts)}
      </div>
      <span className={`tl-band band-${ev.kind}`}></span>
      <div className="tl-body">
        <div className="summary">
          {prefix && <span className="tag">[{prefix}]</span>}{" "}
          {body}
        </div>
        <div className="tl-meta">
          <span className="src">{H.shortSrc(ev.source)}</span>
          <span>·</span>
          <span className="kind">{ev.kind}</span>
          <span>·</span>
          <span className="cid">{ev.cid.slice(0,28)}{ev.cid.length>28?"…":""}</span>
          {ev.tags && ev.tags.slice(0,3).map(t => <span key={t} className="tag-pill">{t}</span>)}
        </div>
      </div>
      <div className="tl-action">
        <span className={`kind-badge ${ev.kind}`}>{ev.kind}</span>
      </div>
    </div>
  );
}

// ─── EVENTS TABLE ──────────────────────────────────────────────
function EventsView({ events, onSelect, selectedCid, filters }) {
  const [sortKey, setSortKey] = useStateV("ts");
  const [asc, setAsc] = useStateV(false);
  const sorted = useMemoV(() => {
    const q = (filters && filters.query) ? filters.query.toLowerCase() : "";
    const arr = [...events]
      .filter(ev => {
        if (!q) return true;
        const inSummary = (ev.summary || "").toLowerCase().includes(q);
        const inCid = (ev.cid || "").toLowerCase().includes(q);
        const inSource = (ev.source || "").toLowerCase().includes(q);
        const inKind = (ev.kind || "").toLowerCase().includes(q);
        return inSummary || inCid || inSource || inKind;
      })
      .sort((a,b) => {
        const av = a[sortKey], bv = b[sortKey];
        if (av < bv) return asc ? -1 : 1;
        if (av > bv) return asc ? 1 : -1;
        return 0;
      });
    return arr;
  }, [events, sortKey, asc, filters]);
  const cols = [["ts","ts"],["source","src"],["kind","kind"],["summary","summary"],["cid","cid"]];
  function clickSort(k) { if (sortKey===k) setAsc(!asc); else { setSortKey(k); setAsc(false); } }
  return (
    <>
      <div className="view-header">
        <div><h2>Events</h2><div className="sub">diagnostic surface · {sorted.length} rows · click row to inspect</div></div>
        <div className="sub" style={{display:"flex",gap:8,alignItems:"center"}}>
          <button className="btn sm">Export JSON</button>
          <button className="btn sm">Export CSV</button>
        </div>
      </div>
      <div className="view-body">
        <div className="scroll" data-screen-label="Events">
          <table className="ev-table">
            <thead>
              <tr>
                {cols.map(([k,label])=>(
                  <th key={k} onClick={()=>clickSort(k)} style={{width:k==="ts"?140:k==="source"?160:k==="kind"?160:k==="cid"?200:"auto"}}>
                    {label} {sortKey===k && (asc?"▲":"▼")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(ev => (
                <tr key={ev.cid}
                  className={selectedCid===ev.cid?"selected":""}
                  onClick={()=>onSelect({type:"event",data:ev})}>
                  <td className="ts">{H.fmtTsFull(ev.ts)}</td>
                  <td className="src">{H.shortSrc(ev.source)}</td>
                  <td><span className={`kind-badge ${ev.kind}`}>{ev.kind}</span></td>
                  <td className="summ"><span className="one">{ev.summary}</span></td>
                  <td className="cid">{ev.cid}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ─── KANBAN ─────────────────────────────────────────────────────
function KanbanView({ work, onMove, onSelect, selectedId }) {
  const cols = ["DRAFT","READY","IN_PROGRESS","BLOCKED","SHIPPED","LIVE"];
  const wipLimit = { IN_PROGRESS: 3 };
  const [dragId, setDragId] = useStateV(null);
  const [overCol, setOverCol] = useStateV(null);
  const byCol = useMemoV(() => {
    const m = {}; cols.forEach(c => m[c]=[]);
    work.forEach(w => { (m[w.status] = m[w.status] || []).push(w); });
    return m;
  }, [work]);
  return (
    <>
      <div className="view-header">
        <div><h2>Kanban</h2><div className="sub">work items · drag to move phase · emits decision event</div></div>
        <div className="sub">WIP limit IN_PROGRESS: 3</div>
      </div>
      <div className="view-body">
        <div className="kanban" data-screen-label="Kanban">
          {cols.map(c => {
            const items = byCol[c] || [];
            const overLimit = wipLimit[c] && items.length > wipLimit[c];
            return (
              <div key={c}
                className={`kcol ${overLimit?"wip-warn":""} ${overCol===c?"over":""}`}
                onDragOver={(e)=>{e.preventDefault(); setOverCol(c);}}
                onDragLeave={()=>setOverCol(null)}
                onDrop={(e)=>{
                  e.preventDefault();
                  if (dragId) onMove(dragId, c);
                  setOverCol(null); setDragId(null);
                }}
              >
                <div className="kcol-h">
                  <span>{c.replace("_"," ")}</span>
                  <span className="count">{items.length}{wipLimit[c]?` / ${wipLimit[c]}`:""}</span>
                </div>
                <div className="kcol-body">
                  {items.map(w => (
                    <div key={w.id}
                      className={`kcard ${dragId===w.id?"drag":""}`}
                      draggable
                      onDragStart={()=>setDragId(w.id)}
                      onDragEnd={()=>setDragId(null)}
                      onClick={()=>onSelect({type:"work",data:w})}
                    >
                      <div className="title">{w.title}</div>
                      <div className="meta">
                        <span className={`pri-badge pri-${w.priority}`}>{w.priority}</span>
                        <span>{w.type}</span>
                        {w.deadlineIso && <span style={{color:"var(--err)"}}>· {w.hoursLeft}h left</span>}
                      </div>
                      <div className="owner-row">
                        <span className="avatar-sm">{H.initials(w.owner||"—")}</span>
                        <span>{w.owner || "unassigned"}</span>
                      </div>
                      {w.phase && <div className="phase">phase · {w.phase}</div>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ─── CALENDAR ───────────────────────────────────────────────────
function CalendarView({ events, work, crons }) {
  const today = new Date();
  const year = today.getFullYear(), month = today.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startDay = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDay; i++) {
    const d = new Date(year, month, -startDay+i+1);
    cells.push({ d, dim: true });
  }
  for (let i = 1; i <= daysInMonth; i++) cells.push({ d: new Date(year, month, i), dim: false });
  while (cells.length < 42) {
    const d = new Date(year, month+1, cells.length - daysInMonth - startDay + 1);
    cells.push({ d, dim: true });
  }

  const monthName = today.toLocaleString("en-US",{month:"long",year:"numeric"});
  function evsForDay(d) {
    return events.filter(ev => {
      const ed = new Date(ev.ts);
      return ed.getFullYear()===d.getFullYear() && ed.getMonth()===d.getMonth() && ed.getDate()===d.getDate();
    });
  }
  function deadlinesForDay(d) {
    return work.filter(w => {
      if (!w.deadlineIso) return false;
      const dd = new Date(w.deadlineIso);
      return dd.getFullYear()===d.getFullYear() && dd.getMonth()===d.getMonth() && dd.getDate()===d.getDate();
    });
  }
  return (
    <>
      <div className="view-header">
        <div><h2>Calendar · {monthName}</h2><div className="sub">events · cron next-runs · deadlines</div></div>
        <div style={{display:"flex",gap:6}}>
          <span className="chip">Month</span>
          <span className="chip" style={{opacity:0.5}}>Week</span>
        </div>
      </div>
      <div className="view-body">
        <div className="cal-head">
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => <div key={d}>{d}</div>)}
        </div>
        <div className="cal-grid" data-screen-label="Calendar">
          {cells.map((c,i)=>{
            const evs = c.dim?[]:evsForDay(c.d);
            const dls = c.dim?[]:deadlinesForDay(c.d);
            const isToday = c.d.toDateString()===today.toDateString();
            return (
              <div key={i} className={`cal-cell ${c.dim?"dim":""} ${isToday?"today":""}`}>
                <div className="dnum">{c.d.getDate()}</div>
                {dls.map(w => <div key={w.id} className="ev-line deadline">⚑ {w.title.slice(0,28)}…</div>)}
                {evs.slice(0,2).map((e,k) => <div key={k} className={`ev-line ${e.kind==="cron-run"?"cron":""}`}>{H.shortSrc(e.source)}</div>)}
                {evs.length>2 && <div className="ev-line cron">+{evs.length-2} more</div>}
                {!c.dim && evs.length>0 && <div className="dots">{evs.slice(0,5).map((_,k)=><span key={k}></span>)}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ─── DOCS ───────────────────────────────────────────────────────
function DocsView({ docs }) {
  const [active, setActive] = useStateV(docs[0]?.path);
  const cur = docs.find(d=>d.path===active) || docs[0];
  return (
    <>
      <div className="view-header">
        <div><h2>Docs</h2><div className="sub">~/clawd/projects · markdown · pinned + recent</div></div>
        <div className="sub">search · ⌘ K</div>
      </div>
      <div className="view-body">
        <div className="docs-layout" data-screen-label="Docs">
          <div className="docs-tree">
            <div style={{fontFamily:"JetBrains Mono",fontSize:10,color:"var(--ink-3)",textTransform:"uppercase",letterSpacing:"0.08em",margin:"4px 0 8px"}}>
              Pinned
            </div>
            {docs.filter(d=>d.pinned).map(d=>(
              <div key={d.path} className={`doc-item ${active===d.path?"active":""}`} onClick={()=>setActive(d.path)}>
                <div style={{flex:1}}>
                  <div>{d.title}</div>
                  <span className="path">{d.path}</span>
                </div>
                <span className="pin">★</span>
              </div>
            ))}
            <div style={{fontFamily:"JetBrains Mono",fontSize:10,color:"var(--ink-3)",textTransform:"uppercase",letterSpacing:"0.08em",margin:"14px 0 8px"}}>
              Recent
            </div>
            {docs.filter(d=>!d.pinned).map(d=>(
              <div key={d.path} className={`doc-item ${active===d.path?"active":""}`} onClick={()=>setActive(d.path)}>
                <div style={{flex:1}}>
                  <div>{d.title}</div>
                  <span className="path">{d.path}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="docs-view">
            <DocBody doc={cur} />
          </div>
        </div>
      </div>
    </>
  );
}

function DocBody({ doc }) {
  if (!doc) return null;
  const lines = doc.body.split("\n");
  const els = [];
  let listBuf = [];
  let tableBuf = null;
  let quoteBuf = [];
  function flushList() { if (listBuf.length) { els.push(<ul key={"u"+els.length}>{listBuf.map((l,i)=><li key={i}>{l}</li>)}</ul>); listBuf=[]; } }
  function flushQuote() { if (quoteBuf.length) { els.push(<blockquote key={"q"+els.length}>{quoteBuf.join(" ")}</blockquote>); quoteBuf=[]; } }
  function flushTable() {
    if (!tableBuf) return;
    els.push(
      <table key={"t"+els.length}>
        <thead><tr>{tableBuf.h.map((c,i)=><th key={i}>{c.trim()}</th>)}</tr></thead>
        <tbody>{tableBuf.r.map((row,i)=><tr key={i}>{row.map((c,j)=><td key={j}>{c.trim()}</td>)}</tr>)}</tbody>
      </table>
    );
    tableBuf = null;
  }
  lines.forEach((l,i)=>{
    if (l.startsWith("# ")) { flushList(); flushTable(); flushQuote(); els.push(<h1 key={i}>{l.slice(2)}</h1>); }
    else if (l.startsWith("## ")) { flushList(); flushTable(); flushQuote(); els.push(<h2 key={i}>{l.slice(3)}</h2>); }
    else if (l.startsWith("### ")) { flushList(); flushTable(); flushQuote(); els.push(<h3 key={i}>{l.slice(4)}</h3>); }
    else if (l.startsWith("- ")) { flushTable(); flushQuote(); listBuf.push(l.slice(2)); }
    else if (l.startsWith("> ")) { flushList(); flushTable(); quoteBuf.push(l.slice(2)); }
    else if (l.startsWith("|")) {
      flushList(); flushQuote();
      const cells = l.split("|").slice(1,-1);
      if (!tableBuf) tableBuf = { h: cells, r: [] };
      else if (/^[-:|\s]+$/.test(l)) {} // header sep
      else tableBuf.r.push(cells);
    }
    else if (l.trim()==="") { flushList(); flushTable(); flushQuote(); }
    else { flushList(); flushTable(); flushQuote();
      // inline code + bold passthrough simple
      const parts = l.split(/(`[^`]+`)/g).map((p,j)=> p.startsWith("`")? <code key={j}>{p.slice(1,-1)}</code> : p);
      els.push(<p key={i}>{parts}</p>);
    }
  });
  flushList(); flushTable(); flushQuote();
  return (
    <>
      <h1>{doc.title}</h1>
      <div className="doc-meta">{doc.path} · pinned · 8 min read</div>
      {els}
    </>
  );
}

// ─── TODOS ──────────────────────────────────────────────────────
function TodosView({ hitl, work, onSelect, onComplete, completedIds }) {
  const operator = hitl.map(h => ({ id: h.cid, ts: h.ts, kind: "operator", title: h.title, sub: h.summary, priority: h.priority }));
  const delegated = work.filter(w => w.owner === "mikey" || (w.openOwners && w.openOwners.mikey)).flatMap(w => {
    if (w.openOwners?.mikey) {
      return w.openOwners.mikey.map((it, i) => ({
        id: `${w.id}::${i}`, ts: Date.now() - (i+1)*HOUR, kind: "delegated",
        title: it, sub: `${w.title} · phase ${w.phase}`, priority: w.priority === "P0" ? 1 : w.priority === "P1" ? 2 : 3,
      }));
    }
    return [];
  });

  const buckets = [
    { p:1, label:"Now" }, { p:2, label:"Today" }, { p:3, label:"This week" }, { p:4, label:"Someday" },
  ];

  function renderCol(items, title) {
    return (
      <div className="todo-col">
        <div className="todo-col-h">
          <span>{title}</span>
          <span style={{color:"var(--ink-3)"}}>{items.length}</span>
        </div>
        {buckets.map(b => {
          const inB = items.filter(i => i.priority === b.p);
          if (inB.length === 0) return null;
          return (
            <React.Fragment key={b.p}>
              <div className="todo-bucket-h">{b.label} · {inB.length}</div>
              {inB.map(it => (
                <div key={it.id} className={`todo-item ${completedIds.has(it.id)?"done":""}`}
                  onClick={()=>onComplete(it.id)}>
                  <div className="todo-check">{completedIds.has(it.id) && "✓"}</div>
                  <div>
                    <div className="title">{it.title}</div>
                    <div className="sub">{it.sub} · {H.fmtRel(it.ts)}</div>
                  </div>
                  <span className={`pri-badge pri-P${it.priority-1}`}>P{it.priority-1}</span>
                </div>
              ))}
            </React.Fragment>
          );
        })}
      </div>
    );
  }
  return (
    <>
      <div className="view-header">
        <div><h2>Todos</h2><div className="sub">operator queue · delegated · drag to reprioritize</div></div>
        <div className="sub">{operator.filter(o=>!completedIds.has(o.id)).length + delegated.filter(d=>!completedIds.has(d.id)).length} open</div>
      </div>
      <div className="view-body">
        <div className="todos-layout" data-screen-label="Todos">
          {renderCol(operator, "Operator todos · HITL queue")}
          {renderCol(delegated, "Delegated · agent work for mikey")}
        </div>
      </div>
    </>
  );
}

const HOUR = 3600000;

Object.assign(window, { TimelineView, EventsView, KanbanView, CalendarView, DocsView, TodosView });
