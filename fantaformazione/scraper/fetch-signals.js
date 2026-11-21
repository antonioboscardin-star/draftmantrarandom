// Eseguito da GitHub Actions: legge le fonti online e scrive signals.json.
// Uso: node scraper/fetch-signals.js <file-di-uscita>   (il file esistente, se c'è, è la versione precedente)
import fs from 'node:fs';
import path from 'node:path';
import { fetchAll } from './sources.js';

const out = process.argv[2] || 'signals.json';
let prev = null;
try { prev = JSON.parse(fs.readFileSync(out, 'utf8')); } catch { /* prima esecuzione */ }

const fresh = JSON.parse(JSON.stringify(await fetchAll()));
const err = fresh.errors || {};
const failedAll = err.lineups && err.xg;

if (failedAll && prev) {
  // Tutte le fonti in errore: non sovrascrivo i dati buoni, segnalo solo l'errore.
  console.error('Tutte le fonti in errore, tengo il file precedente:', err);
  process.exitCode = 1;
} else {
  // Se una sola fonte fallisce, tengo la versione precedente di quella fonte
  // (e la sua data, così l'app può mostrare quanto è vecchia).
  fresh.sourceTimes = { lineups: fresh.fetchedAt, xg: fresh.fetchedAt, table: fresh.fetchedAt };
  if (prev) {
    const pt = prev.sourceTimes || {};
    if (err.lineups && prev.lineups) { fresh.lineups = prev.lineups; fresh.round = prev.round; fresh.matches = prev.matches || []; fresh.sourceTimes.lineups = pt.lineups || prev.fetchedAt; }
    if (err.xg && prev.xg) { fresh.xg = prev.xg; fresh.sourceTimes.xg = pt.xg || prev.fetchedAt; }
    if (err.table && prev.table) { fresh.table = prev.table; fresh.sourceTimes.table = pt.table || prev.fetchedAt; }
  }
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(fresh));
  console.log(`signals.json scritto: formazioni ${fresh.lineups?.players?.length || 0}, xG/xA ${fresh.xg?.length || 0}, partite ${fresh.matches?.length || 0}, classifica ${fresh.table?.length || 0}`, Object.keys(err).length ? { errori: err } : '');
  if (failedAll) process.exitCode = 1; // nessun dato: il job risulta rosso
}
