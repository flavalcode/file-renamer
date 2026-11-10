# File Renamer

Rinomina massiva di file con **regole che puoi cambiare a ogni lavoro**, numerazione sequenziale prima dell'estensione e **estensione mai modificata**. Funziona su macOS, Windows e Linux (Node.js).

Questa versione (0.2) contiene il **core** (libreria TypeScript, senza dipendenze a runtime), la **CLI** e l'**interfaccia web locale**: scegli i file, decidi la rinomina, confermi con un pulsante. Vedi [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Interfaccia web (consigliata)

```bash
npm run build        # una volta sola
npm run ui           # oppure: renamer ui
```

Si apre il browser su un indirizzo locale (`http://127.0.0.1:…`); se non si apre, copia il link mostrato nel terminale. Premi `Ctrl+C` per chiudere l'app.

**Doppio clic:** `Avvia.command` (macOS) o `Avvia.bat` (Windows). Alla prima esecuzione installano e compilano da soli; serve solo Node.js.

Tre passi:

1. **File** – scegli la cartella (incolla il percorso o usa *Sfoglia…*), eventualmente con sottocartelle, file nascosti e filtro per estensione. Vedi l'elenco dei file e togli la spunta a quelli da lasciare stare.
2. **Rinomina** – scegli *Nome libero* (nome + delimitatore + numero con primo numero a scelta e cifre automatiche) oppure *Regole* (combinabili, riordinabili, con numerazione opzionale). L'anteprima prima → dopo si aggiorna mentre scrivi; conflitti e nomi non validi sono evidenziati e si possono escludere con un clic.
3. **Conferma** – rivedi l'elenco e premi **Rinomina N file**. Poi puoi **annullare** l'operazione dalla stessa schermata o all'avvio successivo.

> I file **non vengono caricati su Internet né copiati**: l'app gira sul tuo computer e rinomina i file dove si trovano. Per questo «carica i file» significa *scegliere la cartella*: un browser non può fornire i percorsi reali dei file trascinati.

L'app ascolta solo su `127.0.0.1` e ogni chiamata richiede un token casuale valido per la sessione (vedi [docs/SECURITY.md](docs/SECURITY.md)). Opzioni: `renamer ui --port 4000` per una porta fissa, `--no-open` per non aprire il browser.

## Aprire e provare il progetto in VS Code

1. Decomprimi lo ZIP e apri la cartella `file-renamer` con **File → Apri cartella…** (VS Code propone di installare le estensioni consigliate: accetta).
2. Apri il terminale integrato (**Ctrl+`**) ed esegui `npm install` (serve Node.js 22 o superiore: controlla con `node -v`).
3. Premi **Ctrl+Shift+B** (Mac: **⇧⌘B**) per compilare, oppure usa i comandi qui sotto.

| Cosa vuoi fare | Come |
|---|---|
| Eseguire tutti i test | **Terminale → Esegui attività… → test**, oppure `npm test` |
| Controllo completo (tipi + test + build) | **Esegui attività… → check**, oppure `npm run check` |
| Avviare l'interfaccia web | Pannello **Esegui e Debug** (Ctrl+Shift+D) → *Interfaccia web (renamer ui)* → F5. Il link compare nel terminale |
| Provare la CLI su una cartella | *Esegui e Debug* → *CLI: anteprima di una cartella* (chiede percorso e nome; mostra solo l'anteprima, non modifica nulla) |
| Debug dei test | *Esegui e Debug* → *Test (tutti)* |

Consiglio per il primo giro: crea una cartella con 10-20 file di prova (copie, non originali) e usa quella.

## Caratteristiche

- **Due modalità**: *Nome libero* (`NomeCustom` + delimitatore + numero) e *Regole* (pipeline di 10 regole componibili, con numerazione opzionale in coda).
- **Numerazione**: primo numero e passo a scelta, cifre **automatiche** (`1`, `01`, `001`…) calcolate sull'ultimo numero assegnato, oppure fisse. Sequenza globale, per cartella o per estensione; ordine per nome naturale, data di modifica/creazione/EXIF, dimensione o manuale.
- **Estensione intoccabile**: viene separata prima delle regole e riattaccata identica (gestisce `.tar.gz`, file senza estensione e file nascosti).
- **Sicurezza dei dati**: anteprima (dry-run) di default, blocco su conflitti e nomi non validi, rinomina a due fasi con **rollback automatico**, registro di **annullamento** (`undo`), mai sovrascritture.
- **Portabile**: i nomi sono validati con le regole più restrittive di macOS + Windows + Linux, così un preset funziona ovunque.

## Requisiti

- **Node.js 22 o superiore** (consigliato l'ultima LTS) e npm. Verifica con `node -v`.

## Installazione e build

```bash
cd file-renamer
npm install          # installa solo gli strumenti di sviluppo (TypeScript, Prettier)
npm run build        # compila in dist/
npm test             # compila ed esegue tutti i test
```

Per avere il comando `renamer` disponibile ovunque:

```bash
npm link             # poi: renamer --help
```

Senza `npm link` puoi usare `node dist/cli/main.js <argomenti>` (o `npm start -- <argomenti>`).

## Uso da terminale (CLI)

Senza `--apply` **non viene modificato nulla**: vedi l'anteprima, poi aggiungi `--apply`.

### Nome libero

```bash
# Anteprima: IMG_1.JPG ... -> Vacanza-01.JPG ... (cifre automatiche in base al numero di file)
renamer ~/Foto/Roma --name Vacanza --delimiter - --ext jpg,jpeg

# Primo numero 95, 10 file -> Vacanza_095 ... Vacanza_104
renamer ~/Foto/Roma --name Vacanza --start 95

# Applica (chiede conferma; --yes la salta)
renamer ~/Foto/Roma --name Vacanza --apply
```

Il nome accetta i token `{parent}` (nome della cartella), `{date}` (oggi), `{modified}` e `{created}`, tutti con formato opzionale: `{date:YYYY-MM-DD}`.

### Regole

Ogni `--rule` è un oggetto JSON; le regole si applicano nell'ordine indicato (catalogo completo in [docs/RULES.md](docs/RULES.md)).

```bash
renamer ./docs \
  --rule '{"type":"replace","find":"IMG_","with":"Vacanza_"}' \
  --rule '{"type":"case","mode":"lower"}' \
  --rule '{"type":"separators","spaces":"underscore","collapse":true}' \
  --digits 3
```

> **Windows (cmd/PowerShell):** il quoting del JSON sulla riga di comando è scomodo. Usa un **preset** (file JSON), vedi sotto: è più semplice e riutilizzabile.

### Preset (consigliato per le regole ricorrenti)

```bash
renamer ./foto --preset presets/rules.example.json          # anteprima
renamer ./foto --preset presets/rules.example.json --apply
renamer validate mio-preset.json                             # controlla un preset
```

Esempi pronti in [`presets/`](presets/). I filtri da riga di comando (`--ext`, `-r`, …) sovrascrivono quelli del preset.

### Annullare

```bash
renamer history      # ultime rinomine registrate
renamer undo         # annulla l'ultima rinomina applicata
```

Il registro si trova in `~/Library/Application Support/file-renamer` (macOS), `%APPDATA%\file-renamer` (Windows), `~/.local/state/file-renamer` (Linux); si può cambiare con `--state-dir` o `FILE_RENAMER_HOME`. Si conservano le ultime 20 rinomine.

### Tutte le opzioni

| Opzione | Significato |
|---|---|
| `--name <testo>` | Modalità *Nome libero* |
| `--rule '<json>'` | Modalità *Regole* (ripetibile) |
| `--preset <file>` | Usa un preset JSON (alternativo a `--name`/`--rule`) |
| `--delimiter`, `--start`, `--step`, `--digits <auto\|n>` | Numerazione (default `_`, `1`, `1`, `auto`) |
| `--scope <global\|perFolder\|perExtension>` | Ambito della sequenza |
| `--order-by <name\|modified\|created\|exif\|size>`, `--reverse` | Ordine di assegnazione |
| `-r`, `--include-hidden` | Sottocartelle; file nascosti |
| `--ext`, `--include`, `--exclude`, `--name-regex`, `--max-files` | Filtri |
| `--apply`, `-y/--yes` | Esegue davvero; salta la conferma |
| `--all`, `--json`, `--no-color`, `--state-dir` | Output e registro |

Codici di uscita: `0` ok · `1` errore · `2` uso o preset non validi · `3` piano bloccato da errori/conflitti.

## Esempio di comportamento

| Prima | Dopo (`--name Vacanza --delimiter -`, 12 file) |
|---|---|
| `IMG_1.JPG` | `Vacanza-01.JPG` |
| `IMG_10.jpg` | `Vacanza-10.jpg` (maiuscole/minuscole dell'estensione invariate) |

## Struttura del progetto

```
src/
  core/        logica pura (nessun accesso al disco): regole, sequenza, validazione, piano
  fs/          accesso al disco: scansione, esecuzione a due fasi, registro di undo, EXIF
  app/         servizio condiviso da CLI e web UI
  cli/         interfaccia a riga di comando
  web/         server locale (node:http), API, e interfaccia nel browser (client/ + public/)
tests/         test unitari, di integrazione e di sicurezza (node:test) + smoke test browser (e2e/)
Avvia.command  launcher a doppio clic per macOS
Avvia.bat      launcher a doppio clic per Windows
presets/       esempi di preset
docs/          documentazione
```

## Documentazione

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) – architettura, flussi e decisioni
- [docs/RULES.md](docs/RULES.md) – catalogo regole e formato dei preset
- [docs/SECURITY.md](docs/SECURITY.md) – modello delle minacce e contromisure (CLI e web)
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) – sviluppo, test, come aggiungere una regola, roadmap

## Limiti noti (v0.2)

- **Interfaccia web senza framework**: è scritta in TypeScript con il solo Node e nessuna libreria (né Fastify né React/Vite), perché nell'ambiente di sviluppo non era possibile installarle e quindi provarle. La logica è separata dal trasporto HTTP (`src/web/service.ts`), quindi si può migrare in seguito.
- **Niente ordine manuale con trascinamento** nella UI (l'ordine si sceglie per nome, data, dimensione…); il motore lo supporta già (`orderBy: "manual"`).
- **Niente salvataggio dei preset dalla UI** (da CLI sì: `--preset`).

- Verificata automaticamente su Linux (inclusa l'interfaccia, in Chromium). Su macOS e Windows il codice usa solo API portabili di Node, ma i casi specifici (volumi case-insensitive, file aperti in altre app, permessi di cartelle protette) vanno provati sul campo: vedi la checklist in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
- Su Windows i file "nascosti" sono riconosciuti dal nome (`.nome`, `Thumbs.db`, `desktop.ini`, `~$*`), non dall'attributo del file system.
- Su macOS, se Terminal non può leggere una cartella (Scrivania, Documenti, dischi esterni), concedi l'accesso in *Impostazioni di Sistema → Privacy e sicurezza*.
- I filtri `--name-regex` e le regole con regex rifiutano le espressioni a rischio di blocco: è un controllo euristico (vedi [docs/SECURITY.md](docs/SECURITY.md)).
