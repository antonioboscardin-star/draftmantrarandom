# Asta Fantacalcio – Sorteggio prima chiamata

Web app statica: all'apertura si sceglie se **creare una nuova estrazione** (nome, squadre da 6 a 14, avvio del sorteggio posizione per posizione) oppure **guardarne una in corso** (sola visione, con "Copia ordine finale" a sorteggio concluso).

GitHub Pages ospita solo file statici e non può salvare dati condivisi. Per far vedere l'estrazione ad altre persone serve quindi un piccolo database esterno: qui si usa **Firebase Realtime Database** (piano gratuito Spark; controlla i limiti attuali sul sito Firebase). Senza Firebase l'app funziona in **modalità locale** (dati nel solo browser, utile per provare).

## File del progetto
| File | Contenuto |
|---|---|
| `index.html`, `style.css`, `app.js` | l'app |
| `firebase-config.js` | la tua configurazione Firebase (da compilare) |
| `database.rules.json` | regole di sicurezza da incollare in Firebase |

## A. Configurare Firebase (circa 10 minuti)
1. Vai su https://console.firebase.google.com → **Aggiungi progetto** (Analytics non serve).
2. **Build → Realtime Database → Crea database**, scegli una regione europea e la modalità bloccata.
3. Scheda **Regole**: incolla il contenuto di `database.rules.json` e premi **Pubblica**.
4. **Build → Authentication → Inizia → Sign-in method → Anonimo → Abilita**.
5. **Impostazioni progetto** (ingranaggio) → **Le tue app** → icona Web `</>` → registra l'app → copia l'oggetto `firebaseConfig` e incollalo in `firebase-config.js` al posto di `null`:
   ```js
   export const firebaseConfig = { apiKey: "...", authDomain: "...", databaseURL: "https://NOME-default-rtdb.europe-west1.firebasedatabase.app", projectId: "...", appId: "..." };
   ```
   Se manca `databaseURL`, copialo dalla pagina Realtime Database (in alto).
6. Solo se vedi l'errore `auth/unauthorized-domain`: **Authentication → Impostazioni → Domini autorizzati** → aggiungi `TUONOME.github.io`.

## B. Pubblicare su GitHub Pages
1. Crea un repository su https://github.com/new (es. `sorteggio-fantacalcio`), pubblico.
2. **Add file → Upload files**: carica `index.html`, `style.css`, `app.js` e `firebase-config.js` (già compilato) nella radice del repository, poi **Commit changes**. (`database.rules.json` e questo README si possono caricare ma non servono al sito.)
3. **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, cartella `/ (root)` → **Save**.
4. Dopo 1–2 minuti il sito è su `https://TUONOME.github.io/sorteggio-fantacalcio/`.
5. Per aggiornare l'app basta sostituire i file nel repository.

## C. Prova
1. Apri il link, scrivi un nome e premi **Crea e gestisci**.
2. Imposta le squadre e premi **Copia link spettatori**.
3. Apri quel link in una finestra privata o da un altro telefono: vedrai l'estrazione in diretta senza comandi.

## Note importanti
- **Chi organizza** è identificato da un account anonimo legato al browser: solo lui può avviare o modificare l'estrazione (lo garantiscono le regole del database). Se cancelli i dati del sito o cambi dispositivo perdi i comandi di quell'estrazione; gli spettatori continuano a vederla.
- Le estrazioni sono **leggibili da chiunque abbia il link del sito**: non inserire dati riservati nei nomi delle squadre.
- La `apiKey` di Firebase nel codice non è un segreto; la protezione sono le regole del database. Facoltativo: dalla Google Cloud Console puoi limitare la chiave al tuo dominio `github.io`.
