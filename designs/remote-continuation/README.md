# Remote continuation · in-conversation design round

the founder approved in-conversation placement and requested more polished cards.
A Soft card (recommended), B Quiet row, C Split card are now in the actual
isolated app at http://127.0.0.1:65463/?remotePreview=A.

Run `/remote-control` or `/rc` in the real reply composer. Only then does the
confirmation appear. The visible A/B/C switch preserves that state. It is a
design control only, not intended for production. The prototype’s connected,
open-link and turn-off states never create remote access or transmit data.

All three treatments use the existing theme tokens. Browser checks cover the
narrow pane, variant switching, the command-to-confirmation transition, simulated
connected/open/off states, and first-click cancellation with the composer open.
Renderer build and command-gating tests passed. Full-suite result is recorded
in the handoff after verification. Production renderer imports none of this.

To reproduce: copy component and CSS into renderer/src/components in the
isolated source, and the helper into renderer/src. Render it in Focus after
ItemThread with product/id props and a unique `remote:`-prefixed key. Intercept
runCommand only when remotePreviewCommand(location.href,text) is true, dispatch
`remote-design-command` with the task as detail, and return state done without
IPC. Include remote-control in the disposable slash catalogue. Preserve the
existing real application and personal store; these files are previews only.

Clean current-main validation: 480 files, 6,849 tests passed, one skipped
(`/private/tmp/remote-cards-suite.log`). This replaces reliance on the stale
sandbox test copy. No production feature wiring is included in this design round.

## Shared preview reference (2026-09-18)

Updated against the merged DirectReview component (3b4c3bf): transparent 680px
frame, 3px corners, 14px heading, compact padding, theme-aware glass primary
button, and quiet secondary button. A Compact card is the recommended default;
B Inset details groups the permission explanation; C Action rail separates the
actions on wide panes and stacks them on narrow panes. This remains a design
proposal. No remote access is enabled. The artifact-specific whole-card opening
target is intentionally not borrowed: enabling remote access requires its own
explicit button.

Validation: 496 test files passed; 6,882 tests passed, one skipped
(`/private/tmp/remote-shared-suite.log`). Sandbox renderer build passed.
Browser checked at its normal 561px viewport and a 1440px wide override
(reset afterwards): command and alias entry, three variants, first-click
cancel, simulated enable/open/off. A is left visible with the variant controls.
