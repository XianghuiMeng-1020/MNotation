import { useEffect, useRef } from "react";

export function useAttemptTracker(unitKey: string) {
  const startRef = useRef(Date.now());
  useEffect(() => {
    startRef.current = Date.now();
  }, [unitKey]);

  return {
    finalize() {
      const answerAt = Date.now();
      return {
        display_at_epoch_ms: startRef.current,
        answer_at_epoch_ms: answerAt,
        active_ms: answerAt - startRef.current,
        hidden_ms: 0,
        idle_ms: 0,
        hidden_count: 0,
        blur_count: 0,
        events: []
      };
    }
  };
}
