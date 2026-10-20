# AI 제공자 가능성 확인 (2026-10-21)

공개 문서만 조사했다. 자격증명 파일(`~/.claude`, `~/.codex`, 키체인)은 열지 않았다. 실제 로그인·호출 확인은 사용자 손이 필요해 구현 후 수동 확인으로 미룬다(맨 아래).

## 판정

| 제공자 | connection | 한 줄 이유 |
|---|---|---|
| `claude` | **cli** | Anthropic 공식 문서가 제3자 앱의 구독 OAuth 사용을 금지한다. |
| `chatgpt` | **oauth** | OpenAI가 로컬·오픈소스 앱용 "Sign in with ChatGPT" 공식 계약을 공개했다. |

### claude — OAuth 불가, CLI로 연결

- 출처: <https://code.claude.com/docs/en/legal-and-compliance> ("Authentication and credential use", 직접 읽음).
- 인용: "Anthropic does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, or Max plan credentials on behalf of their users. Moreover, developers may not collect, store, or intermediate Claude.ai credentials or session tokens — sign-in to a Claude account must complete through Anthropic's own flow." 그리고 "Anthropic reserves the right to take measures to enforce these restrictions and may do so without prior notice."
- 같은 페이지가 허용하는 것: "an end user [signing] in to the unmodified Claude Code binary with their own Claude subscription". 즉 이 PC에 로그인된 **수정하지 않은 `claude` CLI**를 호출하는 것은 문서상 허용 범위다(개인의 일반적 사용 한도 내).
- 그래서 사용자가 미리 정한 규칙 A("막힌 쪽은 CLI")를 적용한다. 앱은 Claude 토큰을 받지도 저장하지도 않는다.
- 일부 블로그가 2026-10-07에 이 문구가 바뀌었다고 썼지만, 위 인용은 오늘 공식 페이지에서 직접 읽은 현재 문구다.
- `connection: cli`
  - 상태 확인: `claude auth status --json` (이 PC의 `claude` 2.1.304에서 옵션 확인함).
  - 로그인: 사용자가 터미널에서 `claude auth login`. 설정 화면은 상태와 이 명령을 안내한다.
  - 호출: `claude -p <prompt> --output-format json` (기존 `src/lib/ai/layout-analyst.ts`의 `viaCli`와 같은 방식). 이미지는 임시 폴더에 쓰고 `--allowedTools Read`로 읽게 한다. 모델은 `AI_CLAUDE_MODEL`(기본 `sonnet`).
  - `supports_images`: true (Read 도구로 파일을 읽는다).
  - `refresh_rotates`: 해당 없음(토큰을 앱이 만지지 않는다).

### chatgpt — 공식 OAuth(로컬·오픈소스 앱)

출처: <https://developers.openai.com/siwc/token-sharing-open-source> 와 하위 문서 `sign-in.md`, `models-and-inference.md`, `token-reference.md`, `preview-limitations.md`, <https://learn.chatgpt.com/docs/sign-in-with-chatgpt.md>.

- 범위: "The docs cover open-source and locally hosted apps only. Paid or remotely hosted apps need the interest form." 이 앱은 한 사람이 자기 맥에서 돌리는 로컬 앱이다. 미리보기(preview) 단계 기능이다.
- `connection: oauth`
- `authorize_url`: `https://auth.openai.com/api/accounts/authorize`
- `token_url`: `https://auth.openai.com/api/accounts/oauth/token` (form-encoded, 클라이언트 시크릿 없음)
- `client_id`: 첫 등록은 `dynamic_agent_client`. 콜백이 돌려주는 발급 ID(`oaiapp_...`)를 저장해 이후 모든 요청과 토큰 교환에 쓴다. 발급 ID는 로그인한 사용자·작업 공간에 묶인다.
- authorize 파라미터: `client_id`, `agent_name_hint`(첫 등록만), `ext_agent_host_id`(필수, 이 호스트 고유 값. `urn:uuid:<UUIDv4>`를 한 번 만들어 영구 저장), `id_token_hint`(재인증 때 직전 ID 토큰), `response_type=code`, `redirect_uri`, `scope`, `resource`, `state`, `nonce`, `code_challenge_method=S256`, `code_challenge`.
- `scopes`: `openid profile email offline_access resource.invoke chatgpt.tokens.use.direct`. 토큰 응답의 granted scope에 `chatgpt.tokens.use.direct`가 있는지 확인한 뒤에만 추론을 호출한다.
- `resource`: `https://api.openai.com/v1` (authorize와 토큰 교환에 같은 값).
- `redirect_uri`: **`127.0.0.1` 루프백 HTTP**여야 한다(`localhost` 불가). 포트만 바뀔 수 있고 스킴·호스트·경로는 처음과 정확히 같아야 한다. authorize와 코드 교환에 같은 URI를 보낸다. 예: `http://127.0.0.1:<앱 포트>/api/ai/oauth/chatgpt/callback`.
  - 결과: 사용자는 `http://127.0.0.1:3000`으로 앱을 열어 로그인 버튼을 눌러야 한다. 상태·PKCE 값은 호스트가 다른 쿠키에 못 싣고 서버 메모리에 둔다.
  - `APP_ACCESS_KEY`를 켠 상태면 `127.0.0.1` 쪽에도 접근 쿠키가 있어야 콜백이 통과한다.
- 콜백: 신규 등록이면 `code`, `state`, `client_id`, `scope`를 돌려준다. 발급 `client_id`가 없으면 등록 실패로 본다. 재인증에서 다른 `client_id`가 오면 거부한다. `error=access_denied`면 state 확인 후 중단한다.
- ID 토큰 검증: OpenAI JWKS 서명, issuer `https://auth.openai.com`, audience = 발급 `client_id`, `exp`, 저장해 둔 `nonce`. `sub`가 계정 식별자다. (JWKS URL은 문서에 없다. 구현 시 issuer의 `/.well-known/openid-configuration`에서 찾고, 못 찾으면 서명 검증 없이 클레임만 확인하는 대신 **로그인 실패**로 처리한다.)
- `refresh_rotates`: **true.** 갱신할 때마다 새 refresh token이 나온다. 액세스 토큰 수명 1시간(`expires_in: 3600`), refresh token 30일(갱신마다 30일로 연장). 응답 필드: `access_token`, `refresh_token`, `id_token`, `token_type`, `expires_in`, `scope`, `earliest_refresh_at`. 갱신 요청은 `grant_type=refresh_token` + `refresh_token` + 발급 `client_id`(+ `resource`)로 보낸다. 정확한 파라미터는 "Refreshing tokens" 문서를 확인하지 못해(404) 표준 형태로 가정했다. 첫 실행에서 확인한다.
- `api_base`: `https://api.openai.com/v1/responses` (POST), `Authorization: Bearer <access_token>`. ChatGPT의 `backend-api`는 쓰지 않는다("do not point this flow at ChatGPT's backend-api endpoints").
- `required_headers`: `Authorization`만 문서에 있다.
- 요청 제약: `store: false`, `stream: true` 필수. `input`은 배열. 시스템 지침은 `instructions`로 보낸다(`role: system` 메시지는 거부됨). 쓰면 안 되는 필드: `background, conversation, max_output_tokens, max_tool_calls, metadata, moderation, multi_agent, prompt, prompt_cache_retention, safety_identifier, temperature, top_logprobs, top_p, truncation, user`, `previous_response_id`. 스트림은 `response.output_text.delta`를 이어 붙이고 `response.completed`가 와야 성공이다. `response.failed`/`response.incomplete`/완료 이벤트 없는 종료는 실패. 한도 초과는 `response.failed`의 `subscription_sharing_usage_limit_exceeded` 또는 `subscription_sharing_usage_unavailable`(→ `AiError("quota")`).
- `model_ids`: `GET https://api.openai.com/v1/models`(같은 Bearer)의 `models[]` 중 `visibility === "list"`인 항목의 `slug`를 `model`로 쓴다. `AI_CHATGPT_MODEL`로 고정할 수 있다.
- `supports_images`: **조건부 true.** "Text, images, and files are supported when the selected model accepts them." 모델별 가능 여부는 문서에 없다. 이미지를 보냈다가 실패하면 `AiError("invalid_output"가 아닌 "internal")`로 올리고, 제공자는 이미지 없는 요청으로 재시도하지 않는다(분석 단계는 `supportsImages`로 건너뜀). 구현은 `supportsImages = true`로 두고 첫 실행에서 확인한다.
- 사용량: 구독 한도와 같은 풀을 쓰고, 사용자가 설정에서 앱별 주간 상한을 걸 수 있다.

## 구현 계획에 반영한 변경 (Task 5)

1. Claude는 OAuth 라우트·PKCE·토큰 저장 없이 `cli.ts`로만 구현한다. 설정 화면은 `claude auth status` 결과와 `claude auth login` 안내를 보여 준다.
2. ChatGPT OAuth는 위 계약대로 구현한다. 서버 메모리에 대기 중인 로그인(verifier·state·nonce, 10분 만료)을 둔다.
3. `AiTokens`에 `client_id`, `id_token`을 선택 필드로 추가한다. `ext_agent_host_id`는 `AI_CHATGPT_HOST_ID`로 `.env.local`에 한 번 저장한다.
4. 라우트는 `/api/ai/oauth/chatgpt/{start,callback}`만 만든다.

## 수동 확인 (구현 후, 사용자 손 필요)

- [ ] `claude auth status --json`이 로그인 상태를 보여 주는지, 설정 화면의 Claude 카드가 맞게 표시하는지.
- [ ] `http://127.0.0.1:3000/settings/ai`에서 "ChatGPT로 로그인" → 브라우저 인증 → `connected:true`.
- [ ] 갱신: 만료를 앞당긴 상태에서 한 번 호출해 refresh가 되고 `.env.local`의 값이 바뀌는지.
- [ ] 이미지 한 장을 붙인 분석 호출이 성공하는지(실패하면 ChatGPT `supportsImages`를 false로).
