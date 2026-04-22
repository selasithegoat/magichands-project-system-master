#!/usr/bin/env python3
"""Extract a structured souvenir price list from the source PDF.

Outputs:
  - souvenir-price-list.raw.json
  - souvenir-price-list.items.json
  - souvenir-price-list.summary.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

try:
    import pdfplumber
except ImportError as exc:  # pragma: no cover - dependency failure path
    raise SystemExit(
        "Missing dependency 'pdfplumber'. Install it with: python -m pip install pdfplumber"
    ) from exc


DEFAULT_OUTPUT_DIR = (
    Path(__file__).resolve().parent.parent
    / "data"
    / "inventory-imports"
    / "souvenir-price-list"
)

CID_REPLACEMENTS = {
    "\uf0d8": "- ",
    "(cid:415)": "t",
    "(cid:425)": "tt",
    "\u2013": "-",
    "\u2014": "-",
}

NOISE_LINE_PATTERNS = [
    re.compile(r"^nb\s*:", re.IGNORECASE),
    re.compile(r"^for\s+single\s+orders\.?$", re.IGNORECASE),
    re.compile(r"^single\s+orders\.?$", re.IGNORECASE),
    re.compile(r"^quant\w*\s+orders?.*discount", re.IGNORECASE),
    re.compile(r"^quant\w*\s+orders?(?:\s+comes?)?\.?$", re.IGNORECASE),
    re.compile(r"orders\s+comes", re.IGNORECASE),
    re.compile(r"^with\s+discounted\s+cost\.?$", re.IGNORECASE),
    re.compile(r"^discount\s+applies", re.IGNORECASE),
]

DETAIL_START_PATTERNS = [
    re.compile(r"^this\s+package\s+includes", re.IGNORECASE),
    re.compile(r"^comes\s+in", re.IGNORECASE),
    re.compile(r"^comes\s+with", re.IGNORECASE),
    re.compile(r"^colou?rs?\s+available", re.IGNORECASE),
    re.compile(r"^sizes?\s+available", re.IGNORECASE),
    re.compile(r"^preferred\s+sizes?", re.IGNORECASE),
    re.compile(r"^types?\s+of", re.IGNORECASE),
    re.compile(r"^available\s+in", re.IGNORECASE),
    re.compile(r"^front\s+and\s+back\s+branding", re.IGNORECASE),
    re.compile(r"^and\s+many\s+more", re.IGNORECASE),
    re.compile(r"^for\s+events", re.IGNORECASE),
]

PRICE_BASED_PATTERNS = [
    re.compile(r"price\s+is\s+based\s+on", re.IGNORECASE),
    re.compile(r"prices?\s+are\s+determined\s+by", re.IGNORECASE),
    re.compile(r"depending\s+on", re.IGNORECASE),
]

MINIMUM_PATTERNS = [
    re.compile(r"\bminimum\b", re.IGNORECASE),
    re.compile(r"\bmin(?:imum)?\.?\s*qty\b", re.IGNORECASE),
    re.compile(r"\bminimum\s+qty\b", re.IGNORECASE),
    re.compile(r"\bminimum\s+quantity\b", re.IGNORECASE),
    re.compile(r"\bfor\s+minimum\s+qty\b", re.IGNORECASE),
]

UNIT_COST_PATTERN = re.compile(r"\bunit\s+cost\b", re.IGNORECASE)
PRICE_RANGE_PATTERN = re.compile(
    r"\d[\d,]*\.\d{2}\s*[-]\s*\d[\d,]*\.\d{2}",
    re.IGNORECASE,
)
MONEY_DECIMAL_PATTERN = re.compile(
    r"(?<![A-Za-z0-9])([0-9][0-9,]*\.\d{2})(?![A-Za-z0-9])"
)
MONEY_CEDIS_PATTERN = re.compile(
    r"(?<![A-Za-z0-9])([0-9][0-9,]*)\s*cedis\b",
    re.IGNORECASE,
)

PAGE_SECTION_RULES = [
    {
        "start": 1,
        "end": 3,
        "key": "gift-sets-diaries",
        "title": "Gift Sets & Executive Diaries",
        "description": "Opening pages focused on executive gift combinations, diaries, notebooks, and bundled presentation sets.",
    },
    {
        "start": 4,
        "end": 7,
        "key": "pens-accessories",
        "title": "Pens, Cufflinks & Executive Accessories",
        "description": "Writing instruments and small executive accessories such as cufflinks, pen cases, and combo packs.",
    },
    {
        "start": 8,
        "end": 12,
        "key": "drinkware-drives-keyholders",
        "title": "Drinkware, Drives & Keyholders",
        "description": "Mugs, flasks, bamboo drinkware, USB drives, and keyholder collections in the same PDF sequence.",
    },
    {
        "start": 13,
        "end": 16,
        "key": "awards-display-pieces",
        "title": "Citations, Plaques & Display Pieces",
        "description": "Recognition pieces, wooden portraits, glass awards, and related presentation display items.",
    },
    {
        "start": 17,
        "end": 20,
        "key": "apparel-promo-wear",
        "title": "Towels, Apparel & Reflective Wear",
        "description": "Soft goods, branded wear, reflective safety items, and related apparel-focused pieces.",
    },
    {
        "start": 21,
        "end": 23,
        "key": "lanyards-watches-accessories",
        "title": "Lanyards, Watches & Everyday Accessories",
        "description": "Lanyards, ID items, watches, wallets, umbrellas, and similar daily branded accessories.",
    },
    {
        "start": 24,
        "end": 27,
        "key": "bags-tags-event-accessories",
        "title": "Bags, Tags & Event Accessories",
        "description": "Bags, invitation items, labels, name tags, and other event-use branded accessories.",
    },
    {
        "start": 28,
        "end": 33,
        "key": "print-signage-branding",
        "title": "Print, Stationery & Signage",
        "description": "Business print, stationery, promotional displays, signage, and large-format branding pieces.",
    },
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract structured souvenir price-list entries from a PDF."
    )
    parser.add_argument("--pdf", required=True, help="Path to the source PDF.")
    parser.add_argument(
        "--out-dir",
        default=str(DEFAULT_OUTPUT_DIR),
        help="Directory where extracted files should be written.",
    )
    return parser.parse_args()


def normalize_text(value: object) -> str:
    text = str(value or "")
    text = text.replace("\r", "\n").replace("\xa0", " ")
    for source, target in CID_REPLACEMENTS.items():
        text = text.replace(source, target)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{2,}", "\n", text)
    return text.strip()


def normalize_key(value: object) -> str:
    text = normalize_text(value).lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def slugify(value: object, fallback: str = "item") -> str:
    normalized = normalize_text(value).lower()
    slug = re.sub(r"[^a-z0-9]+", "-", normalized).strip("-")
    return slug or fallback


def make_hash(value: str, length: int = 6) -> str:
    return hashlib.md5(value.encode("utf-8")).hexdigest()[:length]


def is_noise_line(line: str) -> bool:
    return any(pattern.search(line) for pattern in NOISE_LINE_PATTERNS)


def clean_lines(text: object, strip_noise: bool = True) -> list[str]:
    lines: list[str] = []
    for raw_line in normalize_text(text).splitlines():
        line = raw_line.strip().strip("|").strip()
        if not line:
            continue
        if strip_noise and is_noise_line(line):
            continue
        lines.append(line)
    return lines


def extract_title_and_details(description_text: object) -> tuple[str, list[str]]:
    lines = clean_lines(description_text, strip_noise=True)
    if not lines:
        return "", []

    title_lines = [lines[0]]
    for line in lines[1:]:
        letters = [character for character in line if character.isalpha()]
        uppercase_ratio = (
            sum(character.isupper() for character in letters) / len(letters)
            if letters
            else 0
        )
        is_title_continuation = (
            uppercase_ratio >= 0.8
            and not any(pattern.search(line) for pattern in DETAIL_START_PATTERNS)
        )
        if is_title_continuation:
            title_lines.append(line)
            continue
        break

    title = re.sub(r"\s+", " ", " ".join(title_lines)).strip(" .:-")
    details = []
    for line in lines[len(title_lines) :]:
        detail = re.sub(r"^\-\s*", "", line).strip(" .;")
        if detail:
            details.append(detail)
    return title, details


def extract_price_lines(price_text: object) -> list[str]:
    return clean_lines(price_text, strip_noise=True)


def summarize_details(lines: list[str], limit: int = 240) -> str:
    if not lines:
        return ""
    summary = "; ".join(lines)
    summary = re.sub(r"\s+", " ", summary).strip()
    if len(summary) <= limit:
        return summary
    return f"{summary[: limit - 3].rstrip(' ;,')}..."


def extract_money_values(price_text: str) -> list[float]:
    values: list[float] = []
    seen: set[tuple[str, str]] = set()

    for match in MONEY_DECIMAL_PATTERN.finditer(price_text):
        raw = match.group(1)
        key = ("decimal", raw)
        if key in seen:
            continue
        seen.add(key)
        values.append(float(raw.replace(",", "")))

    for match in MONEY_CEDIS_PATTERN.finditer(price_text):
        raw = match.group(1)
        key = ("cedis", raw)
        if key in seen:
            continue
        seen.add(key)
        values.append(float(raw.replace(",", "")))

    return values


def classify_price_mode(price_text: str, money_values: list[float]) -> str:
    normalized = normalize_text(price_text)
    has_price_based = any(pattern.search(normalized) for pattern in PRICE_BASED_PATTERNS)
    has_minimum = any(pattern.search(normalized) for pattern in MINIMUM_PATTERNS)
    has_unit_cost = bool(UNIT_COST_PATTERN.search(normalized))
    has_range = bool(PRICE_RANGE_PATTERN.search(normalized))
    has_multiple_prices = len(money_values) > 1

    if not money_values:
        if has_price_based:
            return "price_on_request"
        if has_minimum:
            return "minimum_order"
        return "missing_price"

    if has_price_based:
        return "price_on_request"
    if has_range:
        return "price_range"
    if has_minimum and has_unit_cost:
        return "minimum_order_unit_cost"
    if has_minimum:
        return "minimum_order"
    if has_multiple_prices:
        return "multi_price"
    return "single"


def resolve_section(page_number: int) -> dict[str, object]:
    for index, rule in enumerate(PAGE_SECTION_RULES, start=1):
        if rule["start"] <= page_number <= rule["end"]:
            if rule["start"] == rule["end"]:
                page_range_label = f"Page {rule['start']}"
            else:
                page_range_label = f"Pages {rule['start']}-{rule['end']}"
            return {
                "sectionKey": str(rule["key"]),
                "sectionTitle": str(rule["title"]),
                "sectionDescription": str(rule["description"]),
                "sectionOrder": index,
                "pageRangeLabel": page_range_label,
            }
    return {
        "sectionKey": "general",
        "sectionTitle": "General",
        "sectionDescription": "",
        "sectionOrder": len(PAGE_SECTION_RULES) + 1,
        "pageRangeLabel": f"Page {page_number}",
    }


def is_header_row(title: str, price_lines: list[str]) -> bool:
    return normalize_key(title) == "description" and normalize_key(" ".join(price_lines)) == "price"


def build_entry(
    pdf_path: Path,
    page_number: int,
    table_number: int,
    row_number: int,
    catalog_order: int,
    title: str,
    detail_lines: list[str],
    description_text: str,
    price_lines: list[str],
    raw_row: list[str],
) -> dict[str, object]:
    section = resolve_section(page_number)
    price_text = " | ".join(price_lines)
    price_values = extract_money_values(price_text)
    price_mode = classify_price_mode(price_text, price_values)
    title_key = normalize_key(title)
    slug_seed = f"{pdf_path.name}:{page_number}:{row_number}:{title_key}"
    detail_summary = summarize_details(detail_lines)
    search_text = normalize_text(
        " ".join(
            [
                title,
                section["sectionTitle"],
                detail_summary,
                price_text,
                f"page {page_number}",
            ]
        )
    ).lower()

    return {
        "entryKey": f"{slugify(pdf_path.stem, 'souvenir')}:{page_number:02d}:{row_number:03d}",
        "slug": f"{slugify(title)}-{make_hash(slug_seed)}",
        "title": title,
        "titleKey": title_key,
        **section,
        "pageNumber": page_number,
        "pageLabel": f"Page {page_number}",
        "itemOrder": row_number,
        "catalogOrder": catalog_order,
        "description": description_text,
        "detailLines": detail_lines,
        "detailSummary": detail_summary,
        "priceText": price_text,
        "priceLines": price_lines,
        "priceMode": price_mode,
        "priceValues": price_values,
        "priceMin": min(price_values) if price_values else None,
        "priceMax": max(price_values) if price_values else None,
        "searchText": search_text,
        "sourcePdf": pdf_path.name,
        "sourcePath": str(pdf_path),
        "sourceTable": table_number,
        "sourceRow": row_number,
        "rawRow": raw_row,
    }


def extract_rows(pdf_path: Path) -> list[dict[str, object]]:
    items: list[dict[str, object]] = []
    catalog_order = 0

    with pdfplumber.open(pdf_path) as pdf:
        for page_number, page in enumerate(pdf.pages, start=1):
            tables = page.extract_tables() or []
            for table_number, table in enumerate(tables, start=1):
                for row_number, row in enumerate(table, start=1):
                    if not isinstance(row, list) or len(row) < 2:
                        continue

                    description_cell = row[1] if len(row) >= 3 else row[0]
                    price_cell = row[-1]
                    description_text = normalize_text(description_cell)
                    price_lines = extract_price_lines(price_cell)
                    title, detail_lines = extract_title_and_details(description_cell)

                    if not title or not price_lines:
                        continue
                    if is_header_row(title, price_lines):
                        continue

                    catalog_order += 1
                    items.append(
                        build_entry(
                            pdf_path=pdf_path,
                            page_number=page_number,
                            table_number=table_number,
                            row_number=row_number,
                            catalog_order=catalog_order,
                            title=title,
                            detail_lines=detail_lines,
                            description_text=description_text,
                            price_lines=price_lines,
                            raw_row=[normalize_text(cell) for cell in row],
                        )
                    )

    return items


def build_summary(items: list[dict[str, object]], pdf_path: Path) -> dict[str, object]:
    sections = Counter(str(item.get("sectionTitle") or "") for item in items)
    price_modes = Counter(str(item.get("priceMode") or "") for item in items)
    pages = Counter(int(item.get("pageNumber") or 0) for item in items)
    return {
        "sourcePdf": pdf_path.name,
        "sourcePath": str(pdf_path),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "counts": {
            "items": len(items),
            "sections": len(sections),
            "pages": len(pages),
        },
        "sections": dict(sections),
        "priceModes": dict(price_modes),
        "pages": dict(sorted(pages.items())),
    }


def write_outputs(items: list[dict[str, object]], pdf_path: Path, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)

    summary = build_summary(items, pdf_path)
    raw_path = out_dir / "souvenir-price-list.raw.json"
    items_path = out_dir / "souvenir-price-list.items.json"
    summary_path = out_dir / "souvenir-price-list.summary.json"

    raw_path.write_text(json.dumps(items, indent=2), encoding="utf-8")
    items_path.write_text(
        json.dumps(
            [
                {
                    key: value
                    for key, value in item.items()
                    if key != "rawRow"
                }
                for item in items
            ],
            indent=2,
        ),
        encoding="utf-8",
    )
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print(f"Source PDF: {pdf_path}")
    print(f"Items extracted: {summary['counts']['items']}")
    print(f"Sections mapped: {summary['counts']['sections']}")
    print(f"Raw JSON: {raw_path}")
    print(f"Items JSON: {items_path}")
    print(f"Summary JSON: {summary_path}")


def main() -> None:
    args = parse_args()
    pdf_path = Path(args.pdf).expanduser().resolve()
    out_dir = Path(args.out_dir).expanduser().resolve()

    if not pdf_path.exists():
        raise SystemExit(f"PDF not found: {pdf_path}")

    items = extract_rows(pdf_path)
    write_outputs(items, pdf_path, out_dir)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
