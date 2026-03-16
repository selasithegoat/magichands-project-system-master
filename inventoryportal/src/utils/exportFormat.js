import { useEffect, useState } from "react";
import { fetchInventory } from "./inventoryApi";

const DEFAULT_EXPORT_FORMAT = "CSV";
const EXPORT_FORMAT_STORAGE_KEY = "inventory-export-format";

export const normalizeExportFormat = (value) => {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  if (normalized === "PDF") return "PDF";
  if (normalized === "XLSX") return "XLSX";
  return "CSV";
};

export const getExportExtension = (format) => {
  const normalized = normalizeExportFormat(format);
  if (normalized === "PDF") return "pdf";
  if (normalized === "XLSX") return "xlsx";
  return "csv";
};

export const getStoredExportFormat = () => {
  if (typeof window === "undefined") return DEFAULT_EXPORT_FORMAT;
  return (
    normalizeExportFormat(
      window.localStorage.getItem(EXPORT_FORMAT_STORAGE_KEY),
    ) || DEFAULT_EXPORT_FORMAT
  );
};

export const useInventoryExportFormat = () => {
  const [format, setFormat] = useState(() => getStoredExportFormat());

  useEffect(() => {
    let isMounted = true;

    const loadFormat = async () => {
      try {
        const settings = await fetchInventory("/api/inventory/settings");
        if (!isMounted) return;
        const nextFormat = normalizeExportFormat(settings?.defaultExportFormat);
        setFormat(nextFormat);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(EXPORT_FORMAT_STORAGE_KEY, nextFormat);
        }
      } catch {
        // Keep local preference.
      }
    };

    loadFormat();

    const handleExportFormatChange = (event) => {
      const next = normalizeExportFormat(event?.detail?.format);
      if (!next) return;
      setFormat(next);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(EXPORT_FORMAT_STORAGE_KEY, next);
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener(
        "inventory:export-format-changed",
        handleExportFormatChange,
      );
    }

    return () => {
      isMounted = false;
      if (typeof window !== "undefined") {
        window.removeEventListener(
          "inventory:export-format-changed",
          handleExportFormatChange,
        );
      }
    };
  }, []);

  return { format };
};

export default DEFAULT_EXPORT_FORMAT;
