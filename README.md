# Meeting Airtime & Participation Analyzer

Static, client-side tool to analyze participation in online meetings using Zoom or Microsoft Teams VTT transcripts.  
Runs entirely in the browser and can be hosted on GitHub Pages without any backend.

## Features

- Upload, drag-and-drop, or paste a `.vtt` transcript.
- Parse speaker turns and merge consecutive utterances from the same speaker.
- Compute per-speaker metrics:
  - Word count
  - Speaking time (minutes)
  - Percentage share of words and time
  - Number of turns
- Sortable **Speakers** table:
  - Click or keyboard-activate column headers to sort.
  - ARIA live-region announces sort changes (WCAG 2.2 AA friendly).
  - Table is copy-paste friendly (no decorative glyphs or sort arrows in copied text).
- **Word and time share** bar charts.
- **Timeline** of speaking with color-coded segments per speaker.
- **Word clouds**:
  - Top 4 speakers get their own word cloud.
  - One additional word cloud aggregates all speakers.
  - Word size (not color) encodes frequency.
  - Common stopwords and filler words filtered out.
- **Cleaned transcript**:
  - Speaker name highlighted in bold and made clickable.
  - Clicking a speaker anywhere (table, legend, bars, word clouds) highlights their contributions and scrolls the transcript.
- Optional **attendees count** to show how many people were silent.

All logic is implemented in plain JavaScript, HTML, and CSS.

## Accessibility

This tool is built with WCAG 2.2 AA in mind:

- Text color and background combinations tuned for contrast.
- No reliance on color alone for meaning (names, metrics, and labels are always present).
- Keyboard operable:
  - Speakers table headers can be focused and activated with Enter/Space.
  - Interactive word-cloud cards and speaker names are focusable buttons.
- ARIA:
  - `aria-sort` used on the active **Speakers** column.
  - Sort changes announced via `aria-live` region.
  - Timeline and word charts use descriptive `aria-label`s.
- Visual emphasis for active/muted speakers uses borders, background, and font-style rather than low-contrast text.

Always validate with your own tooling (e.g. Accessibility Insights, axe, WAVE) against your target theme and deployment context.

## Credits & inspiration

This project is inspired by:

- **clean-zoom-transcript** by Sarah Allen  
  <https://github.com/sarah37/clean-zoom-transcript>  
  for the idea of cleaning and merging Zoom transcripts into a more readable format.

- **airtime** by jcontd  
  <https://github.com/jcontd/airtime>  
  for the concept of analyzing airtime and participation from call metadata.

- **d3-cloud** by Jason Davies  
  <https://github.com/jasondavies/d3-cloud>  
  as a conceptual reference for word cloud visualizations (this project does not use d3, but borrows the idea of encoding frequency via font size).

Additional reading and reference:

- **Web Content Accessibility Guidelines (WCAG) 2.2**  
  <https://www.w3.org/TR/WCAG22/>

- **Web Sustainability Guidelines (WSG)** from the W3C Community Group  
  <https://w3c.github.io/sustainableweb-wsg/>

- **Building your own color contrast checker** by Álvaro Montoro  
  <https://dev.to/alvaromontoro/building-your-own-color-contrast-checker-4j7o>

## Running on GitHub Pages

1. Create a new GitHub repository (public is fine).
2. Add these three files at the top level:
   - `index.html`
   - `script.js`
   - `README.md`
3. Commit and push.
4. Enable GitHub Pages in the repository settings:
   - Source: `main` (or your default branch), root directory.
5. Visit the GitHub Pages URL for the repo.
6. Upload or paste a VTT transcript and click **Analyze meeting**.

## Notes

- All processing happens client-side in the browser.
- No transcripts are sent to a server by this code.
- AI/NLP-enhanced analysis (e.g. summaries, sentiment, per-speaker reading level) is intentionally left as a future enhancement to keep this version free and lightweight.
