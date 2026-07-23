import { useEffect, useState } from "react";
import { MUTATION_FEEDBACK_EVENT } from "../../utils/mutationFeedback";
import "./MutationFeedback.css";

const MutationFeedback = () => {
  const [activities, setActivities] = useState([]);

  useEffect(() => {
    const handleFeedback = (event) => {
      const detail = event?.detail || {};
      if (!detail.id) return;

      setActivities((current) => {
        if (detail.phase === "finish") {
          return current.filter((activity) => activity.id !== detail.id);
        }
        if (current.some((activity) => activity.id === detail.id)) {
          return current;
        }
        return [...current, { id: detail.id, label: detail.label }];
      });
    };

    window.addEventListener(MUTATION_FEEDBACK_EVENT, handleFeedback);
    return () =>
      window.removeEventListener(MUTATION_FEEDBACK_EVENT, handleFeedback);
  }, []);

  if (activities.length === 0) return null;

  const activeLabel =
    activities[activities.length - 1]?.label || "Processing…";

  return (
    <div
      className="mh-mutation-feedback"
      role="status"
      aria-live="polite"
      aria-label={activeLabel}
    >
      <span className="mh-mutation-feedback-spinner" aria-hidden="true" />
      <span>{activeLabel}</span>
    </div>
  );
};

export default MutationFeedback;
