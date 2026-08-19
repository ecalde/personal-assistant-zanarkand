import { useMemo, useState } from "react";
import { normalizeIngredientName } from "../../core/ingredients";
import type { CustomIngredient, Per100g } from "../../core/model";
import { styles } from "../../ui/appStyles";

export type   CustomIngredientsPanelProps = {
  customIngredients: CustomIngredient[];
  onAdd: (input: Omit<CustomIngredient, "id" | "createdAtIso" | "updatedAtIso">) => void;
  onDelete: (itemId: string) => void;
};

type MacroDraft = {
  kcal: string;
  proteinG: string;
  fatG: string;
  carbG: string;
};

const emptyMacros: MacroDraft = { kcal: "", proteinG: "", fatG: "", carbG: "" };

function parseOptionalNumber(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parsePer100g(draft: MacroDraft): Per100g | undefined {
  const kcal = parseOptionalNumber(draft.kcal);
  const proteinG = parseOptionalNumber(draft.proteinG);
  const fatG = parseOptionalNumber(draft.fatG);
  const carbG = parseOptionalNumber(draft.carbG);
  if (kcal === undefined || proteinG === undefined || fatG === undefined || carbG === undefined) {
    return undefined;
  }
  return { kcal, proteinG, fatG, carbG };
}

export function CustomIngredientsPanel({
  customIngredients,
  onAdd,
  onDelete,
}: CustomIngredientsPanelProps) {
  const [name, setName] = useState("");
  const [density, setDensity] = useState("");
  const [gramsPerPiece, setGramsPerPiece] = useState("");
  const [macros, setMacros] = useState<MacroDraft>(emptyMacros);
  const [formError, setFormError] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...customIngredients].sort((a, b) => a.name.localeCompare(b.name)),
    [customIngredients]
  );

  function add() {
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError("Name is required.");
      return;
    }
    const duplicate = customIngredients.some(
      (item) => normalizeIngredientName(item.name) === normalizeIngredientName(trimmed)
    );
    if (duplicate) {
      setFormError("You already have a custom ingredient with that name.");
      return;
    }
    const densityGPerMl = parseOptionalNumber(density);
    const grams = parseOptionalNumber(gramsPerPiece);
    const per100g = parsePer100g(macros);
    if ((macros.kcal || macros.proteinG || macros.fatG || macros.carbG) && !per100g) {
      setFormError("Enter all four macros (kcal, protein, fat, carb) per 100g, or leave them blank.");
      return;
    }

    const input: Omit<CustomIngredient, "id" | "createdAtIso" | "updatedAtIso"> = { name: trimmed };
    if (densityGPerMl !== undefined) input.densityGPerMl = densityGPerMl;
    if (grams !== undefined) input.gramsPerPiece = grams;
    if (per100g) input.per100g = per100g;
    onAdd(input);
    setName("");
    setDensity("");
    setGramsPerPiece("");
    setMacros(emptyMacros);
    setFormError(null);
  }

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Custom ingredients</div>
      <div style={{ ...styles.textSecondary, marginBottom: 12, fontSize: 14 }}>
        Add foods the catalog does not have. Include per-100g macros so recipe nutrition can use them.
      </div>

      <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (e.g. leftover roast chicken)"
          style={styles.input}
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: 8,
          }}
        >
          <input
            value={density}
            onChange={(e) => setDensity(e.target.value)}
            placeholder="Density g/ml"
            style={styles.inputCompact}
          />
          <input
            value={gramsPerPiece}
            onChange={(e) => setGramsPerPiece(e.target.value)}
            placeholder="Grams / piece"
            style={styles.inputCompact}
          />
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))",
            gap: 8,
          }}
        >
          <input
            value={macros.kcal}
            onChange={(e) => setMacros({ ...macros, kcal: e.target.value })}
            placeholder="kcal/100g"
            style={styles.inputCompact}
          />
          <input
            value={macros.proteinG}
            onChange={(e) => setMacros({ ...macros, proteinG: e.target.value })}
            placeholder="protein g"
            style={styles.inputCompact}
          />
          <input
            value={macros.fatG}
            onChange={(e) => setMacros({ ...macros, fatG: e.target.value })}
            placeholder="fat g"
            style={styles.inputCompact}
          />
          <input
            value={macros.carbG}
            onChange={(e) => setMacros({ ...macros, carbG: e.target.value })}
            placeholder="carb g"
            style={styles.inputCompact}
          />
        </div>
        {formError && <div style={styles.errorInline}>{formError}</div>}
        <button type="button" onClick={add} disabled={!name.trim()}>
          Add custom ingredient
        </button>
      </div>

      {sorted.length === 0 ? (
        <div style={styles.helpText}>No custom ingredients yet.</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {sorted.map((item) => (
            <div key={item.id} style={styles.pantryRow}>
              <span style={{ minWidth: 0 }}>
                <span style={{ fontWeight: 700 }}>{item.name}</span>
                {item.per100g ? (
                  <span style={{ ...styles.textMuted, marginLeft: 6, fontSize: 12 }}>
                    {item.per100g.kcal} kcal / 100g
                  </span>
                ) : (
                  <span style={{ ...styles.textMuted, marginLeft: 6, fontSize: 12 }}>
                    no nutrition yet
                  </span>
                )}
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => onDelete(item.id)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
