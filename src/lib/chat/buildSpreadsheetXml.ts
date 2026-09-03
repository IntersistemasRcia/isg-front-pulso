import { coerceNumber, excelColumns, type ExcelSpec } from "@/lib/chat/tabularSpec";

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cellXml(value: unknown): string {
  if (value == null || value === "") {
    return `<Cell><Data ss:Type="String"></Data></Cell>`;
  }
  if (typeof value === "boolean") {
    return `<Cell><Data ss:Type="String">${value ? "Sí" : "No"}</Data></Cell>`;
  }
  const n = coerceNumber(value);
  if (n != null && (typeof value === "number" || /^-?[\d.,\s]+$/.test(String(value).trim()))) {
    return `<Cell ss:StyleID="Number"><Data ss:Type="Number">${n}</Data></Cell>`;
  }
  return `<Cell><Data ss:Type="String">${xmlEscape(String(value))}</Data></Cell>`;
}

function safeSheetName(name?: string): string {
  const raw = (name ?? "Datos").replace(/[\\/?*[\]]/g, " ").trim() || "Datos";
  return xmlEscape(raw.slice(0, 31));
}

export function sanitizeDownloadName(title?: string): string {
  const base = (title ?? "informe-pulso")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_ ]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return `${base || "informe-pulso"}.xls`;
}

/** SpreadsheetML (Excel/LibreOffice). Sin dependencias extra. */
export function buildSpreadsheetXml(spec: ExcelSpec): string {
  const cols = excelColumns(spec);
  const headerCells = cols
    .map((col) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${xmlEscape(col)}</Data></Cell>`)
    .join("");

  const dataRows = spec.data
    .map((row) => `<Row>${cols.map((col) => cellXml(row[col])).join("")}</Row>`)
    .join("\n");

  const titleRow = spec.title
    ? `<Row><Cell ss:MergeAcross="${Math.max(cols.length - 1, 0)}" ss:StyleID="Title"><Data ss:Type="String">${xmlEscape(spec.title)}</Data></Cell></Row>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Title"><Font ss:Bold="1" ss:Size="14" ss:Color="#6A2ED2"/></Style>
  <Style ss:ID="Header">
   <Font ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#FF8A00" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center"/>
  </Style>
  <Style ss:ID="Number"><NumberFormat ss:Format="#,##0.00"/></Style>
 </Styles>
 <Worksheet ss:Name="${safeSheetName(spec.sheetName)}">
  <Table>
   ${titleRow}
   <Row>${headerCells}</Row>
   ${dataRows}
  </Table>
 </Worksheet>
</Workbook>`;
}

export function downloadExcelSpec(spec: ExcelSpec): void {
  const xml = buildSpreadsheetXml(spec);
  const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = sanitizeDownloadName(spec.title);
  link.click();
  URL.revokeObjectURL(url);
}
