import { useEffect, useState } from "react";
import { fetchInventory } from "./inventoryApi";

const DEFAULT_CURRENCY = "GHS";
const DEFAULT_CURRENCY_RATE = 1;
const CURRENCY_STORAGE_KEY = "inventory-currency";
const CURRENCY_RATE_STORAGE_KEY = "inventory-currency-rate";

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

export const formatCurrencyValue = (
  value,
  currencyCode,
  currencyRate = DEFAULT_CURRENCY_RATE,
  baseCurrency = DEFAULT_CURRENCY,
) => {
  if (value === null || value === undefined || value === "") return "";
  const normalizedCurrency = String(currencyCode || DEFAULT_CURRENCY).toUpperCase();
  const normalizedBase = String(baseCurrency || DEFAULT_CURRENCY).toUpperCase();
  const prefix = getCurrencyPrefix(normalizedCurrency);
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

  let converted = numeric;
  const rateValue = Number(currencyRate);
  if (
    normalizedCurrency !== normalizedBase &&
    Number.isFinite(rateValue) &&
    rateValue > 0
  ) {
    if (normalizedBase === "GHS" && normalizedCurrency === "USD") {
      converted = numeric / rateValue;
    } else if (normalizedBase === "USD" && normalizedCurrency === "GHS") {
      converted = numeric * rateValue;
    }
  }

  const formatted = converted.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return prefix === "$" ? `${prefix}${formatted}` : `${prefix} ${formatted}`;
};

export const formatCurrencyPair = (
  value,
  currencyCode,
  currencyRate = DEFAULT_CURRENCY_RATE,
  baseCurrency = DEFAULT_CURRENCY,
) => {
  const displayValue = formatCurrencyValue(
    value,
    currencyCode,
    currencyRate,
    baseCurrency,
  );
  const otherCurrency = String(currencyCode || DEFAULT_CURRENCY).toUpperCase() ===
    "USD"
    ? "GHS"
    : "USD";
  const alternateValue = formatCurrencyValue(
    value,
    otherCurrency,
    currencyRate,
    baseCurrency,
  );

  return { displayValue, alternateValue, otherCurrency };
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
  const [rate, setRate] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_CURRENCY_RATE;
    const stored = Number(window.localStorage.getItem(CURRENCY_RATE_STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_CURRENCY_RATE;
  });

  useEffect(() => {
    let isMounted = true;

    const loadCurrency = async () => {
      try {
        const settings = await fetchInventory("/api/inventory/settings");
        const nextCurrency =
          String(settings?.currency || "").toUpperCase() || DEFAULT_CURRENCY;
        const nextRate = Number(settings?.currencyRate);
        const normalizedRate =
          Number.isFinite(nextRate) && nextRate > 0
            ? nextRate
            : DEFAULT_CURRENCY_RATE;

        if (!isMounted) return;
        setCurrency(nextCurrency);
        setRate(normalizedRate);

        if (typeof window !== "undefined") {
          window.localStorage.setItem(CURRENCY_STORAGE_KEY, nextCurrency);
          window.localStorage.setItem(
            CURRENCY_RATE_STORAGE_KEY,
            String(normalizedRate),
          );
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

  return { currency, rate };
};
