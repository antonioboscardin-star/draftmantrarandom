import test from 'node:test';
import assert from 'node:assert';
import * as S from '../scraper/sources.js';
import { loadBlock } from './helpers.mjs';

const E = await loadBlock('ENGINE', 'Engine');

// ---------- Rosa sintetica da 28 giocatori ----------
function mk(name, team, role, mantra, last, exp) {
  const avg = last.length ? last.reduce((a, b) => a + b, 0) / last.length : 0;
  return {
    id: name.toLowerCase().replace(/\W+/g, '-'), name, team, role, roleMantra: mantra,
    fmExp: exp || 0, fmSeason: exp || 0, fmLast5: avg,
    titExp: 80, titSeason: avg ? 100 : 0, titLast5: avg ? 100 : 0, unavailableUntilRound: 0,
  };
}
const roster = [
  mk('Maignan', 'Milan', 'P', ['Por'], [6, 6.5, 6], 6.3),
  mk('Vicario', 'Juventus', 'P', ['Por'], [6, 6, 6.5], 6.2),
  mk('Svilar', 'Roma', 'P', ['Por'], [6.5, 6, 6], 6.1),
  mk('Bremer', 'Juventus', 'D', ['Dc'], [6.5, 6.5, 7], 6.5),
  mk('Hermoso', 'Roma', 'D', ['Dc'], [6, 6.5, 6], 6.1),
  mk('Pavlovic', 'Milan', 'D', ['Dc', 'B'], [6, 6, 6.5], 6.1),
  mk('Cambiaso', 'Juventus', 'D', ['Dd', 'Ds', 'E'], [6.5, 7, 6], 6.4),
  mk('Wesley', 'Roma', 'D', ['Dd', 'E'], [7, 6.5, 7.5], 6.5),
  mk('Celik', 'Juventus', 'D', ['Dd'], [6, 6, 6], 6),
  mk('Kalulu', 'Juventus', 'D', ['Dc'], [6, 6, 6], 6),
  mk('Rabiot', 'Milan', 'C', ['M', 'C'], [7.5, 6.5, 8], 7),
  mk('Modric', 'Milan', 'C', ['M'], [6.5, 6.5, 7], 6.5),
  mk('Koopmeiners', 'Juventus', 'C', ['C', 'T'], [6, 6.5, 6], 6.4),
  mk('Cristante', 'Roma', 'C', ['M', 'C'], [6, 6, 6.5], 6),
  mk('Pisilli', 'Roma', 'C', ['C'], [6, 6, 6], 6),
  mk('Dybala', 'Roma', 'C', ['T', 'A'], [7.5, 8, 6], 7.2),
  mk('Pulisic', 'Milan', 'A', ['W', 'A'], [7, 7.5, 6.5], 7),
  mk('Malen', 'Roma', 'A', ['A', 'Pc'], [8, 7, 9], 7.5),
  mk('Kolo Muani', 'Juventus', 'A', ['A', 'Pc'], [6.5, 7, 6], 6.8),
  mk('Soulè', 'Roma', 'A', ['W', 'A'], [7, 6.5, 7], 6.8),
  mk('Ramos G.', 'Milan', 'A', ['Pc'], [6, 6, 6], 6.2),
  mk('Boga', 'Juventus', 'A', ['W'], [6, 6.5, 6], 6),
  mk('Mora', 'Roma', 'C', ['T'], [6, 6, 6.5], 6),
  mk('Locatelli', 'Juventus', 'C', ['M'], [6.5, 6.5, 6.5], 6.5),
  mk('Gila', 'Milan', 'D', ['Dc'], [6, 6, 6], 6),
  mk('Musah', 'Milan', 'C', ['M', 'C'], [6, 6, 6], 6),
  mk('Moreira', 'Milan', 'A', ['W', 'T'], [6.5, 7, 6.5], 6.5),
  mk('Gollini', 'Roma', 'P', ['Por'], [], null),
];

const signals = {
  round: 12,
  lineups: {
    players: [
      { name: 'Malen', team: 'roma', pct: 90, status: 'lineup' },
      { name: 'Locatelli', team: 'juventus', status: 'out', note: 'rottura del menisco' },
      { name: 'Dybala', team: 'roma', pct: 75, status: 'lineup' },
      { name: 'Rabiot', team: 'milan', pct: 90, status: 'lineup' },
      { name: 'Kolo Muani', team: 'juventus', pct: 90, status: 'lineup' },
      { name: 'Bremer', team: 'juventus', pct: 90, status: 'lineup' },
      { name: 'Maignan', team: 'milan', pct: 90, status: 'lineup' },
      { name: 'Svilar', team: 'roma', pct: 70, status: 'lineup' },
      { name: 'Gollini', team: 'roma', pct: 5, status: 'bench' },
    ],
  },
  xg: [
    { name: 'donyell malen', team: 'Roma', xg: 9.7, goals: 8, xa: 0.4, assists: 0 },
    { name: 'paulo dybala', team: 'Roma', xg: 2.0, goals: 2, xa: 2.7, assists: 4 },
  ],
};

test('matching nomi: "Paz N." vs "nico paz"', () => {
  assert.ok(E.matchScore('Paz N.', 'Como', 'nico paz', 'Como') >= 2);
  assert.strictEqual(E.matchScore('Paz N.', 'Como', 'marco paz', 'x como'), 0);
  assert.ok(E.matchScore('Esposito Se.', 'Sassuolo', 'Esposito Se.', 'sassuolo') === 3);
});

test('Classic: modulo valido, 11 in campo, indisponibile escluso', () => {
  const r = E.proposeLineup('Classic', roster, signals);
  assert.ok(E.CLASSIC_MODULES.includes(r.module));
  assert.strictEqual(r.lineup.length, 11);
  assert.strictEqual(r.lineup.filter((p) => p.role === 'P').length, 1);
  assert.ok(!r.lineup.some((p) => p.name === 'Locatelli'), 'Locatelli è fuori per infortunio');
  const [d, c, a] = r.module.split('-').map(Number);
  assert.strictEqual(r.lineup.filter((p) => p.role === 'D').length, d);
  assert.strictEqual(r.lineup.filter((p) => p.role === 'C').length, c);
  assert.strictEqual(r.lineup.filter((p) => p.role === 'A').length, a);
  assert.strictEqual(r.lineup[0].name, 'Maignan'); // portiere con più titolarità e FM
});

test('Mantra: assegnazione ammessa per ruolo, nessun duplicato', () => {
  const r = E.proposeLineup('Mantra', roster, signals);
  assert.ok(!r.error, r.error);
  assert.strictEqual(r.lineup.length, 11);
  assert.strictEqual(new Set(r.lineup.map((p) => p.id)).size, 11);
  const slots = E.MANTRA_MODULES[r.module];
  assert.strictEqual(slots.length, 11);
  r.lineup.forEach((p, i) => assert.ok(p.roleMantra.some((x) => slots[i].includes(x)), `${p.name} fuori ruolo nello slot ${i}`));
  assert.ok(r.alternatives.length >= 1);
});

test('Hungarian: assegnazione ottima su caso noto', () => {
  const cost = [[4, 1, 3], [2, 0, 5], [3, 2, 2]];
  const a = E.hungarian(cost);
  const tot = a.reduce((s, j, i) => s + cost[i][j], 0);
  assert.strictEqual(tot, 5); // 1+2+2
});

test('Segnali assenti: calcolo comunque possibile (valori neutri)', () => {
  const r = E.proposeLineup('Classic', roster, {});
  assert.strictEqual(r.lineup.length, 11);
  assert.ok(r.all[0].notes.some((n) => /non disponibili/.test(n)));
});

// ---------- Parser su HTML con la stessa struttura osservata sui siti ----------
const FC_HTML = `<html><body>
<h2>Probabili formazioni Serie A</h2><p>Giornata 12</p>
<ul><li><h2>12 <a href="/serie-a/squadre/como">Como</a> <a href="/serie-a/squadre/cagliari">Cagliari</a></h2>
  <ul><li><a href="https://www.fantacalcio.it/serie-a/squadre/como/douvikas/7017"><img alt="x">Douvikas</a></li></ul>
  <h3>Como</h3><div>4-2-3-1</div>
  <ul><li><a href="https://www.fantacalcio.it/serie-a/squadre/como/butez/6966">Butez</a>
    90%</li><li><a href="https://www.fantacalcio.it/serie-a/squadre/como/douvikas/7017">Douvikas</a> 90%</li></ul>
  <div>Panchina</div>
  <ul><li><a href="https://www.fantacalcio.it/serie-a/squadre/como/kaiki/7414">Kaiki</a> 60%</li>
      <li><a href="https://www.fantacalcio.it/serie-a/squadre/como/chalobah-t/5641">Chalobah T.</a> 45%</li></ul>
  <h3>Presentazione squadre</h3><h4>Ballottaggi</h4>
  <ul><li><a href="https://www.fantacalcio.it/serie-a/squadre/como/valle/6867">Valle</a> <b>55%</b></li></ul>
  <h4>Squalificati</h4><p>Nessun calciatore</p>
  <a href="https://www.fantacalcio.it/infortunati-serie-a">Infortunati</a>
  <ul><li><a href="https://www.fantacalcio.it/serie-a/squadre/como/kean/2097">Kean</a><p>fastidio alla tibia, tentativo rientro da fine dicembre</p></li>
      <li><a href="https://www.fantacalcio.it/serie-a/squadre/como/diao/6967">Diao</a><p>lesione muscolare, da valutare contro Cagliari</p></li></ul>
  <h4>In dubbio</h4>
  <ul><li><a href="https://www.fantacalcio.it/serie-a/squadre/como/chalobah-t/5641">Chalobah T.</a><p>problema muscolare, da valutare</p></li></ul>
</li></ul></body></html>`;

test('Parser fantacalcio.it', () => {
  const r = S.parseLineups(FC_HTML);
  assert.strictEqual(r.round, 12);
  assert.strictEqual(r.modules['Como'], '4-2-3-1');
  const by = (n) => r.players.find((p) => p.name === n);
  assert.deepStrictEqual([by('Butez').status, by('Butez').pct], ['lineup', 90]);
  assert.deepStrictEqual([by('Kaiki').status, by('Kaiki').pct], ['bench', 60]);
  assert.strictEqual(by('Kean').status, 'out');
  assert.strictEqual(by('Diao').status, 'doubt'); // "da valutare"
  assert.strictEqual(by('Chalobah T.').status, 'doubt'); // l'elenco "in dubbio" prevale sulla panchina
  assert.strictEqual(r.players.filter((p) => p.name === 'Douvikas').length, 1);
});

// ---------- Correzione xG/xA: attesi - realizzati ----------
const striker = { id: 's', name: 'Punta', team: 'Roma', role: 'A', roleMantra: ['A'], fmExp: 6.5, fmSeason: 6.5, fmLast5: 6.5, titExp: 90, titSeason: 100, titLast5: 100, unavailableUntilRound: 0 };
const withXg = (x) => E.scorePlayers([striker], { round: 12, xg: [{ name: 'Punta', team: 'Roma', ...x }] })[0];

test('xG sopra i gol segnati: correzione positiva; sotto: negativa', () => {
  const due = withXg({ xg: 9.7, goals: 8 });          // ha segnato meno del previsto -> in credito
  const fortunato = withXg({ xg: 5.5, goals: 9 });    // ha segnato più del previsto -> in debito
  assert.ok(due.xgAdj > 0 && due.xBonus > 0);
  assert.ok(fortunato.xgAdj < 0 && fortunato.xBonus < 0);
  assert.ok(due.ev > fortunato.ev);
  assert.strictEqual(withXg({ xg: 4, goals: 4 }).xBonus, 0);
});

test('Correzione xG: formula, piccola e con tetto', () => {
  const d = withXg({ xg: 9.7, goals: 8 });
  // 0,30 * 3 punti * (9,7 - 8) / 11 giornate giocate = 0,139
  assert.ok(Math.abs(d.xgAdj - 0.14) < 0.011, String(d.xgAdj));
  const estremo = withXg({ xg: 20, goals: 0 });
  assert.strictEqual(estremo.xgAdj, E.DEFAULTS.xgCap);
  assert.strictEqual(withXg({ xg: 0, goals: 30 }).xgAdj, -E.DEFAULTS.xgCap);
});

test('Correzione xA: stesso segno, peso e tetto più piccoli di xG', () => {
  const a = withXg({ xa: 2.7, assists: 1 });
  const b = withXg({ xa: 1.0, assists: 4 });
  assert.ok(a.xaAdj > 0 && b.xaAdj < 0);
  assert.ok(E.DEFAULTS.wXa < E.DEFAULTS.wXg && E.DEFAULTS.xaCap < E.DEFAULTS.xgCap);
  const stessoScarto = withXg({ xg: 5, goals: 3, xa: 5, assists: 3 });
  assert.ok(Math.abs(stessoScarto.xaAdj) < Math.abs(stessoScarto.xgAdj), 'a parità di scarto pesa meno xA');
  assert.strictEqual(withXg({ xa: 99, assists: 0 }).xaAdj, E.DEFAULTS.xaCap);
});

test('xG/xA: dato mancante = nessuna correzione; i portieri sono esclusi', () => {
  assert.strictEqual(withXg({ xg: 9, goals: null }).xgAdj, 0);
  assert.strictEqual(withXg({ xg: 9 }).xBonus, 0);
  const gk = { ...striker, role: 'P', roleMantra: ['Por'] };
  const r = E.scorePlayers([gk], { round: 12, xg: [{ name: 'Punta', team: 'Roma', xg: 9, goals: 0 }] })[0];
  assert.strictEqual(r.xBonus, 0);
});

test('xG/xA: la squadra di FotMob non affidabile non impedisce il match se il nome è univoco', () => {
  const r = E.scorePlayers([striker], { round: 12, xg: [{ name: 'Punta', team: '???', xg: 9, goals: 5 }] })[0];
  assert.ok(r.xgAdj > 0);
});

test('Nessun riferimento alle news nel risultato', () => {
  const r = E.scorePlayers(roster, signals)[0];
  assert.ok(!('news' in r) && !('newsHits' in r));
});

// ---------- Parser FotMob ----------
const FM_XG_HTML = `<html><body><div>
<a href="/it/players/801234/donyell-malen"><span>1</span><img alt=""><span>Donyell Malen</span><span>Gol: 8</span><span>9,7</span></a>
<div class="row"><span>2</span><a href="/it/players/22/gustavo-varela">Gustavo Varela</a><a href="/it/teams/8636/overview/inter">Inter</a><span>Gol: 9</span><span>5,5</span></div>
<ul><li><div>3</div><a href="/it/players/33/nikola-krstovic"><div>Nikola Krstović</div></a><div>Gol: 7</div><div>5,3</div></li></ul>
<a href="/it/players/44/senza-riga"><span>Nome</span></a>
</div></body></html>`;
const FM_XA_HTML = `<html><body>
<div><span>1</span><a href="/it/players/55/paulo-dybala">Paulo Dybala</a><span>Assist: 4</span><span>2,7</span></div>
<div><span>2</span><a href="/it/players/66/federico-dimarco">Federico Dimarco</a><span>Assist: 1</span><span>1,5</span></div>
<div><span>7</span><a href="/it/players/77/emanuele-valeri">Emanuele Valeri</a><span>Assist: 0</span><span>1,1</span></div>
</body></html>`;

test('Parser FotMob xG: righe in forme HTML diverse, virgola decimale, posizione ignorata', () => {
  const r = S.parseFotmobRows(FM_XG_HTML, 'expected_goals');
  const by = (id) => r.find((x) => x.id === id);
  assert.deepStrictEqual([by('801234').name, by('801234').value, by('801234').sub], ['donyell malen', 9.7, 8]);
  assert.deepStrictEqual([by('22').value, by('22').sub, by('22').team], [5.5, 9, 'Inter']);
  assert.deepStrictEqual([by('33').value, by('33').sub], [5.3, 7]);
  assert.strictEqual(by('44'), undefined, 'un link senza valori non è una riga');
});

test('Parser FotMob xA: assist e xA, anche con 0 assist', () => {
  const r = S.parseFotmobRows(FM_XA_HTML, 'expected_assists');
  const by = (id) => r.find((x) => x.id === id);
  assert.deepStrictEqual([by('55').value, by('55').sub], [2.7, 4]);
  assert.deepStrictEqual([by('77').value, by('77').sub], [1.1, 0]);
});

test('Parser FotMob JSON (data.fotmob.com e __NEXT_DATA__)', () => {
  const json = { TopLists: [{ StatName: 'expected_goals', StatList: [
    { ParticipantId: 1, ParticipantName: 'Donyell Malen', TeamName: 'Roma', StatValue: 9.7, SubStatValue: 8 },
    { ParticipantId: 2, ParticipantName: 'Marcus Thuram', TeamName: 'Inter', StatValue: '4,9', SubStatValue: 6 }] }] };
  const r = S.parseFotmobJson(json);
  assert.deepStrictEqual(r.map((x) => [x.name, x.value, x.sub]), [['Donyell Malen', 9.7, 8], ['Marcus Thuram', 4.9, 6]]);
  const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: json } })}</script></html>`;
  assert.strictEqual(S.parseFotmobEmbedded(html).length, 2);
  assert.deepStrictEqual(S.parseFotmobJson({ a: 1 }), []);
});

test('Unione xG + xA e match con il database', () => {
  const xgRows = S.parseFotmobRows(FM_XG_HTML, 'expected_goals');
  const xaRows = [{ id: '801234', name: 'donyell malen', team: '', value: 0.4, sub: 0 }, { id: '55', name: 'paulo dybala', team: '', value: 2.7, sub: 4 }];
  const list = S.mergeFotmob(xgRows, xaRows);
  const malen = list.find((x) => x.name === 'donyell malen');
  assert.deepStrictEqual([malen.xg, malen.goals, malen.xa, malen.assists], [9.7, 8, 0.4, 0]);
  assert.ok(list.find((x) => x.name === 'paulo dybala').xg === null);
  assert.ok(E.findBestLenient(list, 'name', 'team', 'Malen', 'Roma'));
  assert.ok(E.findBestLenient(list, 'name', 'team', 'Varela G.', 'Inter'));
});


// ---------- Stato di forma: FM attesa + FM stagione + FM ultime 5 ----------
const base = { id: 'x', name: 'Prova', team: 'Roma', role: 'C', roleMantra: ['C'], unavailableUntilRound: 0 };

test('Forma: giocatore in crescita (ultime 5 alte) batte uno stabile con stessa FM attesa', () => {
  const up = { ...base, id: 'up', fmExp: 6, fmSeason: 6, fmLast5: 7.5, titExp: 90, titSeason: 100, titLast5: 100 };
  const flat = { ...base, id: 'flat', fmExp: 6, fmSeason: 6, fmLast5: 6, titExp: 90, titSeason: 100, titLast5: 100 };
  const [a, b] = E.scorePlayers([up, flat], {});
  assert.ok(a.form > b.form + 0.3);
  assert.strictEqual(a.trend, 'up');
});

test('Forma: ultime 5 su una sola presenza pesano poco', () => {
  const lucky = { ...base, id: 'l', fmExp: 6, fmSeason: 6, fmLast5: 10, titExp: 90, titSeason: 100, titLast5: 20 };
  const solid = { ...base, id: 's', fmExp: 6, fmSeason: 6, fmLast5: 10, titExp: 90, titSeason: 100, titLast5: 100 };
  const [a, b] = E.scorePlayers([lucky, solid], {});
  assert.ok(a.form < b.form, 'una presenza non vale come cinque');
  assert.ok(a.form < 6.9, 'e non trascina la forma a 8+');
});

test('Forma: zero nel listone = nessun dato, si usa la FM attesa', () => {
  const rookie = { ...base, id: 'r', fmExp: 6.4, fmSeason: 0, fmLast5: 0, titExp: 70, titSeason: 0, titLast5: 0 };
  const [r] = E.scorePlayers([rookie], {});
  assert.strictEqual(r.fmSeason, null);
  assert.strictEqual(r.fmLast5, null);
  assert.ok(Math.abs(r.form - 6.4) < 0.01);
});

test('Senza probabili formazioni: titolarità attesa del listone e indisponibilità', () => {
  const ok = { ...base, id: 'ok', fmExp: 6, fmSeason: 6, fmLast5: 6, titExp: 85, titSeason: 100, titLast5: 100 };
  const out = { ...base, id: 'out', fmExp: 7, fmSeason: 7, fmLast5: 7, titExp: 90, titSeason: 100, titLast5: 100, unavailableUntilRound: 14 };
  const [a, b] = E.scorePlayers([ok, out], { round: 12 });
  assert.strictEqual(a.prob, 0.85);
  assert.strictEqual(b.prob, 0);
  assert.ok(b.notes.some((n) => /giornata 14/.test(n)));
});
