"use client";

// The 3D compass view (behind ?view=compass). A tilted dial — the 12-emotion wheel — that
// turns beneath a FIXED north needle, so the current dominant emotion always sits under the
// needle. The centre core encodes intensity (comprehension); a trail shows the recent path.
// Kept flat (no vertical climb): depth is the journey, not height. Client-only (ssr:false).

import { Canvas, useFrame } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { TAXONOMY } from "@/lib/taxonomy";
import type { MacroNode } from "@/lib/types";

const WHEEL_ORDER: MacroNode[] = [
  "Empowerment", "Joy", "Hope", "Tenderness", "Nostalgia", "Reflection",
  "Solitude", "Melancholia", "Anxiety", "Anger", "Defiance", "Awe",
];
const N = WHEEL_ORDER.length;
const R = 11;
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

function Label({ text, color, position, big }: { text: string; color: string; position: [number, number, number]; big?: boolean }) {
  const tex = useMemo(() => makeTextTexture(text, color), [text, color]);
  const s = big ? 6.2 : 5;
  return (
    <sprite position={position} scale={[s, s / 4, 1]}>
      <spriteMaterial map={tex} transparent depthWrite={false} />
    </sprite>
  );
}

function Dial({ dominant, moodColor, comprehension, trail, onSelect }: {
  dominant: MacroNode | null; moodColor: string; comprehension: number; trail: MacroNode[]; onSelect?: (m: MacroNode) => void;
}) {
  const ref = useRef<THREE.Group>(null);
  const inited = useRef(false);
  const reduced = useMemo(() => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, []);
  const target = dominant ? (Math.PI / 2 - baseAngle(idxOf(dominant))) : 0;
  // useFrame OWNS rotation.z (the JSX must NOT set rotation-z, or React would re-apply it
  // every render and the dial would snap instead of animating). First frame: snap to the
  // start; after that, ease toward the dominant via the shortest path and hold.
  useFrame((_, dt) => {
    const g = ref.current; if (!g) return;
    if (!inited.current) { g.rotation.z = target; inited.current = true; return; }
    if (reduced) { g.rotation.z = target; return; }
    let d = target - g.rotation.z;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    g.rotation.z += d * Math.min(1, dt * 2.4);
  });

  const trailPts = useMemo(() => {
    const seq = trail.length ? trail : [];
    return seq.map((m) => {
      const a = baseAngle(idxOf(m)); const rr = R * 0.84;
      return new THREE.Vector3(Math.cos(a) * rr, Math.sin(a) * rr, 0.1);
    });
  }, [trail]);
  const trailGeo = useMemo(() => new THREE.BufferGeometry().setFromPoints(trailPts), [trailPts]);

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
            <Label text={m.toLowerCase()} color={col} position={[x * 1.13, y * 1.13, 0.4]} big={isDom} />
          </group>
        );
      })}

      {/* trail of the recent emotional path */}
      {trailPts.length > 1 && (
        <line>
          <primitive object={trailGeo} attach="geometry" />
          <lineBasicMaterial color="#E8C36B" transparent opacity={0.4} />
        </line>
      )}

      {/* centre core = intensity, coloured to the dominant mood */}
      <mesh><sphereGeometry args={[coreR, 28, 28]} /><meshBasicMaterial color={moodColor} /></mesh>
      <mesh><sphereGeometry args={[coreR * 2, 24, 24]} /><meshBasicMaterial color={moodColor} transparent opacity={0.18} /></mesh>
    </group>
  );
}

function Needle() {
  // fixed at north (does NOT rotate with the dial)
  const len = R * 0.86;
  return (
    <group>
      {/* sleek round spire (was a 4-sided pyramid → squared) */}
      <mesh position={[0, len / 2, 0.3]}><coneGeometry args={[0.17, len, 24]} /><meshBasicMaterial color="#E8C36B" /></mesh>
      <mesh position={[0, R + 0.7, 0.3]}><sphereGeometry args={[0.26, 20, 20]} /><meshBasicMaterial color="#fff3d6" /></mesh>
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
      <group rotation-x={-1.0} position={[-2, 0.5, -2]} scale={0.9}>
        <Dial dominant={dominant} moodColor={moodColor} comprehension={comprehension} trail={trail} onSelect={onSelect} />
        <Needle />
      </group>
      <EffectComposer>
        <Bloom intensity={0.7} luminanceThreshold={0.42} luminanceSmoothing={0.7} mipmapBlur />
      </EffectComposer>
    </Canvas>
  );
}
