const host = location.hostname;

export const START_NG = host.endsWith(".start.ng")
  ? "https://start.ng"
  : host.endsWith(".start.localhost")
  ? "http://start.localhost:5173"
  : null;

let frame = null;
let frameLoaded = null;

function loadFrame() {
  if (frameLoaded) return frameLoaded;
  frameLoaded = new Promise((resolve) => {
    frame = document.createElement("iframe");
    frame.style.display = "none";
    frame.onload = () => resolve(frame);
    frame.src = `${START_NG}/connect`;
    document.body.appendChild(frame);
  });
  return frameLoaded;
}

// Returns: a user object (signed in), null (signed out),
// or undefined (start.ng didn't answer in 3 seconds)
export function getCurrentUser() {
  if (!START_NG) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    let done = false;
    const requestId = Math.random().toString(36).slice(2);
    const finish = (value) => {
      if (done) return;
      done = true;
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
      resolve(value);
    };
    const onMessage = (event) => {
      if (event.origin !== START_NG) return;
      if (!frame || event.source !== frame.contentWindow) return;
      const d = event.data;
      if (!d || d.type !== "startng:user" || d.requestId !== requestId) return;
      finish(d.user || null);
    };
    window.addEventListener("message", onMessage);
    const timer = setTimeout(() => finish(undefined), 3000);
    loadFrame().then((f) => {
      if (!done) f.contentWindow.postMessage({ type: "startng:whoami", requestId }, START_NG);
    });
  });
}

// Calls fn(user) when the player signs in or out on start.ng
let lastKey = null;
export function onUserChange(fn) {
  const check = async () => {
    if (!START_NG) return;
    const user = await getCurrentUser();
    if (user === undefined) return; // no answer, ignore
    const key = JSON.stringify(user);
    if (key === lastKey) return;
    lastKey = key;
    fn(user);
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });
  window.addEventListener("focus", check);
}

export function signIn() {
  if (!START_NG) return;
  location.href = `${START_NG}/?returnto=${encodeURIComponent(location.href)}`;
}