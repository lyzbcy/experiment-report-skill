"""Verify a rendered PDF against a task-specific review-report manifest.

Requires PyMuPDF (pymupdf). This is structural evidence, not visual approval.
All page numbers in the manifest are one-based physical PDF pages.
"""
import argparse
import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

from pymupdf import open as open_pdf

def norm(text):
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", str(text)))

def page_lines(page):
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            text = "".join(span["text"] for span in line["spans"])
            if text.strip():
                yield text, line["bbox"]

def unique_line(page, text):
    value = norm(text)
    if not value:
        raise ValueError("empty expected line")
    matches = [box for line, box in page_lines(page) if norm(line) == value]
    return matches[0] if len(matches) == 1 else None

def audit(pdf, manifest):
    errors = []
    with open_pdf(pdf) as doc:
        count = len(doc)
        def page_at(index, label):
            if not isinstance(index, int) or not 1 <= index <= count:
                errors.append(f"{label}: invalid physical page {index!r}")
                return None
            return doc[index - 1]

        min_pages = manifest.get("min_pages", 0)
        if count < min_pages:
            errors.append(f"PDF has {count} pages; required {min_pages}")
        headings = manifest.get("headings", [])
        for row in headings:
            pg = page_at(row["page"], row["text"])
            if pg is not None and unique_line(pg, row["text"]) is None:
                errors.append(f"Heading missing or ambiguous on p{row['page']}: {row['text']}")

        for row in manifest.get("toc", []):
            pg = page_at(row["page"], "toc")
            expected = norm(row["text"]) + norm(row["printed_page"])
            if pg is not None:
                matches = [line for line, _ in page_lines(pg)
                           if re.sub(r"[.·…]{2,}", "", norm(line)) == expected]
                if len(matches) != 1:
                    errors.append(f"TOC entry absent or ambiguous on p{row['page']}: {row['text']}")

        cover_centers = {}
        cover = manifest.get("cover")
        if cover:
            pg = page_at(cover.get("page", 1), "cover")
            if pg is not None:
                for value in cover["values"]:
                    bbox = unique_line(pg, value)
                    if bbox is None:
                        errors.append(f"Cover value missing, wrapped, or ambiguous: {value}")
                    else:
                        cover_centers[value] = (bbox[0] + bbox[2]) / 2
            if len(cover_centers) > 1:
                delta = max(cover_centers.values()) - min(cover_centers.values())
                if delta > cover.get("center_tolerance_pt", 2):
                    errors.append(f"Cover value column centers differ by {delta:.2f} pt")

        # A figure is counted only after its declared unique caption is found on
        # its physical page. Inline mentions and logo images are not counted.
        figures = Counter()
        raster_required = Counter()
        ids = set()
        caption_keys = set()
        for row in manifest.get("figures", []):
            identity = row["id"]
            if identity in ids:
                errors.append(f"Duplicate figure ID: {identity}")
                continue
            ids.add(identity)
            caption_key = (row["page"], norm(row["caption"]))
            if caption_key in caption_keys:
                errors.append(f"Duplicate caption on p{row['page']}: {row['caption']}")
                continue
            caption_keys.add(caption_key)
            pg = page_at(row["page"], identity)
            if pg is None or unique_line(pg, row["caption"]) is None:
                errors.append(f"Figure caption missing, wrapped, or ambiguous: {identity} (p{row['page']})")
                continue
            figures[row["page"]] += 1
            if row.get("kind") == "raster":
                raster_required[row["page"]] += 1
        # Raster presence supports a caption claim; vector figures still
        # require a human check. Size threshold is task-specific, optional.
        min_width = manifest.get("min_raster_width_px", 0)
        for index, needed in raster_required.items():
            visible = [im for im in doc[index-1].get_image_info()
                       if im["width"] >= min_width and im["bbox"][2] > im["bbox"][0]
                       and im["bbox"][3] > im["bbox"][1]]
            if len(visible) < needed:
                errors.append(f"p{index}: {len(visible)} raster objects for {needed} declared raster figures")

        density = sum(figures.values()) * 10 / count if count else 0
        rolling = min((sum(figures[i] for i in range(start, start + 10))
                       for start in range(1, count - 8)), default=None)
        if density + 1e-9 < manifest.get("figures_per_10_pages_min", 0):
            errors.append(f"Average figure density {density:.2f}/10 pages is below requirement")
        minimum = manifest.get("rolling_10_page_min")
        if minimum is not None and (rolling is None or rolling < minimum):
            errors.append(f"Rolling 10-page minimum {rolling} is below requirement {minimum}")

        # A separate reference section may span any number of pages. Check
        # numbered entries without assuming a fixed bibliography length.
        bibliography = manifest.get("references")
        refs_found = []
        if bibliography:
            start, end = bibliography["start_page"], bibliography.get("end_page", count)
            if page_at(start, "bibliography start") is not None and page_at(end, "bibliography end") is not None:
                if end < start:
                    errors.append("bibliography page range reversed")
                else:
                    for pg in range(start, end + 1):
                        for line, _ in page_lines(doc[pg-1]):
                            match = re.match(r"^\s*\[(\d+)\]", line)
                            if match:
                                refs_found.append(int(match.group(1)))
                    expected = list(range(1, bibliography["count"] + 1))
                    if refs_found != expected:
                        errors.append(f"Reference numbering differs: expected {expected}, got {refs_found}")

        for index, pg in enumerate(doc, 1):
            for text, bbox in page_lines(pg):
                if "\ufffd" in text:
                    errors.append(f"p{index}: replacement character in text")
                if bbox[0] < -1 or bbox[1] < -1 or bbox[2] > pg.rect.width + 1 or bbox[3] > pg.rect.height + 1:
                    errors.append(f"p{index}: text outside page")
            # Count genuinely empty pages, not a sparse-but-legitimate page.
            if not pg.get_text().strip() and not pg.get_image_info() and not pg.get_drawings():
                errors.append(f"p{index}: empty page")

        return {"ok": not errors, "physical_pages": count,
                "matched_figure_captions": sum(figures.values()),
                "figures_per_page": {str(i): figures[i] for i in range(1, count + 1)},
                "figures_per_10_pages": round(density, 2),
                "minimum_rolling_10_page_figures": rolling,
                "cover_centers_pt": {v: round(c, 2) for v, c in cover_centers.items()},
                "matched_references": len(refs_found),
                "errors": errors, "visual_review_required": True}

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("pdf", type=Path)
    p.add_argument("--manifest", type=Path, required=True)
    args = p.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8-sig"))
    result = audit(args.pdf, manifest)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["ok"] else 1

if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())

