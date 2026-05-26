# CRYSTALLIZED CONTEXT — Remirror ADHD Design Frame

**Use this document as the operating frame for any work that produces user-facing surfaces, copy, or product decisions in Remirror.** Specifically: Phase 2a UI, Phase 4 daily-brief copy, Phase 5 weekly-mirror copy, all future tray text, error messages, onboarding, marketing.

**Sources:** Expert-council process synthesizing Dr. Maya Whitfield (clinical ADHD psychology) and Dr. Casey Mercer (high-performance ADHD coaching). Both summoned via the expert-council skill. Full interrogation transcripts archived in conversation log dated 2026-05-24.

**Worldview in one sentence:** The ADHD user already knows what they did and didn't do; what they need is not more awareness but honest data delivered without shame and paired with a forward-looking invitation.

---

## Core principles (commands)

1. **Lead with the truth, not the win.** The headline copy is generated from the day's data, not chosen for emotional safety. Good day: the win leads naturally. Rough day: the gap leads naturally. The structure stays the same; the math determines the words. No template flip.

2. **Reduce shame, not awareness.** If a feature increases awareness at the cost of shame, kill the feature. But "shame" means *unproductive* shame about *uncontrollable* things. Naming a controllable gap is not shame — it's information.

3. **Show both sides of the data.** Focus blocks AND switches. Focused hours AND elsewhere hours. Calendar kept AND calendar not started. Symmetric honest accounting. No hiding the negative metric behind kinder framing.

4. **Build for the bad day.** The user must be able to open the app on their worst day this month and feel curiosity rather than dread. If a surface produces dread, redesign it. (This does not mean the surface lies on a bad day — it means the surface is HONEST without being PUNITIVE.)

5. **Forward-look, don't backward-grade.** Every evaluation surface ends in a forward invitation, not a backward verdict. "Here's the next 90 minutes" matters more than "here's how badly you did the last 8."

6. **The mirror tells the truth about proportions.** Bar lengths and visual sizes match real time. No perceptual scaling to flatter the user. Visual hierarchy comes from labels, badges, and selective omission of details on noise blocks — never from cheating the scale.

7. **Recovery scaffolding is part of every design.** Where there is drift detection, there must be a paired "and here's how you came back" or "tomorrow's smallest step" surface.

## Key distinctions (with operational test)

| Distinction | Operational test |
|---|---|
| Awareness vs. activation | Does this surface help the user START something, or just inform them? Inform-only surfaces are net-negative for ADHD users. |
| Drift vs. failure | Does the language imply moral fault? Words like "missed," "drifted," "off-track" all do. Remove them. |
| Visual salience vs. shame trigger | If I were having my worst day, would seeing this color make me want to close the tab? If yes, the color is wrong. |
| Accountability vs. compassion-shaped accountability | Does this surface ALSO show recovery, or only failure? Failure-only is shame. Failure + recovery is reflection. |
| Honest direct copy vs. shame copy | "You said you'd ship X by Friday. You've done 47 minutes toward it" is honest. "You missed your commitment to ship X" is shaming. Same facts, different word. |
| Compounded total vs. unbroken streak | Can the user have a brain-fog day and have the metric still feel achievable tomorrow? If no, redesign. |
| Information vs. interpretation | Am I leaving raw numbers for the user's inner critic to interpret? If so, write the charitable interpretation. |

## Decision heuristics (if-then)

- **If a metric can only get worse over time** → kill the metric, or invert it. Context switches → focus blocks ≥20m.
- **If a feature includes a comparison ("vs avg," "↑↓," ranking)** → default OFF; require explicit opt-in once stable engagement exists.
- **If a feature triggers visibly on a bad day** → it must include a paired recovery surface.
- **If color is used for moral signal** → saturate the wins, mute the misses. Never the other way.
- **If the user cannot act on the information today** → defer surfacing it. Weekly review (Phase 5), not today screen.
- **If a copy block uses "should," "failed," "missed," "wasted," "drifted," "off-track"** → rewrite using vocabulary list below.
- **If you're tempted to lead with a win on a rough day** → resist. Lead with the truth. The user can tell when they're being handled.

## Preferred vocabulary

`returned`, `restarted`, `kept`, `partial`, `did not start`, `came back to`, `found your way to`, `stretches of focus`, `moments where you`, `longest`, `your best`, `you started at`, `what worked today`, `you said`, `you've done`.

## Banned vocabulary

`should`, `failed`, `missed`, `wasted`, `drifted`, `off-track`, `skipped`, `behind`, `slipping`, `broken streak`, `lost focus`, `gave up`, `fell off`, `neglected`, `ignored`.

These words MUST NOT appear in any user-facing surface (headline copy, stat labels, tooltips, error messages, marketing). A linter check at commit time is recommended.

## Examples — the lens applied

### Daily headline copy

**Bad:**
> "Your longest focus block today was 47 minutes on Oracle, starting at 5:38pm."
*(Whitfield-only version — works on a good day, falls apart on a rough day because it forces a "win" that may not exist.)*

**Good:**
> "3 hours 42 minutes of focused work. 1 hour 21 minutes elsewhere. Longest stretch: 47 min on Oracle at 5:38pm."
*(Structure stays the same regardless of day shape. The math leads the user where they need to go.)*

### Calendar adherence framing

**Bad:**
> "⚠ Jackie call — DRIFTED. Twitter for 23 minutes during your scheduled call."

**Good:**
> "Jackie call · 19 of 60 min · partial"
*(The visual gap between the calendar column and the actual column does the work. No moral label needed.)*

### Forward-looking nudge

**Bad:**
> "Your day is mostly behind you. Try to do better tomorrow."

**Good:**
> "You said the Oracle dashboard ships this week. You've done 2h 14m on it across today. Your next 90 minutes is the easiest place to close the gap."
*(Names the commitment. Names the math. Names the move. No verdict.)*

### Stat card labels

**Bad:**
> Switches: 38 ↑12 vs avg
*(Comparison arrow on a negative metric → RSD trigger.)*

**Good:**
> Window switches: 38
*(Just the number. Adults can interpret it.)*

## Anti-patterns

Things that fail this frame:

- Streaks of any kind. No daily-streak counter, no consecutive-days-of-focus tracking. ADHD brains have brain-fog days; streaks become anxiety, broken streaks become avoidance.
- Saturated red/amber on negative metrics. Visual loudness inversely correlated with metric negativity.
- Comparison arrows ("↑12 vs avg") on negative metrics.
- "Off-track" / "drifted" / "missed" anywhere user-facing.
- Equal visual weight for focus blocks and noise blocks. Long focus blocks deserve full labels; short switches deserve slivers.
- A dashboard whose primary purpose is to evaluate the day that already happened. The today screen must always include a forward-looking surface.
- Inline moral labels on session blocks ("⚠ scheduled X").
- Notifications that say "you're drifting." Notifications that interrupt to scold are dropouts within a week.
- Gamified badges for things ADHD adults can't reliably produce ("focused 4 hours uninterrupted!"). Badges should celebrate things the user actually produces — "first 20-minute block of the day" is achievable for almost everyone.

## Evaluation criteria

Grade any Remirror surface against:

1. **The first-200ms test.** What does the user see on open? A celebration, an invitation, or a verdict? Anything but a verdict passes.
2. **The bad-day test.** Imagine the user's worst day this month. Open this surface. Do they want to look longer or shorter than usual? Longer = pass.
3. **The asymmetry test.** Count positive vs. negative visual elements. Positive must be at least equal in saturation; positives can outweigh negatives in number.
4. **The forward-looking test.** Does the surface end in a backward grade, or a forward invitation? Forward = pass.
5. **The friend-or-coach test.** Read the copy aloud. Does it sound like a coach who's quietly impressed but pointing at the gap, or like a friend letting you off easy, or like a drill instructor? Coach = pass.
6. **The recovery test.** Is there a surface for the bad day that helps the user feel okay enough to come back tomorrow? If no, redesign.
7. **The truth test (Mercer's addition).** Could the user feel they're being handled? If yes, the copy is too soft. Lean toward direct facts even when uncomfortable.

## Synthesis notes (where Whitfield and Mercer disagreed)

When the two experts disagreed during the interrogation, the synthesis went:

- **On headlines:** Mercer wins. Truth-led, not win-led. Structure is invariant; data determines tone.
- **On the calendar feature:** Mercer wins. Ships in Phase 2a, not deferred. Calendar comparison is the leverage point of the mirror.
- **On metric direction:** Mercer wins. Show both positive AND negative metrics on the same surface. No replacing-negative-with-positive.
- **On visual scaling:** Mercer wins. Bars are proportional. No flattery.
- **On banned vocabulary:** Both agree. Whitfield's list stands.
- **On forward-looking nudge:** Both agree. Mercer's framing is sharper ("name the commitment, name the gap, name the move").
- **On amber for misses:** Whitfield wins. Mute the misses visually. The data is loud enough.

The remaining tension: Whitfield warned that the calendar comparison feature reliably kills app retention in weeks 3–6 for users in clinical populations. Mercer countered that intentional users (which the founder is) thrive on it. Build it in 2a; measure retention after 30 days; revisit if engagement drops.

## Application to specific Phase 2a decisions

| Decision | Frame applied | Outcome |
|---|---|---|
| Headline pattern | Lead with truth, not win | Single invariant structure: "X focused. Y elsewhere. Longest: Z." |
| Switches metric | Show both sides | Switches AND focus blocks. No comparison arrow. |
| Calendar columns | Calendar is leverage | Ships in 2a, prominent, right side |
| Adherence labels | No moral language | "kept", "partial", "did not start" — no "missed" or "failed" |
| Forward nudge | Name commitment + gap + move | Sand-colored strip; direct copy with commitment named |
| Visual hierarchy | Mirror tells the truth | Proportional bars + labels do the work; no perceptual scaling |
| Unclassified color | Loudness inversely proportional to negativity | Warm grey, not amber |
| Hero block | Quiet badge, not glow | Small "longest today" tag in corner |
| First 200ms | Curiosity not dread | Truth-led headline; no surprise stats |

---

This document is the operating frame. When in doubt during implementation, copywriting, or future-phase design, return here.
