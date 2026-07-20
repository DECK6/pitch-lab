# PITCH/LAB 02

브라우저 안에서 마이크 입력의 단선율 음정을 분석하고 정확한 피아노 기준음을 들려주는 웹 악기입니다.

- Light: 가벼운 DSP 기반 기본 음정 추정
- Neural: 필요할 때만 내려받는 SwiftF0 + ONNX Runtime Web 추론과 DSP 정밀 보정
- 표시: 음 이름, 옥타브, Hz, cents 오차, 신뢰도, 최근 음정 궤적
- 모드: 자유 음정을 확인하는 TUNING과 키·코드 음을 연습하는 PRACTICE
- 화음 연습: 12개 장조·단조의 다이어토닉, 텐션, 관련·차용 코드를 보고 ROOT·ARPEGGIO·CHORD로 재생
- 목표음 판정: 선택한 코드 톤을 부르면 600 ms 구간의 음정과 안정성을 LOCKED·CLOSE·RETRY로 표시
- 입력: 데스크톱·노트북·모바일 브라우저 마이크
- 개인정보: 마이크 오디오는 서버로 전송하지 않고 브라우저에서 처리

- V2 프로덕션: <https://dexa.art/pitchlab/>
- V2 별도 경로: <https://dexa.art/pitch-lab-v2/>
- V1 소스 기준점: `main`의 `b490341`

## 로컬 실행

Node.js 22 이상이 필요합니다.

```bash
npm install
npm run dev
```

최초 실행 또는 빌드 때 고정 버전의 Neural 모델과 WASM 런타임을 내려받고 체크섬을 검증합니다.

## 검증과 빌드

```bash
npm run verify
npm run qa:smoke
```

```bash
npm run build
```

정적 배포 파일은 `dist/`에 생성됩니다. 상대 경로로 빌드되므로 `/pitch-lab-v2/`나 `/pitchlab/` 같은 하위 경로에서도 동작합니다.
