const KpiCard = ({ label, value, hint, tone = "neutral" }) => (
  <article className={`kpi-card tone-${tone}`}>
    <p>{label}</p>
    <h3>{value}</h3>
    <small>{hint}</small>
  </article>
);

export default KpiCard;
