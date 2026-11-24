# FantaFormazione

Web app (Firebase) che propone la formazione migliore per la prossima giornata di Serie A,
per leghe **Classic** e **Mantra**.

## Cosa fa

- **Login con Google** (Firebase Authentication).
- **Rosa**: nome lega, tipologia (Classic/Mantra), nome squadra, **da 25 a 36 giocatori** scelti dal database.
  Ogni utente vede solo le proprie squadre.
- **Database giocatori** (Firestore, collezione `players`): nome, squadra, ruolo (P/D/C/A), ruolo/i Mantra,
  fantamedia delle ultime giornate, fantamedia attesa. **Scrivibile solo da un admin**, leggibile da tutti gli utenti loggati.
- **Proponi formazione migliore**: una Cloud Function legge online
  - probabili formazioni, indisponibili, squalificati, dubbi → https://www.fantacalcio.it/probabili-formazioni-serie-a
  - xG e xA di campionato → https://www.365scores.com/it/football/league/serie-a-17/stats
  - news "consigli fantacalcio" della giornata (Google News RSS)
  e le combina con i dati del DB. Mostra modulo, titolari, panchina, capitano, moduli alternativi,
  e per ogni giocatore i motivi (FM, titolarità, xG/xA, news).

## Struttura

```
firebase.json            hosting + firestore + functions
firestore.rules          sicurezza (admin-only sul DB giocatori, rose private)
public/index.html        l'app (da configurare con la tua firebaseConfig)
functions/engine.js      calcolo (puro, con test)
functions/sources.js     lettura fonti online
functions/index.js       Cloud Function callable `proposeLineup` + cache segnali
functions/test/          test automatici (npm test)
```

## Messa online (una tantum)

1. Crea un progetto su https://console.firebase.google.com
2. **Authentication** → Sign-in method → abilita **Google**.
3. **Firestore Database** → crea il database (modalità produzione, regione europea).
4. **Passa al piano Blaze** (pay-as-you-go): serve alle Cloud Functions per chiamare siti esterni.
   Con l'uso personale i costi sono di norma trascurabili (i dati online vengono letti al massimo ogni 2 ore, condivisi fra tutti).
5. **Project settings → Your apps → Web app** → copia `firebaseConfig` dentro `public/index.html` (blocco "CONFIGURAZIONE").
6. Dal terminale:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use --add            # scegli il progetto
   cd functions && npm install && npm test && cd ..
   firebase deploy
   ```
7. **Rendi admin il tuo utente**: accedi una volta all'app, poi in Firebase Console → Authentication copia il tuo **UID**,
   poi Firestore → crea la collezione `admins` → documento con ID = il tuo UID (può essere vuoto o con un campo qualsiasi).
   Le regole impediscono di crearlo dall'app: solo dalla console.
8. Nel menu **Admin database** importa i giocatori da CSV.

## Formato CSV del database

```
Nome;Squadra;Ruolo;RuoloMantra;FM_Attesa;FM_Ultime
Maignan;Milan;P;Por;6.3;6|6.5|6
Rabiot;Milan;C;M/C;7;7.5|6.5|8
Bremer;Juventus;D;Dc;6.5;6.5|6.5|7
```

- Usa i nomi **come nel listone fantacalcio** ("Cognome N.", es. `Paz N.`): è lo stesso formato di fantacalcio.it e rende preciso l'abbinamento.
- `FM_Ultime`: dalla più vecchia alla più recente, le più recenti pesano di più.
- Un nome già presente (stessa squadra) viene aggiornato: puoi reimportare il CSV ogni settimana.

## Come ragiona il motore

Per ogni giocatore: `valore = p × (forma + bonus xG/xA + news) + (1−p)·p × soglia_sostituto`, con `p` = titolarità prevista.

| Componente | Fonte | Peso |
|---|---|---|
| Forma | 55% FM ultime giornate (ultime più pesanti) + 45% FM attesa | base |
| Titolarità `p` | % di fantacalcio.it; indisponibile/squalificato = 0; "da valutare" ≤ 40% | moltiplicatore |
| xG/xA | 365scores: (3·xG + xA) / partite giocate, tetto 3, peso 0,25 | piccolo bonus |
| News | frasi con il cognome del giocatore + parole positive/negative, ±0,15/0,25, tetto ±0,5 | piccolo |
| Rischio | Prudente 3 / Bilanciato 4,5 / Aggressivo 5,5 come rendimento del sostituto | selettore in app |

- **Classic**: sceglie il miglior giocatore per reparto nei 7 moduli classici e prende il modulo con valore totale maggiore.
- **Mantra**: assegna i giocatori agli slot di ogni modulo con l'**algoritmo ungherese** (ottimo), rispettando i ruoli Mantra.

## Limiti da conoscere

- **Moduli e slot Mantra approssimati.** In `functions/engine.js` (`MANTRA_MODULES`) gli slot sono una ricostruzione ragionevole dei ruoli ammessi:
  confrontali con il regolamento della tua lega e correggili se serve. Per ora non gestisce il "fuori ruolo" (malus).
- **xG/xA parziali.** La pagina 365scores mostra solo le classifiche dei primi giocatori (circa 7–15 per voce): chi non compare riceve bonus zero, non "dato mancante".
  Per copertura completa serve una fonte dati dedicata.
- **Parsing legato all'HTML dei siti.** L'ho scritto sulla struttura che le due pagine hanno oggi (verificata il 20/11/2026) e coperto con test su HTML di esempio,
  ma non è stato provato dal vivo da dentro Firebase. Se un sito cambia, l'app lo segnala (etichetta rossa) e usa valori neutri.
- **Condizioni d'uso dei siti.** Le due pagine sono lette solo per uso personale e con cache di 2 ore; verifica che le loro condizioni d'uso ti vadano bene, soprattutto se apri l'app ad altri utenti.
- **News**: l'analisi è per parole chiave, un'euristica semplice. I link sono mostrati per controllare.
- Strumento di supporto alla scelta, non garantisce punteggi.


## Leghe Euroleghe

- Nel form della squadra c'è il campo **Euroleghe (Sì/No)**: si sceglie alla creazione e **non si può più cambiare** dopo il primo salvataggio (lo blocca anche `firestore.rules`). Le leghe esistenti valgono "No" e non cambiano.
- La tipologia resta **Classic** o **Mantra**: moduli e vincoli di formazione sono gli stessi.
- **Listone Euroleghe**: in *Admin → Aggiorna Listone Euroleghe* si carica `ListoneEuroLeghe.xlsx` (colonne `#`, `Nome`, `Sq.`, `R.`, `R.MANTRA`, `FM`, …). I giocatori sono nella collezione separata `euroPlayers` (id = colonna `#`), quindi **Statistiche resta invariata**.
- **FV Euroleghe** = FM del listone Euroleghe. Niente difficoltà, campo, classifica o xG/xA. La titolarità arriva da `probabili-formazioni-euro-leghe` (fantacalcio.it) per le squadre non di Serie A e dalla pagina Serie A per le squadre di Serie A; vale la precedenza al 60%.
- **Risultati**: le Euroleghe hanno 30 giornate; filtri separati *Giornata Serie A* / *Giornata Euroleghe* (default: l'ultima valorizzata di ciascuno), filtro *Euroleghe*, riepilogo V/P/S su entrambe.
- `signals.json` ha due campi nuovi: `euroLineups` e `euroMatches`.
