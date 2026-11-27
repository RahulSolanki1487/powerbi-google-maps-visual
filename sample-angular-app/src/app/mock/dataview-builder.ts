// Turns CSV text into a Power BI "table" DataView, the same shape the visual receives in Power BI.

export const ROLES = [
  'location', 'latitude', 'longitude', 'legend', 'size', 'colorValue', 'pathId', 'pathOrder', 'geometry', 'tooltips'
] as const;
export type Role = (typeof ROLES)[number];

export interface CsvTable { headers: string[]; rows: string[][]; }

/** Default CSV header -> data role mapping for sample-data/sample.csv. */
export const DEFAULT_ROLE_MAP: Record<string, Role> = {
  Location: 'location', Latitude: 'latitude', Longitude: 'longitude', Category: 'legend', Sales: 'size',
  Margin: 'colorValue', RouteId: 'pathId', Seq: 'pathOrder', Geometry: 'geometry'
};

/** Parses CSV with quoted fields, escaped quotes and line breaks inside quotes. */
export function parseCsv(text: string): CsvTable {
  const records: string[][] = [];
  let field = '', record: string[] = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { field += ch; }
    } else if (ch === '"') { inQuotes = true; }
    else if (ch === ',') { record.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') { i++; }
      record.push(field); field = '';
      if (record.some(v => v !== '')) { records.push(record); }
      record = [];
    } else { field += ch; }
  }
  record.push(field);
  if (record.some(v => v !== '')) { records.push(record); }
  const [headers = [], ...rows] = records;
  return { headers, rows };
}

/** A column is numeric when every non-empty cell parses as a number. */
function isNumeric(table: CsvTable, col: number): boolean {
  const values = table.rows.map(r => r[col]).filter(v => v !== undefined && v !== '');
  return values.length > 0 && values.every(v => isFinite(Number(v)));
}

/** Builds the dataView. `roleMap` maps CSV headers to data roles; unmapped columns are left out. */
export function buildDataView(table: CsvTable, roleMap: Record<string, Role | ''>, objects: unknown) {
  const used = table.headers
    .map((name, index) => ({ name, index, role: roleMap[name] }))
    .filter((c): c is { name: string; index: number; role: Role } => !!c.role);

  const columns = used.map((c, i) => {
    const numeric = isNumeric(table, c.index);
    return {
      displayName: c.name,
      queryName: `Table.${c.name}`,
      roles: { [c.role]: true },
      type: numeric ? { numeric: true } : { text: true },
      index: i,
      format: undefined as string | undefined
    };
  });
  const rows = table.rows.map(r => used.map((c, i) => {
    const v = r[c.index];
    if (v === undefined || v === '') { return null; }
    return columns[i].type.numeric ? Number(v) : v;
  }));

  return { metadata: { columns, objects }, table: { columns, rows } };
}
