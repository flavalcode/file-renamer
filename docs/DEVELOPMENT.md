# Sviluppo

## Comandi

| Comando | Cosa fa |
|---|---|
| `npm install` | Installa gli strumenti di sviluppo (TypeScript, Prettier, tipi Node) |
| `npm run typecheck` | Controllo dei tipi senza emettere file |
| `npm test` | Compila in `.test-build/` ed esegue **tutti** i test con `node:test` |
| `npm run build` | Pulisce e compila in `dist/`: server/CLI, script del browser (`tsconfig.client.json`) e asset statici |
| `npm run ui` | Avvia l'interfaccia web (dopo `build`) |
| `npm run check` | `typecheck` + `test` + `build` (da eseguire prima di ogni commit) |
| `npm run format` / `format:check` | Prettier |
| `npm start -- <argomenti>` | Esegue la CLI compilata |

I comandi sono scritti per funzionare uguali su macOS, Windows e Linux (nessun `rm -rf` o simili: la pulizia usa `scripts/clean.mjs`).

Copertura misurabile con `node --test --experimental-test-coverage ".test-build/tests/**/*.test.js"` dopo `npm test` (il core è oltre il 95% di righe).

## Convenzioni

- TypeScript `strict` + `noUncheckedIndexedAccess`, `verbatimModuleSyntax`: niente `any`, import di tipi con `import type`.
- ESM con estensione `.js` negli import (richiesta da `NodeNext`).
- **`src/core` non importa mai `node:fs`**. Se una funzione ha bisogno del disco, va in `src/fs`.
- Nessuna dipendenza a runtime: aggiungerne una richiede una motivazione scritta.
- Funzioni piccole, nomi espliciti, messaggi per l'utente in italiano, codici d'errore stabili in inglese (`EXISTS_ON_DISK`).
- Un comportamento nuovo = un test nuovo. Un bug corretto = un test che lo riproduce.

## Struttura dei test

| File | Contenuto |
|---|---|
| `core.filename-validation` | Estensioni, ordinamento naturale, validazione nomi |
| `core.rules` | Ogni regola + regex sicure |
| `core.sequence` | Cifre automatiche (tabella), scope, ordinamenti |
| `core.planner` | Modalità, stati, conflitti, estensione preservata (test a proprietà con PRNG fisso) |
| `core.preset` | Validazione dei preset |
| `fs.exif`, `fs.scanner`, `fs.journal` | Lettura EXIF (con fuzz), scansione su cartelle reali, registro |
| `fs.executor` | Rinomina su disco, scambi/cicli, **iniezione di guasti e rollback**, undo |
| `cli`, `cli.ui` | Comandi, codici di uscita, errori d'uso; comando `ui`, apertura del browser |
| `web.api` | Server reale: sicurezza (Host/Origin/token), file statici, scan → plan → apply → undo, 409/410/422, 2000 file |
| `web.client-logic` | Schema delle regole allineato al core, costruzione del preset, test «niente innerHTML» e «niente script inline» |
| `security/security` | Scenari di attacco (T1-T7 in SECURITY.md) |

**Smoke test nel browser** (opzionale, richiede Playwright): `python tests/e2e/ui_smoke.py` guida i tre passi della UI in Chromium, controlla i file su disco e annulla. Eseguilo dopo ogni modifica a `src/web/client`.

I test su disco usano cartelle temporanee che vengono sempre rimosse. I test che richiedono link simbolici o permessi POSIX si saltano da soli dove non sono disponibili (es. Windows senza privilegi).

## Aggiungere una regola

0. **UI**: aggiungi una voce in `src/web/client/rule-schemas.ts` (il test `web.client-logic` fallisce se schema e core non coincidono).
1. **Tipo**: aggiungi l'interfaccia in `src/core/types.ts` e inseriscila nell'unione `Rule`.
2. **Logica**: implementa la funzione in `src/core/rules/apply-simple.ts` (solo testo) o `apply-contextual.ts` (usa date/cartella).
3. **Dispatcher**: aggiungi il `case` in `src/core/rules/index.ts`. Il compilatore ti segnala il punto grazie a `assertNever`.
4. **Preset**: aggiungi il nome in `RULE_TYPES` e il `case` in `parseRule` (`src/core/preset.ts`), con tutti i controlli sui campi.
5. **Test** in `tests/core.rules.test.ts` e `tests/core.preset.test.ts`; documenta in `docs/RULES.md`.

## Checklist di verifica manuale (macOS e Windows)

I test automatici sono stati eseguiti su Linux. Prima di usare lo strumento su dati importanti, su ciascun sistema:

1. `npm install && npm test` (tutti i test devono passare; alcuni possono risultare *skipped*).
2. In una cartella di prova con una decina di file: anteprima, `--apply`, poi `renamer undo`.
3. **Solo maiuscole/minuscole**: crea `readme.md`, esegui la regola `case upper` → deve diventare `README.md` (verifica con `dir`/`ls`).
4. **File aperto** (Windows): apri un file in Word/Excel e prova a rinominarlo: deve restituire un errore con ripristino completo, senza lasciare file `.renamer-*.tmp`.
5. **Accenti** (macOS): file con `è`, `ö` creati da Finder (NFD) → il nome finale è NFC e non genera duplicati.
6. **Disco esterno / condivisione di rete**: una rinomina di prova e un undo.
7. **Interfaccia**: `Avvia.command` (macOS) / `Avvia.bat` (Windows) con doppio clic; il browser si apre da solo; *Sfoglia…* mostra Home/Desktop/Documenti (e le unità su Windows); concedi l'accesso a Documenti/Scrivania se macOS lo chiede.
8. **Percorso lungo** (Windows): nome che porta il percorso oltre 259 caratteri → deve comparire l'avviso `PATH_TOO_LONG`.

## Roadmap

1. **Fatto (0.2)** – interfaccia web locale a tre passi, avvio con `renamer ui` e launcher a doppio clic.
2. **Prossimi passi possibili**
   - ordine manuale con trascinamento; salvataggio/caricamento dei preset dalla UI;
   - migrazione opzionale a Fastify + React/Vite (la logica è già isolata in `src/web/service.ts`; serve accesso a npm);
   - `ESLint` con `typescript-eslint`, attributo «nascosto» nativo su Windows, EXIF anche per TIFF/HEIC;
   - impacchettamento desktop (Tauri) o eseguibile singolo, senza richiedere Node.
