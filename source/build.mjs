import * as esbuild from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const out = process.argv[2];
const r = await esbuild.build({
  entryPoints: ["src/main.js"],
  bundle: true,
  format: "iife",
  target: "chrome110",
  minify: true,
  write: false,
  legalComments: "none",
});
const js = r.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const css = readFileSync("node_modules/codemirror/lib/codemirror.css", "utf8");
let html = readFileSync("src/index.html", "utf8");
html = html.replace("/*__CM_CSS__*/", () => css).replace("//__APP_JS__", () => js);
mkdirSync(out.replace(/[\\/][^\\/]+$/, ""), { recursive: true });
writeFileSync(out, html);
console.log("wrote", out, (html.length / 1024).toFixed(0) + " KB");
