# Quantum Physics Lab: review evidence

Initial review base: `5af080b0ce3619ac324efcecd900a0ae1d8c445f`. Follow-up review base: `5bf52ee274a94a54434c1283b28b7bb6a3731e03`, including the academic corrections, expansion to 150 modules, and mathematics visualizer. All six feature areas are retained. No posted review comments or inline threads were present when this follow-up was checked. This record distinguishes reproduced evidence from deployment prerequisites.

## Findings and fixes, ordered by impact

| Priority | Reproduction / consequence | Change and regression evidence |
|---|---|---|
| High | `H → measure → H` displayed probability 1 for zero because `simulate` skipped measurements. Actual shots give 50/50. | Switch from a state vector to a density matrix at the first measurement. Verify loss of interference, retained classical Bell correlation, complex coherences, trace/purity, and agreement with seeded shots. Mixed-state reduced entropy is no longer presented as an entanglement measure. |
| High | The `bell-psi-minus` preset prepared the positive-phase triplet rather than the singlet. Computational-basis probabilities and normalization did not detect this. | Remove the extra Z gate. Assert anticorrelation in both the Z and X bases. |
| High | `Boolean("false")` made a malformed AI grade correct. Duplicate model IDs collided in exercise state; empty/invalid questions could appear successful. | Validate JSON output types, score range, questions, answer membership, choices and count. Assign IDs server-side; reject malformed or truncated responses with 502. Route tests use the real SDK with a mocked transport. |
| High | Selecting another module with old questions still displayed credited answers to the new module; overlapping requests could overwrite results. | Clear questions when their context changes; serialize requests, disable conflicting controls, abort on unmount, and exclude answer-revealed questions from mastery. Browser fixtures verify attribution and one-time recording. |
| Medium | Repetition index started at 3 days rather than 1; repeated mastery clicks advanced the schedule; a wrong answer left a module mastered. | Verify 1/3/7/16/35/90-day scheduling, idempotent early clicks, immediate review after a mastered-module error, and no deadline drift from early practice. |
| Medium | Clearing/changing a tutor conversation did not cancel its old request. A stopped stream could write to a closed response; an interrupted reply could be saved as complete. | Abort upstream on cancellation; suppress stale client updates, require an explicit completion event, and report truncation safely. Verify fragmented UTF-8/SSE, provider failures, cancellation, persistence and clear-during-request behavior. |
| Medium | Null request members and malformed localStorage shapes caused exceptions; raw upstream diagnostics were returned to users. | Validate JSON and actual body bytes (256 KiB), bound fields, normalize stored shapes, use stable public errors, and escape the math-rendering error fallback through React. |
| Medium | The tunnel simulation could be restarted after its safety stop. | Disable restart until reset and guard the evolution loop before advancing. Browser check verifies the disabled control. |
| Medium | The tunnel page overflowed by 30 pixels at 390px width; the old mobile checks covered only three pages. | Give its result grid an explicit single-column mobile track. The browser suite checks all ten physics page types at 390px. |
| Verification | The E2E command failed after `npm ci`: Playwright was absent. An eight-topic assertion only checked for any button, and HTTP errors were broadly ignored. | Pin Playwright, declare Node requirements, start an isolated production server with its API key cleared, check eight topics exactly, scope expected HTTP failures, and add a CI workflow. |

The six initial regression tests all failed on the review base and passed after fixes. Three further regression tests and four numerical/data validation tests cover the added behavior. The original 21 numerical/data tests remain intact.

## Follow-up review and reflection

The curriculum and mathematics follow-ups corrected content and expanded coverage, but changed public module identifiers without migrating their consumers. They also left this report and the PR description tied to the earlier revision.

| Finding | Applied correction | Evidence |
|---|---|---|
| Field-theory IDs changed from `qm-phd-04/05` to `qm-grad-09/10`; saved progress disappeared from current-module statistics, old links failed, and tutor histories became detached. | Resolve aliases across module lookup, learning paths, API context and practice selection. Normalize progress and review deadlines; keep the newer snapshot when both IDs exist without adding overlapping attempts. Restore old tutor history when no canonical thread exists, including correct behavior after clearing. | Three regression tests failed before the fix. Browser checks cover the old detail/practice links, saved mastery, tutor recovery and clearing. |
| Review tests assumed calendar days always contain 24 hours, so the 90-day check failed in a daylight-saving timezone. | Keep calendar-day scheduling; freeze test dates at a daylight-saving transition and compare calendar dates. | All 66 tests pass in both `TZ=UTC` and `TZ=America/Los_Angeles`. |
| The new course-badge check could pass because “物理” is a substring of “物理基礎”. | Count exact badge text inside module cards against the defined course counts. | Browser checks require 13 basic-physics badges and 25 physics badges. |
| The circuit explanation still used a pure-state-only probability formula after introducing mixed states. | Use `p(x)=⟨x|ρ|x⟩` generally; label the amplitude-squared formula as the pure-state case and use `ρ_q` for the reduced state. | Consistent with the existing density-matrix regressions and [IBM’s density-matrix formulation](https://quantum.cloud.ibm.com/learning/courses/general-formulation-of-quantum-information/density-matrices/density-matrix-basics). |
| Collision momentum conservation and uncertainty propagation omitted their conditions. | State the negligible external impulse assumption. Distinguish a first-order worst-case error bound from uncorrelated standard uncertainties and mention covariance for correlated inputs. | Uncertainty wording follows [NIST’s propagation law](https://www.nist.gov/pml/nist-technical-note-1297/nist-tn-1297-appendix-law-propagation-uncertainty); all 230 curriculum equations render. |
| Counts and test claims remained at 114 modules / 153 equations and implied an uncommitted wavepacket-to-plane-wave equality test. | Update the inventory and describe the committed free-Gaussian propagation test precisely. | 150 modules (38/51/41/20), 13 tracks, 46 quantum modules, 230 equations, and five labs. |

The newly arrived mathematics visualizer also returned the x-axis for both eigenvectors of a diagonal matrix, so one displayed direction violated `Av = λv`. The repair chooses a nonzero, well-scaled null-space vector and supplies an independent basis for scalar matrices. A regression failed before the fix and now covers diagonal, zero, scalar, triangular and tiny off-diagonal cases. The Fourier error display is labeled root-mean-square error, matching its actual square-root calculation. Smoothness alone is no longer claimed to guarantee exponential Fourier decay; that requires stronger analyticity conditions, consistent with [Tao’s lecture notes on decay and analyticity](https://terrytao.wordpress.com/2021/01/23/246b-notes-2-some-connections-with-the-fourier-transform/).

The review lesson is to treat module IDs as persistent data contracts, not just display labels. Rendering tests establish syntax, and inventory checks establish presence; neither proves scientific correctness or curriculum completeness. Changes to learning content must also check saved data, links, and the scope of claimed evidence.

## Reproduction

Use Node.js 22.12 or later:

```sh
npm ci
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
```

The browser runner owns and terminates its server, clears `ANTHROPIC_API_KEY`, and writes screenshots under `test/screenshots/` (ignored by Git). `CHROME_PATH` can select an already installed Chromium binary. CI runs these commands and uploads screenshots.

## Current verification

- `npm test`: **66/66 passed**: 21 original tests, 12 curriculum/math checks from the intervening commits, 13 bug regressions, 16 mocked API/stream tests, and 4 numerical/data validation tests. The full suite also passes in UTC and America/Los_Angeles with review dates fixed across the daylight-saving transition.
- `npm run build`: **passed**; includes static generation and dynamic routes. Warnings about package module-type detection and the age of Browserslist data remain non-blocking.
- Current local browser suite: **82/82 checks passed**, including all eleven physics page types at 390px width, with **no unexpected runtime errors**. Successful AI UI paths use fixtures; missing-key paths reach the isolated server. External Google Fonts CSS is stubbed for deterministic, network-independent checks.
- The standard browser download timed out during this follow-up; the local run again used Chromium 149 via `CHROME_PATH`. The [PR Checks](https://github.com/SyoHira/ai-counselor/pull/2/checks) record the separate run using the browser matching Playwright; match the commit before treating a run as evidence.
- Runtime: Node.js **24.19.0**, npm **11.9.0**, Next.js **14.2.35**, Playwright **1.62.1**. Local browser: headless Chromium **149.0.7827.0** via `CHROME_PATH`; the standard Playwright browser download timed out in this environment. CI installs the browser matching the pinned Playwright release, so its result is separate evidence.
- Data audit: **150 modules** (38/51/41/20 by level), **13 tracks**, **46 quantum modules**, **230 equations**. Every equation renders with KaTeX and every track/lab reference resolves. Rendering is not a scientific content review.
- Default tunnel case: measured transmission about **5.1%**, normalization **1.000000**; the browser acceptance interval is **3.5–7%**. The earlier 5.3% momentum-weighted comparison had no committed reproducer and is no longer asserted as verified evidence.

## What the numerical tests establish

- The original oscillator check uses an **absolute energy tolerance of 0.005**, while the infinite-well check uses **relative error below 0.2%**. They are not interchangeable tolerances.
- For all six default potential shapes, low eigenvectors satisfy the **discretized** equation with a residual below `1e-8` and orthonormality within `1e-10` on the tested grids.
- Refining 80 to 160 spatial points reduces ground-state energy error by more than a factor of three for the well and harmonic oscillator.
- A free Gaussian packet has the expected center, spreading and norm before it reaches the boundaries.
- Norm conservation alone does not establish phase accuracy, scattering accuracy, or absence of periodic wraparound. Finite-difference spacing, time steps, finite domains and the stop threshold remain approximations.
- The well solver uses hard walls at both ends for every potential. In particular, Morse energies at or above D are box-discretized states, not free-space bound states. The UI now states this.

## Remaining gates before a keyed public deployment

1. **Access and cost control.** Neither the new physics endpoints nor the existing counselor endpoint implements user authentication, a shared rate limit, or a spending quota. Protect the deployment at its authenticated ingress and add shared usage controls before exposing a real key. Per-request validation and timeouts do not solve anonymous cost abuse.
2. **Live-provider validation.** No live Anthropic calls were made. Verify account/model access, actual Japanese tutoring and grading quality, stop/timeout behavior over the deployed transport, and latency/cost with an approved test account. [Anthropic's Opus 5 documentation](https://platform.claude.com/docs/en/models/opus-5/whats-new-opus-5) confirms the existing model ID and adaptive-thinking setting; it does not verify this account or application.
3. **Educational scope.** These are learning aids, not assessment infrastructure. Answers and questions are client-provided for grading; progress is browser-local. The curriculum has not received a comprehensive domain-expert review, and arbitrary parameter regimes have not been convergence-tested.

## Suggested review order

1. `lib/quantum/densityMatrix.js`, `circuit.js`, `presets.js` and numerical regressions.
2. `lib/physics/apiValidation.js`, both physics API routes and `physics-api.test.mjs`.
3. Module-ID compatibility, progress scheduling and the practice/tutor request lifecycle, then browser regressions.
4. CI/setup and corrected claims in `PHYSICS_APP.md`.

The original `/`, `/chat`, and `/api/chat` implementations are unchanged by this PR. Shared root layout viewport metadata was changed by the preceding follow-up commit; shared CSS, Tailwind configuration and dependencies are also part of the review surface. The two apps should not be described as having zero shared impact.
