# How to Use This Plan

Status: reviewed
Related: `implementation-plan.md`, `checkpoints.md`, `traceability.md`
Verified against: not applicable

## The rule

**One phase at a time, gate before next.** The plan is sequenced so each phase removes a
specific uncertainty. Skipping a gate moves the uncertainty forward, where it costs more.

## Cadence at ~20 hours per week

A realistic rhythm, not a deadline:

| Slot | Work |
|---|---|
| Session 1 (3 h) | Read the phase's docs; write the predict answer; build the first half of the tasks |
| Session 2 (3 h) | Finish the tasks; run the gate; fix failures |
| Session 3 (2 h) | Failure drill; explain-back answers; write the progress log |
| Remaining (12 h) | Two phases per week where possible; one where the phase is heavy (4, 8, 10) |

Rough expectation: 8–10 weeks. Phases 4, 5, and 8 are the ones that usually take longer than
planned. That is normal and is not a reason to skip the gate.

## What "done" means for a phase

1. Every task checkbox is checked.
2. The gate commands were run and their output was seen.
3. The failure drill was performed and the observation is written down.
4. The explain-back questions were answered in your own words.
5. `plan/progress/phase-NN.md` exists.
6. `traceability.md` reflects any test that was added.

## How to use the AI assistant during a phase

The plan is written so you can hand one phase at a time to an assistant without losing
understanding. Give it: the phase, the linked docs, and the gate. Do not ask for the whole
application. After each chunk of generated code, ask the assistant to explain the diff
against the phase tasks, then answer the explain-back questions yourself.

If an explanation is missing, the code is not yours yet.

## Progress log

Copy `progress/TEMPLATE.md` to `progress/phase-NN.md` at the start of the phase. Fill it as
you go, not at the end. It is the only artifact that shows the difference between "the tests
pass" and "I understand why".

## When the plan is wrong

It will be, somewhere. When reality contradicts the plan:

1. Write down the contradiction in the progress log.
2. Decide whether it is an implementation detail or a design decision.
3. Implementation detail → fix it, note it, continue.
4. Design decision → write a new ADR that supersedes the old one, update the docs that
   reference it, then continue.

Never silently diverge. Silent divergence is how documentation becomes fiction.
