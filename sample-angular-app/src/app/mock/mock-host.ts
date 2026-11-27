// A minimal stand-in for Power BI's IVisualHost, just enough for the Google Maps visual.
// The harness types are loose on purpose: the real contract lives in powerbi-visuals-api.

export interface HostLogEntry { time: string; kind: 'render' | 'selection' | 'menu' | 'tooltip'; message: string; }
export type HostLogger = (entry: HostLogEntry) => void;

/** Selection id built for one table row. */
class MockSelectionId {
  constructor(private readonly key: string, readonly rowIndex: number) {}
  getKey() { return this.key; }
  equals(other: MockSelectionId) { return other?.key === this.key; }
  includes(other: MockSelectionId) { return other?.key === this.key; }
  getSelector() { return { data: [], metadata: this.key }; }
  getSelectorsByColumn() { return {}; }
  hasIdentity() { return true; }
}

class MockSelectionManager {
  private selected: MockSelectionId[] = [];
  private callbacks: Array<(ids: MockSelectionId[]) => void> = [];
  constructor(private readonly log: HostLogger) {}

  select(input: MockSelectionId | MockSelectionId[], multi = false): Promise<MockSelectionId[]> {
    const ids = Array.isArray(input) ? input : [input];
    const keys = new Set(ids.map(i => i.getKey()));
    if (multi) {
      const allSelected = ids.every(i => this.selected.some(s => s.equals(i)));
      this.selected = allSelected
        ? this.selected.filter(s => !keys.has(s.getKey()))
        : [...this.selected, ...ids.filter(i => !this.selected.some(s => s.equals(i)))];
    } else {
      const same = this.selected.length === ids.length && ids.every(i => this.selected.some(s => s.equals(i)));
      this.selected = same ? [] : [...ids];
    }
    this.log({ time: now(), kind: 'selection', message: `selected ${this.selected.length} row(s)` });
    this.callbacks.forEach(cb => cb(this.selected));
    return Promise.resolve(this.selected);
  }
  clear(): Promise<void> {
    this.selected = [];
    this.log({ time: now(), kind: 'selection', message: 'selection cleared' });
    this.callbacks.forEach(cb => cb(this.selected));
    return Promise.resolve();
  }
  getSelectionIds() { return this.selected; }
  hasSelection() { return this.selected.length > 0; }
  registerOnSelectCallback(cb: (ids: MockSelectionId[]) => void) { this.callbacks.push(cb); }
  showContextMenu(_id: unknown, point: { x: number; y: number }) {
    this.log({ time: now(), kind: 'menu', message: `context menu at (${Math.round(point?.x)}, ${Math.round(point?.y)})` });
  }
}

/** A small floating tooltip that mimics Power BI's native tooltip. */
class MockTooltipService {
  private el: HTMLDivElement | null = null;
  /** `anchor` is the visual's element: Power BI gives tooltip coordinates relative to it. */
  constructor(private readonly anchor: HTMLElement) {}
  enabled() { return true; }
  show(options: { dataItems: Array<{ displayName: string; value: string }>; coordinates: number[] }) {
    const el = this.ensure();
    el.innerHTML = '';
    options.dataItems.forEach(item => {
      const row = document.createElement('div');
      const name = document.createElement('span');
      name.textContent = `${item.displayName}: `;
      name.style.opacity = '0.7';
      row.append(name, document.createTextNode(item.value));
      el.appendChild(row);
    });
    el.style.display = 'block';
    this.place(options.coordinates);
  }
  move(options: { coordinates: number[] }) { if (this.el) { this.place(options.coordinates); } }
  hide() { if (this.el) { this.el.style.display = 'none'; } }

  private place(c: number[]) {
    if (!this.el) { return; }
    // The element is position:fixed (page coordinates), so add the visual's own offset.
    const origin = this.anchor.getBoundingClientRect();
    this.el.style.left = `${origin.left + (c?.[0] ?? 0) + 12}px`;
    this.el.style.top = `${origin.top + (c?.[1] ?? 0) + 12}px`;
  }
  private ensure(): HTMLDivElement {
    if (!this.el) {
      this.el = document.createElement('div');
      Object.assign(this.el.style, {
        position: 'fixed', zIndex: '10000', background: '#fff', color: '#222', padding: '6px 10px',
        font: '12px Segoe UI, sans-serif', border: '1px solid #ccc', boxShadow: '0 2px 8px rgba(0,0,0,.25)',
        pointerEvents: 'none', display: 'none'
      });
      document.body.appendChild(this.el);
    }
    return this.el;
  }
}

const PALETTE = ['#01B8AA', '#374649', '#FD625E', '#F2C80F', '#5F6B6D', '#8AD4EB', '#FE9666', '#A66999'];

function now() { return new Date().toLocaleTimeString(); }

/** Builds the fake host handed to `new Visual({ element, host })`. */
/** `fetchMore` mimics host.fetchMoreData(): it returns true when another chunk of rows will be delivered. */
export function createMockHost(element: HTMLElement, log: HostLogger, fetchMore: () => boolean = () => false) {
  const colors = new Map<string, string>();
  return {
    createSelectionManager: () => new MockSelectionManager(log),
    createSelectionIdBuilder: () => {
      let row = 0;
      const builder = {
        withTable: (_table: unknown, rowIndex: number) => { row = rowIndex; return builder; },
        createSelectionId: () => new MockSelectionId(`row-${row}`, row)
      };
      return builder;
    },
    colorPalette: {
      getColor: (key: string) => {
        if (!colors.has(key)) { colors.set(key, PALETTE[colors.size % PALETTE.length]); }
        return { value: colors.get(key)! };
      }
    },
    tooltipService: new MockTooltipService(element),
    eventService: {
      renderingStarted: () => log({ time: now(), kind: 'render', message: 'renderingStarted' }),
      renderingFinished: () => log({ time: now(), kind: 'render', message: 'renderingFinished' }),
      renderingFailed: (_o: unknown, reason?: string) => log({ time: now(), kind: 'render', message: `renderingFailed: ${reason ?? ''}` })
    },
    fetchMoreData: (_aggregate?: boolean) => fetchMore(),
    persistProperties: () => undefined,
    launchUrl: (url: string) => window.open(url, '_blank', 'noopener'),
    locale: 'en-US'
  };
}
