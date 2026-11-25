"""Bundle index.html and its vendor scripts into one self-contained HTML file.

Usage: python build_standalone.py [output.html]
"""
import pathlib
import re
import sys

here = pathlib.Path(__file__).resolve().parent
out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else here / "star-earth-movers-billing.html"
html = (here / "index.html").read_text(encoding="utf-8")


def inline(match):
    code = (here / match.group(1)).read_text(encoding="utf-8").replace("</script", "<\\/script")
    return "<script>\n" + code + "\n</script>"


html = re.sub(r'<script src="(vendor/[^"]+)"></script>', inline, html)
out.write_text(html, encoding="utf-8")
print(f"wrote {out} ({out.stat().st_size // 1024} KB)")
