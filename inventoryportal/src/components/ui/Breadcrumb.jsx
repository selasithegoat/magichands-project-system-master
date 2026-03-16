import { getBreadcrumbText } from "../../utils/breadcrumbs";

const Breadcrumb = ({ pageKey, section, page, className = "" }) => {
  const fallback = [section, page].filter(Boolean).join(" / ");
  const text = pageKey ? getBreadcrumbText(pageKey, fallback) : fallback;

  return <div className={`breadcrumb ${className}`.trim()}>{text}</div>;
};

export default Breadcrumb;
