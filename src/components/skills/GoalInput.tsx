import { useState } from "react";
import { styles } from "../../ui/appStyles";

export type GoalInputProps = {
  label: string;
  defaultValue: string;
  hint: string;
  onCommit: (value: string) => void;
};

export function GoalInput({ label, defaultValue, hint, onCommit }: GoalInputProps) {
  const [val, setVal] = useState(defaultValue);

  return (
    <label style={styles.label}>
      {label}
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => val.trim() && onCommit(val)}
        placeholder={hint}
        style={styles.input}
      />
      <div style={{ fontSize: 12, opacity: 0.7 }}>{hint}</div>
    </label>
  );
}
