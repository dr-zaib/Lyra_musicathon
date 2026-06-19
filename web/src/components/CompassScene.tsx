"use client";

// SMOKE TEST — minimal r3f Canvas to confirm the toolchain renders under Next 16/Turbopack
// + React 19. Will be replaced by the real compass scene once verified.

import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Mesh } from "three";

function SpinBox() {
  const ref = useRef<Mesh>(null);
  useFrame((_, dt) => { if (ref.current) { ref.current.rotation.x += dt * 0.6; ref.current.rotation.y += dt * 0.8; } });
  return (
    <mesh ref={ref}>
      <boxGeometry args={[1.6, 1.6, 1.6]} />
      <meshStandardMaterial color="#E8C36B" emissive="#7a68cf" emissiveIntensity={0.4} />
    </mesh>
  );
}

export default function CompassScene() {
  return (
    <Canvas camera={{ position: [0, 0, 5], fov: 50 }} style={{ width: "100%", height: "100%" }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 4, 5]} intensity={1.2} />
      <SpinBox />
    </Canvas>
  );
}
