export type MarkCompleteCheckboxProps = {
  checked: boolean;
  onChange: (completed: boolean) => void;
  id?: string;
};

export function MarkCompleteCheckbox({ checked, onChange, id }: MarkCompleteCheckboxProps) {
  const inputId = id ?? "school-work-complete";
  return (
    <label
      htmlFor={inputId}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontWeight: 650,
        fontSize: 14,
        cursor: "pointer",
      }}
    >
      <input
        id={inputId}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      Marked complete
    </label>
  );
}
