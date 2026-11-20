"use strict";

/**
 * Loads the Google Maps JavaScript API once per visual iframe.
 * The Maps API cannot be re-initialised with a different key in the same page,
 * so a key change requires the report page to be reloaded.
 */

const CALLBACK = "__pbiGoogleMapsReady";
let loadPromise: Promise<void> | null = null;
let loadedKey: string | null = null;
let authFailed = false;
const authListeners: Array<() => void> = [];

export function onAuthFailure(cb: () => void): void {
    authListeners.push(cb);
    if (authFailed) { cb(); }
}

export function isAuthFailed(): boolean {
    return authFailed;
}

export function loadGoogleMaps(apiKey: string): Promise<void> {
    const w = window as any;

    if (loadPromise) {
        if (loadedKey !== apiKey) {
            return Promise.reject(new Error("The API key was changed. Reload the report page to use the new key."));
        }
        return loadPromise;
    }

    if (w.google && w.google.maps && w.google.maps.Map) {
        loadedKey = apiKey;
        loadPromise = Promise.resolve();
        return loadPromise;
    }

    loadedKey = apiKey;
    loadPromise = new Promise<void>((resolve, reject) => {
        // Google calls this global when the key is invalid / not authorised.
        w.gm_authFailure = () => {
            authFailed = true;
            authListeners.forEach(cb => { try { cb(); } catch { /* ignore */ } });
        };

        w[CALLBACK] = () => resolve();

        const params = new URLSearchParams({
            key: apiKey,
            v: "weekly",
            libraries: "marker,geometry",
            loading: "async",
            callback: CALLBACK
        });

        const script = document.createElement("script");
        script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
        script.async = true;
        script.defer = true;
        script.onerror = () => {
            loadPromise = null;
            loadedKey = null;
            reject(new Error(
                "Could not load the Google Maps script. Check the network and that the visual's WebAccess privilege allows maps.googleapis.com."
            ));
        };
        document.head.appendChild(script);
    });

    return loadPromise;
}
