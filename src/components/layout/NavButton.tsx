import type { ReactNode } from "react";
import { styles } from "../../ui/appStyles";

export function NavButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        ...styles.navBtn,
        ...(active ? styles.navBtnActive : {}),
      }}
    >
      {children}
    </button>
  );
}
