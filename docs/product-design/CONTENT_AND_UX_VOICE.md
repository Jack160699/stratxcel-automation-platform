# Content & UX Voice

Design documentation only. Base rules are transcribed from the design system itself (`DESIGN_SOURCE_AUDIT.md` §2.15) — this document applies them to the specific surfaces this package adds (public site, onboarding, admin) that the source document didn't itself cover, since the source was written for the Social Autopilot product surface specifically.

## 1. The four rules, unchanged from source

1. **Present tense, states the subject.** *"Autopilot is analyzing today's engagement."* Not "We are currently running an analysis process."
2. **Fact, then the one action.** *"Paused 12 minutes ago. Resume to continue publishing."* Not a paragraph of context before the button.
3. **Actions are imperative verb + object.** *"Approve post," "Pause autopilot," "Reconnect account."* Never "OK," "Submit," or "Yes" alone where the object can be named.
4. **AI explanations are exactly one "because …" sentence, citing the signal.** *"Because Tuesday 14:00 reached 2.3× median."* Never an unexplained recommendation.

Explicitly forbidden, per the source's own worked example: hype language — *"Our revolutionary neural engine is optimizing your growth!"* is called out as the wrong answer, not a style choice to avoid casually.

## 2. Extending the rules to surfaces the source didn't cover

**Public marketing copy** (`PUBLIC_WEBSITE_SITEMAP.md`) is the one place where more traditional marketing language is appropriate — a homepage hero is allowed to sell. The four rules above govern *product* voice (inside `/app` and `/admin`, where a real person is trying to get work done and hype is friction), not marketing voice. The boundary is literal: once a person is inside `/app` or `/admin`, hype stops. This distinction should be stated explicitly to whoever writes marketing copy so "no hype" isn't over-applied to the homepage and under-applied to the product.

**Onboarding** (`AUTH_AND_ONBOARDING_FLOW.md` §3) sits at the boundary — it's inside the product shell but is also the first impression. Rule: onboarding copy is warm and encouraging but never hypey, and every step's copy follows rule 2 (fact, then the one action) even here — e.g. step 6's provisioning copy is *"Setting up Acme Retail's workspace."* not *"Get ready for something amazing."*

**Errors, everywhere**: what happened → what it affects → what to do. Three concrete examples, one per surface:
- Public contact form failure: *"Your message didn't send. No lead was recorded. Check your connection and try again."*
- `/app` mission failure: *"This mission failed at the Generate step. No content was published. Retry, or open the mission log to see why."*
- `/admin` integration failure: *"The WhatsApp webhook for Acme Retail stopped responding 6 minutes ago. Inbound messages since then were not received. Reconnect the integration."*

Never *"Oops,"* never *"Something went wrong"* alone with no further information — both are explicitly the wrong pattern per the source document's own error rule.

## 3. Status and chip copy

Statuses are 1–2 words, no punctuation, title case in prose / uppercase in chips (source rule, §2.15/§2.8). This package's new surfaces introduce a few statuses the source didn't need — kept to the same discipline: `Invited` (pending invitation), `Trial`, `Active`, `Past Due` (billing states); `Assigned`, `Resolved` (human handoff states); `Connected`, `Needs reconnect`, `Disconnected` (integration states, extending the source's existing connected/disconnected pattern).

## 4. Confirmation and destructive-action copy

Every destructive action (remove team member, disconnect integration, cancel mission) states the object and the consequence in the confirmation, not just "Are you sure?": *"Remove Priya Sharma from Acme Retail? She will lose access to this workspace immediately."* This is an extension of rule 2 (fact, then action) applied to confirmations specifically, since a confirmation *is* the moment a fact most needs stating before an action is taken.

## 5. Empty states

Title states what's missing, subtitle states why or what will fill it, action (if any) is the imperative-verb pattern: *"No missions yet." / "Autopilot will propose one after 7 days of data." / "Create manually"* — this is lifted directly from the source document's own empty-state example (§2.9's overlay examples), reused verbatim as the pattern for every empty state across `/app` and `/admin` (full matrix in `EMPTY_LOADING_ERROR_STATE_MATRIX.md`).

## 6. Notifications

Present tense, states the subject, states time: *"3 posts published to Instagram · 14:06 · autopilot"* — subject, then attribution, then timestamp in mono, matching the source's own notification-item example exactly.

## 7. Staff-facing (`/admin`) voice difference

`/admin` copy may be slightly more technical/terse than `/app` copy, since the audience is Stratxcel's own staff, not a client — but the same four base rules apply without exception. The one addition specific to `/admin`: agency-wide numbers are always labeled with their scope explicitly (*"All clients · last 30 days"*, not just *"Last 30 days"*) so staff never mistake an agency-wide metric for a single client's, which the naming convention in `ADMIN_INFORMATION_ARCHITECTURE.md` §4 already establishes structurally — the copy layer just has to not contradict it.
