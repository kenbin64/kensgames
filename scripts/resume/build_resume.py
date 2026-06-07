#!/usr/bin/env python3
"""Build an ATS-clean DOCX + PDF resume from docs/resume/resume.md.

One source of truth (Markdown), two outputs:
  - DOCX  : generated directly as OOXML (zipfile + XML, Python stdlib only).
            No Microsoft Word dependency, no COM, reproducible by construction.
  - PDF   : rendered from a clean print-HTML by headless Edge (Windows built-in).

Supported Markdown subset (keep resume.md to this):
  # Name                  -> centered title
  (lines until first ##)  -> centered role + contact block
  ## Section              -> uppercase section heading with underline rule
  ### Subhead             -> bold subheading (role/project line)
  - bullet                -> bullet item
  **bold** inline         -> bold runs (any paragraph/bullet)
  plain line              -> normal paragraph

Usage: python scripts/resume/build_resume.py
"""

import os
import re
import sys
import html
import shutil
import zipfile
import tempfile
import subprocess

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(REPO, "docs", "resume", "resume.md")
OUTDIR = os.path.join(REPO, "butterflyfx", "assets")
BASE = "Kenneth_Bingham_Resume"


# ----------------------------------------------------------------------------
# Parse the constrained Markdown into a list of typed blocks.
# ----------------------------------------------------------------------------
def parse(md_text):
    blocks = []
    saw_name = False
    in_header = False
    header_idx = 0
    for raw in md_text.splitlines():
        line = raw.rstrip()
        if not saw_name:
            m = re.match(r"^#\s+(.*)$", line)
            if m:
                blocks.append(("name", m.group(1)))
                saw_name = True
                in_header = True
                header_idx = 0
                continue
        if line == "":
            continue
        m = re.match(r"^##\s+(.*)$", line)
        if m:
            in_header = False
            blocks.append(("h2", m.group(1)))
            continue
        m = re.match(r"^###\s+(.*)$", line)
        if m:
            in_header = False
            blocks.append(("h3", m.group(1)))
            continue
        m = re.match(r"^\-\s+(.*)$", line)
        if m:
            in_header = False
            blocks.append(("bullet", m.group(1)))
            continue
        if in_header:
            blocks.append(("header", line, header_idx))
            header_idx += 1
            continue
        blocks.append(("p", line))
    return blocks


def runs(text):
    """Split a string on **bold** markers -> [(text, is_bold), ...]."""
    out = []
    for i, part in enumerate(re.split(r"\*\*", text)):
        if part == "":
            continue
        out.append((part, i % 2 == 1))
    return out


# ----------------------------------------------------------------------------
# DOCX generation (OOXML). Sizes are in half-points; indents in twips (1/1440").
# ----------------------------------------------------------------------------
def xml_escape(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def docx_runs(text, bold=False, size=None):
    out = []
    for t, b in runs(text):
        rpr = ""
        if b or bold:
            rpr += "<w:b/>"
        if size:
            rpr += f'<w:sz w:val="{size}"/><w:szCs w:val="{size}"/>'
        rpr = f"<w:rPr>{rpr}</w:rPr>" if rpr else ""
        # xml:space preserve keeps leading/trailing spaces between runs
        out.append(f'<w:r>{rpr}<w:t xml:space="preserve">{xml_escape(t)}</w:t></w:r>')
    return "".join(out)


def para(content, *, align=None, before=0, after=60, ind=None, hanging=None,
         border_bottom=False):
    ppr = ""
    if border_bottom:
        ppr += ('<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="2" '
                'w:color="888888"/></w:pBdr>')
    if align:
        ppr += f'<w:jc w:val="{align}"/>'
    if ind is not None or hanging is not None:
        attrs = ""
        if ind is not None:
            attrs += f' w:left="{ind}"'
        if hanging is not None:
            attrs += f' w:hanging="{hanging}"'
        ppr += f"<w:ind{attrs}/>"
    ppr += f'<w:spacing w:before="{before}" w:after="{after}" w:line="240" w:lineRule="auto"/>'
    return f"<w:p><w:pPr>{ppr}</w:pPr>{content}</w:p>"


def build_document_xml(blocks):
    body = []
    for b in blocks:
        kind = b[0]
        if kind == "name":
            body.append(para(docx_runs(b[1], bold=True, size=44),
                             align="center", after=20))
        elif kind == "header":
            idx = b[2]
            if idx == 0:
                body.append(para(docx_runs(b[1], bold=True, size=22),
                                 align="center", after=20))
            else:
                body.append(para(docx_runs(b[1], size=19),
                                 align="center", after=120))
        elif kind == "h2":
            body.append(para(docx_runs(b[1].upper(), bold=True, size=24),
                             before=160, after=60, border_bottom=True))
        elif kind == "h3":
            body.append(para(docx_runs(b[1], bold=True, size=22),
                             before=100, after=20))
        elif kind == "bullet":
            content = ('<w:r><w:t xml:space="preserve">•\t</w:t></w:r>'
                       + docx_runs(b[1]))
            body.append(para(content, ind=288, hanging=216, after=40))
        else:  # p
            body.append(para(docx_runs(b[1]), after=60))

    sect = ('<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>'
            '<w:pgMar w:top="720" w:right="1000" w:bottom="720" w:left="1000" '
            'w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>')
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body>{''.join(body)}{sect}</w:body></w:document>"
    )


STYLES_XML = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    '<w:docDefaults><w:rPrDefault><w:rPr>'
    '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>'
    '<w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:rPrDefault></w:docDefaults>'
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">'
    '<w:name w:val="Normal"/></w:style></w:styles>'
)

CONTENT_TYPES = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    '<Default Extension="xml" ContentType="application/xml"/>'
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
    '</Types>'
)

ROOT_RELS = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    '</Relationships>'
)

DOC_RELS = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    '</Relationships>'
)


def write_docx(blocks, path):
    # Fixed timestamp keeps the zip byte-reproducible across runs.
    zi_date = (2026, 1, 1, 0, 0, 0)
    parts = {
        "[Content_Types].xml": CONTENT_TYPES,
        "_rels/.rels": ROOT_RELS,
        "word/document.xml": build_document_xml(blocks),
        "word/styles.xml": STYLES_XML,
        "word/_rels/document.xml.rels": DOC_RELS,
    }
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in parts.items():
            info = zipfile.ZipInfo(name, date_time=zi_date)
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, data)


# ----------------------------------------------------------------------------
# Clean print-HTML, then headless Edge -> PDF.
# ----------------------------------------------------------------------------
def html_runs(text):
    out = []
    for t, b in runs(text):
        esc = html.escape(t)
        out.append(f"<strong>{esc}</strong>" if b else esc)
    return "".join(out)


def build_html(blocks):
    rows = []
    for b in blocks:
        kind = b[0]
        if kind == "name":
            rows.append(f'<h1>{html_runs(b[1])}</h1>')
        elif kind == "header":
            cls = "role" if b[2] == 0 else "contact"
            rows.append(f'<div class="{cls}">{html_runs(b[1])}</div>')
        elif kind == "h2":
            rows.append(f'<h2>{html.escape(b[1].upper())}</h2>')
        elif kind == "h3":
            rows.append(f'<h3>{html_runs(b[1])}</h3>')
        elif kind == "bullet":
            rows.append(f'<li>{html_runs(b[1])}</li>')
        else:
            rows.append(f'<p>{html_runs(b[1])}</p>')
    # wrap consecutive <li> into <ul>
    out, i = [], 0
    while i < len(rows):
        if rows[i].startswith("<li>"):
            group = []
            while i < len(rows) and rows[i].startswith("<li>"):
                group.append(rows[i]); i += 1
            out.append("<ul>" + "".join(group) + "</ul>")
        else:
            out.append(rows[i]); i += 1
    body = "\n".join(out)
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
@page {{ size: letter; margin: 0.5in 0.7in; }}
* {{ box-sizing: border-box; }}
body {{ font-family: Calibri, "Segoe UI", Arial, sans-serif; font-size: 10.5pt;
       line-height: 1.3; color: #111; margin: 0; }}
h1 {{ text-align: center; font-size: 22pt; margin: 0 0 2pt; }}
.role {{ text-align: center; font-weight: bold; font-size: 11pt; margin: 0 0 2pt; }}
.contact {{ text-align: center; font-size: 9.5pt; margin: 0 0 8pt; color: #333; }}
h2 {{ font-size: 12pt; text-transform: uppercase; letter-spacing: .04em;
      border-bottom: 1px solid #888; padding-bottom: 2pt; margin: 12pt 0 5pt; }}
h3 {{ font-size: 11pt; margin: 8pt 0 1pt; }}
p {{ margin: 0 0 5pt; }}
ul {{ margin: 2pt 0 6pt; padding-left: 18pt; }}
li {{ margin: 0 0 3pt; }}
</style></head><body>
{body}
</body></html>"""


def find_edge():
    for p in (
        os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
    ):
        if os.path.isfile(p):
            return p
    return None


def html_to_pdf(html_path, pdf_path):
    edge = find_edge()
    if not edge:
        print("[build] Edge not found; skipping PDF (DOCX still produced).")
        return False
    if os.path.exists(pdf_path):
        os.remove(pdf_path)
    user_dir = tempfile.mkdtemp(prefix="edge-resume-")
    url = "file:///" + html_path.replace("\\", "/")
    cmd = [
        edge, "--headless=new", "--disable-gpu", "--no-first-run",
        "--no-default-browser-check", f"--user-data-dir={user_dir}",
        "--no-pdf-header-footer", f"--print-to-pdf={pdf_path}", url,
    ]
    try:
        subprocess.run(cmd, timeout=90, stdout=subprocess.DEVNULL,
                       stderr=subprocess.DEVNULL)
    except subprocess.TimeoutExpired:
        print("[build] Edge timed out.")
    finally:
        shutil.rmtree(user_dir, ignore_errors=True)
    return os.path.exists(pdf_path)


def main():
    import argparse
    ap = argparse.ArgumentParser(
        description="Build an ATS-clean DOCX + PDF from a constrained Markdown source.")
    ap.add_argument("--src", default=SRC, help="Markdown source file")
    ap.add_argument("--outdir", default=OUTDIR, help="output directory")
    ap.add_argument("--base", default=BASE, help="output base filename (no extension)")
    a = ap.parse_args()
    src, outdir, base = a.src, a.outdir, a.base

    if not os.path.isfile(src):
        sys.exit(f"Source not found: {src}")
    os.makedirs(outdir, exist_ok=True)
    with open(src, encoding="utf-8") as f:
        blocks = parse(f.read())

    docx_path = os.path.join(outdir, base + ".docx")
    html_path = os.path.join(outdir, base + ".html")
    pdf_path = os.path.join(outdir, base + ".pdf")

    write_docx(blocks, docx_path)
    print(f"[build] DOCX -> {docx_path}")

    with open(html_path, "w", encoding="utf-8") as f:
        f.write(build_html(blocks))
    print(f"[build] HTML -> {html_path}")

    if html_to_pdf(html_path, pdf_path):
        print(f"[build] PDF  -> {pdf_path}")
    else:
        print("[build] PDF not produced.")


if __name__ == "__main__":
    main()
