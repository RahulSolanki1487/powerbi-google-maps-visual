// Bundles the real visual source (../src/visual.ts) into public/visual/ so the Angular app can load it.
// Usage: node scripts/build-visual.mjs [--watch]
import { build, context } from "esbuild";
import { createRequire } from "node:module";
import { readFile, mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
// The visual's dependencies (formattingmodel, less) live in the repo root node_modules.
const rootRequire = createRequire(path.join(repoRoot, "package.json"));
const less = rootRequire("less");

/** Compiles .less files imported from TypeScript (the visual imports style/visual.less) into CSS. */
const lessPlugin = {
    name: "less",
    setup(b) {
        b.onLoad({ filter: /\.less$/ }, async (args) => {
            const source = await readFile(args.path, "utf8");
            const out = await less.render(source, { filename: args.path });
            return { contents: out.css, loader: "css", watchFiles: out.imports };
        });
    }
};

const options = {
    entryPoints: { visual: path.join(repoRoot, "src", "visual.ts") },
    outdir: path.join(here, "..", "public", "visual"),
    bundle: true,
    format: "iife",
    globalName: "GoogleMapsVisualBundle",
    target: "es2019",
    sourcemap: true,
    nodePaths: [path.join(repoRoot, "node_modules")],
    plugins: [lessPlugin],
    logLevel: "info"
};

// Share the repo's sample CSV with the Angular app.
await mkdir(path.join(here, "..", "public", "sample-data"), { recursive: true });
await copyFile(path.join(repoRoot, "sample-data", "sample.csv"), path.join(here, "..", "public", "sample-data", "sample.csv"));

if (process.argv.includes("--watch")) {
    const ctx = await context(options);
    await ctx.watch();
    console.log("Watching visual sources...");
} else {
    await build(options);
}
