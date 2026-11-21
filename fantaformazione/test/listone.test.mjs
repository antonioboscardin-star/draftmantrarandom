// Test del blocco LISTONE dentro index.html e del file reale, se presente.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadBlock } from './helpers.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const L = await loadBlock('LISTONE', 'Listone');

test('ruolo Classic dai ruoli Mantra', () => {
  const r = (s) => L.classicRole(L.parseMantra(s));
  assert.strictEqual(r('Por'), 'P');
  assert.strictEqual(r('Dc'), 'D');
  assert.strictEqual(r('Dd, E'), 'D');      // terzino che fa anche l'esterno: difensore
  assert.strictEqual(r('B, Ds, E'), 'D');
  assert.strictEqual(r('Pc'), 'A');
  assert.strictEqual(r('A'), 'A');
  assert.strictEqual(r('M, C'), 'C');
  assert.strictEqual(r('W, T'), 'C');
  assert.strictEqual(r('E'), 'D');      // "E" puro = terzino nel Listone
  assert.strictEqual(r('Por, Dc'), null);
});

test('ruoli da verificare: solo i casi davvero ambigui', () => {
  const c = (s) => L.roleToCheck(L.parseMantra(s));
  assert.ok(c('W, A') && c('T, A') && c('E') && c('E, W'));
  assert.ok(!c('Dd, E') && !c('Dc') && !c('Por') && !c('Pc') && !c('A') && !c('M, C') && !c('C, T') && !c('W, T'));
});

test('riga -> giocatore: 0 = nessun dato, nome nel formato di fantacalcio.it', () => {
  const p = L.rowToPlayer({
    name: 'MILINKOVIC-SAVIC V.', team: 'Napoli', roleMantra: 'Por',
    expectedFantamedia: 6.5, currentSeasonFantamedia: 0, lastFiveMatchesFantamedia: 0,
    expectedTitolarita: 90, currentSeasonTitolarity: 0, lastFiveMatchesTitolarity: 0, unavailableUntilRound: 0, playerStatus: 'T',
  });
  assert.strictEqual(p.name, 'Milinkovic-Savic V.');
  assert.strictEqual(p.role, 'P');
  assert.deepStrictEqual([p.fmExp, p.fmSeason, p.fmLast5, p.unavailableUntilRound], [6.5, null, null, null]);
  assert.strictEqual(p.titExp, 90);
});

test('roleClassic del file è ufficiale: batte la deduzione e la correzione manuale', () => {
  const row = { name: 'WESLEY', team: 'Roma', roleMantra: 'E', roleClassic: 'C', expectedFantamedia: 6, currentSeasonFantamedia: 6, lastFiveMatchesFantamedia: 6 };
  const existing = [{ id: 'wesley__roma', role: 'A', roleManual: true, roleMantra: ['E'] }];
  const p = L.planImport([row], existing).updated[0];
  assert.deepStrictEqual([p.role, p.roleManual, p.roleCheck, 'roleFromFile' in p], ['C', false, false, false]);
  const bad = L.planImport([{ ...row, roleClassic: 'X' }], []).added[0]; // valore non valido: ripiego sulla deduzione
  assert.deepStrictEqual([bad.role, bad.roleCheck], ['D', true]);
});

test('import: la correzione manuale del ruolo sopravvive e le colonne mancanti vengono segnalate', () => {
  const row = { name: 'PULISIC', team: 'Milan', roleMantra: 'T, A', expectedFantamedia: 7, currentSeasonFantamedia: 7.5, lastFiveMatchesFantamedia: 7 };
  const existing = [{ id: 'pulisic__milan', name: 'Pulisic', team: 'Milan', role: 'A', roleManual: true, roleMantra: ['T', 'A'] }];
  const plan = L.planImport([row], existing);
  assert.strictEqual(plan.updated.length, 1);
  assert.strictEqual(plan.updated[0].role, 'A');
  assert.strictEqual(plan.updated[0].roleManual, true);
  const fresh = L.planImport([row], []);
  assert.strictEqual(fresh.added[0].role, 'C');
  assert.strictEqual(fresh.added[0].roleCheck, true);
  assert.deepStrictEqual(L.missingColumns([{ name: 'x', team: 'y' }]).slice(0, 2), ['roleMantra', 'expectedFantamedia']);
  assert.ok(L.missingColumns([{ name: 'x' }], L.RECOMMENDED_COLUMNS).includes('roleClassic'));
});

// Prova sul Listone reale: LISTONE_JSON=righe del foglio ALL convertite in JSON (es. con pandas: df.to_json(orient="records"))
const json = process.env.LISTONE_JSON;
test('Listone reale: tutte le righe importabili', { skip: !json || !fs.existsSync(json) }, () => {
  const rows = JSON.parse(fs.readFileSync(json, 'utf8'));
  assert.deepStrictEqual(L.missingColumns(rows), []);
  assert.deepStrictEqual(L.missingColumns(rows, L.RECOMMENDED_COLUMNS), []);
  const plan = L.planImport(rows, []);
  assert.deepStrictEqual(plan.errors, []);
  assert.strictEqual(plan.total, rows.length);
  assert.strictEqual(plan.added.filter((p) => p.roleCheck).length, 0); // con roleClassic nessun ruolo da verificare
  // la deduzione di ripiego coincide col ruolo ufficiale in almeno il 95% dei casi
  const ok = rows.filter((r) => L.classicRole(L.parseMantra(r.roleMantra)) === r.roleClassic).length;
  assert.ok(ok / rows.length >= 0.95, `deduzione corretta solo per ${ok}/${rows.length}`);
  assert.ok(rows.every((r) => !['P', 'D', 'C', 'A'].every((x) => x !== r.roleClassic)), 'roleClassic valido su tutte le righe');
});
