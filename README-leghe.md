# leghe.html – Risultati leghe fantacalcio

Pagina singola (nessuna build) da pubblicare su GitHub Pages, collegata a Firestore.

## Configurazione

1. In `leghe.html` sostituisci i valori di `firebaseConfig` (stessi del progetto Firebase già usato per il sorteggio).
2. Firestore usa due collezioni, create automaticamente al primo salvataggio:
   - `fc_leghe` → un documento per ogni coppia lega/squadra: `{ lega, squadra, createdAt }`
   - `fc_risultati` → id `<idSquadra>_<giornata>`: `{ entryId, giornata, esito, risultato, note, updatedAt }`
   - `esito` vale `vinco`, `pareggio` o `perdo`; `risultato` è nel formato `3-1`.
3. Regole Firestore: la pagina fa un accesso anonimo (se abilitato in Authentication → Metodo di accesso → Anonimo). Esempio di regole:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /fc_leghe/{doc}     { allow read, write: if request.auth != null; }
    match /fc_risultati/{doc} { allow read, write: if request.auth != null; }
  }
}
```

   Nota: su un sito pubblico chiunque apra la pagina potrebbe scrivere. Per un uso personale limita il dominio della chiave API (Google Cloud → Credenziali) a `tuoutente.github.io` oppure usa un accesso con Google e una regola sul tuo UID.

## Pubblicazione

Copia `leghe.html` nella root del repository già su GitHub Pages, fai commit e push: la pagina sarà su `https://<utente>.github.io/<repo>/leghe.html`.

## Uso

- **Carica leghe e squadre**: incolla righe `Lega;Squadra` o carica un CSV/TXT; i doppioni vengono ignorati.
- **Giornata**: scegli la giornata con le frecce; ogni modifica (esito, risultato, note) si salva da sola.
- **Filtro lega** e **Esporta CSV** per lavorare su una lega o portare i dati in Excel.
