// Pre-renders the maths in each string, using the same call the app's Maths.tsx makes.
// Reading the review page must not depend on a CDN, and what is reviewed has to be what a
// student will actually see -- not a second renderer that agrees most of the time.
const katex = require(process.argv[2]);
const fs = require('fs');
const path = require('path');
// Chemistry is written with mhchem ($\ce{H2SO4}$), which the app loads beside KaTeX. Loading
// it here registers \ce and \pu on the same KaTeX instance, so a review page shows formulae
// as students see them rather than as red errors.
require(path.join(process.argv[2], 'dist', 'contrib', 'mhchem.js'));

const SEGMENT = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function typeset(text) {
  if (text == null) return '';
  let out = '', cursor = 0;
  for (const m of String(text).matchAll(SEGMENT)) {
    const start = m.index ?? 0;
    if (start > cursor) out += escapeHtml(String(text).slice(cursor, start));
    const display = m[1] !== undefined;
    const expression = (m[1] ?? m[2] ?? '').trim();
    try {
      out += katex.renderToString(expression, {
        displayMode: display, throwOnError: false, trust: false, output: 'html',
      });
    } catch (e) {
      out += '<span class="bad">' + escapeHtml(m[0]) + '</span>';
    }
    cursor = start + m[0].length;
  }
  if (cursor < String(text).length) out += escapeHtml(String(text).slice(cursor));
  return out;
}

const data = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
for (const q of data) {
  q.stem_html = typeset(q.stem);
  q.options_html = Object.fromEntries(
    Object.entries(q.options || {}).map(([k, v]) => [k, typeset(v)]));
  q.steps_html = (q.steps || []).map(typeset);
  q.hint_html = q.hint ? typeset(q.hint) : '';
}
fs.writeFileSync(process.argv[4], JSON.stringify(data), 'utf8');
console.log('rendered', data.length, 'questions');
