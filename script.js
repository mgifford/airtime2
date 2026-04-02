// Pure logic functions are loaded from logic.js (included before this script).

// Visuals per speaker
const speakerVisuals = new Map();
const SYMBOLS = ["●", "■", "▲", "◆", "★", "✚", "✱", "⬟", "⬢", "♦", "◼", "◉", "⬤"];
let colorIndex = 0;
let activeSpeaker = null;
let stickySpeaker = null;

// Sections 2–6 to show/hide
const ANALYSIS_SECTION_IDS = [
  "summary-section",
  "timeline-section",
  "wordcloud-section",
  "transcript-section",
  "prompt-section"
];

// Global stats for sorting
let speakerStatsGlobal = [];
let currentSortKey = "wordShare";
let currentSortDir = "desc";

// Meeting date extracted from filename (if available)
let meetingDateDisplay = null;

function setInstructionsVisible(show) {
  const section = document.getElementById("instructions-visual");
  if (!section) return;
  if (show) {
    section.classList.remove("is-hidden");
  } else {
    section.classList.add("is-hidden");
  }
}

function setAnalysisVisible(visible) {
  ANALYSIS_SECTION_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (visible) {
      el.classList.remove("is-hidden");
    } else {
      el.classList.add("is-hidden");
    }
  });
  setInstructionsVisible(!visible);
}

// initial state: hide sections 2–5
setAnalysisVisible(false);

function resetSpeakerVisuals() {
  speakerVisuals.clear();
  colorIndex = 0;
  activeSpeaker = null;
  stickySpeaker = null;
}

function generateColor(index) {
  // Use a stable palette mapped to visual-only elements (segments, bars)
  const baseColors = [
    getComputedStyle(document.documentElement).getPropertyValue("--speaker-a").trim() || "#145da0",
    getComputedStyle(document.documentElement).getPropertyValue("--speaker-b").trim() || "#006b4f",
    getComputedStyle(document.documentElement).getPropertyValue("--speaker-c").trim() || "#7b296a",
    getComputedStyle(document.documentElement).getPropertyValue("--speaker-d").trim() || "#8b4b00"
  ];
  return baseColors[index % baseColors.length];
}

function getSpeakerVisual(name) {
  if (!speakerVisuals.has(name)) {
    const vis = {
      color: generateColor(colorIndex),
      symbol: SYMBOLS[colorIndex % SYMBOLS.length]
    };
    colorIndex += 1;
    speakerVisuals.set(name, vis);
  }
  return speakerVisuals.get(name);
}

// Cleaned transcript
function renderCleanedTranscript(mergedUtterances) {
  const container = document.getElementById("cleaned");
  container.innerHTML = "";
  for (const u of mergedUtterances) {
    const line = document.createElement("div");
    line.className = "utterance-line";
    line.setAttribute("data-speaker", u.speaker);

    const speakerBtn = document.createElement("button");
    speakerBtn.type = "button";
    speakerBtn.className = "utterance-speaker speaker-name-button";
    speakerBtn.setAttribute("data-speaker", u.speaker);
    speakerBtn.textContent = u.speaker;
    wireSpeakerInteractive(speakerBtn, u.speaker, { scrollOnClick: true });

    const colon = document.createTextNode(": ");

    const textSpan = document.createElement("span");
    textSpan.className = "utterance-text";
    textSpan.setAttribute("data-speaker", u.speaker);
    textSpan.textContent = u.text;

    line.appendChild(speakerBtn);
    line.appendChild(colon);
    line.appendChild(textSpan);

    container.appendChild(line);
  }
}

function renderMeetingMetrics(duration, totalWords, stats, attendees) {
  const el = document.getElementById("meeting-metrics");
  let html = "";
  if (meetingDateDisplay) {
    html += `<p><strong>Date:</strong> ${escapeHtml(meetingDateDisplay)}</p>`;
  }
  html += `<p><strong>Total words:</strong> ${totalWords}</p>`;
  html += `<p><strong>Meeting duration:</strong> ${(duration / 60).toFixed(1)} minutes</p>`;
  if (attendees) {
    const silent = Math.max(attendees - stats.length, 0);
    html += `<p><strong>Attendees:</strong> ${attendees}, <strong>spoke:</strong> ${stats.length}, <strong>silent:</strong> ${silent}</p>`;
  }
  el.innerHTML = html;
}

function renderSpeakersTable(stats) {
  const tbody = document.querySelector("#speakers-table tbody");
  tbody.innerHTML = "";
  for (const s of stats) {
    const vis = getSpeakerVisual(s.speaker);
    const row = document.createElement("tr");
    row.setAttribute("data-speaker", s.speaker);

    const nameCell = document.createElement("td");
    const colorBox = document.createElement("span");
    colorBox.className = "legend-color";
    colorBox.style.backgroundColor = vis.color;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "speaker-name-button";
    btn.textContent = s.speaker;
    btn.setAttribute("data-speaker", s.speaker);
    wireSpeakerInteractive(btn, s.speaker, { scrollOnClick: true });

    nameCell.appendChild(colorBox);
    nameCell.appendChild(btn);

    row.appendChild(nameCell);
    row.innerHTML += `
      <td>${s.words}</td>
      <td>${(s.time / 60).toFixed(1)}</td>
      <td>${(s.wordShare * 100).toFixed(1)}%</td>
      <td>${(s.timeShare * 100).toFixed(1)}%</td>
      <td>${s.turns}</td>
    `;
    tbody.appendChild(row);
  }
}

function updateHeaderSortIndicators() {
  const ths = document.querySelectorAll("#speakers-table thead th[data-sort-key]");
  ths.forEach(th => {
    th.removeAttribute("aria-sort");
    const arrow = th.querySelector(".sort-arrow");
    if (arrow) {
      arrow.classList.remove("sort-arrow--asc", "sort-arrow--desc");
      arrow.classList.add("sort-arrow--none");
    }
  });
  const activeTh = document.querySelector(`#speakers-table thead th[data-sort-key="${currentSortKey}"]`);
  if (activeTh) {
    activeTh.setAttribute("aria-sort", currentSortDir === "asc" ? "ascending" : "descending");
    const arrow = activeTh.querySelector(".sort-arrow");
    if (arrow) {
      arrow.classList.remove("sort-arrow--none");
      arrow.classList.add(currentSortDir === "asc" ? "sort-arrow--asc" : "sort-arrow--desc");
    }

    const labelSpan = activeTh.querySelector(".sort-label");
    const label = labelSpan ? labelSpan.textContent.trim() : currentSortKey;
    const status = document.getElementById("table-sort-status");
    if (status) {
      status.textContent = `Speakers table sorted by ${label}, ${currentSortDir === "asc" ? "ascending" : "descending"}.`;
    }
  }
}

function applySortAndRender() {
  if (!speakerStatsGlobal.length) return;
  const sorted = speakerStatsGlobal.slice().sort((a, b) => {
    let va = a[currentSortKey];
    let vb = b[currentSortKey];
    if (typeof va === "string") {
      va = va.toLowerCase();
      vb = vb.toLowerCase();
      if (va < vb) return currentSortDir === "asc" ? -1 : 1;
      if (va > vb) return currentSortDir === "asc" ? 1 : -1;
      return 0;
    } else {
      return currentSortDir === "asc" ? va - vb : vb - va;
    }
  });
  renderSpeakersTable(sorted);
  updateHeaderSortIndicators();
}

function sortSpeakerStats(key, toggle = true) {
  if (!speakerStatsGlobal.length) return;

  if (toggle) {
    if (currentSortKey === key) {
      currentSortDir = currentSortDir === "asc" ? "desc" : "asc";
    } else {
      currentSortKey = key;
      currentSortDir = key === "speaker" ? "asc" : "desc";
    }
  } else {
    currentSortKey = key;
    currentSortDir = key === "speaker" ? "asc" : "desc";
  }

  applySortAndRender();
}

function attachHeaderSortHandlers() {
  const ths = document.querySelectorAll("#speakers-table thead th[data-sort-key]");
  ths.forEach(th => {
    const key = th.getAttribute("data-sort-key");
    if (!key) return;
    th.addEventListener("click", () => sortSpeakerStats(key, true));
    th.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        sortSpeakerStats(key, true);
      }
    });
  });
}

function renderLegend(stats) {
  const legend = document.getElementById("speaker-legend");
  legend.innerHTML = "";
  for (const s of stats) {
    const vis = getSpeakerVisual(s.speaker);
    const item = document.createElement("div");
    item.className = "legend-item";
    item.setAttribute("data-speaker", s.speaker);

    const colorBox = document.createElement("span");
    colorBox.className = "legend-color";
    colorBox.style.backgroundColor = vis.color;

    const sym = document.createElement("span");
    sym.className = "legend-symbol";
    sym.textContent = vis.symbol;
    sym.style.color = vis.color;

    const label = document.createElement("button");
    label.type = "button";
    label.className = "speaker-name-button";
    label.textContent = s.speaker;
    label.setAttribute("data-speaker", s.speaker);
    wireSpeakerInteractive(label, s.speaker, { scrollOnClick: true });

    item.appendChild(colorBox);
    item.appendChild(sym);
    item.appendChild(label);
    legend.appendChild(item);
  }
}

function renderTimeline(utterances, meetingDuration) {
  const container = document.getElementById("timeline");
  container.innerHTML = "";
  if (!utterances.length || meetingDuration <= 0) {
    container.textContent = "No timeline data.";
    return;
  }
  let minStart = utterances[0].start;
  for (const u of utterances) {
    if (u.start < minStart) minStart = u.start;
  }
  for (const u of utterances) {
    const startPct = ((u.start - minStart) / meetingDuration) * 100;
    const widthPct = ((u.end - u.start) / meetingDuration) * 100;
    const vis = getSpeakerVisual(u.speaker);
    const seg = document.createElement("div");
    seg.className = "segment";
    seg.style.left = `${Math.max(startPct, 0)}%`;
    seg.style.width = `${Math.max(widthPct, 0.3)}%`;
    seg.style.backgroundColor = vis.color;
    seg.setAttribute("title", `${u.speaker}: ${u.text}`);
    seg.setAttribute("data-speaker", u.speaker);

    const label = document.createElement("span");
    label.className = "segment-label";
    label.textContent = vis.symbol;
    seg.appendChild(label);

    seg.addEventListener("mouseenter", () => handleHoverSpeaker(u.speaker));
    seg.addEventListener("mouseleave", () => handleHoverOut());

    container.appendChild(seg);
  }
}

// Bar charts helpers
function renderBarCharts(stats) {
  const wordChart = document.getElementById("word-share-chart");
  const timeChart = document.getElementById("time-share-chart");
  wordChart.innerHTML = "<h3>Word share</h3>";
  timeChart.innerHTML = "<h3>Time share</h3>";

  if (!stats.length) {
    wordChart.innerHTML += "<p>No data.</p>";
    timeChart.innerHTML += "<p>No data.</p>";
    return;
  }

  const sortedByWords = stats.slice().sort((a, b) => b.wordShare - a.wordShare);
  const sortedByTime = stats.slice().sort((a, b) => b.timeShare - a.timeShare);

  for (const s of sortedByWords) {
    const vis = getSpeakerVisual(s.speaker);
    const row = document.createElement("div");
    row.className = "bar-row";
    row.setAttribute("data-speaker", s.speaker);

    const label = document.createElement("span");
    label.className = "bar-label";
    label.textContent = truncateLabel(s.speaker);
    label.title = s.speaker;

    const track = document.createElement("div");
    track.className = "bar-track";

    const fill = document.createElement("div");
    fill.className = "bar-fill";
    fill.style.width = `${(s.wordShare * 100).toFixed(1)}%`;
    fill.style.backgroundColor = vis.color;

    track.appendChild(fill);

    const value = document.createElement("span");
    value.className = "bar-value";
    value.textContent = `${(s.wordShare * 100).toFixed(1)}%`;

    row.appendChild(label);
    row.appendChild(track);
    row.appendChild(value);

    row.addEventListener("mouseenter", () => handleHoverSpeaker(s.speaker));
    row.addEventListener("mouseleave", () => handleHoverOut());
    row.addEventListener("click", () => toggleStickySpeaker(s.speaker, { scroll: true }));

    wordChart.appendChild(row);
  }

  for (const s of sortedByTime) {
    const vis = getSpeakerVisual(s.speaker);
    const row = document.createElement("div");
    row.className = "bar-row";
    row.setAttribute("data-speaker", s.speaker);

    const label = document.createElement("span");
    label.className = "bar-label";
    label.textContent = truncateLabel(s.speaker);
    label.title = s.speaker;

    const track = document.createElement("div");
    track.className = "bar-track";

    const fill = document.createElement("div");
    fill.className = "bar-fill";
    fill.style.width = `${(s.timeShare * 100).toFixed(1)}%`;
    fill.style.backgroundColor = vis.color;

    track.appendChild(fill);

    const value = document.createElement("span");
    value.className = "bar-value";
    value.textContent = `${(s.timeShare * 100).toFixed(1)}%`;

    row.appendChild(label);
    row.appendChild(track);
    row.appendChild(value);

    row.addEventListener("mouseenter", () => handleHoverSpeaker(s.speaker));
    row.addEventListener("mouseleave", () => handleHoverOut());
    row.addEventListener("click", () => toggleStickySpeaker(s.speaker, { scroll: true }));

    timeChart.appendChild(row);
  }
}

function renderWordClouds(utterances, stats) {
  const container = document.getElementById("word-cloud-container");
  container.innerHTML = "";
  if (!utterances.length || !stats.length) {
    container.textContent = "No data for word clouds.";
    return;
  }

  const speakerText = buildSpeakerText(utterances);
  const topSpeakers = stats
    .slice()
    .sort((a, b) => b.words - a.words)
    .slice(0, 4);

  // Row for top 4 speakers
  const row = document.createElement("div");
  row.className = "word-cloud-row";
  container.appendChild(row);

  for (const s of topSpeakers) {
    const text = speakerText.get(s.speaker) || "";
    const freq = wordFrequencies(text);
    if (!freq.size) continue;

    const pairs = Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40);

    const counts = pairs.map(([, c]) => c);
    const min = Math.min(...counts);
    const max = Math.max(...counts);

    const card = document.createElement("div");
    card.className = "word-cloud-card";
    card.setAttribute("data-speaker", s.speaker);
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");

    const vis = getSpeakerVisual(s.speaker);
    const heading = document.createElement("h3");
    heading.innerHTML = `<span style="color:${vis.color}">${vis.symbol}</span> ${escapeHtml(s.speaker)}`;
    card.appendChild(heading);

    const topTermsText = pairsToTermsText(pairs);
    card.setAttribute("aria-label", `Word cloud for ${s.speaker}. Top terms: ${topTermsText}`);
    card.title = `Top terms: ${topTermsText}`;

    const cloud = document.createElement("div");
    cloud.className = "word-cloud-visual";

    for (const [word, count] of pairs) {
      const span = document.createElement("span");
      const weight = (count - min) / (max - min || 1);
      const size = 0.85 + weight * 1.8; // rem
      span.textContent = word;
      span.style.fontSize = `${size}rem`;
      span.style.fontWeight = weight > 0.7 ? "700" : "500";
      cloud.appendChild(span);
    }

    card.appendChild(cloud);

    card.addEventListener("click", () => toggleStickySpeaker(s.speaker, { scroll: true }));
    card.addEventListener("mouseenter", () => handleHoverSpeaker(s.speaker));
    card.addEventListener("mouseleave", () => handleHoverOut());
    card.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        toggleStickySpeaker(s.speaker, { scroll: true });
      }
    });

    row.appendChild(card);
  }

  // Overall word cloud
  let allText = "";
  for (const u of utterances) {
    allText += " " + u.text;
  }
  const overallFreq = wordFrequencies(allText);
  if (overallFreq.size) {
    const pairs = Array.from(overallFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 60);

    const counts = pairs.map(([, c]) => c);
    const min = Math.min(...counts);
    const max = Math.max(...counts);

    const overallCard = document.createElement("div");
    overallCard.className = "word-cloud-card";
    overallCard.setAttribute("data-speaker", "ALL");

    const heading = document.createElement("h3");
    heading.textContent = "All speakers";
    overallCard.appendChild(heading);

    const topTermsText = pairsToTermsText(pairs);
    overallCard.setAttribute("aria-label", `Word cloud for all speakers. Top terms: ${topTermsText}`);
    overallCard.title = `Top terms: ${topTermsText}`;

    const cloud = document.createElement("div");
    cloud.className = "word-cloud-visual";

    for (const [word, count] of pairs) {
      const span = document.createElement("span");
      const weight = (count - min) / (max - min || 1);
      const size = 0.85 + weight * 1.8;
      span.textContent = word;
      span.style.fontSize = `${size}rem`;
      span.style.fontWeight = weight > 0.7 ? "700" : "500";
      cloud.appendChild(span);
    }

    overallCard.appendChild(cloud);

    container.appendChild(overallCard);
  }
}

// Highlighting logic

function applyHighlight(name) {
  activeSpeaker = name;
  const all = document.querySelectorAll("[data-speaker]");
  all.forEach(el => {
    const sp = el.getAttribute("data-speaker");
    el.classList.remove("is-active", "is-muted");
    const btn = el.classList.contains("speaker-name-button") ? el : null;

    if (!name || name === "ALL") {
      if (btn) {
        btn.classList.remove("is-selected", "is-muted");
      }
    } else if (sp === name) {
      el.classList.add("is-active");
      if (btn) {
        btn.classList.add("is-selected");
        btn.classList.remove("is-muted");
      }
    } else {
      el.classList.add("is-muted");
      if (btn) {
        btn.classList.add("is-muted");
        btn.classList.remove("is-selected");
      }
    }
  });
}

function clearHighlight() {
  activeSpeaker = null;
  const all = document.querySelectorAll("[data-speaker]");
  all.forEach(el => {
    el.classList.remove("is-active", "is-muted");
    if (el.classList.contains("speaker-name-button")) {
      el.classList.remove("is-selected", "is-muted");
    }
  });
}

function handleHoverSpeaker(name) {
  if (stickySpeaker) return;
  applyHighlight(name);
}

function handleHoverOut() {
  if (stickySpeaker) return;
  clearHighlight();
}

function scrollSpeakerIntoView(name) {
  const candidates = document.querySelectorAll('#cleaned [data-speaker]');
  for (const el of candidates) {
    if (el.getAttribute("data-speaker") === name) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      break;
    }
  }
}

function toggleStickySpeaker(name, options = {}) {
  const { scroll = false } = options;
  if (stickySpeaker === name) {
    stickySpeaker = null;
    clearHighlight();
  } else {
    stickySpeaker = name;
    applyHighlight(name);
    if (scroll) scrollSpeakerIntoView(name);
  }
}

function wireSpeakerInteractive(elem, speakerName, opts = {}) {
  const { scrollOnClick = false } = opts;
  elem.addEventListener("mouseenter", () => handleHoverSpeaker(speakerName));
  elem.addEventListener("mouseleave", () => handleHoverOut());
  elem.addEventListener("click", () => toggleStickySpeaker(speakerName, { scroll: scrollOnClick }));
}

function renderPromptSection(mergedUtterances) {
  const outputEl = document.getElementById("prompt-output");
  const copyBtn = document.getElementById("copy-prompt-btn");
  const statusEl = document.getElementById("prompt-copy-status");

  function updatePromptOutput() {
    const selected = document.querySelector('input[name="prompt-type"]:checked');
    const key = selected ? selected.value : "summary";
    outputEl.value = buildPrompt(key, mergedUtterances);
    statusEl.textContent = "";
  }

  // Set initial value
  updatePromptOutput();

  // Re-wire radio buttons using onchange to avoid stacking listeners across re-analyses
  const radios = document.querySelectorAll('input[name="prompt-type"]');
  radios.forEach(radio => {
    radio.onchange = updatePromptOutput;
  });

  // Copy button
  copyBtn.onclick = () => {
    const text = outputEl.value;
    if (!text) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        statusEl.textContent = "Copied!";
        setTimeout(() => { statusEl.textContent = ""; }, 2500);
      }).catch(() => {
        statusEl.textContent = "Press Ctrl+C / Cmd+C to copy.";
        outputEl.select();
      });
    } else {
      statusEl.textContent = "Press Ctrl+C / Cmd+C to copy.";
      outputEl.select();
    }
  };
}

// File handling

function setupFileHandling() {
  const fileInput = document.getElementById("file-input");
  const dropZone = document.getElementById("file-drop");
  const transcriptArea = document.getElementById("transcript");

  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    meetingDateDisplay = parseFilenameForDate(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      transcriptArea.value = reader.result;
    };
    reader.readAsText(file);
  });

  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("is-dragover");
  });
  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("is-dragover");
  });
  dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.classList.remove("is-dragover");
    const file = event.dataTransfer.files && event.dataTransfer.files[0];
    if (!file) return;
    meetingDateDisplay = parseFilenameForDate(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      transcriptArea.value = reader.result;
    };
    reader.readAsText(file);
  });
}

// Main

document.getElementById("analyze").addEventListener("click", () => {
  const raw = document.getElementById("transcript").value;
  if (!raw.trim()) {
    // alert("Please upload or paste a VTT transcript before analyzing.");
    alert("Please upload or paste a transcript (VTT or TXT) before analyzing.");
    setAnalysisVisible(false);
    return;
  }

  resetSpeakerVisuals();

  // const utterances = parseVtt(raw);
  const utterances = parseTranscript(raw);
  const merged = mergeUtterances(utterances);

  if (!merged.length) {
    // alert("No valid VTT caption blocks were found. Please check the transcript format.");
    alert("No valid transcript blocks were found. Supported formats: VTT, or TXT blocks like: [Speaker] 12:34:56");
    setAnalysisVisible(false);
    return;
  }

  setAnalysisVisible(true);

  renderCleanedTranscript(merged);

  const attendeesVal = document.getElementById("attendees").value;
  const attendees = attendeesVal !== "" ? Number(attendeesVal) : null;
  const { meetingDuration, totalWords, speakerStats } = computeMetrics(merged);

  speakerStatsGlobal = speakerStats.slice();

  renderMeetingMetrics(meetingDuration, totalWords, speakerStatsGlobal, attendees);
  sortSpeakerStats("wordShare", false); // default sort: word share desc
  renderLegend(speakerStatsGlobal);
  renderTimeline(merged, meetingDuration);
  renderBarCharts(speakerStatsGlobal);
  renderWordClouds(merged, speakerStatsGlobal);
  renderPromptSection(merged);
});

// Init
setupFileHandling();
attachHeaderSortHandlers();
