/* =====================================================================
   Touch controls for phones and tablets
   - Floating joystick: put your thumb down anywhere on the market floor
     and drag. The stick appears where you touched.
   - Big action button (bottom right): HAGGLE near a gold-ringed item,
     then LOCK! to lock the price. A small ✕ walks away from a haggle.
   - Small buttons (top right): pause, sound, full screen.
   Keyboard play is untouched: pressing a movement key hides these again.
   ===================================================================== */

const STICK_RADIUS = 56;   // how far (px) the thumb travels for full speed
const DEAD_ZONE = 0.12;    // ignore tiny wobbles near the centre

function div(cssText, text) {
  const d = document.createElement("div");
  d.style.cssText = cssText;
  if (text != null) d.textContent = text;
  return d;
}

function roundButton(label, size, extra = "") {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.style.cssText =
    `position:fixed;width:${size}px;height:${size}px;border-radius:50%;border:0;` +
    "display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer;" +
    "font:800 15px system-ui;touch-action:none;-webkit-tap-highlight-color:transparent;" +
    "user-select:none;-webkit-user-select:none;z-index:9;" + extra;
  return b;
}

export function createTouchControls({ canAct, onAction, onWalkAway, onPause, onMute, onFullscreen, isMuted }) {
  const vector = { x: 0, y: 0 };
  let enabled = false;
  let stickId = null;
  let origin = null;

  // ---- joystick (only drawn while a thumb is down)
  const base = div(
    `position:fixed;width:${STICK_RADIUS * 2}px;height:${STICK_RADIUS * 2}px;margin:-${STICK_RADIUS}px 0 0 -${STICK_RADIUS}px;` +
    "border-radius:50%;background:rgba(255,255,255,.14);border:2px solid rgba(255,255,255,.45);" +
    "display:none;pointer-events:none;z-index:8"
  );
  const knob = div(
    "position:absolute;left:50%;top:50%;width:52px;height:52px;margin:-26px 0 0 -26px;border-radius:50%;" +
    "background:rgba(255,255,255,.85);box-shadow:0 2px 10px rgba(0,0,0,.35)"
  );
  base.append(knob);

  // ---- action button + walk away
  const action = roundButton("HAGGLE", 96,
    "right:calc(22px + env(safe-area-inset-right));bottom:calc(26px + env(safe-area-inset-bottom));" +
    "background:#ffb703;color:#1d1626;box-shadow:0 4px 16px rgba(0,0,0,.4);font-size:16px;letter-spacing:.5px");
  const walk = roundButton("✕", 52,
    "right:calc(128px + env(safe-area-inset-right));bottom:calc(48px + env(safe-area-inset-bottom));" +
    "background:rgba(0,0,0,.55);color:#fff;font-size:22px;display:none");

  // ---- small buttons along the top right, under the score
  const bar = div(
    "position:fixed;right:calc(12px + env(safe-area-inset-right));display:none;gap:8px;z-index:9"
  );
  // Icons are drawn as SVG: pause/full-screen symbols are missing from many phone fonts.
  const ICON = {
    pause: '<svg width="16" height="16" viewBox="0 0 16 16"><rect x="3" y="2" width="3.5" height="12" rx="1" fill="#fff"/><rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="#fff"/></svg>',
    play: '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M4 2.5v11a1 1 0 0 0 1.5.9l8.5-5.5a1 1 0 0 0 0-1.8L5.5 1.6A1 1 0 0 0 4 2.5z" fill="#fff"/></svg>',
    full: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/></svg>',
  };
  const small = (html) => {
    const b = roundButton("", 40, "position:static;background:rgba(0,0,0,.45);color:#fff;font-size:18px");
    b.innerHTML = html;
    bar.append(b);
    return b;
  };
  const pauseBtn = small(ICON.pause);
  const muteBtn = small(isMuted() ? "🔇" : "🔊");
  const canFullscreen = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
  const fullBtn = canFullscreen ? small(ICON.full) : null;
  let shownPaused = false;

  document.body.append(base, action, walk, bar);

  const press = (b, fn) => b.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  });
  press(action, () => onAction());
  press(walk, () => onWalkAway());
  press(pauseBtn, () => onPause());
  press(muteBtn, () => { onMute(); muteBtn.textContent = isMuted() ? "🔇" : "🔊"; });
  if (fullBtn) press(fullBtn, () => onFullscreen());

  // ---- joystick handling on the market floor
  function setVector(dx, dy) {
    const d = Math.hypot(dx, dy);
    const clamped = Math.min(d, STICK_RADIUS);
    const nx = d ? dx / d : 0, ny = d ? dy / d : 0;
    knob.style.transform = `translate(${nx * clamped}px, ${ny * clamped}px)`;
    let m = clamped / STICK_RADIUS;
    m = m < DEAD_ZONE ? 0 : (m - DEAD_ZONE) / (1 - DEAD_ZONE);
    vector.x = nx * m;
    vector.y = -ny * m; // screen y goes down, game y goes up
  }
  function release() {
    stickId = null;
    origin = null;
    vector.x = 0; vector.y = 0;
    base.style.display = "none";
  }

  window.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return;
    enable(true);
    if (stickId !== null || !canAct()) return;
    if (e.target.closest && e.target.closest("button")) return;
    stickId = e.pointerId;
    origin = { x: e.clientX, y: e.clientY };
    base.style.left = `${origin.x}px`;
    base.style.top = `${origin.y}px`;
    base.style.display = "block";
    setVector(0, 0);
  }, { passive: true });
  window.addEventListener("pointermove", (e) => {
    if (e.pointerId !== stickId) return;
    setVector(e.clientX - origin.x, e.clientY - origin.y);
  }, { passive: true });
  window.addEventListener("pointerup", (e) => { if (e.pointerId === stickId) release(); });
  window.addEventListener("pointercancel", (e) => { if (e.pointerId === stickId) release(); });
  window.addEventListener("blur", release);

  function enable(on) {
    if (enabled === on) return;
    enabled = on;
    if (!on) release();
  }

  // Called by the game every frame.
  //   mode: "idle" (nothing near), "haggle" (item in reach), "lock" (haggle running)
  //   playing: true while a round is running or paused
  //   paused: true while paused
  //   topOffset: px from the top where the small buttons may sit
  function update({ mode, playing, paused, topOffset }) {
    const show = enabled && playing;
    action.style.display = show ? "flex" : "none";
    walk.style.display = show && mode === "lock" ? "flex" : "none";
    bar.style.display = show ? "flex" : "none";
    bar.style.top = `${topOffset}px`;
    if (paused !== shownPaused) { shownPaused = paused; pauseBtn.innerHTML = paused ? ICON.play : ICON.pause; }
    if (!show) { release(); return; }
    if (mode === "lock") {
      action.textContent = "LOCK!";
      action.style.background = "#7dff9a";
      action.style.opacity = "1";
      action.style.transform = "scale(1.06)";
    } else if (mode === "haggle") {
      action.textContent = "HAGGLE";
      action.style.background = "#ffb703";
      action.style.opacity = "1";
      action.style.transform = `scale(${1 + Math.sin(performance.now() / 160) * 0.05})`;
    } else {
      action.textContent = "HAGGLE";
      action.style.background = "#ffb703";
      action.style.opacity = "0.45";
      action.style.transform = "scale(1)";
    }
  }

  return {
    vector,
    update,
    enable,
    get enabled() { return enabled; },
    // Height (px) the controls take at the bottom of the screen, so the
    // game can keep items out from under the action button.
    bottomSpace: 150,
  };
}

// Phones and tablets start with touch controls on.
export const prefersTouch = () =>
  (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) || "ontouchstart" in window;
