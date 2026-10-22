import * as THREE from "three";
import { START_NG, getCurrentUser, onUserChange, signIn } from "./platform.js";
import { buildCharacter } from "./character.js";
import { createTouchControls, prefersTouch } from "./touch.js";

/* =====================================================================
   BUDGET PANIC
   Phase 1: realistic Naira prices, 18 items, recipe missions
   Phase 2: moving prices (▲▼) and Mama calling with extra items
   ===================================================================== */

const scene = new THREE.Scene();
const VIEW = 10;
const camera = new THREE.OrthographicCamera(-VIEW, VIEW, VIEW, -VIEW, 0.1, 100);
camera.position.z = 10;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
document.body.appendChild(renderer.domElement);

// Phones get a closer camera so things aren't tiny, and the camera always
// fits the SHORT side of the screen. On a tall phone the market becomes tall
// instead of squeezed thin; on a wide screen it stays as it always was.
const PHONE_VIEW = 7.5;
const labelMeshes = [];
let ppu = 1;            // screen pixels per world unit
let labelScale = 1;
let afterResize = () => {};

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const aspect = w / h;
  const half = Math.min(w, h) < 600 ? PHONE_VIEW : VIEW;
  if (aspect >= 1) {
    camera.top = half; camera.bottom = -half;
    camera.left = -half * aspect; camera.right = half * aspect;
  } else {
    camera.left = -half; camera.right = half;
    camera.top = half / aspect; camera.bottom = -half / aspect;
  }
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);

  // Keep item names readable: about 10px tall or more on any screen.
  ppu = h / (camera.top - camera.bottom);
  labelScale = Math.min(1.7, Math.max(1, 10 / (0.24 * ppu)));
  labelMeshes.forEach((m) => {
    m.scale.set(labelScale, labelScale, 1);
    m.position.y = -0.98 - (labelScale - 1) * 0.25;
  });
  afterResize();
}
window.addEventListener("resize", resize);
window.addEventListener("orientationchange", () => setTimeout(resize, 150));
resize();

// ---------- Small helpers
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
const dist2 = (a, b) => Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
const fmt = (n) => "₦" + Math.round(n).toLocaleString("en-US");
function shuffle(a) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

const css = document.createElement("style");
css.textContent = `
@keyframes floatup{from{opacity:1;transform:translate(-50%,0)}to{opacity:0;transform:translate(-50%,-56px)}}
@keyframes rain{to{background-position:-60px 160px}}
`;
document.head.appendChild(css);

// ---------- Sound (tiny beeps, no files needed)
let audio = null;
let muted = store.get("budgetpanic:muted") === "1";
function ensureAudio() {
  if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch {} }
  if (audio && audio.state === "suspended") audio.resume();
}
function tone(freq, dur = 0.12, type = "sine", vol = 0.07, slideTo = null, delay = 0) {
  if (!audio || muted) return;
  try {
    const t0 = audio.currentTime + delay;
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(audio.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  } catch {}
}
const sfx = {
  buy() { tone(520, 0.08, "square", 0.05); tone(780, 0.1, "square", 0.05, null, 0.08); },
  great() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.12, "triangle", 0.07, null, i * 0.07)); },
  bad() { tone(220, 0.25, "sawtooth", 0.06, 110); },
  hit() { tone(160, 0.25, "sawtooth", 0.09, 60); },
  block() { tone(900, 0.1, "triangle", 0.07); tone(1200, 0.1, "triangle", 0.07, null, 0.06); },
  power() { tone(400, 0.2, "sine", 0.07, 1200); },
  win() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.14, "triangle", 0.07, null, i * 0.08)); },
  lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.25, "sawtooth", 0.06, null, i * 0.16)); },
  impulse() { tone(300, 0.15, "square", 0.05, 200); },
  phone() { tone(880, 0.08, "square", 0.05); tone(880, 0.08, "square", 0.05, null, 0.14); },
};
window.addEventListener("pointerdown", ensureAudio);

// ---------- HUD, banners, haggle bar, overlays, menu
function el(cssText, text) {
  const d = document.createElement("div");
  d.style.cssText = cssText;
  if (text != null) d.textContent = text;
  return d;
}
const hud = el("position:fixed;top:calc(12px + env(safe-area-inset-top));left:calc(12px + env(safe-area-inset-left));right:calc(12px + env(safe-area-inset-right));color:#fff;font:600 16px system-ui;pointer-events:none;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;text-shadow:0 1px 4px #000;z-index:6");
const banner = el("position:fixed;top:78px;left:50%;transform:translateX(-50%);display:none;color:#fff;font:700 15px system-ui;padding:6px 14px;border-radius:999px;background:rgba(0,0,0,.55);pointer-events:none;z-index:6;white-space:nowrap");
const msg = el("position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font:700 24px system-ui;text-align:center;pointer-events:none;text-shadow:0 2px 8px #000;z-index:6");
const hint = el("position:fixed;left:50%;bottom:34px;transform:translateX(-50%);display:none;color:#fff;font:700 16px system-ui;padding:8px 16px;border-radius:12px;background:rgba(0,0,0,.6);pointer-events:none;z-index:6;white-space:nowrap");
const rainLayer = el("position:fixed;inset:0;display:none;pointer-events:none;z-index:5;background:repeating-linear-gradient(105deg,transparent 0 10px,rgba(180,210,255,.28) 10px 11px);background-size:60px 160px;animation:rain .5s linear infinite");
const darkLayer = el("position:fixed;inset:0;display:none;pointer-events:none;z-index:5");
const ui = el("position:fixed;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;gap:12px;color:#fff;font:600 18px system-ui;text-align:center;background:rgba(10,8,20,.8);padding:16px;z-index:10;overflow:auto");

const hag = el("position:fixed;left:50%;bottom:90px;transform:translateX(-50%);width:min(340px,86vw);display:none;color:#fff;font:700 15px system-ui;text-align:center;text-shadow:0 1px 4px #000;z-index:7");
const hagTitle = el("margin-bottom:8px");
const hagBar = el("position:relative;height:24px;border-radius:12px;background:#ffffff26;overflow:hidden;border:2px solid #fff6");
const hagYellow = el("position:absolute;top:0;bottom:0;background:#ffd166aa");
const hagGreen = el("position:absolute;top:0;bottom:0;background:#7dff9a");
const hagMarker = el("position:absolute;top:-2px;bottom:-2px;width:6px;border-radius:3px;background:#fff;transform:translateX(-50%)");
hagBar.append(hagYellow, hagGreen, hagMarker);
const hagHelp = el("margin-top:6px;font-size:12px;opacity:.8", "Press SPACE to lock the price · ESC to walk away");
hag.append(hagTitle, hagBar, hagHelp);

document.body.append(rainLayer, darkLayer, hud, banner, msg, hint, hag, ui);

function btn(label, onClick, primary) {
  const b = document.createElement("button");
  b.textContent = label;
  b.onclick = () => { ensureAudio(); onClick(); };
  b.style.cssText = `font:700 18px system-ui;padding:12px 22px;border-radius:12px;border:0;cursor:pointer;min-width:240px;background:${primary ? "#ffb703" : "#ffffff22"};color:${primary ? "#1d1626" : "#fff"}`;
  return b;
}

// ---------- Emoji textures + effects (popups, particles, shake)
const texCache = new Map();
function emojiTex(emoji) {
  if (texCache.has(emoji)) return texCache.get(emoji);
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.font = "190px serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(emoji, 128, 140);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texCache.set(emoji, tex);
  return tex;
}
function emojiMesh(emoji, size) {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: emojiTex(emoji), transparent: true })
  );
}
function labelMesh(text) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 64;
  const g = c.getContext("2d");
  g.font = "700 34px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.lineWidth = 7; g.strokeStyle = "rgba(10,8,20,.9)";
  g.strokeText(text, 128, 34);
  g.fillStyle = "#fff";
  g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 0.45),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true })
  );
  labelMeshes.push(mesh);
  return mesh;
}

function toScreen(x, y) {
  return {
    x: ((x - camera.left) / (camera.right - camera.left)) * window.innerWidth,
    y: ((camera.top - y) / (camera.top - camera.bottom)) * window.innerHeight,
  };
}
function popup(text, x, y, color = "#fff", size = 20) {
  const p = toScreen(x, y);
  const d = el(`position:fixed;left:${p.x}px;top:${p.y}px;color:${color};font:800 ${size}px system-ui;pointer-events:none;z-index:8;text-shadow:0 2px 6px #000;animation:floatup .9s ease-out forwards;white-space:nowrap`, text);
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 950);
}

const particles = [];
const pGeo = new THREE.CircleGeometry(0.12, 10);
function burst(x, y, color, n = 10, speed = 5) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({ color, transparent: true }));
    const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.8);
    m.position.set(x, y, 0.8);
    scene.add(m);
    const life = 0.5 + Math.random() * 0.3;
    particles.push({ m, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life });
  }
}
let shake = 0;

// ---------- Player + start.ng character
const PLAYER_RADIUS = 0.8;
const player = new THREE.Group();
player.position.z = 0.5;
scene.add(player);
let character = null;
function setCharacter(style) {
  if (character) player.remove(character);
  character = buildCharacter(style);
  player.add(character);
}
setCharacter(null);
const shieldRing = new THREE.Mesh(
  new THREE.RingGeometry(1.2, 1.38, 48),
  new THREE.MeshBasicMaterial({ color: 0x5ee7ff, transparent: true, opacity: 0.9 })
);
shieldRing.position.z = 0.2;
shieldRing.visible = false;
player.add(shieldRing);
const policeRing = new THREE.Mesh(
  new THREE.RingGeometry(1.45, 1.62, 48),
  new THREE.MeshBasicMaterial({ color: 0x3b82ff, transparent: true, opacity: 0.95 })
);
policeRing.position.z = 0.2;
policeRing.visible = false;
player.add(policeRing);

// ---------- Who is playing + scores
const GUEST = { id: "guest", name: "Guest", style: null };
let me = GUEST;
let best = 0;
let pendingUser = null;
let lastOver = null;

const bestKey = () => `budgetpanic:best3:${me.id}`;
const loadBest = () => Number(store.get(bestKey()) || 0);
function loadBoard() {
  try { return JSON.parse(store.get("budgetpanic:board3") || "[]"); } catch { return []; }
}
function saveScore(sc, rounds) {
  const newBest = sc > best;
  if (newBest) { best = sc; store.set(bestKey(), best); }
  const board = loadBoard();
  const row = board.find((r) => r.id === me.id);
  if (row) {
    row.name = me.name;
    if (sc > row.score) { row.score = sc; row.rounds = rounds; }
  } else board.push({ id: me.id, name: me.name, score: sc, rounds });
  board.sort((a, b) => b.score - a.score);
  store.set("budgetpanic:board3", JSON.stringify(board.slice(0, 10)));
  return newBest;
}

function applyUser(u) {
  const next = u && u.id
    ? { id: String(u.id), name: String(u.name || "Player"), style: u.style || null }
    : GUEST;
  if (JSON.stringify(next) === JSON.stringify(me)) return;
  me = next;
  setCharacter(me.style);
  best = loadBest();
  if (state === "menu") showScreen();
  else if (state === "over") showScreen(lastOver);
}

// ---------- Menu / game over / leaderboard screens
function showChecking() {
  ui.replaceChildren(el("font-size:34px;font-weight:800", "Budget Panic 🛒"), el("opacity:.8", "Checking start.ng…"));
  ui.style.display = "flex";
}

function showScreen(info) {
  ui.replaceChildren();
  ui.style.display = "flex";
  const over = !!info;

  if (over) {
    ui.append(el("font-size:34px;font-weight:800", "Broke! 😭"));
    ui.append(el("font-size:22px", `Score: ${info.score}  ·  Rounds: ${info.rounds}`));
    if (info.newBest) ui.append(el("color:#ffd166;font-weight:800", "🎉 New personal best!"));
  } else {
    ui.append(el("font-size:34px;font-weight:800", "Budget Panic 🛒"));
    ui.append(el("opacity:.85;max-width:320px", "Cook a real meal. Buy the whole recipe before you go broke."));
  }
  ui.append(el("font-size:20px", me === GUEST ? "Playing as Guest" : `Welcome, ${me.name}!`));
  if (!START_NG) ui.append(el("font-size:14px;opacity:.75;max-width:320px", "Sign-in isn't available here, so you're playing as a guest."));

  if (over) ui.append(btn("Share on X", () => shareResult(info), false));
  if (me === GUEST && START_NG) ui.append(btn("Sign in with start.ng", signIn, true));
  ui.append(btn(over ? "Play again" : me === GUEST ? "Play as guest" : "Play", start, me !== GUEST || !START_NG));
  ui.append(btn("🏆 Leaderboard", showBoard, false));
  ui.append(el("font-size:15px;opacity:.85", `Your best: ${best} pts`));

  const back = document.createElement("a");
  back.href = "https://start.ng";
  back.textContent = "Play more games on start.ng";
  back.style.cssText = "color:#ffd166;font-size:15px;font-weight:700;text-decoration:underline;margin-top:4px";
  ui.append(back);

  if (!over) {
    ui.append(el("font-size:13px;opacity:.65;max-width:360px;line-height:1.5", touch.enabled
      ? "Put your thumb down anywhere and drag to move · tap HAGGLE near a gold-ringed item, then LOCK! to lock the price"
      : "WASD / arrows to move · stand near a gold-ringed item and press SPACE to haggle · P pause · M sound"));
  } else if (!touch.enabled) {
    ui.append(el("font-size:13px;opacity:.6", "Space = play again"));
  }
}

// Share the result on X (a start.ng game standard)
function shareResult(info) {
  const meals = info.rounds === 1 ? "1 meal" : `${info.rounds} meals`;
  const text = info.rounds > 0
    ? `I cooked ${meals} and scored ${info.score} on Budget Panic before the market finished my money 😭 Can you beat me? @playonstartng`
    : `The market finished my ₦25,000 before I could cook anything on Budget Panic 😭 Can you do better? @playonstartng`;
  const url = "https://start.ng/games/budget-panic";
  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, "_blank", "noopener");
}

function showBoard() {
  ui.replaceChildren();
  ui.style.display = "flex";
  ui.append(el("font-size:30px;font-weight:800", "🏆 Leaderboard"));
  const board = loadBoard();
  const box = el("font-size:17px;line-height:1.9;min-width:260px");
  if (!board.length) box.textContent = "No scores yet. Be the first!";
  board.forEach((r, i) => {
    const medal = ["🥇", "🥈", "🥉"][i] || `${i + 1}.`;
    const row = el(`display:flex;justify-content:space-between;gap:24px;${r.id === me.id ? "color:#ffd166;font-weight:800" : ""}`);
    row.append(el("", `${medal} ${r.name}`), el("", `${r.score} pts · R${r.rounds}`));
    box.append(row);
  });
  ui.append(box);
  ui.append(el("font-size:12px;opacity:.6", "Scores are saved on this device."));
  ui.append(btn("Back", () => showScreen(state === "over" ? lastOver : undefined), true));
}

function start() {
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  ui.style.display = "none";
  lastOver = null;
  reset();
}

// ---------- Market data: 18 items with rough Naira prices (edit freely!)
const CATALOG = [
  { name: "Tomatoes",  emoji: "🍅", price: 1500 },
  { name: "Pepper",    emoji: "🌶️", price: 1200 },
  { name: "Onions",    emoji: "🧅", price: 800 },
  { name: "Rice",      emoji: "🍚", price: 2500 },
  { name: "Eggs",      emoji: "🥚", price: 1800 },
  { name: "Fish",      emoji: "🐟", price: 3000 },
  { name: "Yam",       emoji: "🍠", price: 3500 },
  { name: "Bread",     emoji: "🍞", price: 1800 },
  { name: "Plantain",  emoji: "🍌", price: 1500 },
  { name: "Chicken",   emoji: "🍗", price: 6000 },
  { name: "Beef",      emoji: "🥩", price: 5000 },
  { name: "Veg oil",   emoji: "🛢️", price: 3500 },
  { name: "Ugu",       emoji: "🥬", price: 500 },
  { name: "Seasoning", emoji: "🧂", price: 400 },
  { name: "Garri",     emoji: "🥣", price: 1500 },
  { name: "Crayfish",  emoji: "🦐", price: 1500 },
  { name: "Groundnut", emoji: "🥜", price: 1000 },
  { name: "Milk",      emoji: "🥛", price: 2000 },
];
const N = Object.fromEntries(CATALOG.map((c, i) => [c.name, i]));

// Recipe missions. tier 0 = easy (3 items), tier 1 = 5 items, tier 2 = 5 to 6 items
const RECIPES = [
  { name: "Garri & Groundnut",    emoji: "🥣", tier: 0, items: ["Garri", "Groundnut", "Milk"] },
  { name: "Plantain & Eggs",      emoji: "🍳", tier: 0, items: ["Plantain", "Eggs", "Veg oil"] },
  { name: "Bread & Egg",          emoji: "🥪", tier: 0, items: ["Bread", "Eggs", "Onions"] },
  { name: "Egg Sauce & Yam",      emoji: "🍠", tier: 1, items: ["Yam", "Eggs", "Tomatoes", "Onions", "Veg oil"] },
  { name: "Stew & Rice",          emoji: "🍲", tier: 1, items: ["Rice", "Tomatoes", "Pepper", "Onions", "Veg oil"] },
  { name: "Fried Rice & Chicken", emoji: "🍗", tier: 1, items: ["Rice", "Chicken", "Ugu", "Veg oil", "Seasoning"] },
  { name: "Jollof Rice",          emoji: "🍛", tier: 2, items: ["Rice", "Tomatoes", "Pepper", "Onions", "Veg oil", "Seasoning"] },
  { name: "Vegetable Soup",       emoji: "🥘", tier: 2, items: ["Ugu", "Beef", "Fish", "Crayfish", "Pepper", "Veg oil"] },
  { name: "Pepper Soup",          emoji: "🍜", tier: 2, items: ["Fish", "Pepper", "Onions", "Crayfish", "Seasoning"] },
];

const START_BUDGET = 25000;
const ROUND_BONUS = 7500;

const EVENTS = [
  { id: "fuel", label: "⛽ Fuel price hike! Prices +25%", color: "#ffd166" },
  { id: "blackout", label: "💡 NEPA took light! Stay in your glow", color: "#9aa5ff" },
  { id: "rain", label: "🌧️ Rain! The floor is slippery", color: "#8ecae6" },
  { id: "sale", label: "🏷️ SALE! Half price for 12 seconds", color: "#7dff9a" },
];

const TRADERS = {
  grunt:      { emoji: "😠", color: 0xff4d4d, r: 0.7,  speed: 2.0, grow: 0.25, dmg: 1500, push: true },
  sprinter:   { emoji: "😤", color: 0xff9f1c, r: 0.55, speed: 3.3, grow: 0.2,  dmg: 1000, push: true },
  tank:       { emoji: "😡", color: 0x9b5de5, r: 1.0,  speed: 1.2, grow: 0.15, dmg: 2500, push: true },
  pickpocket: { emoji: "🥷", color: 0x2dc653, r: 0.6,  speed: 2.4, grow: 0.2,  dmg: 1250, push: false },
};
function composition(r) {
  const t = ["grunt", "grunt"];
  if (r >= 1) t.push("sprinter");
  // One new kind of trader at a time, so the market never gets crowded all at once.
  if (r >= 3) t.push("pickpocket");
  if (r >= 4) t.push("tank");
  if (r >= 5) t.push("grunt");
  if (r >= 6) t.push("sprinter");
  if (r >= 7) t.push("tank");
  return t;
}

const POWERS = [
  { id: "speed", emoji: "⚡", color: "#ffe66d", name: "Sharp sharp! Speed up" },
  { id: "shield", emoji: "🛡️", color: "#5ee7ff", name: "Shield ready" },
  { id: "cash", emoji: "💰", color: "#7dff9a", name: "+₦4,000" },
  // Only appears while a pickpocket is in the market.
  { id: "taskforce", emoji: "👮", color: "#4d9dff", name: "Task force! Catch the pickpockets" },
];
const TASKFORCE_TIME = 8;

// Features arrive one round at a time (round numbers here start at 0).
const FEATURES = {
  movingPrices: 1, // round 2
  mamaCalls: 2,    // round 3
  events: 2,       // round 3
  pickpockets: 3,  // round 4
};
const FEATURE_NOTES = {
  1: "New: prices now move. ▲ is going up, ▼ is coming down. Buy on the ▼.",
  2: "New: Mama may call with one more thing to buy, and market events like NEPA and fuel hikes start.",
  3: "New: pickpockets 🥷 They steal and run. Grab the 👮 task force to catch them and get your money back.",
};

// The part of the screen you can actually play in: below the score bar and
// clear of the phone buttons. Updated every frame in drawHud().
let topReserve = 2, bottomReserve = 1.8;
let noGo = []; // world-space boxes over the phone buttons, where nothing spawns

const inNoGo = (x, y) => noGo.some((z) => x > z.x0 - 1 && x < z.x1 + 1 && y > z.y0 - 1 && y < z.y1 + 1);

function randomPos(g, minD = 3) {
  const mx = camera.right - 1.2;
  let yLo = camera.bottom + bottomReserve + 1.6;
  let yHi = camera.top - topReserve - 0.9;
  if (yHi - yLo < 4) { yLo = camera.bottom + 2.2; yHi = camera.top - 2.2; }
  // Keep a bit of space between stalls so the market never looks piled up.
  const others = items.filter((o) => o !== g && o.visible);
  let spacing = 3;
  for (let n = 0; n < 100; n++) {
    if (n === 40) spacing = 2.3; // crowded screen: accept a tighter fit
    if (n === 70) spacing = 1.7;
    g.position.set((Math.random() * 2 - 1) * mx, yLo + Math.random() * (yHi - yLo), g.position.z);
    if (inNoGo(g.position.x, g.position.y)) continue;
    if (dist2(g, player) >= minD && others.every((o) => dist2(g, o) >= spacing)) break;
  }
}
const playerMaxY = () => camera.top - topReserve - PLAYER_RADIUS * 0.6;

const items = CATALOG.map((c, i) => {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CircleGeometry(0.6, 64), new THREE.MeshBasicMaterial({ color: 0x23284a })));
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.66, 0.78, 48), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
  ring.visible = false;
  g.add(ring);
  const e = emojiMesh(c.emoji, 0.9); e.position.z = 0.01; g.add(e);
  const lab = labelMesh(c.name); lab.position.set(0, -0.98 - (labelScale - 1) * 0.25, 0.02); lab.scale.set(labelScale, labelScale, 1); g.add(lab);
  g.position.z = 0.1;
  g.visible = false;
  g.userData = { i, ring, active: false };
  scene.add(g);
  return g;
});

const traders = [];
function makeTrader(type) {
  const T = TRADERS[type];
  const m = new THREE.Mesh(new THREE.CircleGeometry(T.r, 64), new THREE.MeshBasicMaterial({ color: T.color }));
  const e = emojiMesh(T.emoji, T.r * 1.4); e.position.z = 0.01; m.add(e);
  m.position.z = 0.4;
  m.userData = { type, flee: 0 };
  scene.add(m);
  traders.push(m);
  randomPos(m, 5); // start traders well away from the shopper
}
function spawnTraders() {
  traders.forEach((t) => scene.remove(t));
  traders.length = 0;
  composition(round).forEach(makeTrader);
}

let power = null;
let taskforceGiven = false; // at most one task force per round
function spawnPower() {
  const pickpocketHere = traders.some((t) => t.userData.type === "pickpocket");
  let P;
  if (pickpocketHere && !taskforceGiven && Math.random() < 0.6) {
    P = POWERS.find((x) => x.id === "taskforce");
    taskforceGiven = true;
  } else {
    const pool = POWERS.filter((x) => x.id !== "taskforce");
    P = pool[Math.floor(Math.random() * pool.length)];
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CircleGeometry(0.55, 48), new THREE.MeshBasicMaterial({ color: 0x1d1626 })));
  g.add(new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(P.color) })));
  const e = emojiMesh(P.emoji, 0.85); e.position.z = 0.01; g.add(e);
  g.position.z = 0.2;
  randomPos(g, 3);
  scene.add(g);
  power = { g, P, life: 9 };
}
function clearPower() {
  if (power) { scene.remove(power.g); power = null; }
}

// ---------- Game state
let budget = START_BUDGET, score = 0, round = 0, list = [], recipe = null;
let inflation = 1, inflationBase = 1, saleMult = 1, listTimer = 0;
let mamaQueue = [], mamaTimer = 16;
let hitCooldown = 0, state = "menu", flashTimer;
let event = null, eventT = 0, lastEvent = null;
let speedT = 0, shield = 0, powerTimer = 6;
let taskT = 0;   // seconds of task force left
let stolen = 0;  // what pickpockets took this round (the task force gets it back)
let haggle = null;

// Phase 2: moving prices. Each item drifts up or down while you shop.
const drift = CATALOG.map(() => 1);
const trend = CATALOG.map(() => 1);
let driftT = 0;
const pricesMove = () => round >= FEATURES.movingPrices;
function resetDrift() {
  CATALOG.forEach((_, i) => {
    if (!pricesMove()) { drift[i] = 1; trend[i] = 0; return; } // round 1: fixed prices, no arrows
    drift[i] = 0.9 + Math.random() * 0.25; trend[i] = Math.random() < 0.5 ? -1 : 1;
  });
}
function tickDrift() {
  if (!pricesMove()) return;
  CATALOG.forEach((_, i) => {
    if (Math.random() < 0.35) trend[i] = Math.random() < 0.5 ? -1 : 1;
    drift[i] = Math.max(0.7, Math.min(1.6, drift[i] * (1 + trend[i] * (0.04 + Math.random() * 0.06))));
  });
}

const price = (i) => Math.round((CATALOG[i].price * inflation * saleMult * drift[i]) / 50) * 50;

function flash(text, color) {
  msg.textContent = text; msg.style.color = color;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { if (state === "playing") msg.textContent = ""; }, 900);
}

function pickEvent() {
  event = null; saleMult = 1; inflationBase = 1; eventT = 0;
  if (round < FEATURES.events || Math.random() > 0.75) return;
  const pool = EVENTS.filter((e) => e.id !== lastEvent);
  event = pool[Math.floor(Math.random() * pool.length)];
  lastEvent = event.id;
  if (event.id === "fuel") inflationBase = 1.25;
  if (event.id === "sale") { saleMult = 0.5; eventT = 12; }
  // (the event is announced on the recipe screen and in the banner)
}

// ---------- Choosing what to cook
// Every round the player picks their recipe from the ones for that level,
// with the ingredients and roughly what it will cost.
let choices = [];
let lastCooked = null;
const recipeCost = (r) => Math.round(r.items.reduce((s, n) => s + CATALOG[N[n]].price * inflationBase * saleMult, 0) / 50) * 50;

function newRound(cooked) {
  cancelHaggle(false);
  pickEvent();
  const tier = round < 2 ? 0 : round < 4 ? 1 : 2;
  choices = RECIPES.filter((r) => r.tier === tier && r !== recipe);
  if (choices.length > 3) choices = shuffle(choices).slice(0, 3);
  lastCooked = cooked || null;
  setupRound(choices[0]);   // the market fills in behind the menu
  state = "choosing";
  showChooser();
}

function showChooser() {
  ui.replaceChildren();
  ui.style.display = "flex";
  if (lastCooked) ui.append(el("font-size:22px;font-weight:800;color:#7dff9a", `${lastCooked.emoji} ${lastCooked.name} done! +${fmt(ROUND_BONUS)} 💪`));
  ui.append(el("font-size:28px;font-weight:800", `Round ${round + 1}: what are you cooking?`));
  ui.append(el("font-size:16px;opacity:.8", `You have ${fmt(Math.max(budget, 0))}`));
  const note = FEATURE_NOTES[round];
  if (note) ui.append(el("font-size:15px;max-width:380px;line-height:1.45;padding:10px 14px;border-radius:12px;background:#ffd16622;border:1px solid #ffd16688;color:#ffd166", note));
  if (event) ui.append(el(`font-size:15px;color:${event.color}`, event.label));
  // Phones get compact side-by-side cards so all the choices fit on one screen.
  const narrow = window.innerWidth < 600;
  const row = el(`display:flex;flex-wrap:wrap;gap:${narrow ? 10 : 12}px;justify-content:center;max-width:760px;width:100%`);
  choices.forEach((r, k) => {
    const b = document.createElement("button");
    b.type = "button";
    b.style.cssText = "font:600 15px system-ui;color:#fff;background:#ffffff1a;border:2px solid #ffffff40;border-radius:16px;cursor:pointer;" +
      (narrow
        ? "width:100%;max-width:360px;padding:10px 14px;display:grid;grid-template-columns:44px 1fr;column-gap:12px;row-gap:3px;align-items:center;text-align:left"
        : "padding:14px 16px;width:220px;display:flex;flex-direction:column;gap:8px;align-items:center");
    const meta = `${r.items.length} items · about ${fmt(recipeCost(r))}`;
    if (narrow) {
      b.append(
        el("font-size:34px;grid-row:span 3;text-align:center", r.emoji),
        el("font-size:17px;font-weight:800", r.name),
        el("font-size:19px;letter-spacing:1px", r.items.map((n) => CATALOG[N[n]].emoji).join("")),
        el("font-size:13px;opacity:.85", `${meta} · tap to cook`),
      );
    } else {
      b.append(
        el("font-size:34px", r.emoji),
        el("font-size:17px;font-weight:800", r.name),
        el("font-size:22px;letter-spacing:2px", r.items.map((n) => CATALOG[N[n]].emoji).join("")),
        el("font-size:14px;opacity:.85", meta),
        el("font-size:12px;opacity:.6", touch.enabled ? "Tap to cook" : `Press ${k + 1}`),
      );
    }
    b.onclick = () => chooseRecipe(k);
    row.append(b);
  });
  ui.append(row);
}

function chooseRecipe(k) {
  if (state !== "choosing" || !choices[k]) return;
  ensureAudio();
  if (choices[k] !== recipe) setupRound(choices[k]);
  ui.style.display = "none";
  state = "playing";
  if (round === FEATURES.pickpockets) popup("Watch your pocket 🥷", 0, 3, "#ff9f1c", 22);
}

function setupRound(chosen) {
  recipe = chosen;
  const ids = recipe.items.map((n) => N[n]);
  list = ids.map((i) => ({ i, done: false }));

  // Only the recipe items plus a few decoys appear on the map. Fewer decoys on
  // small screens, so the market never feels packed.
  const rest = shuffle(CATALOG.map((_, i) => i).filter((i) => !ids.includes(i)));
  const area = (camera.right - camera.left) * (camera.top - camera.bottom - topReserve - bottomReserve);
  const room = Math.max(1, Math.floor(area / 22) - ids.length);
  const decoyCount = Math.min(1 + Math.floor(round / 2), 5, room);
  const decoys = rest.slice(0, decoyCount);
  mamaQueue = round >= FEATURES.mamaCalls ? shuffle(rest).slice(0, 2) : [];
  taskT = 0; stolen = 0; taskforceGiven = false;

  items.forEach((g) => { g.userData.active = false; g.visible = false; });
  [...ids, ...decoys].forEach((i) => {
    const g = items[i];
    g.userData.active = true; g.visible = true;
    randomPos(g);
  });

  resetDrift();
  inflation = inflationBase; listTimer = 0; mamaTimer = 16; driftT = 0;
  spawnTraders();
  hitCooldown = 1.5;
}

const velocity = new THREE.Vector2(0, 0);
function reset() {
  budget = START_BUDGET; score = 0; round = 0; hitCooldown = 0; state = "playing";
  speedT = 0; shield = 0; powerTimer = 6; lastEvent = null; recipe = null;
  taskT = 0; stolen = 0;
  clearPower();
  player.position.set(0, 0, 0.5);
  velocity.set(0, 0);
  msg.textContent = "";
  newRound();
}

// ---------- Phase 2: Mama calls with an extra item
function addListItem(i) {
  const g = items[i];
  if (!g.userData.active) {
    g.userData.active = true; g.visible = true;
    randomPos(g, 3);
  }
  list.push({ i, done: false });
  sfx.phone();
  popup(`📞 Mama: also buy ${CATALOG[i].emoji} ${CATALOG[i].name}!`, 0, 3, "#ffd166", 22);
}

// ---------- Haggling
const HAGGLE_RANGE = 1.9;
function nearbyListItem() {
  let bestG = null, bd = 1e9;
  items.forEach((g) => {
    if (!g.visible) return;
    if (!list.some((l) => l.i === g.userData.i && !l.done)) return;
    const d = dist2(g, player);
    if (d < HAGGLE_RANGE && d < bd) { bd = d; bestG = g; }
  });
  return bestG;
}

function openHaggle(g) {
  const gw = Math.max(0.07, 0.2 - round * 0.012);
  haggle = { g, t: Math.random() * 6, speed: 3.2 + round * 0.25, center: 0.2 + Math.random() * 0.6, gw, yw: gw * 2.6 };
  hagYellow.style.left = `${(haggle.center - haggle.yw / 2) * 100}%`;
  hagYellow.style.width = `${haggle.yw * 100}%`;
  hagGreen.style.left = `${(haggle.center - haggle.gw / 2) * 100}%`;
  hagGreen.style.width = `${haggle.gw * 100}%`;
  const i = g.userData.i;
  hagTitle.textContent = `🗣️ Haggle for ${CATALOG[i].emoji} ${CATALOG[i].name}  (asking ${fmt(price(i))})`;
  hag.style.display = "block";
  sfx.buy();
}

function cancelHaggle(announce) {
  if (!haggle) return;
  haggle = null;
  hag.style.display = "none";
  if (announce) flash("Walked away", "#ffd166");
}

function lockHaggle() {
  const hg = haggle;
  const m = 0.5 + 0.5 * Math.sin(hg.t * hg.speed);
  const diff = Math.abs(m - hg.center);
  let mult, label, color, bonus = 10;
  if (diff <= hg.gw / 2) { mult = 0.6; label = "LAST PRICE! -40%"; color = "#7dff9a"; bonus = 35; sfx.great(); burst(hg.g.position.x, hg.g.position.y, 0x7dff9a, 18, 6); }
  else if (diff <= hg.yw / 2) { mult = 0.85; label = "Good deal -15%"; color = "#ffd166"; bonus = 20; sfx.buy(); burst(hg.g.position.x, hg.g.position.y, 0xffd166, 10, 4); }
  else { mult = 1.15; label = "Trader laughs! +15%"; color = "#ff6b6b"; bonus = 10; sfx.bad(); }
  const i = hg.g.userData.i;
  const cost = Math.round((price(i) * mult) / 50) * 50;
  budget -= cost;
  score += bonus;
  const entry = list.find((l) => l.i === i && !l.done);
  if (entry) entry.done = true;
  hg.g.visible = false;
  popup(`${label}  -${fmt(cost)}`, hg.g.position.x, hg.g.position.y + 1, color, 20);
  haggle = null;
  hag.style.display = "none";
}

// ---------- Hits
function hitPlayer(t, nx, ny) {
  const T = TRADERS[t.userData.type];
  hitCooldown = 1;
  cancelHaggle(false);
  if (T.push) { velocity.x += nx * 14; velocity.y += ny * 14; }
  if (shield > 0) {
    shield = 0;
    popup("Blocked! 🛡️", player.position.x, player.position.y + 1, "#5ee7ff", 22);
    burst(player.position.x, player.position.y, 0x5ee7ff, 14, 6);
    sfx.block();
  } else {
    budget -= T.dmg;
    if (!T.push) stolen += T.dmg; // the task force can get this back
    popup(T.push ? `-${fmt(T.dmg)}` : `Pickpocketed! -${fmt(T.dmg)}`, player.position.x, player.position.y + 1, "#ff6b6b", 22);
    burst(player.position.x, player.position.y, 0xff4d4d, 12, 6);
    shake = Math.max(shake, T.push ? 0.5 : 0.25);
    sfx.hit();
  }
  if (!T.push) t.userData.flee = 2.5;
}

// The task force catches a pickpocket: it's gone for the round and the money comes back.
function arrest(t) {
  t.userData.arrested = true;
  scene.remove(t);
  const back = stolen;
  stolen = 0;
  budget += back;
  score += 50;
  popup(back ? `Arrested! 👮 Got back ${fmt(back)}` : "Arrested! 👮 +50", t.position.x, t.position.y + 1, "#ffffff", 24);
  burst(t.position.x, t.position.y, 0x4d9dff, 12, 6);
  burst(t.position.x, t.position.y, 0xff4d4d, 10, 5);
  sfx.great();
}

// ---------- HUD drawing
function drawHud() {
  const listHtml = list.map((l) => {
    const arrow = trend[l.i] > 0 ? ' <span style="color:#ff8a80">▲</span>' : trend[l.i] < 0 ? ' <span style="color:#7dff9a">▼</span>' : "";
    return `<span style="${l.done ? "opacity:.35;text-decoration:line-through" : ""}${saleMult < 1 && !l.done ? ";color:#7dff9a" : ""}">${CATALOG[l.i].emoji} ${fmt(price(l.i))}${l.done ? "" : arrow}</span>`;
  }).join(" &nbsp; ");
  const buffs = `${speedT > 0 ? " ⚡" : ""}${shield > 0 ? " 🛡️" : ""}${taskT > 0 ? ` 👮${Math.ceil(taskT)}s` : ""}`;
  const recipeName = recipe ? `${recipe.emoji} ${recipe.name}` : "";
  hud.innerHTML =
    `<div>👤 ${esc(me.name)}<br>💰 ${fmt(Math.max(budget, 0))}${buffs}</div>` +
    `<div style="text-align:center;flex:1;min-width:220px"><div style="font-size:14px;opacity:.9;margin-bottom:2px">Cooking: ${esc(recipeName)}</div>🛒 ${listHtml}</div>` +
    `<div style="text-align:right">⭐ ${score} · Round ${round + 1}<br>Best ${best} · ${muted ? "🔇" : "🔊"}</div>`;

  if (event) {
    banner.style.display = "block";
    banner.style.color = event.color;
    banner.textContent = event.id === "sale" ? `${event.label} (${Math.ceil(eventT)}s)` : event.label;
  } else banner.style.display = "none";

  rainLayer.style.display = event && event.id === "rain" ? "block" : "none";
  if (event && event.id === "blackout") {
    const p = toScreen(player.position.x, player.position.y);
    darkLayer.style.display = "block";
    darkLayer.style.background = `radial-gradient(circle at ${p.x}px ${p.y}px, transparent 0, transparent 90px, rgba(5,3,12,.94) 230px)`;
  } else darkLayer.style.display = "none";

  const near = state === "playing" && !haggle ? nearbyListItem() : null;
  if (near) {
    const it = CATALOG[near.userData.i];
    hint.textContent = touch.enabled ? `Tap HAGGLE for ${it.emoji} ${it.name}` : `SPACE — haggle for ${it.emoji} ${it.name}`;
    hint.style.display = "block";
  } else hint.style.display = "none";

  // ---- fit everything around the score bar and the touch controls
  const narrow = window.innerWidth < 520;
  hud.style.fontSize = narrow ? "13px" : "16px";
  const hudBottom = hud.getBoundingClientRect().bottom;
  const controlsTop = hudBottom + 8;               // small touch buttons sit here
  // On touch screens keep the strip under the small buttons clear at all times,
  // including while the recipe screen lays out the next market.
  const freeTop = touch.enabled ? controlsTop + 48 : hudBottom;
  banner.style.top = `${freeTop + 6}px`;
  const W = window.innerWidth, H = window.innerHeight;
  const tall = H > W;
  // Tall phones keep full-width strips clear; wide phones are short, so only
  // the two button corners are kept clear and the rest stays playable.
  topReserve = ((tall ? freeTop : hudBottom) + 8) / ppu;
  bottomReserve = (touch.enabled && tall ? touch.bottomSpace : 40) / ppu;
  const box = (px0, py0, px1, py1) => ({
    x0: camera.left + (px0 / W) * (camera.right - camera.left),
    x1: camera.left + (px1 / W) * (camera.right - camera.left),
    y0: camera.top - (py1 / H) * (camera.top - camera.bottom),
    y1: camera.top - (py0 / H) * (camera.top - camera.bottom),
  });
  noGo = touch.enabled ? [box(W - 170, controlsTop - 8, W, controlsTop + 52), box(W - 210, H - 140, W, H)] : [];
  hint.style.bottom = touch.enabled ? "150px" : "34px";
  hag.style.bottom = touch.enabled ? "150px" : "90px";
  hagHelp.textContent = touch.enabled ? "Tap LOCK! to lock the price · ✕ to walk away" : "Press SPACE to lock the price · ESC to walk away";

  touch.update({
    mode: haggle ? "lock" : near ? "haggle" : "idle",
    playing: state === "playing" || state === "paused",
    paused: state === "paused",
    topOffset: controlsTop,
  });
}

// ---------- Input
const keys = {};
function togglePause() {
  if (state === "playing") { state = "paused"; msg.style.color = "#fff"; msg.textContent = touch.enabled ? "Paused — tap ▶" : "Paused — press P"; }
  else if (state === "paused") { state = "playing"; msg.textContent = ""; }
}
function toggleMute() {
  muted = !muted;
  store.set("budgetpanic:muted", muted ? "1" : "0");
}
// Space on a keyboard, the big button on a phone
function action() {
  ensureAudio();
  if (state === "over") start();
  else if (state === "playing") {
    if (haggle) lockHaggle();
    else { const g = nearbyListItem(); if (g) openHaggle(g); }
  }
}
function toggleFullscreen() {
  const d = document, root = d.documentElement;
  if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
  else (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
}

const touch = createTouchControls({
  canAct: () => state === "playing",
  onAction: action,
  onWalkAway: () => cancelHaggle(true),
  onPause: togglePause,
  onMute: toggleMute,
  onFullscreen: toggleFullscreen,
  isMuted: () => muted,
});
touch.enable(prefersTouch());

const MOVE_KEYS = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"];
window.addEventListener("keydown", (e) => {
  ensureAudio();
  const k = e.key.toLowerCase();
  if ((state === "playing" || state === "paused") && ["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
  if (MOVE_KEYS.includes(k)) touch.enable(false); // keyboard player: hide the touch buttons
  keys[k] = true;
  if (e.repeat) return;
  if (state === "choosing" && ["1", "2", "3"].includes(k)) { chooseRecipe(Number(k) - 1); return; }
  if (k === " ") {
    if (state === "over") e.preventDefault();
    action();
  } else if (k === "escape") cancelHaggle(true);
  else if (k === "p") togglePause();
  else if (k === "m") toggleMute();
});
window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

// When the phone rotates, pull anything that is now off screen back in.
afterResize = () => {
  const mx = camera.right - 1.2;
  items.forEach((g) => {
    if (!g.visible) return;
    if (Math.abs(g.position.x) > mx || g.position.y > camera.top - topReserve - 0.9 || g.position.y < camera.bottom + bottomReserve + 1.2) randomPos(g, 2);
  });
  traders.forEach((t) => {
    t.position.x = Math.max(-(camera.right - 0.5), Math.min(camera.right - 0.5, t.position.x));
    t.position.y = Math.max(camera.bottom + 0.5, Math.min(playerMaxY(), t.position.y));
  });
  if (power) randomPos(power.g, 2);
};

// ---------- Main loop
const BASE_SPEED = 9;
let last = 0;

function loop(time) {
  const dt = Math.min((time - last) / 1000, 0.05);
  last = time;

  if (state === "playing") {
    // movement
    let ix = 0, iy = 0;
    if (keys["a"] || keys["arrowleft"]) ix -= 1;
    if (keys["d"] || keys["arrowright"]) ix += 1;
    if (keys["w"] || keys["arrowup"]) iy += 1;
    if (keys["s"] || keys["arrowdown"]) iy -= 1;
    // no keys held: use the touch joystick (analog, so a small push walks slowly)
    if (!ix && !iy && (touch.vector.x || touch.vector.y)) { ix = touch.vector.x; iy = touch.vector.y; }
    const len = Math.max(1, Math.hypot(ix, iy));
    const slippery = event && event.id === "rain";
    const ease = 1 - Math.pow(slippery ? 0.02 : 0.0001, dt);
    const speed = speedT > 0 ? BASE_SPEED * 1.6 : BASE_SPEED;
    velocity.x += ((ix / len) * speed - velocity.x) * ease;
    velocity.y += ((iy / len) * speed - velocity.y) * ease;
    player.position.x += velocity.x * dt;
    player.position.y += velocity.y * dt;
    const maxX = camera.right - PLAYER_RADIUS;
    player.position.x = Math.max(-maxX, Math.min(maxX, player.position.x));
    player.position.y = Math.max(camera.bottom + PLAYER_RADIUS, Math.min(playerMaxY(), player.position.y));

    if (speedT > 0) { speedT -= dt; if (Math.random() < 0.5) burst(player.position.x, player.position.y, 0xffe66d, 1, 1.5); }

    // haggle bar
    if (haggle) {
      haggle.t += dt;
      hagMarker.style.left = `${(0.5 + 0.5 * Math.sin(haggle.t * haggle.speed)) * 100}%`;
      if (dist2(haggle.g, player) > HAGGLE_RANGE + 0.8) cancelHaggle(true);
    }

    // prices climb, and each item drifts up or down
    listTimer += dt;
    if (listTimer > 7) { listTimer = 0; inflation *= 1.06; }
    driftT += dt;
    if (driftT > 3) { driftT = 0; tickDrift(); }

    // Mama calls with an extra item
    mamaTimer -= dt;
    if (mamaTimer <= 0) {
      mamaTimer = 18;
      if (mamaQueue.length && list.length < recipe.items.length + 2) addListItem(mamaQueue.shift());
    }

    // sale timer
    if (event && event.id === "sale") {
      eventT -= dt;
      if (eventT <= 0) { saleMult = 1; event = null; popup("Sale over!", 0, 3, "#ffd166", 22); }
    }

    // list highlights + impulse traps
    items.forEach((g) => {
      const onList = list.some((l) => l.i === g.userData.i && !l.done);
      g.userData.ring.visible = g.visible && onList;
      g.userData.ring.rotation.z += dt;
      if (!g.visible || onList) return;
      if (dist2(g, player) > PLAYER_RADIUS + 0.6) return;
      const cost = price(g.userData.i);
      budget -= cost;
      popup(`Impulse buy! -${fmt(cost)}`, g.position.x, g.position.y + 1, "#ffd166", 20);
      burst(g.position.x, g.position.y, 0xffd166, 8, 4);
      sfx.impulse();
      randomPos(g, 3);
    });

    // power-ups
    if (power) {
      power.life -= dt;
      power.g.position.y += Math.sin(time / 200) * dt * 0.6;
      power.g.visible = power.life > 3 || Math.floor(power.life * 6) % 2 === 0;
      if (dist2(power.g, player) < PLAYER_RADIUS + 0.55) {
        const P = power.P;
        if (P.id === "speed") speedT = 5;
        if (P.id === "shield") shield = 1;
        if (P.id === "cash") { budget += 4000; score += 15; }
        if (P.id === "taskforce") taskT = TASKFORCE_TIME;
        popup(P.name, power.g.position.x, power.g.position.y + 1, P.color, 20);
        burst(power.g.position.x, power.g.position.y, new THREE.Color(P.color).getHex(), 14, 6);
        sfx.power();
        clearPower();
        powerTimer = 6 + Math.random() * 6;
      } else if (power.life <= 0) {
        clearPower();
        powerTimer = 6 + Math.random() * 6;
      }
    } else {
      powerTimer -= dt;
      if (powerTimer <= 0) spawnPower();
    }

    // task force timer
    if (taskT > 0) {
      taskT -= dt;
      if (taskT <= 0) { taskT = 0; popup("Task force gone", player.position.x, player.position.y + 1, "#4d9dff", 18); }
    }

    // traders
    hitCooldown -= dt;
    traders.forEach((t) => {
      const T = TRADERS[t.userData.type];
      const dx = player.position.x - t.position.x, dy = player.position.y - t.position.y;
      const d = Math.hypot(dx, dy) || 1;
      let dirx = dx / d, diry = dy / d;
      const hunted = taskT > 0 && !T.push; // pickpockets run from the task force
      if (hunted) {
        if (d < PLAYER_RADIUS + T.r) { arrest(t); return; }
        dirx = -dirx; diry = -diry;
      } else if (t.userData.flee > 0) { t.userData.flee -= dt; dirx = -dirx; diry = -diry; }
      // touch players get traders 10% slower: a thumb is less precise than a key
      const sp = (T.speed + round * T.grow) * (haggle ? 0.5 : 1) * (touch.enabled ? 0.9 : 1);
      t.position.x = Math.max(-(camera.right - 0.5), Math.min(camera.right - 0.5, t.position.x + dirx * sp * dt));
      t.position.y = Math.max(camera.bottom + 0.5, Math.min(playerMaxY(), t.position.y + diry * sp * dt));
      if (!hunted && d < PLAYER_RADIUS + T.r && hitCooldown <= 0 && t.userData.flee <= 0) hitPlayer(t, dx / d, dy / d);
    });
    for (let k = traders.length - 1; k >= 0; k--) if (traders[k].userData.arrested) traders.splice(k, 1);

    // round complete / game over
    if (list.every((l) => l.done)) {
      const cooked = recipe;
      round++;
      budget += ROUND_BONUS;
      score += 100 + Math.floor(Math.max(budget, 0) / 250);
      sfx.win();
      burst(0, 0, 0x7dff9a, 30, 9);
      newRound(cooked); // shows the recipe choice for the next round
    } else if (budget <= 0) {
      budget = 0; state = "over";
      cancelHaggle(false);
      msg.textContent = "";
      sfx.lose();
      const rounds = round;
      const newBest = saveScore(score, rounds);
      lastOver = { score, rounds, newBest };
      if (pendingUser) { const p = pendingUser; pendingUser = null; applyUser(p.u); }
      showScreen(lastOver);
    }
  }

  // particles run in every state
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt;
    p.m.material.opacity = Math.max(0, p.life / p.max);
    if (p.life <= 0) { scene.remove(p.m); p.m.material.dispose(); particles.splice(i, 1); }
  }

  // screen shake
  if (shake > 0.01) {
    camera.position.x = (Math.random() - 0.5) * shake;
    camera.position.y = (Math.random() - 0.5) * shake;
    shake *= Math.pow(0.0005, dt);
  } else { shake = 0; camera.position.x = 0; camera.position.y = 0; }

  shieldRing.visible = shield > 0;
  shieldRing.rotation.z += dt * 2;
  // task force: a flashing red and blue ring, quicker in the last 2 seconds
  policeRing.visible = taskT > 0;
  if (taskT > 0) policeRing.material.color.set(Math.floor(time / (taskT < 2 ? 90 : 180)) % 2 ? 0xff3b3b : 0x3b82ff);
  const pulse = (1 + Math.sin(time / 300) * 0.04) * PLAYER_RADIUS;
  player.scale.set(pulse, pulse, 1);

  drawHud();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

// ---------- Go
async function init() {
  // TEST: remove the two slashes below to preview a start.ng character
  // applyUser({ id: "t1", name: "Eniola", style: { primaryColor: "#ff6b6b", secondaryColor: "#2b2f4a", skinColor: "#8d5524", hat: "crown", accessory: "glasses" } });
  reset();
  state = "menu";
  best = loadBest();
  requestAnimationFrame(loop);

  if (!START_NG) { showScreen(); return; }
  showChecking();
  const user = await getCurrentUser();
  applyUser(user === undefined ? null : user);
  showScreen();
  onUserChange((u) => {
    if (state === "playing" || state === "paused") pendingUser = { u };
    else applyUser(u);
  });
}
init();