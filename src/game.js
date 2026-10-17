import * as THREE from "three";
import { START_NG, getCurrentUser, onUserChange, signIn } from "./platform.js";
import { buildCharacter } from "./character.js";

const scene = new THREE.Scene();
const VIEW = 10;
const camera = new THREE.OrthographicCamera(-VIEW, VIEW, VIEW, -VIEW, 0.1, 100);
camera.position.z = 10;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
document.body.appendChild(renderer.domElement);

function resize() {
  const aspect = window.innerWidth / window.innerHeight;
  camera.left = -VIEW * aspect; camera.right = VIEW * aspect;
  camera.top = VIEW; camera.bottom = -VIEW;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener("resize", resize);
resize();

// ---------- Helpers
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

// ---------- HUD, flash messages, menu overlay
const hud = document.createElement("div");
hud.style.cssText = "position:fixed;top:12px;left:12px;right:12px;color:#fff;font:600 16px system-ui;pointer-events:none;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;text-shadow:0 1px 4px #000";
document.body.appendChild(hud);
const msg = document.createElement("div");
msg.style.cssText = "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font:700 24px system-ui;text-align:center;pointer-events:none;text-shadow:0 2px 8px #000";
document.body.appendChild(msg);
const ui = document.createElement("div");
ui.style.cssText = "position:fixed;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;gap:12px;color:#fff;font:600 18px system-ui;text-align:center;background:rgba(10,8,20,.75);padding:16px";
document.body.appendChild(ui);

function h(text, css) {
  const d = document.createElement("div");
  d.textContent = text;
  d.style.cssText = css || "";
  return d;
}
function btn(label, onClick, primary) {
  const b = document.createElement("button");
  b.textContent = label;
  b.onclick = onClick;
  b.style.cssText = `font:700 18px system-ui;padding:12px 22px;border-radius:12px;border:0;cursor:pointer;min-width:220px;background:${primary ? "#ffb703" : "#ffffff22"};color:${primary ? "#1d1626" : "#fff"}`;
  return b;
}

function emojiMesh(emoji, size) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.font = "190px serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(emoji, 128, 140);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true })
  );
}

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

// ---------- Who is playing
const GUEST = { id: "guest", name: "Guest", style: null };
let me = GUEST;
let best = 0;
let pendingUser = null;

const bestKey = () => `budgetpanic:best:${me.id}`;
const loadBest = () => Number(store.get(bestKey()) || 0);
function loadBoard() {
  try { return JSON.parse(store.get("budgetpanic:board") || "[]"); } catch { return []; }
}
function saveScore(rounds) {
  best = Math.max(best, rounds);
  store.set(bestKey(), best);
  const board = loadBoard();
  const row = board.find((r) => r.id === me.id);
  if (row) { row.name = me.name; row.rounds = Math.max(row.rounds, rounds); }
  else board.push({ id: me.id, name: me.name, rounds });
  board.sort((a, b) => b.rounds - a.rounds);
  store.set("budgetpanic:board", JSON.stringify(board.slice(0, 5)));
}

function applyUser(u) {
  const next = u && u.id
    ? { id: String(u.id), name: String(u.name || "Player"), style: u.style || null }
    : GUEST;
  if (JSON.stringify(next) === JSON.stringify(me)) return;
  me = next;
  setCharacter(me.style);
  best = loadBest();
  if (state !== "playing") showScreen();
}

// ---------- Menu / game over screen
function showChecking() {
  ui.replaceChildren(h("Budget Panic 🛒", "font-size:34px;font-weight:800"), h("Checking start.ng…", "opacity:.8"));
  ui.style.display = "flex";
}

function showScreen(overRounds) {
  ui.replaceChildren();
  ui.style.display = "flex";
  const over = typeof overRounds === "number";

  if (over) {
    ui.append(h("Broke! 😭", "font-size:34px;font-weight:800"), h(`Rounds cleared: ${overRounds}`));
  } else {
    ui.append(h("Budget Panic 🛒", "font-size:34px;font-weight:800"), h("Beat the market. Don't go broke.", "opacity:.85"));
  }
  ui.append(h(me === GUEST ? "Playing as Guest" : `Welcome, ${me.name}!`, "font-size:20px"));
  if (!START_NG) ui.append(h("Sign-in isn't available here, so you're playing as a guest.", "font-size:14px;opacity:.75;max-width:320px"));

  if (me === GUEST && START_NG) ui.append(btn("Sign in with start.ng", signIn, true));
  ui.append(btn(over ? "Play again" : me === GUEST ? "Play as guest" : "Play", start, me !== GUEST || !START_NG));

  ui.append(h(`Your best: ${best} rounds`, "font-size:15px;opacity:.85"));
  const board = loadBoard();
  if (board.length) {
    const box = h("🏆 Leaderboard", "font-size:15px;line-height:1.6");
    board.forEach((r, i) => box.append(document.createElement("br"), document.createTextNode(`${i + 1}. ${r.name} · ${r.rounds}`)));
    ui.append(box);
  }
  if (!over) ui.append(h("Move with WASD or arrow keys", "font-size:13px;opacity:.6"));
  else ui.append(h("Space = play again", "font-size:13px;opacity:.6"));
}

function start() {
  ui.style.display = "none";
  reset();
}

// ---------- Market stuff
const CATALOG = [
  { emoji: "🍅", price: 400 },  { emoji: "🍚", price: 1200 },
  { emoji: "🌶️", price: 300 }, { emoji: "🧅", price: 250 },
  { emoji: "🍠", price: 900 },  { emoji: "🐟", price: 1500 },
  { emoji: "🥚", price: 500 },  { emoji: "🍞", price: 700 },
];

function randomPos(g) {
  const mx = camera.right - 1, my = camera.top - 2;
  do {
    g.position.set((Math.random() * 2 - 1) * mx, (Math.random() * 2 - 1) * my, g.position.z);
  } while (g.position.distanceTo(player.position) < 3);
}

const items = CATALOG.map((c, i) => {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CircleGeometry(0.6, 64), new THREE.MeshBasicMaterial({ color: 0x23284a })));
  const e = emojiMesh(c.emoji, 0.9); e.position.z = 0.01; g.add(e);
  g.position.z = 0.1;
  g.userData = { i };
  scene.add(g);
  return g;
});

const traders = [];
function makeTrader() {
  const m = new THREE.Mesh(new THREE.CircleGeometry(0.7, 64), new THREE.MeshBasicMaterial({ color: 0xff4d4d }));
  const e = emojiMesh("😠", 1); e.position.z = 0.01; m.add(e);
  m.position.z = 0.4;
  scene.add(m); traders.push(m); randomPos(m);
}

// ---------- Game state
let budget = 5000, round = 0, list = [], inflation = 1, listTimer = 0, hitCooldown = 0, state = "menu", flashTimer;
const price = (i) => Math.round((CATALOG[i].price * inflation) / 10) * 10;

function flash(text, color) {
  msg.textContent = text; msg.style.color = color;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { if (state === "playing") msg.textContent = ""; }, 900);
}

function newRound() {
  const n = Math.min(3 + Math.floor(round / 2), 6);
  const ids = [...CATALOG.keys()].sort(() => Math.random() - 0.5).slice(0, n);
  list = ids.map((i) => ({ i, done: false }));
  inflation = 1; listTimer = 0;
  items.forEach((g) => { g.visible = true; randomPos(g); });
  while (traders.length < Math.min(2 + round, 6)) makeTrader();
  traders.forEach((t) => randomPos(t));
}

const velocity = new THREE.Vector2(0, 0);
function reset() {
  budget = 5000; round = 0; hitCooldown = 0; state = "playing";
  player.position.set(0, 0, 0.5);
  velocity.set(0, 0);
  msg.textContent = "";
  newRound();
}

function drawHud() {
  const listHtml = list.map((l) =>
    `<span style="${l.done ? "opacity:.35;text-decoration:line-through" : ""}">${CATALOG[l.i].emoji} ₦${price(l.i)}</span>`
  ).join(" &nbsp; ");
  hud.innerHTML = `<div>👤 ${esc(me.name)} · 💰 ₦${budget.toLocaleString()}</div><div>🛒 ${listHtml}</div><div>Round ${round + 1} · Best ${best}</div>`;
}

// ---------- Input
const keys = {};
window.addEventListener("keydown", (e) => {
  keys[e.key.toLowerCase()] = true;
  if (e.key === " ") { e.preventDefault(); if (state === "over") start(); }
});
window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

const SPEED = 9;
let last = 0;

function loop(time) {
  const dt = Math.min((time - last) / 1000, 0.05);
  last = time;

  if (state === "playing") {
    let ix = 0, iy = 0;
    if (keys["a"] || keys["arrowleft"]) ix -= 1;
    if (keys["d"] || keys["arrowright"]) ix += 1;
    if (keys["w"] || keys["arrowup"]) iy += 1;
    if (keys["s"] || keys["arrowdown"]) iy -= 1;
    const len = Math.hypot(ix, iy) || 1;
    const ease = 1 - Math.pow(0.0001, dt);
    velocity.x += ((ix / len) * SPEED - velocity.x) * ease;
    velocity.y += ((iy / len) * SPEED - velocity.y) * ease;
    player.position.x += velocity.x * dt;
    player.position.y += velocity.y * dt;
    const maxX = camera.right - PLAYER_RADIUS, maxY = camera.top - PLAYER_RADIUS;
    player.position.x = Math.max(-maxX, Math.min(maxX, player.position.x));
    player.position.y = Math.max(-maxY, Math.min(maxY, player.position.y));

    listTimer += dt;
    if (listTimer > 7) {
      listTimer = 0; inflation *= 1.06;
      const free = CATALOG.map((_, i) => i).filter((i) => !list.some((l) => l.i === i));
      if (free.length && list.length < 8) list.push({ i: free[Math.floor(Math.random() * free.length)], done: false });
    }

    items.forEach((g) => {
      if (!g.visible || g.position.distanceTo(player.position) > PLAYER_RADIUS + 0.6) return;
      const i = g.userData.i, cost = price(i), entry = list.find((l) => l.i === i && !l.done);
      budget -= cost;
      if (entry) { entry.done = true; g.visible = false; flash(`Bought! -₦${cost}`, "#7dff9a"); }
      else { randomPos(g); flash(`Impulse buy! -₦${cost}`, "#ffd166"); }
    });

    hitCooldown -= dt;
    traders.forEach((t) => {
      const dx = player.position.x - t.position.x, dy = player.position.y - t.position.y;
      const d = Math.hypot(dx, dy) || 1;
      const sp = 2 + round * 0.25;
      t.position.x += (dx / d) * sp * dt;
      t.position.y += (dy / d) * sp * dt;
      if (d < PLAYER_RADIUS + 0.7 && hitCooldown <= 0) {
        hitCooldown = 1; budget -= 300;
        velocity.x += (dx / d) * 14; velocity.y += (dy / d) * 14;
        flash("Trader pushed you! -₦300", "#ff6b6b");
      }
    });

    if (list.every((l) => l.done)) {
      round++; budget += 1500;
      newRound(); flash("List done! +₦1500 💪", "#7dff9a");
    } else if (budget <= 0) {
      budget = 0; state = "over";
      msg.textContent = "";
      const rounds = round;
      saveScore(rounds);
      if (pendingUser) { const p = pendingUser; pendingUser = null; applyUser(p.u); }
      showScreen(rounds);
    }
  }

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
    if (state === "playing") pendingUser = { u };
    else applyUser(u);
  });
}
init();