/* eslint-disable no-undef */
/* views-bespoke.jsx — Cron Manager + Roundtable */

const { useState: useStateB, useMemo: useMemoB } = React;
const HB = window.helpers;

// ─── CRON MANAGER ───────────────────────────────────────────────
function CronManagerView({ crons, onSelect, selectedId, onToggle, onRunNow, showStrip, runningIds, recentRuns }) {
  const [group, setGroup] = useStateB("all");
  const [filter, setFilter] = useStateB(null);   // 'enabled' | 'disabled' | 'errored' | 'running'
  const [sort, setSort] = useStateB("next-asc");

  const counts = useMemoB(() => {
    const c = { total: crons.length, openclaw: 0, launchd: 0, vercel: 0, off: 0, err: 0, running: 0 };
    crons.forEach(x => {
      c[x.src] = (c[x.src]||0) + 1;
      if (!x.enabled) c.off++;
      if (x.errs > 0) c.err++;
      if (runningIds.has(x.id) || x.status === "running") c.running++;
    });
    return c;
  }, [crons, runningIds]);

  const groupByOptions = [
    { id:"all",      label:"All",         get:()=>[["All", crons]] },
    { id:"owner",    label:"By owner",    get:()=>groupBy(crons, c=>c.owner||"unassigned") },
    { id:"kind",     label:"By kind",     get:()=>groupBy(crons, c=>c.kind) },
    { id:"schedule", label:"By schedule", get:()=>groupBy(crons, c=>scheduleBucket(c.expr)) },
    { id:"status",   label:"By status",   get:()=>groupBy(crons, c=>!c.enabled?"disabled":c.errs>0?"errored":runningIds.has(c.id)?"running":"healthy") },
  ];
  const gOpt = groupByOptions.find(g=>g.id===group);
  let groups = gOpt.get();

  // apply filter
  if (filter) {
    groups = groups.map(([k, arr]) => [k, arr.filter(c => {
      if (filter === "enabled")  return c.enabled;
      if (filter === "disabled") return !c.enabled;
      if (filter === "errored")  return c.errs > 0;
      if (filter === "running")  return runningIds.has(c.id) || c.status === "running";
      return true;
    })]).filter(([_,a]) => a.length > 0);
  }
  // sort within groups
  groups = groups.map(([k, arr]) => [k, sortCrons(arr, sort, runningIds)]);

  return (
    <>
      <div className="view-header">
        <div>
          <h2>Cron Manager <span style={{color:"var(--warn)",fontSize:14}}>★</span></h2>
          <div className="sub">
            {counts.openclaw} openclaw · {counts.launchd} launchd · {counts.vercel||0} vercel ·
            <span style={{color:counts.off?"var(--ink-2)":"inherit"}}> {counts.off} OFF</span> ·
            <span style={{color:counts.err?"var(--err)":"var(--ok)"}}> ⚠ {counts.err} errors</span>
          </div>
        </div>
        <div style={{display:"flex",gap:6}}>
          <span className="chip">+ New Cron</span>
          <span className="chip">↻ Refresh</span>
        </div>
      </div>
      <div className="view-toolbar">
        <span className="chip" style={{borderColor:"transparent",color:"var(--ink-3)"}}>filter</span>
        {["enabled","disabled","errored","running"].map(f => (
          <span key={f} className={`chip ${filter===f?"active":""}`} onClick={()=>setFilter(filter===f?null:f)}>{f}</span>
        ))}
        <span className="spacer"></span>
        <span className="chip" style={{borderColor:"transparent",color:"var(--ink-3)"}}>sort by</span>
        {["next-asc","last-desc","alpha"].map(s => (
          <span key={s} className={`chip ${sort===s?"active":""}`} onClick={()=>setSort(s)}>{s}</span>
        ))}
      </div>
      <div className="view-body">
        <div className="cron-layout" style={{gridTemplateRows: showStrip ? "1fr 220px" : "1fr 0"}} data-screen-label="Cron Manager">
          <div className="cron-side">
            <h5>Group by</h5>
            {groupByOptions.map(g => (
              <div key={g.id} className={`opt ${group===g.id?"active":""}`} onClick={()=>setGroup(g.id)}>
                <span>{g.label}</span>
                {g.id !== "all" && <span className="n">{g.get().length}</span>}
              </div>
            ))}
            <h5>Quick counts</h5>
            <div className="opt"><span>openclaw</span><span className="n">{counts.openclaw}</span></div>
            <div className="opt"><span>launchd</span><span className="n">{counts.launchd}</span></div>
            <div className="opt"><span>disabled</span><span className="n">{counts.off}</span></div>
            <div className="opt"><span>errored</span><span className="n" style={{color:counts.err?"var(--err)":""}}>{counts.err}</span></div>
            <div className="opt"><span>running</span><span className="n">{counts.running}</span></div>
            <h5>Owner</h5>
            <div className="opt"><span>main</span><span className="n">{crons.filter(c=>c.owner==="main").length}</span></div>
            <div className="opt"><span>system</span><span className="n">{crons.filter(c=>c.owner==="system").length}</span></div>
            <div className="opt"><span>unassigned</span><span className="n">{crons.filter(c=>c.owner==="-"||!c.owner).length}</span></div>
          </div>
          <div className="cron-grid-wrap">
            {groups.map(([gk, arr]) => (
              <div key={gk} style={{marginBottom:24}}>
                {group !== "all" && (
                  <div style={{display:"flex",alignItems:"baseline",gap:12,marginBottom:10,paddingBottom:6,borderBottom:"1px solid var(--rule-soft)"}}>
                    <h4 style={{margin:0,fontFamily:"GT Sectra,Georgia,serif",fontSize:18,fontWeight:500}}>{gk}</h4>
                    <span style={{fontFamily:"JetBrains Mono",fontSize:11,color:"var(--ink-3)",textTransform:"uppercase",letterSpacing:"0.08em"}}>{arr.length} crons</span>
                  </div>
                )}
                <div className="cron-grid">
                  {arr.map(c => (
                    <CronCard key={c.id}
                      c={c}
                      selected={selectedId===c.id}
                      onSelect={()=>onSelect({type:"cron",data:c})}
                      onToggle={()=>onToggle(c.id)}
                      running={runningIds.has(c.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <CronStrip crons={crons.filter(c => c.enabled).slice(0,16)} runs={recentRuns} runningIds={runningIds} hidden={!showStrip} />
        </div>
      </div>
    </>
  );
}

function CronCard({ c, selected, onSelect, onToggle, running }) {
  const status = running ? "running" : (!c.enabled ? "disabled" : c.errs > 0 ? "errored" : "healthy");
  return (
    <div
      className={`cron-card ${selected?"selected":""} ${c.enabled?"on":""} ${!c.enabled?"disabled":""} ${c.errs>0?"errored":""}`}
      data-status={status}
      data-errs={c.errs}
      onClick={onSelect}
    >
      <div className="cc-head">
        <span className="cc-dot"></span>
        <div className="cc-name">
          {c.name}
          <span className="cc-source">{c.src}</span>
        </div>
        <div className="cc-toggle" onClick={(e)=>{e.stopPropagation();onToggle();}}></div>
      </div>
      <div className="cc-meta">
        <span className="lbl">⏰</span><span>{c.expr} {c.tz!=="-" ? c.tz : ""}</span>
        <span className="lbl">👤</span><span>{c.owner||"—"} · {c.chan}</span>
      </div>
      <div className="cc-footer">
        <span className="next">↻ next {HB.fmtNextCountdown(c.nextMs)}</span>
        <span className={`last ${c.errs>0?"err":""}`}>
          {c.errs>0 ? "✗ err" : running ? "● running" : "✓ ok"} · {HB.fmtDuration(c.durMs)}
        </span>
      </div>
    </div>
  );
}

function CronStrip({ crons, runs, runningIds, hidden }) {
  if (hidden) return null;
  // 24 hourly buckets, newest=right
  return (
    <div className="cron-strip">
      <div className="cron-strip-head">
        <span style={{width:200,paddingLeft:0}}>last 24h horizon</span>
        <div className="axis">
          {Array.from({length:24},(_,i)=>(
            <span key={i}>{i%4===0 ? `${(24-i)}h` : ""}</span>
          ))}
        </div>
      </div>
      <div className="cron-strip-body">
        {crons.map(c => {
          // generate fake-but-deterministic tick positions based on expr
          const ticks = stripTicks(c);
          return (
            <div key={c.id} className="cron-lane">
              <span className="label" title={c.name}>{c.name}</span>
              <div className="ticks">
                {ticks.map((tk,i) => (
                  <span key={i} className={`tick ${tk.status==="error"?"err":""} ${tk.status==="running"?"running":""}`}
                    style={{left: `calc(${tk.pos}% - 1px)`}}></span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function stripTicks(c) {
  // crude: parse expr to estimate cadence
  if (c.expr === "0 * * * *") return Array.from({length:24},(_,i)=>({pos: ((i+0.5)/24)*100, status:"ok"}));
  if (c.expr === "15 * * * *") return Array.from({length:24},(_,i)=>({pos: ((i+0.25)/24)*100, status:"ok"}));
  if (c.expr === "17 * * * *") return Array.from({length:24},(_,i)=>({pos: ((i+0.28)/24)*100, status:"ok"}));
  if (c.expr === "30 * * * *") return Array.from({length:24},(_,i)=>({pos: ((i+0.5)/24)*100, status:"ok"}));
  if (c.expr === "45 * * * *") return Array.from({length:24},(_,i)=>({pos: ((i+0.75)/24)*100, status: i===23?"running":"ok"}));
  if (c.expr === "5 * * * *")  return Array.from({length:24},(_,i)=>({pos: ((i+0.08)/24)*100, status:"ok"}));
  if (c.expr === "every 1800s") return Array.from({length:48},(_,i)=>({pos: ((i+0.5)/48)*100, status:"ok"}));
  if (c.expr === "0 */4 * * *") return [0,4,8,12,16,20].map(h => ({pos: ((24-h)/24)*100, status:"ok"}));
  if (c.expr === "0 */3 * * *") return [0,3,6,9,12,15,18,21].map(h => ({pos: ((24-h)/24)*100, status:"ok"}));
  if (c.expr === "0 */12 * * *") return [4, 16].map(h => ({pos: (h/24)*100, status:"ok"}));
  if (c.expr === "0 7 * * 1-5") return [{pos: 70, status:"ok"}];
  if (c.expr === "0 8 * * 1-5") return [{pos: 66, status:"ok"}];
  if (c.expr === "0 8 * * *")   return [{pos: 66, status:"ok"}];
  if (c.expr === "0 10 * * *")  return [{pos: 58, status:"ok"}];
  if (c.expr === "0 19 * * 1-5")return [{pos: 38, status:"ok"}];
  return [{pos: 78, status:"ok"}];
}

function scheduleBucket(expr) {
  if (!expr) return "adhoc";
  if (/^\d+\s+\d+\s+\*\s+\*\s+1-5$/.test(expr)) return "weekday";
  if (/^\d+\s+\d+\s+\*\s+\*\s+[0-6]$/.test(expr)) return "weekly";
  if (/^\d+\s+\d+\s+\*\s+\*\s+\*$/.test(expr)) return "daily";
  if (/^\d+\s+\*\s+\*\s+\*\s+\*$/.test(expr)) return "hourly";
  if (/^0\s+\*\/\d+\s+\*\s+\*\s+\*$/.test(expr)) return "multi-hourly";
  if (/^\*\/\d+\s+/.test(expr)) return "interval";
  if (expr.includes("every")) return "interval";
  if (expr === "daemon") return "daemon";
  return "adhoc";
}
function groupBy(arr, fn) {
  const m = new Map();
  arr.forEach(x => { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); });
  return [...m.entries()].sort((a,b)=>b[1].length-a[1].length);
}
function sortCrons(arr, sort, runningIds) {
  const a = [...arr];
  if (sort === "alpha")    a.sort((x,y) => x.name.localeCompare(y.name));
  else if (sort === "next-asc") a.sort((x,y) => (x.enabled?x.nextMs:Infinity) - (y.enabled?y.nextMs:Infinity));
  else if (sort === "last-desc") a.sort((x,y) => x.lastMs - y.lastMs);
  return a;
}


// ─── ROUNDTABLE ─────────────────────────────────────────────────
function RoundtableView({ events, hitl, layout, onAct, completedCids }) {
  // gather decision-pending + hitl-required, resolve a chain per
  const items = events
    .filter(ev => (ev.kind === "decision-pending" || ev.kind === "hitl-required" || ev.kind === "roundtable-open") && !completedCids.has(ev.cid))
    .map(rootEv => buildRoundtable(rootEv, events));
  // also add hitl entries whose cid doesn't match an event source
  // NOTE: must add cid to seenCids after push, else 6 hitl items with the
  // same cid (e.g. Anti-Dead-Project-Detector batch with shared ts) all pass
  // the !seenCids.has check and produce duplicate React keys → invariant warns.
  const seenCids = new Set(items.map(i => i.rootCid));
  hitl.forEach(h => {
    if (seenCids.has(h.cid)) return;
    if (completedCids.has(h.cid)) return;
    const ev = events.find(e => e.cid === h.cid);
    if (ev) return;
    seenCids.add(h.cid);  // ← guard against in-loop duplicate cids
    // synthesize a one-seat roundtable
    items.push({
      rootCid: h.cid,
      title: h.title,
      summary: h.summary,
      ts: h.ts,
      seats: [{ agent:"agent:bentley-temp", voice:"PROPOSE", stance: h.summary, ts: h.ts }],
      kind: "hitl-required",
    });
  });

  return (
    <>
      <div className="view-header">
        <div>
          <h2>Roundtable <span style={{color:"var(--warn)",fontSize:14}}>★</span></h2>
          <div className="sub">{items.length} decisions awaiting · grouped by correlationId chain</div>
        </div>
        <div style={{display:"flex",gap:6}}>
          <span style={{fontFamily:"JetBrains Mono",fontSize:11,color:"var(--ink-3)",textTransform:"uppercase",letterSpacing:"0.06em",alignSelf:"center"}}>layout:</span>
          <span className="chip" style={{opacity:0.6}}>{layout}</span>
          <span style={{fontSize:11,color:"var(--ink-3)",alignSelf:"center"}}>(toggle via Tweaks)</span>
        </div>
      </div>
      <div className="view-body">
        <div className="rt-wrap" data-screen-label="Roundtable">
          {items.length === 0 && (
            <div style={{padding:60,textAlign:"center",color:"var(--ink-3)"}}>
              <div style={{fontSize:34,fontFamily:"JetBrains Mono",color:"var(--ok)",marginBottom:8}}>✓</div>
              All decisions ratified. Quiet floor.
            </div>
          )}
          {items.map((rt, idx) => (
            // composite key: rootCid + idx — defensive guard if upstream dedup is bypassed
            <RoundtableCard key={`${rt.rootCid}__${idx}`} rt={rt} idx={idx} layout={layout} onAct={onAct} />
          ))}
        </div>
      </div>
    </>
  );
}

function buildRoundtable(root, allEvents) {
  // walk children
  const chain = [root];
  function walk(cid, depth=0) {
    if (depth > 5) return;
    allEvents.forEach(e => {
      if (e.parentCid === cid && !chain.includes(e)) {
        chain.push(e); walk(e.cid, depth+1);
      }
    });
  }
  walk(root.cid);
  // group by agent
  const bySrc = new Map();
  chain.forEach(e => {
    if (!bySrc.has(e.source)) bySrc.set(e.source, []);
    bySrc.get(e.source).push(e);
  });
  // build seats — also include addressed agents from summary @-mentions as silent if not seen
  const mentioned = new Set();
  const mm = (root.summary.match(/@[a-z][a-z0-9-]+/gi) || []).map(s => s.slice(1));
  mm.forEach(m => mentioned.add(m));
  const seats = [];
  bySrc.forEach((evs, src) => {
    const latest = evs.sort((a,b)=>b.ts-a.ts)[0];
    const [, body] = HB.escSummary(latest.summary);
    seats.push({
      agent: src, ts: latest.ts,
      voice: HB.classify(latest.kind, latest.summary),
      stance: body.length > 200 ? body.slice(0,200)+"…" : body,
    });
  });
  // add silent mentioned agents
  mentioned.forEach(m => {
    if (m === "mikey" || m === "fleet") return;
    const tag = `agent:${m}`;
    if (![...bySrc.keys()].some(k => k === tag || k.endsWith(":"+m))) {
      seats.push({ agent: tag, voice: "SILENT", stance: `(no response since delegation ${HB.fmtRel(root.ts)})`, ts: null });
    }
  });
  const [pre, body] = HB.escSummary(root.summary);
  return {
    rootCid: root.cid,
    title: extractTitle(body),
    summary: body,
    ts: root.ts,
    seats,
    kind: root.kind,
  };
}
function extractTitle(body) {
  // first sentence-ish, end at sentence break or word boundary up to ~110 chars
  const clean = body.replace(/\s+/g, " ").trim();
  const m = clean.match(/^(.{8,110}?)([.·]|$)/);
  if (m) return m[1].trim();
  // fall back to word-boundary truncate at 110
  if (clean.length <= 110) return clean;
  const cut = clean.slice(0, 110).replace(/\s+\S*$/, "");
  return cut + "…";
}

function RoundtableCard({ rt, idx, layout, onAct }) {
  const urgent = idx === 0;
  return (
    <div className={`rt-card ${urgent?"urgent":""}`}>
      <div className="rt-card-h">
        <div className="info">
          <h3>{rt.title}</h3>
          <div className="ctx">
            <span className="cid">root cid · {rt.rootCid}</span><br/>
            surfaced {HB.fmtRel(rt.ts)} · {rt.seats.length} seats · awaiting <b style={{color:"var(--ink-0)"}}>mikey</b>
          </div>
        </div>
        <span className={`badge ${urgent?"awaiting":"muted"}`}>{urgent?"awaiting ratify":"queued"}</span>
      </div>
      <SeatsLayout seats={rt.seats} layout={layout} title={rt.title} />
      <div className="rt-actions">
        <button className="btn ratify"  onClick={()=>onAct(rt,"ratify")}>✓ Ratify</button>
        <button className="btn defer"   onClick={()=>onAct(rt,"defer")}>⏸ Defer 24h</button>
        <button className="btn decline" onClick={()=>onAct(rt,"decline")}>✗ Decline</button>
        <button className="btn route"   onClick={()=>onAct(rt,"route")}>↻ Route to…</button>
        <span style={{flex:1}}></span>
        <button className="btn">💬 Add note</button>
        <button className="btn">✨ Suggest action (haiku)</button>
      </div>
    </div>
  );
}

function SeatsLayout({ seats, layout, title }) {
  if (layout === "radial") {
    const n = seats.length;
    const R = 175;
    return (
      <div className="rt-seats layout-radial">
        <div className="center">
          decision<br/>node<br/><span style={{color:"var(--ink-3)"}}>↑ ratify ↓</span>
        </div>
        {seats.map((s, i) => {
          const angle = (i / n) * Math.PI * 2 - Math.PI/2;
          const cx = 50 + (R / 5);
          const x = `calc(50% + ${Math.cos(angle) * R}px - 120px)`;
          const y = `calc(50% + ${Math.sin(angle) * R}px - 60px)`;
          return (
            <div key={s.agent} className={`seat ${s.voice==="SILENT"?"silent":""}`} style={{left:x, top:y}}>
              <Seat s={s} compact />
            </div>
          );
        })}
      </div>
    );
  }
  if (layout === "table") {
    return (
      <div className="rt-seats layout-table">
        {seats.map(s => (
          <div key={s.agent} className={`seat ${s.voice==="SILENT"?"silent":""}`}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span className="avatar" style={{width:24,height:24,borderRadius:999,background:"linear-gradient(135deg,var(--accent),var(--info))",color:"white",display:"grid",placeItems:"center",fontFamily:"JetBrains Mono",fontSize:9,fontWeight:600}}>{HB.initials(s.agent)}</span>
              <span className="mono" style={{fontSize:12,fontWeight:500}}>{HB.shortSrc(s.agent)}</span>
            </div>
            <span className={`voice-pill voice-${s.voice}`}>{s.voice}</span>
            <div className="stance">{s.stance}</div>
            <span className="mono" style={{fontSize:10,color:"var(--ink-3)",textTransform:"uppercase",letterSpacing:"0.06em"}}>{s.ts?HB.fmtRel(s.ts):"—"}</span>
          </div>
        ))}
      </div>
    );
  }
  // cards
  return (
    <div className="rt-seats">
      {seats.map(s => (
        <div key={s.agent} className={`seat ${s.voice==="SILENT"?"silent":""}`}>
          <Seat s={s} />
        </div>
      ))}
    </div>
  );
}

function Seat({ s, compact }) {
  return (
    <>
      <div className="seat-head">
        <span className="avatar">{HB.initials(s.agent)}</span>
        <div className="id-block">
          <div className="id">{HB.shortSrc(s.agent)}</div>
          <div className="ts">{s.ts?`Voice · ${s.voice} · ${HB.fmtRel(s.ts)}`:"silent · awaiting"}</div>
        </div>
        <span className={`voice-pill voice-${s.voice}`}>{s.voice}</span>
      </div>
      <div className="stance">{s.stance}</div>
    </>
  );
}

Object.assign(window, { CronManagerView, RoundtableView });
