// Carica dal solo index.html i blocchi "LISTONE" e "ENGINE" (marcatori nei commenti) come moduli,
// così i test provano esattamente il codice che gira nella pagina.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const HTML_PATH = path.join(here, '../index.html');

export async function loadBlock(tag, varName) {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const a = html.indexOf(`/* ==== ${tag}:START`);
  const b = html.indexOf(`/* ==== ${tag}:END`);
  if (a < 0 || b < 0) throw new Error(`Marcatori ${tag} non trovati in index.html`);
  const code = html.slice(a, b) + `\nexport default ${varName};\n`;
  const mod = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  return mod.default;
}
