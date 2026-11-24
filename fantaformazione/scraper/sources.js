/**
 * Lettura delle fonti online (eseguita da GitHub Actions: dal browser CORS lo impedirebbe).
 *  - fantacalcio.it → probabili formazioni, indisponibili, squalificati, in dubbio
 *  - fotmob.com     → xG e xA di campionato, con gol e assist realmente segnati; classifica (punti)
 *
 * Il parsing è tollerante (link, testi e JSON incorporato, non classi CSS) ma resta legato
 * all'HTML dei siti: se cambiano, la fonte restituisce un errore che finisce in signals.json
 * e l'app mostra "non disponibile" usando valori neutri.
 */
import * as cheerio from 'cheerio';

const UA = process.env.FF_USER_AGENT || 'Mozilla/5.0 (compatible; FantaFormazione/1.0; uso personale)';
const FETCH_OPTS = () => ({
  headers: { 'user-agent': UA, 'accept-language': 'it-IT,it;q=0.9' },
  signal: AbortSignal.timeout(25000),
});

async function getText(url) {
  const res = await fetch(url, FETCH_OPTS());
  if (!res.ok) throw new Error(`HTTP ${res.status} su ${new URL(url).hostname}`);
  return res.text();
}

// ---------------------------------------------------------------------------
// fantacalcio.it — probabili formazioni
// ---------------------------------------------------------------------------
const FC_URL = 'https://www.fantacalcio.it/probabili-formazioni-serie-a';
const EURO_URL = process.env.FF_EURO_URL || 'https://www.fantacalcio.it/probabili-formazioni-euro-leghe';
// Serie A: /serie-a/squadre/<squadra>/<giocatore>/<id>   Euro Leghe: /euroleghe/squadre/<squadra>/<giocatore>/<id>
const PLAYER_HREF = /\/(?:serie-a|euroleghe)\/squadre\/([^/]+)\/([^/]+)\/(\d+)\/?$/;
const TEAM_HREF = /\/(?:serie-a|euroleghe)\/squadre\/[^/]+\/?$/;
const MODULE_RE = /^\d-\d(-\d){1,2}$/;

function parseLineups(html) {
  const $ = cheerio.load(html);
  const bodyText = $('body').text();
  const roundMatch = bodyText.match(/Giornata\s+(\d{1,2})/);
  const round = roundMatch ? Number(roundMatch[1]) : null;

  let section = 'lineup';
  let lastTeam = null;
  const modules = {};
  const map = new Map(); // key = teamSlug|id
  const starters = new Map(); // titolari già contati per squadra

  // Titoletti di sezione (testo semplice, in qualunque tag: anche <li>, <b>, <th>, o testo accanto a una lista)
  const SECTION_HEADS = [[/^panchina$/i, 'bench'], [/^ballottaggi$/i, 'ballot'], [/^squalificati$/i, 'suspended'], [/^diffidati$/i, 'diffidati'], [/^in dubbio$/i, 'doubt'], [/^infortunati$/i, 'injured']];
  const headSection = (t) => { const h = SECTION_HEADS.find(([re]) => re.test(t)); return h ? h[1] : null; };

  $('body *').each((_, el) => {
    const $el = $(el);
    const tag = (el.tagName || '').toLowerCase();

    if (tag === 'h2') section = 'lineup';
    if (tag !== 'a') {
      for (const n of el.children || []) {
        if (n.type !== 'text') continue;
        const hs = headSection(String(n.data || '').replace(/\s+/g, ' ').trim());
        if (hs) section = hs;
      }
    }

    if (tag === 'a') {
      const href = $el.attr('href') || '';
      if (/infortunati-serie-a\/?$/.test(href)) { section = 'injured'; return; }
      const m = href.match(PLAYER_HREF);
      if (!m) return;
      const [, teamSlug, , id] = m;
      const name = $el.text().replace(/\s+/g, ' ').trim();
      if (!name) return;
      const li = $el.closest('li');
      const liText = li.length ? li.text().replace(/\s+/g, ' ').trim() : '';
      const pctMatch = liText.match(/(\d{1,3})\s*%/);
      const pct = pctMatch ? Number(pctMatch[1]) : null;
      const key = `${teamSlug}|${id}`;

      if (section === 'lineup' || section === 'bench') {
        if (pct == null) return; // elenco "campioncini" in testata partita, senza percentuale
        if (!map.has(key)) {
          // I titolari sono 11 per squadra: dal 12° giocatore con percentuale in poi è panchina, anche se il titoletto non è stato riconosciuto
          const n = starters.get(teamSlug) || 0;
          const isBench = section === 'bench' || (section === 'lineup' && n >= 11);
          if (!isBench) starters.set(teamSlug, n + 1);
          map.set(key, { name, team: teamSlug, id, pct, status: isBench ? 'bench' : 'lineup' });
        }
      } else if (section === 'injured' || section === 'doubt' || section === 'suspended') {
        const note = liText.replace(name, '').trim();
        let status = section === 'suspended' ? 'suspended' : section === 'doubt' ? 'doubt' : 'out';
        if (status === 'out' && /da valutare|in dubbio|in forse/i.test(note)) status = 'doubt';
        map.set(key, { name, team: teamSlug, id, pct: null, status, note: note.slice(0, 160) });
      }
      // 'ballot' e 'diffidati' non cambiano la titolarità: la % è già nelle liste titolari/panchina
      return;
    }

    if ($el.children().length === 0) {
      const t = $el.text().replace(/\s+/g, ' ').trim();
      if (!t) return;
      if (tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'p' || tag === 'div' || tag === 'span' || tag === 'strong') {
        if (/^panchina$/i.test(t)) section = 'bench';
        else if (/^ballottaggi$/i.test(t)) section = 'ballot';
        else if (/^squalificati$/i.test(t)) section = 'suspended';
        else if (/^diffidati$/i.test(t)) section = 'diffidati';
        else if (/^in dubbio$/i.test(t)) section = 'doubt';
        else if (/^infortunati$/i.test(t)) section = 'injured';
        else if (MODULE_RE.test(t) && lastTeam) modules[lastTeam] = t;
        else if (tag === 'h3' && !/^(presentazione|dettaglio)/i.test(t)) { lastTeam = t; section = 'lineup'; }
        else if (tag === 'h3') section = 'lineup';
      }
    }
  });

  // Partite: ogni intestazione <h2> con DUE link a squadre (/serie-a/squadre/<slug>) = casa, trasferta
  const matches = [];
  const seenM = new Set();
  $('h2').each((_, el) => {
    const teams = [];
    $(el).find('a').each((__, a) => {
      const href = $(a).attr('href') || '';
      if (TEAM_HREF.test(href)) {
        const name = $(a).text().replace(/\s+/g, ' ').trim();
        if (name) teams.push(name);
      }
    });
    if (teams.length !== 2) {
      // senza link alle squadre: testo del titolo, es. "10 Arsenal vs Chelsea"
      const t = $(el).text().replace(/\s+/g, ' ').trim();
      const mm = t.match(/^(?:\d{1,2}\s+)?(.+?)\s+(?:vs\.?|-|–)\s+(.+)$/i);
      if (mm) { teams.length = 0; teams.push(mm[1].trim(), mm[2].trim()); }
    }
    if (teams.length === 2 && !seenM.has(teams.join('|'))) {
      seenM.add(teams.join('|'));
      const clean = (n) => n.replace(/^\s*\d{1,2}\s+/, '').replace(/(?:[\s\-–:\/]+\d{1,2}(?:[\/:.\-–]\d{1,2})*)*[\s\-–:\/]*$/, '').trim();
      matches.push({ home: clean(teams[0]), away: clean(teams[1]) });
    }
  });

  const players = [...map.values()];
  if (!players.length) throw new Error('nessun giocatore riconosciuto nella pagina (struttura cambiata?)');
  return { round, modules, matches, players };
}

async function fetchLineups() {
  const html = await getText(FC_URL);
  return parseLineups(html);
}

// Euro Leghe (Premier League, Liga, Bundesliga, Ligue 1): stessa struttura della pagina di Serie A
async function fetchEuroLineups() {
  const html = await getText(EURO_URL);
  return parseLineups(html);
}

// ---------------------------------------------------------------------------
// FotMob — xG / xA con gol e assist
// ---------------------------------------------------------------------------
// Serie A = lega 55. L'id stagione cambia ogni anno: si può sovrascrivere con FOTMOB_SEASON_ID.
const FM_LEAGUE = process.env.FOTMOB_LEAGUE_ID || '55';
const FM_SEASON = process.env.FOTMOB_SEASON_ID || '36072';
const fmPage = (stat) => `https://www.fotmob.com/it/leagues/${FM_LEAGUE}/stats/season/${FM_SEASON}/players/${stat}`;
const fmJson = (stat) => `https://data.fotmob.com/stats/${FM_LEAGUE}/season/${FM_SEASON}/${stat}.json`;

const toNumber = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v == null) return null;
  const n = Number(String(v).replace(',', '.').trim());
  return Number.isFinite(n) ? n : null;
};

const nameFromSlug = (slug) => decodeURIComponent(slug || '').replace(/[-_.]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Riga della classifica: "<pos> <nome> Gol: 8 9,7" (ordine tollerato). Ritorna { value, sub }. */
function parseRowNumbers(text, subLabelRe) {
  const t = text.replace(/\s+/g, ' ').trim();
  const sm = t.match(subLabelRe);
  const sub = sm ? toNumber(sm[1]) : null;
  const rest = sm ? t.replace(sm[0], ' ') : t;
  const nums = (rest.match(/\d+(?:[.,]\d+)?/g) || []).map(toNumber).filter((n) => n != null);
  if (nums.length >= 2 && /^\s*\d+\s/.test(rest)) nums.shift(); // posizione in classifica
  const value = nums.length ? nums[nums.length - 1] : null;
  return { value, sub };
}

/** Testo di un nodo con uno spazio fra gli elementi (cheerio .text() li incolla: "Gol: 8" + "9,7" -> "Gol: 89,7"). */
function spacedText($, node) {
  const stripped = $.html(node).replace(/<[^>]*>/g, ' ');
  return cheerio.load(`<p>${stripped}</p>`)('p').text().replace(/\s+/g, ' ').trim();
}

/** Strategia A: righe della classifica nell'HTML (link /players/<id>/<slug>). */
function parseFotmobRows(html, stat) {
  const $ = cheerio.load(html);
  const subRe = stat === 'expected_goals' ? /(?:gol|goals?)\s*:?\s*(\d+)/i : /(?:assist|assists)\s*:?\s*(\d+)/i;
  const PL = /\/players\/(\d+)\/([^/?#]+)/;
  const out = new Map();
  $('a[href*="/players/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const m = href.match(PL);
    if (!m) return;
    const [, id, slug] = m;
    // risale fino alla riga che contiene un solo giocatore e l'etichetta Gol:/Assist:
    let node = $(el), row = null;
    for (let i = 0; i < 7 && node.length; i++) {
      const links = node.find('a[href*="/players/"]').addBack('a[href*="/players/"]');
      const distinct = new Set(links.map((_, a) => ($(a).attr('href') || '').match(PL)?.[1]).get());
      if (distinct.size > 1) break;
      if (subRe.test(spacedText($, node))) { row = node; break; }
      node = node.parent();
    }
    if (!row) return;
    const { value, sub } = parseRowNumbers(spacedText($, row), subRe);
    if (value == null) return;
    const teamLink = row.find('a[href*="/teams/"]').first();
    const teamSlug = (teamLink.attr('href') || '').match(/\/teams\/\d+\/[^/]+\/([^/?#]+)/);
    const team = teamLink.text().trim() || (teamSlug ? nameFromSlug(teamSlug[1]) : '');
    if (!out.has(id)) out.set(id, { id, name: nameFromSlug(slug), team, value, sub });
  });
  return [...out.values()];
}

/** Strategia B: JSON (incorporato nella pagina o data.fotmob.com): cerca liste di { nome, valore, sottovalore }. */
function walkStatLists(node, acc = []) {
  if (Array.isArray(node)) {
    const hit = node.length && node.every((x) => x && typeof x === 'object' && !Array.isArray(x)) &&
      node.some((x) => (x.ParticipantName || x.name) && (x.StatValue != null || x.value != null));
    if (hit) acc.push(node);
    node.forEach((x) => walkStatLists(x, acc));
  } else if (node && typeof node === 'object') {
    Object.values(node).forEach((x) => walkStatLists(x, acc));
  }
  return acc;
}

function parseFotmobJson(json) {
  const lists = walkStatLists(json);
  if (!lists.length) return [];
  const biggest = lists.sort((a, b) => b.length - a.length)[0];
  return biggest.map((x) => ({
    id: String(x.ParticipantId ?? x.id ?? ''),
    name: String(x.ParticipantName ?? x.name ?? '').trim(),
    team: String(x.TeamName ?? x.teamName ?? '').trim(),
    value: toNumber(x.StatValue ?? x.value),
    sub: toNumber(x.SubStatValue ?? x.subStatValue),
  })).filter((x) => x.name && x.value != null);
}

function parseFotmobEmbedded(html) {
  const m = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return [];
  try { return parseFotmobJson(JSON.parse(m[1])); } catch { return []; }
}

async function fetchFotmobStat(stat) {
  const attempts = [];
  try {
    const html = await getText(fmPage(stat));
    let rows = parseFotmobRows(html, stat);
    if (rows.length) return rows;
    rows = parseFotmobEmbedded(html);
    if (rows.length) return rows;
    const url = (html.match(/https:\/\/data\.fotmob\.com\/stats\/[^"'\\\s]+\.json/) || [])[0];
    attempts.push(url ? 'pagina senza classifica leggibile' : 'pagina senza classifica leggibile né link ai dati');
    if (url) { const r = parseFotmobJson(JSON.parse(await getText(url))); if (r.length) return r; }
  } catch (e) { attempts.push(String(e.message || e)); }
  try {
    const r = parseFotmobJson(JSON.parse(await getText(fmJson(stat))));
    if (r.length) return r;
    attempts.push('JSON dati vuoto');
  } catch (e) { attempts.push(String(e.message || e)); }
  throw new Error(`FotMob ${stat}: ${attempts.join(' / ')} (struttura cambiata o accesso bloccato?)`);
}

/** Unisce le due classifiche per giocatore: { name, team, xg, goals, xa, assists }. */
function mergeFotmob(xgRows, xaRows) {
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const map = new Map();
  const key = (r) => (r.id ? `id:${r.id}` : `n:${norm(r.name)}`);
  const get = (r) => {
    const k = key(r);
    if (!map.has(k)) map.set(k, { name: r.name, team: r.team || '', xg: null, goals: null, xa: null, assists: null });
    const rec = map.get(k);
    if (!rec.team && r.team) rec.team = r.team;
    return rec;
  };
  xgRows.forEach((r) => { const rec = get(r); rec.xg = r.value; rec.goals = r.sub; });
  xaRows.forEach((r) => { const rec = get(r); rec.xa = r.value; rec.assists = r.sub; });
  return [...map.values()];
}

async function fetchXg() {
  const [g, a] = await Promise.allSettled([fetchFotmobStat('expected_goals'), fetchFotmobStat('expected_assists')]);
  if (g.status === 'rejected' && a.status === 'rejected') throw g.reason;
  const out = mergeFotmob(g.status === 'fulfilled' ? g.value : [], a.status === 'fulfilled' ? a.value : []);
  if (!out.length) throw new Error('nessuna statistica xG/xA riconosciuta');
  out.partial = [g, a].filter((r) => r.status === 'rejected').map((r) => String(r.reason.message || r.reason));
  return out;
}

// ---------------------------------------------------------------------------
// FotMob — classifica (punti), per il fattore "difficoltà della partita"
// ---------------------------------------------------------------------------
const FM_TABLE_PAGE = `https://www.fotmob.com/it/leagues/${FM_LEAGUE}/table/teams`;
const FM_LEAGUE_API = `https://www.fotmob.com/api/leagues?id=${FM_LEAGUE}&ccode3=ITA`;

/** JSON FotMob: cerca le liste di squadre { name, pts, played }; sceglie "all" (la con più partite giocate). */
function parseFotmobTableJson(json) {
  const found = [];
  (function walk(n) {
    if (Array.isArray(n)) {
      const ok = n.length >= 8 && n.every((x) => x && typeof x === 'object' && typeof x.pts === 'number' && (x.name || x.shortName));
      if (ok) found.push(n);
      n.forEach(walk);
    } else if (n && typeof n === 'object') Object.values(n).forEach(walk);
  })(json);
  if (!found.length) return [];
  const played = (l) => l.reduce((a, x) => a + (Number(x.played) || 0), 0);
  const best = found.reduce((a, b) => (played(b) > played(a) ? b : a));
  return best.map((x) => ({ name: String(x.name || x.shortName).trim(), pts: x.pts, played: Number(x.played) || null }));
}

function parseFotmobTableEmbedded(html) {
  const m = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return [];
  try { return parseFotmobTableJson(JSON.parse(m[1])); } catch { return []; }
}

/** HTML: righe con link /teams/<id>/... e colonne "pos, PG, V, N, P, GF-GS, DR, Pt". */
function parseFotmobTableRows(html) {
  const $ = cheerio.load(html);
  const TEAM = /\/teams\/(\d+)\//;
  const out = new Map();
  $('a[href*="/teams/"]').each((_, el) => {
    const m = ($(el).attr('href') || '').match(TEAM);
    if (!m || !$(el).text().trim()) return; // i link solo-logo (prossima avversaria, forma) non sono la squadra della riga
    let node = $(el), row = null;
    for (let i = 0; i < 6 && node.length; i++) {
      const ids = new Set(node.find('a[href*="/teams/"]').addBack('a[href*="/teams/"]').map((_, a) => ($(a).attr('href') || '').match(TEAM)?.[1]).get());
      if (ids.size > 2) break;
      const t = spacedText($, node).replace(/\d+\s*-\s*\d+/g, ' ').replace(/[+\-−]\s*\d+/g, ' ');
      if ((t.match(/\b\d+\b/g) || []).length >= 6) { row = { node, text: t }; break; }
      node = node.parent();
    }
    if (!row) return;
    const nums = (row.text.match(/\b\d+\b/g) || []).map(Number);
    const [, played, w, d] = nums;
    let pts = nums[nums.length - 1];
    // controllo di coerenza: punti ~ 3*V + N (salvo penalizzazioni)
    if (!(Number.isFinite(pts) && Number.isFinite(w) && Number.isFinite(d) && Math.abs(pts - (3 * w + d)) <= 15)) return;
    const first = row.node.find('a[href*="/teams/"]').addBack('a[href*="/teams/"]').filter((_, a) => $(a).text().trim()).first();
    const slug = ($(el).attr('href') || '').match(/\/teams\/\d+\/[^/]+\/([^/?#]+)/);
    const name = first.text().replace(/\s+/g, ' ').trim() || (slug ? nameFromSlug(slug[1]) : '');
    if (name && !out.has(m[1]) && !(played > 0 && pts > 3 * played)) out.set(m[1], { name, pts, played });
  });
  return [...out.values()];
}

async function fetchTable() {
  const attempts = [];
  try {
    const html = await getText(FM_TABLE_PAGE);
    let r = parseFotmobTableEmbedded(html);
    if (r.length >= 8) return r;
    r = parseFotmobTableRows(html);
    if (r.length >= 8) return r;
    attempts.push('pagina senza classifica leggibile');
  } catch (e) { attempts.push(String(e.message || e)); }
  try {
    const r = parseFotmobTableJson(JSON.parse(await getText(FM_LEAGUE_API)));
    if (r.length >= 8) return r;
    attempts.push('API senza classifica');
  } catch (e) { attempts.push(String(e.message || e)); }
  throw new Error(`FotMob classifica: ${attempts.join(' / ')} (struttura cambiata o accesso bloccato?)`);
}

// ---------------------------------------------------------------------------
async function fetchAll() {
  const errors = {};
  const out = { fetchedAt: Date.now(), round: null, lineups: { modules: {}, players: [] }, matches: [], xg: [], table: [], euroLineups: { round: null, modules: {}, players: [] }, euroMatches: [], errors };

  const [l, x, t, eu] = await Promise.allSettled([fetchLineups(), fetchXg(), fetchTable(), fetchEuroLineups()]);
  if (eu.status === 'fulfilled') {
    out.euroLineups = { round: eu.value.round, modules: eu.value.modules, players: eu.value.players };
    out.euroMatches = eu.value.matches || [];
    if (!out.euroMatches.length) errors.euroMatches = 'partite non riconosciute nella pagina Euro Leghe';
  } else errors.euro = String((eu.reason && eu.reason.message) || eu.reason);
  if (l.status === 'fulfilled') {
    out.round = l.value.round;
    out.lineups = { modules: l.value.modules, players: l.value.players };
    out.matches = l.value.matches || [];
    if (!out.matches.length) errors.matches = 'partite non riconosciute nella pagina delle probabili formazioni';
  } else errors.lineups = String((l.reason && l.reason.message) || l.reason);
  if (x.status === 'fulfilled') {
    out.xg = [...x.value];
    if (x.value.partial && x.value.partial.length) errors.xgPartial = x.value.partial.join(' / ');
  } else errors.xg = String((x.reason && x.reason.message) || x.reason);
  if (t.status === 'fulfilled') out.table = t.value;
  else errors.table = String((t.reason && t.reason.message) || t.reason);
  return out;
}

export {
  fetchAll, parseLineups, fetchEuroLineups, parseFotmobRows, parseFotmobJson, parseFotmobEmbedded, mergeFotmob,
  parseFotmobTableJson, parseFotmobTableEmbedded, parseFotmobTableRows,
};
