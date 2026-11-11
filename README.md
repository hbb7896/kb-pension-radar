# 📊 KB Pension Radar (`kb-pension-radar`)

**KB국민은행 퇴직연금(DC/IRP) 거래 가능 284개 전 종목 ETF 멀티차트 센터 & Tom Doub 1R 트레이딩 시스템**

---

## 🌐 실시간 웹앱 접속 (모바일 PWA & PC 지원)

* **KB국민은행 퇴직연금 284 ETF 멀티차트 센터 (Firebase Hosting):**
  👉 **[https://studio-7527545089-f307c.web.app/kb-etf.html](https://studio-7527545089-f307c.web.app/kb-etf.html)**
* **Tom Doub 1R-System 메인 대시보드:**
  👉 **[https://studio-7527545089-f307c.web.app](https://studio-7527545089-f307c.web.app)**

---

## ✨ 주요 기능

1. **KB국민은행 퇴직연금 284개 전 종목 ETF 멀티차트 그리드 (`public/kb-etf.html`)**
   * **일봉 · 주봉 · 월봉 일괄 전환**: 284개 전체 ETF 차트의 주기를 원클릭으로 동시 변경
   * **퇴직연금 자산군 필터**:
     * `🟢 안전자산 (100% 편입 가능, 73종)`: 채권형, 금리/파킹형(CD·KOFR·머니마켓), 채권혼합형, 적격 TDF
     * `🟠 위험자산 (최대 70% 한도, 211종)`: 미국대표지수, AI/반도체/빅테크, 배당/커버드콜, 국내외 섹터 및 리츠
   * **운용사별 필터**: `RISE(KB)`, `TIGER(미래에셋)`, `KODEX(삼성)`, `ACE(한국투자)`, `SOL(신한)`, `PLUS(한화)`, `HANARO(NH)`, `KOSEF(키움)`, `TIMEFOLIO`
2. **90봉 대화형 상세 차트 & 기술적 지표 분석**
   * 캔들 차트 + 이동평균선(`MA5`, `MA20`, `MA60`) + 20봉 고저 채널 + 거래량 + `ATR(14)` + `RSI(14)`
   * PC 마우스 오버 및 모바일 손가락 터치 드래그 십자선(Crosshair) 시세 조회
3. **다중 종목 수익률 비교 차트 & DC/IRP 70:30 의무비중 시뮬레이터**
   * 최대 6개 ETF의 정규화 누적 수익률(%) 곡선 중첩 비교
   * 종목별 비중(%) 설정 시 퇴직연금 위험자산 70% 한도 준수 여부 및 가중평균 수익률·배당률·총보수 자동 계산
4. **모바일 웹앱(PWA) & QR코드 즉시 연결**
   * 스마트폰 카메라 QR 스캔 접속 및 iOS/Android 홈 화면 앱 설치 지원

---

## 🚀 로컬 실행 및 배포 방법

```bash
# 로컬 서버 실행 (http://localhost:3000/kb-etf.html)
node server.js

# Firebase Hosting 재배포
firebase deploy --only hosting
```
