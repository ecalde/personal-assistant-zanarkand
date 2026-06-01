/**
 * Ambient Particles (Phase 37D) — subtle drifting accent motes rendered behind
 * all content, non-interactive. Count is decided by the pure resolver
 * (`resolveEffectSettings`) from accent intensity + performance tier + mobile;
 * this component only paints `count` motes from the stable layout config.
 */
import { ANIMATED_ATTR, PARTICLE_LAYOUTS } from "./effectsConfig";

export function AmbientParticlesLayer({ count }: { count: number }) {
  if (count <= 0) return null;
  const particles = PARTICLE_LAYOUTS.slice(
    0,
    Math.min(count, PARTICLE_LAYOUTS.length)
  );

  return (
    <>
      {particles.map((p, i) => (
        <span
          key={i}
          {...{ [ANIMATED_ATTR]: "" }}
          style={{
            position: "absolute",
            left: p.left,
            bottom: "-10px",
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            background: "var(--aether-accent, #46c6ff)",
            boxShadow: "var(--aether-glow, 0 0 20px rgba(70,198,255,0.4))",
            animation: `aether-drift ${p.duration} ease-in ${p.delay} infinite`,
            willChange: "transform, opacity",
          }}
        />
      ))}
    </>
  );
}
