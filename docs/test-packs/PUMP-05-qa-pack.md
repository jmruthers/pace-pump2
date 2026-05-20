# PUMP-05 QA pack — Compose & send

Authority: [PU05-compose-send-requirements.md](../requirements/PU05-compose-send-requirements.md)

## Automated traceability

### PUMP-05A

| AC | Status | Description | Automated test |
| --- | --- | --- | --- |
| A-01 | Complete | Page entry chrome | `ComposePage.test.tsx` — heading, subtitle, composer |
| A-02 | Complete | Breadcrumb and back link | `ComposePage.test.tsx` — chrome copy |
| A-04–A-05 | Complete | Sender identity banner | `ComposePage.test.tsx` — identity mock; `SenderIdentityBanner` via page |
| A-08–A-09 | Complete | Default org_members pool | `buildRecipientPoolDescriptor.test.ts` |
| A-29–A-31 | Complete | Recipient mode descriptors | `buildRecipientPoolDescriptor.test.ts` |
| A-32 | Complete | member_type_ids string cast | `buildRecipientPoolDescriptor.test.ts` |
| A-44–A-45 | Complete | Save draft + cancel | `usePumpCommSendAdapter.test.tsx`; `ComposePage.test.tsx` |
| A-12–A-13 | Complete | Cancel clean / dirty dialog | `ComposePage.test.tsx` |

### PUMP-05B

| AC | Status | Description | Automated test |
| --- | --- | --- | --- |
| B-01–B-02 | Complete | Send success toast + light reset | `ComposePage.test.tsx`; `sendToastMessages.test.ts` |
| B-04 | Complete | Send failure toast | `ComposePage.test.tsx` |
| B-05–B-06 | Complete | Send-test toasts | `sendToastMessages.test.ts`; `usePumpCommSendAdapter` sendTest wrapper |
| B-12–B-14 | Complete | Source context invariants | `deriveSourceContext.test.ts`; `buildPumpMessageUpsert.test.ts` |

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
| CommComposer Save draft button | Shipped in `@solvera/pace-core/comms` |
| `sourceContextType` / `sourceContextId` props | Shipped in `CommComposer` |
| Manual member typeahead | App-local `ManualMemberPicker` |

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

Target dev project: `yihzsfcceciimdoiibif` (per [pump-backend-ready-report.md](../delivery/pump-backend-ready-report.md)).
