"use strict";

/** What to do after Power BI delivers a chunk (segment) of rows. */
export interface FetchDecision {
    /** Ask Power BI for the next chunk. */
    fetch: boolean;
    /** More rows exist but will not be loaded (switched off or row limit reached). */
    truncated: boolean;
}

/** Decides whether to request another chunk of rows, based on the setting, the row limit and whether Power BI has more. */
export function decideFetchMore(hasMoreSegments: boolean, loadedRows: number, loadAll: boolean, maxRows: number): FetchDecision {
    if (!hasMoreSegments) { return { fetch: false, truncated: false }; }
    if (!loadAll || loadedRows >= maxRows) { return { fetch: false, truncated: true }; }
    return { fetch: true, truncated: false };
}
