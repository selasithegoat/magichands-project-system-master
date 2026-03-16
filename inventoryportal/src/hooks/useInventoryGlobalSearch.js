import { useEffect } from "react";

const useInventoryGlobalSearch = (onSearch) => {
  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleSearch = (event) => {
      const term = String(event?.detail?.term || "");
      onSearch?.(term);
    };

    window.addEventListener("inventory:search", handleSearch);
    return () => window.removeEventListener("inventory:search", handleSearch);
  }, [onSearch]);
};

export default useInventoryGlobalSearch;
