// sizzle-scenes.jsx — ACMI 75-second sizzle reel
// Composes Stage children into the full story arc.

const C = {
  canvas: '#0a0e27',
  panel: '#1a1a2e',
  recessed: '#0f1729',
  border: '#1f2937',
  accent: '#ffd166',
  data: '#3b82f6',
  allow: '#10b981',
  deny: '#ef4444',
  text: '#e5e7eb',
  strong: '#ffffff',
  muted: '#94a3b8',
};

const FONT_DISPLAY = "'Inter Tight', 'Inter', system-ui, sans-serif";
const FONT_BODY = "'Inter', system-ui, sans-serif";
const FONT_MONO = "'JetBrains Mono', ui-monospace, monospace";

// ── Shared background: hex-grid + radial vignette ───────────────────────────
function CanvasBg() {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: C.canvas,
      backgroundImage: `
        radial-gradient(ellipse at 30% 20%, rgba(59,130,246,0.10), transparent 55%),
        radial-gradient(ellipse at 70% 80%, rgba(255,209,102,0.06), transparent 60%)
      `,
    }}>
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.08 }} aria-hidden="true">
        <defs>
          <pattern id="hex" width="56" height="48.5" patternUnits="userSpaceOnUse">
            <path d="M14 0 L42 0 L56 24.25 L42 48.5 L14 48.5 L0 24.25 Z"
              fill="none" stroke="#3b82f6" strokeWidth="0.6" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hex)" />
      </svg>
    </div>
  );
}

// Slow ambient drift particles
function DriftField({ count = 26, color = C.data, opacity = 0.5 }) {
  const t = useTime();
  const dots = React.useMemo(() => Array.from({ length: count }, (_, i) => ({
    x: (i * 137.5) % 1920,
    y: (i * 73.7) % 1080,
    r: 1 + ((i * 7) % 3),
    sp: 8 + ((i * 11) % 24),
    ph: (i * 0.31) % (Math.PI * 2),
  })), [count]);
  return (
    <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {dots.map((d, i) => {
        const x = ((d.x + t * d.sp) % 1920 + 1920) % 1920;
        const y = d.y + Math.sin(t * 0.4 + d.ph) * 14;
        return <circle key={i} cx={x} cy={y} r={d.r} fill={color} opacity={opacity * (0.4 + 0.6 * Math.abs(Math.sin(t * 0.6 + d.ph)))} />;
      })}
    </svg>
  );
}

// Eyebrow tag (small uppercase amber)
function Eyebrow({ children, x, y }) {
  return (
    <div style={{
      position: 'absolute', left: x, top: y,
      fontFamily: FONT_MONO, fontSize: 18, letterSpacing: '0.22em',
      color: C.accent, textTransform: 'uppercase', fontWeight: 500,
    }}>{children}</div>
  );
}

// Tiny event timestamp generator (deterministic-ish)
function ts(seed) {
  const m = ['12', '01', '03', '07', '11'][seed % 5];
  const s = String(((seed * 17) % 60)).padStart(2, '0');
  return `00:${m}:${s}`;
}
function cid(seed) {
  const hex = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 12; i++) s += hex[(seed * (i + 3) * 91) % 16];
  return s;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCENE 1 — 0:00–0:04  "What did the agent actually do?"
// ═══════════════════════════════════════════════════════════════════════════
function SceneQuestion() {
  const { localTime, duration } = useSprite();
  // Caret blink + slow reveal
  const phrase = 'What did the agent actually do?';
  const reveal = clamp(localTime / 1.6, 0, 1);
  const shown = phrase.slice(0, Math.floor(reveal * phrase.length));
  const caretOn = Math.floor(localTime * 2) % 2 === 0;
  const fadeOut = localTime > duration - 0.6 ? (duration - localTime) / 0.6 : 1;

  return (
    <div style={{ position: 'absolute', inset: 0, opacity: clamp(fadeOut, 0, 1) }}>
      <div style={{
        position: 'absolute', left: '50%', top: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center', width: 1600,
      }}>
        <div style={{
          fontFamily: FONT_MONO, fontSize: 16, color: C.muted,
          letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: 36,
        }}>
          Enterprise Security Review · Question 1
        </div>
        <div style={{
          fontFamily: FONT_DISPLAY, fontSize: 96, fontWeight: 600,
          color: C.strong, letterSpacing: '-0.02em', lineHeight: 1.1,
        }}>
          {shown}<span style={{
            color: C.accent, opacity: caretOn ? 1 : 0.1,
            display: 'inline-block', width: 6, height: 84, transform: 'translateY(14px)',
            background: C.accent, marginLeft: 8, verticalAlign: 'middle',
          }} />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SCENE 2 — 0:04–0:14  Three isolated silos (B1)
// ═══════════════════════════════════════════════════════════════════════════
function FrameworkSilo({ name, color, delay, x }) {
  const { localTime } = useSprite();
  const t = clamp((localTime - delay) / 0.8, 0, 1);
  const eased = Easing.easeOutCubic(t);
  if (t <= 0) return null;

  // Mist drifts inside
  const mistY = 380 - Math.sin(localTime * 1.2 + delay * 3) * 18;

  return (
    <div style={{
      position: 'absolute', left: x, top: 200,
      width: 280, height: 600,
      opacity: eased,
      transform: `translateY(${(1 - eased) * 40}px)`,
    }}>
      {/* Cylinder body */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `linear-gradient(180deg, ${C.panel} 0%, ${C.recessed} 100%)`,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: `inset 0 0 80px rgba(0,0,0,0.4), 0 0 40px ${color}22`,
      }}>
        {/* Mist */}
        <div style={{
          position: 'absolute', left: '50%', top: mistY,
          transform: 'translate(-50%, -50%)',
          width: 220, height: 220,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${color}55 0%, ${color}15 45%, transparent 70%)`,
          filter: 'blur(8px)',
        }} />
        {/* Sealed cap top */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 6,
          background: C.border,
        }} />
        {/* Sealed cap bottom */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 6,
          background: C.border,
        }} />
        {/* Inner memory blob label */}
        <div style={{
          position: 'absolute', left: 24, top: 24,
          fontFamily: FONT_MONO, fontSize: 13, color: C.muted,
          letterSpacing: '0.18em', textTransform: 'uppercase',
        }}>memory</div>
        <div style={{
          position: 'absolute', left: 24, right: 24, bottom: 24,
          display: 'flex', flexDirection: 'column', gap: 4,
          fontFamily: FONT_MONO, fontSize: 12, color: C.muted, opacity: 0.5,
        }}>
          <div>{cid(name.length)}</div>
          <div>{cid(name.length + 1)}</div>
          <div>{cid(name.length + 2)}</div>
        </div>
      </div>
      {/* Label below */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 624,
        textAlign: 'center',
        fontFamily: FONT_DISPLAY, fontSize: 32, fontWeight: 600,
        color: C.strong, letterSpacing: '-0.01em',
      }}>{name}</div>
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 670,
        textAlign: 'center',
        fontFamily: FONT_MONO, fontSize: 13, color: C.muted,
        letterSpacing: '0.2em', textTransform: 'uppercase',
      }}>isolated</div>
    </div>
  );
}

function SceneSilos() {
  const { localTime, duration } = useSprite();
  const fadeOut = localTime > duration - 0.6 ? (duration - localTime) / 0.6 : 1;
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: clamp(fadeOut, 0, 1) }}>
      <Eyebrow x={160} y={120}>Act 1 · The Audit Gap</Eyebrow>
      <div style={{
        position: 'absolute', left: 160, top: 160,
        fontFamily: FONT_DISPLAY, fontSize: 64, fontWeight: 600,
        color: C.strong, letterSpacing: '-0.02em', maxWidth: 1100,
      }}>Memory lives inside each framework.</div>

      <FrameworkSilo name="LangChain" color={C.allow}   delay={0.2} x={400} />
      <FrameworkSilo name="CrewAI"    color={C.data}    delay={0.6} x={820} />
      <FrameworkSilo name="Gemini"    color={C.accent}  delay={1.0} x={1240} />

      {/* Caption */}
      {localTime > 3.2 && (
        <div style={{
          position: 'absolute', left: 160, right: 160, bottom: 100,
          textAlign: 'center',
          fontFamily: FONT_BODY, fontSize: 28, color: C.muted,
          opacity: clamp((localTime - 3.2) / 0.6, 0, 1),
        }}>
          Three frameworks. Three sealed memory blobs. <span style={{ color: C.strong }}>Decisions don't transfer.</span>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SCENE 3 — 0:14–0:18  "3 frameworks · 3 audit gaps"
// ═══════════════════════════════════════════════════════════════════════════
function SceneAuditGaps() {
  const { localTime, duration } = useSprite();
  const fadeIn = clamp(localTime / 0.4, 0, 1);
  const fadeOut = localTime > duration - 0.5 ? (duration - localTime) / 0.5 : 1;
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: clamp(fadeIn * fadeOut, 0, 1) }}>
      <div style={{
        position: 'absolute', left: '50%', top: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
      }}>
        <div style={{
          fontFamily: FONT_MONO, fontSize: 18, color: C.muted,
          letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: 40,
        }}>The Problem</div>
        <div style={{
          fontFamily: FONT_DISPLAY, fontSize: 168, fontWeight: 700,
          color: C.strong, letterSpacing: '-0.04em', lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}>
          <span style={{ color: C.accent }}>3</span>
          <span style={{ color: C.muted, margin: '0 32px', fontWeight: 400 }}>·</span>
          <span style={{ color: C.deny }}>3</span>
        </div>
        <div style={{
          marginTop: 28,
          fontFamily: FONT_BODY, fontSize: 36, color: C.text,
          letterSpacing: '-0.01em',
        }}>
          <span style={{ color: C.accent }}>frameworks</span>
          <span style={{ color: C.muted, margin: '0 24px' }}>·</span>
          <span style={{ color: C.deny }}>audit gaps</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SCENE 4 — 0:18–0:30  Policy gate: ALLOW then DENY (B2 + B4)
// ═══════════════════════════════════════════════════════════════════════════
function PolicyPacket({ start, verdict, label, detected }) {
  const { localTime } = useSprite();
  const t = clamp((localTime - start) / 5.0, 0, 1);
  if (t <= 0 || t >= 1) return null;

  // Position: travel from x=200 to x=1720; barrier at x=960
  const x = 200 + t * 1520;
  const beforeBarrier = x < 940;
  const atBarrier = x >= 940 && x < 980;
  const afterBarrier = x >= 980;

  const color = verdict === 'allow' ? C.allow : C.deny;
  const finalColor = afterBarrier ? color : C.accent;

  // Dissolve on deny after barrier
  const dissolve = verdict === 'deny' && afterBarrier;
  const exploded = dissolve ? clamp((x - 980) / 200, 0, 1) : 0;

  return (
    <>
      {/* Packet */}
      <div style={{
        position: 'absolute', left: x, top: 540,
        transform: 'translate(-50%, -50%)',
        width: dissolve ? 0 : 48, height: dissolve ? 0 : 24,
        background: finalColor,
        borderRadius: 4,
        boxShadow: `0 0 24px ${finalColor}`,
        opacity: dissolve ? 0 : 1,
        transition: 'none',
      }} />
      {/* Sparks for deny */}
      {dissolve && exploded < 1 && (
        <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} width="1920" height="1080">
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i / 12) * Math.PI * 2;
            const r = exploded * 80;
            const sx = 980 + Math.cos(angle) * r;
            const sy = 540 + Math.sin(angle) * r;
            return <circle key={i} cx={sx} cy={sy} r={3} fill={C.deny} opacity={1 - exploded} />;
          })}
        </svg>
      )}
      {/* Declared label (moves with packet) */}
      {beforeBarrier && (
        <div style={{
          position: 'absolute', left: x, top: 480,
          transform: 'translate(-50%, -100%)',
          fontFamily: FONT_MONO, fontSize: 14, color: C.muted,
          whiteSpace: 'nowrap',
        }}>
          declared: <span style={{ color: C.text }}>{label}</span>
        </div>
      )}
      {/* Detected label (appears after barrier) */}
      {afterBarrier && verdict === 'deny' && (
        <div style={{
          position: 'absolute', left: 980, top: 480,
          transform: 'translate(-50%, -100%)',
          fontFamily: FONT_MONO, fontSize: 14, color: C.deny,
          whiteSpace: 'nowrap',
        }}>
          detected: <span style={{ color: C.strong }}>{detected}</span> · risk 0.94
        </div>
      )}
      {/* Verdict pill (after barrier) */}
      {afterBarrier && !dissolve && (
        <div style={{
          position: 'absolute', left: x + 36, top: 540,
          transform: 'translateY(-50%)',
          padding: '6px 14px',
          background: `${color}22`,
          border: `1px solid ${color}`,
          borderRadius: 999,
          fontFamily: FONT_MONO, fontSize: 14, fontWeight: 600,
          color: color, letterSpacing: '0.12em',
        }}>
          {verdict === 'allow' ? 'ALLOW' : 'DENY'}
        </div>
      )}
    </>
  );
}

function PolicyBarrier({ flashStart, color }) {
  const { localTime } = useSprite();
  const flash = clamp(1 - (localTime - flashStart) / 0.4, 0, 1);
  return (
    <>
      <div style={{
        position: 'absolute', left: 960, top: 280, width: 4, height: 520,
        background: `linear-gradient(180deg, transparent, ${C.accent}, transparent)`,
        boxShadow: `0 0 24px ${C.accent}88`,
        transform: 'translateX(-50%)',
      }} />
      {/* Scan line flash */}
      {flash > 0 && (
        <div style={{
          position: 'absolute', left: 960, top: 280, width: 80, height: 520,
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
          transform: 'translateX(-50%)',
          opacity: flash,
          filter: 'blur(4px)',
        }} />
      )}
      {/* Hex pattern in barrier */}
      <div style={{
        position: 'absolute', left: 960, top: 280, width: 200, height: 520,
        transform: 'translateX(-50%)',
        background: `repeating-linear-gradient(90deg, ${C.accent}08 0 1px, transparent 1px 12px)`,
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', left: 960, top: 810,
        transform: 'translateX(-50%)',
        fontFamily: FONT_MONO, fontSize: 14, color: C.accent,
        letterSpacing: '0.22em', textTransform: 'uppercase',
      }}>Lobster Trap · Policy Gate</div>
    </>
  );
}

function ScenePolicyGate() {
  const { localTime, duration } = useSprite();
  const fadeIn = clamp(localTime / 0.4, 0, 1);
  const fadeOut = localTime > duration - 0.6 ? (duration - localTime) / 0.6 : 1;
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: clamp(fadeIn * fadeOut, 0, 1) }}>
      <Eyebrow x={160} y={120}>Act 2 · The Fix</Eyebrow>
      <div style={{
        position: 'absolute', left: 160, top: 160,
        fontFamily: FONT_DISPLAY, fontSize: 56, fontWeight: 600,
        color: C.strong, letterSpacing: '-0.02em',
      }}>Inspect at the LLM boundary.</div>

      {/* Source and sink labels */}
      <div style={{
        position: 'absolute', left: 200, top: 540, transform: 'translate(-50%, -50%)',
        fontFamily: FONT_MONO, fontSize: 14, color: C.muted,
        letterSpacing: '0.18em', textTransform: 'uppercase',
      }}>agent</div>
      <div style={{
        position: 'absolute', left: 1720, top: 540, transform: 'translate(-50%, -50%)',
        fontFamily: FONT_MONO, fontSize: 14, color: C.muted,
        letterSpacing: '0.18em', textTransform: 'uppercase',
      }}>llm</div>

      {/* Track line */}
      <div style={{
        position: 'absolute', left: 220, top: 540, right: 220, height: 1,
        background: `linear-gradient(90deg, transparent, ${C.border} 8%, ${C.border} 92%, transparent)`,
      }} />

      <PolicyBarrier flashStart={2.4} color={C.allow} />
      <PolicyBarrier flashStart={7.4} color={C.deny} />

      {/* ALLOW packet 0–5s, DENY packet 5–10s */}
      <PolicyPacket start={0.4}  verdict="allow" label="research" detected="" />
      <PolicyPacket start={5.4}  verdict="deny"  label="research" detected="exfiltration" />

      <div style={{
        position: 'absolute', left: 160, right: 160, bottom: 100,
        textAlign: 'center',
        fontFamily: FONT_BODY, fontSize: 26, color: C.muted,
      }}>
        Declared intent <span style={{ color: C.text }}>vs.</span> detected intent.
        <span style={{ marginLeft: 18, color: C.text }}>Denials are evidence too.</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SCENE 5 — 0:30–0:34  Title card "ACMI + Lobster Trap"
// ═══════════════════════════════════════════════════════════════════════════
function SceneTitleCard() {
  const { localTime, duration } = useSprite();
  const fadeIn = clamp(localTime / 0.5, 0, 1);
  const fadeOut = localTime > duration - 0.5 ? (duration - localTime) / 0.5 : 1;
  const lineDraw = clamp((localTime - 0.6) / 0.8, 0, 1);
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: clamp(fadeIn * fadeOut, 0, 1) }}>
      <div style={{
        position: 'absolute', left: '50%', top: '50%',
        transform: 'translate(-50%, -50%)', textAlign: 'center',
      }}>
        <div style={{
          fontFamily: FONT_DISPLAY, fontSize: 168, fontWeight: 700,
          color: C.strong, letterSpacing: '-0.04em', lineHeight: 1,
        }}>ACMI</div>
        <div style={{
          margin: '32px auto 32px',
          width: 320 * lineDraw, height: 4,
          background: C.accent,
          boxShadow: `0 0 16px ${C.accent}88`,
        }} />
        <div style={{
          fontFamily: FONT_MONO, fontSize: 22, color: C.text,
          letterSpacing: '0.25em', textTransform: 'uppercase',
          opacity: clamp((localTime - 1.2) / 0.5, 0, 1),
        }}>with Veea Lobster Trap</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SCENE 6 — 0:34–0:46  Three keys appear (B3)
// ═══════════════════════════════════════════════════════════════════════════
function KeyCard({ name, glyph, def, delay, x }) {
  const { localTime } = useSprite();
  const t = clamp((localTime - delay) / 0.7, 0, 1);
  const eased = Easing.easeOutBack(t);
  if (t <= 0) return null;
  return (
    <div style={{
      position: 'absolute', left: x, top: 320,
      width: 380, height: 460,
      opacity: clamp(t * 1.4, 0, 1),
      transform: `translateY(${(1 - eased) * 30}px) scale(${0.92 + 0.08 * eased})`,
      background: C.panel,
      border: `1px solid ${C.accent}`,
      borderRadius: 16,
      padding: 36,
      display: 'flex', flexDirection: 'column',
      boxShadow: `0 0 60px ${C.accent}11`,
    }}>
      {/* Glyph */}
      <div style={{
        width: 80, height: 80,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 36,
      }}>{glyph}</div>
      {/* Index */}
      <div style={{
        fontFamily: FONT_MONO, fontSize: 14, color: C.muted,
        letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: 12,
      }}>{name === 'Profile' ? '01' : name === 'Signals' ? '02' : '03'} · key</div>
      <div style={{
        fontFamily: FONT_DISPLAY, fontSize: 44, fontWeight: 600,
        color: C.strong, letterSpacing: '-0.02em', marginBottom: 20,
      }}>{name}</div>
      <div style={{
        fontFamily: FONT_BODY, fontSize: 19, color: C.text,
        lineHeight: 1.5,
      }}>{def}</div>
    </div>
  );
}

function SceneThreeKeys() {
  const { localTime, duration } = useSprite();
  const fadeOut = localTime > duration - 0.6 ? (duration - localTime) / 0.6 : 1;
  const busDraw = clamp((localTime - 2.4) / 0.8, 0, 1);

  return (
    <div style={{ position: 'absolute', inset: 0, opacity: clamp(fadeOut, 0, 1) }}>
      <Eyebrow x={160} y={120}>Act 3 · The Memory Model</Eyebrow>
      <div style={{
        position: 'absolute', left: 160, top: 160,
        fontFamily: FONT_DISPLAY, fontSize: 64, fontWeight: 600,
        color: C.strong, letterSpacing: '-0.02em',
      }}>Three keys per entity.</div>

      <KeyCard
        name="Profile" delay={0.2} x={240}
        glyph={<div style={{ width: 60, height: 60, background: C.accent, opacity: 0.9 }} />}
        def="Who an entity is. Stable identity, schema, lineage."
      />
      <KeyCard
        name="Signals" delay={0.7} x={770}
        glyph={<svg width="60" height="60" viewBox="0 0 60 60"><polygon points="30,0 60,17 60,43 30,60 0,43 0,17" fill={C.accent} opacity="0.9" /></svg>}
        def="What it observes. Append-only, ZSET-backed events."
      />
      <KeyCard
        name="Timeline" delay={1.2} x={1300}
        glyph={<svg width="60" height="60" viewBox="0 0 60 60"><circle cx="30" cy="30" r="28" fill={C.accent} opacity="0.9" /></svg>}
        def="What it did. Correlation-chained, audit-grade."
      />

      {/* Shared bus line — draws across base */}
      <div style={{
        position: 'absolute', left: 240, top: 800,
        width: 1440 * busDraw, height: 2,
        background: `linear-gradient(90deg, ${C.accent}, ${C.accent}88, ${C.accent})`,
        boxShadow: `0 0 12px ${C.accent}88`,
      }} />
      <div style={{
        position: 'absolute', left: 240, top: 824,
        width: 1440 * busDraw,
        fontFamily: FONT_MONO, fontSize: 13, color: C.accent,
        letterSpacing: '0.2em', textTransform: 'uppercase',
        opacity: busDraw > 0.9 ? 1 : 0,
        textAlign: 'center',
      }}>Shared protocol · Any framework can POST JSON</div>

      <div style={{
        position: 'absolute', left: 160, right: 160, bottom: 100,
        textAlign: 'center',
        fontFamily: FONT_BODY, fontSize: 28, color: C.muted,
        opacity: clamp((localTime - 3.5) / 0.6, 0, 1),
      }}>
        Three frameworks. <span style={{ color: C.strong }}>One timeline.</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SCENE 7 — 0:46–0:58  Live dashboard log
// ═══════════════════════════════════════════════════════════════════════════
const LOG_ROWS = [
  { fw: 'langchain',  verdict: 'ALLOW', msg: 'tool.search · web.read',          risk: '0.12' },
  { fw: 'crewai',     verdict: 'ALLOW', msg: 'research.synthesize',             risk: '0.18' },
  { fw: 'gemini',     verdict: 'ALLOW', msg: 'cross_check · facts.verify',      risk: '0.09' },
  { fw: 'langchain',  verdict: 'ALLOW', msg: 'memory.append profile',           risk: '0.04' },
  { fw: 'crewai',     verdict: 'LOG',   msg: 'agent.delegate research-output',  risk: '0.31' },
  { fw: 'langchain',  verdict: 'ALLOW', msg: 'http.fetch arxiv.org',            risk: '0.07' },
  { fw: 'gemini',     verdict: 'ALLOW', msg: 'summarize.long_context',          risk: '0.05' },
  { fw: 'crewai',     verdict: 'DENY',  msg: 'fs.write /etc/passwd',            risk: '0.94' },
  { fw: 'gemini',     verdict: 'ALLOW', msg: 'embed.batch · 24 docs',           risk: '0.02' },
  { fw: 'langchain',  verdict: 'ALLOW', msg: 'tool.call · weather',             risk: '0.03' },
  { fw: 'crewai',     verdict: 'ALLOW', msg: 'plan.refine · iter 3',            risk: '0.11' },
  { fw: 'gemini',     verdict: 'ALLOW', msg: 'memory.append signals',           risk: '0.08' },
];

function LogRow({ row, idx, scrollT }) {
  const y = 200 + (idx - scrollT) * 60;
  if (y < 140 || y > 920) return null;

  const verdictColor = row.verdict === 'ALLOW' ? C.allow
                     : row.verdict === 'DENY'  ? C.deny
                     : C.accent;
  const fade = y < 200 ? (y - 140) / 60 : y > 860 ? (920 - y) / 60 : 1;

  return (
    <div style={{
      position: 'absolute', left: 100, right: 100, top: y, height: 52,
      display: 'flex', alignItems: 'center', gap: 24,
      padding: '0 24px',
      background: row.verdict === 'DENY' ? `${C.deny}11` : 'transparent',
      borderRadius: 8,
      borderBottom: `1px solid ${C.border}`,
      opacity: fade,
      fontFamily: FONT_MONO, fontSize: 16,
    }}>
      <div style={{ width: 100, color: C.muted, fontSize: 14 }}>{ts(idx)}</div>
      <div style={{
        padding: '4px 10px', border: `1px solid ${verdictColor}`,
        color: verdictColor, borderRadius: 4, fontSize: 12,
        background: `${verdictColor}11`, fontWeight: 600,
        letterSpacing: '0.08em', minWidth: 56, textAlign: 'center',
      }}>{row.verdict}</div>
      <div style={{ width: 110, color: C.accent, fontSize: 13, letterSpacing: '0.06em' }}>[{row.fw}]</div>
      <div style={{ flex: 1, color: C.text }}>{row.msg}</div>
      <div style={{ color: C.muted, fontSize: 13 }}>risk {row.risk}</div>
      <div style={{ color: C.muted, fontSize: 13, opacity: 0.7 }}>cid:{cid(idx)}</div>
    </div>
  );
}

function SceneDashboard() {
  const { localTime, duration } = useSprite();
  const fadeIn = clamp(localTime / 0.5, 0, 1);
  const fadeOut = localTime > duration - 0.6 ? (duration - localTime) / 0.6 : 1;
  // Scroll: rows shift up over time. Total rows shown via scrollT.
  const scrollT = Math.max(0, (localTime - 0.4) * 0.9);

  return (
    <div style={{ position: 'absolute', inset: 0, opacity: clamp(fadeIn * fadeOut, 0, 1) }}>
      <Eyebrow x={160} y={80}>Act 4 · The Receipts</Eyebrow>
      <div style={{
        position: 'absolute', left: 160, top: 120,
        fontFamily: FONT_DISPLAY, fontSize: 48, fontWeight: 600,
        color: C.strong, letterSpacing: '-0.02em',
      }}>One audit trail. Three frameworks.</div>

      {/* Dashboard chrome */}
      <div style={{
        position: 'absolute', left: 80, top: 200, right: 80, bottom: 200,
        background: C.recessed,
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        overflow: 'hidden',
      }}>
        {/* Header strip */}
        <div style={{
          position: 'absolute', left: 0, right: 0, top: 0, height: 60,
          background: C.panel,
          borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', padding: '0 32px', gap: 24,
          fontFamily: FONT_MONO, fontSize: 14,
        }}>
          <div style={{ color: C.strong, fontWeight: 600, letterSpacing: '0.1em' }}>ACMI · GOVERNANCE</div>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.allow, boxShadow: `0 0 12px ${C.allow}` }} />
          <div style={{ color: C.allow, fontSize: 12, letterSpacing: '0.2em' }}>LIVE</div>
          <div style={{ flex: 1 }} />
          <div style={{ color: C.muted }}>events <span style={{ color: C.strong, fontWeight: 600 }}>1,603</span> / 24h</div>
        </div>
      </div>

      {/* Log rows — clip to dashboard interior */}
      <div style={{
        position: 'absolute', left: 80, top: 260, right: 80, bottom: 200,
        overflow: 'hidden',
      }}>
        {LOG_ROWS.map((row, i) => (
          <LogRow key={i} row={row} idx={i} scrollT={scrollT - 1.5} />
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SCENE 8 — 0:58–1:06  Receipts strip
// ═══════════════════════════════════════════════════════════════════════════
function ReceiptCell({ value, label, delay, accent = false }) {
  const { localTime } = useSprite();
  const t = clamp((localTime - delay) / 0.6, 0, 1);
  const eased = Easing.easeOutCubic(t);

  return (
    <div style={{
      flex: 1,
      padding: '60px 24px',
      borderRight: `1px solid ${C.border}`,
      textAlign: 'center',
      opacity: t,
      transform: `translateY(${(1 - eased) * 24}px)`,
    }}>
      <div style={{
        fontFamily: FONT_DISPLAY, fontSize: 128, fontWeight: 700,
        color: accent ? C.accent : C.strong,
        letterSpacing: '-0.03em', lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
      }}>{value}</div>
      <div style={{
        marginTop: 20,
        fontFamily: FONT_MONO, fontSize: 16, color: C.muted,
        letterSpacing: '0.22em', textTransform: 'uppercase',
      }}>{label}</div>
    </div>
  );
}

function SceneReceipts() {
  const { localTime, duration } = useSprite();
  const fadeOut = localTime > duration - 0.6 ? (duration - localTime) / 0.6 : 1;
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: clamp(fadeOut, 0, 1) }}>
      <Eyebrow x={160} y={140}>Production · Verifiable</Eyebrow>
      <div style={{
        position: 'absolute', left: 160, top: 180,
        fontFamily: FONT_DISPLAY, fontSize: 64, fontWeight: 600,
        color: C.strong, letterSpacing: '-0.02em',
      }}>Not slide-deck claims.</div>

      <div style={{
        position: 'absolute', left: 100, right: 100, top: 420,
        display: 'flex', alignItems: 'stretch',
        background: C.panel,
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        overflow: 'hidden',
      }}>
        <ReceiptCell value="1,603" label="Events / 24h" delay={0.2} accent />
        <ReceiptCell value="9"     label="Agents"        delay={0.5} />
        <ReceiptCell value="30+"   label="Days live"     delay={0.8} />
        <ReceiptCell value="43+"   label="NPM downloads" delay={1.1} />
      </div>

      <div style={{
        position: 'absolute', left: 160, right: 160, bottom: 120,
        textAlign: 'center',
        fontFamily: FONT_BODY, fontSize: 26, color: C.muted,
        opacity: clamp((localTime - 1.6) / 0.5, 0, 1),
      }}>
        Verifiable in a browser tab.
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SCENE 9 — 1:06–1:15  Closing lockup (B5)
// ═══════════════════════════════════════════════════════════════════════════
function SceneClosing() {
  const { localTime, duration } = useSprite();
  const fadeIn = clamp(localTime / 0.6, 0, 1);
  const fadeOut = localTime > duration - 0.6 ? (duration - localTime) / 0.6 : 1;
  const barW = clamp((localTime - 0.6) / 0.8, 0, 1);
  const lockup = clamp((localTime - 1.4) / 0.5, 0, 1);
  const tagline = clamp((localTime - 2.4) / 0.6, 0, 1);
  const url = clamp((localTime - 4.0) / 0.5, 0, 1);

  return (
    <div style={{ position: 'absolute', inset: 0, opacity: clamp(fadeIn * fadeOut, 0, 1) }}>
      <div style={{
        position: 'absolute', left: '50%', top: '50%',
        transform: 'translate(-50%, -50%)', textAlign: 'center', width: 1500,
      }}>
        <div style={{
          fontFamily: FONT_DISPLAY, fontSize: 200, fontWeight: 700,
          color: C.strong, letterSpacing: '-0.04em', lineHeight: 1,
        }}>ACMI</div>
        <div style={{
          margin: '32px auto 32px',
          width: 400 * barW, height: 4,
          background: C.accent,
          boxShadow: `0 0 20px ${C.accent}`,
        }} />
        <div style={{
          fontFamily: FONT_MONO, fontSize: 22, color: C.text,
          letterSpacing: '0.22em', textTransform: 'uppercase',
          opacity: lockup, marginBottom: 80,
        }}>
          with Veea Lobster Trap · Gemini · lablab.ai
        </div>
        <div style={{
          fontFamily: FONT_DISPLAY, fontSize: 48, fontWeight: 500,
          color: C.text, letterSpacing: '-0.02em',
          opacity: tagline, lineHeight: 1.3,
        }}>
          Prompt safety.
          <span style={{ color: C.muted, margin: '0 16px' }}>·</span>
          Execution audit.
          <span style={{ color: C.muted, margin: '0 16px' }}>·</span>
          Cross-framework coordination.
        </div>
        <div style={{
          marginTop: 56,
          fontFamily: FONT_MONO, fontSize: 22, color: C.accent,
          letterSpacing: '0.08em',
          opacity: url,
        }}>github.com/madezmedia/acmi</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Timestamp label updater (for comment context)
// ═══════════════════════════════════════════════════════════════════════════
function TimestampLabel() {
  const t = useTime();
  const rootRef = React.useRef(null);
  React.useEffect(() => {
    const root = document.querySelector('[data-video-root]') || document.getElementById('root');
    if (root) {
      const secs = Math.floor(t);
      const mm = String(Math.floor(secs / 60)).padStart(2, '0');
      const ss = String(secs % 60).padStart(2, '0');
      root.setAttribute('data-screen-label', `${mm}:${ss}`);
    }
  }, [Math.floor(t)]);
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// MASTER COMPOSITION
// ═══════════════════════════════════════════════════════════════════════════
function SizzleReel() {
  return (
    <div data-video-root style={{ position: 'absolute', inset: 0 }}>
      <CanvasBg />
      <DriftField count={20} color={C.data} opacity={0.35} />
      <TimestampLabel />

      <Sprite start={0}    end={4.2}>  <SceneQuestion />    </Sprite>
      <Sprite start={4.2}  end={14.4}> <SceneSilos />        </Sprite>
      <Sprite start={14.4} end={18.4}> <SceneAuditGaps />    </Sprite>
      <Sprite start={18.4} end={30.4}> <ScenePolicyGate />   </Sprite>
      <Sprite start={30.4} end={34.4}> <SceneTitleCard />    </Sprite>
      <Sprite start={34.4} end={46.4}> <SceneThreeKeys />    </Sprite>
      <Sprite start={46.4} end={58.4}> <SceneDashboard />    </Sprite>
      <Sprite start={58.4} end={66.4}> <SceneReceipts />     </Sprite>
      <Sprite start={66.4} end={75.0}> <SceneClosing />      </Sprite>
    </div>
  );
}

Object.assign(window, { SizzleReel, C });
