#!/usr/bin/env python3
"""
Persistent PDF Worker - processes multiple jobs without restarting Python.
Reads JSON jobs from stdin, writes results to stdout.
"""
import os
import sys
import json
import re
import signal
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

FONT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts")
os.makedirs(FONT_DIR, exist_ok=True)

CARLITO_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/carlito/Carlito-Regular.ttf"
ARIMO_BOLD_URL = "https://raw.githubusercontent.com/googlefonts/arimo/main/fonts/ttf/Arimo-Bold.ttf"

reg_path = os.path.join(FONT_DIR, "Carlito-Regular.ttf")
bold_path = os.path.join(FONT_DIR, "Arimo-Bold.ttf")

def download_font(url, path):
    if not os.path.exists(path):
        sys.stderr.write(f"Downloading font -> {os.path.basename(path)}...\n")
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req) as resp, open(path, "wb") as out:
                out.write(resp.read())
        except Exception as e:
            sys.stderr.write(f"Failed to download font: {e}\n")

download_font(CARLITO_URL, reg_path)
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

def format_number(val):
    if pd.isna(val) or val == "" or val is None:
        return ""
    try:
        fval = float(val)
        return str(int(fval)) if fval == int(fval) else str(fval)
    except (ValueError, TypeError):
        return str(val)

def hex_to_color(hex_str):
    try:
        return colors.HexColor(hex_str)
    except Exception:
        return colors.white

def generate_pdf(excel_path, output_dir, audit_type, config):
    column_mapping = config.get("columnMapping", {})
    pdf_style = config.get("pdfStyle", {})

    branch_group_by = column_mapping.get("branchGroupBy", "Branch Code")
    branch_name_col = column_mapping.get("branchNameCol", "Branch Name")
    state_col = column_mapping.get("stateCol", "State")
    columns = column_mapping.get("columns", [])

    page_orientation = pdf_style.get("pageOrientation", "landscape")
    header_color1 = hex_to_color(pdf_style.get("headerColor1", "#4472C4"))
    header_color2 = hex_to_color(pdf_style.get("headerColor2", "#B4C7E7"))
    font_size = pdf_style.get("fontSize", 9)
    row_height = pdf_style.get("rowHeight", 20)
    header_row_height = pdf_style.get("headerRowHeight", 25)

    page_size = landscape(A4) if page_orientation == "landscape" else portrait(A4)

    df = pd.read_excel(excel_path, dtype=str)
    df = df.fillna("")

    if branch_group_by not in df.columns:
        return {"success": False, "error": f"Column '{branch_group_by}' not found in Excel"}

    branches = df.groupby(branch_group_by)
    generated_files = []
    total_rows = 0

    for branch_code, group in branches:
        branch_code_str = str(branch_code) if branch_code else "Unknown"
        branch_name = str(group[branch_name_col].iloc[0]) if branch_name_col in group.columns else branch_code_str

        safe_branch_code = re.sub(r"[^\w\-]", "_", branch_code_str)[:50]
        safe_branch_name = re.sub(r"[^\w\-]", "_", branch_name)[:50]
        filename = f"{safe_branch_code}_{safe_branch_name}.pdf"
        filepath = os.path.join(output_dir, filename)

        pdf_doc = SimpleDocTemplate(
            filepath,
            pagesize=page_size,
            leftMargin=20,
            rightMargin=20,
            topMargin=30,
            bottomMargin=30
        )

        elements = []

        title_style = ParagraphStyle(
            "Title",
            fontName=FONT_BOLD,
            fontSize=14,
            textColor=colors.HexColor("#2F4F4F"),
            alignment=TA_CENTER,
            spaceAfter=10
        )
        elements.append(Paragraph(f"{audit_type} - Branch: {branch_name}", title_style))

        if state_col in group.columns and state_col in df.columns:
            state = str(group[state_col].iloc[0])
            elements.append(Paragraph(f"State: {state}", title_style))

        headers = []
        col_widths = []
        for col in columns:
            header_text = col.get("header", "").replace("\\n", "<br/>")
            headers.append(Paragraph(f"<b>{header_text}</b>", ParagraphStyle("Header", fontName=FONT_BOLD, fontSize=font_size)))
            col_widths.append(col.get("width", 80))

        table_data = [headers]

        for _, row in group.iterrows():
            row_data = []
            for col in columns:
                excel_col = col.get("excelColumn")
                if excel_col and excel_col in row:
                    val = row[excel_col]
                    if col.get("dataType") == "number":
                        val = format_number(val)
                    cell_style = ParagraphStyle(
                        "Cell",
                        fontName=FONT_REGULAR,
                        fontSize=font_size,
                        alignment=TA_CENTER if col.get("dataType") == "number" else 0
                    )
                    row_data.append(Paragraph(str(val) if val else "", cell_style))
                else:
                    row_data.append("")
            table_data.append(row_data)

        table = Table(table_data, colWidths=col_widths if col_widths else None)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), header_color1 if len(table_data) % 2 == 1 else header_color2),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("FONTNAME", (0, 0), (-1, 0), FONT_BOLD),
            ("FONTSIZE", (0, 0), (-1, 0), font_size),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
            ("BACKGROUND", (0, 1), (-1, -1), colors.white),
            ("FONTNAME", (0, 1), (-1, -1), FONT_REGULAR),
            ("FONTSIZE", (0, 1), (-1, -1), font_size),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F2F2F2")]),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("TOPPADDING", (0, 1), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 1), (-1, -1), 4),
        ]))
        elements.append(table)

        pdf_doc.build(elements)
        file_size = os.path.getsize(filepath)
        generated_files.append({
            "filename": filename,
            "branchCode": branch_code_str,
            "branchName": branch_name,
            "rowCount": len(group),
            "fileSize": file_size
        })
        total_rows += len(group)

    return {"success": True, "files": generated_files, "totalRows": total_rows}

def main():
    import os
    import sys
    
    # Unbuffered output
    sys.stdout = os.fdopen(sys.stdout.fileno(), 'w', buffering=1)
    sys.stderr = os.fdopen(sys.stderr.fileno(), 'w', buffering=1)
    
    signal.signal(signal.SIGINT, lambda s, f: sys.exit(0))
    signal.signal(signal.SIGTERM, lambda s, f: sys.exit(0))

    sys.stderr.write("started\n")
    sys.stderr.flush()

    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break

            job_data = json.loads(line.strip())
            excel_path = job_data["excelPath"]
            output_dir = job_data["outputDir"]
            audit_type = job_data["auditType"]
            config = job_data["config"]

            result = generate_pdf(excel_path, output_dir, audit_type, config)
            print(json.dumps(result), flush=True)
            sys.stderr.write(f"Job completed: {excel_path}\n")
            sys.stderr.flush()
        except json.JSONDecodeError:
            print(json.dumps({"success": False, "error": "Invalid JSON"}), flush=True)
        except Exception as e:
            print(json.dumps({"success": False, "error": str(e)}), flush=True)
            sys.stderr.write(f"Error: {e}\n")
            sys.stderr.flush()

if __name__ == "__main__":
    main()