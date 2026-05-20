# PUMP-05 QA pack — Compose & send

Authority: [PU05-compose-send-requirements.md](../requirements/PU05-compose-send-requirements.md)

Delivery: commit `05ac85a` on branch `cursor/e1a4c702`

## Automated traceability — PUMP-05A

| AC | Status | Description | Automated test |
| --- | --- | --- | --- |
| AC-A-01 | Partial | Page entry chrome | `ComposePageChrome.test.tsx`; `ComposePage.test.tsx` (heading, composer) |
| AC-A-02 | Partial | Sender-identity banner | `SenderIdentityBanner.test.tsx`; identity hook in ComposePage |
| AC-A-03 | Partial | Channel-unavailable Alert | `SenderIdentityBanner.test.tsx` |
| AC-A-04 | Complete | Default org_members + `filters: {}` | `buildRecipientPoolDescriptor.test.ts`; `ComposePage.test.tsx` source context |
| AC-A-05 | Partial | Event mode source context + remount | `deriveSourceContext.test.ts`; `ComposePage.test.tsx` mode switch |
| AC-A-06 | Partial | Manual member append | `buildRecipientPoolDescriptor.test.ts` (descriptor); manual UI manual §12 |
| AC-A-07 | Complete | member_type_ids string cast | `buildRecipientPoolDescriptor.test.ts` |
| AC-A-08 | Complete | include_inactive filter | `buildRecipientPoolDescriptor.test.ts` |
| AC-A-09 | Partial | Save draft happy path | `usePumpCommSendAdapter.test.tsx`; composer Save draft via pace-core dist |
| AC-A-10 | Complete | Save draft idempotency | `usePumpCommSendAdapter.test.tsx` |
| AC-A-11 | Complete | Save draft failure | `usePumpCommSendAdapter.test.tsx` |
| AC-A-12 | Complete | Cancel clean | `ComposePage.test.tsx` |
| AC-A-13 | Complete | Cancel dirty + dialog | `ComposePage.test.tsx` |
| AC-A-14 | Complete | Read permission denied | `ComposePage.test.tsx` |
| AC-A-15 | Complete | Read-only send footer | `ComposePage.test.tsx` |

## Automated traceability — PUMP-05B

| AC | Status | Description | Automated test |
| --- | --- | --- | --- |
| AC-B-01 | Partial | Send success + light reset | `ComposePage.test.tsx`; `composeDirtyState.test.ts` |
| AC-B-02 | Complete | Suppression + warnings in toast | `sendToastMessages.test.ts` |
| AC-B-03 | Partial | Schedule success | `sendToastMessages.test.ts`; schedule handler in ComposePage |
| AC-B-04 | Partial | Schedule failure toast | `sendToastMessages.test.ts` |
| AC-B-05 | Complete | Send test email toast | `sendToastMessages.test.ts` |
| AC-B-06 | Complete | Send test SMS toast | `sendToastMessages.test.ts` |
| AC-B-07 | Partial | Send test gateway failure | `sendToastMessages.test.ts` |
| AC-B-08 | Complete | Send failure toast | `ComposePage.test.tsx` |
| AC-B-09 | Manual | Strict template gate | §12 in-app (composer-internal) |
| AC-B-10 | Manual | Block-on-unresolved gate | §12 in-app (composer-internal) |
| AC-B-11 | Partial | EMPTY_POOL toast | `ComposePage.test.tsx` (EMPTY_POOL action) |
| AC-B-12 | Complete | Send invariants org_members | `usePumpCommSendAdapter.test.tsx` |
| AC-B-13 | Complete | Send invariants event | `usePumpCommSendAdapter.test.tsx` |
| AC-B-14 | Complete | Send invariants manual | `usePumpCommSendAdapter.test.tsx` |

## Unit tests (business rules)

| Rule / verification | Test |
| --- | --- |
| BR-SourceContextDerivation | `deriveSourceContext.test.ts` |
| BR-RecipientModeToggle | `buildRecipientPoolDescriptor.test.ts` |
| BR-MemberTypeIdCast | `buildRecipientPoolDescriptor.test.ts` |
| BR-DirtyFlagDerivation | `composeDirtyState.test.ts` |
| BR-DraftAdapterOverride | `usePumpCommSendAdapter.test.tsx`; `buildPumpMessageUpsert.test.ts` |
| BR-PostSendNavigation / BR-Warnings | `sendToastMessages.test.ts`; `composeDirtyState.test.ts` |

## pace-core2 prerequisites

| Item | Status |
| --- | --- |
| CommComposer Save draft button | Source + `src/` in linked package; run `npm run build` in pace-core2 so `dist/` includes button |
| `sourceContextType` / `sourceContextId` props | Shipped in `CommComposer` |
| Manual member typeahead | App-local `ManualMemberPicker` (accepted deviation) |

## Manual verification (§12)

| # | Step | Expected |
| --- | --- | --- |
| 1 | Sign in with `create:page.CommsLog`; open `/comms/create` | Compose chrome, sender banner, recipients card, composer |
| 2 | Switch recipient modes | Org / Event / Manual bodies update; pool re-resolves |
| 3 | Save draft twice | Success toast; single `pump_message` row updates |
| 4 | Cancel with unsaved body | Discard dialog; Keep editing stays; Discard goes to `/` |
| 5 | Send now with valid pool | Success toast with recipient count; light reset on page |
| 6 | Schedule with future time | Success toast; light reset |
| 7 | Send test | Channel-aware success toast |
| 8 | Empty pool send | Destructive Send failed toast from Edge |
| 9 | Strict template + unresolved token | Send failed toast without adapter call |
| 10 | Past-time schedule | Schedule failed destructive toast |
| 11 | gateway_message_id after send | Row populated on `pump_message_recipient` |

Target dev project: `yihzsfcceciimdoiibif` (per [pump-backend-ready-report.md](../delivery/pump-backend-ready-report.md)).
