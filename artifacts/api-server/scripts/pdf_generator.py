#!/usr/bin/env python3
"""
PDF Generator for bank branch audit reports.
Usage: python pdf_generator.py <excel_path> <output_dir> <audit_type> <config_json>
config_json: JSON string with columnMapping and pdfStyle
"""
import os
import sys
import json
import argparse
import openpyxl
import pandas as pd

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape, portrait
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import urllib.request

# =========================================================
# FONT LOADING
# =========================================================
FONT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts")
os.makedirs(FONT_DIR, exist_ok=True)

CARLITO_REGULAR_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/carlito/Carlito-Regular.ttf"
ARIMO_BOLD_URL = "https://raw.githubusercontent.com/googlefonts/arimo/main/fonts/ttf/Arimo-Bold.ttf"

reg_path = os.path.join(FONT_DIR, "Carlito-Regular.ttf")
bold_path = os.path.join(FONT_DIR, "Arimo-Bold.ttf")


def download_font(url, path):
    if not os.path.exists(path):
        sys.stderr.write(f"Downloading font -> {os.path.basename(path)}...\n")
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req) as response, open(path, "wb") as out_file:
                out_file.write(response.read())
        except Exception as e:
            sys.stderr.write(f"Failed to download font: {e}\n")


download_font(CARLITO_REGULAR_URL, reg_path)
download_font(ARIMO_BOLD_URL, bold_path)

try:
    pdfmetrics.registerFont(TTFont("Carlito", reg_path))
    pdfmetrics.registerFont(TTFont("Arimo-Bold", bold_path))
    FONT_REGULAR = "Carlito"
    FONT_BOLD = "Arimo-Bold"
except Exception as e:
    sys.stderr.write(f"Warning: Could not load fonts ({e}). Falling back.\n")
    FONT_REGULAR = "Helvetica"
    FONT_BOLD = "Helvetica-Bold"


# =========================================================
# HELPERS
# =========================================================
def format_tare_weight(val):
    if pd.isna(val) or val == "" or val is None:
        return ""
    try:
        fval = float(val)
        if fval == int(fval):
            return str(int(fval))
        return str(fval)
    except (ValueError, TypeError):
        return str(val)


# =========================================================
# READ EXCEL
# =========================================================
def read_excel(excel_path, col_map):
    """Read Excel preserving text, using configurable column mapping."""
    wb = openpyxl.load_workbook(excel_path, data_only=True)

    required_cols = [
        col_map["prospectNo"],
        col_map["cuid"],
        col_map["tareWeight"],
        col_map["state"],
        col_map["branchCode"],
        col_map["branchName"],
    ]
    required_lower = [c.lower() for c in required_cols]

    target_sheet = None
    for sname in wb.sheetnames:
        ws = wb[sname]
        header_row = []
        for cell in next(ws.iter_rows(min_row=1, max_row=1)):
            header_row.append(
                str(cell.value).strip().replace("\n", "") if cell.value is not None else ""
            )
        header_lower = [h.lower() for h in header_row]
        if all(r in header_lower for r in required_lower):
            target_sheet = sname
            break

    if target_sheet is None:
        raise Exception(
            f"No valid sheet found. Required columns: {required_cols}"
        )

    ws = wb[target_sheet]
    headers = []
    for cell in next(ws.iter_rows(min_row=1, max_row=1)):
        headers.append(
            str(cell.value).strip().replace("\n", "") if cell.value is not None else ""
        )

    rows = []
    for row in ws.iter_rows(min_row=2, values_only=False):
        row_data = {}
        all_none = True
        for i, cell in enumerate(row):
            if i < len(headers) and headers[i]:
                val = cell.value
                if val is not None:
                    all_none = False
                # Preserve text for prospect no and cuid
                if headers[i] in (col_map["prospectNo"], col_map["cuid"]):
                    row_data[headers[i]] = str(val).strip() if val is not None else ""
                else:
                    row_data[headers[i]] = val
        if not all_none:
            rows.append(row_data)

    return headers, rows


# =========================================================
# PDF GENERATOR
# =========================================================
def generate_pdf(audit_type, branch_code, branch_name, state, rows, output_path, col_map, pdf_style):
    orientation = pdf_style.get("pageOrientation", "landscape")
    if orientation == "portrait":
        page_size = A4
        PAGE_WIDTH, PAGE_HEIGHT = A4
    else:
        PAGE_WIDTH, PAGE_HEIGHT = landscape(A4)
        page_size = landscape(A4)

    LEFT_MARGIN = 50.2
    RIGHT_MARGIN = 50.2
    TOP_MARGIN = 48.0

    doc = SimpleDocTemplate(
        output_path,
        pagesize=page_size,
        leftMargin=LEFT_MARGIN,
        rightMargin=RIGHT_MARGIN,
        topMargin=TOP_MARGIN,
        bottomMargin=15,
        title=os.path.basename(output_path),
    )

    cw = [22.2, 101.1, 118.5, 60.3, 67.2, 125.0, 247.3]

    font_size = float(pdf_style.get("fontSize", 9))
    style_hdr = ParagraphStyle(
        "ColHdr",
        fontName=FONT_BOLD,
        fontSize=font_size,
        alignment=TA_CENTER,
        leading=10,
        spaceBefore=0,
        spaceAfter=0,
        leftIndent=0,
        rightIndent=0,
        firstLineIndent=0,
    )

    table_data = []

    # Header rows
    table_data.append(["Audit Type :", "", str(audit_type), "", "Branch Name :", "", str(branch_name)])
    table_data.append(["Branch Code :", "", str(branch_code), "", "State :", "", str(state)])

    # Column headers
    table_data.append([
        Paragraph("Sr<br/>No", style_hdr),
        Paragraph("Prospectno", style_hdr),
        Paragraph("CUID", style_hdr),
        Paragraph("Tare Weight<br/>as per Bank", style_hdr),
        Paragraph("<nobr>Tare Weight as</nobr><br/>per Audit", style_hdr),
        Paragraph(
            "<nobr>Purity Check - 18K and</nobr><br/><nobr>above 18K or Below 18K</nobr>",
            style_hdr,
        ),
        Paragraph("Remarks", style_hdr),
    ])

    # Data rows
    for idx, row in enumerate(rows, 1):
        prospectno = str(row.get(col_map["prospectNo"], ""))
        cuid = str(row.get(col_map["cuid"], ""))
        tare_weight = format_tare_weight(row.get(col_map["tareWeight"], ""))
        table_data.append([str(idx), prospectno, cuid, tare_weight, "", "", ""])

    row_height = float(pdf_style.get("rowHeight", 30.5))
    row_heights = [12.2, 14.2, 22.5] + [row_height] * (len(table_data) - 3)

    color1_hex = pdf_style.get("headerColor1", "#FFFF00")
    color2_hex = pdf_style.get("headerColor2", "#4985E8")
    color1 = colors.HexColor(color1_hex)
    color2 = colors.HexColor(color2_hex)

    table = Table(table_data, colWidths=cw, rowHeights=row_heights, repeatRows=3)

    style_cmds = [
        ("SPAN", (0, 0), (1, 0)),
        ("SPAN", (4, 0), (5, 0)),
        ("SPAN", (0, 1), (1, 1)),
        ("SPAN", (4, 1), (5, 1)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("FONTNAME", (0, 0), (-1, 1), FONT_BOLD),
        ("FONTSIZE", (0, 0), (-1, 1), font_size),
        ("FONTNAME", (0, 3), (-1, -1), FONT_REGULAR),
        ("FONTSIZE", (0, 3), (-1, -1), font_size),
        ("FONTNAME", (0, 3), (0, -1), FONT_BOLD),
        ("BACKGROUND", (0, 2), (3, 2), color1),
        ("BACKGROUND", (4, 2), (6, 2), color2),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("LEFTPADDING", (0, 0), (-1, -1), 1),
        ("RIGHTPADDING", (0, 0), (-1, -1), 1),
        ("LINEBEFORE", (0, 0), (0, -1), 0.5, colors.black),
        ("LINEAFTER", (6, 0), (6, -1), 0.5, colors.black),
        ("LINEABOVE", (0, 0), (-1, 0), 0.5, colors.black),
        ("LINEBELOW", (0, -1), (-1, -1), 0.5, colors.black),
        ("GRID", (0, 0), (2, 1), 0.5, colors.black),
        ("GRID", (4, 0), (6, 1), 0.5, colors.black),
        ("GRID", (0, 2), (-1, -1), 0.5, colors.black),
    ]

    table.setStyle(TableStyle(style_cmds))
    doc.build([table])


# =========================================================
# PROCESS EXCEL
# =========================================================
def process_excel(excel_path, output_dir, audit_type, col_map, pdf_style):
    audit_type = str(audit_type).strip().upper()
    os.makedirs(output_dir, exist_ok=True)

    headers, all_rows = read_excel(excel_path, col_map)

    groups = {}
    for row in all_rows:
        branch = str(row.get(col_map["branchCode"], "UNKNOWN")).strip()
        if branch in ("None", ""):
            branch = "UNKNOWN"
        groups.setdefault(branch, []).append(row)

    results = []
    for branch_code, branch_rows in sorted(groups.items()):
        try:
            branch_name = str(branch_rows[0].get(col_map["branchName"], "")).strip()
            state = str(branch_rows[0].get(col_map["state"], "")).strip()
            safe_branch_name = (
                branch_name.replace("/", "_").replace("\\", "_")
            )
            if not safe_branch_name:
                safe_branch_name = str(branch_code).replace("/", "_").replace("\\", "_")

            output_file = os.path.join(output_dir, f"{safe_branch_name}_{audit_type}.pdf")
            generate_pdf(
                audit_type, branch_code, branch_name, state,
                branch_rows, output_file, col_map, pdf_style
            )
            file_size = os.path.getsize(output_file)
            results.append({
                "filename": os.path.basename(output_file),
                "branchCode": branch_code,
                "branchName": branch_name,
                "rowCount": len(branch_rows),
                "fileSize": file_size,
            })
        except Exception as e:
            import traceback
            sys.stderr.write(f"Error for branch {branch_code}: {e}\n{traceback.format_exc()}\n")

    return results


# =========================================================
# MAIN
# =========================================================
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("excel_path")
    parser.add_argument("output_dir")
    parser.add_argument("audit_type")
    parser.add_argument("config_json")
    args = parser.parse_args()

    config = json.loads(args.config_json)
    col_map = config.get("columnMapping", {
        "prospectNo": "Prospectno",
        "cuid": "CUID",
        "tareWeight": "Tare Weight",
        "state": "State",
        "branchCode": "CurrentBranch",
        "branchName": "CurrentBranchName",
    })
    pdf_style = config.get("pdfStyle", {})

    try:
        results = process_excel(args.excel_path, args.output_dir, args.audit_type, col_map, pdf_style)
        print(json.dumps({"success": True, "files": results}))
    except Exception as e:
        import traceback
        sys.stderr.write(traceback.format_exc())
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)
