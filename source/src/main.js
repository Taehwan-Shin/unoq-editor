// UNO Q 코드 편집기 — 크롬북(크롬 브라우저)에서 WebUSB + ADB로 Arduino UNO Q에 접속해
// 앱(스케치/파이썬)을 열고, 고치고, 실행하는 웹앱.
import { Adb, AdbDaemonTransport } from "@yume-chan/adb";
import { AdbDaemonWebUsbDevice, AdbDaemonWebUsbDeviceManager } from "@yume-chan/adb-daemon-webusb";
import AdbWebCredentialStore from "@yume-chan/adb-credential-web";
import CodeMirror from "codemirror";
import "codemirror/mode/clike/clike.js";
import "codemirror/mode/python/python.js";
import "codemirror/mode/yaml/yaml.js";
import "codemirror/addon/edit/matchbrackets.js";
import "codemirror/addon/edit/closebrackets.js";
import { TEMPLATES } from "./templates.js";
import { BUNDLED_LIBS } from "./bundled-libs.js";

const APPS_DIR = "/home/arduino/ArduinoApps";
const FILES = {
  sketch: { label: "sketch.ino (아두이노)", rel: "sketch/sketch.ino", mode: "text/x-c++src" },
  python: { label: "main.py (파이썬)", rel: "python/main.py", mode: "python" },
  yaml: { label: "sketch.yaml (라이브러리 설정)", rel: "sketch/sketch.yaml", mode: "yaml" },
};

const $ = (s) => document.querySelector(s);
const enc = new TextEncoder();

const state = {
  adb: null,
  isRoot: false,
  apps: [],
  app: null, // { name, path, docs: { sketch|python: { doc, original, exists } } }
  active: "sketch",
  runningPath: null,
  procs: { run: null, logs: null, monitor: null },
};

// ---------- 안전한 localStorage ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ---------- 셸 유틸 ----------
const q = (s) => "'" + String(s).replace(/'/g, `'\\''`) + "'";

// 보드의 adbd 는 안드로이드용을 옮겨 온 것이라 셸에 안드로이드식 환경변수(TMPDIR=/data/local/tmp 등)를 넣는다.
// arduino-app-cli 가 그 값을 쓰다 실패하므로, 환경변수를 모두 지우고(env -i)
// 보드에 로그인했을 때와 같은 깨끗한 환경을 만들어 명령을 실행한다.
function withLoginEnv(cmd) {
  return (
    'u="$(id -un 2>/dev/null || echo arduino)"; h="$(getent passwd "$u" 2>/dev/null | cut -d: -f6)"; h="${h:-/home/arduino}"; ' +
    'exec env -i HOME="$h" USER="$u" LOGNAME="$u" SHELL=/bin/sh LANG=C.UTF-8 TERM=dumb TMPDIR=/tmp ' +
    'XDG_RUNTIME_DIR="/run/user/$(id -u)" PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin ' +
    `sh -c ${q('cd "$HOME" 2>/dev/null; ' + cmd)}`
  );
}

// 보드 쪽 명령을 실행한다. onText 로 출력(stdout+stderr)을 흘려보내고, done 은 종료 코드를 준다.
async function stream(cmd, onText) {
  const shell = state.adb.subprocess.shellProtocol;
  if (shell) {
    // App Lab 의 `adb shell` 과 같은 shell v2 방식 (종료 코드를 정확히 받는다)
    const proc = await shell.spawn(`sh -c ${q(withLoginEnv(cmd))}`);
    const pump = async (s) => {
      const reader = s.pipeThrough(new TextDecoderStream()).getReader();
      try { for (;;) { const { value, done } = await reader.read(); if (done) break; if (value) onText(value); } } catch {}
    };
    const done = Promise.all([pump(proc.stdout), pump(proc.stderr)]).then(() => proc.exited).catch(() => -1);
    return { done, kill: () => { try { proc.kill(); } catch {} } };
  }
  return streamLegacy(cmd, onText);
}

async function sh(cmd) {
  let out = "";
  const p = await stream(cmd, (t) => (out += t));
  const rc = await p.done;
  return { out, rc };
}

// shell v2 를 지원하지 않는 adbd 용: 출력 끝에 종료 코드를 덧붙여 읽는다
async function streamLegacy(cmd, onText) {
  const proc = await state.adb.subprocess.noneProtocol.spawn(`sh -c ${q(withLoginEnv(cmd + " 2>&1; __rc=$?; echo; echo __RC=$__rc"))}`);
  let rc = -1;
  const done = (async () => {
    const reader = proc.output.pipeThrough(new TextDecoderStream()).getReader();
    let tail = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const text = tail + value;
        // 마지막 줄은 __RC 표시일 수 있으므로 붙잡아 둔다
        const cut = text.lastIndexOf("\n");
        const ready = cut >= 0 ? text.slice(0, cut + 1) : "";
        tail = cut >= 0 ? text.slice(cut + 1) : text;
        const cleaned = ready.replace(/^__RC=(\d+)\s*$/m, (_, n) => { rc = Number(n); return ""; });
        if (cleaned) onText(cleaned);
      }
    } catch {}
    const m = tail.match(/__RC=(\d+)/);
    if (m) rc = Number(m[1]); else if (tail) onText(tail);
    return rc;
  })();
  return { done, kill: () => { try { proc.kill(); } catch {} } };
}

async function readFile(path) {
  const sync = await state.adb.sync();
  try {
    const chunks = [];
    const reader = sync.read(path).getReader();
    for (;;) { const { value, done } = await reader.read(); if (done) break; chunks.push(value); }
    const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
    return new TextDecoder().decode(all);
  } finally { await sync.dispose(); }
}

async function writeFile(path, text) {
  const dir = path.slice(0, path.lastIndexOf("/"));
  await sh(`mkdir -p ${q(dir)}`);
  const bytes = enc.encode(text);
  const sync = await state.adb.sync();
  try {
    await sync.write({
      filename: path,
      file: new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }),
      permission: 0o644,
    });
  } finally { await sync.dispose(); }
  // adb가 root로 접속된 경우 App Lab에서도 열 수 있도록 소유자를 arduino로 돌려놓는다
  if (state.isRoot) await sh(`chown -R arduino:arduino ${q(dir)}`);
}

// ---------- 출력 패널 ----------
const outputs = { run: $("#out-run"), monitor: $("#out-monitor"), term: $("#out-term") };
function print(where, text, cls) {
  const el = outputs[where];
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  const span = document.createElement("span");
  if (cls) span.className = cls;
  span.textContent = text;
  el.appendChild(span);
  // 너무 길어지면 앞부분 삭제
  while (el.childNodes.length > 4000) el.removeChild(el.firstChild);
  if (atBottom) el.scrollTop = el.scrollHeight;
}
function showTab(name) {
  document.querySelectorAll(".out-tab").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === name));
  document.querySelectorAll(".out-pane").forEach((p) => (p.hidden = p.dataset.pane !== name));
}
document.querySelectorAll(".out-tab").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
$("#btn-copy").addEventListener("click", async () => {
  // 오류 보고용: 실행 기록 + 터미널 + 모니터를 한 번에 복사
  const text = ["[실행 기록]", outputs.run.textContent, "[터미널]", outputs.term.textContent, "[모니터]", outputs.monitor.textContent.slice(-2000)].join("\n");
  try { await navigator.clipboard.writeText(text); toast("기록을 복사했어요. 메신저나 메일에 붙여 넣어 보내 주세요."); }
  catch { toast("복사하지 못했어요. 기록을 드래그해서 직접 복사해 주세요.", "error"); }
});
$("#btn-clear").addEventListener("click", () => {
  const pane = document.querySelector(".out-pane:not([hidden]) pre");
  if (pane) pane.textContent = "";
});

function toast(msg, kind = "info") {
  const t = $("#toast");
  t.textContent = msg;
  t.dataset.kind = kind;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), kind === "error" ? 7000 : 3500);
}

// ---------- 편집기 ----------
const editor = CodeMirror($("#editor"), {
  lineNumbers: true,
  matchBrackets: true,
  autoCloseBrackets: true,
  indentUnit: 2,
  tabSize: 2,
  indentWithTabs: false,
  mode: FILES.sketch.mode,
  extraKeys: {
    "Ctrl-S": () => saveAll(),
    "Ctrl-Enter": () => runApp(),
    Tab: (cm) => (cm.somethingSelected() ? cm.indentSelection("add") : cm.replaceSelection("  ")),
  },
});
editor.setOption("readOnly", "nocursor");

let fontSize = store.get("unoq.fontSize", 16);
function applyFont() { document.documentElement.style.setProperty("--code-size", fontSize + "px"); editor.refresh(); store.set("unoq.fontSize", fontSize); }
$("#btn-font-up").addEventListener("click", () => { fontSize = Math.min(32, fontSize + 2); applyFont(); });
$("#btn-font-down").addEventListener("click", () => { fontSize = Math.max(12, fontSize - 2); applyFont(); });
applyFont();

function isDirty(key) { const f = state.app?.docs[key]; return !!f && f.doc.getValue() !== f.original; }
function anyDirty() { return !!state.app && Object.keys(FILES).some(isDirty); }

function renderFileTabs() {
  const box = $("#file-tabs");
  box.innerHTML = "";
  if (!state.app) return;
  for (const key of Object.keys(FILES)) {
    const f = state.app.docs[key];
    const b = document.createElement("button");
    b.className = "file-tab";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", key === state.active);
    b.textContent = FILES[key].label + (isDirty(key) ? " ●" : "") + (f.exists ? "" : " (없음)");
    b.addEventListener("click", () => switchFile(key));
    box.appendChild(b);
  }
  checkSerialHint();
}

function switchFile(key) {
  state.active = key;
  editor.swapDoc(state.app.docs[key].doc);
  editor.setOption("readOnly", false);
  renderFileTabs();
  editor.focus();
}

// Serial → Monitor 안내 (UNO Q는 Serial이 USB가 아닌 TX/RX 핀으로 나감)
function checkSerialHint() {
  const hint = $("#serial-hint");
  if (!state.app) { hint.hidden = true; return; }
  const code = state.app.docs.sketch.doc.getValue();
  hint.hidden = !/\bSerial\s*\.\s*(print|println|begin|write)\b/.test(code);
}
$("#btn-convert").addEventListener("click", () => {
  const d = state.app.docs.sketch.doc;
  let code = d.getValue();
  code = code.replace(/\bSerial\s*\.\s*begin\s*\([^)]*\)/g, "Monitor.begin()");
  code = code.replace(/\bSerial(\s*\.\s*(print|println|write|available|read)\b)/g, "Monitor$1");
  if (!/#include\s*<Arduino_RouterBridge\.h>/.test(code)) code = "#include <Arduino_RouterBridge.h>\n" + code;
  d.setValue(code);
  if (state.active !== "sketch") switchFile("sketch");
  toast("Serial을 Monitor로 바꿨어요. 저장 후 실행해 보세요.");
});

editor.on("change", () => { renderFileTabs(); updateButtons(); });

// ---------- 연결 ----------
function setStatus(text, kind) {
  const s = $("#status");
  s.textContent = text;
  s.dataset.kind = kind;
}

function updateButtons() {
  const on = !!state.adb;
  $("#btn-connect").textContent = on ? "연결 끊기" : "보드 연결";
  $("#btn-connect").classList.toggle("primary", !on);
  for (const id of ["#btn-new", "#btn-refresh", "#term-input", "#term-run", "#btn-monitor"]) $(id).disabled = !on;
  const hasApp = on && !!state.app;
  $("#btn-save").disabled = !hasApp || !anyDirty();
  $("#btn-run").disabled = !hasApp;
  $("#btn-stop").disabled = !on || !state.runningPath;
  $("#btn-open-local").disabled = !state.app;
  $("#btn-download").disabled = !state.app;
  $("#btn-logs").disabled = !hasApp;
}

async function connect() {
  const manager = AdbDaemonWebUsbDeviceManager.BROWSER;
  if (!manager) {
    toast("이 브라우저에서는 USB 연결(WebUSB)을 쓸 수 없어요. 크롬에서 https 주소로 열어 주세요.", "error");
    return;
  }
  let device;
  try {
    device = await manager.requestDevice();
  } catch (e) {
    toast("장치 선택 중 오류: " + e.message, "error");
    return;
  }
  if (!device) return; // 사용자가 취소
  setStatus("연결 중… (처음에는 10초쯤 걸려요)", "busy");
  try {
    const connection = await device.connect();
    const transport = await AdbDaemonTransport.authenticate({
      serial: device.serial,
      connection,
      credentialStore: new AdbWebCredentialStore("UNO Q 코드 편집기"),
    });
    state.adb = new Adb(transport);
    transport.disconnected.then(() => onDisconnected());
    const who = await sh("id -u; hostname");
    const [uid, host] = who.out.trim().split(/\s+/);
    state.isRoot = uid === "0";
    setStatus(`연결됨 · ${host || device.name}`, "ok");
    print("term", `# ${host} 에 연결됨 (uid=${uid}, ${state.adb.subprocess.shellProtocol ? "shell v2" : "exec"})\n`, "dim");
    updateButtons();
    await refreshApps();
    await checkBoard();
    state.libsReady = ensureLibraries();
    await state.libsReady;
  } catch (e) {
    console.error(e);
    state.adb = null;
    setStatus("연결 안 됨", "off");
    if (e instanceof AdbDaemonWebUsbDevice.DeviceBusyError || /claim|busy|Access denied/i.test(e.message)) {
      toast("보드를 다른 곳에서 쓰고 있어요. 다른 탭(App Lab, 다른 편집기 창)을 닫고 USB를 다시 꽂아 주세요.", "error");
    } else {
      toast("연결 실패: " + e.message + " — USB를 다시 꽂고 30초 뒤 다시 시도해 보세요.", "error");
    }
    updateButtons();
  }
}

function onDisconnected() {
  if (!state.adb) return;
  state.adb = null;
  state.runningPath = null;
  for (const k of Object.keys(state.procs)) state.procs[k] = null;
  setStatus("연결 끊김", "off");
  toast("보드와 연결이 끊겼어요. 편집 중인 코드는 화면에 그대로 있어요. 다시 연결 후 저장하세요.", "error");
  updateButtons();
}

$("#btn-connect").addEventListener("click", async () => {
  if (state.adb) {
    const adb = state.adb;
    try { await adb.close(); } catch {}
    onDisconnected();
  } else {
    await connect();
  }
});

// ---------- 앱 목록 ----------
async function refreshApps() {
  const r = await sh(`mkdir -p ${q(APPS_DIR)}; for d in ${APPS_DIR}/*/; do [ -d "$d" ] && basename "$d"; done`);
  state.apps = r.out.split("\n").map((s) => s.trim()).filter(Boolean).sort();
  renderApps();
}

function renderApps() {
  const ul = $("#app-list");
  ul.innerHTML = "";
  if (!state.apps.length) {
    ul.innerHTML = `<li class="empty">아직 앱이 없어요.<br>‘＋ 새 앱’을 눌러 만들어 보세요.</li>`;
    return;
  }
  for (const name of state.apps) {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.className = "app-item";
    b.textContent = name;
    if (state.app?.name === name) b.setAttribute("aria-current", "true");
    if (state.runningPath === `${APPS_DIR}/${name}`) b.dataset.running = "true";
    b.addEventListener("click", () => openApp(name));
    li.appendChild(b);
    ul.appendChild(li);
  }
}
$("#btn-refresh").addEventListener("click", () => refreshApps());

async function openApp(name) {
  if (anyDirty() && !confirm("저장하지 않은 변경 내용이 있어요. 버리고 다른 앱을 열까요?")) return;
  const path = `${APPS_DIR}/${name}`;
  const docs = {};
  for (const [key, f] of Object.entries(FILES)) {
    const full = `${path}/${f.rel}`;
    const exists = (await sh(`test -f ${q(full)}`)).rc === 0;
    const text = exists ? await readFile(full) : "";
    docs[key] = { doc: CodeMirror.Doc(text, f.mode), original: text, exists };
  }
  state.app = { name, path, docs };
  $("#app-title").textContent = name;
  switchFile(docs.sketch.exists || !docs.python.exists ? "sketch" : "python");
  renderApps();
  updateButtons();
  closeSidebarOnMobile();
}

// ---------- 저장 / 실행 / 정지 ----------
async function saveAll() {
  if (!state.adb || !state.app) return false;
  try {
    for (const key of Object.keys(FILES)) {
      const f = state.app.docs[key];
      const text = f.doc.getValue();
      if (text === f.original) continue;
      await writeFile(`${state.app.path}/${FILES[key].rel}`, text);
      f.original = text;
      f.exists = true;
    }
    renderFileTabs();
    updateButtons();
    toast("보드에 저장했어요.");
    return true;
  } catch (e) {
    toast("저장 실패: " + e.message, "error");
    return false;
  }
}
$("#btn-save").addEventListener("click", saveAll);

// 실행에 꼭 필요한 파일이 빠져 있으면 공식 템플릿 내용으로 채운다
const DEFAULT_SKETCH_YAML = "profiles:\n  default:\n    platforms:\n      - platform: arduino:zephyr\n    libraries:\ndefault_profile: default\n";
async function ensureSketchYaml(path) {
  const ino = `${path}/sketch/sketch.ino`, yml = `${path}/sketch/sketch.yaml`;
  if ((await sh(`test -f ${q(ino)} && ! test -f ${q(yml)}`)).rc === 0) {
    await writeFile(yml, DEFAULT_SKETCH_YAML);
    return true;
  }
  return false;
}

// ---------- 오프라인 라이브러리 설치 ----------
// 보드가 인터넷에 연결되지 않아도 컴파일되도록, Monitor(Arduino_RouterBridge)가 필요로 하는
// 라이브러리를 arduino-cli 의 프로필 캐시 폴더에 직접 넣어 둔다.
// 폴더 이름 규칙은 arduino-cli 의 InternalUniqueIdentifier 와 같다: 이름_버전_sha256("이름@버전") 앞 16자리
const LIB_CACHE = "/home/arduino/.arduino15/internal";
async function libDirName(lib) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(`${lib.name}@${lib.version}`)));
  const hex = [...h].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
  return `${lib.name}_${lib.version}_${hex}`;
}
async function ensureLibraries() {
  for (const lib of BUNDLED_LIBS) {
    const root = `${LIB_CACHE}/${await libDirName(lib)}`;
    if ((await sh(`test -d ${q(`${root}/${lib.name}`)}`)).rc === 0) continue;
    // 임시 폴더에 다 쓴 뒤 이름을 바꿔서, 중간에 끊겨도 반쯤 설치된 폴더가 남지 않게 한다
    const tmp = `${root}.tmp`;
    await sh(`rm -rf ${q(tmp)}`);
    try {
      for (const [rel, text] of Object.entries(lib.files)) await writeFile(`${tmp}/${lib.name}/${rel}`, text);
      const r = await sh(`rm -rf ${q(root)} && mv ${q(tmp)} ${q(root)}`);
      if (r.rc !== 0) throw new Error(r.out.trim());
      print("run", `라이브러리 ${lib.name} ${lib.version} 을(를) 보드에 넣었어요 (인터넷 없이 컴파일 가능).\n`, "ok");
    } catch (e) {
      print("run", `라이브러리 ${lib.name} 설치 실패: ${e.message}\n`, "err");
    }
  }
}

// 연결 직후 보드 프로그램이 이 방식으로 실행되는지 확인한다
async function checkBoard() {
  const r = await sh("arduino-app-cli version 2>&1");
  if (r.rc === 0) {
    print("run", `보드 프로그램 확인: ${r.out.trim().split("\n")[0]}\n`, "dim");
    return;
  }
  showTab("run");
  print("run", `✘ 보드에서 arduino-app-cli 를 실행하지 못했어요 (코드 ${r.rc}).\n${r.out}\n`, "err");
  print("run", "  → 이 화면의 [기록 복사]를 눌러 선생님께 보내 주세요.\n", "err");
}

async function runApp() {
  if (!state.adb || !state.app) return;
  if (!(await saveAll())) return;
  if (state.libsReady) await state.libsReady; // 연결 직후 라이브러리 설치가 끝날 때까지 기다림
  const path = state.app.path;
  stopProc("monitor");
  stopProc("run");
  showTab("run");
  outputs.run.textContent = "";
  if (await ensureSketchYaml(path)) {
    await openApp(state.app.name);
    print("run", "sketch.yaml 이 없어서 기본 설정으로 만들었어요.\n", "dim");
  }
  print("run", `▶ ${state.app.name} 실행 준비 중… (스케치 컴파일·업로드에 30초~1분 걸릴 수 있어요)\n`, "info");
  if (state.runningPath && state.runningPath !== path) {
    await sh(`arduino-app-cli app stop ${q(state.runningPath)}`);
  }
  state.runningPath = path;
  updateButtons();
  $("#btn-run").disabled = true;
  setStatus("실행 준비 중…", "busy");
  let log = "";
  const p = await stream(`arduino-app-cli app start ${q(path)}`, (t) => { log += t; print("run", t); });
  state.procs.run = p;
  const rc = await p.done;
  state.procs.run = null;
  if (!state.adb || state.runningPath !== path) return; // 도중에 정지됨
  if (rc === 0) {
    print("run", `\n✔ 실행 중입니다. ‘모니터’ 탭에서 보드가 보내는 글자를 볼 수 있어요.\n`, "ok");
    setStatus(`실행 중 · ${state.app.name}`, "ok");
    startMonitor();
  } else {
    print("run", `\n✘ 실행에 실패했어요 (코드 ${rc}). 위의 오류 줄(error:)을 확인하세요. 해결이 안 되면 [기록 복사]를 눌러 보내 주세요.\n`, "err");
    if (/Library install failed|Error downloading|dial tcp|no such host|lookup .*(refused|timeout)/i.test(log)) {
      const lib = (log.match(/Downloading library (\S+)/) || [])[1] || "알 수 없음";
      print("run", `  → 보드가 인터넷에 연결되어 있지 않아 라이브러리(${lib})를 받지 못했어요.\n` +
        "    이 웹앱에 들어 있지 않은 라이브러리예요. 보드를 Wi-Fi에 한 번 연결해서 실행하거나,\n" +
        "    [기록 복사]로 이 기록을 보내 주시면 웹앱에 추가할게요. (사용안내 ‘보드 Wi-Fi 연결’ 참고)\n", "err");
    } else if (/Arduino_RouterBridge\.h.*(No such file|not found)/i.test(log)) {
      print("run", "  → sketch.yaml 에 Arduino_RouterBridge 라이브러리가 없어요. ‘sketch.yaml’ 탭의 libraries: 아래에 추가하거나, App Lab에서 이 앱에 라이브러리를 추가해 주세요.\n", "err");
    }
    state.runningPath = null;
    setStatus("연결됨", "ok");
  }
  renderApps();
  updateButtons();
}
$("#btn-run").addEventListener("click", runApp);

async function stopApp() {
  if (!state.adb || !state.runningPath) return;
  stopProc("monitor");
  stopProc("logs");
  stopProc("run");
  const r = await sh(`arduino-app-cli app stop ${q(state.runningPath)} 2>&1`);
  print("run", `■ 정지했어요.\n${r.out}`, "info");
  state.runningPath = null;
  setStatus("연결됨", "ok");
  renderApps();
  updateButtons();
}
$("#btn-stop").addEventListener("click", stopApp);

function stopProc(k) {
  if (state.procs[k]) { state.procs[k].kill(); state.procs[k] = null; }
}

async function startMonitor() {
  if (!state.adb) return;
  stopProc("monitor");
  print("monitor", "── 모니터 연결 ──\n", "dim");
  const p = await stream("arduino-app-cli monitor", (t) => print("monitor", t));
  state.procs.monitor = p;
  $("#btn-monitor").textContent = "모니터 끊기";
  p.done.then(() => {
    if (state.procs.monitor === p) state.procs.monitor = null;
    $("#btn-monitor").textContent = "모니터 연결";
  });
}
$("#btn-monitor").addEventListener("click", () => {
  showTab("monitor");
  if (state.procs.monitor) { stopProc("monitor"); $("#btn-monitor").textContent = "모니터 연결"; }
  else startMonitor();
});

$("#btn-logs").addEventListener("click", async () => {
  showTab("run");
  stopProc("logs");
  print("run", `\n── ${state.app.name} 로그 (최근 100줄, 계속 표시) ──\n`, "dim");
  state.procs.logs = await stream(`arduino-app-cli app logs ${q(state.app.path)} --follow`, (t) => print("run", t));
});

// ---------- 새 앱 ----------
const dlg = $("#dlg-new");
const tplSel = $("#new-template");
const groups = {};
for (const [id, t] of Object.entries(TEMPLATES)) {
  if (!groups[t.group]) {
    groups[t.group] = document.createElement("optgroup");
    groups[t.group].label = t.group;
    tplSel.appendChild(groups[t.group]);
  }
  const o = document.createElement("option");
  o.value = id;
  o.textContent = t.title;
  groups[t.group].appendChild(o);
}

// 차시를 고르면 앱 이름을 자동으로 채운다 (이미 있으면 -2, -3 …)
let nameTouched = false;
$("#new-name").addEventListener("input", () => (nameTouched = true));
function suggestName() {
  const slug = TEMPLATES[tplSel.value].slug;
  if (!slug) return "";
  let name = slug;
  for (let i = 2; state.apps.includes(name); i++) name = `${slug}-${i}`;
  return name;
}
tplSel.addEventListener("change", () => {
  $("#new-desc").textContent = TEMPLATES[tplSel.value].desc;
  if (!nameTouched) $("#new-name").value = suggestName();
  store.set("unoq.lastTemplate", tplSel.value);
});
const lastTpl = store.get("unoq.lastTemplate", "l01");
if (TEMPLATES[lastTpl]) tplSel.value = lastTpl;
tplSel.dispatchEvent(new Event("change"));

$("#btn-new").addEventListener("click", () => {
  nameTouched = false;
  $("#new-name").value = suggestName();
  dlg.showModal();
  tplSel.focus();
});
$("#new-cancel").addEventListener("click", () => dlg.close());
$("#new-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const name = $("#new-name").value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(name)) {
    toast("이름은 영어 소문자·숫자·-·_ 만 쓸 수 있어요. 예: team3-counter", "error");
    return;
  }
  if (state.apps.includes(name)) { toast("같은 이름의 앱이 이미 있어요.", "error"); return; }
  dlg.close();
  setStatus("앱 만드는 중…", "busy");
  showTab("run");
  const r = await sh(`arduino-app-cli app new ${q(name)} 2>&1`);
  print("run", `$ arduino-app-cli app new ${name}\n${r.out}\n`, r.rc === 0 ? "" : "err");
  const m = r.out.match(new RegExp(APPS_DIR.replace(/\//g, "\\/") + "\\/([^\\s'\"]+)"));
  let folder = m ? m[1].replace(/\/$/, "") : "";
  if (!folder) {
    // 출력에서 경로를 못 찾으면 가장 최근에 만들어진 폴더를 쓴다
    const latest = (await sh(`ls -td ${APPS_DIR}/*/ 2>/dev/null | head -1`)).out.trim().replace(/\/$/, "");
    folder = r.rc === 0 && latest ? latest.split("/").pop() : name;
  }
  if (r.rc !== 0) {
    // CLI가 실패하면 공식 템플릿과 같은 구조를 직접 만든다
    await writeFile(`${APPS_DIR}/${folder}/app.yaml`, `name: ${name}\nicon: 📐\nports: []\nbricks: []\n`);
    await writeFile(`${APPS_DIR}/${folder}/python/main.py`, `from arduino.app_utils import App\n\nApp.run()\n`);
  }
  await ensureSketchYaml(`${APPS_DIR}/${folder}`);
  const tpl = TEMPLATES[tplSel.value];
  if (tpl.sketch) await writeFile(`${APPS_DIR}/${folder}/sketch/sketch.ino`, tpl.sketch);
  setStatus("연결됨", "ok");
  await refreshApps();
  await openApp(folder);
  toast(`‘${folder}’ 앱을 만들었어요.`);
});

// ---------- 크롬북 파일 열기 / 내려받기 ----------
$("#btn-open-local").addEventListener("click", () => $("#local-file").click());
$("#local-file").addEventListener("change", async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = "";
  if (!file || !state.app) return;
  const key = /\.py$/i.test(file.name) ? "python" : "sketch";
  const text = await file.text();
  if (state.app.docs[key].doc.getValue().trim() && !confirm(`지금 ${FILES[key].label} 내용을 ‘${file.name}’ 내용으로 바꿀까요?`)) return;
  state.app.docs[key].doc.setValue(text);
  switchFile(key);
  toast(`‘${file.name}’을 불러왔어요. 저장하면 보드에 들어가요.`);
});
$("#btn-download").addEventListener("click", () => {
  const key = state.active;
  const blob = new Blob([state.app.docs[key].doc.getValue()], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${state.app.name}_${FILES[key].rel.split("/").pop()}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ---------- 터미널 ----------
$("#term-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const cmd = $("#term-input").value.trim();
  if (!cmd || !state.adb) return;
  $("#term-input").value = "";
  print("term", `$ ${cmd}\n`, "info");
  const p = await stream(cmd, (t) => print("term", t));
  const rc = await p.done;
  if (rc !== 0) print("term", `(종료 코드 ${rc})\n`, "err");
});

// ---------- 모바일 사이드바 ----------
function closeSidebarOnMobile() { document.body.classList.remove("sidebar-open"); }
$("#btn-apps").addEventListener("click", () => document.body.classList.toggle("sidebar-open"));

window.addEventListener("beforeunload", (e) => { if (anyDirty()) { e.preventDefault(); e.returnValue = ""; } });

// ---------- 시작 ----------
if (!("usb" in navigator)) {
  $("#nousb").hidden = false;
}
editor.setValue("// 1) 위의 [보드 연결]을 눌러 UNO Q를 고르세요.\n// 2) 왼쪽에서 앱을 고르거나 [＋ 새 앱]을 만드세요.\n// 3) 코드를 고치고 [▶ 저장 후 실행]을 누르세요.\n");
showTab("run");
updateButtons();
