import { useDeferredValue, useEffect, useState } from "react";
import {
  AlertCircleIcon,
  DownloadIcon,
  LayersIcon,
  SearchIcon,
} from "../../components/icons/Icons";
import Breadcrumb from "../../components/ui/Breadcrumb";
import useInventoryGlobalSearch from "../../hooks/useInventoryGlobalSearch";
import { fetchInventory } from "../../utils/inventoryApi";
import "./PriceList.css";

const formatPriceModeLabel = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "Unspecified";

  const labels = {
    single: "Single Price",
    multi_price: "Multiple Options",
    price_range: "Price Range",
    minimum_order: "Minimum Order",
    minimum_order_unit_cost: "MOQ Unit Cost",
    price_on_request: "Price on Request",
    missing_price: "Manual Pricing",
  };

  if (labels[normalized]) return labels[normalized];
  return normalized
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const formatModeClass = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");

const buildCsvValue = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

const PriceList = () => {
  const [items, setItems] = useState([]);
  const [sections, setSections] = useState([]);
  const [priceModes, setPriceModes] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [modeFilter, setModeFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const deferredSearch = useDeferredValue(searchTerm);

  useInventoryGlobalSearch((term) => {
    setSearchTerm(term);
  });

  useEffect(() => {
    let isMounted = true;

    const loadPriceList = async () => {
      try {
        setLoading(true);
        const payload = await fetchInventory("/api/inventory/price-list");
        if (!isMounted) return;

        setItems(Array.isArray(payload?.data) ? payload.data : []);
        setSections(Array.isArray(payload?.sections) ? payload.sections : []);
        setPriceModes(Array.isArray(payload?.priceModes) ? payload.priceModes : []);
        setError("");
      } catch (err) {
        if (!isMounted) return;
        setItems([]);
        setSections([]);
        setPriceModes([]);
        setError(err?.message || "Unable to load the souvenir price list.");
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadPriceList();
    return () => {
      isMounted = false;
    };
  }, []);

  const normalizedSearch = String(deferredSearch || "").trim().toLowerCase();

  const filteredItems = items.filter((item) => {
    if (sectionFilter !== "all" && item.sectionKey !== sectionFilter) return false;
    if (modeFilter !== "all" && item.priceMode !== modeFilter) return false;

    if (!normalizedSearch) return true;
    const haystack = String(
      item.searchText ||
        [
          item.title,
          item.sectionTitle,
          item.detailSummary,
          item.priceText,
        ].join(" "),
    ).toLowerCase();
    return haystack.includes(normalizedSearch);
  });

  const groupedMap = new Map();
  filteredItems.forEach((item) => {
    const key = item.sectionKey || "general";
    const sectionMeta =
      sections.find((entry) => entry.key === key) || {
        key,
        title: item.sectionTitle || "General",
        description: item.sectionDescription || "",
        order: Number(item.sectionOrder) || 0,
      };

    if (!groupedMap.has(key)) {
      groupedMap.set(key, {
        ...sectionMeta,
        items: [],
      });
    }

    groupedMap.get(key).items.push(item);
  });

  const groupedSections = Array.from(groupedMap.values()).sort(
    (a, b) => (a.order || 0) - (b.order || 0) || a.title.localeCompare(b.title),
  );

  const visibleModeCount = new Set(
    filteredItems.map((item) => String(item.priceMode || "").trim()).filter(Boolean),
  ).size;

  const handleClearFilters = () => {
    setSearchTerm("");
    setSectionFilter("all");
    setModeFilter("all");
  };

  const handleExport = () => {
    if (!filteredItems.length) return;

    const headers = [
      "Section",
      "Item",
      "Pricing Mode",
      "Pricing",
      "Details",
    ];

    const csv = [
      headers.join(","),
      ...filteredItems.map((item) =>
        [
          item.sectionTitle,
          item.title,
          formatPriceModeLabel(item.priceMode),
          Array.isArray(item.priceLines) ? item.priceLines.join(" | ") : item.priceText,
          Array.isArray(item.detailLines)
            ? item.detailLines.join(" | ")
            : item.detailSummary,
        ]
          .map(buildCsvValue)
          .join(","),
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `souvenir-price-list-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="price-list-page">
      <Breadcrumb pageKey="price-list" />

      <header className="price-list-header">
        <div className="price-list-heading">
          <span className="price-list-eyebrow">Souvenir Catalog</span>
          <h2>Price List</h2>
          <p>
            Browse the souvenir catalog by section, review pricing styles,
            and keep item notes visible in a clean list that feels manually maintained.
          </p>
        </div>

        <div className="price-list-actions">
          <button
            type="button"
            className="ghost-button"
            onClick={handleClearFilters}
          >
            Clear filters
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={handleExport}
            disabled={!filteredItems.length}
          >
            <DownloadIcon className="button-icon" />
            Export CSV
          </button>
        </div>
      </header>

      <div className="price-list-summary">
        <article className="summary-card">
          <div className="summary-icon">
            <LayersIcon />
          </div>
          <div className="summary-copy">
            <span className="summary-label">Sections</span>
            <strong>{groupedSections.length}</strong>
            <span className="summary-meta">Visible after current filters</span>
          </div>
        </article>

        <article className="summary-card">
          <div className="summary-icon muted">
            <LayersIcon />
          </div>
          <div className="summary-copy">
            <span className="summary-label">Items</span>
            <strong>{filteredItems.length}</strong>
            <span className="summary-meta">{items.length} total imported rows</span>
          </div>
        </article>

        <article className="summary-card">
          <div className="summary-icon muted">
            <AlertCircleIcon />
          </div>
          <div className="summary-copy">
            <span className="summary-label">Pricing Styles</span>
            <strong>{visibleModeCount}</strong>
            <span className="summary-meta">
              Single price, ranges, MOQ, and request-based pricing
            </span>
          </div>
        </article>
      </div>

      <section className="price-list-toolbar">
        <label className="input-shell search-shell">
          <SearchIcon className="search-icon" />
          <input
            type="search"
            placeholder="Search items, sections, or pricing notes"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </label>

        <select
          className="filter-input"
          value={sectionFilter}
          onChange={(event) => setSectionFilter(event.target.value)}
        >
          <option value="all">All sections</option>
          {sections.map((section) => (
            <option key={section.key} value={section.key}>
              {section.title}
            </option>
          ))}
        </select>

        <select
          className="filter-input"
          value={modeFilter}
          onChange={(event) => setModeFilter(event.target.value)}
        >
          <option value="all">All pricing styles</option>
          {priceModes.map((mode) => (
            <option key={mode.value} value={mode.value}>
              {mode.label}
            </option>
          ))}
        </select>
      </section>

      {error ? (
        <div className="alert warning">
          <div className="alert-icon">
            <AlertCircleIcon />
          </div>
          <div className="alert-content">
            <strong>Unable to load the price list</strong>
            <span>{error}</span>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="price-list-empty">
          <strong>Loading price list...</strong>
          <span>Pulling the grouped catalog entries from the server.</span>
        </div>
      ) : null}

      {!loading && !error && !filteredItems.length ? (
        <div className="price-list-empty">
          <strong>No entries match the current filters.</strong>
          <span>Try clearing the filters or broadening your search terms.</span>
        </div>
      ) : null}

      {!loading && !error && filteredItems.length ? (
        <div className="price-list-sections">
          {groupedSections.map((section) => (
            <article key={section.key} className="price-section-card">
              <header className="price-section-header">
                <div>
                  <h3>{section.title}</h3>
                  <p>{section.description}</p>
                </div>
                <div className="section-count">
                  <strong>{section.items.length}</strong>
                  <span>items</span>
                </div>
              </header>

              <div className="price-item-grid">
                {section.items.map((item) => {
                  const detailLines = Array.isArray(item.detailLines)
                    ? item.detailLines
                    : [];
                  const visibleDetailLines = detailLines.slice(0, 6);
                  const remainingDetailCount = Math.max(
                    detailLines.length - visibleDetailLines.length,
                    0,
                  );
                  const priceLines = Array.isArray(item.priceLines)
                    ? item.priceLines
                    : [];
                  const modeClass = formatModeClass(item.priceMode);

                  return (
                    <article
                      key={item.entryKey}
                      className={`price-item-card mode-${modeClass}`}
                    >
                      <div className="price-item-top">
                        <span className={`mode-chip mode-${modeClass}`}>
                          {formatPriceModeLabel(item.priceMode)}
                        </span>
                      </div>

                      <h4>{item.title}</h4>

                      <div className="price-item-content">
                        {visibleDetailLines.length ? (
                          <ul className="detail-list">
                            {visibleDetailLines.map((detail, index) => (
                              <li key={`${item.entryKey}-detail-${index}`}>
                                {detail}
                              </li>
                            ))}
                            {remainingDetailCount ? (
                              <li className="detail-more">
                                +{remainingDetailCount} more item notes
                              </li>
                            ) : null}
                          </ul>
                        ) : (
                          <p className="detail-fallback">
                            No extra item notes were captured for this row.
                          </p>
                        )}

                        <div className="pricing-panel">
                          <span className="pricing-label">Pricing</span>
                          {priceLines.length ? (
                            <ul className="price-lines">
                              {priceLines.map((line, index) => (
                                <li key={`${item.entryKey}-price-${index}`}>{line}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="detail-fallback">{item.priceText || "-"}</p>
                          )}
                        </div>
                      </div>

                      <footer className="price-item-footer">
                        <span>
                          {item.priceValues?.length
                            ? `${item.priceValues.length} numeric value${
                                item.priceValues.length > 1 ? "s" : ""
                              }`
                            : "Custom pricing"}
                        </span>
                      </footer>
                    </article>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
};

export default PriceList;
