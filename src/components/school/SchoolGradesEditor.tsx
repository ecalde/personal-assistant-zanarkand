import { useEffect, useMemo, useState } from "react";
import type { SchoolCourse, SchoolGradeCategory, SchoolGradedItem, SchoolReminder } from "../../core/model";
import type { CreateSchoolGradedItemInput } from "../../core/school";
import {
  computeCourseGradeWhatIf,
  formatRemainingItemCaption,
  formatSchoolGradePercent,
  type SchoolGradeItemBreakdown,
} from "../../core/schoolGrades";
import { styles } from "../../ui/appStyles";
import { SchoolGradeWhatIfPanel } from "./SchoolGradeWhatIfPanel";
import { SchoolGradeCategoriesFields } from "./SchoolGradeCategoriesFields";
import {
  gradeCategoriesFromFormRows,
  schoolCourseFormFromCourse,
  validateGradeCategoryFormRows,
  type SchoolGradeCategoryFormRow,
} from "./schoolCourseFormState";
import {
  emptySchoolGradedItemFormState,
  schoolGradedItemFormFromItem,
  schoolGradedItemPayloadFromForm,
  validateSchoolGradedItemForm,
  type SchoolGradedItemFormState,
} from "./schoolGradedItemFormState";

export type SchoolGradesEditorProps = {
  course: SchoolCourse;
  reminders: SchoolReminder[];
  items: SchoolGradedItem[];
  compact?: boolean;
  hideHeader?: boolean;
  addRequestId?: number;
  editingCategories?: boolean;
  listMaxHeight?: number | string;
  onAddItem: (input: CreateSchoolGradedItemInput) => void;
  onUpdateItem: (itemId: string, input: CreateSchoolGradedItemInput) => void;
  onDeleteItem: (itemId: string) => void;
  onSaveCategories?: (categories: SchoolGradeCategory[]) => void;
  onCancelCategoryEdit?: () => void;
};

function scoreLabel(item: SchoolGradedItem): string {
  if (item.maxScore !== undefined) return `${item.score ?? "—"}/${item.maxScore}`;
  if (item.score !== undefined) return String(item.score);
  return "ungraded";
}

function remainingCaption(
  breakdown: SchoolGradeItemBreakdown | undefined,
  neededAverage?: number
): string {
  if (!breakdown) return "";
  return formatRemainingItemCaption(breakdown, neededAverage);
}

export function SchoolGradesEditor({
  course,
  reminders,
  items,
  compact = false,
  hideHeader = false,
  addRequestId,
  editingCategories = false,
  listMaxHeight,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onSaveCategories,
  onCancelCategoryEdit,
}: SchoolGradesEditorProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SchoolGradedItemFormState>(emptySchoolGradedItemFormState());
  const [formError, setFormError] = useState<string | null>(null);
  const [categoryRows, setCategoryRows] = useState<SchoolGradeCategoryFormRow[]>(() =>
    schoolCourseFormFromCourse(course).gradeCategories
  );
  const [categoryError, setCategoryError] = useState<string | null>(null);

  useEffect(() => {
    if (!addRequestId) return;
    setForm(emptySchoolGradedItemFormState());
    setEditingId(null);
    setFormError(null);
    setShowForm(true);
  }, [addRequestId]);

  useEffect(() => {
    if (editingCategories) {
      setCategoryRows(schoolCourseFormFromCourse(course).gradeCategories);
      setCategoryError(null);
    }
  }, [editingCategories, course]);

  const snapshot = useMemo(() => computeCourseGradeWhatIf(course, items), [course, items]);
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const breakdownById = useMemo(() => {
    const map = new Map<string, SchoolGradeItemBreakdown>();
    for (const category of snapshot.categories) {
      for (const item of category.items) map.set(item.itemId, item);
    }
    for (const item of snapshot.uncategorized) map.set(item.itemId, item);
    return map;
  }, [snapshot]);

  function reset() {
    setForm(emptySchoolGradedItemFormState());
    setEditingId(null);
    setFormError(null);
    setShowForm(false);
  }

  function submit() {
    const error = validateSchoolGradedItemForm(form);
    if (error) {
      setFormError(error);
      return;
    }
    const payload = schoolGradedItemPayloadFromForm(form, course.id);
    if (editingId) onUpdateItem(editingId, payload);
    else onAddItem(payload);
    reset();
  }

  function startEdit(item: SchoolGradedItem) {
    setForm(schoolGradedItemFormFromItem(item));
    setEditingId(item.id);
    setFormError(null);
    setShowForm(true);
  }

  function saveCategories() {
    const error = validateGradeCategoryFormRows(categoryRows);
    if (error) {
      setCategoryError(error);
      return;
    }
    onSaveCategories?.(gradeCategoriesFromFormRows(categoryRows));
  }

  return (
    <div style={{ display: "grid", gap: compact ? 6 : 8 }}>
      {hideHeader ? null : (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Grades</h3>
          {!showForm ? (
            <button
              type="button"
              onClick={() => {
                setForm(emptySchoolGradedItemFormState());
                setEditingId(null);
                setFormError(null);
                setShowForm(true);
              }}
            >
              Add graded item
            </button>
          ) : null}
        </div>
      )}
      <SchoolGradeWhatIfPanel snapshot={snapshot} compact={compact} />
      {editingCategories ? (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 13 }}>Grade categories</div>
          <SchoolGradeCategoriesFields
            rows={categoryRows}
            error={categoryError}
            onChange={(rows) => {
              setCategoryRows(rows);
              setCategoryError(null);
            }}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={saveCategories}>
              Save categories
            </button>
            <button type="button" onClick={() => onCancelCategoryEdit?.()}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {showForm ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          style={{ display: "grid", gap: compact ? 6 : 8 }}
        >
          {formError ? (
            <div style={styles.errorBox} role="alert">
              {formError}
            </div>
          ) : null}
          <input
            value={form.name}
            placeholder="Item name"
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            style={styles.inputFluid}
          />
          <select
            value={form.categoryId}
            onChange={(event) => setForm({ ...form, categoryId: event.target.value })}
            style={styles.inputFluid}
          >
            <option value="">No category</option>
            {course.gradeCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <select
            value={form.reminderId}
            onChange={(event) => setForm({ ...form, reminderId: event.target.value })}
            style={styles.inputFluid}
          >
            <option value="">No linked reminder</option>
            {reminders.map((reminder) => (
              <option key={reminder.id} value={reminder.id}>
                {reminder.title}
              </option>
            ))}
          </select>
          <div
            style={{
              display: "grid",
              gap: 6,
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            }}
          >
            <input
              type="date"
              value={form.dueDate}
              onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
              style={styles.inputFluid}
            />
            <input
              type="time"
              value={form.dueTime}
              onChange={(event) => setForm({ ...form, dueTime: event.target.value })}
              style={styles.inputFluid}
            />
            <input
              value={form.maxScore}
              placeholder="Max score"
              onChange={(event) => setForm({ ...form, maxScore: event.target.value })}
              style={styles.inputFluid}
            />
            <input
              value={form.score}
              placeholder="Score"
              onChange={(event) => setForm({ ...form, score: event.target.value })}
              style={styles.inputFluid}
            />
          </div>
          <label>
            <input
              type="checkbox"
              checked={form.extraCredit}
              onChange={(event) => setForm({ ...form, extraCredit: event.target.checked })}
            />{" "}
            Extra credit
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit">{editingId ? "Save item" : "Add item"}</button>
            <button type="button" onClick={reset}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}
      {course.gradeCategories.length === 0 && items.length === 0 && !showForm && !editingCategories ? (
        <p style={{ ...styles.helpText, margin: 0 }}>
          No grade categories yet. Paste a Canvas Group / Weight table, or tap Categories to add
          weights by hand.
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gap: compact ? 8 : 12,
            maxHeight: compact ? listMaxHeight ?? "min(70vh, 640px)" : undefined,
            overflow: compact ? "auto" : undefined,
          }}
        >
          {snapshot.categories.map((category) => (
            <section key={category.categoryId} style={{ display: "grid", gap: compact ? 4 : 6 }}>
              <h4 style={{ margin: 0, fontSize: 13, fontWeight: 800 }}>
                {category.name} {category.weightPercent}%
                {category.extraCredit ? " · extra credit" : ""}
                {category.currentPercent !== undefined
                  ? ` · ${formatSchoolGradePercent(category.currentPercent)} graded`
                  : ""}
                {category.remainingCount > 0 ? ` · ${category.remainingCount} remaining` : ""}
              </h4>
              {category.items.length === 0 ? (
                compact ? null : (
                  <p style={{ ...styles.helpText, margin: 0 }}>No items in this category.</p>
                )
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: compact ? 4 : 8 }}>
                  {category.items.map((row) => {
                    const item = itemsById.get(row.itemId);
                    if (!item) return null;
                    const caption = remainingCaption(
                      breakdownById.get(item.id),
                      snapshot.neededRemainingAverageForA
                    );
                    return (
                      <GradeItemRow
                        key={item.id}
                        item={item}
                        caption={compact ? "" : caption}
                        compact={compact}
                        onEdit={() => startEdit(item)}
                        onDelete={() => onDeleteItem(item.id)}
                      />
                    );
                  })}
                </ul>
              )}
            </section>
          ))}
          {snapshot.uncategorized.length > 0 ? (
            <section style={{ display: "grid", gap: 6 }}>
              <h4 style={{ margin: 0, fontSize: 13, fontWeight: 800 }}>Uncategorized</h4>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: compact ? 4 : 8 }}>
                {snapshot.uncategorized.map((row) => {
                  const item = itemsById.get(row.itemId);
                  if (!item) return null;
                  return (
                    <GradeItemRow
                      key={item.id}
                      item={item}
                      caption={compact ? "" : "Not in a weighted category"}
                      compact={compact}
                      onEdit={() => startEdit(item)}
                      onDelete={() => onDeleteItem(item.id)}
                    />
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

function GradeItemRow({
  item,
  caption,
  compact = false,
  onEdit,
  onDelete,
}: {
  item: SchoolGradedItem;
  caption: string;
  compact?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li
      style={
        compact
          ? {
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto",
              gap: 8,
              alignItems: "center",
              padding: "6px 8px",
              borderRadius: 8,
              background: "var(--aether-surface-sunken, #fafafa)",
            }
          : { display: "grid", gap: 4 }
      }
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: compact ? 13 : undefined,
            overflow: compact ? "hidden" : undefined,
            textOverflow: compact ? "ellipsis" : undefined,
            whiteSpace: compact ? "nowrap" : undefined,
          }}
        >
          {item.name}
          {` · ${scoreLabel(item)}`}
          {item.extraCredit ? " · extra credit" : ""}
        </div>
        {caption ? <div style={styles.helpText}>{caption}</div> : null}
      </div>
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        <button type="button" style={compact ? styles.ghostBtn : undefined} onClick={onEdit}>
          Edit
        </button>
        <button type="button" style={compact ? styles.ghostBtn : undefined} onClick={onDelete}>
          Delete
        </button>
      </div>
    </li>
  );
}
