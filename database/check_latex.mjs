// Check every bit of LaTeX in some lines renders, with the same KaTeX and mhchem the board uses
// (apps/web/src/Maths.tsx). Reads a JSON array of strings on stdin; prints a JSON array of
// faults: [{line, maths, error}]. Empty when everything renders.
//
//   echo '["$x^2$", "$\\frac{1}{$"]' | node database/check_latex.mjs
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const katex = require('katex');
require('katex/contrib/mhchem');

let input = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) input += chunk;
const lines = JSON.parse(input);
const faults = [];
for (const line of lines) {
  if (typeof line !== 'string') continue;
  // A lone $ leaves the rest of the line as maths or as a stray sign.
  const bare = line.replace(/\$\$[\s\S]*?\$\$/g, '').replace(/\\\$/g, '');
  if ((bare.match(/\$/g) ?? []).length % 2) {
    faults.push({ line, maths: null, error: 'an unmatched $' });
    continue;
  }
  for (const found of line.matchAll(/\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g)) {
    const maths = found[1] ?? found[2];
    try {
      katex.renderToString(maths, { throwOnError: true, displayMode: Boolean(found[1]), strict: 'ignore' });
    } catch (error) {
      faults.push({ line, maths, error: String(error.message ?? error).replace(/^KaTeX parse error: /, '') });
    }
  }
}
process.stdout.write(JSON.stringify(faults));
