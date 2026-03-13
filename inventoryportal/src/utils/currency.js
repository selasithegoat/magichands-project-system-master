import { useEffect, useState } from "react";
import { fetchInventory } from "./inventoryApi";

const DEFAULT_CURRENCY = "GHS";
const CURRENCY_STORAGE_KEY = "inventory-currency";

export const getCurrencyPrefix = (currencyCode) => {
  const normalized = String(currencyCode || "").toUpperCase();
  if (normalized === "USD") return "$";
  if (normalized) return normalized;
  return DEFAULT_CURRENCY;
};

export const formatCurrencyPlaceholder = (currencyCode) => {
  const prefix = getCurrencyPrefix(currencyCode);
  return prefix === "$" ? "$0.00" : `${prefix} 0.00`;
};

export const formatCurrencyValue = (value, currencyCode) => {
  if (value === null || value === undefined || value === "") return "";
  const prefix = getCurrencyPrefix(currencyCode);
  const raw = String(value).trim();
  const hasLetters = /[a-zA-Z]/.test(raw);
  if (hasLetters) {
    const stripped = raw.replace(/^(\$|GHS|USD)\s*/i, "").trim();
    return prefix === "$" ? `${prefix}${stripped}` : `${prefix} ${stripped}`;
  }
  const cleaned = raw.replace(/[^0-9.,-]/g, "");
  const numeric = Number.parseFloat(cleaned.replace(/,/g, ""));

  if (!Number.isFinite(numeric)) {
    const stripped = raw.replace(/^(\$|GHS|USD)\s*/i, "").trim();
    return prefix === "$" ? `${prefix}${stripped}` : `${prefix} ${stripped}`;
  }

  const formatted = numeric.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return prefix === "$" ? `${prefix}${formatted}` : `${prefix} ${formatted}`;
};

export const parseCurrencyValue = (value) => {
  if (value === null || value === undefined || value === "") return 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  const cleaned = raw.replace(/[^0-9.,-]/g, "");
  const numeric = Number.parseFloat(cleaned.replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
};

export const useInventoryCurrency = () => {
  const [currency, setCurrency] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_CURRENCY;
    return window.localStorage.getItem(CURRENCY_STORAGE_KEY) || DEFAULT_CURRENCY;
  });

  useEffect(() => {
    let isMounted = true;

    const loadCurrency = async () => {
      try {
        const settings = await fetchInventory("/api/inventory/settings");
        const nextCurrency =
          String(settings?.currency || "").toUpperCase() || DEFAULT_CURRENCY;

        if (!isMounted) return;
        setCurrency(nextCurrency);

        if (typeof window !== "undefined") {
          window.localStorage.setItem(CURRENCY_STORAGE_KEY, nextCurrency);
        }
      } catch {
        // Keep last known currency.
      }
    };

    loadCurrency();
    return () => {
      isMounted = false;
    };
  }, []);

  return currency;
};
