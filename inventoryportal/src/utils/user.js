export const formatUserName = (user) => {
  const firstName = String(user?.firstName || "").trim();
  const lastName = String(user?.lastName || "").trim();
  const fullName = `${firstName} ${lastName}`.trim();
  return fullName || user?.name || "Inventory User";
};
