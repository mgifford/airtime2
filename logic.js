/**
 * Pure logic functions for Airtime2 meeting transcript analysis.
 * This file contains all functions that are independent of the DOM
 * so they can be tested in isolation.
 */

const TIMESTAMP_RE = /^(\d{2}:\d{2}:\d{2}\.\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}\.\d{3})/;

// TXT format header: [Speaker Name] 12:14:49
const TXT_HEADER_RE = /^\s*\[(.+?)\]\s+(\d{2}):(\d{2}):(\d{2})\s*$/um;

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

const PROMPT_TEMPLATES = {
  summary: {
    label: "Meeting summary",
    text: `# Role
Act as a professional Executive Assistant and Expert Scribe. Your goal is to synthesize the following meeting transcript into a highly organized, concise summary.

# Context
The transcript may contain anonymous speakers (e.g., "Speaker 1", "Speaker A"). Even if names are not provided, maintain the distinction between these individuals to capture the "threaded" nature of the debate or discussion.

# Tasks
1. **Executive Summary**: A 2-3 sentence overview of the meeting's purpose and primary outcome.
2. **Threaded Discussion Points**: Organize the core of the meeting by "Topic Threads." For each thread:
   - Identify the main topic.
   - Summarize the back-and-forth, highlighting differing perspectives from specific speakers (e.g., "Speaker 1 proposed X, while Speaker 2 raised concerns about Y").
3. **Action Items**: Extract all tasks, deadlines, and owners mentioned. Use a checklist format. If an owner is not specified, label it "Unassigned."
4. **Decisions Made**: List any final conclusions or "dead ends" reached during the session.

# Constraints
- Be concise. Use bullet points.
- Remove filler words ("um," "uh," "like") and repetitive conversational loops.
- Use bolding for key terms and speaker identifiers.

# Transcript
`
  },
  actions: {
    label: "Commitments & action items",
    text: `# Role
Act as a meticulous project manager reviewing a meeting transcript.

# Task
Extract every commitment, task, and action item mentioned in the transcript below.

For each item, provide:
- **What**: A clear, one-line description of the action.
- **Who**: The person responsible. If not specified, label as "Unassigned."
- **When**: Any deadline or timeframe mentioned. If not specified, label as "No deadline given."
- **Context**: One sentence explaining why this action was agreed upon.

Present the results as a numbered checklist, ordered by speaker.

# Constraints
- Include only concrete commitments, not vague intentions.
- Do not invent or infer owners or deadlines that are not clearly stated.
- Note any ambiguous items separately under "Unclear commitments."

# Transcript
`
  },
  perspectives: {
    label: "Multiple perspectives",
    text: `# Role
Act as a neutral facilitator reviewing a meeting transcript.

# Task
Analyze the transcript and present the conversation from multiple perspectives:

1. **By speaker**: For each participant, summarize their main positions, concerns, and contributions.
2. **Points of agreement**: Identify topics where speakers converged or reached consensus.
3. **Points of tension**: Identify topics where speakers held different or opposing views. Quote briefly where helpful.
4. **Underrepresented voices**: Note any speakers who contributed less and whether any important perspectives may have been missed.

# Constraints
- Be neutral and fair to all speakers.
- Use direct quotes sparingly and only to illustrate key moments.
- Avoid interpreting tone or intent beyond what is stated.

# Transcript
`
  },
  nextmeeting: {
    label: "Next meeting prep",
    text: `# Role
Act as an experienced meeting facilitator preparing for the next meeting in this series.

# Task
Based on the transcript below, produce a preparation brief for the next meeting:

1. **Unresolved issues**: List topics that were raised but not concluded.
2. **Follow-up items**: List action items or commitments that should be checked on.
3. **Suggested agenda items**: Propose a short agenda for the next meeting based on what was left open.
4. **Questions to prepare**: List 3-5 questions that participants should think about before the next meeting.
5. **Risks or blockers**: Flag anything that could delay progress if not addressed.

# Constraints
- Focus on forward-looking items only.
- Be concise. Use bullet points and numbered lists.
- Do not re-summarize resolved topics.

# Transcript
`
  },
  tips: {
    label: "Participation tips",
    text: `# Role
Act as an expert in inclusive meeting facilitation and organizational communication.

# Task
Review the transcript and provide constructive, actionable feedback to help improve participation in future meetings.

1. **Participation balance**: Assess whether speaking time was distributed equitably. Note any dominant or quiet participants.
2. **Facilitation observations**: Comment on how well the discussion was guided, including whether all voices had space to contribute.
3. **Communication patterns**: Identify any patterns that helped or hindered understanding (e.g., interruptions, jargon, unclear questions).
4. **Specific tips**: Offer 3-5 practical suggestions the group could try in the next meeting to improve engagement and inclusion.

# Constraints
- Be constructive and non-judgmental. Focus on behaviors, not individuals.
- Keep suggestions practical and easy to implement.
- Acknowledge what is already working well before suggesting improvements.

# Transcript
`
  }
};

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

  // 2) TXT path (parse, don't "detect")
  const txt = parseTxt(raw);
  if (txt.length) return txt;

  // 3) Last resort: try VTT anyway
  const vtt2 = parseVtt(raw);
  if (vtt2.length) return vtt2;

  return [];
}

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

function truncateLabel(name, maxLen = 18) {
  if (name.length <= maxLen) return name;
  return name.slice(0, maxLen - 1) + "…";
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

function formatTranscriptForPrompt(mergedUtterances) {
  return mergedUtterances.map(u => `${u.speaker}: ${u.text}`).join("\n\n");
}

function buildPrompt(templateKey, mergedUtterances) {
  const template = PROMPT_TEMPLATES[templateKey];
  if (!template) return "";
  return template.text + formatTranscriptForPrompt(mergedUtterances);
}

// Export for Node.js / Jest environments while remaining a browser-safe global script
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    TIMESTAMP_RE,
    TXT_HEADER_RE,
    STOPWORDS,
    PROMPT_TEMPLATES,
    escapeHtml,
    timeToSeconds,
    timeHmsToSeconds,
    monotonicize,
    normalizeRaw,
    parseContentLine,
    parseVtt,
    parseTxt,
    parseTranscript,
    mergeUtterances,
    computeMetrics,
    truncateLabel,
    parseFilenameForDate,
    buildSpeakerText,
    wordFrequencies,
    pairsToTermsText,
    formatTranscriptForPrompt,
    buildPrompt
  };
}
