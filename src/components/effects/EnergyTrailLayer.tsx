/**
 * Magical Energy Trails (Phase 37D) — a lightweight cursor-follow trail of
 * fading accent motes. Desktop + precise-pointer only (the resolver passes
 * `segments === 0` on touch / mobile / reduced motion / low tier, in which case
 * this renders nothing).
 *
 * Performance: a fixed-size pool of `segments` DOM nodes is reused for the
 * lifetime of the layer — no per-move allocation. Positions are updated with
 * `transform: translate3d(...)` inside a single throttled `requestAnimationFrame`
 * loop (compositor-friendly, no layout thrash). Each node lags behind the one
 * ahead of it, producing the trailing comet look; opacity fades along the tail.
 */
import { useEffect, useRef } from "react";

export function EnergyTrailLayer({ segments }: { segments: number }) {
  const nodesRef = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    if (segments <= 0) return;
    if (typeof window === "undefined") return;

    const nodes = nodesRef.current;
    // Each segment's smoothed position; seeded off-screen until first move.
    const positions = nodes.map(() => ({ x: -100, y: -100 }));
    const pointer = { x: -100, y: -100, active: false };
    let raf = 0;
    let idleFrames = 0;

    const onMove = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      if (!pointer.active) {
        pointer.active = true;
        // Snap the whole tail to the cursor so it doesn't fly in from 0,0.
        for (const p of positions) {
          p.x = pointer.x;
          p.y = pointer.y;
        }
      }
      idleFrames = 0;
      if (!raf) raf = window.requestAnimationFrame(tick);
    };

    const tick = () => {
      let leadX = pointer.x;
      let leadY = pointer.y;
      let moved = false;
      for (let i = 0; i < positions.length; i++) {
        const p = positions[i];
        const nx = p.x + (leadX - p.x) * 0.35;
        const ny = p.y + (leadY - p.y) * 0.35;
        if (Math.abs(nx - p.x) > 0.1 || Math.abs(ny - p.y) > 0.1) moved = true;
        p.x = nx;
        p.y = ny;
        const node = nodes[i];
        if (node) {
          node.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -50%)`;
        }
        leadX = p.x;
        leadY = p.y;
      }
      // Stop the loop once the tail has settled, to avoid burning frames idle.
      idleFrames = moved ? 0 : idleFrames + 1;
      if (idleFrames > 12) {
        raf = 0;
        return;
      }
      raf = window.requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [segments]);

  if (segments <= 0) return null;

  return (
    <>
      {Array.from({ length: segments }).map((_, i) => {
        const fade = 1 - i / segments;
        const size = Math.max(3, Math.round(10 * fade));
        return (
          <span
            key={i}
            ref={(el) => {
              nodesRef.current[i] = el;
            }}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: size,
              height: size,
              borderRadius: "50%",
              background: "var(--aether-accent, #46c6ff)",
              boxShadow: "var(--aether-glow, 0 0 12px rgba(70,198,255,0.45))",
              opacity: 0.5 * fade,
              transform: "translate3d(-100px, -100px, 0) translate(-50%, -50%)",
              willChange: "transform",
            }}
          />
        );
      })}
    </>
  );
}
