import { Component, ElementRef, OnDestroy, afterNextRender, signal, viewChild } from '@angular/core';
import { createMockHost, HostLogEntry } from './mock/mock-host';
import {
  CsvTable, DEFAULT_ROLE_MAP, ROLES, Role, buildDataView, parseCsv
} from './mock/dataview-builder';
import { VisualInstance, loadVisualClass } from './visual-loader';
import { Scenario } from './scenarios/scenario';
import { SetupGuide } from './setup-guide/setup-guide';
import { SCENARIOS } from './scenarios/scenarios';

const KEY_STORAGE = 'gmv-harness-api-key';
// Power BI VisualUpdateType flags.
const UPDATE_DATA = 2;
const UPDATE_RESIZE = 4;

@Component({
  selector: 'app-root',
  imports: [SetupGuide],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnDestroy {
  protected readonly roles = ROLES;
  protected readonly apiKey = signal(localStorage.getItem(KEY_STORAGE) ?? '');
  protected readonly table = signal<CsvTable>({ headers: [], rows: [] });
  protected readonly roleMap = signal<Record<string, Role | ''>>({ ...DEFAULT_ROLE_MAP });
  protected readonly scenarios = SCENARIOS;
  protected readonly scenario = signal<Scenario | null>(null);
  protected readonly objectsText = signal('{}');
  protected readonly error = signal('');
  protected readonly showSetup = signal(new URLSearchParams(location.search).has('setup'));
  protected readonly log = signal<HostLogEntry[]>([]);
  protected readonly dataName = signal('');

  private readonly container = viewChild.required<ElementRef<HTMLDivElement>>('visualHost');
  private visual: VisualInstance | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    afterNextRender(() => {
      this.mountVisual().then(() => this.selectScenario(this.initialScenario()));
      this.resizeObserver = new ResizeObserver(() => this.render(UPDATE_RESIZE));
      this.resizeObserver.observe(this.container().nativeElement);
    });
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
    this.visual?.destroy?.();
  }

  /** `?scenario=<id>` in the URL opens that example directly. */
  private initialScenario(): Scenario {
    const id = new URLSearchParams(location.search).get('scenario');
    return this.scenarios.find(s => s.id === id) ?? this.scenarios[0];
  }

  protected onKey(value: string) {
    this.apiKey.set(value.trim());
    localStorage.setItem(KEY_STORAGE, this.apiKey());
  }

  protected setRole(header: string, role: string) {
    this.roleMap.update(m => ({ ...m, [header]: role as Role | '' }));
    this.render();
  }

  protected setObjects(text: string) { this.objectsText.set(text); }

  protected async onFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) { return; }
    this.scenario.set(null);
    this.applyCsv(await file.text(), file.name);
  }

  /** Loads a scenario's data, role mapping and format settings, then redraws the map. */
  protected async selectScenario(s: Scenario) {
    this.scenario.set(s);
    let data = s.table;
    if (!data && s.csvUrl) { data = parseCsv(await (await fetch(s.csvUrl)).text()); }
    this.table.set(data ?? { headers: [], rows: [] });
    this.dataName.set(s.csvUrl ?? s.title);
    this.roleMap.set({ ...s.roles });
    this.objectsText.set(JSON.stringify(s.objects, null, 2).replaceAll('{origin}', location.origin));
    this.render();
  }

  protected apply() { this.render(); }

  /** Rebuilds the visual from the freshly built bundle (use after editing the visual's source). */
  protected async remount() { await this.mountVisual(true); }

  protected clearLog() { this.log.set([]); }

  private applyCsv(text: string, name: string) {
    const table = parseCsv(text);
    this.table.set(table);
    this.dataName.set(name);
    // Auto-map headers that match a role name or the sample's column names.
    const map: Record<string, Role | ''> = {};
    table.headers.forEach(h => {
      const lower = h.toLowerCase();
      map[h] = DEFAULT_ROLE_MAP[h] ?? ROLES.find(r => r.toLowerCase() === lower) ?? '';
    });
    this.roleMap.set(map);
    this.render();
  }

  private async mountVisual(reload = false) {
    try {
      this.error.set('');
      const Visual = await loadVisualClass(reload);
      this.visual?.destroy?.();
      const host = this.container().nativeElement;
      host.replaceChildren();
      const element = document.createElement('div');
      element.style.cssText = 'width:100%;height:100%';
      host.appendChild(element);
      this.visual = new Visual({
        element,
        host: createMockHost(entry => this.log.update(l => [entry, ...l].slice(0, 200)))
      });
      this.render();
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }

  private render(type = UPDATE_DATA) {
    if (!this.visual) { return; }
    let objects: Record<string, Record<string, unknown>>;
    try {
      objects = JSON.parse(this.objectsText());
      this.error.set('');
    } catch (e) {
      this.error.set(`Format objects JSON is invalid: ${(e as Error).message}`);
      return;
    }
    objects['mapSettings'] = { ...objects['mapSettings'], apiKey: this.apiKey() };

    const el = this.container().nativeElement;
    const dataView = buildDataView(this.table(), this.roleMap(), objects);
    this.visual.update({
      dataViews: [dataView],
      viewport: { width: el.clientWidth, height: el.clientHeight },
      type,
      viewMode: 1,
      editMode: 0,
      operationKind: 0,
      jsonFilters: []
    });
  }
}
