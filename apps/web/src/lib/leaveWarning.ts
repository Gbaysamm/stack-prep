import { useEffect } from "react";

/**
 * While something is in progress (a lesson playing, a run, a check-up, the after-lesson page),
 * closing the tab or reloading asks first (founder, 13 Nov 2026: a slip of the hand should not
 * lose the student's place). The browser shows its own "Leave site?" box; it cannot be worded.
 */
export function useLeaveWarning(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);
}
