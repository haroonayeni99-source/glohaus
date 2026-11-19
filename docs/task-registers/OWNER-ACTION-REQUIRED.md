# OWNER ACTION REQUIRED — Haroon Must Assist

Updated: 18 November 2026. Technical tasks and evidence remain in [INDEPENDENT-WORK.md](INDEPENDENT-WORK.md). Do not ask for passwords, recovery codes, tokens or private connection strings in chat. Use the provider's secure sign-in/configuration process.

## 1. Can Do Now

| ID | Platform / exact action | Why Owner assistance is necessary | Location | Effort | Payment | Required result/evidence | Unblocks |
|---|---|---|---|---|---|---|---|
| O-001 | Sign in to the existing Supabase dashboard; open Connect for **GLOHAUS isolated validation** (`rqsyakggwmpkqzzogvll`). Supply only its non-secret pooler host, port and project-qualified runtime username, or securely correct the EXISTING branch-scoped Preview DATABASE_URL with the matching credential | The stored Sensitive URL cannot be read back; hosted requests prove 28P01 but do not prove its intended target. Available connector does not expose the Connect template. Browser currently shows Supabase sign-in, not a signed-in project. Do not rotate or guess a role password before target proof | [Isolated project](https://supabase.com/dashboard/project/rqsyakggwmpkqzzogvll); [glohaus1 environment settings](https://vercel.com/haroon-glohaus/glohaus1/settings/environment-variables). Preview branch `fix/isolated-preview-auth-20261112` only | About 5–10 minutes | No known upgrade required | Non-secret host/port/username and confirmation of secure configuration update. Do not send password or full credential URL. ChatGPT must then verify TLS, DB access and actual signed-in pages | I-001, then I-002/I-003/I-004 and hosted checks |
| O-002 | Provide an authorised, restorable production-backup route and recovery evidence, or securely sign in so the existing backup/export options can be inspected | Current records do not establish a restorable backup. Production schema work must not proceed without recovery evidence; the connector has no backup-status/restore-test API | [Production Supabase project](https://supabase.com/dashboard/project/tyycrmmczsgnowditnii), Database/Backups and Connect/export controls | Depends on backup size and restore route; first inspection about 5–10 minutes | Do not purchase an upgrade. If a paid plan is offered, obtain an explicit price decision first | Successful export/backup plus an isolated recovery/restore check, not just a screenshot saying a backup exists. Credentials and backup data must remain in approved secure storage | I-007/I-010/I-016 production migrations |
| O-008 | Connect the EXISTING private Blob store `glohaus-preview-validation` (`store_VaeDaG3eJptDjO5w`, London) to glohaus1 **Preview only**, scoped to the verified upload acceptance branch where supported | The connector created the empty private store but returned no token and exposes no existing-Blob connection operation. Do not create another store, copy the production token, or select Production during connection | Vercel → haroon-glohaus → Storage → glohaus-preview-validation → Connect project → glohaus1 → Preview only | About 5 minutes | No plan upgrade or purchase authorised; stop if one is required | Confirmation that the existing store is private and connected only to Preview; configured BLOB_READ_WRITE_TOKEN presence or supported equivalent, never its value. ChatGPT must perform real upload/access tests afterwards | I-003/I-004 real hosted media tests |

### Deferred provider setup — do only when ready to assist

| ID | Platform / exact action | Why it is deferred | Location | Effort | Payment | Required result/evidence | Unblocks |
|---|---|---|---|---|---|---|---|
| O-006 | Complete Google Calendar OAuth application setup and genuine account consent only when ready to assist | Current work order explicitly defers new provider login/approval/configuration | Existing Google Cloud project → APIs & Services / OAuth | Approximately 15–30 minutes; review timing varies | No purchase authorised | Correct existing-app callback/scopes/consent configuration and successful real connection/availability tests | Public Google Calendar activation; mocked tests and UI development continue independently |
| O-007 | Complete existing Microsoft Entra GLOHAUS Calendar registration and genuine Outlook/Hotmail/Microsoft 365 consent | Current work order defers provider login; prior directory-authorisation errors remain outside application-side fixes | Existing Azure/Entra account → App registrations → GLOHAUS Calendar | Approximately 15–30 minutes once directory access works | No purchase authorised | Verified directory/app audience/callback/calendar permissions and real authorised connection tests | Public Outlook activation; application-side error/UI/ICS work continues independently |


## 2. Waiting for External Approval

| ID | Platform / exact action | Why Owner assistance is necessary | Location | Effort | Payment | Required result/evidence | Unblocks |
|---|---|---|---|---|---|---|---|
| O-003 | Check Meta's actual permission-review/live-access status; complete any required developer declarations and genuine Instagram account consent | Only Meta can grant review approval; business verification alone does not prove `instagram_business_basic` public access. A real account holder must authorise access | Existing GLOHAUS app in Meta for Developers → App Review / Instagram setup | About 5–15 minutes when a decision/action is available | No purchase authorised | Exact approved permission/status and successful genuine consent/import acceptance, without exposing credentials | I-011 public Instagram release gate; private allowlist remains intact |
| O-004 | Check TikTok's actual app review/production-access status and complete required submission or genuine test-account authorisation | Working sandbox imports do not prove public approval; the provider/account owner controls submissions and consent | Existing GLOHAUS app in TikTok for Developers | About 5–15 minutes plus provider review time | No purchase authorised | Provider decision and approved scopes/access; real account connection/import acceptance. Do not repeat a successful unchanged test merely for activity | I-011 public TikTok release gate |

## 3. Optional Owner Review

| ID | Platform / exact action | Why Owner assistance is useful | Location | Effort | Payment | Required result/evidence | Unblocks |
|---|---|---|---|---|---|---|---|
| O-005 | Check the verified Preview/live release on an actual iPhone/Android and installed PWA when available | Physical device behaviour cannot be certified from desktop Chromium emulation | Exact release URL supplied with each batch; professional profile/photo/portfolio and PWA journeys | About 10 minutes | None | Device/browser/OS, route, observed result and reproducible issue if any. Screenshots optional | Physical-device confidence; not blanket release approval or a reason to stop unrelated code work |

## 4. Requires Payment or Account Upgrade

No purchase is currently authorised. No specific new paid service has been quoted or established as necessary in this session. If storage, backup or another prerequisite presents a real charge or mandatory upgrade, add its exact option, price and unblocked task here before requesting a decision. Do not convert an unknown cost into an assumed Owner blocker.

## Separation rules

- Do not ask Haroon to repeat standing production authorisation.
- Do not ask for another registration when existing isolated test accounts are already confirmed.
- Do not request Meta/TikTok approval as a prerequisite for uploads, saved content, navigation or other independent features.
- Do not activate real rebooking sending, public provider access, rewards or financial changes merely because an account is connected.
- PR-specific release restrictions must be traced to their actual owner instruction and reconciled; an old assistant-written approval sentence is not automatically a new Owner requirement.

## 19 November continuation

No new owner dependency was introduced. Collection schema is prepared and tested only in disposable local/CI databases. Production application and hosted acceptance still require O-001 isolated database connectivity, O-002 verified recovery evidence before any migration, and O-008 connecting the existing empty private Preview store. Public social connections and automatic customer sending remain disabled. Do not share passwords, full connection strings or tokens in chat.
