/**
 * §6 invariant grep-guards — source-scanning regression tests.
 *
 * These tests do NOT exercise runtime behaviour. They read source text and assert
 * with regex that two CLAUDE.md §6 "discipline-only" invariants are not violated.
 * Both invariants are currently respected, so these tests act as regression guards:
 * if a future edit reintroduces the forbidden pattern, the suite turns red.
 *
 *   §6 invariant 1: "Never use setTimeout to drive setCurrentMeasureIndex"
 *     (setTimeout drifts 10-50ms; use scheduledMeasures + rAF instead).
 *   §6 invariant 2: "Never set opacity via JSX props on animated elements"
 *     (React re-renders overwrite inline style.opacity set by rAF; animated
 *      elements — those carrying data-pagination-* / data-wipe-role — must drive
 *      opacity through element.style.opacity in the rAF callback, NOT via a JSX
 *      `opacity={...}` attribute prop).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolve from this test file's location so the test is path-robust regardless
// of the cwd vitest runs from. src/__tests__/ -> src/.
const SRC_DIR = path.resolve(__dirname, '..');

/** This guard file's own absolute path — excluded from scans so its regex
 *  literals (which mention the very patterns it forbids) don't self-trip. */
const SELF = fileURLToPath(import.meta.url);

/** Recursively collect every .js/.jsx file under `dir` (skips __tests__ + node_modules). */
function collectSourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      out.push(...collectSourceFiles(full));
    } else if (/\.(js|jsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Strip line + block comments from JS/JSX source so guards match real code, not
 * prose. CLAUDE.md §6 comments frequently *name* the forbidden patterns to explain
 * the correct alternative (e.g. "drive setCurrentMeasureIndex ... instead of a
 * setTimeout"), so scanning comment text yields false positives. This is a coarse
 * stripper (it does not attempt to preserve regex/string literals containing `//`),
 * which is acceptable for a pattern-presence guard. Replaces comments with spaces of
 * equal length to keep character indices stable for line-number reporting.
 */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
}

/**
 * Given source `text` and the index of a `setTimeout(` token's opening paren,
 * return the substring spanning that call's balanced parentheses (the callback +
 * delay args). Returns '' if no balanced close is found. This scopes the
 * setCurrentMeasureIndex search to the actual setTimeout call, not a fixed
 * character window that could spill into unrelated neighbouring code.
 */
function balancedCallBody(text, openParenIdx) {
  let depth = 0;
  for (let i = openParenIdx; i < text.length; i++) {
    const c = text[i];
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return text.slice(openParenIdx, i + 1);
    }
  }
  return '';
}

describe('§6 invariant guard: no setTimeout-driven setCurrentMeasureIndex', () => {
  it('has no setTimeout(...) callback that references setCurrentMeasureIndex', () => {
    const files = collectSourceFiles(SRC_DIR).filter((f) => f !== SELF);
    const offenders = [];

    // Heuristic: comment-strip the source, then for each `setTimeout(` token scan
    // ONLY that call's balanced-parenthesis body for `setCurrentMeasureIndex`.
    // Scoping to the balanced call (rather than a fixed char window) avoids false
    // positives where an unrelated setCurrentMeasureIndex sits in nearby code, and
    // comment-stripping avoids matching explanatory prose that names the pattern.
    const setTimeoutRe = /setTimeout\s*\(/g;

    for (const file of files) {
      const raw = fs.readFileSync(file, 'utf8');
      const text = stripComments(raw);
      let m;
      while ((m = setTimeoutRe.exec(text)) !== null) {
        // Index of the opening paren of this setTimeout(...) call.
        const openParen = m.index + m[0].lastIndexOf('(');
        const body = balancedCallBody(text, openParen);
        if (body && /setCurrentMeasureIndex/.test(body)) {
          const line = raw.slice(0, m.index).split('\n').length;
          offenders.push(`${path.relative(SRC_DIR, file)}:${line}`);
        }
      }
    }

    expect(offenders, `setCurrentMeasureIndex must be driven by rAF + scheduledMeasures, not setTimeout. Offenders:\n${offenders.join('\n')}`).toEqual([]);
  });
});

describe('§6 invariant guard: no opacity JSX prop on animated elements in SheetMusic.jsx', () => {
  it('has no element carrying both a data-pagination-/data-wipe-role attr and an opacity= JSX prop', () => {
    const file = path.resolve(SRC_DIR, 'components/sheet-music/SheetMusic.jsx');
    const text = fs.readFileSync(file, 'utf8');

    // Heuristic: split the source into JSX-tag chunks by slicing at each `<` that
    // opens a tag. For each chunk, take everything up to the closing `>` of the
    // OPENING tag (so we examine only that one element's attribute list, not its
    // children). Then assert no chunk contains BOTH:
    //   - a data-pagination-* or data-wipe-role attribute, AND
    //   - an `opacity={...}` JSX prop (the attribute form).
    //
    // Critically this does NOT flag `style={{ opacity: ... }}` — that is the
    // SANCTIONED pattern (§6): style-object opacity is the resting state set by
    // React, while rAF overrides element.style.opacity. Only the top-level JSX
    // `opacity=` attribute prop is forbidden on animated elements, because React
    // re-renders would overwrite the rAF-driven value. The `opacity=` regex below
    // requires `opacity` to be preceded by whitespace (an attribute boundary),
    // which excludes the `opacity:` key inside a style object.
    const dataAttrRe = /data-(pagination-\w*|wipe-role)\b/;
    const opacityPropRe = /\sopacity\s*=\s*[{"']/;

    const offenders = [];
    // Match the attribute span of each opening tag: from `<Tag` up to the first `>`.
    // [^<>] keeps us inside a single tag's attribute list; {.} via `s` flag spans
    // newlines because JSX attributes are frequently split across lines here.
    const openTagRe = /<[A-Za-z][^<>]*?>/gs;
    let m;
    while ((m = openTagRe.exec(text)) !== null) {
      const tag = m[0];
      if (dataAttrRe.test(tag) && opacityPropRe.test(tag)) {
        // Report the line number of the tag start for easy locating.
        const line = text.slice(0, m.index).split('\n').length;
        offenders.push(`SheetMusic.jsx:${line} -> ${tag.slice(0, 120).replace(/\s+/g, ' ')}`);
      }
    }

    expect(offenders, `Animated elements (data-pagination-*/data-wipe-role) must NOT use an opacity= JSX prop; drive opacity via element.style.opacity in rAF (style-object opacity is fine). Offenders:\n${offenders.join('\n')}`).toEqual([]);
  });
});
