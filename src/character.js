import * as THREE from "three";

const DEFAULTS = {
  primaryColor: "#6bcbff",
  secondaryColor: "#2b2f4a",
  skinColor: "#8d5524",
  hat: "none",
  accessory: "none",
};
const HATS = ["none", "cap", "beanie", "tophat", "crown"];
const ACCESSORIES = ["none", "glasses", "scarf", "backpack"];
const isColor = (v) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

// Unknown or missing values fall back to defaults
export function cleanStyle(style) {
  const s = style || {};
  return {
    primaryColor: isColor(s.primaryColor) ? s.primaryColor : DEFAULTS.primaryColor,
    secondaryColor: isColor(s.secondaryColor) ? s.secondaryColor : DEFAULTS.secondaryColor,
    skinColor: isColor(s.skinColor) ? s.skinColor : DEFAULTS.skinColor,
    hat: HATS.includes(s.hat) ? s.hat : "none",
    accessory: ACCESSORIES.includes(s.accessory) ? s.accessory : "none",
  };
}

function add(group, geo, color, x, y, z) {
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
  m.position.set(x, y, z);
  group.add(m);
  return m;
}

// Builds a character with radius 1. Scale it to fit your game.
export function buildCharacter(style) {
  const s = cleanStyle(style);
  const g = new THREE.Group();

  if (s.accessory === "backpack") add(g, new THREE.PlaneGeometry(0.6, 1.0), s.secondaryColor, -0.95, -0.1, -0.05);

  add(g, new THREE.CircleGeometry(1, 64), s.primaryColor, 0, 0, 0);
  add(g, new THREE.RingGeometry(0.9, 1, 64), s.secondaryColor, 0, 0, 0.01);
  add(g, new THREE.CircleGeometry(0.6, 48), s.skinColor, 0, 0.05, 0.02);
  add(g, new THREE.CircleGeometry(0.09, 20), 0x1b1b1b, -0.22, 0.12, 0.03);
  add(g, new THREE.CircleGeometry(0.09, 20), 0x1b1b1b, 0.22, 0.12, 0.03);

  if (s.accessory === "scarf") add(g, new THREE.PlaneGeometry(1.5, 0.28), s.secondaryColor, 0, -0.62, 0.04);
  if (s.accessory === "glasses") {
    add(g, new THREE.RingGeometry(0.13, 0.19, 24), 0x111111, -0.22, 0.12, 0.04);
    add(g, new THREE.RingGeometry(0.13, 0.19, 24), 0x111111, 0.22, 0.12, 0.04);
    add(g, new THREE.PlaneGeometry(0.12, 0.04), 0x111111, 0, 0.13, 0.04);
  }

  if (s.hat === "cap") {
    add(g, new THREE.CircleGeometry(0.8, 40, 0, Math.PI), s.secondaryColor, 0, 0.62, 0.05);
    add(g, new THREE.PlaneGeometry(1.1, 0.14), 0xffffff, 0.5, 0.64, 0.06);
  }
  if (s.hat === "beanie") {
    add(g, new THREE.CircleGeometry(0.9, 40, 0, Math.PI), s.secondaryColor, 0, 0.5, 0.05);
    add(g, new THREE.PlaneGeometry(1.7, 0.2), 0xffffff, 0, 0.55, 0.06);
    add(g, new THREE.CircleGeometry(0.16, 20), 0xffffff, 0, 1.45, 0.06);
  }
  if (s.hat === "tophat") {
    add(g, new THREE.PlaneGeometry(1.4, 0.12), s.secondaryColor, 0, 0.98, 0.05);
    add(g, new THREE.PlaneGeometry(0.8, 0.75), s.secondaryColor, 0, 1.35, 0.05);
    add(g, new THREE.PlaneGeometry(0.8, 0.12), 0xffd166, 0, 1.05, 0.06);
  }
  if (s.hat === "crown") {
    const shape = new THREE.Shape();
    shape.moveTo(-0.55, 0.9);
    [[-0.55, 1.45], [-0.28, 1.15], [0, 1.55], [0.28, 1.15], [0.55, 1.45], [0.55, 0.9]]
      .forEach(([x, y]) => shape.lineTo(x, y));
    shape.closePath();
    add(g, new THREE.ShapeGeometry(shape), 0xffd166, 0, 0, 0.05);
  }
  return g;
}