/* eslint-disable no-undef */
/* app.jsx — top-level App with state + view router + tweaks panel */

const { useState: useStateA, useEffect: useEffectA, useMemo: useMemoA, useCallback: useCallbackA, useRef: useRefA } = React;

const VIEWS = [
  { id:"timeline",   label:"Timeline" },
  { id:"kanban",     label:"Kanban" },
  { id:"calendar",   label:"Calendar" },
  { id:"docs",       label:"Docs" },
  { id:"todos",      label:"Todos" },
  { id:"events",     label:"Events" },
  { id:"cron",       label:"Cron Manager", star:true },
  { id:"roundtable", label:"Roundtable", star:true },
];

const DEFAULTS = /*EDITMODE-BEGIN*/{
  "density": "comfortable",
  "accent": "#0a4d8c",
  "breathing": "room",
  "hitlFlash": 5,
  "showCronStrip": true,
  "roundtableLayout": "cards"
}/*EDITMODE-END*/;

function App() {
  const { FLEET, CRONS, EVENTS, WORK, HITL, DOCS } = window.ACMI;

  // tweaks
  const [tweak, setTweak] = window.useTweaks
    ? window.useTweaks(DEFAULTS)
    : [DEFAULTS, ()=>{}];

  // map accent hex → class name
  const accentMap = {
    "#0a4d8c": "blue", "#8a5a1f": "ochre", "#5b4a8a": "plum", "#1f6b4a": "forest",
  };
  const accentClass = accentMap[String(tweak.accent).toLowerCase?.()] || tweak.accent || "blue";

  // local UI state
  const [view, setView] = useStateA(localStorage.getItem("acmi.view") || "timeline");
  const [events, setEvents] = useStateA(() => [...EVENTS].sort((a,b)=>b.ts-a.ts));
  const [work, setWork] = useStateA(() => [...WORK]);
  const [hitlList, setHitlList] = useStateA(() => [...HITL]);
  const [crons, setCrons] = useStateA(() => [...CRONS]);
  const [selected, setSelected] = useStateA(null);
  const [filters, setFilters] = useStateA({ kinds: [], sources: [], hideCron: false, query: "" });
  const [newCids, setNewCids] = useStateA(() => new Set());
  const [runningIds, setRunningIds] = useStateA(() => new Set());
  const [completedHitlCids, setCompletedHitlCids] = useStateA(() => new Set());
  const [completedTodoIds, setCompletedTodoIds] = useStateA(() => new Set());
  const [selectedAgent, setSelectedAgent] = useStateA(null);
  const [toast, setToast] = useStateA(null);
  const [showKbd, setShowKbd] = useStateA(false);

  useEffectA(() => { localStorage.setItem("acmi.view", view); }, [view]);

  // live data source state — "loading" | "live" | "mock" | "mock-fallback"
  const [liveDataSource, setLiveDataSource] = useStateA("loading");
  const lastEventTsRef = useRefA(0);

  // bootstrap from real ACMI APIs · fallback to mock + synthetic injector on failure
  useEffectA(() => {
    let stopped = false;
    let pollIv = null;
    let syntheticIv = null;

    const SYNTHETIC = [
      () => ({ ts: Date.now(), source: "cron:c-w-anti", kind:"cron-run", cid:`cronRun-c-w-anti-${Date.now()}`,
               summary:"[cron-run ✓] Hourly Wake — antigravity (:45) completed ok in 1.7s.", tags:["cron","ok"] }),
      () => ({ ts: Date.now(), source: "agent:claude-engineer", kind:"signals-update", cid:`signals-${Date.now()}`,
               summary:"[signals-update @claude-cowork] phase advanced step-2 → step-3 for techex-2026.", tags:["signals"] }),
      () => ({ ts: Date.now(), source: "lobstertrap", kind:"lobstertrap-decision", cid:`lt-${Date.now()}`,
               summary:"[lobstertrap-decision ALLOW] perplexity → fetch ai-papers.huggingface.co. risk=0.08.", tags:["governance","allow"] }),
      () => ({ ts: Date.now(), source: "agent:bentley-temp", kind:"nudge", cid:`nudge-${Date.now()}`,
               summary:"[nudge @claude-cowork] Audit reminder: log run-report for techex by EOD.", tags:["nudge"] }),
    ];
    function startSynthetic() {
      syntheticIv = setInterval(() => {
        const ev = SYNTHETIC[Math.floor(Math.random()*SYNTHETIC.length)]();
        setEvents(prev => [ev, ...prev].slice(0, 200));
        setNewCids(prev => { const n = new Set(prev); n.add(ev.cid); return n; });
        setTimeout(() => setNewCids(prev => { const n = new Set(prev); n.delete(ev.cid); return n; }), 1200);
      }, 14000);
    }

    async function bootstrap() {
      if (typeof window.ACMI_LIVE_BOOTSTRAP !== "function") {
        if (!stopped) { setLiveDataSource("mock"); startSynthetic(); }
        return;
      }
      const live = await window.ACMI_LIVE_BOOTSTRAP();
      if (stopped) return;
      if (live && live.live) {
        if (Array.isArray(live.events) && live.events.length) {
          setEvents(live.events);
          lastEventTsRef.current = live.events[0].ts || 0;
        }
        if (Array.isArray(live.work) && live.work.length) setWork(live.work);
        if (Array.isArray(live.hitl) && live.hitl.length) setHitlList(live.hitl);
        if (Array.isArray(live.fleet) && live.fleet.length && window.ACMI) {
          // patch fleet on the window object · LeftRail re-reads it on next render
          window.ACMI.FLEET = live.fleet;
        }
        setLiveDataSource("live");
        // 3s poll for fresh comms events
        pollIv = setInterval(async () => {
          if (stopped || typeof window.ACMI_LIVE_POLL_EVENTS !== "function") return;
          const fresh = await window.ACMI_LIVE_POLL_EVENTS(lastEventTsRef.current);
          if (stopped || fresh.length === 0) return;
          setEvents(prev => {
            const seen = new Set(prev.map(e => e.cid));
            const novel = fresh.filter(e => e.cid && !seen.has(e.cid));
            if (novel.length === 0) return prev;
            lastEventTsRef.current = Math.max(lastEventTsRef.current, ...novel.map(e => e.ts));
            return [...novel, ...prev].slice(0, 300);
          });
          const novelCids = new Set(fresh.map(e => e.cid).filter(Boolean));
          if (novelCids.size > 0) {
            setNewCids(prev => { const n = new Set(prev); novelCids.forEach(c => n.add(c)); return n; });
            setTimeout(() => setNewCids(prev => { const n = new Set(prev); novelCids.forEach(c => n.delete(c)); return n; }), 1500);
          }
        }, 3000);
      } else {
        setLiveDataSource("mock-fallback");
        startSynthetic();
      }
    }

    bootstrap();
    return () => { stopped = true; if (pollIv) clearInterval(pollIv); if (syntheticIv) clearInterval(syntheticIv); };
  }, []);

  // recent runs buffer for cron strip
  const [recentRuns, setRecentRuns] = useStateA([]);

  // keyboard shortcuts
  useEffectA(() => {
    function onKey(e) {
      const inInput = e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA";
      if (inInput) return;
      const k = e.key.toLowerCase();
      if (k === "?") { setShowKbd(s=>!s); }
      else if (k === "/") { e.preventDefault(); document.querySelector(".topbar input")?.focus(); }
      else if (k === "1") setView("timeline");
      else if (k === "2") setView("kanban");
      else if (k === "3") setView("calendar");
      else if (k === "4") setView("docs");
      else if (k === "5") setView("todos");
      else if (k === "6") setView("events");
      else if (k === "7") setView("cron");
      else if (k === "8") setView("roundtable");
      else if (k === "c") setView("cron");
      else if (k === "r" && selected?.type === "event") { e.preventDefault(); doAct(selected.data, "ratify"); }
      else if (k === "d" && selected?.type === "event") { e.preventDefault(); doAct(selected.data, "defer"); }
      else if (k === "x" && selected?.type === "event") { e.preventDefault(); doAct(selected.data, "decline"); }
      else if (k === "j" || k === "k") {
        // navigate timeline rows
        const rows = [...document.querySelectorAll(".tl-row")];
        if (rows.length === 0) return;
        const curIdx = rows.findIndex(r => r.classList.contains("selected"));
        const next = k === "j" ? Math.min(rows.length-1, curIdx+1) : Math.max(0, curIdx-1);
        rows[next]?.click();
      }
      else if (k === "escape") setSelected(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, events]);

  // actions
  const flash = (msg) => { setToast(msg); setTimeout(()=>setToast(null), 2500); };

  const doAct = useCallbackA((ev, action) => {
    const cid = ev.cid || ev.rootCid;
    setCompletedHitlCids(prev => { const n = new Set(prev); n.add(cid); return n; });
    setHitlList(prev => prev.filter(h => h.cid !== cid));
    // post a synthetic resolution event
    const newEv = {
      ts: Date.now(),
      source: "user:mikey",
      kind: action === "ratify" ? "decision-ratified" : action === "defer" ? "decision-deferred" : action === "decline" ? "decision-declined" : "decision-routed",
      cid: `${action}-${cid}-${Date.now()}`,
      parentCid: cid,
      summary: `[${action} @${(ev.source||"fleet").replace(/^agent:/,"")}] Mikey ${action}ed.${action==="defer"?" Snooze 24h.":""}`,
      tags: ["hitl","operator-action", action],
      depth: 1,
    };
    setEvents(prev => [newEv, ...prev]);
    setNewCids(prev => { const n = new Set(prev); n.add(newEv.cid); return n; });
    setTimeout(()=>setNewCids(prev => { const n = new Set(prev); n.delete(newEv.cid); return n; }), 1200);
    setSelected(null);
    flash(`${action} · @${(ev.source||"fleet").replace(/^agent:/,"")}`);
  }, []);

  const doMove = useCallbackA((id, toCol) => {
    setWork(prev => prev.map(w => w.id === id ? { ...w, status: toCol } : w));
    const item = work.find(w=>w.id===id);
    if (!item) return;
    const newEv = {
      ts: Date.now(), source: "user:mikey", kind: "work-phase-change",
      cid: `phase-${id}-${Date.now()}`,
      summary: `[work-phase-change @fleet] Work item '${item.title}' moved ${item.status} → ${toCol} via Kanban.`,
      tags: ["kanban"],
    };
    setEvents(prev => [newEv, ...prev]);
    flash(`moved → ${toCol}`);
  }, [work]);

  const doCronToggle = useCallbackA((id) => {
    setCrons(prev => prev.map(c => c.id === id ? { ...c, enabled: !c.enabled, status: !c.enabled ? "healthy" : "disabled" } : c));
    const c = crons.find(x=>x.id===id);
    flash(`${c.name} · ${c.enabled ? "disabled" : "enabled"}`);
  }, [crons]);

  const doCronAction = useCallbackA((c, action) => {
    if (action === "run-now") {
      // mark running, then mark done after 2s
      setRunningIds(prev => { const n = new Set(prev); n.add(c.id); return n; });
      flash(`▶ ${c.name} · running`);
      setTimeout(() => {
        setRunningIds(prev => { const n = new Set(prev); n.delete(c.id); return n; });
        const newEv = {
          ts: Date.now(), source: `cron:${c.id}`, kind: "cron-run",
          cid: `cronRun-${c.id}-${Date.now()}`,
          summary: `[cron-run ✓ manual] ${c.name} completed ok in 2.0s (mikey triggered).`,
          tags: ["cron","manual","ok"],
        };
        setEvents(prev => [newEv, ...prev]);
        setNewCids(prev => { const n = new Set(prev); n.add(newEv.cid); return n; });
        setTimeout(()=>setNewCids(prev => { const n = new Set(prev); n.delete(newEv.cid); return n; }), 1200);
        flash(`✓ ${c.name} · ok`);
      }, 2200);
    } else if (action === "toggle") {
      doCronToggle(c.id);
    } else if (action === "snooze") {
      flash(`🔁 ${c.name} · snoozed 24h`);
    } else if (action === "delete") {
      flash(`🗑 ${c.name} · would delete (demo)`);
    } else if (action === "clone") {
      flash(`📋 ${c.name} · cloned as new (disabled)`);
    } else {
      flash(`${action} · ${c.name}`);
    }
  }, [doCronToggle]);

  // derived
  const fleetActive = FLEET.filter(a => a.status === "active").length;
  const cronEnabled = crons.filter(c => c.enabled).length;
  const cronErrored = crons.filter(c => c.errs > 0).length;
  const hitlPending = hitlList.filter(h => !completedHitlCids.has(h.cid)).length;

  const agentTimeline = useMemoA(() => {
    if (!selectedAgent) return [];
    return events.filter(e => e.source === `agent:${selectedAgent}` || e.source === selectedAgent).slice(0, 10);
  }, [selectedAgent, events]);

  // root classes
  const rootClass = `density-${tweak.density} breathing-${tweak.breathing} accent-${accentClass}`;
  useEffectA(() => {
    document.documentElement.style.setProperty("--hitl-pulse", String(tweak.hitlFlash || 1));
  }, [tweak.hitlFlash]);

  function onSelectAgent(id) {
    setSelectedAgent(id);
    const a = FLEET.find(x => x.id === id);
    if (a) setSelected({ type: "agent", data: a });
  }

  function onSearch(q) { setFilters(prev => ({ ...prev, query: q })); }

  function renderView() {
    switch (view) {
      case "timeline":  return <TimelineView events={events} onSelect={setSelected} selectedCid={selected?.data?.cid} filters={filters} onFilterChange={setFilters} newCids={newCids} />;
      case "kanban":    return <KanbanView work={work} onMove={doMove} onSelect={setSelected} selectedId={selected?.data?.id} />;
      case "calendar":  return <CalendarView events={events} work={work} crons={crons} />;
      case "docs":      return <DocsView docs={DOCS} />;
      case "todos":     return <TodosView hitl={hitlList.filter(h=>!completedHitlCids.has(h.cid))} work={work} onSelect={setSelected} onComplete={(id)=>setCompletedTodoIds(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;})} completedIds={completedTodoIds} />;
      case "events":    return <EventsView events={events} onSelect={setSelected} selectedCid={selected?.data?.cid} />;
      case "cron":      return <CronManagerView crons={crons} onSelect={setSelected} selectedId={selected?.data?.id} onToggle={doCronToggle} onRunNow={(c)=>doCronAction(c,"run-now")} showStrip={tweak.showCronStrip} runningIds={runningIds} recentRuns={recentRuns} />;
      case "roundtable":return <RoundtableView events={events} hitl={hitlList} layout={tweak.roundtableLayout} onAct={doAct} completedCids={completedHitlCids} />;
      default: return null;
    }
  }

  return (
    <div className={`app ${rootClass}`} data-source={liveDataSource}>
      <TopBar hitlCount={hitlPending} view={view} onSearch={onSearch} liveDataSource={liveDataSource} />
      <div className={`app-main ${selected ? "" : "drawer-closed"}`}>
        <LeftRail
          selectedAgent={selectedAgent}
          onSelectAgent={onSelectAgent}
          onOpenWork={(id) => { setView("kanban"); const w = work.find(x=>x.id===id); if (w) setSelected({type:"work",data:w}); }}
          onOpenThread={() => setView("timeline")}
        />
        <main className="canvas" data-screen-label={VIEWS.find(v=>v.id===view)?.label || view}>
          <div className="tabs" role="tablist">
            {VIEWS.map((v, i) => (
              <div key={v.id}
                className={`tab ${view===v.id?"active":""}`}
                role="tab"
                onClick={()=>setView(v.id)}
              >
                <span className="num">{i+1}</span>
                {v.label}
                {v.star && <span className="star">★</span>}
                {v.id === "roundtable" && hitlPending > 0 && <span className="badge">{hitlPending}</span>}
                {v.id === "cron" && cronErrored > 0 && <span className="badge" style={{color:"var(--err)",background:"transparent",border:"1px solid var(--err)"}}>⚠ {cronErrored}</span>}
              </div>
            ))}
          </div>
          {renderView()}
        </main>
        <RightDrawer
          selected={selected}
          onAct={doAct}
          onClose={()=>setSelected(null)}
          agentTimeline={agentTimeline}
        />
      </div>
      <StatusBar
        fleetActive={fleetActive}
        fleetTotal={FLEET.length}
        cronEnabled={cronEnabled}
        cronTotal={crons.length}
        cronErrored={cronErrored}
        hitlPending={hitlPending}
        drift={12}
        quotaPct={78}
      />

      {/* Tweaks panel */}
      <window.TweaksPanel title="Tweaks">
        <window.TweakSection label="Density">
          <window.TweakRadio
            value={tweak.density}
            onChange={(v)=>setTweak("density", v)}
            options={[
              { value:"comfortable", label:"Roomy" },
              { value:"compact",     label:"Compact" },
              { value:"dense",       label:"Dense" },
            ]}
          />
        </window.TweakSection>
        <window.TweakSection label="Breathing room">
          <window.TweakRadio
            value={tweak.breathing}
            onChange={(v)=>setTweak("breathing", v)}
            options={[
              { value:"room",  label:"Editorial" },
              { value:"tight", label:"Trader" },
            ]}
          />
        </window.TweakSection>
        <window.TweakSection label="Accent hue">
          <window.TweakColor
            value={tweak.accent}
            onChange={(v)=>setTweak("accent", v)}
            options={["#0a4d8c","#8a5a1f","#5b4a8a","#1f6b4a"]}
          />
        </window.TweakSection>
        <window.TweakSection label="HITL flash">
          <window.TweakSlider
            label="pulses"
            value={tweak.hitlFlash}
            onChange={(v)=>setTweak("hitlFlash", v)}
            min={0} max={20} step={1}
            unit=" pulses"
          />
        </window.TweakSection>
        <window.TweakSection label="Cron timeline strip">
          <window.TweakToggle
            label="Show 24h strip"
            value={tweak.showCronStrip}
            onChange={(v)=>setTweak("showCronStrip", v)}
          />
        </window.TweakSection>
        <window.TweakSection label="Roundtable seat layout">
          <window.TweakRadio
            value={tweak.roundtableLayout}
            onChange={(v)=>setTweak("roundtableLayout", v)}
            options={[
              { value:"cards",  label:"Cards" },
              { value:"table",  label:"Table" },
              { value:"radial", label:"Radial" },
            ]}
          />
        </window.TweakSection>
      </window.TweaksPanel>

      {toast && <div className="toast">{toast}</div>}
      {showKbd && (
        <div className="kbd-help">
          <h6>Keyboard</h6>
          <div className="row"><span className="keys"><kbd>j</kbd>/<kbd>k</kbd></span><span>navigate rows</span></div>
          <div className="row"><span className="keys"><kbd>r</kbd></span><span>ratify</span></div>
          <div className="row"><span className="keys"><kbd>d</kbd></span><span>defer 24h</span></div>
          <div className="row"><span className="keys"><kbd>x</kbd></span><span>decline</span></div>
          <div className="row"><span className="keys"><kbd>/</kbd></span><span>search</span></div>
          <div className="row"><span className="keys"><kbd>esc</kbd></span><span>close drawer</span></div>
          <div className="row"><span className="keys"><kbd>1</kbd>…<kbd>8</kbd></span><span>switch view</span></div>
          <div className="row"><span className="keys"><kbd>c</kbd></span><span>cron manager</span></div>
        </div>
      )}
      <div onClick={()=>setShowKbd(s=>!s)}
        style={{position:"fixed",bottom:38,right:16,cursor:"pointer",fontFamily:"JetBrains Mono",fontSize:11,color:"var(--ink-3)",background:"var(--paper-1)",border:"1px solid var(--rule)",padding:"4px 9px",borderRadius:999,zIndex:4}}>
        <kbd style={{background:"var(--paper-3)",padding:"1px 4px",borderRadius:3,fontSize:10}}>?</kbd> shortcuts
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
