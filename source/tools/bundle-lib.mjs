// 보드가 인터넷 없이 컴파일할 수 있도록, 라이브러리 배포 zip을 풀어 둔 폴더를 src/bundled-libs.js 로 만든다.
// 사용: node tools/bundle-lib.mjs <이름> <버전> <압축 푼 폴더> [<이름> <버전> <폴더> ...]
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const SKIP = new Set(["examples", "tests", "extras", ".github"]);
function walk(dir, root, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (!SKIP.has(name)) walk(p, root, out); }
    else out[relative(root, p).split("\\").join("/")] = readFileSync(p, "utf8");
  }
  return out;
}

const args = process.argv.slice(2);
const libs = [];
for (let i = 0; i < args.length; i += 3) {
  libs.push({ name: args[i], version: args[i + 1], files: walk(args[i + 2], args[i + 2], {}) });
}
writeFileSync("src/bundled-libs.js",
  "// 자동 생성 파일 (tools/bundle-lib.mjs). 각 라이브러리의 원래 LICENSE 파일을 함께 담고 있다.\n" +
  "export const BUNDLED_LIBS = " + JSON.stringify(libs, null, 1) + ";\n");
console.log(libs.map((l) => `${l.name}@${l.version}: ${Object.keys(l.files).length} files`).join("\n"));
