export const IconBase = ({ children, className, size = 20 }) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const DashboardIcon = ({ className }) => (
  <IconBase className={className}>
    <rect x="3" y="3" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.6" />
    <rect x="13" y="3" width="8" height="5" rx="2" stroke="currentColor" strokeWidth="1.6" />
    <rect x="13" y="10" width="8" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" />
    <rect x="3" y="13" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.6" />
  </IconBase>
);

export const LayersIcon = ({ className }) => (
  <IconBase className={className}>
    <path
      d="M4 7.5L12 3l8 4.5-8 4.5-8-4.5Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M4 12.5l8 4.5 8-4.5"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M4 16.8l8 4.2 8-4.2"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      opacity="0.6"
    />
  </IconBase>
);

export const RecordsIcon = ({ className }) => (
  <IconBase className={className}>
    <rect x="4" y="3" width="16" height="18" rx="3" stroke="currentColor" strokeWidth="1.6" />
    <path d="M8 8h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M8 12h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M8 16h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </IconBase>
);

export const SwapIcon = ({ className }) => (
  <IconBase className={className}>
    <path
      d="M7 7h10l-3-3"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M17 17H7l3 3"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </IconBase>
);

export const ClientIcon = ({ className }) => (
  <IconBase className={className}>
    <circle cx="8.5" cy="9" r="3" stroke="currentColor" strokeWidth="1.6" />
    <path
      d="M4 19c.6-2.4 2.8-4 5-4s4.4 1.6 5 4"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <path
      d="M15.5 8.5h4"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <path
      d="M15.5 12.5h4"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </IconBase>
);

export const SuppliersIcon = ({ className }) => (
  <IconBase className={className}>
    <path
      d="M4 12h16l-2.5-6.5H6.5L4 12Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path d="M6 12v6h12v-6" stroke="currentColor" strokeWidth="1.6" />
    <path d="M9 18v-4h6v4" stroke="currentColor" strokeWidth="1.6" />
  </IconBase>
);

export const PurchaseOrderIcon = ({ className }) => (
  <IconBase className={className}>
    <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.6" />
    <path d="M7 9h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M7 13h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M7 17h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </IconBase>
);

export const ReportIcon = ({ className }) => (
  <IconBase className={className}>
    <path
      d="M4 19V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <path d="M8 13h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M8 9h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M8 17h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </IconBase>
);

export const SettingsIcon = ({ className }) => (
  <IconBase className={className}>
    <path
      d="M12 7.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <path
      d="M4 12h2.2M17.8 12H20M6.5 6.5l1.6 1.6M15.9 15.9l1.6 1.6M6.5 17.5l1.6-1.6M15.9 8.1l1.6-1.6"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </IconBase>
);

export const LogoutIcon = ({ className }) => (
  <IconBase className={className}>
    <path
      d="M5 6a2 2 0 0 1 2-2h4"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <path
      d="M5 18a2 2 0 0 0 2 2h4"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <path
      d="M14 8l4 4-4 4"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M8 12h10"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </IconBase>
);

export const SearchIcon = ({ className }) => (
  <IconBase className={className}>
    <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.6" />
    <path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </IconBase>
);

export const BellIcon = ({ className }) => (
  <IconBase className={className}>
    <path
      d="M6.5 9a5.5 5.5 0 0 1 11 0v4.2l1.6 2.3H4.9l1.6-2.3V9Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path d="M9.5 18a2.5 2.5 0 0 0 5 0" stroke="currentColor" strokeWidth="1.6" />
  </IconBase>
);

export const PlusIcon = ({ className }) => (
  <IconBase className={className}>
    <path d="M12 5v14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </IconBase>
);

export const BoltIcon = ({ className }) => (
  <IconBase className={className}>
    <path
      d="M13 2 5 13h6l-1 9 8-11h-6l1-9Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  </IconBase>
);

export const WarningIcon = ({ className }) => (
  <IconBase className={className}>
    <path
      d="M12 3 3 19h18L12 3Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path d="M12 9v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <circle cx="12" cy="17" r="1" fill="currentColor" />
  </IconBase>
);

export const CheckIcon = ({ className }) => (
  <IconBase className={className}>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
    <path d="M8 12.5l2.4 2.4L16 9.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </IconBase>
);

export const TruckIcon = ({ className }) => (
  <IconBase className={className}>
    <path
      d="M4 7h10v7h-1.5"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <path
      d="M14 9h3l3 3v2h-2"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <circle cx="8" cy="17" r="2" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="18" cy="17" r="2" stroke="currentColor" strokeWidth="1.6" />
  </IconBase>
);

export const UserIcon = ({ className }) => (
  <IconBase className={className}>
    <circle cx="12" cy="8.5" r="3.5" stroke="currentColor" strokeWidth="1.6" />
    <path d="M5 19c1.2-3 4-4.5 7-4.5s5.8 1.5 7 4.5" stroke="currentColor" strokeWidth="1.6" />
  </IconBase>
);

export const ChevronDownIcon = ({ className }) => (
  <IconBase className={className}>
    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </IconBase>
);

export const DownloadIcon = ({ className }) => (
  <IconBase className={className}>
    <path
      d="M12 4v10"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <path
      d="M8 10l4 4 4-4"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M5 18h14"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </IconBase>
);

export const BuildingIcon = ({ className }) => (
  <IconBase className={className}>
    <rect x="4" y="3" width="16" height="18" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
    <path d="M8 7h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M14 7h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M8 11h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M14 11h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M10 21v-4h4v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </IconBase>
);

export const EditIcon = ({ className }) => (
  <IconBase className={className}>
    <path
      d="M4 20h4l10.5-10.5a1.6 1.6 0 0 0 0-2.3l-1.7-1.7a1.6 1.6 0 0 0-2.3 0L4 16v4Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path d="M12.5 7.5l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </IconBase>
);

export const MoreVerticalIcon = ({ className }) => (
  <IconBase className={className}>
    <circle cx="12" cy="5" r="1.6" fill="currentColor" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    <circle cx="12" cy="19" r="1.6" fill="currentColor" />
  </IconBase>
);

export const FileTextIcon = ({ className }) => (
  <IconBase className={className}>
    <path
      d="M7 3h7l4 4v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path d="M14 3v4h4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M8 12h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M8 16h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </IconBase>
);

export const ClockIcon = ({ className }) => (
  <IconBase className={className}>
    <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
    <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </IconBase>
);

export const ShieldCheckIcon = ({ className }) => (
  <IconBase className={className}>
    <path
      d="M12 3l7 3v5c0 5.2-3.2 9-7 10-3.8-1-7-4.8-7-10V6l7-3Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path d="M9 12.5l2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </IconBase>
);
