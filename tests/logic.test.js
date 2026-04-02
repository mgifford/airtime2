"use strict";

/**
 * Comprehensive test suite for airtime2 pure logic functions (logic.js).
 *
 * Coverage areas:
 *   - timeToSeconds / timeHmsToSeconds
 *   - monotonicize
 *   - normalizeRaw
 *   - escapeHtml
 *   - truncateLabel
 *   - parseContentLine
 *   - parseVtt
 *   - parseTxt
 *   - parseTranscript (dispatcher)
 *   - mergeUtterances
 *   - computeMetrics
 *   - wordFrequencies / buildSpeakerText / pairsToTermsText
 *   - parseFilenameForDate
 *   - formatTranscriptForPrompt / buildPrompt
 */

const {
  timeToSeconds,
  timeHmsToSeconds,
  monotonicize,
  normalizeRaw,
  escapeHtml,
  truncateLabel,
  parseContentLine,
  parseVtt,
  parseTxt,
  parseTranscript,
  mergeUtterances,
  computeMetrics,
  wordFrequencies,
  buildSpeakerText,
  pairsToTermsText,
  parseFilenameForDate,
  formatTranscriptForPrompt,
  buildPrompt,
  STOPWORDS,
  PROMPT_TEMPLATES
} = require("../logic.js");

// Suppress debug console.log output from parseTxt during tests
beforeAll(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
});
afterAll(() => {
  console.log.mockRestore();
});

// ---------------------------------------------------------------------------
// timeToSeconds
// ---------------------------------------------------------------------------
describe("timeToSeconds", () => {
  test("parses zero timestamp", () => {
    expect(timeToSeconds("00:00:00.000")).toBe(0);
  });

  test("parses seconds only", () => {
    expect(timeToSeconds("00:00:01.000")).toBe(1);
  });

  test("parses minutes", () => {
    expect(timeToSeconds("00:01:00.000")).toBe(60);
  });

  test("parses hours", () => {
    expect(timeToSeconds("01:00:00.000")).toBe(3600);
  });

  test("parses milliseconds", () => {
    expect(timeToSeconds("00:00:01.500")).toBeCloseTo(1.5);
  });

  test("parses combined h/m/s/ms", () => {
    // 1h 23m 45s 678ms
    expect(timeToSeconds("01:23:45.678")).toBeCloseTo(3600 + 23 * 60 + 45 + 0.678);
  });

  test("handles large hour values", () => {
    expect(timeToSeconds("10:00:00.000")).toBe(36000);
  });
});

// ---------------------------------------------------------------------------
// timeHmsToSeconds
// ---------------------------------------------------------------------------
describe("timeHmsToSeconds", () => {
  test("zero values", () => {
    expect(timeHmsToSeconds(0, 0, 0)).toBe(0);
  });

  test("seconds only", () => {
    expect(timeHmsToSeconds(0, 0, 45)).toBe(45);
  });

  test("minutes and seconds", () => {
    expect(timeHmsToSeconds(0, 5, 30)).toBe(330);
  });

  test("hours minutes seconds", () => {
    expect(timeHmsToSeconds(1, 2, 3)).toBe(3723);
  });

  test("accepts string arguments (from regex captures)", () => {
    expect(timeHmsToSeconds("01", "02", "03")).toBe(3723);
  });
});

// ---------------------------------------------------------------------------
// monotonicize
// ---------------------------------------------------------------------------
describe("monotonicize", () => {
  test("returns value unchanged when ahead of lastSeconds", () => {
    expect(monotonicize(100, 50)).toBe(100);
  });

  test("returns value unchanged when equal to lastSeconds", () => {
    expect(monotonicize(100, 100)).toBe(100);
  });

  test("adds 24h when time went backwards (midnight crossing)", () => {
    const midnightSeconds = 24 * 3600;
    // 5 seconds into next day vs 23:59:55 (86395s)
    expect(monotonicize(5, 86395)).toBe(5 + midnightSeconds);
  });

  test("adds multiple 24h cycles if needed", () => {
    // Artificially large lastSeconds
    const result = monotonicize(0, 200000);
    expect(result).toBeGreaterThan(200000);
    expect(result % (24 * 3600)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// normalizeRaw
// ---------------------------------------------------------------------------
describe("normalizeRaw", () => {
  test("passes through clean text unchanged", () => {
    expect(normalizeRaw("hello\nworld")).toBe("hello\nworld");
  });

  test("removes UTF-8 BOM", () => {
    expect(normalizeRaw("\uFEFFhello")).toBe("hello");
  });

  test("normalizes CRLF to LF", () => {
    expect(normalizeRaw("line1\r\nline2")).toBe("line1\nline2");
  });

  test("normalizes bare CR to LF", () => {
    expect(normalizeRaw("line1\rline2")).toBe("line1\nline2");
  });

  test("handles combined BOM and CRLF", () => {
    expect(normalizeRaw("\uFEFFline1\r\nline2")).toBe("line1\nline2");
  });

  test("empty string stays empty", () => {
    expect(normalizeRaw("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// escapeHtml
// ---------------------------------------------------------------------------
describe("escapeHtml", () => {
  test("leaves plain text unchanged", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
  });

  test("escapes ampersand", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  test("escapes less-than", () => {
    expect(escapeHtml("a < b")).toBe("a &lt; b");
  });

  test("escapes greater-than", () => {
    expect(escapeHtml("a > b")).toBe("a &gt; b");
  });

  test("escapes double quote", () => {
    expect(escapeHtml('say "hi"')).toBe("say &quot;hi&quot;");
  });

  test("escapes multiple special characters", () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"
    );
  });

  test("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// truncateLabel
// ---------------------------------------------------------------------------
describe("truncateLabel", () => {
  test("short name returned unchanged", () => {
    expect(truncateLabel("Alice")).toBe("Alice");
  });

  test("name exactly at default limit (18) returned unchanged", () => {
    const name = "A".repeat(18);
    expect(truncateLabel(name)).toBe(name);
  });

  test("name one over limit is truncated with ellipsis", () => {
    const name = "A".repeat(19);
    expect(truncateLabel(name)).toBe("A".repeat(17) + "…");
  });

  test("truncates long name with ellipsis", () => {
    const name = "VeryLongSpeakerNameHere";
    const result = truncateLabel(name);
    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBe(18); // maxLen default
  });

  test("custom maxLen respected", () => {
    const result = truncateLabel("ABCDEFGHIJ", 5);
    expect(result).toBe("ABCD…");
    expect(result.length).toBe(5);
  });

  test("name shorter than custom maxLen returned unchanged", () => {
    expect(truncateLabel("Hi", 10)).toBe("Hi");
  });
});

// ---------------------------------------------------------------------------
// parseContentLine
// ---------------------------------------------------------------------------
describe("parseContentLine", () => {
  test("splits speaker and text on first colon", () => {
    const result = parseContentLine("Alice: Hello there");
    expect(result.speaker).toBe("Alice");
    expect(result.text).toBe("Hello there");
  });

  test("trims whitespace from speaker", () => {
    const result = parseContentLine("  Bob : Hi");
    expect(result.speaker).toBe("Bob");
  });

  test("returns 'Unknown' speaker when no colon present", () => {
    const result = parseContentLine("No colon here");
    expect(result.speaker).toBe("Unknown");
    expect(result.text).toBe("No colon here");
  });

  test("handles multiple colons – only first split", () => {
    const result = parseContentLine("Alice: Hello: world");
    expect(result.speaker).toBe("Alice");
    expect(result.text).toBe("Hello: world");
  });

  test("handles empty text after colon", () => {
    const result = parseContentLine("Alice:");
    expect(result.speaker).toBe("Alice");
    expect(result.text).toBe("");
  });

  test("handles empty string (no colon)", () => {
    const result = parseContentLine("");
    expect(result.speaker).toBe("Unknown");
    expect(result.text).toBe("");
  });
});

// ---------------------------------------------------------------------------
// parseVtt
// ---------------------------------------------------------------------------
describe("parseVtt", () => {
  const BASIC_VTT = `WEBVTT

00:00:01.000 --> 00:00:05.000
Alice: Hello everyone

00:00:06.000 --> 00:00:10.000
Bob: Hi Alice
`;

  test("returns empty array for empty string", () => {
    expect(parseVtt("")).toEqual([]);
  });

  test("returns empty array for string with no timestamps", () => {
    expect(parseVtt("Just some text\nWith no cues")).toEqual([]);
  });

  test("parses basic two-speaker VTT", () => {
    const result = parseVtt(BASIC_VTT);
    expect(result).toHaveLength(2);
  });

  test("first cue has correct speaker and text", () => {
    const [first] = parseVtt(BASIC_VTT);
    expect(first.speaker).toBe("Alice");
    expect(first.text).toBe("Hello everyone");
  });

  test("first cue has correct timestamps", () => {
    const [first] = parseVtt(BASIC_VTT);
    expect(first.start).toBeCloseTo(1);
    expect(first.end).toBeCloseTo(5);
  });

  test("second cue parsed correctly", () => {
    const [, second] = parseVtt(BASIC_VTT);
    expect(second.speaker).toBe("Bob");
    expect(second.text).toBe("Hi Alice");
    expect(second.start).toBeCloseTo(6);
    expect(second.end).toBeCloseTo(10);
  });

  test("assigns 'Unknown' speaker when content line has no colon", () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:05.000
No speaker colon here
`;
    const result = parseVtt(vtt);
    expect(result[0].speaker).toBe("Unknown");
  });

  test("handles Windows-style CRLF line endings", () => {
    const vtt = "WEBVTT\r\n\r\n00:00:01.000 --> 00:00:05.000\r\nAlice: Hello\r\n";
    const result = parseVtt(vtt);
    expect(result).toHaveLength(1);
    expect(result[0].speaker).toBe("Alice");
  });

  test("handles multiple blank lines between cues", () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:05.000
Alice: First


00:00:06.000 --> 00:00:10.000
Bob: Second
`;
    const result = parseVtt(vtt);
    expect(result).toHaveLength(2);
  });

  test("ignores cue sequence numbers", () => {
    const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:05.000
Alice: Cue one

2
00:00:06.000 --> 00:00:10.000
Bob: Cue two
`;
    const result = parseVtt(vtt);
    expect(result).toHaveLength(2);
    expect(result[0].speaker).toBe("Alice");
  });

  test("speaker with spaces in name", () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:05.000
John Smith: How are you?
`;
    const result = parseVtt(vtt);
    expect(result[0].speaker).toBe("John Smith");
    expect(result[0].text).toBe("How are you?");
  });

  test("skips cue when no content line follows timestamp", () => {
    // Timestamp at last line with no content
    const vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:05.000\n";
    const result = parseVtt(vtt);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// parseTxt
// ---------------------------------------------------------------------------
describe("parseTxt", () => {
  const BASIC_TXT = `[Alice] 00:00:01
Hello everyone, welcome to the meeting.

[Bob] 00:00:10
Thanks Alice, glad to be here.
`;

  test("returns empty array for empty string", () => {
    expect(parseTxt("")).toEqual([]);
  });

  test("returns empty array when no TXT headers found", () => {
    expect(parseTxt("Just plain text with no headers.")).toEqual([]);
  });

  test("parses basic two-speaker TXT", () => {
    const result = parseTxt(BASIC_TXT);
    expect(result).toHaveLength(2);
  });

  test("first block has correct speaker", () => {
    const [first] = parseTxt(BASIC_TXT);
    expect(first.speaker).toBe("Alice");
  });

  test("first block has correct start time", () => {
    const [first] = parseTxt(BASIC_TXT);
    expect(first.start).toBe(1);
  });

  test("first block end time equals next block start time", () => {
    const [first, second] = parseTxt(BASIC_TXT);
    expect(first.end).toBe(second.start);
  });

  test("last block gets default 2-second tail", () => {
    const [, last] = parseTxt(BASIC_TXT);
    expect(last.end).toBe(last.start + 2);
  });

  test("collects multi-line text into single text string", () => {
    const txt = `[Alice] 00:00:01
Line one.
Line two.

[Bob] 00:00:15
Single line.
`;
    const [first] = parseTxt(txt);
    expect(first.text).toBe("Line one. Line two.");
  });

  test("handles BOM prefix", () => {
    const txt = "\uFEFF[Alice] 00:00:01\nHello.\n";
    const result = parseTxt(txt);
    expect(result).toHaveLength(1);
    expect(result[0].speaker).toBe("Alice");
  });

  test("handles CRLF line endings", () => {
    const txt = "[Alice] 00:00:01\r\nHello.\r\n\r\n[Bob] 00:00:10\r\nHi.\r\n";
    const result = parseTxt(txt);
    expect(result).toHaveLength(2);
  });

  test("skips blocks with no text content", () => {
    const txt = `[Alice] 00:00:01

[Bob] 00:00:10
Hi there.
`;
    const result = parseTxt(txt);
    expect(result).toHaveLength(1);
    expect(result[0].speaker).toBe("Bob");
  });

  test("handles clock that crosses midnight (monotonicize)", () => {
    // Second timestamp is less than first (midnight crossing)
    const txt = `[Alice] 23:59:55
End of day.

[Bob] 00:00:05
New day.
`;
    const result = parseTxt(txt);
    expect(result).toHaveLength(2);
    // Bob's start must be after Alice's (monotonicize applied)
    expect(result[1].start).toBeGreaterThan(result[0].start);
  });

  test("speaker names with spaces are preserved", () => {
    const txt = `[Jane Doe] 00:01:00
Hello.
`;
    const result = parseTxt(txt);
    expect(result[0].speaker).toBe("Jane Doe");
  });

  test("adjacent headers without blank line between them are split correctly", () => {
    // Some transcript exports omit the blank line between blocks.
    // The TXT_HEADER_RE early-stop branch breaks text collection when the next line
    // is itself a header.
    const txt = `[Alice] 00:00:01
Hello there.
[Bob] 00:00:10
Hi Alice.
`;
    const result = parseTxt(txt);
    expect(result).toHaveLength(2);
    expect(result[0].speaker).toBe("Alice");
    expect(result[0].text).toBe("Hello there.");
    expect(result[1].speaker).toBe("Bob");
    expect(result[1].text).toBe("Hi Alice.");
  });
});

// ---------------------------------------------------------------------------
// parseTranscript (dispatcher)
// ---------------------------------------------------------------------------
describe("parseTranscript", () => {
  test("returns empty array for empty string", () => {
    expect(parseTranscript("")).toEqual([]);
  });

  test("detects and parses VTT format", () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:05.000
Alice: Hello
`;
    const result = parseTranscript(vtt);
    expect(result).toHaveLength(1);
    expect(result[0].speaker).toBe("Alice");
  });

  test("falls through to TXT parser for TXT format", () => {
    const txt = `[Alice] 00:00:01
Hello from TXT.
`;
    const result = parseTranscript(txt);
    expect(result).toHaveLength(1);
    expect(result[0].speaker).toBe("Alice");
    expect(result[0].text).toBe("Hello from TXT.");
  });

  test("returns empty array for unrecognized format", () => {
    expect(parseTranscript("This is just random text with no format.")).toEqual([]);
  });

  test("parses VTT that starts directly with a timestamp (no WEBVTT header)", () => {
    // TIMESTAMP_RE anchors to start-of-string (no /m flag), so this triggers the
    // fast VTT path (lines 188-189, true branch).
    const raw = `00:00:01.000 --> 00:00:05.000
Alice: Hello directly
`;
    const result = parseTranscript(raw);
    expect(result).toHaveLength(1);
    expect(result[0].speaker).toBe("Alice");
    expect(result[0].text).toBe("Hello directly");
    expect(result[0].start).toBe(1);
    expect(result[0].end).toBe(5);
  });

  test("falls through when timestamp-starting input has no cue content", () => {
    // TIMESTAMP_RE matches (starts with timestamp), but parseVtt returns [] because
    // there is no content line after the timestamp. Covers the false branch of
    // `if (vtt.length)` on line 189 and the full fallthrough to return [].
    const raw = "00:00:01.000 --> 00:00:05.000\n";
    const result = parseTranscript(raw);
    expect(result).toEqual([]);
  });

  test("VTT result has start/end in seconds (not strings)", () => {
    const vtt = `WEBVTT

00:00:30.000 --> 00:00:35.000
Alice: Test
`;
    const [u] = parseTranscript(vtt);
    expect(typeof u.start).toBe("number");
    expect(typeof u.end).toBe("number");
    expect(u.start).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// mergeUtterances
// ---------------------------------------------------------------------------
describe("mergeUtterances", () => {
  test("returns empty array for empty input", () => {
    expect(mergeUtterances([])).toEqual([]);
  });

  test("single utterance returned as-is", () => {
    const u = [{ speaker: "Alice", start: 0, end: 5, text: "Hi" }];
    const result = mergeUtterances(u);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(u[0]);
  });

  test("two utterances from different speakers not merged", () => {
    const u = [
      { speaker: "Alice", start: 0, end: 5, text: "Hi" },
      { speaker: "Bob", start: 5, end: 10, text: "Hello" }
    ];
    expect(mergeUtterances(u)).toHaveLength(2);
  });

  test("two consecutive utterances from same speaker are merged", () => {
    const u = [
      { speaker: "Alice", start: 0, end: 5, text: "Hello" },
      { speaker: "Alice", start: 5, end: 10, text: "world" }
    ];
    const result = mergeUtterances(u);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Hello world");
    expect(result[0].start).toBe(0);
    expect(result[0].end).toBe(10);
  });

  test("interleaved speakers produce correct groups", () => {
    const u = [
      { speaker: "Alice", start: 0, end: 5, text: "A1" },
      { speaker: "Bob", start: 5, end: 10, text: "B1" },
      { speaker: "Alice", start: 10, end: 15, text: "A2" },
      { speaker: "Alice", start: 15, end: 20, text: "A3" }
    ];
    const result = mergeUtterances(u);
    expect(result).toHaveLength(3);
    expect(result[2].text).toBe("A2 A3");
    expect(result[2].end).toBe(20);
  });

  test("does not mutate original utterances array", () => {
    const u = [
      { speaker: "Alice", start: 0, end: 5, text: "Hi" },
      { speaker: "Alice", start: 5, end: 10, text: "there" }
    ];
    const copy = JSON.parse(JSON.stringify(u));
    mergeUtterances(u);
    expect(u).toEqual(copy);
  });
});

// ---------------------------------------------------------------------------
// computeMetrics
// ---------------------------------------------------------------------------
describe("computeMetrics", () => {
  const SINGLE_SPEAKER = [
    { speaker: "Alice", start: 0, end: 60, text: "one two three four five" }
  ];

  const TWO_SPEAKERS = [
    { speaker: "Alice", start: 0, end: 30, text: "hello world" },
    { speaker: "Bob", start: 30, end: 60, text: "hi there friend" }
  ];

  test("single speaker – meetingDuration correct", () => {
    const { meetingDuration } = computeMetrics(SINGLE_SPEAKER);
    expect(meetingDuration).toBe(60);
  });

  test("single speaker – totalWords correct", () => {
    const { totalWords } = computeMetrics(SINGLE_SPEAKER);
    expect(totalWords).toBe(5);
  });

  test("single speaker – speakerStats has one entry", () => {
    const { speakerStats } = computeMetrics(SINGLE_SPEAKER);
    expect(speakerStats).toHaveLength(1);
    expect(speakerStats[0].speaker).toBe("Alice");
  });

  test("single speaker – wordShare is 1.0 (100%)", () => {
    const { speakerStats } = computeMetrics(SINGLE_SPEAKER);
    expect(speakerStats[0].wordShare).toBeCloseTo(1.0);
  });

  test("single speaker – timeShare is 1.0 (100%)", () => {
    const { speakerStats } = computeMetrics(SINGLE_SPEAKER);
    expect(speakerStats[0].timeShare).toBeCloseTo(1.0);
  });

  test("single speaker – turns count correct", () => {
    const { speakerStats } = computeMetrics(SINGLE_SPEAKER);
    expect(speakerStats[0].turns).toBe(1);
  });

  test("two speakers – meetingDuration correct", () => {
    const { meetingDuration } = computeMetrics(TWO_SPEAKERS);
    expect(meetingDuration).toBe(60);
  });

  test("two speakers – totalWords correct", () => {
    const { totalWords } = computeMetrics(TWO_SPEAKERS);
    expect(totalWords).toBe(5); // 2 + 3
  });

  test("two speakers – word shares sum to 1.0", () => {
    const { speakerStats } = computeMetrics(TWO_SPEAKERS);
    const totalShare = speakerStats.reduce((s, sp) => s + sp.wordShare, 0);
    expect(totalShare).toBeCloseTo(1.0);
  });

  test("two speakers – time shares sum to 1.0", () => {
    const { speakerStats } = computeMetrics(TWO_SPEAKERS);
    const totalShare = speakerStats.reduce((s, sp) => s + sp.timeShare, 0);
    expect(totalShare).toBeCloseTo(1.0);
  });

  test("counts multiple turns for same speaker correctly", () => {
    const utterances = [
      { speaker: "Alice", start: 0, end: 10, text: "hello" },
      { speaker: "Bob", start: 10, end: 20, text: "hi" },
      { speaker: "Alice", start: 20, end: 30, text: "bye" }
    ];
    const { speakerStats } = computeMetrics(utterances);
    const alice = speakerStats.find(s => s.speaker === "Alice");
    expect(alice.turns).toBe(2);
    expect(alice.words).toBe(2);
  });

  test("longestTurn tracks longest single utterance duration", () => {
    const utterances = [
      { speaker: "Alice", start: 0, end: 5, text: "short" },
      { speaker: "Alice", start: 5, end: 25, text: "longer one" }
    ];
    const { speakerStats } = computeMetrics(utterances);
    expect(speakerStats[0].longestTurn).toBe(20);
  });

  test("negative duration clamped to 0 (end before start)", () => {
    const utterances = [
      { speaker: "Alice", start: 10, end: 5, text: "bad timing" }
    ];
    const { speakerStats } = computeMetrics(utterances);
    expect(speakerStats[0].time).toBe(0);
  });

  test("wordShare is 0 when total words is 0", () => {
    const utterances = [
      { speaker: "Alice", start: 0, end: 10, text: "" }
    ];
    const { speakerStats } = computeMetrics(utterances);
    expect(speakerStats[0].wordShare).toBe(0);
  });

  test("timeShare is 0 when meeting duration is 0 (all utterances at same instant)", () => {
    const utterances = [
      { speaker: "Alice", start: 5, end: 5, text: "instant" }
    ];
    const { speakerStats, meetingDuration } = computeMetrics(utterances);
    expect(meetingDuration).toBe(0);
    expect(speakerStats[0].timeShare).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// wordFrequencies
// ---------------------------------------------------------------------------
describe("wordFrequencies", () => {
  test("empty string returns empty map", () => {
    expect(wordFrequencies("").size).toBe(0);
  });

  test("counts a simple word", () => {
    const freq = wordFrequencies("hello");
    expect(freq.get("hello")).toBe(1);
  });

  test("is case-insensitive", () => {
    const freq = wordFrequencies("Hello HELLO hello");
    expect(freq.get("hello")).toBe(3);
  });

  test("strips punctuation", () => {
    const freq = wordFrequencies("hello, world!");
    expect(freq.has("hello")).toBe(true);
    expect(freq.has("world")).toBe(true);
  });

  test("filters out stopwords", () => {
    const freq = wordFrequencies("the and a to is");
    expect(freq.size).toBe(0);
  });

  test("filters out single-character tokens", () => {
    const freq = wordFrequencies("a b c hello");
    expect(freq.has("a")).toBe(false);
    expect(freq.has("b")).toBe(false);
    expect(freq.has("hello")).toBe(true);
  });

  test("counts multiple occurrences", () => {
    const freq = wordFrequencies("project project project meeting");
    expect(freq.get("project")).toBe(3);
    expect(freq.get("meeting")).toBe(1);
  });

  test("handles numbers as tokens", () => {
    const freq = wordFrequencies("item 42 item");
    expect(freq.get("42")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// buildSpeakerText
// ---------------------------------------------------------------------------
describe("buildSpeakerText", () => {
  test("empty utterances returns empty map", () => {
    expect(buildSpeakerText([])).toEqual(new Map());
  });

  test("single utterance creates entry for speaker", () => {
    const u = [{ speaker: "Alice", text: "Hello" }];
    const map = buildSpeakerText(u);
    expect(map.has("Alice")).toBe(true);
    expect(map.get("Alice")).toContain("Hello");
  });

  test("multiple utterances from same speaker are concatenated", () => {
    const u = [
      { speaker: "Alice", text: "Hello" },
      { speaker: "Alice", text: "world" }
    ];
    const map = buildSpeakerText(u);
    const text = map.get("Alice");
    expect(text).toContain("Hello");
    expect(text).toContain("world");
  });

  test("different speakers get separate entries", () => {
    const u = [
      { speaker: "Alice", text: "Hello" },
      { speaker: "Bob", text: "Hi there" }
    ];
    const map = buildSpeakerText(u);
    expect(map.size).toBe(2);
    expect(map.get("Alice")).toContain("Hello");
    expect(map.get("Bob")).toContain("Hi there");
  });
});

// ---------------------------------------------------------------------------
// pairsToTermsText
// ---------------------------------------------------------------------------
describe("pairsToTermsText", () => {
  const pairs = [
    ["project", 10],
    ["meeting", 7],
    ["agenda", 5]
  ];

  test("formats pairs as 'word (count)' joined by comma+space", () => {
    expect(pairsToTermsText(pairs)).toBe("project (10), meeting (7), agenda (5)");
  });

  test("respects default limit of 12", () => {
    const many = Array.from({ length: 20 }, (_, i) => [`word${i}`, i]);
    const result = pairsToTermsText(many);
    const items = result.split(", ");
    expect(items).toHaveLength(12);
  });

  test("respects custom limit", () => {
    const result = pairsToTermsText(pairs, 2);
    const items = result.split(", ");
    expect(items).toHaveLength(2);
    expect(result).toBe("project (10), meeting (7)");
  });

  test("empty pairs returns empty string", () => {
    expect(pairsToTermsText([])).toBe("");
  });

  test("fewer pairs than limit returns all", () => {
    const result = pairsToTermsText(pairs, 100);
    expect(result.split(", ")).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// parseFilenameForDate
// ---------------------------------------------------------------------------
describe("parseFilenameForDate", () => {
  test("returns null when no GMT date pattern found", () => {
    expect(parseFilenameForDate("meeting.vtt")).toBeNull();
    expect(parseFilenameForDate("")).toBeNull();
    expect(parseFilenameForDate("recording_2022.vtt")).toBeNull();
  });

  test("parses standard Zoom filename format", () => {
    const result = parseFilenameForDate("GMT20220401-170425_Recording.transcript.vtt");
    expect(result).toBe("01/04/2022 17:04");
  });

  test("parses another date from Zoom filename", () => {
    const result = parseFilenameForDate("GMT20231225-090000_Meeting.vtt");
    expect(result).toBe("25/12/2023 09:00");
  });

  test("extracts date from full path", () => {
    const result = parseFilenameForDate("downloads/GMT20220601-130000_Standup.vtt");
    expect(result).toBe("01/06/2022 13:00");
  });
});

// ---------------------------------------------------------------------------
// formatTranscriptForPrompt
// ---------------------------------------------------------------------------
describe("formatTranscriptForPrompt", () => {
  test("returns empty string for empty array", () => {
    expect(formatTranscriptForPrompt([])).toBe("");
  });

  test("formats single utterance as 'Speaker: text'", () => {
    const u = [{ speaker: "Alice", text: "Hello there" }];
    expect(formatTranscriptForPrompt(u)).toBe("Alice: Hello there");
  });

  test("joins multiple utterances with double newline", () => {
    const u = [
      { speaker: "Alice", text: "Hello" },
      { speaker: "Bob", text: "Hi" }
    ];
    expect(formatTranscriptForPrompt(u)).toBe("Alice: Hello\n\nBob: Hi");
  });

  test("preserves speaker names exactly", () => {
    const u = [{ speaker: "Dr. Jane Smith", text: "Good morning." }];
    expect(formatTranscriptForPrompt(u)).toContain("Dr. Jane Smith:");
  });
});

// ---------------------------------------------------------------------------
// buildPrompt
// ---------------------------------------------------------------------------
describe("buildPrompt", () => {
  const utterances = [
    { speaker: "Alice", text: "We should discuss the roadmap." },
    { speaker: "Bob", text: "Agreed, let me share my thoughts." }
  ];

  test("returns empty string for unknown template key", () => {
    expect(buildPrompt("nonexistent", utterances)).toBe("");
  });

  test("returns empty string for empty template key", () => {
    expect(buildPrompt("", utterances)).toBe("");
  });

  test("summary template includes transcript content", () => {
    const prompt = buildPrompt("summary", utterances);
    expect(prompt).toContain("Alice: We should discuss the roadmap.");
    expect(prompt).toContain("Bob: Agreed, let me share my thoughts.");
  });

  test("summary template includes role instruction", () => {
    const prompt = buildPrompt("summary", utterances);
    expect(prompt).toContain("# Role");
    expect(prompt).toContain("Executive Assistant");
  });

  test("actions template contains task extraction instructions", () => {
    const prompt = buildPrompt("actions", utterances);
    expect(prompt).toContain("action item");
    expect(prompt).toContain("Alice:");
  });

  test("perspectives template contains perspectives instruction", () => {
    const prompt = buildPrompt("perspectives", utterances);
    expect(prompt).toContain("perspectives");
  });

  test("nextmeeting template contains forward-looking instructions", () => {
    const prompt = buildPrompt("nextmeeting", utterances);
    expect(prompt).toContain("next meeting");
  });

  test("tips template contains facilitation instructions", () => {
    const prompt = buildPrompt("tips", utterances);
    expect(prompt).toContain("facilitation");
  });

  test("all defined template keys produce non-empty output", () => {
    for (const key of Object.keys(PROMPT_TEMPLATES)) {
      const prompt = buildPrompt(key, utterances);
      expect(prompt.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// STOPWORDS constant
// ---------------------------------------------------------------------------
describe("STOPWORDS", () => {
  test("is a Set", () => {
    expect(STOPWORDS).toBeInstanceOf(Set);
  });

  test("contains common English stopwords", () => {
    expect(STOPWORDS.has("the")).toBe(true);
    expect(STOPWORDS.has("and")).toBe(true);
    expect(STOPWORDS.has("is")).toBe(true);
  });

  test("contains filler words", () => {
    expect(STOPWORDS.has("um")).toBe(true);
    expect(STOPWORDS.has("uh")).toBe(true);
    expect(STOPWORDS.has("yeah")).toBe(true);
  });

  test("does not contain content words", () => {
    expect(STOPWORDS.has("project")).toBe(false);
    expect(STOPWORDS.has("meeting")).toBe(false);
    expect(STOPWORDS.has("deadline")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integration: full parse → merge → metrics pipeline
// ---------------------------------------------------------------------------
describe("Integration: VTT parse → merge → metrics", () => {
  const VTT = `WEBVTT

00:00:00.000 --> 00:00:05.000
Alice: Good morning everyone.

00:00:05.000 --> 00:00:08.000
Bob: Morning!

00:00:08.000 --> 00:00:15.000
Alice: Let us get started.

00:00:15.000 --> 00:00:25.000
Bob: Sure, I have a few items to cover.
`;

  test("produces expected speaker count", () => {
    const utterances = parseVtt(VTT);
    const merged = mergeUtterances(utterances);
    const { speakerStats } = computeMetrics(merged);
    expect(speakerStats).toHaveLength(2);
  });

  test("Alice NOT merged because Bob is between her turns", () => {
    // Alice → Bob → Alice: the two Alice blocks are not adjacent, so no merge
    const utterances = parseVtt(VTT);
    const merged = mergeUtterances(utterances);
    expect(merged.filter(u => u.speaker === "Alice")).toHaveLength(2);
  });

  test("meetingDuration matches VTT timestamps", () => {
    const utterances = parseVtt(VTT);
    const merged = mergeUtterances(utterances);
    const { meetingDuration } = computeMetrics(merged);
    expect(meetingDuration).toBe(25);
  });

  test("word shares sum to 1.0", () => {
    const utterances = parseVtt(VTT);
    const merged = mergeUtterances(utterances);
    const { speakerStats } = computeMetrics(merged);
    const total = speakerStats.reduce((s, sp) => s + sp.wordShare, 0);
    expect(total).toBeCloseTo(1.0);
  });
});

describe("Integration: TXT parse → merge → metrics", () => {
  const TXT = `[Alice] 00:00:00
Good morning everyone.

[Bob] 00:00:05
Morning, glad to be here.

[Alice] 00:00:10
Let us get started with the agenda.
`;

  test("parses TXT and produces utterances", () => {
    const utterances = parseTxt(TXT);
    expect(utterances).toHaveLength(3);
  });

  test("Alice appears twice before merge", () => {
    const utterances = parseTxt(TXT);
    expect(utterances.filter(u => u.speaker === "Alice")).toHaveLength(2);
  });

  test("Alice merged into single block when adjacent... but not here", () => {
    // Alice is NOT adjacent (Bob is in between), so stays as 2 entries
    const utterances = parseTxt(TXT);
    const merged = mergeUtterances(utterances);
    expect(merged.filter(u => u.speaker === "Alice")).toHaveLength(2);
  });

  test("word frequencies computed over merged transcript", () => {
    const utterances = parseTxt(TXT);
    const merged = mergeUtterances(utterances);
    let allText = "";
    for (const u of merged) allText += " " + u.text;
    const freq = wordFrequencies(allText);
    expect(freq.size).toBeGreaterThan(0);
    // "morning" appears twice
    expect(freq.get("morning")).toBe(2);
  });
});
