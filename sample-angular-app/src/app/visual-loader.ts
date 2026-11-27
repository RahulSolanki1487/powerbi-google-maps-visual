// Loads the visual bundle that scripts/build-visual.mjs writes to public/visual/.

export interface VisualInstance { update(options: unknown): void; destroy?(): void; }
export type VisualCtor = new (options: { element: HTMLElement; host: unknown }) => VisualInstance;

let loading: Promise<VisualCtor> | null = null;

/** Injects visual.js once and resolves with the Visual class. Pass `reload` to fetch a fresh bundle. */
export function loadVisualClass(reload = false): Promise<VisualCtor> {
  if (loading && !reload) { return loading; }
  loading = new Promise<VisualCtor>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `visual/visual.js?t=${Date.now()}`;
    script.onload = () => {
      const bundle = (window as any).GoogleMapsVisualBundle;
      bundle?.Visual ? resolve(bundle.Visual) : reject(new Error('visual.js loaded but exports no Visual'));
    };
    script.onerror = () => reject(new Error('Could not load visual/visual.js. Run "npm run build:visual" first.'));
    document.head.appendChild(script);
  });
  return loading;
}
