// 새 앱을 만들 때 sketch/sketch.ino 에 넣을 차시별 실습 코드.
// UNO Q에서는 Serial 대신 Monitor(Arduino_RouterBridge)로 출력해야 크롬북 화면에 보인다.
//
// 공통 키트 배선 (모든 차시 동일 — 한 번 꽂아 두면 계속 사용)
//   초음파 HC-SR04 : Trig D2, Echo D3
//   초록 LED       : D8        파랑 LED : D9 (PWM 밝기 조절 가능)
//   조이스틱 모듈  : VRx A0, VRy A1 (06차시)
//
// 각 스케치는 '@'로 시작하는 줄(예: "@set P 0 1110…", "@x 12")을 함께 보낸다.
// 웹앱의 [📐 수학 화면](viz.js)이 이 줄을 읽어 진리집합·그래프·좌표평면으로 그린다.
// 주의: 이 파일은 JS 템플릿 문자열이라 C++ 의 "\n" 은 "\\n" 으로 적어야 한다.

// 초음파 거리 측정 함수 (여러 차시에서 같이 씀)
// UNO Q 코어(0.52.x)에는 pulseIn 이 없어서 micros()로 직접 잰다.
const DISTANCE = `// Echo 핀이 HIGH 로 유지되는 시간(마이크로초)을 잰다. 시간 초과면 0
// (UNO Q 보드 버전에 따라 pulseIn 이 없어서 직접 만든 함수)
unsigned long echoTime(unsigned long timeoutUs) {
  unsigned long start = micros();
  while (digitalRead(echoPin) == LOW) {          // 소리가 돌아오기 시작할 때까지 기다림
    if (micros() - start > timeoutUs) return 0;
  }
  unsigned long t0 = micros();
  while (digitalRead(echoPin) == HIGH) {         // 소리가 다 돌아올 때까지 시간 재기
    if (micros() - t0 > timeoutUs) return 0;
  }
  return micros() - t0;
}

// 물체와의 거리 x(cm)를 측정하는 함수 (측정 실패 시 999)
long getDistance() {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);
  unsigned long duration = echoTime(30000); // 30ms 동안 소리가 안 돌아오면 0
  if (duration == 0) return 999;
  return duration * 0.034 / 2; // 음속을 이용한 거리(cm) 환산
}`;

const PINS = `const int trigPin = 2; // 초음파 센서 Trig 핀
const int echoPin = 3; // 초음파 센서 Echo 핀
const int ledG = 8;    // 초록 LED
const int ledB = 9;    // 파랑 LED`;

const SETUP_PINS = `  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  pinMode(ledG, OUTPUT);
  pinMode(ledB, OUTPUT);
  Monitor.begin();`;

const MATH_HEAD = `// ═════════════ 📐 수학 화면으로 보내기 (고치지 않아도 돼요) ═════════════
// '@'로 시작하는 줄은 웹앱의 [📐 수학 화면]이 읽어서 그림으로 그려요.`;

// 01~03차시: 전체집합 U = {0, …, 60} 의 원소를 하나씩 조건에 넣어 진리집합을 만든다
const mathSets = (lesson, extra = "") => `${MATH_HEAD}
// 전체집합 U = {0, 1, 2, ..., 60} 의 원소 x 를 하나씩 p(x), q(x) 에 넣어 보고
// 참이면 1, 거짓이면 0 을 보낸다. 1 인 원소를 모은 것이 진리집합 P, Q 이다.
void sendMath() {
  String P = "@set P 0 ", Q = "@set Q 0 ";
  for (long x = 0; x <= 60; x++) {
    P += p(x) ? "1" : "0";
    Q += q(x) ? "1" : "0";
  }
  Monitor.print("@begin ${lesson}\\n");
  Monitor.print(P + "\\n");
  Monitor.print(Q + "\\n");
  Monitor.print("@end\\n");
}

// 센서가 잰 지금의 x 를 보낸다 (999 = 측정 실패)
void sendX(long x) {
  Monitor.print(String("@x ") + x + "\\n");
}
${extra}`;

// 04~05차시: 정의역의 모든 x 에 대한 함숫값 표를 보낸다
const SEND_TABLE = `// 함수 fn 의 함숫값 표 (x = from ~ to) 를 21개씩 끊어서 보낸다
void sendTable(const char* name, long (*fn)(long), long from, long to) {
  for (long s = from; s <= to; s += 21) {
    String line = String("@tab ") + name + " " + s;
    for (long x = s; x <= to && x < s + 21; x++) line += String(" ") + fn(x);
    Monitor.print(line + "\\n");
  }
}`;

export const TEMPLATES = {
  blank: {
    group: "기본",
    slug: "",
    title: "빈 앱 (보드가 만든 그대로)",
    desc: "arduino-app-cli가 만들어 주는 기본 파일을 그대로 씁니다.",
    sketch: null,
  },
  blink: {
    group: "기본",
    slug: "test-blink",
    title: "00 연결 확인 — LED 깜빡이",
    desc: "보드의 LED를 1초마다 켜고 끄며, 몇 번째인지 모니터에 출력합니다. 배선 없이 크롬북 연결을 확인할 때 써요.",
    sketch: `#include <Arduino_RouterBridge.h>

int n = 0; // 깜빡인 횟수

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  Monitor.begin();
}

void loop() {
  n = n + 1;
  digitalWrite(LED_BUILTIN, HIGH);
  delay(500);
  digitalWrite(LED_BUILTIN, LOW);
  delay(500);

  Monitor.print("깜빡인 횟수 n = ");
  Monitor.println(n);
  Monitor.print(String("@begin blink\\n@n ") + n + "\\n@end\\n"); // 📐 수학 화면용
}
`,
  },

  // ───────────────────────── Ⅱ-2. 명제 ─────────────────────────
  l01: {
    group: "Ⅱ-2. 명제",
    slug: "l01-bangrye",
    title: "01차시 명제와 조건 — 반례 감지기",
    desc: "조건 p(x): x<15(초록), q(x): x<30(파랑)의 진리집합 P, Q를 수직선에 그리고, 손의 거리 x가 p→q의 반례인지 알려 줍니다.\n배선: 초음파 D2·D3, 초록 D8, 파랑 D9",
    sketch: `// ============================================================================
// [공통수학2] 01차시: 명제와 조건 — 아두이노Q에게 판단 규칙 학습시키기 & 반례 감지
// 교재: 비상교육 공통수학2 p.78~84
// 조건은 x 의 값에 따라 참·거짓이 정해지는 문장 → p(x), q(x) 로 나타낸다.
// [📐 수학 화면]에서 진리집합 P, Q 와 지금 손의 거리 x 를 수직선으로 볼 수 있어요.
// ============================================================================
#include <Arduino_RouterBridge.h>

${PINS}

// ★★★★★ [학생 수정 영역] 기계에게 가르치는 2가지 조건 ★★★★★
bool p(long x) { return x < 15; } // 조건 p : "물체와의 거리 x가 15cm 미만이다."
bool q(long x) { return x < 30; } // 조건 q : "물체와의 거리 x가 30cm 미만이다."
// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★

void setup() {
${SETUP_PINS}
  delay(1500); // 모니터가 연결될 시간을 준다
  sendMath();  // 진리집합 P, Q 를 수학 화면으로 보냄
}

${DISTANCE}

long loops = 0;

void loop() {
  long x = getDistance(); // 센서가 수집한 거리 데이터 x
  bool a = p(x), b = q(x);

  digitalWrite(ledG, a ? HIGH : LOW); // 초록불 = p(x)
  digitalWrite(ledB, b ? HIGH : LOW); // 파란불 = q(x)

  Monitor.print("x = ");
  Monitor.print(x);
  Monitor.print(" cm | p: ");
  Monitor.print(a ? "참" : "거짓");
  Monitor.print(" | q: ");
  Monitor.print(b ? "참" : "거짓");

  // p 는 참인데 q 는 거짓 → 명제 p→q 의 반례
  if (a && !b) Monitor.println("  <-- p→q 의 반례 발견!");
  else Monitor.println("");

  sendX(x);
  if (++loops % 10 == 0) sendMath(); // 늦게 연결해도 그림이 나오도록 가끔 다시 보냄
  delay(300);
}

// [미션 1] 초록불이 켜질 때 파란불도 항상 켜지는지 확인하세요. (p→q 참?)
// [미션 2] p를 x < 40 으로 바꾸고 실행해 보세요. 반례가 되는 거리 x를 찾아 적어 보세요.

${mathSets("l01")}`,
  },
  l02: {
    group: "Ⅱ-2. 명제",
    slug: "l02-daeu",
    title: "02차시 역과 대우 — 세 명제 동시 검사기",
    desc: "명제 p→q, 역 q→p, 대우 ~q→~p의 반례 구간을 수직선에 나란히 그리고, 측정할 때마다 반례 개수를 셉니다. 명제와 대우의 반례가 늘 같은지 확인해요.\n배선: 초음파 D2·D3, 초록 D8, 파랑 D9",
    sketch: `// ============================================================================
// [공통수학2] 02차시: 명제의 역과 대우 — 세 명제 동시 검사기
// 원명제 p→q, 역 q→p, 대우 ~q→~p 의 반례를 동시에 센다.
// ============================================================================
#include <Arduino_RouterBridge.h>

${PINS}

long countAll = 0;   // 측정 횟수
long badOrig = 0;    // 명제 p→q 의 반례 수
long badConv = 0;    // 역   q→p 의 반례 수
long badContra = 0;  // 대우 ~q→~p 의 반례 수

// ★★★★★ [학생 수정 영역] 조건 p, q ★★★★★
bool p(long x) { return x < 15; }
bool q(long x) { return x < 30; }
// ★★★★★★★★★★★★★★★★★★★★★★★★★★★

void setup() {
${SETUP_PINS}
  delay(1500);
  sendMath();
}

${DISTANCE}

// "A이면 B이다"가 이번 x에서 깨졌는가? (A는 참, B는 거짓일 때만 반례)
bool isCounterexample(bool A, bool B) {
  return A && !B;
}

void loop() {
  long x = getDistance();
  sendX(x);
  if (x == 999) { delay(200); return; } // 측정 실패는 건너뜀

  bool a = p(x), b = q(x);
  digitalWrite(ledG, a ? HIGH : LOW);
  digitalWrite(ledB, b ? HIGH : LOW);

  countAll++;
  bool o = isCounterexample(a, b);    // 명제
  bool c = isCounterexample(b, a);    // 역
  bool k = isCounterexample(!b, !a);  // 대우
  if (o) badOrig++;
  if (c) badConv++;
  if (k) badContra++;

  Monitor.print("x = "); Monitor.print(x); Monitor.print(" cm  ");
  if (o) Monitor.print("[명제 반례] ");
  if (c) Monitor.print("[역 반례] ");
  if (k) Monitor.print("[대우 반례] ");
  Monitor.println("");
  sendCount();

  // 10번 잴 때마다 성적표 출력
  if (countAll % 10 == 0) {
    Monitor.println("──────── 반례 성적표 ────────");
    Monitor.print("측정 "); Monitor.print(countAll); Monitor.println("회");
    Monitor.print("명제 p→q   반례: "); Monitor.println(badOrig);
    Monitor.print("역   q→p   반례: "); Monitor.println(badConv);
    Monitor.print("대우 ~q→~p 반례: "); Monitor.println(badContra);
    Monitor.println("─────────────────────────────");
    sendMath();
  }
  delay(400);
}

// [미션 1] 손을 가까이·멀리 움직이며 성적표를 3번 받아 보세요.
//          명제와 대우의 반례 수는 어떤 관계인가요? 역은요?
// [미션 2] p를 x < 40 으로 바꾸면 성적표가 어떻게 달라지나요?
// [생각해 보기] 왜 "명제가 참이면 대우도 항상 참"일까요? 진리집합 P, Q의 여집합으로 설명해 보세요.

${mathSets("l02", `
// 지금까지의 반례 성적표를 보낸다
void sendCount() {
  Monitor.print(String("@count ") + countAll + " " + badOrig + " " + badConv + " " + badContra + "\\n");
}
`)}`,
  },
  l03: {
    group: "Ⅱ-2. 명제",
    slug: "l03-chungbun",
    title: "03차시 충분조건과 필요조건 — 진리집합 판정기",
    desc: "p: a≤x<b, q: c≤x<d 의 구간을 정하면 0~60cm에서 진리집합 P, Q를 계산해 충분·필요·필요충분조건을 판정합니다. 수직선에서 포함 관계를 눈으로 확인해요.\n배선: 초음파 D2·D3, 초록 D8, 파랑 D9",
    sketch: `// ============================================================================
// [공통수학2] 03차시: 충분조건과 필요조건 — 진리집합 판정기
// 전체집합 U = {0, 1, 2, ..., 60} (cm) 에서 진리집합 P, Q 를 계산한다.
// ============================================================================
#include <Arduino_RouterBridge.h>

${PINS}

// ★★★★★ [학생 수정 영역] 조건의 구간 ★★★★★
// 조건 p : pFrom ≤ x < pTo
const int pFrom = 10;
const int pTo   = 20;
// 조건 q : qFrom ≤ x < qTo
const int qFrom = 5;
const int qTo   = 30;
// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★

const int U_MAX = 60; // 전체집합 U = {0, ..., 60}

bool p(long x) { return pFrom <= x && x < pTo; }
bool q(long x) { return qFrom <= x && x < qTo; }

void setup() {
${SETUP_PINS}
  delay(2000); // 모니터가 연결될 시간을 준다
  judge();
  sendMath();
}

// 진리집합의 포함 관계를 조사해서 판정 결과를 출력
void judge() {
  bool PinQ = true; // P ⊂ Q ?
  bool QinP = true; // Q ⊂ P ?
  long witnessPQ = -1, witnessQP = -1;
  for (long x = 0; x <= U_MAX; x++) {
    if (p(x) && !q(x)) { PinQ = false; if (witnessPQ < 0) witnessPQ = x; }
    if (q(x) && !p(x)) { QinP = false; if (witnessQP < 0) witnessQP = x; }
  }

  Monitor.println("════════ 진리집합 판정 ════════");
  Monitor.print("P = { x | "); Monitor.print(pFrom); Monitor.print(" ≤ x < "); Monitor.print(pTo); Monitor.println(" }");
  Monitor.print("Q = { x | "); Monitor.print(qFrom); Monitor.print(" ≤ x < "); Monitor.print(qTo); Monitor.println(" }");
  Monitor.print("P ⊂ Q ? "); Monitor.println(PinQ ? "예" : "아니오");
  if (!PinQ) { Monitor.print("   반례 x = "); Monitor.println(witnessPQ); }
  Monitor.print("Q ⊂ P ? "); Monitor.println(QinP ? "예" : "아니오");
  if (!QinP) { Monitor.print("   반례 x = "); Monitor.println(witnessQP); }

  Monitor.print("결론: ");
  if (PinQ && QinP)  Monitor.println("p는 q이기 위한 필요충분조건");
  else if (PinQ)     Monitor.println("p는 q이기 위한 충분조건 (q는 p이기 위한 필요조건)");
  else if (QinP)     Monitor.println("p는 q이기 위한 필요조건 (q는 p이기 위한 충분조건)");
  else               Monitor.println("p는 q이기 위한 충분조건도, 필요조건도 아님");
  Monitor.println("═══════════════════════════════");
}

${DISTANCE}

long loops = 0;

void loop() {
  if (++loops % 20 == 0) judge(); // 판정 결과를 가끔 다시 보여 준다 (늦게 연결해도 볼 수 있게)
  if (loops % 10 == 0) sendMath();

  long x = getDistance();
  bool a = p(x), b = q(x);
  digitalWrite(ledG, a ? HIGH : LOW); // 초록불 = p
  digitalWrite(ledB, b ? HIGH : LOW); // 파란불 = q

  Monitor.print("x = "); Monitor.print(x);
  Monitor.print(" cm | p: "); Monitor.print(a ? "참" : "거짓");
  Monitor.print(" | q: "); Monitor.println(b ? "참" : "거짓");
  sendX(x);
  delay(400);
}

// [미션 1] 지금 구간에서 판정 결과를 적고, 초록불이 켜질 때 파란불이 꼭 켜지는지 손으로 확인하세요.
// [미션 2] p를 '필요충분조건'이 되도록 pFrom, pTo 를 바꿔 보세요.
// [미션 3] '필요조건이지만 충분조건은 아닌' 구간을 만들어 보세요.

${mathSets("l03")}`,
  },

  // ───────────────────────── Ⅲ-1. 함수 ─────────────────────────
  l04: {
    group: "Ⅲ-1. 함수",
    slug: "l04-hamsu",
    title: "04차시 함수의 정의 — 정의역·공역·치역 매핑",
    desc: "거리 x(정의역 0~40cm)를 LED 밝기 f(x)(공역 0~255)로 대응시킵니다. 수학 화면에 y=f(x)의 그래프, 공역, 치역이 그려지고, 공역을 벗어나는 x가 빨갛게 표시돼요.\n배선: 초음파 D2·D3, 초록 D8, 파랑 D9(밝기)",
    sketch: `// ============================================================================
// [공통수학2] 04차시: 함수의 정의 — 센서 매핑 (정의역, 공역, 치역)
// 정의역 X = {0, 1, ..., 40} (거리 cm),  공역 Y = {0, 1, ..., 255} (LED 밝기)
// ============================================================================
#include <Arduino_RouterBridge.h>

${PINS}

const long X_MIN = 0, X_MAX = 40;   // 정의역
const long Y_MIN = 0, Y_MAX = 255;  // 공역

long rangeMin = 100000, rangeMax = -100000; // 지금까지 나온 함숫값(치역)의 최솟값, 최댓값

// ★★★★★ [학생 수정 영역] 함수 f : X → Y ★★★★★
long f(long x) {
  return 6 * x + 15;
}
// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★

void setup() {
${SETUP_PINS}
  delay(1500);
  sendMath();
}

${DISTANCE}

long loops = 0;

void loop() {
  if (++loops % 10 == 0) sendMath();
  long x = getDistance();
  sendX(x);

  if (x < X_MIN || x > X_MAX) {
    // 정의역 밖: 대응시킬 값이 없다
    digitalWrite(ledG, HIGH);
    analogWrite(ledB, 0);
    Monitor.print("x = "); Monitor.print(x); Monitor.println(" cm → 정의역 밖 (대응 없음)");
    delay(400);
    return;
  }
  digitalWrite(ledG, LOW);

  long y = f(x);
  Monitor.print("x = "); Monitor.print(x); Monitor.print(" → f(x) = "); Monitor.print(y);

  if (y < Y_MIN || y > Y_MAX) {
    // 공역 밖으로 나가면 f는 X에서 Y로의 함수가 아니다
    Monitor.println("   ⚠ 공역 밖! f는 X→Y 함수가 될 수 없어요");
    for (int i = 0; i < 3; i++) { analogWrite(ledB, 255); delay(80); analogWrite(ledB, 0); delay(80); }
  } else {
    analogWrite(ledB, y); // 함숫값 = 파란 LED 밝기
    if (y < rangeMin) rangeMin = y;
    if (y > rangeMax) rangeMax = y;
    Monitor.print("   | 지금까지의 치역: "); Monitor.print(rangeMin); Monitor.print(" ~ "); Monitor.println(rangeMax);
  }
  delay(400);
}

// [미션 1] 손을 0~40cm 사이에서 천천히 움직이며 파란불 밝기가 어떻게 바뀌는지 관찰하세요.
// [미션 2] 치역의 최솟값과 최댓값을 기록하고, 치역 ⊂ 공역 임을 확인하세요.
// [미션 3] f(x)를 10 * x 로 바꾸면 어떤 경고가 나오나요? 왜 함수가 아닌지 설명해 보세요.
// [도전]  공역 0~255를 모두 치역으로 만드는 일차함수 f(x)를 찾아보세요.

${MATH_HEAD}
// 정의역의 모든 x 에 대해 f(x) 를 계산해 함숫값 표를 보낸다 → 수학 화면에 그래프로 그려짐
void sendMath() {
  Monitor.print("@begin l04\\n");
  Monitor.print(String("@func ") + X_MIN + " " + X_MAX + " " + Y_MIN + " " + Y_MAX + "\\n");
  sendTable("f", f, X_MIN, X_MAX);
  Monitor.print("@end\\n");
}

void sendX(long x) {
  Monitor.print(String("@x ") + x + "\\n");
}

${SEND_TABLE}
`,
  },
  l05: {
    group: "Ⅲ-1. 함수",
    slug: "l05-hapseong",
    title: "05차시 합성함수와 역함수 — 파이프라인과 역추적",
    desc: "x → f → g 파이프라인으로 (g∘f)(x)와 (f∘g)(x)를 비교하고, 역함수 f⁻¹로 결과에서 원래 x를 되찾는지 검사합니다. 수학 화면에 두 합성함수의 그래프와 y=x 비교가 그려져요.\n배선: 초음파 D2·D3, 초록 D8, 파랑 D9",
    sketch: `// ============================================================================
// [공통수학2] 05차시: 합성함수와 역함수 — 파이프라인 연쇄 및 역추적
// 센서값 x 를 f, g 두 기계에 차례로 통과시키고, 역함수로 거꾸로 되돌린다.
// ============================================================================
#include <Arduino_RouterBridge.h>

${PINS}

long total = 0, sameCount = 0, backOk = 0;

// ★★★★★ [학생 수정 영역] 두 함수와 f의 역함수 ★★★★★
long f(long x)    { return 2 * x + 3; }    // 1번 기계
long g(long x)    { return x - 1; }        // 2번 기계
long fInv(long y) { return (y - 3) / 2; }  // f의 역함수 (직접 구해서 적기)
// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★

long gf(long x)   { return g(f(x)); }      // (g∘f)(x) : f 먼저, 그다음 g
long fg(long x)   { return f(g(x)); }      // (f∘g)(x) : g 먼저, 그다음 f
long back(long x) { return fInv(f(x)); }   // f⁻¹(f(x)) : 다시 x 가 나와야 함

void setup() {
${SETUP_PINS}
  delay(1500);
  sendMath();
}

${DISTANCE}

long loops = 0;

void loop() {
  if (++loops % 10 == 0) sendMath();
  long x = getDistance();
  if (x == 999) { sendX(x); delay(200); return; }

  long a = gf(x), b = fg(x), c = back(x);

  total++;
  if (a == b) sameCount++;
  if (c == x) backOk++;

  digitalWrite(ledG, a == b ? HIGH : LOW); // 초록불: g∘f 와 f∘g 가 같을 때
  digitalWrite(ledB, c == x ? HIGH : LOW); // 파란불: 역추적 성공

  Monitor.print("x="); Monitor.print(x);
  Monitor.print(" | f(x)="); Monitor.print(f(x));
  Monitor.print(" | (g∘f)(x)="); Monitor.print(a);
  Monitor.print(" | (f∘g)(x)="); Monitor.print(b);
  Monitor.print(" | f⁻¹(f(x))="); Monitor.print(c);
  Monitor.println(c == x ? " ✔" : " ✘ 역추적 실패");
  sendX(x);

  if (total % 10 == 0) {
    Monitor.println("──────── 요약 ────────");
    Monitor.print("g∘f = f∘g 인 경우: "); Monitor.print(sameCount); Monitor.print(" / "); Monitor.println(total);
    Monitor.print("역추적 성공:        "); Monitor.print(backOk);    Monitor.print(" / "); Monitor.println(total);
    Monitor.println("──────────────────────");
  }
  delay(500);
}

// [미션 1] (g∘f)(x)와 (f∘g)(x)가 같은가요? 합성함수에서 교환법칙이 성립하나요?
// [미션 2] 파란불이 항상 켜지는지 확인하세요. f⁻¹(f(x)) = x 의 뜻을 설명해 보세요.
// [미션 3] f를 x / 5 (5cm 단위 '단계')로 바꾸고 fInv를 y * 5 로 바꿔 보세요.
//          역추적이 왜 실패하나요? 일대일대응이 아니면 역함수가 없는 이유와 연결해 보세요.

${MATH_HEAD}
// x = 0 ~ 40 에 대해 f, g, g∘f, f∘g, f⁻¹∘f 의 함숫값 표를 보낸다 → 수학 화면에 그래프로 그려짐
void sendMath() {
  Monitor.print("@begin l05\\n");
  sendTable("f", f, 0, 40);
  sendTable("g", g, 0, 40);
  sendTable("gf", gf, 0, 40);
  sendTable("fg", fg, 0, 40);
  sendTable("back", back, 0, 40);
  Monitor.print("@end\\n");
}

// 지금의 x 와 파이프라인을 지난 값들을 보낸다
void sendX(long x) {
  if (x == 999) { Monitor.print("@x 999\\n"); return; }
  Monitor.print(String("@comp ") + x + " " + f(x) + " " + g(x) + " " + gf(x) + " " + fg(x) + " " + back(x) + "\\n");
}

${SEND_TABLE}
`,
  },

  // ───────────────────────── Ⅰ. 도형의 방정식 ─────────────────────────
  l06: {
    group: "Ⅰ. 도형의 방정식",
    slug: "l06-geofence",
    title: "06차시 원의 방정식 — 지오펜스 안전 영역",
    desc: "조이스틱 위치를 좌표 (x, y)로 바꾸고, 원 (x−a)²+(y−b)²=r² 의 안·위·밖을 판정합니다. 수학 화면의 좌표평면에 원과 점이 그려져요. 안=초록, 밖=파랑 깜빡임(경보).\n배선: 조이스틱 VRx A0, VRy A1, 초록 D8, 파랑 D9",
    sketch: `// ============================================================================
// [공통수학2] 06차시: 원의 방정식과 지오펜스(Geofence) 안전 영역
// 조이스틱 = 드론 위치 (x, y),  -10 ≤ x, y ≤ 10 인 좌표평면
// ============================================================================
#include <Arduino_RouterBridge.h>

const int joyX = A0;  // 조이스틱 VRx
const int joyY = A1;  // 조이스틱 VRy
const int ledG = 8;   // 초록 LED : 안전 영역 안
const int ledB = 9;   // 파랑 LED : 경계 / 경보

// ★★★★★ [학생 수정 영역] 안전 영역(원)의 중심 (a, b)와 반지름 r ★★★★★
const long a = 0;
const long b = 0;
const long r = 5;
// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★

void setup() {
  pinMode(ledG, OUTPUT);
  pinMode(ledB, OUTPUT);
  Monitor.begin();
  delay(1500);
  sendMath();
}

// 조이스틱 읽기 값(0 ~ 1023)을 좌표(-10 ~ 10)로 바꾼다
long toCoord(int raw) {
  return map(raw, 0, 1023, -10, 10);
}

long loops = 0;

void loop() {
  if (++loops % 10 == 0) sendMath();
  long x = toCoord(analogRead(joyX));
  long y = toCoord(analogRead(joyY));

  long d2 = (x - a) * (x - a) + (y - b) * (y - b); // 중심까지 거리의 제곱
  long r2 = r * r;

  Monitor.print("위치 ("); Monitor.print(x); Monitor.print(", "); Monitor.print(y); Monitor.print(")  ");
  Monitor.print("(x-a)²+(y-b)² = "); Monitor.print(d2);
  Monitor.print("  vs  r² = "); Monitor.print(r2);
  sendPoint(x, y);

  if (d2 < r2) {
    digitalWrite(ledG, HIGH); digitalWrite(ledB, LOW);
    Monitor.println("  → 원의 내부 (안전)");
  } else if (d2 == r2) {
    digitalWrite(ledG, HIGH); digitalWrite(ledB, HIGH);
    Monitor.println("  → 원 위 (경계선)");
  } else {
    digitalWrite(ledG, LOW);
    digitalWrite(ledB, HIGH); delay(100); digitalWrite(ledB, LOW);
    Monitor.println("  → 원의 외부 ⚠ 경보!");
  }
  delay(300);
}

// [미션 1] 조이스틱을 움직여 초록·파랑이 둘 다 켜지는 '경계선' 위의 점을 3개 찾아 적으세요.
//          그 점들이 (x-a)²+(y-b)² = r² 를 만족하는지 계산해 보세요.
// [미션 2] 중심을 (3, -2)로 바꾸고, 원 위의 점(경계선)을 하나 찾아 식에 대입해 확인하세요.
// [미션 3] 점 (x, y)가 원 안에 있을 조건을 부등식으로 써 보세요.
// [참고]  조이스틱을 놓았을 때 (0, 0)이 아니면 toCoord 의 범위를 보정해 보세요.

${MATH_HEAD}
void sendMath() {
  Monitor.print(String("@begin l06\\n@circle ") + a + " " + b + " " + r + "\\n@end\\n");
}

void sendPoint(long x, long y) {
  Monitor.print(String("@pt ") + x + " " + y + "\\n");
}
`,
  },
};

// [📐 수학 화면]의 '해 볼 것' — 바꿀 것(do)과 그때 화면에서 볼 것(see)
export const GUIDES = {
  blink: {
    look: "보드의 LED가 깜빡일 때마다 n이 1씩 커져요. 보드와 크롬북이 잘 연결되었다는 뜻이에요.",
    steps: [
      { do: "delay(500) 두 곳을 delay(100)으로 바꾸고 실행", see: "n이 훨씬 빨리 커지고 LED도 빨리 깜빡여요." },
    ],
  },
  l01: {
    look: "초록 막대 = 진리집합 P, 파랑 막대 = Q (LED 색과 같아요). 손을 움직이면 ▼ x가 수직선 위를 움직이고, P 위에 있으면 초록불이 켜져요.",
    predict: "바꾼 조건으로 P는 늘어날까요, 줄어들까요? 빨간 반례 구간이 생길까요?",
    steps: [
      { do: "손을 5cm, 20cm, 40cm에 차례로 두기", see: "▼가 초록 막대 위에 있을 때 파랑 막대 위에도 있나요? → P ⊂ Q 이면 p→q는 참" },
      { do: "p를 x < 40 으로 바꾸고 ▶ 저장 후 실행", see: "초록 막대가 40까지 늘어나고 빨간 ‘반례’ 구간(30~39)이 생겨요. 손을 그 거리에 두면 반례를 직접 볼 수 있어요." },
      { do: "반례 구간이 없어지도록 q를 고쳐서 실행", see: "빨간 구간이 사라지면 P ⊂ Q, 명제 p→q가 다시 참이 돼요." },
    ],
  },
  l02: {
    look: "명제 p→q의 반례는 P−Q, 역 q→p의 반례는 Q−P, 대우 ~q→~p의 반례는 Qᶜ−Pᶜ 이에요. 세 줄의 빨간 구간을 비교해 보세요.",
    predict: "p를 바꾸면 명제·역·대우 중 어느 줄의 반례 구간이 바뀔까요?",
    steps: [
      { do: "손을 가까이·멀리 움직이며 성적표 보기", see: "명제 줄과 대우 줄의 빨간 구간이 똑같아요. 반례 개수도 늘 같아요." },
      { do: "p를 x < 40 으로 바꾸고 실행", see: "명제·대우 줄에 30~39 반례 구간이 함께 생기고, 역 줄의 반례는 사라져요." },
      { do: "생각해 보기", see: "Qᶜ에 있으면서 Pᶜ에 없는 x = Q에 없으면서 P에 있는 x → 왜 P−Q와 같은지 설명해 보세요." },
    ],
  },
  l03: {
    look: "초록 막대 P가 파랑 막대 Q 안에 쏙 들어가면 P ⊂ Q, 즉 p는 q이기 위한 충분조건이에요.",
    predict: "구간을 바꾸면 두 막대의 포함 관계가 어떻게 될까요? 결론을 먼저 예상해 보세요.",
    steps: [
      { do: "지금 구간 그대로 실행", see: "P(10~19)가 Q(5~29) 안에 있어요 → 충분조건. Q−P 구간은 ‘q인데 p는 아닌’ x예요." },
      { do: "pFrom, pTo를 고쳐 필요충분조건 만들기", see: "두 막대가 똑같아지고(P = Q) 빨간 구간이 모두 사라져요." },
      { do: "필요조건이지만 충분조건은 아닌 구간 만들기", see: "파랑 막대가 초록 막대 안에 들어가요 (Q ⊂ P, P ≠ Q)." },
    ],
  },
  l04: {
    look: "점 하나하나가 순서쌍 (x, f(x))예요. 하늘색 띠가 공역 Y, 왼쪽 초록 막대가 치역이에요. 손을 움직이면 지금 x의 점과 LED 밝기가 표시돼요.",
    predict: "식을 바꾸면 점들이 공역 띠 밖으로 나갈까요?",
    steps: [
      { do: "손을 0~40cm에서 천천히 움직이기", see: "그래프 위 큰 점이 따라 움직이고, f(x)가 클수록 LED가 밝아져요." },
      { do: "치역 막대 확인하기", see: "치역(초록 막대)이 공역 띠 안에 있으면 치역 ⊂ 공역이에요." },
      { do: "f(x)를 10 * x 로 바꾸고 실행", see: "x ≥ 26에서 점이 빨갛게 공역 밖으로 나가요 → f는 X에서 Y로의 함수가 아니에요." },
      { do: "도전: 치역이 공역 0~255 전체가 되도록 f 만들기", see: "치역 막대가 공역 띠의 아래 끝부터 위 끝까지 닿아요." },
    ],
  },
  l05: {
    look: "주황 = (g∘f)(x), 보라 = (f∘g)(x) 그래프예요. 두 그래프가 겹치면 g∘f = f∘g 예요. 아래 그래프는 f⁻¹(f(x))가 y = x 선 위에 있는지 보여 줘요.",
    predict: "식을 바꾸면 두 합성함수 그래프가 겹칠까요?",
    steps: [
      { do: "손을 움직이며 위쪽 파이프라인 보기", see: "같은 x라도 f를 먼저 거치느냐 g를 먼저 거치느냐에 따라 결과가 달라요." },
      { do: "g를 f와 똑같이 2 * x + 3 으로 바꾸고 실행", see: "두 그래프가 완전히 겹쳐요. 이때는 g∘f = f∘g 예요." },
      { do: "f를 x / 5, fInv를 y * 5 로 바꾸고 실행", see: "아래 그래프가 계단 모양이 되어 y = x 선을 벗어나요 → 일대일대응이 아니면 되돌릴 수 없어요." },
    ],
  },
  l06: {
    look: "원 안쪽 초록 영역이 안전 영역 (x−a)²+(y−b)² < r² 예요. 원 위의 ○ 표시는 식을 정확히 만족하는 격자점이에요.",
    predict: "중심과 반지름을 바꾸면 원과 격자점은 어떻게 바뀔까요?",
    steps: [
      { do: "조이스틱으로 원 위의 ○ 점 3개 찾기", see: "찾은 점은 ●로 채워지고 아래 목록에 쌓여요. 대입하면 (x−a)²+(y−b)² = r² 예요." },
      { do: "중심을 (3, −2)로 바꾸고 실행", see: "원이 오른쪽 아래로 옮겨지고, 이전 원은 점선으로 남아요." },
      { do: "r을 바꿔 보기", see: "원 위의 격자점 개수가 r에 따라 어떻게 달라지는지 세어 보세요." },
    ],
  },
};
