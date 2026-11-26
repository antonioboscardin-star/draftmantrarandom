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
  for (const p of sc) { assert.equal(p.fv, Math.round(p.fm * 100) / 100); assert.equal(p.diffFactor, 1); assert.equal(p.xBonus, 0); }
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

test('Euroleghe: numeri in testa/in mezzo al nome partita (es. 01) rimossi', () => {
  for (const [raw, ok] of [['01 Lipsia', 'Lipsia'], ['01Lipsia', 'Lipsia'], ['Lipsia 01', 'Lipsia'], ['01 Paris Saint-Germain', 'Paris Saint-Germain'], ['Bayern 01/01 01:00 Monaco', 'Bayern Monaco'], ['Racing Strasburgo', 'Racing Strasburgo'], ['Lipsia -', 'Lipsia']]) assert.equal(E.cleanTeamName(raw), ok, raw);
});

test('Euroleghe: squadre in ordine casa-trasferta anche se il testo della partita è disordinato', () => {
  const roster = squad();
  const run = (m) => E.scorePlayers(roster, { lineups: { players: [] }, euroLineups: { players: [] }, euroMatches: [m] }, { euro: true }).find((x) => x.team === 'Bayern Monaco').match;
  assert.deepEqual(run({ home: 'Bayern Monaco', away: 'Lipsia' }), { home: 'Bayern Monaco', away: 'Lipsia' });
  assert.deepEqual(run({ home: 'Bayern Monaco Lipsia', away: '-' }), { home: 'Bayern Monaco', away: 'Lipsia' });
  assert.deepEqual(run({ home: 'Lipsia', away: 'Bayern Monaco -' }), { home: 'Lipsia', away: 'Bayern Monaco' });
  assert.deepEqual(run({ home: '01 Bayern Monaco - Lipsia 0', away: '' }), { home: 'Bayern Monaco', away: 'Lipsia' });
});

import { parseKickoffs, romeTs } from '../scraper/sources.js';
test('Scadenza: orari di inizio letti dalla pagina (testo italiano, date numeriche, ISO), segnaposto ignorato', () => {
  const now = Date.parse('2026-11-26T10:00:00Z');
  const html = `<body><p>01/01 01:00</p><div>Sabato 28 novembre ore 15:00</div><div>27/11 20:45</div><div>domenica 29 nov 2026, 18.30</div><time datetime="2026-11-30T20:45:00+01:00"></time><p>Ultimo aggiornamento 20/11/2026 09:00</p></body>`;
  const k = parseKickoffs(html, now);
  assert.deepEqual(k, [romeTs(2026, 11, 27, 20, 45), romeTs(2026, 11, 28, 15, 0), romeTs(2026, 11, 29, 18, 30), Date.parse('2026-11-30T19:45:00Z')]);
  assert.equal(romeTs(2026, 11, 27, 20, 45), Date.parse('2026-11-27T19:45:00Z')); // ora solare
  assert.equal(romeTs(2026, 7, 1, 20, 0), Date.parse('2026-07-01T18:00:00Z'));    // ora legale
});
test('Scadenza: nextKickoff prende il primo non ancora passato', () => {
  assert.equal(E.nextKickoff([5, 10, 20], 7), 10);
  assert.equal(E.nextKickoff([5], 7), null);
  assert.equal(E.nextKickoff(undefined, 7), null);
});
test('Panchina: sempre 12 giocatori (Classic e Mantra), solo disponibili', () => {
  const roster = squad();
  const sig = { lineups: { players: [] }, euroLineups: { players: [] } };
  const mroster = []; let n = 1;
  const addM = (c, role, m, fm) => { for (let i = 0; i < c; i++) mroster.push(mk(n++, `M${n}`, 'Inter', role, m, fm + i / 100)); };
  addM(3, 'P', ['Por'], 6); addM(2, 'D', ['Dd'], 6); addM(2, 'D', ['Ds'], 6); addM(4, 'D', ['Dc'], 6); addM(3, 'C', ['E'], 6); addM(3, 'C', ['M', 'C'], 6); addM(2, 'C', ['W', 'A'], 6); addM(2, 'C', ['T'], 6); addM(4, 'A', ['A', 'Pc'], 7);
  for (const [t, ro] of [['Classic', roster], ['Mantra', mroster]]) {
    const r = E.proposeLineup(t, ro, sig, { euro: true });
    assert.ok(!r.error, t + ' ' + r.error);
    assert.equal(r.bench.length, 12, t);
    assert.equal(new Set([...r.lineup, ...r.bench].map((p) => p.id)).size, 23, t);
  }
  const few = roster.slice(0, 25).map((p, i) => i < 10 ? { ...p } : p);
  const out = squad().map((p, i) => i >= 14 ? { ...p, id: p.id } : p);
  const sig2 = { lineups: { players: [] }, euroLineups: { players: out.slice(14).map((p) => ({ name: p.name, team: 'x', id: p.id, pct: 0, status: 'out' })) } };
  const r2 = E.proposeLineup('Classic', out, sig2, { euro: true });
  assert.ok(r2.bench.length <= 12 && r2.bench.every((p) => p.available !== false));
});

test('Abbreviazioni squadre: nome identico prima del nome contenuto (Bayern Monaco ≠ Monaco)', () => {
  const known = ['Monaco', 'Bayern Monaco', 'Lipsia', 'Manchester City'];
  assert.equal(E.teamAbbr('Bayern Monaco', known), 'BAY');
  assert.equal(E.teamAbbr('Monaco', known), 'MON');
  assert.equal(E.teamAbbr('Lipsia', known), 'LIP');
});
