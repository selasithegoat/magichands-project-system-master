import { WarningIcon, CheckIcon } from "../icons/Icons";

const variantConfig = {
  warning: {
    className: "alert warning",
    title: "Attention",
    Icon: WarningIcon,
  },
  success: {
    className: "alert success",
    title: "All clear",
    Icon: CheckIcon,
  },
};

const AlertBanner = ({
  variant = "warning",
  title,
  description,
  actions,
}) => {
  const config = variantConfig[variant] || variantConfig.warning;
  const TitleIcon = config.Icon;

  return (
    <div className={config.className} role="status">
      <div className="alert-icon">
        <TitleIcon />
      </div>
      <div className="alert-content">
        <strong>{title || config.title}</strong>
        <span>{description}</span>
      </div>
      {actions ? <div className="alert-actions">{actions}</div> : null}
    </div>
  );
};

export default AlertBanner;
