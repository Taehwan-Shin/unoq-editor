// 차시별 실습 코드를 ../../소스코드/<번호_이름>/<번호_이름>.ino 로 내보낸다
import { TEMPLATES } from "./src/templates.js";
import { mkdirSync, writeFileSync } from "node:fs";
const names = { blink: "00_연결확인_LED깜빡이", l01: "01_명제_반례감지기", l02: "02_명제_역과대우검사기", l03: "03_명제_충분필요조건판정기", l04: "04_함수_정의역공역치역", l05: "05_함수_합성함수역함수", l06: "06_원의방정식_지오펜스" };
const out = process.argv[2] || "../../소스코드";
for (const [id, dir] of Object.entries(names)) {
  mkdirSync(`${out}/${dir}`, { recursive: true });
  writeFileSync(`${out}/${dir}/${dir}.ino`, TEMPLATES[id].sketch);
  console.log("wrote", dir);
}
