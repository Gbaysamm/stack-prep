import { describe, expect, it } from "vitest";

import { poseOf, rpPhoneme, RP_PHONEMES, SHAPES } from "./mouthShapes.js";
import { ANTICIPATE_MAX_S, ANTICIPATE_MIN_S, poseAt, speechFor, type Phone } from "./mouthTimeline.js";

/** "enclosure" in RP, /ɪnˈkləʊʒə/, timed as a voice might say it. */
const ENCLOSURE: Phone[] = [
  { p: "ɪ", start: 0.1, end: 0.16, w: 0 },
  { p: "n", start: 0.16, end: 0.22, w: 0 },
  { p: "k", start: 0.22, end: 0.3, w: 0 },
  { p: "l", start: 0.3, end: 0.37, w: 0 },
  { p: "əʊ", start: 0.37, end: 0.55, w: 0 },
  { p: "ʒ", start: 0.55, end: 0.66, w: 0 },
  { p: "ə", start: 0.66, end: 0.8, w: 0 },
];

const mid = (phone: Phone) => (phone.start + phone.end) / 2;

describe("the RP shape table", () => {
  it("has a shape, with a source, for every one of the 44 phonemes", () => {
    expect(RP_PHONEMES).toHaveLength(44);
    for (const p of RP_PHONEMES) {
      expect(SHAPES[p], p).toBeDefined();
      expect(SHAPES[p]!.src.length, p).toBeGreaterThan(10);
      expect(rpPhoneme(p)).toBe(p);
    }
  });

  it("protrudes the lips more for ʃ and ʒ than for s and z, and rounds them a little", () => {
    expect(poseOf("ʃ").protrude).toBeGreaterThan(poseOf("s").protrude + 0.5);
    expect(poseOf("ʒ").protrude).toBeGreaterThan(poseOf("z").protrude + 0.5);
    expect(poseOf("ʃ").round).toBeGreaterThan(poseOf("s").round);
    expect(poseOf("tʃ", 0.9).protrude).toBeGreaterThan(poseOf("t").protrude);
    expect(poseOf("dʒ", 0.1).protrude).toBeGreaterThan(poseOf("d").protrude);
  });

  it("closes the lips for p, b and m only", () => {
    for (const p of ["p", "b", "m"]) expect(poseOf(p).close, p).toBe(1);
    for (const p of RP_PHONEMES.filter((one) => !["p", "b", "m"].includes(one)))
      expect(poseOf(p, 0).close + poseOf(p, 1).close, p).toBe(0);
  });

  it("puts the lower lip to the teeth for f v and the tongue between the teeth for θ ð", () => {
    for (const p of ["f", "v"]) expect(poseOf(p).labiodental).toBe(1);
    for (const p of ["θ", "ð"]) expect(poseOf(p).interdental).toBe(1);
  });

  it("rounds uː and w more than iː, which spreads", () => {
    expect(poseOf("uː").round).toBeGreaterThan(poseOf("iː").round + 0.8);
    expect(poseOf("w").round).toBeGreaterThan(poseOf("iː").round + 0.8);
    expect(poseOf("iː").spread).toBeGreaterThan(poseOf("uː").spread + 0.8);
  });

  it("moves a diphthong between its two targets", () => {
    expect(poseOf("əʊ", 0).round).toBeLessThan(0.35);
    expect(poseOf("əʊ", 1).round).toBeGreaterThan(0.5);
    expect(poseOf("aɪ", 0).jaw).toBeGreaterThan(poseOf("aɪ", 1).jaw + 0.4);
  });

  it("marks voicing as the plan lists it", () => {
    const voiced = "b d g v ð z ʒ dʒ m n ŋ l r w j".split(" ");
    const voiceless = "p t k f θ s ʃ h tʃ".split(" ");
    for (const p of voiced) expect(SHAPES[p]!.voiced, p).toBe(true);
    for (const p of voiceless) expect(SHAPES[p]!.voiced, p).toBe(false);
    for (const p of RP_PHONEMES.slice(0, 20)) expect(SHAPES[p]!.voiced, p).toBe(true);
  });
});

describe("unknown symbols", () => {
  it("map to the nearest RP phoneme and never break", () => {
    expect(rpPhoneme("i:")).toBe("iː");
    expect(rpPhoneme("u:")).toBe("uː");
    expect(rpPhoneme("ɑ")).toBe("ɑː");
    expect(rpPhoneme("oʊ")).toBe("əʊ");
    expect(rpPhoneme("ɚ")).toBe("ə");
    expect(rpPhoneme("ɝ")).toBe("ɜː");
    expect(rpPhoneme("ɹ")).toBe("r");
    expect(rpPhoneme("ɾ")).toBe("t");
    expect(rpPhoneme("ʧ")).toBe("tʃ");
    expect(rpPhoneme("ʤ")).toBe("dʒ");
    expect(rpPhoneme("ɡ")).toBe("g");
    expect(rpPhoneme("ˈæ")).toBe("æ");
    expect(rpPhoneme("n̩")).toBe("n");
    expect(rpPhoneme("")).toBe("");
    expect(rpPhoneme(null)).toBe("");
    for (const odd of ["Q", "☃", "ʘ", "xyz", "ɘː", "1"]) {
      const rp = rpPhoneme(odd);
      expect(RP_PHONEMES, odd).toContain(rp);
      expect(() => poseOf(odd)).not.toThrow();
    }
  });

  it("are drawn by the timeline without breaking it", () => {
    const speech = speechFor([{ p: "☃", start: 0, end: 0.1 }, { p: "ɐ", start: 0.1, end: 0.2 }], [0, 0.2], null, null);
    expect(poseAt(speech, 0.05).p).toBe("ə");
    expect(poseAt(speech, 0.15).p).toBe("ə");
  });
});

describe("the timeline for 'enclosure'", () => {
  const speech = speechFor(ENCLOSURE, [0.1, 0.8], null, null, [0, 0]);

  it("says its sounds in order", () => {
    expect(speech.phones).toHaveLength(7);
    expect(ENCLOSURE.map((phone) => poseAt(speech, mid(phone)).p)).toEqual(["ɪ", "n", "k", "l", "əʊ", "ʒ", "ə"]);
    expect(poseAt(speech, 0.05).p).toBe("");
    expect(poseAt(speech, 0.95).p).toBe("");
  });

  it("never closes the lips: it has no p, b or m", () => {
    for (let t = 0.1; t < 0.8; t += 0.005) expect(poseAt(speech, t).pose.close, `t=${t}`).toBe(0);
  });

  it("protrudes the lips most on ʒ", () => {
    const at = ENCLOSURE.map((phone) => poseAt(speech, mid(phone)).pose.protrude);
    expect(Math.max(...at)).toBe(at[5]);
    expect(at[5]).toBeGreaterThan(0.8);
  });

  it("rounds before the vowel: l anticipates əʊ in its last 60 to 120 ms", () => {
    const l = ENCLOSURE[3]!;
    expect(poseAt(speech, l.start + 0.003).pose.round).toBeLessThan(0.05);
    expect(poseAt(speech, l.end - 0.01).pose.round).toBeGreaterThan(0.25);
    // Not before the anticipation window.
    expect(poseAt(speech, l.end - ANTICIPATE_MAX_S - 0.005).pose.round).toBe(poseOf("l").round);
    expect(ANTICIPATE_MIN_S).toBeGreaterThanOrEqual(0.06);
  });

  it("voices the voiced sounds and not k", () => {
    expect(ENCLOSURE.map((phone) => poseAt(speech, mid(phone)).voiced)).toEqual([true, true, false, true, true, true, true]);
  });

  it("moves smoothly: no big jump in rounding or jaw between 60fps frames inside a sound", () => {
    for (let t = 0.1; t < 0.8; t += 1 / 60) {
      const a = poseAt(speech, t).pose;
      const b = poseAt(speech, t + 0.004).pose;
      expect(Math.abs(a.round - b.round)).toBeLessThan(0.35);
    }
  });
});

describe("p, b and m", () => {
  it("hold the lips closed for their whole duration, even with a rounded vowel after", () => {
    // "embody"-ish: ɪ m b ɒ, and "moo": m uː.
    const phones: Phone[] = [
      { p: "ɪ", start: 0, end: 0.08 },
      { p: "m", start: 0.08, end: 0.15 },
      { p: "b", start: 0.15, end: 0.22 },
      { p: "ɒ", start: 0.22, end: 0.35 },
      { p: "m", start: 0.35, end: 0.42 },
      { p: "uː", start: 0.42, end: 0.6 },
    ];
    const speech = speechFor(phones, [0, 0.6], null, null);
    for (const k of [1, 2, 4]) {
      const phone = phones[k]!;
      for (let t = phone.start; t < phone.end; t += 0.004) expect(poseAt(speech, t).pose.close, `${phone.p} t=${t}`).toBe(1);
    }
    // ...while the lips round towards uː under the closure.
    expect(poseAt(speech, 0.415).pose.round).toBeGreaterThan(0.5);
    expect(poseAt(speech, 0.5).pose.close).toBe(0);
  });
});
