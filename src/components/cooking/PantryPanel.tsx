import { useMemo, useState } from "react";
import type { IngredientCatalog } from "../../core/ingredientCatalog";
import { matchIngredient, normalizeIngredientName } from "../../core/ingredients";
import type { Ingredient, PantryItem } from "../../core/model";
import { styles } from "../../ui/appStyles";

export type PantryPanelProps = {
  pantry: PantryItem[];
  catalog: IngredientCatalog;
  onAdd: (input: Omit<PantryItem, "id" | "createdAtIso" | "updatedAtIso">) => void;
  onUpdate: (item: PantryItem) => void;
  onDelete: (itemId: string) => void;
  onBack: () => void;
};

function catalogIngredient(catalog: IngredientCatalog, id: string): Ingredient | undefined {
  return catalog.ingredients.find((ingredient) => ingredient.id === id);
}

export function PantryPanel({
  pantry,
  catalog,
  onAdd,
  onUpdate,
  onDelete,
  onBack,
}: PantryPanelProps) {
  const [query, setQuery] = useState("");
  const [customLabel, setCustomLabel] = useState("");

  const pantryIngredientIds = useMemo(
    () => new Set(pantry.map((item) => item.ingredientId).filter(Boolean)),
    [pantry]
  );

  const suggestions = useMemo(() => {
    const normalized = normalizeIngredientName(query);
    if (!normalized) return catalog.ingredients.slice(0, 8);
    return catalog.ingredients
      .filter((ingredient) => {
        const name = normalizeIngredientName(ingredient.canonicalName);
        return name.includes(normalized) || ingredient.canonicalName.toLowerCase().includes(query.trim().toLowerCase());
      })
      .slice(0, 8);
  }, [catalog.ingredients, query]);

  const sortedPantry = useMemo(
    () =>
      [...pantry].sort((a, b) => {
        if (a.available !== b.available) return a.available ? -1 : 1;
        return a.label.localeCompare(b.label);
      }),
    [pantry]
  );

  function addFromCatalog(ingredient: Ingredient) {
    if (pantryIngredientIds.has(ingredient.id)) {
      const existing = pantry.find((item) => item.ingredientId === ingredient.id);
      if (existing && !existing.available) {
        onUpdate({ ...existing, available: true });
      }
      setQuery("");
      return;
    }
    onAdd({
      ingredientId: ingredient.id,
      label: ingredient.canonicalName,
      available: true,
    });
    setQuery("");
  }

  function addCustom() {
    const label = customLabel.trim();
    if (!label) return;
    const match = matchIngredient(label, catalog);
    if (match && pantryIngredientIds.has(match.ingredientId)) {
      const existing = pantry.find((item) => item.ingredientId === match.ingredientId);
      if (existing && !existing.available) onUpdate({ ...existing, available: true });
      setCustomLabel("");
      return;
    }
    const duplicateLabel = pantry.some(
      (item) => normalizeIngredientName(item.label) === normalizeIngredientName(label)
    );
    if (duplicateLabel) {
      setCustomLabel("");
      return;
    }
    onAdd({
      ingredientId: match?.ingredientId,
      label,
      available: true,
    });
    setCustomLabel("");
  }

  return (
    <div style={styles.card}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <button type="button" onClick={onBack}>
          Back to recipes
        </button>
      </div>
      <div style={styles.cardTitle}>Pantry</div>
      <div style={{ ...styles.textSecondary, marginBottom: 14 }}>
        Track what you have on hand. Recipe cards show whether you can make a dish now,
        have some of it, or are missing ingredients.
      </div>

      <label style={styles.label}>
        Add from catalog
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search ingredients…"
          style={styles.input}
        />
      </label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, marginBottom: 16 }}>
        {suggestions.map((ingredient) => {
          const inPantry = pantryIngredientIds.has(ingredient.id);
          return (
            <button
              key={ingredient.id}
              type="button"
              onClick={() => addFromCatalog(ingredient)}
              disabled={inPantry}
            >
              {inPantry ? `In pantry: ${ingredient.canonicalName}` : `Add ${ingredient.canonicalName}`}
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginBottom: 16 }}>
        <input
          value={customLabel}
          onChange={(e) => setCustomLabel(e.target.value)}
          placeholder="Custom item (e.g. leftover roast chicken)"
          style={styles.inputCompact}
          onKeyDown={(e) => {
            if (e.key === "Enter") addCustom();
          }}
        />
        <button type="button" onClick={addCustom} disabled={!customLabel.trim()}>
          Add
        </button>
      </div>

      {sortedPantry.length === 0 ? (
        <div style={styles.helpText}>Pantry is empty. Add staples you usually keep around.</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {sortedPantry.map((item) => {
            const canonical = item.ingredientId
              ? catalogIngredient(catalog, item.ingredientId)?.canonicalName
              : undefined;
            return (
              <div key={item.id} style={styles.pantryRow}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <input
                    type="checkbox"
                    checked={item.available}
                    onChange={(e) => onUpdate({ ...item, available: e.target.checked })}
                  />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 700 }}>{item.label}</span>
                    {canonical && canonical !== item.label && (
                      <span style={{ ...styles.textMuted, marginLeft: 6, fontSize: 12 }}>
                        {canonical}
                      </span>
                    )}
                  </span>
                </label>
                <button type="button" onClick={() => onDelete(item.id)}>
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
