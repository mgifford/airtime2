# AGENTS.md

## Project Purpose
airtime2 is a small, public-facing web application that helps users plan, compare, and reason about time allocation (“airtime”) across activities, schedules, or scenarios.

The goal is to make time usage explicit and easier to understand, supporting planning, reflection, and comparison.

This is an assistive informational tool. It must not be treated as authoritative for billing, compliance, labor accounting, or contractual purposes.

## Audience and Responsibility
This project is intended for general users who want lightweight support for thinking about time allocation.

Outputs are informational. Users remain responsible for how they interpret and apply the results, especially in professional or regulated contexts.

The tool must not present itself as definitive, certified, or suitable for compliance use.

## Scope
The project consists of:
- Static HTML, CSS, and JavaScript
- A client-side UI for entering, adjusting, and comparing time values
- Calculations and summaries performed entirely in the browser

No server-side processing is assumed unless explicitly documented.

## UI Contract
The UI must be clear, predictable, and honest.

Rules:
- Inputs and units (minutes, hours, days) must always be explicit.
- Totals and subtotals must be clearly labeled.
- Automatic calculations must be visible and reversible.
- The UI must not silently normalize, round, or infer intent without explanation.

Where trade-offs or assumptions exist, they must be stated.

## Accessibility Position
Accessibility is a core requirement for this project.

The project aims to follow WCAG 2.2 AA patterns where feasible, but does not claim formal conformance.

Accessibility work prioritizes:
- Keyboard operability
- Clear labeling and instructions
- Perceivable updates when values change

Known accessibility gaps must be documented rather than hidden.

## Accessibility Expectations (Minimum Bar)

### Keyboard and Focus
- All interactive elements must be keyboard operable.
- Tab order follows a logical progression through inputs and results.
- Focus indicators remain visible.
- No keyboard traps.

### Structure and Semantics
- Use semantic HTML and native form controls.
- Group related inputs with appropriate structure.
- Use headings and landmarks consistently.

### Labels, Instructions, and Errors
- Every input has a programmatic label.
- Units and constraints are clearly communicated.
- Validation errors are shown in text and associated with the relevant input.

### Dynamic Updates
- Changes to calculated totals or summaries are perceivable.
- Significant updates should be announced using `aria-live` or `role="status"` when appropriate.
- Do not rely on color alone to convey changes or warnings.

### Touch and Pointer Use
- Controls must be sized and spaced to avoid accidental activation.
- No interaction relies solely on hover or fine pointer movement.

## Error Handling and Reliability
- Invalid input must be handled gracefully and explained.
- The UI must not fail silently.
- If calculations cannot be completed, the user must be informed clearly.

## Data Handling and Privacy
- Do not collect or transmit personal data.
- Any use of localStorage or similar must be optional and documented.
- Do not include analytics or tracking by default.

## Dependencies
- Prefer minimal, well-understood dependencies.
- Avoid external scripts with unclear provenance.
- Document any third-party libraries used, including purpose and limitations.
- Do not commit secrets or API keys.

## Testing Expectations
Manual testing is required for meaningful changes:
- Keyboard-only walkthrough
- Verification of focus visibility
- Validation error handling review
- Zoom testing up to 200%

Automated tests are encouraged for calculation logic but do not replace manual verification.

## Contribution Standards
Pull requests should include:
- Description of the change and rationale
- Notes on UI or behavior changes
- Notes on accessibility impact
- Documentation of known limitations introduced

## Definition of Done
A change is complete only when:
- Time calculations are correct and clearly presented
- UI updates are perceivable and understandable
- Keyboard and accessibility behavior has not regressed
- Assumptions and limitations are explicit
- No hidden normalization or inference is introduced

This project values clarity, usability, and accessibility over cleverness or complexity.

## GitHub Pages constraints (required)

All pages must work when hosted under the repository subpath:
- `https://<user>.github.io/<repo>/`

Rules:
- Use relative URLs that respect the repo base path.
  - Prefer `./assets/...` or `assets/...` from the current page.
  - Avoid absolute root paths like `/assets/...` unless you explicitly set and use a base path.
- Navigation links must work from every page (no assumptions about being at site root).
- Do not rely on server-side routing. Every page must be reachable as a real file.
- Avoid build steps unless documented and reproducible. Prefer “works from static files”.
- If using Jekyll:
  - Treat Jekyll processing as optional unless `_config.yml` and layouts are part of the repo.
  - If you use `{{ site.baseurl }}`, use it consistently for links and assets.
- Provide a failure-safe: pages should render a readable error if required data files are missing.

Static asset rules:
- Pin external CDN dependencies (exact versions) and document why each exists.
- Prefer vendoring critical JS/CSS locally to reduce breakage.
- Don’t depend on blocked resources (mixed content, HTTP, or fragile third-party endpoints).

Caching/versioning:
- If you fetch JSON/data files, include a lightweight cache-busting strategy (e.g., query param using a version string) OR document that users must hard refresh after updates.


## Local preview (required before publish)

Test pages via a local HTTP server (not `file://`) to match GitHub Pages behavior.

Examples:
- `python3 -m http.server 8009`
- `npx serve`

Verify:
- links resolve under a subpath
- fetch requests succeed
- no console errors on load
