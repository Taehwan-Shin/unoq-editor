// 📐 수학 화면: 스케치가 보내는 '@'로 시작하는 줄을 읽어 진리집합·그래프·좌표평면으로 그린다.
//
//   @begin <차시>            설정 묶음 시작 (sendMath)
//   @set P <시작> <0101…>     진리집합: 전체집합 원소마다 조건의 참(1)/거짓(0)
//   @func <xmin> <xmax> <ymin> <ymax>   정의역·공역
//   @tab <이름> <시작 x> <값…>          함숫값 표
//   @circle <a> <b> <r>       원의 중심과 반지름
//   @end                      설정 묶음 끝 → 지난 실행과 비교
//   @x <x>  @count …  @comp …  @pt <x> <y>  @n <n>   실시간 값
import { GUIDES } from "./templates.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const emptyCfg = (lesson = null) => ({ lesson, sets: {}, func: null, tabs: {}, circle: null });
const emptyLive = () => ({ x: null, fails: 0, hist: new Map(), count: null, comp: null, pt: null, trail: [], found: [], n: null, got: false });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------- 집합 도우미 ----------
const bitsOf = (set) => (set ? [...set.bits].map((c) => c === "1") : []);
const minus = (A, B) => A.map((v, i) => v && !B[i]);
const notB = (A) => A.map((v) => !v);
const subset = (A, B) => A.every((v, i) => !v || B[i]);
function runs(A, from = 0) {
  const out = [];
  let s = -1;
  A.forEach((v, i) => {
    if (v && s < 0) s = i;
    if (!v && s >= 0) { out.push([from + s, from + i - 1]); s = -1; }
  });
  if (s >= 0) out.push([from + s, from + A.length - 1]);
  return out;
}
function fmtSet(A, from = 0) {
  const r = runs(A, from);
  if (!r.length) return "∅ (공집합)";
  if (r.length === 1 && r[0][0] === from && r[0][1] === from + A.length - 1) return "U 전체";
  return "{ x | " + r.map(([a, b]) => (a === b ? `x = ${a}` : `${a} ≤ x ≤ ${b}`)).join(" 또는 ") + " }";
}
const fmtRuns = (A, from = 0) => {
  const r = runs(A, from);
  return r.length ? r.map(([a, b]) => (a === b ? `${a}` : `${a}~${b}`)).join(", ") : "없음";
};

function conclusion(P, Q) {
  const pq = subset(P, Q), qp = subset(Q, P);
  if (pq && qp) return "p는 q이기 위한 필요충분조건";
  if (pq) return "p는 q이기 위한 충분조건";
  if (qp) return "p는 q이기 위한 필요조건";
  return "p는 q이기 위한 충분조건도 필요조건도 아님";
}

const tabArr = (t, from, to) => { const a = []; for (let x = from; x <= to; x++) a.push(t?.[x]); return a; };
const tabRange = (t) => { const ks = Object.keys(t || {}).map(Number); return ks.length ? [Math.min(...ks), Math.max(...ks)] : [0, -1]; };

// ---------- 지난 실행과 비교 ----------
function describeChanges(a, b) {
  const out = [];
  if (b.lesson === "l01" || b.lesson === "l02" || b.lesson === "l03") {
    const [P0, Q0, P1, Q1] = [bitsOf(a.sets.P), bitsOf(a.sets.Q), bitsOf(b.sets.P), bitsOf(b.sets.Q)];
    if (!same(P0, P1)) out.push(`P : ${fmtSet(P0)} → <b>${fmtSet(P1)}</b>`);
    if (!same(Q0, Q1)) out.push(`Q : ${fmtSet(Q0)} → <b>${fmtSet(Q1)}</b>`);
    if (out.length) {
      const bad0 = fmtRuns(minus(P0, Q0)), bad1 = fmtRuns(minus(P1, Q1));
      if (bad0 !== bad1) out.push(`p→q의 반례 구간 : ${bad0} → <b>${bad1}</b>`);
      if (b.lesson === "l02") {
        const c0 = fmtRuns(minus(Q0, P0)), c1 = fmtRuns(minus(Q1, P1));
        if (c0 !== c1) out.push(`역 q→p의 반례 구간 : ${c0} → <b>${c1}</b>`);
      }
      const k0 = conclusion(P0, Q0), k1 = conclusion(P1, Q1);
      if (b.lesson === "l03" && k0 !== k1) out.push(`결론 : ${k0} → <b>${k1}</b>`);
      if (b.lesson !== "l03" && subset(P0, Q0) !== subset(P1, Q1)) out.push(`명제 p→q : ${subset(P0, Q0) ? "참" : "거짓"} → <b>${subset(P1, Q1) ? "참" : "거짓"}</b>`);
    }
  } else if (b.lesson === "l04" && a.func && b.func) {
    const fa = a.func, fb = b.func;
    if (fa.xmin !== fb.xmin || fa.xmax !== fb.xmax) out.push(`정의역 : ${fa.xmin}~${fa.xmax} → <b>${fb.xmin}~${fb.xmax}</b>`);
    if (fa.ymin !== fb.ymin || fa.ymax !== fb.ymax) out.push(`공역 : ${fa.ymin}~${fa.ymax} → <b>${fb.ymin}~${fb.ymax}</b>`);
    if (!same(a.tabs.f, b.tabs.f)) {
      const ex = [fb.xmin, Math.round((fb.xmin + fb.xmax) / 2), fb.xmax];
      out.push("함숫값 : " + ex.map((x) => `f(${x}) = ${a.tabs.f?.[x] ?? "?"} → <b>${b.tabs.f?.[x]}</b>`).join(", "));
      const [r0, r1] = [funcInfo(a), funcInfo(b)];
      out.push(`치역 : ${r0.rangeText} → <b>${r1.rangeText}</b>`);
      if (r0.ok !== r1.ok) out.push(`f는 X→Y 함수? ${r0.ok ? "예" : "아니오"} → <b>${r1.ok ? "예" : "아니오"}</b>`);
    }
  } else if (b.lesson === "l05") {
    const names = { f: "f", g: "g", fg: "f∘g", gf: "g∘f", back: "f⁻¹∘f" };
    const ch = Object.keys(names).filter((k) => !same(a.tabs[k], b.tabs[k]));
    if (ch.includes("f") || ch.includes("g")) out.push(`f(1) = ${a.tabs.f?.[1]} → <b>${b.tabs.f?.[1]}</b>, g(1) = ${a.tabs.g?.[1]} → <b>${b.tabs.g?.[1]}</b>`);
    if (ch.length) {
      const [c0, c1] = [compInfo(a), compInfo(b)];
      out.push(`g∘f = f∘g 인 x : ${c0.same}개 → <b>${c1.same}개</b> (전체 ${c1.n}개)`);
      out.push(`f⁻¹(f(x)) = x 인 x : ${c0.back}개 → <b>${c1.back}개</b>`);
    }
  } else if (b.lesson === "l06" && a.circle && b.circle) {
    const [c0, c1] = [a.circle, b.circle];
    if (c0.a !== c1.a || c0.b !== c1.b) out.push(`중심 : (${c0.a}, ${c0.b}) → <b>(${c1.a}, ${c1.b})</b>`);
    if (c0.r !== c1.r) out.push(`반지름 : ${c0.r} → <b>${c1.r}</b> (r² = ${c0.r * c0.r} → ${c1.r * c1.r})`);
    if (out.length) out.push(`원 위의 격자점 : ${latticeOn(c0).length}개 → <b>${latticeOn(c1).length}개</b>`);
  }
  return out;
}

function funcInfo(c) {
  const { xmin, xmax, ymin, ymax } = c.func;
  const ys = tabArr(c.tabs.f, xmin, xmax).filter((v) => v !== undefined);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const bad = [];
  for (let x = xmin; x <= xmax; x++) { const y = c.tabs.f?.[x]; if (y !== undefined && (y < ymin || y > ymax)) bad.push(x); }
  const distinct = new Set(ys).size;
  return { lo, hi, bad, ok: !bad.length, rangeText: ys.length ? `${lo} ~ ${hi} (원소 ${distinct}개)` : "?" };
}
function compInfo(c) {
  const [lo, hi] = tabRange(c.tabs.gf);
  let s = 0, b = 0, n = 0;
  for (let x = lo; x <= hi; x++) { n++; if (c.tabs.gf[x] === c.tabs.fg?.[x]) s++; if (c.tabs.back?.[x] === x) b++; }
  return { same: s, back: b, n };
}
const LIM = 10;
function latticeOn({ a, b, r }) {
  const out = [];
  for (let x = -LIM; x <= LIM; x++) for (let y = -LIM; y <= LIM; y++) if ((x - a) ** 2 + (y - b) ** 2 === r * r) out.push([x, y]);
  return out;
}
const where = ({ a, b, r }, x, y) => { const d = (x - a) ** 2 + (y - b) ** 2, r2 = r * r; return d < r2 ? "in" : d === r2 ? "on" : "out"; };

// ---------- 그림 ----------
// 수직선 위 진리집합 막대 (전체집합 U = {0..60})
function svgSets(rows, opt) {
  const N = rows[0].bits.length || 61, from = 0;
  const X0 = 150, W = 520, cw = W / N, rowH = 24, gap = 8, top = 34;
  const bottom = top + rows.length * (rowH + gap) - gap;
  const H = bottom + 64;
  const cx = (x) => X0 + (x - from + 0.5) * cw;
  let s = `<svg class="m-svg" data-kind="line" data-x0="${X0}" data-cw="${cw}" data-n="${N}" viewBox="0 0 ${X0 + W + 16} ${H}" role="img" aria-label="진리집합 수직선">`;
  rows.forEach((r, i) => {
    const y = top + i * (rowH + gap);
    s += `<text x="${X0 - 10}" y="${y + rowH / 2}" class="m-lbl" text-anchor="end" dominant-baseline="central">${r.label}</text>`;
    s += `<rect x="${X0}" y="${y}" width="${W}" height="${rowH}" class="m-track" rx="4"/>`;
    for (const [a, b] of runs(r.bits)) s += `<rect x="${X0 + a * cw}" y="${y}" width="${(b - a + 1) * cw}" height="${rowH}" rx="4" fill="var(${r.color})"/>`;
    if (r.ghost) for (const [a, b] of runs(r.ghost)) s += `<rect x="${X0 + a * cw + 1}" y="${y + 1}" width="${(b - a + 1) * cw - 2}" height="${rowH - 2}" rx="4" class="m-ghost"/>`;
    if (r.dots) for (const [x, bad] of r.dots) s += `<circle cx="${cx(x)}" cy="${y + rowH / 2}" r="${Math.min(cw / 2.2, 5)}" fill="var(${bad ? "--m-bad" : "--m-dot"})"/>`;
  });
  // 축
  const ay = bottom + 12;
  s += `<line x1="${X0}" y1="${ay}" x2="${X0 + W}" y2="${ay}" class="m-axis"/>`;
  for (let x = from; x < from + N; x += 5) {
    const big = x % 10 === 0;
    s += `<line x1="${cx(x)}" y1="${ay - (big ? 6 : 3)}" x2="${cx(x)}" y2="${ay + (big ? 6 : 3)}" class="m-axis"/>`;
    if (big) s += `<text x="${cx(x)}" y="${ay + 22}" class="m-tick" text-anchor="middle">${x}</text>`;
  }
  s += `<text x="${X0 - 10}" y="${ay + 22}" class="m-tick" text-anchor="end">x (cm)</text>`;
  // 지금 x / 고른 x
  const mark = (x, cls, label, ty) => {
    const inU = x >= from && x < from + N;
    const px = inU ? cx(x) : x < from ? X0 - 4 : X0 + W + 4;
    let m = `<line x1="${px}" y1="${top - 6}" x2="${px}" y2="${ay}" class="${cls}"/>`;
    m += `<path d="M${px - 7} ${top - 16} L${px + 7} ${top - 16} L${px} ${top - 5} Z" class="${cls}-head"/>`;
    m += `<text x="${Math.min(Math.max(px, X0 + 30), X0 + W - 30)}" y="${ty}" class="m-mark-text" text-anchor="middle">${esc(label)}${inU ? "" : " (U 밖)"}</text>`;
    return m;
  };
  if (opt.probe != null) s += mark(opt.probe, "m-probe", `고른 x = ${opt.probe}`, 12);
  if (opt.x != null) s += mark(opt.x, "m-now", `x = ${opt.x}`, opt.probe != null && Math.abs(opt.probe - opt.x) < 9 ? H - 4 : 12);
  return s + "</svg>";
}

// 좌표평면 그래프 틀
function niceStep(span) {
  const raw = span / 6, p = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 5, 10].map((m) => m * p).find((v) => v >= raw) || p * 10;
}
function frame({ xLo, xHi, yLo, yHi, W = 660, H = 320, padL = 56, padR = 20, padT = 14, padB = 34, kind, label }) {
  const gx = (x) => padL + ((x - xLo) / (xHi - xLo || 1)) * (W - padL - padR);
  const gy = (y) => H - padB - ((y - yLo) / (yHi - yLo || 1)) * (H - padT - padB);
  let s = `<svg class="m-svg" data-kind="${kind}" data-xlo="${xLo}" data-xhi="${xHi}" data-pl="${padL}" data-pr="${padR}" data-w="${W}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">`;
  const ys = niceStep(yHi - yLo);
  for (let y = Math.ceil(yLo / ys) * ys; y <= yHi; y += ys) {
    s += `<line x1="${padL}" y1="${gy(y)}" x2="${W - padR}" y2="${gy(y)}" class="m-grid"/>`;
    s += `<text x="${padL - 6}" y="${gy(y)}" class="m-tick" text-anchor="end" dominant-baseline="central">${y}</text>`;
  }
  const xs = niceStep(xHi - xLo);
  for (let x = Math.ceil(xLo / xs) * xs; x <= xHi; x += xs) {
    s += `<line x1="${gx(x)}" y1="${padT}" x2="${gx(x)}" y2="${H - padB}" class="m-grid"/>`;
    s += `<text x="${gx(x)}" y="${H - padB + 18}" class="m-tick" text-anchor="middle">${x}</text>`;
  }
  s += `<line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" class="m-axis"/><line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}" class="m-axis"/>`;
  if (yLo < 0 && yHi > 0) s += `<line x1="${padL}" y1="${gy(0)}" x2="${W - padR}" y2="${gy(0)}" class="m-axis"/>`;
  return { s, gx, gy, W, H, padL, padR, padT, padB };
}
function yBounds(vals, extra = []) {
  const v = [...vals, ...extra].filter((n) => Number.isFinite(n));
  let lo = Math.min(...v), hi = Math.max(...v);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.06;
  return [lo - pad, hi + pad];
}

// ---------- 화면 ----------
export function createMathView(root, store) {
  let app = null, hint = null, phase = "idle";
  let cfg = emptyCfg(), pending = null, saved = null, prev = null, changes = null;
  let live = emptyLive(), probe = null, lastLine = "", queued = false;
  const checks = () => store.get(`unoq.mathChecks.${app}`, {});

  function render() {
    queued = false;
    const show = cfg.lesson ? cfg : saved;
    const lesson = show?.lesson || hint;
    const guide = GUIDES[lesson];
    let h = "";

    // 상태 줄
    const banner = {
      idle: show ? "" : "▶ <b>저장 후 실행</b>을 누르면 보드가 계산한 결과가 여기에 그림으로 나타나요.",
      building: "⏳ 보드에서 코드를 컴파일·업로드하는 중이에요 (30초~1분).",
      running: cfg.lesson ? "" : "보드가 보내는 첫 데이터를 기다리는 중…",
      failed: "✘ 실행하지 못했어요. 아래 ‘실행 기록’의 오류를 확인하세요.",
    }[phase];
    if (banner) h += `<p class="m-banner" data-phase="${phase}">${banner}</p>`;
    if (phase === "building" && guide?.predict) h += `<p class="m-predict">🤔 <b>예상해 보기</b> — ${esc(guide.predict)}</p>`;

    // 이번 실행에서 바뀐 것
    if (cfg.lesson && changes) {
      h += changes.length
        ? `<div class="m-changes"><div class="m-h">🔁 이번 실행에서 바뀐 것</div><ul>${changes.map((c) => `<li>${c}</li>`).join("")}</ul><div class="m-note">점선 = 바꾸기 전</div></div>`
        : `<div class="m-changes m-same">🔁 조건·식이 지난 실행과 같아요. 코드의 <b>★ 학생 수정 영역</b>을 바꾸고 다시 실행해 보세요.</div>`;
    }

    if (show) {
      const dim = !cfg.lesson; // 다시 실행 중이면 지난 그림을 흐리게
      h += `<div class="m-fig${dim ? " m-dim" : ""}">${figure(show, dim ? emptyLive() : live)}</div>`;
    } else if (lastLine && phase === "running") {
      h += `<div class="m-fig"><p class="m-big">${esc(lastLine)}</p><p class="m-note">이 코드는 수학 화면용 정보(@줄)를 보내지 않아요. [＋ 새 앱]에서 차시 코드를 고르면 그림으로 볼 수 있어요.</p></div>`;
    }

    // 해 볼 것
    if (guide) {
      const ck = checks();
      h += `<details class="m-guide" open><summary>🧭 무엇을 볼까요?</summary><p>${esc(guide.look)}</p><ol>` +
        guide.steps.map((st, i) => `<li><label><input type="checkbox" data-step="${i}"${ck[i] ? " checked" : ""}> <b>${esc(st.do)}</b></label><span>→ ${esc(st.see)}</span></li>`).join("") +
        "</ol></details>";
    }
    root.innerHTML = h;
  }

  function figure(c, L) {
    switch (c.lesson) {
      case "l01": case "l02": case "l03": return figSets(c, L);
      case "l04": return figFunc(c, L);
      case "l05": return figComp(c, L);
      case "l06": return figCircle(c, L);
      case "blink": return `<p class="m-big">n = ${L.n ?? "…"}</p><p class="m-note">LED가 한 번 깜빡일 때마다 n이 1씩 커져요 (수열 1, 2, 3, …).</p>`;
      default: return "";
    }
  }

  function sensorNote(L) {
    return L.fails >= 3 ? `<p class="m-warn">⚠ 초음파 센서 값이 들어오지 않아요 (x = 999). Trig → D2, Echo → D3, VCC·GND 배선을 확인하세요. 그동안 그림을 눌러 x를 직접 골라 볼 수 있어요.</p>` : "";
  }

  function figSets(c, L) {
    const P = bitsOf(c.sets.P), Q = bitsOf(c.sets.Q);
    if (!P.length || !Q.length) return "";
    const gP = prev && bitsOf(prev.sets.P), gQ = prev && bitsOf(prev.sets.Q);
    const PQ = minus(P, Q), QP = minus(Q, P), contra = minus(notB(Q), notB(P));
    const badOf = (x) => (c.lesson === "l03" ? false : !!PQ[x]);
    const dots = [...L.hist.keys()].filter((x) => x >= 0 && x < P.length).map((x) => [x, badOf(x)]);
    const rows = [
      { label: "P (초록불)", bits: P, color: "--m-p", ghost: gP },
      { label: "Q (파랑불)", bits: Q, color: "--m-q", ghost: gQ },
    ];
    if (c.lesson === "l01") rows.push({ label: "반례 P−Q", bits: PQ, color: "--m-bad", ghost: prev && minus(gP, gQ) });
    if (c.lesson === "l02") {
      rows.push({ label: "명제 p→q 반례", bits: PQ, color: "--m-bad", ghost: prev && minus(gP, gQ) });
      rows.push({ label: "역 q→p 반례", bits: QP, color: "--m-bad", ghost: prev && minus(gQ, gP) });
      rows.push({ label: "대우 ~q→~p 반례", bits: contra, color: "--m-bad", ghost: prev && minus(notB(gQ), notB(gP)) });
    }
    if (c.lesson === "l03") {
      rows.push({ label: "P−Q", bits: PQ, color: "--m-bad", ghost: prev && minus(gP, gQ) });
      rows.push({ label: "Q−P", bits: QP, color: "--m-bad2", ghost: prev && minus(gQ, gP) });
    }
    rows.push({ label: "센서로 잰 x", bits: P.map(() => false), color: "--m-dot", dots });
    let h = svgSets(rows, { x: L.x, probe });

    // 지금 x 읽기
    const readX = (x, who) => {
      if (x == null) return "";
      const inU = x >= 0 && x < P.length;
      if (!inU) return `<p class="m-read">${who} x = ${x} cm → 전체집합 U = {0, …, ${P.length - 1}} 밖이에요.</p>`;
      const tf = (v) => (v ? `<span class="m-t">참</span>` : `<span class="m-f">거짓</span>`);
      let t = `<p class="m-read">${who} <b>x = ${x}</b> → p(${x}) ${tf(P[x])}, q(${x}) ${tf(Q[x])}`;
      if (c.lesson !== "l03" && PQ[x]) t += ` <span class="m-alert">⚠ p→q의 반례!</span>`;
      if (c.lesson === "l02" && QP[x]) t += ` <span class="m-alert">역의 반례</span>`;
      return t + "</p>";
    };
    h += sensorNote(L) + readX(L.x, "📡 지금") + readX(probe, "🖱 고른");
    h += `<p class="m-hint">수직선을 누르거나 끌면 x를 직접 골라 볼 수 있어요.</p>`;

    // 결론
    h += `<div class="m-facts"><div>P = ${fmtSet(P)}</div><div>Q = ${fmtSet(Q)}</div>`;
    if (c.lesson === "l01") {
      h += subset(P, Q)
        ? `<div class="m-ok">P ⊂ Q (P−Q = ∅) → 명제 p → q 는 <b>참</b></div>`
        : `<div class="m-no">P ⊄ Q, 반례 x = ${fmtRuns(PQ)} → 명제 p → q 는 <b>거짓</b></div>`;
    } else if (c.lesson === "l02") {
      const row = (name, bad) => `<tr><td>${name}</td><td>${fmtRuns(bad)}</td><td>${bad.some(Boolean) ? `<span class="m-f">거짓</span>` : `<span class="m-t">참</span>`}</td>`;
      const cnt = L.count;
      h += `<table class="m-table"><tr><th>명제</th><th>반례가 되는 x</th><th>참/거짓</th>${cnt ? "<th>센서 반례</th>" : ""}</tr>` +
        row("명제 p→q", PQ) + (cnt ? `<td>${cnt[1]}</td>` : "") + "</tr>" +
        row("역 q→p", QP) + (cnt ? `<td>${cnt[2]}</td>` : "") + "</tr>" +
        row("대우 ~q→~p", contra) + (cnt ? `<td>${cnt[3]}</td>` : "") + "</tr></table>";
      if (cnt) h += `<div class="m-note">센서 측정 ${cnt[0]}회</div>`;
      h += `<div class="m-ok">명제와 대우의 반례 구간은 늘 같아요 → 참·거짓이 같아요.</div>`;
    } else {
      const pq = subset(P, Q), qp = subset(Q, P);
      h += `<div>P ⊂ Q ? <b>${pq ? "예" : "아니오"}</b>${pq ? "" : ` (P−Q: ${fmtRuns(PQ)})`} · Q ⊂ P ? <b>${qp ? "예" : "아니오"}</b>${qp ? "" : ` (Q−P: ${fmtRuns(QP)})`}</div>`;
      h += `<div class="m-ok">결론: <b>${conclusion(P, Q)}</b></div>`;
    }
    return h + "</div>";
  }

  function figFunc(c, L) {
    if (!c.func) return "";
    const { xmin, xmax, ymin, ymax } = c.func;
    const info = funcInfo(c);
    const ys = tabArr(c.tabs.f, xmin, xmax);
    const gys = prev?.tabs.f ? Object.values(prev.tabs.f) : [];
    const xHi = xmax + Math.max(5, Math.round((xmax - xmin) * 0.25));
    const [yLo, yHi] = yBounds(ys, [ymin, ymax, ...gys]);
    const F = frame({ xLo: xmin - 1, xHi, yLo, yHi, padL: 92, padR: 74, kind: "func", label: "함수 y=f(x)의 그래프" });
    const { gx, gy, W, H, padT, padB } = F;
    let s = F.s;
    s += `<rect x="${gx(xmin - 1)}" y="${gy(ymax)}" width="${gx(xHi) - gx(xmin - 1)}" height="${gy(ymin) - gy(ymax)}" class="m-codomain"/>`;
    s += `<text x="${W - 70}" y="${gy(ymax) + 14}" class="m-tick">공역 Y</text>`;
    s += `<rect x="${gx(xmax + 0.5)}" y="${padT}" width="${gx(xHi) - gx(xmax + 0.5)}" height="${H - padT - padB}" class="m-outside"/>`;
    s += `<text x="${(gx(xmax + 0.5) + gx(xHi)) / 2}" y="${padT + 14}" class="m-tick" text-anchor="middle">정의역 밖</text>`;
    // 치역 막대
    if (ys.some((v) => v !== undefined)) {
      s += `<line x1="40" y1="${gy(info.hi)}" x2="40" y2="${gy(info.lo)}" class="m-range"/>`;
      s += `<text x="31" y="${(gy(info.hi) + gy(info.lo)) / 2}" class="m-tick" text-anchor="end" dominant-baseline="central">치역</text>`;
    }
    for (const [x, y] of Object.entries(prev?.tabs.f || {})) s += `<circle cx="${gx(+x)}" cy="${gy(y)}" r="3" class="m-ghost-dot"/>`;
    ys.forEach((y, i) => { if (y !== undefined) s += `<circle cx="${gx(xmin + i)}" cy="${gy(y)}" r="3.4" fill="var(${y < ymin || y > ymax ? "--m-bad" : "--m-q"})"/>`; });
    // 지금 x
    const cur = probe ?? L.x;
    let read = "";
    if (cur != null) {
      const y = c.tabs.f?.[cur];
      if (y !== undefined) {
        const bad = y < ymin || y > ymax;
        s += `<line x1="${gx(cur)}" y1="${gy(yLo)}" x2="${gx(cur)}" y2="${gy(y)}" class="m-now"/><line x1="${gx(xmin - 1)}" y1="${gy(y)}" x2="${gx(cur)}" y2="${gy(y)}" class="m-now"/>`;
        s += `<circle cx="${gx(cur)}" cy="${gy(y)}" r="7.5" class="m-cur"/>`;
        const lv = bad ? 0 : (y - ymin) / (ymax - ymin || 1);
        s += `<circle cx="${W - 36}" cy="${padT + 52}" r="20" fill="var(--m-q)" fill-opacity="${(0.08 + lv * 0.92).toFixed(2)}" stroke="var(--m-q)" stroke-width="2"/>`;
        s += `<text x="${W - 36}" y="${padT + 92}" class="m-tick" text-anchor="middle">LED ${bad ? "⚠" : Math.round(lv * 100) + "%"}</text>`;
        read = `<p class="m-read">${probe != null ? "🖱 고른" : "📡 지금"} <b>x = ${cur}</b> → f(${cur}) = <b>${y}</b> ${bad ? `<span class="m-alert">⚠ 공역 Y 밖</span>` : `→ 파랑 LED 밝기 ${y}/${ymax}`}</p>`;
      } else {
        s += `<line x1="${gx(Math.min(cur, xHi))}" y1="${padT}" x2="${gx(Math.min(cur, xHi))}" y2="${gy(yLo)}" class="m-probe"/>`;
        read = `<p class="m-read">${probe != null ? "🖱 고른" : "📡 지금"} x = ${cur} → 정의역 X 밖이라 대응하는 값이 없어요 (초록불).</p>`;
      }
    }
    s += "</svg>";
    let h = s + sensorNote(L) + read + `<p class="m-hint">그래프를 누르면 x를 직접 골라 볼 수 있어요.</p>`;
    h += `<div class="m-facts"><div>정의역 X = {${xmin}, …, ${xmax}}, 공역 Y = {${ymin}, …, ${ymax}}</div><div>치역 f(X) = ${info.rangeText}</div>`;
    h += info.ok
      ? `<div class="m-ok">모든 x ∈ X 에 대해 f(x) ∈ Y → f 는 X 에서 Y 로의 <b>함수</b> (치역 ⊂ 공역)</div>`
      : `<div class="m-no">x = ${fmtRuns(Array.from({ length: xmax - xmin + 1 }, (_, i) => info.bad.includes(xmin + i)), xmin)} 에서 f(x) ∉ Y → X 에서 Y 로의 <b>함수가 아니에요</b></div>`;
    if (info.ok && info.lo === ymin && info.hi === ymax) h += `<div class="m-ok">🎉 치역의 최솟값·최댓값이 공역의 양 끝과 같아요!</div>`;
    return h + "</div>";
  }

  function plotLines(series, { kind, label, ref }) {
    const all = series.flatMap((s) => Object.values(s.t || {}));
    if (!all.length) return "";
    const [xLo, xHi] = tabRange(series[0].t);
    const [yLo, yHi] = yBounds(all, ref ? [xLo, xHi] : []);
    const F = frame({ xLo: xLo - 1, xHi: xHi + 1, yLo, yHi, H: 250, kind, label });
    let s = F.s;
    if (ref) s += `<line x1="${F.gx(xLo)}" y1="${F.gy(xLo)}" x2="${F.gx(xHi)}" y2="${F.gy(xHi)}" class="m-ref"/><text x="${F.gx(xHi) - 4}" y="${F.gy(xHi) - 6}" class="m-tick" text-anchor="end">y = x</text>`;
    for (const se of series) {
      if (se.ghost) s += `<polyline points="${Object.entries(se.ghost).map(([x, y]) => `${F.gx(+x)},${F.gy(y)}`).join(" ")}" class="m-ghost-line"/>`;
      s += `<polyline points="${Object.entries(se.t).map(([x, y]) => `${F.gx(+x)},${F.gy(y)}`).join(" ")}" fill="none" stroke="var(${se.color})" stroke-width="${se.w || 2.5}" stroke-dasharray="${se.dash || ""}"/>`;
      for (const [x, y] of Object.entries(se.t)) s += `<circle cx="${F.gx(+x)}" cy="${F.gy(y)}" r="${se.bad?.(+x) ? 4 : 2.2}" fill="var(${se.bad?.(+x) ? "--m-bad" : se.color})"/>`;
    }
    const cur = probe ?? live.x;
    if (cur != null && cur >= xLo && cur <= xHi) s += `<line x1="${F.gx(cur)}" y1="${F.padT}" x2="${F.gx(cur)}" y2="${F.H - F.padB}" class="m-now"/>`;
    return s + "</svg>";
  }

  function figComp(c, L) {
    if (!c.tabs.gf) return "";
    const info = compInfo(c);
    const cur = probe ?? L.x;
    const v = probe != null
      ? { x: probe, fx: c.tabs.f?.[probe], gx: c.tabs.g?.[probe], gf: c.tabs.gf?.[probe], fg: c.tabs.fg?.[probe], back: c.tabs.back?.[probe] }
      : L.comp;
    let h = "";
    if (v && v.fx !== undefined) {
      const box = (t) => `<span class="m-box">${t}</span>`, arrow = (t) => `<span class="m-arrow">→ ${t} →</span>`;
      h += `<div class="m-pipe"><div>${box(`x = ${v.x}`)}${arrow("f")}${box(v.fx)}${arrow("g")}${box(`<b>${v.gf}</b>`)}<span class="m-note">(g∘f)(${v.x})</span></div>` +
        `<div>${box(`x = ${v.x}`)}${arrow("g")}${box(v.gx)}${arrow("f")}${box(`<b>${v.fg}</b>`)}<span class="m-note">(f∘g)(${v.x})</span></div>` +
        `<div>${box(`f(x) = ${v.fx}`)}${arrow("f⁻¹")}${box(`<b>${v.back}</b>`)}${v.back === v.x ? `<span class="m-t">✔ x로 돌아옴</span>` : `<span class="m-alert">✘ x = ${v.x}가 아님</span>`}</div>` +
        `<div class="m-note">${probe != null ? "🖱 고른 x" : "📡 센서 x"} · ${v.gf === v.fg ? "초록불 켜짐 (g∘f = f∘g)" : "초록불 꺼짐 (g∘f ≠ f∘g)"} · ${v.back === v.x ? "파랑불 켜짐" : "파랑불 꺼짐"}</div></div>`;
    }
    h += `<div class="m-legend"><span style="--c:var(--m-orange)">(g∘f)(x)</span><span style="--c:var(--m-purple)">(f∘g)(x)</span></div>`;
    h += plotLines([
      { t: c.tabs.gf, color: "--m-orange", ghost: prev?.tabs.gf },
      { t: c.tabs.fg, color: "--m-purple", dash: "6 4", ghost: prev?.tabs.fg },
    ], { kind: "comp", label: "두 합성함수의 그래프" });
    h += `<div class="m-legend"><span style="--c:var(--m-q)">f⁻¹(f(x))</span><span style="--c:var(--m-muted)">y = x</span></div>`;
    h += plotLines([{ t: c.tabs.back, color: "--m-q", ghost: prev?.tabs.back, bad: (x) => c.tabs.back[x] !== x }], { kind: "comp", label: "역추적 그래프", ref: true });
    h += sensorNote(L) + `<p class="m-hint">그래프를 누르면 x를 직접 골라 볼 수 있어요.</p>`;
    h += `<div class="m-facts">`;
    h += info.same === info.n
      ? `<div class="m-ok">x = 0~40 모두에서 (g∘f)(x) = (f∘g)(x) → 두 그래프가 <b>겹쳐요</b></div>`
      : `<div class="m-no">(g∘f)(x) = (f∘g)(x) 인 x: <b>${info.same}개 / ${info.n}개</b> → 일반적으로 g∘f ≠ f∘g (교환법칙 ✘)</div>`;
    h += info.back === info.n
      ? `<div class="m-ok">모든 x 에서 f⁻¹(f(x)) = x → 그래프가 y = x 위에 있어요</div>`
      : `<div class="m-no">f⁻¹(f(x)) = x 인 x: <b>${info.back}개 / ${info.n}개</b> → 빨간 점에서 원래 x로 돌아오지 못해요</div>`;
    return h + "</div>";
  }

  function figCircle(c, L) {
    if (!c.circle) return "";
    const C = c.circle, S = 380, pad = 26, k = (S - 2 * pad) / (2 * LIM);
    const px = (x) => pad + (x + LIM) * k, py = (y) => S - pad - (y + LIM) * k;
    let s = `<svg class="m-svg m-plane" data-kind="plane" data-pad="${pad}" data-k="${k}" data-s="${S}" viewBox="0 0 ${S} ${S}" role="img" aria-label="좌표평면과 원">`;
    for (let i = -LIM; i <= LIM; i++) {
      s += `<line x1="${px(i)}" y1="${py(-LIM)}" x2="${px(i)}" y2="${py(LIM)}" class="m-grid"/><line x1="${px(-LIM)}" y1="${py(i)}" x2="${px(LIM)}" y2="${py(i)}" class="m-grid"/>`;
      if (i % 5 === 0 && i) s += `<text x="${px(i)}" y="${py(0) + 14}" class="m-tick" text-anchor="middle">${i}</text><text x="${px(0) - 5}" y="${py(i)}" class="m-tick" text-anchor="end" dominant-baseline="central">${i}</text>`;
    }
    s += `<line x1="${px(-LIM)}" y1="${py(0)}" x2="${px(LIM)}" y2="${py(0)}" class="m-axis"/><line x1="${px(0)}" y1="${py(-LIM)}" x2="${px(0)}" y2="${py(LIM)}" class="m-axis"/>`;
    s += `<text x="${px(LIM) - 2}" y="${py(0) - 6}" class="m-tick" text-anchor="end">x</text><text x="${px(0) + 6}" y="${py(LIM) + 10}" class="m-tick">y</text>`;
    s += `<defs><clipPath id="m-clip"><rect x="${px(-LIM)}" y="${py(LIM)}" width="${2 * LIM * k}" height="${2 * LIM * k}"/></clipPath></defs><g clip-path="url(#m-clip)">`;
    if (prev?.circle) s += `<circle cx="${px(prev.circle.a)}" cy="${py(prev.circle.b)}" r="${prev.circle.r * k}" class="m-ghost-circle"/>`;
    s += `<circle cx="${px(C.a)}" cy="${py(C.b)}" r="${C.r * k}" class="m-circle"/></g>`;
    s += `<path d="M${px(C.a) - 5} ${py(C.b)} h10 M${px(C.a)} ${py(C.b) - 5} v10" class="m-center"/>`;
    const found = new Set(L.found);
    for (const [x, y] of latticeOn(C)) s += `<circle cx="${px(x)}" cy="${py(y)}" r="4.5" class="m-lattice${found.has(`${x},${y}`) ? " m-found" : ""}"/>`;
    const col = (w) => (w === "in" ? "--m-p" : w === "on" ? "--m-q" : "--m-bad");
    L.trail.forEach(({ x, y }, i) => { s += `<circle cx="${px(x)}" cy="${py(y)}" r="3" fill="var(${col(where(C, x, y))})" opacity="${((i + 1) / L.trail.length * 0.5).toFixed(2)}"/>`; });
    const pts = [];
    if (L.pt) pts.push(["📡", L.pt]);
    if (probe) pts.push(["🖱", probe]);
    for (const [, p] of pts) s += `<circle cx="${px(p.x)}" cy="${py(p.y)}" r="7" fill="var(${col(where(C, p.x, p.y))})" class="m-cur"/>`;
    s += "</svg>";
    const sign = (n) => (n < 0 ? `+ ${-n}` : `− ${n}`);
    const term = (v, c0) => (c0 === 0 ? `${v}²` : `(${v} ${sign(c0)})²`);
    let h = `<div class="m-eq">${term("x", C.a)} + ${term("y", C.b)} = ${C.r}² <span class="m-note">(중심 (${C.a}, ${C.b}), 반지름 ${C.r})</span></div>` + s;
    for (const [who, p] of pts) {
      const d2 = (p.x - C.a) ** 2 + (p.y - C.b) ** 2, w = where(C, p.x, p.y);
      h += `<p class="m-read">${who === "📡" ? "📡 조이스틱" : "🖱 고른 점"} <b>(${p.x}, ${p.y})</b> → (${p.x} ${sign(C.a)})² + (${p.y} ${sign(C.b)})² = <b>${d2}</b> ${d2 < C.r * C.r ? "&lt;" : d2 === C.r * C.r ? "=" : "&gt;"} ${C.r * C.r} = r² → ` +
        (w === "in" ? `<span class="m-t">원의 내부 (안전)</span>` : w === "on" ? `<span class="m-on">원 위 (경계선)</span>` : `<span class="m-alert">원의 외부 ⚠</span>`) + "</p>";
    }
    h += `<p class="m-hint">좌표평면을 누르면 격자점을 직접 골라 볼 수 있어요. ○ = 원 위의 격자점, ● = 조이스틱으로 찾은 점</p>`;
    h += `<div class="m-facts"><div>원 위의 격자점 ${latticeOn(C).length}개 중 <b>${found.size}개</b> 찾음${found.size ? ": " + [...found].map((p) => `(${p.replace(",", ", ")})`).join(" ") : ""}</div></div>`;
    return h;
  }

  function schedule() { if (!queued) { queued = true; requestAnimationFrame(render); } }

  function commit(next) {
    if (cfg.lesson && same(next, cfg)) return; // 주기적으로 다시 보낸 같은 설정
    const before = cfg.lesson === next.lesson ? cfg : saved?.lesson === next.lesson ? saved : null;
    if (before) {
      const ch = describeChanges(before, next);
      if (ch.length || !changes) { changes = ch; prev = ch.length ? before : null; }
      if (ch.length) { const l = emptyLive(); l.x = live.x; live = l; }
    } else { changes = null; prev = null; }
    cfg = next;
    saved = next;
    store.set(`unoq.math.${app}`, next);
  }

  function feedLine(raw) {
    const line = raw.replace(/\r$/, "");
    if (!line.startsWith("@")) { if (line.trim()) { lastLine = line; if (!cfg.lesson) schedule(); } return; }
    const [cmd, ...a] = line.slice(1).trim().split(/\s+/);
    const n = a.map(Number);
    const target = pending;
    switch (cmd) {
      case "begin": pending = emptyCfg(a[0]); return;
      case "end": if (pending) { commit(pending); pending = null; } break;
      case "set": if (target) target.sets[a[0]] = { from: n[1], bits: a[2] || "" }; return;
      case "func": if (target) target.func = { xmin: n[0], xmax: n[1], ymin: n[2], ymax: n[3] }; return;
      case "tab": if (target) { const t = (target.tabs[a[0]] ||= {}); n.slice(2).forEach((v, i) => (t[n[1] + i] = v)); } return;
      case "circle": if (target) target.circle = { a: n[0], b: n[1], r: n[2] }; return;
      case "x":
        if (!Number.isFinite(n[0]) || n[0] >= 999) { live.fails++; live.x = null; }
        else { live.fails = 0; live.x = n[0]; live.hist.set(n[0], (live.hist.get(n[0]) || 0) + 1); }
        break;
      case "count": live.count = n; break;
      case "comp": {
        const [x, fx, gx, gf, fg, back] = n;
        live.comp = { x, fx, gx, gf, fg, back }; live.x = x; live.fails = 0;
        break;
      }
      case "pt": {
        const p = { x: n[0], y: n[1] };
        live.pt = p;
        live.trail.push(p);
        if (live.trail.length > 30) live.trail.shift();
        const key = `${p.x},${p.y}`;
        if (cfg.circle && where(cfg.circle, p.x, p.y) === "on" && !live.found.includes(key)) live.found.push(key);
        break;
      }
      case "n": live.n = n[0]; break;
      default: return;
    }
    if (phase !== "running") phase = "running";
    schedule();
  }

  // 그림을 누르거나 끌어서 x(또는 점)를 직접 고른다
  function pick(ev) {
    const svg = ev.target.closest?.("svg[data-kind]");
    if (!svg) return;
    const m = svg.getScreenCTM();
    if (!m) return;
    const pt = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse());
    const d = svg.dataset;
    if (d.kind === "line") probe = Math.max(0, Math.min(+d.n - 1, Math.floor((pt.x - +d.x0) / +d.cw)));
    else if (d.kind === "func" || d.kind === "comp") {
      const x = +d.xlo + ((pt.x - +d.pl) / (+d.w - +d.pl - +d.pr)) * (+d.xhi - +d.xlo);
      probe = Math.round(x);
    } else if (d.kind === "plane") {
      const x = Math.round((pt.x - +d.pad) / +d.k - LIM), y = Math.round((+d.s - +d.pad - pt.y) / +d.k - LIM);
      probe = { x: Math.max(-LIM, Math.min(LIM, x)), y: Math.max(-LIM, Math.min(LIM, y)) };
    }
    schedule();
  }
  let dragging = false;
  root.addEventListener("pointerdown", (e) => { if (e.target.closest?.("svg[data-kind]")) { dragging = true; pick(e); } });
  root.addEventListener("pointermove", (e) => { if (dragging) pick(e); });
  window.addEventListener("pointerup", () => (dragging = false));
  root.addEventListener("change", (e) => {
    const i = e.target.dataset?.step;
    if (i === undefined) return;
    const ck = checks();
    ck[i] = e.target.checked;
    store.set(`unoq.mathChecks.${app}`, ck);
  });

  return {
    feedLine,
    // 다른 앱을 열었을 때
    setApp(name, lessonHint) {
      app = name; hint = lessonHint; phase = "idle";
      cfg = emptyCfg(); pending = null; prev = null; changes = null; live = emptyLive(); probe = null; lastLine = "";
      saved = store.get(`unoq.math.${name}`, null);
      schedule();
    },
    setHint(lessonHint) { if (hint !== lessonHint) { hint = lessonHint; schedule(); } },
    // 새로 실행을 시작할 때: 지금 설정은 '지난 실행'이 된다
    newRun() {
      if (cfg.lesson) saved = cfg;
      cfg = emptyCfg(); pending = null; changes = null; prev = null; live = emptyLive(); probe = null; lastLine = "";
      phase = "building";
      schedule();
    },
    setPhase(p) { phase = p; schedule(); },
    get lesson() { return cfg.lesson || saved?.lesson || hint; },
  };
}

// 스케치 코드에서 차시를 알아낸다 (sendMath 의 "@begin l01")
export function lessonOf(code) {
  return (code.match(/@begin (\w+)/) || [])[1] || null;
}
