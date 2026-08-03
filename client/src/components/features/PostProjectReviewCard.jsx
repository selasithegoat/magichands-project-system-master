import React, { useState } from "react";
import "./PostProjectReviewCard.css";

const formatMetric = (value, fallback = "Not recorded") =>
  value === null || value === undefined ? fallback : value;

const PostProjectReviewCard = ({ review }) => {
  const [expanded, setExpanded] = useState(true);
  if (!review) return null;
  const metrics = review.metrics || {};
  const ratingClass = String(review.rating || "").toLowerCase().replaceAll(" ", "-");

  return (
    <section className={`post-review-card ${ratingClass} ${expanded ? "is-expanded" : "is-collapsed"}`}>
      <button type="button" className="post-review-heading" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
        <span className="post-review-title"><small>{review.phase === "final" ? "Final closeout" : "Preliminary closeout"}</small><strong>Post-Project Review</strong>{!expanded && <em>Expand review</em>}</span>
        <span className="post-review-heading-actions">
          <span className="post-review-score"><strong>{review.score}</strong>/100</span>
          <span className="post-review-toggle" aria-hidden="true">{expanded ? "−" : "+"}</span>
        </span>
      </button>
      {expanded && (
        <div className="post-review-body">
          <div className="post-review-rating">{review.rating}</div>
          <div className="post-review-metrics">
            <span><strong>{formatMetric(metrics.durationDays)}</strong> days</span>
            <span><strong>{metrics.deliveredOnTime === null ? "—" : metrics.deliveredOnTime ? "Yes" : "No"}</strong> on time</span>
            <span><strong>{formatMetric(metrics.departmentAcknowledgement, 100)}%</strong> acknowledged</span>
            <span><strong>{formatMetric(metrics.revisions, 0)}</strong> revisions</span>
            <span><strong>{formatMetric(metrics.challenges, 0)}</strong> challenges</span>
            <span><strong>{formatMetric(metrics.productionRisks, 0)}</strong> risks logged</span>
          </div>
          {review.strengths?.length > 0 && (
            <div className="post-review-list strengths"><strong>What went well</strong>{review.strengths.map((item, index) => <p key={`${item}-${index}`}>✓ {item}</p>)}</div>
          )}
          <div className="post-review-list lessons"><strong>Lessons and follow-up</strong>{(review.lessons || []).map((item, index) => <p key={`${item}-${index}`}>• {item}</p>)}</div>
          {review.phase !== "final" && <small className="post-review-note">This review will finalize after feedback or project completion.</small>}
        </div>
      )}
    </section>
  );
};

export default PostProjectReviewCard;
