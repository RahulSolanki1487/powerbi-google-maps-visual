import { CsvTable, Role } from '../mock/dataview-builder';

/** One menu entry: the data, the column→role mapping and the format settings that demonstrate a feature. */
export interface Scenario {
  id: string;
  title: string;
  /** What to look for on the map. */
  description: string;
  /** Needs the Geocoding API enabled on the key. */
  needsGeocoding?: boolean;
  /** Load the table from a CSV file under public/ instead of `table`. */
  csvUrl?: string;
  table?: CsvTable;
  roles: Record<string, Role>;
  /** Format-pane settings (capabilities.json "objects"). `{origin}` in strings is replaced by the page origin. */
  objects: Record<string, Record<string, unknown>>;
}

/** Builds a CsvTable from rows of values; undefined/null become empty cells. */
export function table(headers: string[], rows: Array<Array<string | number | null | undefined>>): CsvTable {
  return { headers, rows: rows.map(r => r.map(v => (v === undefined || v === null ? '' : String(v)))) };
}
