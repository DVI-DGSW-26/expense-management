# 사무실 경비

[Expenses API](https://api.dvi-ind.com/expenses/swagger-ui/index.html)를 사용하는 웹 화면입니다.
경비, 구독(주기 결제 자동 생성), 임차관리비, 첨부파일, 연간 집계, 차변계정을 관리합니다.

## 실행

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ 에 정적 파일 생성
```

API 서버의 CORS 허용 출처가 `http://localhost:5173` 이라서 개발 서버 포트를 5173 으로 고정했습니다.
다른 주소로 배포하려면 API 서버의 CORS 허용 목록에 그 출처를 추가해야 합니다.

API 주소를 바꾸려면 `.env.local` 에 지정합니다 (`.env.example` 참고).

```
VITE_API_BASE_URL=https://api.dvi-ind.com/expenses
```

## 로그인

1. 로그인 화면의 **DVI 통합 로그인 열기**를 누르면 `/expenses/login/swagger` 가 새 탭에서 열립니다.
2. 통합 로그인 후 표시되는 앱 토큰(수명 30분)을 복사해 붙여넣습니다.
3. 갱신 핸들(refreshToken)도 함께 넣으면 토큰이 만료될 때 `/auth/refresh` 로 자동 갱신합니다.

로그인 서버가 이 앱으로 `#accessToken=…&refreshToken=…` 을 붙여 돌려보내면 자동으로 로그인되도록 해 두었습니다.
앱 전용 로그인 리다이렉트 엔드포인트가 생기면 로그인 버튼의 주소(`src/api/client.ts` 의 `TOKEN_PAGE_URL`)만 바꾸면 됩니다.

## 화면

| 경로 | 내용 | API |
|---|---|---|
| `/expenses` | 경비 목록·필터·합계, 등록/수정/삭제, 첨부파일 | `/expense`, `/attachment` |
| `/subscriptions` | 구독 등록/수정, 일시중지·재개, 해지일, 결제 내역, 결제분 수동 생성 | `/subscription` |
| `/lease` | 임차관리비 연간 12개월 표, 월별 등록/수정/삭제, 첨부파일 | `/lease-cost` |
| `/summary` | 월별 지출 막대 그래프, 월별 표, 차변계정별 합계 | `/summary` |
| `/accounts` | 차변계정 추가·이름/순서 변경·삭제 | `/debit-account` |

## 구조

```
src/
  api/        client.ts (토큰·요청·자동 갱신), endpoints.ts, types.ts
  auth/       로그인 상태, 로그인 화면
  components/ 공용 UI, 첨부파일, 차변계정 선택
  pages/      화면별 컴포넌트
  styles.css  디자인 토큰과 전체 스타일 (다크 모드 포함)
```
