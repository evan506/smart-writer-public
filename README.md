# Smart Writer

[🔗 라이브 데모](https://smart-writer-vq8j.vercel.app/demo) · [English README](./README.en.md) · [![CI](https://github.com/evan506/smart-writer-public/actions/workflows/test.yml/badge.svg)](https://github.com/evan506/smart-writer-public/actions/workflows/test.yml)

![Smart Writer 집필 워크스페이스](./assets/screenshots/app/01-write-workspace.png)

**웹소설 작가를 위한 근거 기반 설정 일관성 워크스페이스.** 작가가 쓴 원고를 읽고 인물·설정·관계·복선 후보를 제안하되, 각 후보의 **원문 근거**를 함께 보여주고, 작가가 승인한 것만 작품 기억으로 저장합니다.

> 글은 작가가 씁니다. Smart Writer는 원고 속 설정을 잊지 않게 돕습니다.
> **자동 생성 도구가 아닙니다.** AI는 문장을 쓰지 않습니다. 후보를 제안할 뿐이고, 채택 여부는 사람이 결정합니다.

라이브 데모는 [`/demo`](https://smart-writer-vq8j.vercel.app/demo)에서 **회원가입 없이** 집필 → 후보 검토 → 작품 기억 흐름을 바로 볼 수 있습니다.

## 공개본 기준과 본인 역할

이 공개본은 **2026-10-24 로컬 작업본을 기준으로 2026-10-25 갱신한 평가용 스냅샷**입니다. 작업 저장소의 개발 이력과 내부 문서는 포함하지 않습니다.

- **본인 역할:** PRD를 바탕으로 요구사항·우선순위·제품 방향을 관리하고, 원고 보존과 기존 기능의 회귀 방지를 작업 조건으로 제시했습니다. 로컬 PC에서 한글 입력 동작을 직접 확인했습니다.
- **AI 활용:** ChatGPT·Codex를 사용합니다. 코드 구현·기술적 원인 분석·자동 테스트 실행은 AI 코딩 에이전트에 위임했습니다.
- **이번 코드 갱신:** 원고 저장·예산 처리 보완, 검색/Q&A 근거 처리, PC 입력·표시 개선, 설정 확인 후 원고 위치 복귀 기능과 관련 회귀 테스트를 포함합니다.
- **확인 범위:** 최근 PC·반응형 개선은 로컬 구현 기준이며, 운영 데모에 모두 배포된 것은 아닙니다. 실제 기기 IME·모바일 전체 흐름과 제품 모델의 답변 품질은 별도 검증 과제입니다.
- **공개 데이터:** 기존 공개본의 합성 샘플을 유지합니다. 비공개 원고·원고에서 추출한 평가 데이터·내부 진단 시나리오는 포함하지 않습니다.

## Highlights

- **집필 워크스페이스** — Tiptap 커스텀 에디터. debounce 자동저장, 오프라인 감지, 미저장 이탈 경고, 엔티티/경고 인라인 하이라이트.
- **근거 기반 AI 검토** — 엔티티·관계·설정 후보가 *원문 근거*와 함께 도착하고, 작가의 명시적 승인 없이는 캐논에 들어오지 않습니다.
- **인터랙티브 관계 그래프** — d3-force 커스텀 렌더러(줌·팬·노드 드래그, 타입별 노드/엣지).
- **테스트·CI 기반 검증** — 유닛 테스트, Playwright E2E, GitHub Actions CI, Docker 기반 마이그레이션 재생 게이트.

## 제품 흐름

```text
원고를 쓴다
  → AI가 후보를 탐지 (엔티티, 별칭, 관계, 설정)
  → 작가가 후보마다 원문 근거를 확인
  → 작가가 승인
  → 승인된 항목만 작품 기억(코덱스)이 됨
  → 검색·엔티티 상세·관계 그래프·근거 기반 Q&A에서 재사용
```

전 구간을 관통하는 설계 원칙: **AI는 제안하고, 작가가 결정한다.**

## 주요 기능

- **집필 워크스페이스** — Tiptap 기반 데스크톱 에디터. debounce 자동저장(초안 저장 / AI 추출 포함 전체 저장 분리), 오프라인 감지, 미저장 변경 이탈 경고.
- **후보 검토** — 엔티티·별칭·관계·설정이 *검토 후보*로 도착합니다. 자동으로 사실이 되지 않습니다. 각 후보는 원문 근거를 노출합니다.
- **코덱스(작품 기억)** — 승인된 인물·장소·조직·아이템·개념·마법체계와 별칭, 등장 챕터, 근거 이력.
- **하이브리드 검색/RAG** — pgvector 유사도 + PostgreSQL trigram 텍스트 검색 + 그래프 확장을 결합하고 경량 재랭킹.
- **근거 기반 Q&A** — 답변이 어떤 근거에서 나왔는지 인용합니다. 의도적으로 "모든 걸 아는 신탁"이 아닙니다.
- **관계 그래프** — d3-force 기반 인터랙티브 그래프(줌·팬·노드 드래그).
- **점진적 구상** — `시작 / 전개 / 전환 / 결말` 4블록에서 시작해, 작가가 원하는 곳만 하위 카드로 확장합니다.
- **LLM 비용 가드레일** — 프로젝트·사용자 단위 일간/월간 예산 검사. 한도 초과 시 **원고는 정상 저장되고 AI 추출만 중단**되는 그레이스풀 디그레이션.

## 스크린샷

### 1. 후보 검토 (원문 근거)

우측 검토 패널. 엔티티·별칭·관계 후보마다 유래한 원문 근거를 함께 보여주고, 작가가 *저장 / 수정 후 승인 / 넘기기*를 직접 결정합니다.

![후보 검토 패널](./assets/screenshots/app/04-review-panel.png)

### 2. 작품 기억(코덱스)

승인된 항목과 검토 후보를 타입별로 정리한 목록. 별칭, 관계 수, 첫 등장 화수, 상태(작가 승인 / 검토 필요)를 한눈에 봅니다.

![작품 기억](./assets/screenshots/app/02-codex-memory.png)

### 3. 관계 그래프

d3-force 인터랙티브 그래프. 타입별 노드/엣지, 줌·팬·드래그, 항목 클릭 시 상세.

![관계 그래프](./assets/screenshots/app/03-relationship-graph.png)

### 4. 점진적 구상

`시작 / 전개 / 전환 / 결말` 4블록에서 필요한 곳만 하위 카드로 드릴다운.

![구상 워크스페이스](./assets/screenshots/planning-v2/01-planning-desktop-default.png)

## 기술 스택

| 영역 | 스택 |
|---|---|
| 앱 | Next.js 16 (App Router), React 19, TypeScript |
| 데이터 | Supabase PostgreSQL + pgvector + pg_trgm, Row Level Security |
| 에디터 | Tiptap 3 (커스텀 엔티티/경고 하이라이트 플러그인) |
| UI | Tailwind v4, shadcn/ui + Radix, CVA, 커스텀 디자인 토큰 |
| 시각화 | d3-force (커스텀 인터랙티브 그래프 렌더러) |
| 검증 | Zod |
| LLM | OpenRouter 경유 Claude 계열 모델 + OpenAI 호환 임베딩(`text-embedding-3-small`). 기본 모델은 `src/lib/services/llm-models.ts`, 선택적 변경 변수는 `.env.example`에서 확인 |
| 테스트 | Vitest, Testing Library, Playwright |
| 툴링 | pnpm 10.25.0, ESLint, knip (dead-code 게이트) |

**UI 상태는 범위에 따라 나눠 관리합니다** — 상호작용 로컬 상태는 React 훅, 공유/새로고침 가능한 상태는 URL 검색 파라미터, 서버 데이터 변경은 Server Actions(`revalidatePath` + `router.refresh`). 현재 제품 규모에서는 별도 전역 스토어를 도입하지 않았습니다.

## 아키텍처 노트

```text
Browser
  └─ Client Components (말단 상호작용만 "use client")
       └─ Server Actions ("use server")
            ├─ 소유권 가드 (requireProjectOwner / requireChapterOwner)
            ├─ 도메인 서비스 (src/lib/services/*)
            └─ Supabase PostgreSQL
                   ├─ RLS (auth.uid())
                   ├─ pgvector / pg_trgm
                   └─ after() 백그라운드 인덱싱·추출
```

- **기본은 서버 컴포넌트.** 데이터 조회는 Server Component에서, 상호작용이 필요한 말단만 `"use client"`. 모든 변경은 `"use server"` 액션을 통과합니다.
- **레이어 분리.** 서버 액션(`*-actions.ts`)은 얇은 어댑터(권한 확인 → 서비스 호출 → revalidate)이고, 비즈니스 로직은 `src/lib/services/`에 있습니다.
- **데이터 격리 다층 방어.** RLS 정책(`auth.uid()`)에 더해, 프로젝트 범위 서버 액션 전부에 소유권 가드를 명시적으로 적용합니다.
- **백그라운드 처리.** 저장 후 인덱싱과 LLM 추출은 `after()`에서 실행되어 저장은 즉시 반환됩니다.
- **Supabase는 서버 전용.** 브라우저용 Supabase 클라이언트가 없습니다.

## 검증

아래 로컬 설치 절차로 의존성과 `.env.local`을 먼저 준비한 뒤 실행합니다.

```bash
pnpm lint
pnpm typecheck
pnpm typecheck:scripts
pnpm test:run          # 공개본 검증 결과는 아래 검증 기록 참조
pnpm build
```

건너뛰기 안전한 확장 스위트:

```bash
SMART_WRITER_INTEGRATION_TESTS=1 pnpm test:integration  # 로컬 DB 환경 필요
pnpm test:e2e          # 인증 플로우는 SMART_WRITER_AUTH_E2E_TESTS=1 없으면 skip
pnpm db:replay-verify  # Docker 기반 마이그레이션 재생 게이트
```

CI(GitHub Actions)는 lint → knip → typecheck → unit coverage → 기본 E2E → build를 실행합니다. 별도 job에서 로컬 Supabase를 띄워 합성 데이터 기반 DB 통합·인증 E2E 회귀 검증을 수행합니다. 유료 AI 호출이나 운영 DB 변경을 위한 배포 설정은 포함하지 않습니다.

## 의도적으로 만들지 않은 것

만들지 *않기로* 한 것들입니다. 범위를 지키는 것도 기능입니다:

- AI 자동 집필 / 챕터 생성
- 출판·결제·내보내기·독자용 페이지
- 대량 원고 임포트, 전작품 캐논 헬스 대시보드
- 프로덕션급 설정 충돌 판정
- 장편 전체에 대한 완전한 관계 그래프 진단
- 실사용 검색 품질에 대한 광범위한 주장 (검색 테스트가 증명하는 건 *plumbing과 결정적 recall*이지, 사람이 판단한 관련성이 아닙니다)
- 캐릭터 챗 / 독자 롤플레이

## 빠르게 체험하기

- **호스팅 데모**: <https://smart-writer-vq8j.vercel.app/demo>
- `/demo`에서 원클릭 로그인 — 별도 회원가입이나 개인 API 키 불필요
- 시드된 「흑철기사단 연대기」 3화로 집필 → 후보 검토 → 작품 기억 흐름을 그대로 확인

## 로컬 설치와 실행

검증 환경: Node.js **22.12 이상**(검증 시 22.22), pnpm **10.25.0**, Supabase CLI **2.65.5**, 실행 중인 Docker. Node.js 버전은 `.node-version`, 의존성 버전은 `pnpm-lock.yaml`을 기준으로 합니다.

```bash
git clone https://github.com/evan506/smart-writer-public.git
cd smart-writer-public
corepack prepare pnpm@10.25.0 --activate
pnpm install --frozen-lockfile
```

### A. 새 로컬 DB에서 시작하기 (권장)

```bash
supabase start
supabase db reset --local
supabase status -o env
cp .env.example .env.local
```

`supabase status -o env`의 `API_URL` → `NEXT_PUBLIC_SUPABASE_URL`, `ANON_KEY` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`를 `.env.local`에 복사합니다. 값이 채워진 뒤 실행하세요.

```bash
pnpm dev
```

`http://localhost:3000/signup`에서 로컬 테스트 계정을 만든 뒤 작품 생성 → 회차 생성 → 집필을 시작합니다. 로컬 Auth는 이메일 확인을 요구하지 않습니다. 빈 DB에는 데모 계정이나 작품이 자동 생성되지 않습니다.

공개본의 로컬 DB는 프로젝트 ID `smart-writer-public`, API **57431**, DB **57432**, Studio **57433**, 메일함 **57434**를 사용합니다. 기존에 같은 포트를 사용 중이면 `supabase/config.toml`에서 바꿉니다. 로컬 API는 HTTP로 실행하므로 자체 서명 인증서 우회 설정은 필요하지 않습니다. `db reset --local`은 이 로컬 DB의 데이터를 초기화하므로 새 설치 또는 테스트 DB에만 실행하세요.

### AI 없이 확인할 수 있는 범위 / 실제 AI 실행

- OpenRouter 키 없이도 가입·로그인, 작품/회차 생성, 초안 자동저장, 직접 등록한 작품 기억과 합성 샘플 후보 검토를 확인할 수 있습니다.
- **실제 AI 추출·임베딩·Q&A**에는 본인의 유효한 `OPENROUTER_API_KEY`와 사용 가능한 API 크레딧이 필요합니다. ChatGPT 구독과 OpenRouter API 크레딧은 별개입니다. 키 없이 AI 실행을 눌러도 AI 결과가 생성되는 것은 아닙니다.
- 기본 모델은 `src/lib/services/llm-models.ts`, 선택적 변경 변수는 `.env.example`을 확인하세요. 테스트에서 사용하는 가짜 키·모의 응답은 실제 AI 품질을 검증하지 않습니다.

### 선택: 합성 샘플로 바로 체험하기

로컬 DB와 `.env.local` 준비 후 실행합니다. 외부 AI를 호출하지 않고 테스트 계정·작품·후보를 만듭니다.

```bash
pnpm seed:e2e
```

명령이 출력한 이메일·비밀번호로 로그인하세요. 샘플은 짧은 공개 합성 문장을 여러 회차에 반복 배치한 테스트 데이터이며 실제 장편 원고가 아닙니다. `/demo` 원클릭 진입을 로컬에서도 사용하려면 출력된 계정을 `.env.local`의 `DEMO_LOGIN_EMAIL`·`DEMO_LOGIN_PASSWORD`에 설정하고 개발 서버를 재시작합니다. 미설정 시 `/demo`는 안내와 함께 로그인 화면으로 돌아갑니다.

```bash
pnpm cleanup:e2e        # 삭제 대상만 확인
pnpm cleanup:e2e:apply  # 테스트 계정의 E2E 작품 삭제
supabase stop           # 이 폴더의 로컬 DB 정지, 데이터 보존
```

### B. 이미 준비된 별도 개발용 Supabase 사용

이 프로젝트의 마이그레이션과 Auth 설정이 적용된 개발용 DB에 한해 `.env.local`의 URL·anon key를 해당 DB 값으로 바꾸고 `pnpm dev`를 실행합니다. **빈 원격 DB에 환경값만 넣어서는 작동하지 않습니다.** 새 설치를 검토하는 경우 A 경로를 사용하세요. 이 안내는 원격 DB의 초기화나 운영 배포를 수행하지 않습니다.

### 테스트 실행

```bash
pnpm lint
pnpm typecheck
pnpm typecheck:scripts
pnpm test:run
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm test:e2e` 기본 실행에는 DB·인증 조건부 검사 건너뛰기가 있습니다. 전체 DB·인증 검사는 이 저장소의 별도 로컬 Supabase에서 다음 명령으로 실행합니다(테스트 DB 초기화 포함).

```bash
bash scripts/ci/run-db-backed-integration.sh
```

평가 스크립트에 본인의 원고를 입력할 경우 `references/test-data/`를 사용합니다. 이 경로와 생성된 평가 보고서는 Git 추적에서 제외됩니다. 비공개 원고는 기본 설치·공개 테스트에 필요하지 않습니다.

## 프로젝트 구조

```text
src/
  app/
    (auth)/        로그인, 회원가입
    (dashboard)/   프로젝트, 구상, 코덱스, 검색, 복선
    (write)/       전체화면 집필 워크스페이스
  components/
    ui/            공통 shadcn/ui 프리미티브
    write/         집필 워크스페이스 (에디터, 코덱스 패널, d3 그래프)
    planning/      4블록 구상 워크스페이스
  lib/
    services/      추출, 임베딩, 검색, RAG, 캐논 팩트
    auth/          소유권 가드
    supabase/      서버 클라이언트 + 미들웨어
    design-tokens.ts
supabase/migrations/   스키마, RLS 정책, RPC (+ verify/rollback 컴패니언)
tests/                 unit, integration, e2e
```

## 이 저장소에 대하여

> 프라이빗 작업 저장소의 **큐레이션된 공개 스냅샷**입니다. 자동 동기화되는 미러가 아닙니다. 개발 히스토리, 내부 설계 문서, 작성자 본인의 원고 데이터는 비공개로 유지됩니다.

## 공개본 검증 기록

2026-10-25, 비공개 원고·운영 환경값 없이 이 공개본에서 실행했습니다.

- 단위 테스트 **131파일 / 1,065개 통과**, 설정된 커버리지 기준 통과.
- ESLint, 앱·스크립트 TypeScript 검사, knip, 프로덕션 빌드 통과.
- 기본 브라우저 테스트 **1개 통과 / DB·인증 조건부 17개 건너뜀**. 건너뛴 검사를 통과로 계산하지 않습니다.
- DB 통합·인증 E2E는 별도 GitHub Actions job의 실제 결과를 확인하세요.
- 비공개 원고 기반 진단 도구·평가 데이터는 제외했으므로 작업 저장소의 전체 테스트 수와 다릅니다.
- 이 검사는 실제 제품 모델의 답변 품질이나 운영 데모의 최신 배포 상태를 증명하지 않습니다.

## 라이선스

**소스 공개, 오픈소스 아님.** 포트폴리오 및 평가 목적으로 공개합니다. 코드를 읽고 검토하고 로컬에서 실행해 평가하는 것은 자유이나, 제품에의 사용·재배포·2차적 저작물 작성은 서면 허락 없이 불가합니다. [LICENSE](./LICENSE) 참조.
