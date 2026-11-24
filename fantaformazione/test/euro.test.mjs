import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBlock } from './helpers.mjs';
import { parseLineups } from '../scraper/sources.js';

const L = await loadBlock('LISTONE', 'Listone');
const E = await loadBlock('ENGINE', 'Engine');
const R = await loadBlock('RESULTS', 'Results');

const row = (o = {}) => ({ '#': 2557, Nome: 'Kane', 'Sq.': 'Bayern Monaco', R: 'x', 'R.': 'A', 'R.MANTRA': 'Pc', PGv: 10, MV: 6.75, FM: 8.35, 'FVM/1000': 491, 'QUOT.': 44, ...o });

test('Listone Euroleghe: riga valida', () => {
  const p = L.rowToEuroPlayer(row());
  assert.equal(p.id, '2557'); assert.equal(p.role, 'A'); assert.deepEqual(p.roleMantra, ['Pc']); assert.equal(p.fm, 8.35);
});
test('Listone Euroleghe: errori', () => {
  assert.throws(() => L.rowToEuroPlayer(row({ 'R.': 'X' })), /ruolo/);
  assert.throws(() => L.rowToEuroPlayer(row({ 'R.MANTRA': 'Zz' })), /Mantra/);
  assert.throws(() => L.rowToEuroPlayer(row({ Nome: '' })), /nome/);
});
test('Listone Euroleghe: colonne mancanti e piano di import', () => {
  assert.deepEqual(L.missingEuroColumns([row()]), []);
  assert.ok(L.missingEuroColumns([{ Nome: 'a' }]).includes('FM'));
  const rows = [row(), row({ '#': 1, Nome: 'Olise', 'R.': 'C', 'R.MANTRA': 'W/A', FM: 8.85 }), row({ '#': 1, Nome: 'Dup' })];
  const old = [{ ...L.rowToEuroPlayer(row()) }, { id: '9', name: 'Vecchio', team: 'X', role: 'D', roleMantra: ['Dc'], fm: 6 }];
  const plan = L.planEuroImport(rows, old);
  assert.equal(plan.unchanged.length, 1); assert.equal(plan.added.length, 1); assert.equal(plan.removed.length, 1); assert.equal(plan.errors.length, 1);
});
test('Listone Euroleghe: stesso nome in squadre diverse = giocatori diversi (id del file)', () => {
  const plan = L.planEuroImport([row(), row({ '#': 7, 'Sq.': 'Roma' })], []);
  assert.equal(plan.total, 2);
});

const mk = (id, name, team, role, mantra, fm) => ({ id: String(id), name, team, role, roleMantra: mantra, fm });
function squad() {
  const out = []; let n = 1;
  const add = (c, role, mantra, team, fm) => { for (let i = 0; i < c; i++) out.push(mk(n++, `${role}${n}`, team, role, mantra, fm + i / 100)); };
  add(3, 'P', ['Por'], 'Bayern Monaco', 6); add(8, 'D', ['Dc'], 'Arsenal', 6); add(8, 'C', ['M', 'C'], 'Inter', 6.5); add(6, 'A', ['A'], 'Real Madrid', 7);
  return out;
}
test('Euroleghe: FV = FM, senza difficoltà/campo/xG', () => {
  const roster = squad();
  const sig = {
    round: 12, matches: [{ home: 'Inter', away: 'Milan' }], table: [{ name: 'Inter', pts: 30 }, { name: 'Milan', pts: 10 }],
    xg: [{ name: 'C10', team: 'Inter', xg: 9, goals: 0, xa: 5, assists: 0 }],
    lineups: { players: [{ name: 'C10', team: 'inter', id: '999', pct: 90, status: 'lineup' }] },
    euroLineups: { players: [{ name: 'A20', team: 'real-madrid', id: String(roster[19].id), pct: 70, status: 'lineup' }] },
  };
  const sc = E.scorePlayers(roster, sig, { euro: true });
  for (const p of sc) { assert.equal(p.fv, Math.round(p.fm * 100) / 100); assert.equal(p.diffFactor, 1); assert.equal(p.xBonus, 0); assert.equal(p.opp, null); }
});
test('Euroleghe: titolarità da Serie A per squadre di Serie A, da Euro Leghe per le altre (anche per id)', () => {
  const roster = squad();
  const ar = roster.find((p) => p.team === 'Real Madrid');
  const inter = roster.find((p) => p.team === 'Inter');
  const sig = {
    lineups: { players: [{ name: inter.name, team: 'inter', id: '1', pct: 85, status: 'lineup' }, { name: 'Altro', team: 'milan', id: '2', pct: 50, status: 'lineup' }] },
    euroLineups: { players: [{ name: 'Nome diverso', team: 'real-madrid', id: ar.id, pct: 70, status: 'bench' }, { name: roster.find((p) => p.team === 'Arsenal').name, team: 'arsenal', id: '3', pct: 0, status: 'out', note: 'Lesione' }] },
  };
  const sc = Object.fromEntries(E.scorePlayers(roster, sig, { euro: true }).map((p) => [p.id, p]));
  assert.equal(sc[inter.id].prob, 0.85);
  assert.equal(sc[ar.id].prob, 0.7);
  const arsenal = roster.find((p) => p.team === 'Arsenal');
  assert.equal(sc[arsenal.id].prob, 0); assert.equal(sc[arsenal.id].available, false); assert.equal(sc[arsenal.id].ev, 0);
  // squadra Euro assente dalla lista: probabilità bassa; nessuna lista Euro: neutra
  const other = roster.find((p) => p.team === 'Bayern Monaco');
  assert.equal(sc[other.id].prob, 0.1);
  const none = E.scorePlayers(roster, { lineups: sig.lineups }, { euro: true }).find((p) => p.id === other.id);
  assert.equal(none.prob, 0.7);
});
test('Euroleghe: stessi moduli e vincoli di Classic e Mantra', () => {
  const roster = squad();
  const sig = { lineups: { players: [] }, euroLineups: { players: [] } };
  const c = E.proposeLineup('Classic', roster, sig, { euro: true });
  assert.ok(E.CLASSIC_MODULES.includes(c.module)); assert.equal(c.lineup.length, 11);
  assert.equal(c.lineup.filter((p) => p.role === 'P').length, 1);
  const m = E.proposeLineup('Mantra', roster, sig, { euro: true });
  assert.ok(m.module in E.MANTRA_MODULES || m.error); 
});
test('Euroleghe: precedenza ai titolari >= 60%', () => {
  const roster = squad();
  const arPlayers = roster.filter((p) => p.team === 'Real Madrid').sort((a, b) => a.fm - b.fm);
  const weak = arPlayers[0];
  const sig = { lineups: { players: [] }, euroLineups: { players: [{ name: weak.name, team: 'real-madrid', id: weak.id, pct: 90, status: 'lineup' }] } };
  const sc = E.scorePlayers(roster, sig, { euro: true });
  assert.ok(sc.find((p) => p.id === weak.id).pref);
});

test('Risultati: Euroleghe 30 giornate, riepilogo e giornate separate', () => {
  const sa = { id: 'a', startRound: 1, results: [{ round: 12, my: 2, opp: 1 }, { round: 35, my: 0, opp: 0 }] };
  const el = { id: 'b', euroleghe: true, startRound: 1, results: [{ round: 9, my: 0, opp: 3 }, { round: 31, my: 1, opp: 0 }] };
  assert.equal(R.maxOf(el), 30); assert.equal(R.maxOf(sa), 38);
  assert.equal(R.clean(el).length, 1); assert.equal(R.clean(sa).length, 2);
  assert.equal(R.latestRound([sa, el], false), 35); assert.equal(R.latestRound([sa, el], true), 9);
  assert.equal(R.defaultRound([sa, el], true), 9);
  const c = R.countsForRound([sa, el], { sa: 12, el: 9 });
  assert.deepEqual([c.W, c.D, c.L, c.total], [1, 0, 1, 2]);
  assert.equal(R.startOf({ euroleghe: true, startRound: 35 }), 1);
});

test('Scraper: pagina Euro Leghe (link /euroleghe/squadre) con titolari, panchina, infortunati', () => {
  const html = `<body><h2><a href="/euroleghe/squadre/arsenal">Arsenal</a> vs <a href="/euroleghe/squadre/chelsea">Chelsea</a></h2>
  <h3>Arsenal</h3><div>4-3-3</div><ul>${Array.from({ length: 11 }, (_, i) => `<li><a href="/euroleghe/squadre/arsenal/p${i}/${100 + i}">Titolare ${i}</a> 9${i % 10}%</li>`).join('')}</ul>
  <h4>Panchina</h4><ul><li><a href="/euroleghe/squadre/arsenal/rr/200">Riserva</a> 5%</li></ul>
  <h4>Infortunati</h4><ul><li><a href="/euroleghe/squadre/arsenal/inf/300">Ferito</a> Lesione muscolare</li></ul></body>`;
  const r = parseLineups(html);
  assert.equal(r.matches.length, 1); assert.equal(r.matches[0].home, 'Arsenal');
  const by = Object.fromEntries(r.players.map((p) => [p.id, p]));
  assert.equal(by['100'].status, 'lineup'); assert.equal(by['200'].status, 'bench'); assert.equal(by['300'].status, 'out');
});

test('Euroleghe: nomi partita puliti da numeri e squadra del giocatore riconosciuta', () => {
  assert.equal(E.cleanTeamName('Lipsia 0'), 'Lipsia');
  assert.equal(E.cleanTeamName('10 Bayern Monaco'), 'Bayern Monaco');
  assert.equal(E.cleanTeamName('Lipsia 0 - 0 01/01 01:00'), 'Lipsia');
  assert.equal(E.cleanTeamName('Paris Saint-Germain'), 'Paris Saint-Germain');
  const roster = squad();
  const sig = { lineups: { players: [] }, euroLineups: { players: [] }, euroMatches: [{ home: '10 Bayern Monaco 0', away: 'Lipsia 0 - 0' }] };
  const p = E.scorePlayers(roster, sig, { euro: true }).find((x) => x.team === 'Bayern Monaco');
  assert.deepEqual(p.match, { home: 'Bayern Monaco', away: 'Lipsia' });
  assert.equal(p.matchTeam, 'Bayern Monaco'); assert.equal(p.league, 'Bundesliga');
});
