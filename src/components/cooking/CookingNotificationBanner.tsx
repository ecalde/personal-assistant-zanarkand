import { useCallback, useState } from "react";
import {
  resolveCookingNotificationPermission,
  shouldPromptForCookingNotifications,
  type CookingNotificationPermissionState,
} from "../../core/cookingNotifications";
import {
  loadCookingNotificationPromptDismissed,
  saveCookingNotificationPromptDismissed,
} from "../../core/cookingNotificationStorage";
import {
  readNotificationCapabilities,
  requestNotificationPermission,
} from "../../lib/webNotifications";
import { styles } from "../../ui/appStyles";

function readPermissionState(): CookingNotificationPermissionState {
  const caps = readNotificationCapabilities();
  return resolveCookingNotificationPermission(caps.notificationApi, caps.permission);
}

export function CookingNotificationBanner() {
  const [permission, setPermission] = useState(readPermissionState);
  const [dismissed, setDismissed] = useState(loadCookingNotificationPromptDismissed);
  const [requesting, setRequesting] = useState(false);

  const enable = useCallback(async () => {
    setRequesting(true);
    const result = await requestNotificationPermission();
    setPermission(result === "unsupported" ? "unsupported" : result);
    setRequesting(false);
  }, []);

  const dismiss = useCallback(() => {
    saveCookingNotificationPromptDismissed(true);
    setDismissed(true);
  }, []);

  if (!shouldPromptForCookingNotifications(permission, dismissed)) return null;

  return (
    <div style={styles.notificationPrompt} role="status">
      <div>
        <strong>Enable cooking notifications</strong>
        <div style={{ ...styles.textMuted, fontSize: 13, marginTop: 4 }}>
          Get an alert when a timer finishes or a planned cook is due, even if this tab is in
          the background. Daily Focus still covers this if you skip.
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={() => void enable()} disabled={requesting}>
          {requesting ? "Asking…" : "Enable alerts"}
        </button>
        <button type="button" onClick={dismiss}>
          Not now
        </button>
      </div>
    </div>
  );
}
