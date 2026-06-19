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

function Dial({ dominant, moodColor, comprehension, picks }: {
  dominant: MacroNode | null; moodColor: string; comprehension: number; picks: MacroNode[];
}) {
  const ref = useRef<THREE.Group>(null);
  const target = dominant ? (Math.PI / 2 - baseAngle(idxOf(dominant))) : 0;
  // ease the dial toward the target orientation + a slow idle drift
  useFrame((_, dt) => {
    const g = ref.current; if (!g) return;
    g.rotation.z += (target - g.rotation.z) * Math.min(1, dt * 2.2) + dt * 0.04;
  });

  const trailPts = useMemo(() => {
    const seq = picks.length ? picks : [];
    return seq.map((m) => {
      const a = baseAngle(idxOf(m)); const rr = R * 0.84;
      return new THREE.Vector3(Math.cos(a) * rr, Math.sin(a) * rr, 0.1);
    });
  }, [picks]);
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
    <group ref={ref} rotation-z={target}>
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
        return (
          <group key={m}>
            <mesh position={[x, y, 0.05]}><sphereGeometry args={[isDom ? 0.32 : 0.16, 16, 16]} /><meshBasicMaterial color={col} /></mesh>
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

export default function CompassScene({ dominant, moodColor, comprehension, picks }: {
  dominant: MacroNode | null; moodColor: string; comprehension: number; picks: MacroNode[];
}) {
  return (
    <Canvas
      camera={{ position: [-3, 7, 23], fov: 50 }}
      onCreated={({ camera }) => camera.lookAt(-2, 0.5, -2)}
      gl={{ antialias: true }}
      dpr={[1, 2]}
      style={{ width: "100%", height: "100%" }}
    >
      <color attach="background" args={["#080611"]} />
      <fogExp2 attach="fog" args={["#0a0716", 0.014]} />
      <ambientLight intensity={0.6} />
      <group rotation-x={-1.0} position={[-2, 0.5, -2]} scale={0.82}>
        <Dial dominant={dominant} moodColor={moodColor} comprehension={comprehension} picks={picks} />
        <Needle />
      </group>
      <EffectComposer>
        <Bloom intensity={0.7} luminanceThreshold={0.42} luminanceSmoothing={0.7} mipmapBlur />
      </EffectComposer>
    </Canvas>
  );
}
