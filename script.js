const TIMESTAMP_RE = /^(\d{2}:\d{2}:\d{2}\.\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}\.\d{3})/;

// Visuals per speaker
const speakerVisuals = new Map();
const SYMBOLS = ["●", "■", "▲", "◆", "★", "✚", "✱", "⬟", "⬢", "♦", "◼", "◉", "⬤"];
let colorIndex = 0;
let activeSpeaker = null;
let stickySpeaker = null;

// Sections 2–5 to show/hide
const ANALYSIS_SECTION_IDS = [
  "summary-section",
  "timeline-section",
  "wordcloud-section",
  "transcript-section"
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

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function timeToSeconds(t) {
  const [h, m, s] = t.split(":");
  const [sec, ms] = s.split(".");
  return Number(h) * 3600 + Number(m) * 60 + Number(sec) + Number(ms) / 1000;
}

function parseContentLine(line) {
  const idx = line.indexOf(":");
  if (idx === -1) return { speaker: "Unknown", text: line.trim() };
  return {
    speaker: line.slice(0, idx).trim(),
    text: line.slice(idx + 1).trim()
  };
}

function parseVtt(raw) {
  const lines = raw.split(/\r?\n/);
  const utterances = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = TIMESTAMP_RE.exec(line);
    if (!match) continue;

    const start = timeToSeconds(match[1]);
    const end = timeToSeconds(match[2]);

    let j = i + 1;
    while (j < lines.length && lines[j].trim() === "") j++;
    if (j >= lines.length) break;

    const { speaker, text } = parseContentLine(lines[j]);
    utterances.push({ speaker, start, end, text });

    i = j;
  }
  return utterances;
}

function parseTranscript(raw) {
  // 1) VTT path
  if (TIMESTAMP_RE.test(raw)) {
    const vtt = parseVtt(raw);
    if (vtt.length) return vtt;
  }

  // 2) TXT path (parse, don’t “detect”)
  const txt = parseTxt(raw);
  if (txt.length) return txt;

  // 3) Last resort: try VTT anyway
  const vtt2 = parseVtt(raw);
  if (vtt2.length) return vtt2;

  return [];
}

// TXT format header: [Speaker Name] 12:14:49
// const TXT_HEADER_RE = /^\s*\[(.+?)\]\s+(\d{2}):(\d{2}):(\d{2})\s*$/;
// const TXT_HEADER_RE = /^\s*\[(.+?)\]\s+(\d{2}):(\d{2}):(\d{2})\s*$/u;
const TXT_HEADER_RE = /^\s*\[(.+?)\]\s+(\d{2}):(\d{2}):(\d{2})\s*$/um;

function timeHmsToSeconds(hh, mm, ss) {
  return Number(hh) * 3600 + Number(mm) * 60 + Number(ss);
}

// If the clock goes backwards (cross midnight), carry into next day.
function monotonicize(seconds, lastSeconds) {
  let t = seconds;
  while (t < lastSeconds) t += 24 * 3600;
  return t;
}

function normalizeRaw(raw) {
  // Remove UTF-8 BOM if present and normalize newlines
  return raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function parseTxt(raw) {
  raw = normalizeRaw(raw);
  // const lines = raw.split(/\r?\n/);
  const lines = raw.split("\n");
  const blocks = [];
  let lastStart = -Infinity;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    const m = TXT_HEADER_RE.exec(line);
    if (!m) continue;

    const speaker = m[1].trim();
    const startRaw = timeHmsToSeconds(m[2], m[3], m[4]);
    const start = monotonicize(startRaw, lastStart);
    lastStart = start;

    // Collect text until blank line or next header
    const textLines = [];
    let j = i + 1;
    while (j < lines.length) {
      const nextLine = lines[j];
      if (nextLine.trim() === "") break;
      // Stop early if we hit another header line (some exports omit blank lines)
      if (TXT_HEADER_RE.test(nextLine.trim())) break;
      textLines.push(nextLine.trimEnd());
      j++;
    }

    const text = textLines.join(" ").trim();
    if (text) blocks.push({ speaker, start, text });

    i = j - 1;
  }

  // Infer end times from next block start; last one gets a default tail.
  // This is unavoidable because TXT provides no end times.
  const DEFAULT_LAST_CUE_SECONDS = 2;

  const utterances = blocks.map((b, idx) => {
    const next = blocks[idx + 1];
    const end = next ? next.start : b.start + DEFAULT_LAST_CUE_SECONDS;
    return { speaker: b.speaker, start: b.start, end, text: b.text };
  });

console.log("[airtime2] TXT blocks:", blocks.length, "utterances:", utterances.length);
if (!blocks.length) {
  console.log("[airtime2] First 5 lines:", lines.slice(0, 5));
}
  
  return utterances;
}

function mergeUtterances(utterances) {
  if (!utterances.length) return [];
  const merged = [];
  let current = { ...utterances[0] };
  for (let i = 1; i < utterances.length; i++) {
    const u = utterances[i];
    if (u.speaker === current.speaker) {
      current.end = u.end;
      current.text += " " + u.text;
    } else {
      merged.push(current);
      current = { ...u };
    }
  }
  merged.push(current);
  return merged;
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

function computeMetrics(utterances) {
  const speakers = new Map();
  let meetingStart = Infinity;
  let meetingEnd = 0;
  let totalWords = 0;

  for (const u of utterances) {
    const duration = Math.max(u.end - u.start, 0);
    const wordCount = u.text.split(/\s+/).filter(Boolean).length;

    meetingStart = Math.min(meetingStart, u.start);
    meetingEnd = Math.max(meetingEnd, u.end);
    totalWords += wordCount;

    if (!speakers.has(u.speaker)) {
      speakers.set(u.speaker, {
        speaker: u.speaker,
        words: 0,
        time: 0,
        turns: 0,
        longestTurn: 0
      });
    }
    const s = speakers.get(u.speaker);
    s.words += wordCount;
    s.time += duration;
    s.turns += 1;
    s.longestTurn = Math.max(s.longestTurn, duration);
  }

  const meetingDuration = meetingEnd - meetingStart;
  const speakerStats = Array.from(speakers.values());

  for (const s of speakerStats) {
    s.wordShare = totalWords ? s.words / totalWords : 0;
    s.timeShare = meetingDuration ? s.time / meetingDuration : 0;
  }

  return { meetingDuration, totalWords, speakerStats };
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
function truncateLabel(name, maxLen = 18) {
  if (name.length <= maxLen) return name;
  return name.slice(0, maxLen - 1) + "…";
}

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

// Word cloud helpers

const STOPWORDS = new Set([
  "the","and","a","to","of","in","it","is","i","you","that","on","for","this",
  "with","we","as","at","be","are","was","were","have","has","had","or","so",
  "if","but","they","them","our","us","by","from","an","about","not","do",
  "does","did","can","could","should","would","will","just","like","into",
  "over","out","up","down","then","than","there","here","what","when","where",
  "who","which","how","also","all","any","some","your","my","me","their","its",
  // filler / discourse markers
  "yeah","ok","okay","uh","um","uhm","hmm","mm","kind","sort","ve","re","right",
  "well","actually","really","literally","basically","kinda","sorta","gonna"
]);

function buildSpeakerText(utterances) {
  const map = new Map();
  for (const u of utterances) {
    if (!map.has(u.speaker)) map.set(u.speaker, "");
    map.set(u.speaker, map.get(u.speaker) + " " + u.text);
  }
  return map;
}

function wordFrequencies(text) {
  const counts = new Map();
  const cleaned = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  for (const t of tokens) {
    if (t.length <= 1) continue;
    if (STOPWORDS.has(t)) continue;
    counts.set(t, (counts.get(t) || 0) + 1);
  }
  return counts;
}

function pairsToTermsText(pairs, limit = 12) {
  const top = pairs.slice(0, limit);
  return top.map(([word, count]) => `${word} (${count})`).join(", ");
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

// Date parsing from filename like GMT20220401-170425_Recording.transcript.vtt
function parseFilenameForDate(name) {
  const re = /GMT(\d{4})(\d{2})(\d{2})-(\d{6})/;
  const m = re.exec(name);
  if (!m) return null;
  const year = m[1];
  const month = m[2];
  const day = m[3];
  const time = m[4]; // hhmmss
  const hh = time.slice(0, 2);
  const mm = time.slice(2, 4);
  // Format: Day/Month/Year Time (HH:MM)
  return `${day}/${month}/${year} ${hh}:${mm}`;
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
});

// Init
setupFileHandling();
attachHeaderSortHandlers();
