import {
  INTERFACE_EFFECT_OPTIONS,
  type InterfaceEffectKey,
  type InterfaceEffects,
} from "../../core/theme";
import { settingsStyles as s } from "./settingsStyles";

export function InterfaceEffectsToggles({
  effects,
  onToggle,
}: {
  effects: InterfaceEffects;
  onToggle: (effect: InterfaceEffectKey) => void;
}) {
  return (
    <div style={s.effectsGrid}>
      {INTERFACE_EFFECT_OPTIONS.map((option) => {
        const isOn = effects[option.id];
        const labelId = `effect-label-${option.id}`;
        return (
          <div key={option.id} style={s.effectRow}>
            <span style={s.effectText}>
              <span id={labelId} style={s.effectLabel}>
                {option.label}
              </span>
              <span style={s.effectDescription}>{option.description}</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={isOn}
              aria-labelledby={labelId}
              onClick={() => onToggle(option.id)}
              style={{ ...s.toggle, ...(isOn ? s.toggleOn : {}) }}
            >
              <span
                style={{ ...s.toggleKnob, ...(isOn ? s.toggleKnobOn : {}) }}
                aria-hidden
              />
            </button>
          </div>
        );
      })}
    </div>
  );
}
