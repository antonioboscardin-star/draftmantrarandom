# FantaFormazione

Web app che propone la formazione migliore per la prossima giornata di Serie A, per leghe **Classic** e **Mantra**.
Un solo file di pagina (`index.html`), nessuna Cloud Function: i dati online li legge un job pianificato di GitHub Actions.

## Come è fatto

| Pezzo | Dove | Cosa fa |
|---|---|---|
| `index.html` | GitHub Pages (cartella dedicata del tuo repo) | Tutta l'app: login, rose, import Listone, motore di calcolo |
| Login Google + Firestore | Firebase (piano gratuito Spark) | Utenti, database giocatori (scrive solo l'admin), rose private |
| `scraper/` + workflow | GitHub Actions | Ogni 3 ore (ogni ora sab/dom) legge fantacalcio.it e FotMob e scrive `signals.json` nel branch `fantaformazione-data` |

Su Firebase si fa una volta sola: abilitare Google, creare Firestore, incollare le regole (`firestore.rules`) dalla console. Niente CLI, niente piano Blaze.

## Cosa fa

- **Rosa**: nome lega, tipologia (Classic/Mantra), nome squadra, da 25 a 36 giocatori scelti dal database. Ogni utente vede solo le proprie squadre.
- **Database giocatori** (Firestore `players`): si aggiorna dall'admin caricando `Listone_FC.xlsx` (anteprima delle differenze prima di scrivere). Il ruolo Classic viene dalla colonna `roleClassic`.
- **Proponi formazione migliore**: la pagina scarica `signals.json`, combina i dati col database e mostra modulo, titolari, panchina, capitano, moduli alternativi e, per ogni giocatore, i motivi.

## Fonti online (solo queste)

- Probabili formazioni, indisponibili, squalificati, dubbi: https://www.fantacalcio.it/probabili-formazioni-serie-a
- xG e gol: https://www.fotmob.com/it/leagues/55/stats/season/36072/players/expected_goals
- xA e assist: https://www.fotmob.com/it/leagues/55/stats/season/36072/players/expected_assists

L'id stagione di FotMob (`36072`) cambia ogni anno: si aggiorna con la variabile `FOTMOB_SEASON_ID` nel workflow.

## Come ragiona il motore

`valore = p × (forma + correzione xG/xA) + (1−p)·p × soglia_sostituto`, con `p` = titolarità prevista.

| Componente | Fonte | Peso |
|---|---|---|
| Forma | FM attesa 30% + FM stagione 30% + FM ultime 5 40% (Listone); le medie su poche presenze vengono avvicinate alla precedente; ▲/▼ se le ultime 5 sono nettamente sopra/sotto la stagione | base |
| Titolarità `p` | % di fantacalcio.it; indisponibile/squalificato = 0; "in dubbio" ≤ 40%. Senza probabili formazioni: titolarità attesa e indisponibilità del Listone | moltiplicatore |
| Correzione xG | `0,30 × 3 punti × (xG − gol) / giornate giocate`, tetto ±0,30. Positiva se ha segnato meno del previsto, negativa se di più | piccola |
| Correzione xA | `0,15 × 1 punto × (xA − assist) / giornate giocate`, tetto ±0,10. Stesso segno, peso e tetto più piccoli | molto piccola |
| Rischio | Prudente 3 / Bilanciato 4,5 / Aggressivo 5,5 come rendimento del sostituto | selettore in app |

I parametri sono in `DEFAULTS`, nel blocco ENGINE di `index.html`.

- **Classic**: miglior giocatore per reparto nei 7 moduli classici, vince il modulo con valore totale maggiore.
- **Mantra**: assegnazione ai ruoli di ogni modulo con l'algoritmo ungherese (ottimo).

## Test

```bash
npm install
npm test
```

I test leggono il codice direttamente da `index.html` (blocchi `LISTONE` ed `ENGINE`). Con `LISTONE_JSON=<file>` provano anche un Listone reale esportato in JSON.

## Limiti da conoscere

- **Parsing non provato dal vivo.** I parser di fantacalcio.it e FotMob sono scritti sulla struttura delle pagine e coperti da test su HTML di esempio, ma da qui non ho potuto raggiungere i siti. Il primo avvio del workflow dirà se funzionano: se una fonte fallisce, l'app la segnala e usa valori neutri.
- **Possibili blocchi.** Alcuni siti rifiutano le richieste dai server di GitHub (errore 403). In quel caso la fonte risulta "non disponibile".
- **Mantra approssimato.** Gli slot in `MANTRA_MODULES` sono una ricostruzione ragionevole: confrontali con il regolamento della tua lega. Non gestisce il "fuori ruolo".
- **Abbinamento nomi.** Gli xG/xA si abbinano al database per nome (e squadra, quando c'è); giocatori con nomi molto particolari possono restare senza correzione, che allora vale zero.
- **Job pianificati.** GitHub sospende i workflow pianificati dopo 60 giorni senza attività nel repository: si riattivano dalla scheda Actions.
- **Condizioni d'uso.** Verifica le condizioni d'uso di fantacalcio.it e FotMob per l'uso che ne fai.
- Strumento di supporto alla scelta, non garantisce punteggi.
