// Cheap one-shot WebGL capability probe. The 3D compass needs a WebGL context; on the rare
// device (or locked-down browser) that can't give one, callers fall back to the 2.5D wheel
// so the demo never shows a blank canvas. Result is cached — the probe runs at most once.
let cached: boolean | null = null;

export function hasWebGL(): boolean {
  if (cached !== null) return cached;
  if (typeof window === "undefined") return false; // SSR: assume no until the client probes
  try {
    const c = document.createElement("canvas");
    cached = !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
  } catch {
    cached = false;
  }
  return cached;
}
