# 사무실 경비

[Expenses API](https://api.dvi-ind.com/expenses/swagger-ui/index.html)를 사용하는 웹 화면입니다.
경비, 구독(주기 결제 자동 생성), 임차관리비, 첨부파일, 연간 집계, 차변계정을 관리합니다.

## 실행

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ 에 정적 파일 생성
```

API 서버의 CORS 허용 출처가 `http://localhost:5173` 과 `https://expense-management-zefa.vercel.app` 이라서 개발 서버 포트를 5173 으로 고정했습니다.
다른 주소로 배포하려면 API 서버의 CORS 허용 목록과 로그인 리다이렉트 허용 목록에 그 출처를 추가해야 합니다.

API 주소를 바꾸려면 `.env.local` 에 지정합니다 (`.env.example` 참고).

```
VITE_API_BASE_URL=https://api.dvi-ind.com/expenses
```

## 로그인

1. 로그인 화면의 **DVI 통합 로그인**을 누르면 `/expenses/oauth2/authorization/keycloak?redirect={지금 접속한 출처}` 로 이동합니다.
2. 통합 로그인이 끝나면 API 서버가 `{출처}/auth/callback#token=…&refresh=…` 로 돌려보내고, 앱이 토큰을 저장해 바로 로그인됩니다.
   권한이 없으면 `#error=` 로 사유가 오고 로그인 화면에 표시됩니다.
3. 앱 토큰(30분)이 만료되면 갱신 핸들로 `/auth/refresh` 를 불러 화면 이동 없이 이어서 씁니다.

`redirect` 는 서버 허용 목록(`http://localhost:5173`, `https://expense-management-zefa.vercel.app`) 안의 출처만 받습니다.
목록에 없는 출처면 배포 주소로 돌아갑니다.

`/auth/callback` 같은 경로를 새로고침해도 열리도록 `vercel.json` 에서 모든 경로를 `index.html` 로 보냅니다.

토큰 발급 페이지(`/expenses/login/swagger`)에서 받은 토큰을 붙여넣는 방식도 로그인 화면의 **토큰을 직접 붙여넣기**에 남겨 두었습니다.

## 엑셀로 경비 가져오기

경비 화면의 **엑셀 가져오기**에서 .xlsx 파일을 고르면 미리보기 후 한 번에 등록합니다.

- 머리글에 `일자 · 거래처 · 품명 · 공급가액 · 세액 · 합계 · 차변계정`(선택: `연도`)이 있는 시트를 읽습니다. 이름에 '경비'가 들어간 시트를 먼저 찾습니다.
- 일자는 엑셀 날짜, `2026-07-07`, `7/31/26`, 연도 칸과 합친 `07-07`을 읽습니다.
- 차변계정은 이름이 같은 계정을 쓰고, `(판)` 같은 접두어만 다르면 기존 계정에 맞추며, 없으면 새로 만듭니다.
- 같은 일자·거래처·품명·합계의 경비가 이미 있으면 건너뛰므로 같은 파일을 다시 가져와도 중복되지 않습니다.
- 사업자등록번호처럼 API 에 없는 칸은 가져오지 않습니다.

## 화면

| 경로 | 내용 | API |
|---|---|---|
| `/expenses` | 경비와 임차관리비를 한 표로(연도·일자·거래처·품명·공급가액·세액·합계·차변계정·첨부파일), 연·월 또는 기간 조회, PDF 다운로드, 등록/수정/삭제, 첨부파일. 임차관리비는 한 줄로 묶이고 누르면 임대료(임차비+관리비)와 전기료로 펼쳐짐 | `/expense`, `/lease-cost`, `/attachment` |
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
