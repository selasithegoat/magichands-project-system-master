import "./PagePlaceholder.css";

const PagePlaceholder = ({ title, description }) => (
  <section className="page-placeholder">
    <div>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  </section>
);

PagePlaceholder.defaultProps = {
  description: "This section is ready for its next module build-out.",
};

export default PagePlaceholder;
