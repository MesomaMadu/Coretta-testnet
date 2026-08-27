const STORAGE_KEY = "coretta_developer_diagnostics";
const CHANGE_EVENT = "coretta-developer-diagnostics-changed";

export function getDeveloperDiagnosticsEnabled(): boolean {
  return typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY) === "true";
}

export function setDeveloperDiagnosticsEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, String(enabled));
  window.dispatchEvent(new CustomEvent<boolean>(CHANGE_EVENT, { detail: enabled }));
}

export function subscribeDeveloperDiagnostics(listener: (enabled: boolean) => void) {
  if (typeof window === "undefined") return () => undefined;

  const onChange = (event: Event) => {
    if (event instanceof CustomEvent && typeof event.detail === "boolean") {
      listener(event.detail);
      return;
    }
    listener(getDeveloperDiagnosticsEnabled());
  };

  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
