"""Synthetic layout fixtures only; never use a student's actual report here."""
import importlib.util
import tempfile
import unittest
from pathlib import Path
import pymupdf

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("audit_review_pdf", ROOT / "references" / "tools" / "audit_review_pdf.py")
auditmod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(auditmod)

class ReviewAuditTest(unittest.TestCase):
    def test_structural_and_density_checks(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "synthetic.pdf"
            doc = pymupdf.open()
            for i in range(1, 13):
                page = doc.new_page()
                if i == 1:
                    for y, text in [(100, "User X"), (140, "01234")]:
                        page.insert_textbox(pymupdf.Rect(150,y,450,y+30), text, fontsize=12, align=1)
                else:
                    page.insert_text((50, 60), f"Topic {i}")
                    if i in (3, 5, 7, 9, 11):
                        page.insert_text((50, 260), f"Figure {i} Sample")
            doc.save(path)
            doc.close()
            manifest = {"min_pages": 12, "cover":{"values":["User X","01234"],"center_tolerance_pt":1},
                        "headings":[{"page":i,"text":f"Topic {i}"} for i in range(2,13)],
                        "figures":[{"id":i,"page":i,"caption":f"Figure {i} Sample","kind":"vector"} for i in [3,5,7,9,11]],
                        "figures_per_10_pages_min":4,"rolling_10_page_min":4}
            result = auditmod.audit(path,manifest)
            self.assertTrue(result["ok"],result)
            self.assertEqual(result["matched_figure_captions"],5)
            self.assertEqual(result["minimum_rolling_10_page_figures"],4)
            manifest["figures"][0]["caption"] = "Missing"
            result = auditmod.audit(path,manifest)
            self.assertFalse(result["ok"])
            self.assertEqual(result["matched_figure_captions"],4)
            self.assertTrue(result["visual_review_required"])

    def test_wrapped_cover_and_duplicate_figure_fail(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "synthetic.pdf"
            doc = pymupdf.open()
            p=doc.new_page()
            p.insert_text((35,60),"Alpha")
            p.insert_text((90,100),"Beta")
            p.insert_text((30,200),"Figure 1 A")
            doc.save(path);doc.close()
            m={"cover":{"values":["Alpha","Beta"]},"figures":[
                {"id":1,"page":1,"caption":"Figure 1 A","kind":"raster"},
                {"id":1,"page":1,"caption":"Figure 1 A","kind":"raster"}]}
            r=auditmod.audit(path,m)
            self.assertFalse(r["ok"])
            self.assertTrue(any("centers differ" in e for e in r["errors"]))
            self.assertTrue(any("Duplicate figure ID" in e for e in r["errors"]))
            self.assertTrue(any("raster objects" in e for e in r["errors"]))

if __name__ == "__main__":
    unittest.main()

