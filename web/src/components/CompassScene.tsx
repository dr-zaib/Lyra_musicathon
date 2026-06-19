"use client";

// The 3D compass view (behind ?view=compass). A tilted dial — the 12-emotion wheel — that
// turns beneath a FIXED north needle, so the current dominant emotion always sits under the
// needle. The centre core encodes intensity (comprehension); a trail shows the recent path.
// Kept flat (no vertical climb): depth is the journey, not height. Client-only (ssr:false).

import { Canvas, useFrame } from "@react-three/fiber";
import { forwardRef, useMemo, useRef } from "react";
import * as THREE from "three";

import { TAXONOMY } from "@/lib/taxonomy";
import type { MacroNode } from "@/lib/types";

const WHEEL_ORDER: MacroNode[] = [
  "Empowerment", "Joy", "Hope", "Tenderness", "Nostalgia", "Reflection",
  "Solitude", "Melancholia", "Anxiety", "Anger", "Defiance", "Awe",
];
const N = WHEEL_ORDER.length;
const R = 11;
const DIAL_F = 1; // rotation split: 1 = dial turns fully, needle fixed at north (Alberto's pick). <1 = hybrid (kept for the roadmap).
const idxOf = (m: MacroNode) => WHEEL_ORDER.indexOf(m);
const baseAngle = (i: number) => (i / N) * Math.PI * 2; // 0 at +X, CCW

function makeTextTexture(text: string, color: string) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 64;
  const x = c.getContext("2d")!;
  x.font = "600 34px Georgia"; x.fillStyle = color; x.textAlign = "center"; x.textBaseline = "middle";
  x.shadowColor = color; x.shadowBlur = 3;
  x.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4;
  return t;
}

// The sprite scale is NOT set here — the Dial drives it per-frame by each label's angular
// distance from the needle (far = bigger, to invite the click that brings it to north).
const Label = forwardRef<THREE.Sprite, { text: string; color: string; position: [number, number, number] }>(
  function Label({ text, color, position }, ref) {
    const tex = useMemo(() => makeTextTexture(text, color), [text, color]);
    return (
      <sprite ref={ref} position={position} scale={[6, 1.5, 1]}>
        <spriteMaterial map={tex} transparent depthWrite={false} />
      </sprite>
    );
  },
);

function Dial({ dominant, moodColor, comprehension, trail, onSelect }: {
  dominant: MacroNode | null; moodColor: string; comprehension: number; trail: MacroNode[]; onSelect?: (m: MacroNode) => void;
}) {
  const ref = useRef<THREE.Group>(null);
  const inited = useRef(false);
  const labelRefs = useRef<Array<THREE.Sprite | null>>([]);
  const reduced = useMemo(() => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, []);
  const target = dominant ? DIAL_F * (-Math.PI / 2 - baseAngle(idxOf(dominant))) : 0; // dominant → SOUTH (needle points at the viewer)
  // useFrame OWNS rotation.z (the JSX must NOT set rotation-z, or React would re-apply it
  // every render and the dial would snap instead of animating). First frame: snap to the
  // start; after that, ease toward the dominant via the shortest path and hold.
  useFrame((_, dt) => {
    const g = ref.current; if (!g) return;
    if (!inited.current) { g.rotation.z = target; inited.current = true; }
    else if (!dominant) { if (!reduced) g.rotation.z += dt * 0.16; } // idle slow spin until something is chosen
    else if (reduced) { g.rotation.z = target; }
    else {
      let d = target - g.rotation.z;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      g.rotation.z += d * Math.min(1, dt * 2.4);
    }
    // size each label by how close it sits to the fixed north needle: the one under the
    // needle is the largest, the far ones shrink — so the emotions already in focus read big
    // and feel the most clickable.
    const rot = g.rotation.z;
    for (let i = 0; i < N; i++) {
      const sp = labelRefs.current[i];
      if (!sp) continue;
      let a = baseAngle(i) + rot + Math.PI / 2; // distance from the SOUTH needle (-π/2)
      a = Math.abs(Math.atan2(Math.sin(a), Math.cos(a))); // 0 at the needle → π opposite
      const t = a / Math.PI;
      const s = 8.4 - 3.8 * t; // 8.4 under the needle → 4.6 at the far side
      sp.scale.set(s, s / 4, 1);
    }
  });

  const trailPts = useMemo(() => {
    const seq = trail.length ? trail : [];
    return seq.map((m) => {
      const a = baseAngle(idxOf(m)); const rr = R * 0.84;
      return new THREE.Vector3(Math.cos(a) * rr, Math.sin(a) * rr, 0.1);
    });
  }, [trail]);
  // the trail as a CONSTELLATION: a thin glowing line through the emotion nodes (a node dot
  // is drawn at each below). Flows through the emotions' colours and fades along its length
  // (oldest dim → newest bright); additive blending makes it glow.
  const trailTube = useMemo(() => {
    const n = trailPts.length;
    if (n < 2) return null;
    const curve = new THREE.CatmullRomCurve3(trailPts, false, "catmullrom", 0.4);
    const RAD = 6, TUB = 100;
    const geo = new THREE.TubeGeometry(curve, TUB, 0.06, RAD, false); // thin (constellation), smooth + robust
    const emoCols = trail.map((m) => new THREE.Color(TAXONOMY[m].color));
    const pos = geo.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const u = Math.floor(i / (RAD + 1)) / TUB; // 0 oldest → 1 newest along the path
      const fp = u * (n - 1);
      const seg = Math.min(n - 2, Math.floor(fp));
      tmp.copy(emoCols[seg]).lerp(emoCols[seg + 1], fp - seg); // colour of the emotion here
      const b = 0.22 + 0.78 * u; // visible fade: dim at the old tail, bright at the head
      cols[i * 3] = tmp.r * b; cols[i * 3 + 1] = tmp.g * b; cols[i * 3 + 2] = tmp.b * b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    return geo;
  }, [trailPts, trail]);

  // faint constellation spokes from the centre to each emotion (the "rays" Alberto liked)
  const spokeGeo = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    WHEEL_ORDER.forEach((_, i) => {
      const a = baseAngle(i);
      pts.push(new THREE.Vector3(0, 0, 0.02), new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, 0.02));
    });
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);

  const coreR = 0.5 + comprehension * 1.0;
  const coreCol = dominant ? moodColor : "#6b6880"; // neutral grey until an emotion is chosen

  return (
    <group ref={ref}>
      {/* rings + faint plate */}
      <mesh><ringGeometry args={[R - 0.05, R + 0.05, 100]} /><meshBasicMaterial color="#6a5fae" transparent opacity={0.4} side={THREE.DoubleSide} /></mesh>
      <mesh><ringGeometry args={[R * 0.6 - 0.04, R * 0.6 + 0.04, 80]} /><meshBasicMaterial color="#6a5fae" transparent opacity={0.22} side={THREE.DoubleSide} /></mesh>
      <mesh><circleGeometry args={[R, 80]} /><meshBasicMaterial color="#140d24" transparent opacity={0.45} side={THREE.DoubleSide} /></mesh>

      {/* constellation spokes */}
      <lineSegments>
        <primitive object={spokeGeo} attach="geometry" />
        <lineBasicMaterial color="#4a4070" transparent opacity={0.2} />
      </lineSegments>

      {/* 12 emotion markers + labels */}
      {WHEEL_ORDER.map((m, i) => {
        const a = baseAngle(i); const x = Math.cos(a) * R, y = Math.sin(a) * R;
        const col = TAXONOMY[m].color;
        const isDom = m === dominant;
        const interactive = !!onSelect;
        return (
          <group
            key={m}
            onClick={interactive ? (e) => { e.stopPropagation(); onSelect!(m); } : undefined}
            onPointerOver={interactive ? () => { document.body.style.cursor = "pointer"; } : undefined}
            onPointerOut={interactive ? () => { document.body.style.cursor = ""; } : undefined}
          >
            <mesh position={[x, y, 0.05]}><sphereGeometry args={[isDom ? 0.32 : 0.16, 16, 16]} /><meshBasicMaterial color={col} /></mesh>
            {/* invisible but raycastable hit area for comfortable clicking */}
            {interactive && <mesh position={[x * 1.1, y * 1.1, 0.4]}><sphereGeometry args={[1.3, 10, 10]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>}
            <Label ref={(el) => { labelRefs.current[i] = el; }} text={m.toLowerCase()} color={col} position={[x * 1.2, y * 1.2, 0.6]} />
          </group>
        );
      })}

      {/* constellation trail: thin polyline + a glowing node at each emotion */}
      {trailTube && (
        <mesh>
          <primitive object={trailTube} attach="geometry" />
          <meshBasicMaterial vertexColors transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      )}
      {trailPts.map((p, i) => (
        <mesh key={`tn-${i}`} position={[p.x, p.y, p.z]}>
          <sphereGeometry args={[0.14, 12, 12]} />
          <meshBasicMaterial color={TAXONOMY[trail[i]].color} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}

      {/* centre core = intensity, coloured to the dominant mood (grey until chosen).
          Additive halos give it a glow now that the full-screen bloom is gone. */}
      <mesh><sphereGeometry args={[coreR, 28, 28]} /><meshBasicMaterial color={coreCol} /></mesh>
      <mesh><sphereGeometry args={[coreR * 1.7, 24, 24]} /><meshBasicMaterial color={coreCol} transparent opacity={0.35} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>
      <mesh><sphereGeometry args={[coreR * 2.8, 20, 20]} /><meshBasicMaterial color={coreCol} transparent opacity={0.12} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>
    </group>
  );
}

function Needle({ dominant }: { dominant: MacroNode | null }) {
  // the needle swings to POINT at the current emotion (covers the part of the turn the dial
  // doesn't), so picking a nearby emotion barely moves the wheel. Points north when idle.
  const ref = useRef<THREE.Group>(null);
  const inited = useRef(false);
  const reduced = useMemo(() => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, []);
  const target = dominant ? -(1 - DIAL_F) * (Math.PI / 2 - baseAngle(idxOf(dominant))) : 0;
  useFrame((_, dt) => {
    const g = ref.current; if (!g) return;
    if (!inited.current) { g.rotation.z = target; inited.current = true; return; }
    if (reduced) { g.rotation.z = target; return; }
    let d = target - g.rotation.z;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    g.rotation.z += d * Math.min(1, dt * 2.4);
  });
  const len = R * 0.86;
  return (
    <group ref={ref}>
      {/* sleek round spire pointing SOUTH (toward the viewer); no tip bead (Alberto) */}
      <mesh position={[0, -len / 2, 0.3]} rotation-z={Math.PI}><coneGeometry args={[0.17, len, 24]} /><meshBasicMaterial color="#E8C36B" /></mesh>
    </group>
  );
}

export default function CompassScene({ dominant, moodColor, comprehension, trail, onSelect }: {
  dominant: MacroNode | null; moodColor: string; comprehension: number; trail: MacroNode[]; onSelect?: (m: MacroNode) => void;
}) {
  return (
    <Canvas
      camera={{ position: [-3, 7, 23], fov: 50 }}
      onCreated={({ camera }) => camera.lookAt(-2, 0.5, -2)}
      gl={{ antialias: true, alpha: true }}
      dpr={[1, 2]}
      style={{ width: "100%", height: "100%", background: "transparent" }}
    >
      <ambientLight intensity={0.6} />
      <group rotation-x={-1.0} position={[-2, 1.8, -2]} scale={0.9}>
        <Dial dominant={dominant} moodColor={moodColor} comprehension={comprehension} trail={trail} onSelect={onSelect} />
        <Needle dominant={dominant} />
      </group>
    </Canvas>
  );
}
