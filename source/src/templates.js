// 새 앱을 만들 때 sketch/sketch.ino 에 넣을 수업용 시작 코드.
// UNO Q에서는 Serial 대신 Monitor(Arduino_RouterBridge)로 출력해야 크롬북 화면에 보인다.
export const TEMPLATES = {
  blank: {
    title: "기본 (보드가 만든 그대로)",
    desc: "arduino-app-cli가 만들어 주는 기본 파일을 그대로 씁니다.",
    sketch: null,
  },
  blink: {
    title: "LED 깜빡이 + 모니터 출력 연습",
    desc: "보드의 LED를 1초마다 켜고 끄며, 몇 번째인지 모니터에 출력합니다. 처음 연결을 확인할 때 좋아요.",
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
}
`,
  },
  counterexample: {
    title: "01차시 명제 — 반례 감지기 (초음파 + LED 2개)",
    desc: "조건 p: x<15, 조건 q: x<30 을 LED로 보여 주고, p→q 의 반례가 나오면 모니터에 알려 줍니다. (Trig D2, Echo D3, 초록 D8, 파랑 D9)",
    sketch: `// ============================================================================
// [고등학교 1학년 공통수학2 AI 융합 수업]
// 01차시: 명제와 조건 (아두이노Q에게 판단 규칙 학습시키기 & 반례 감지)
// UNO Q 버전: Serial 대신 Monitor 로 출력합니다.
// ============================================================================
#include <Arduino_RouterBridge.h>

const int trigPin = 2; // 초음파 센서 Trig 핀
const int echoPin = 3; // 초음파 센서 Echo 핀
const int ledP = 8;    // 규칙 p (초록 LED) : 가정
const int ledQ = 9;    // 규칙 q (파랑 LED) : 결론

void setup() {
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  pinMode(ledP, OUTPUT);
  pinMode(ledQ, OUTPUT);
  Monitor.begin();
}

// 물체와의 거리 x(cm)를 측정하는 함수
long getDistance() {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);
  long duration = pulseIn(echoPin, HIGH, 30000); // 30ms 넘으면 0
  return duration * 0.034 / 2; // 음속을 이용한 거리(cm) 환산
}

void loop() {
  long x = getDistance(); // 센서가 수집한 거리 데이터 x

  // -------------------------------------------------------------
  // [학생이 기계에게 가르치는 2가지 조건 (규칙)]
  // 조건 p : "물체와의 거리 x가 15cm 미만이다." (x < 15)
  // 조건 q : "물체와의 거리 x가 30cm 미만이다." (x < 30)
  // -------------------------------------------------------------
  bool p = (x < 15);
  bool q = (x < 30);

  digitalWrite(ledP, p ? HIGH : LOW);
  digitalWrite(ledQ, q ? HIGH : LOW);

  Monitor.print("x = ");
  Monitor.print(x);
  Monitor.print(" cm | p: ");
  Monitor.print(p ? "참" : "거짓");
  Monitor.print(" | q: ");
  Monitor.print(q ? "참" : "거짓");

  // p 는 참인데 q 는 거짓 → 명제 p→q 의 반례
  if (p && !q) {
    Monitor.println("  <-- 반례 발견!");
  } else {
    Monitor.println("");
  }

  delay(300);
}
`,
  },
};
