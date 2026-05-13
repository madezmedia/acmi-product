// ACMI deck — Tweaks panel
// Exposes: type scale, accent hue, layout variants for title/three-keys/closing.

const ACMI_TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "typeScale": 1.0,
  "accentHue": 48,
  "titleVariant": "A",
  "keysVariant": "A",
  "closingVariant": "A"
}/*EDITMODE-END*/;

function ACMITweaks() {
  const [t, setTweak] = useTweaks(ACMI_TWEAK_DEFAULTS);

  // Apply tweaks to the document root as CSS custom properties.
  React.useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--type-scale", String(t.typeScale));
    // Build accent color from hue, locked C/L roughly matching #ffd166
    root.style.setProperty("--accent-hue", String(t.accentHue));
    root.setAttribute("data-title-variant", t.titleVariant);
    root.setAttribute("data-keys-variant", t.keysVariant);
    root.setAttribute("data-closing-variant", t.closingVariant);
  }, [t.typeScale, t.accentHue, t.titleVariant, t.keysVariant, t.closingVariant]);

  return (
    <TweaksPanel title="Tweaks">
      <TweakSection title="Type">
        <TweakSlider label="Type scale" value={t.typeScale} min={0.8} max={1.25} step={0.01}
          onChange={(v) => setTweak("typeScale", v)} format={(v) => `${Math.round(v * 100)}%`} />
      </TweakSection>
      <TweakSection title="Accent">
        <TweakSlider label="Accent hue" value={t.accentHue} min={0} max={360} step={1}
          onChange={(v) => setTweak("accentHue", v)} format={(v) => `${v}°`} />
        <div style={{display:"flex", gap:8, marginTop:8}}>
          {[{h:48,n:"Amber"},{h:200,n:"Cyan"},{h:140,n:"Mint"},{h:20,n:"Rust"}].map(p => (
            <button key={p.h} onClick={() => setTweak("accentHue", p.h)}
              style={{flex:1, background:`oklch(0.80 0.16 ${p.h})`, color:"#0a0e27",
                border:"none", borderRadius:6, padding:"6px 8px", fontSize:11,
                fontWeight:600, cursor:"pointer"}}>{p.n}</button>
          ))}
        </div>
      </TweakSection>
      <TweakSection title="Variations">
        <TweakRadio label="Title slide" value={t.titleVariant} options={["A","B","C"]}
          onChange={(v) => setTweak("titleVariant", v)} />
        <TweakRadio label="Three keys" value={t.keysVariant} options={["A","B","C"]}
          onChange={(v) => setTweak("keysVariant", v)} />
        <TweakRadio label="Closing" value={t.closingVariant} options={["A","B","C"]}
          onChange={(v) => setTweak("closingVariant", v)} />
      </TweakSection>
    </TweaksPanel>
  );
}

const __acmi_tweaks_root = document.createElement("div");
document.body.appendChild(__acmi_tweaks_root);
ReactDOM.createRoot(__acmi_tweaks_root).render(<ACMITweaks />);
