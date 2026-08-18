import type { CSSProperties, ReactNode, Ref } from "react";
import { styles } from "../../ui/appStyles";

export function NavButton({
  active,
  onClick,
  children,
  style,
  buttonRef,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  style?: CSSProperties;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      style={{
        ...styles.navBtn,
        ...(active ? styles.navBtnActive : {}),
        ...style,
      }}
    >
      {children}
    </button>
  );
}
