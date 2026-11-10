# Architettura

## Principi

1. **Core puro, I/O ai bordi.** Tutto ciò che decide *come* si chiamerà un file è una funzione pura (`buildPlan`): niente disco, niente orologio implicito (`now` è iniettabile). È testabile al 100% e adatta all'anteprima live della futura UI.
2. **Un solo percorso di validazione.** I preset (da file, da CLI o dalla UI) passano tutti da `parsePreset`, che è rigoroso e raccoglie tutti gli errori.
3. **Sicurezza per costruzione.** L'estensione non è mai vista dalle regole; i nomi finali sono sempre validati; l'esecuzione non sovrascrive mai.
4. **Zero dipendenze a runtime.** Solo Node.js (`node:util`, `node:fs`, ...). Meno superficie d'attacco e niente aggiornamenti di terze parti.

## Livelli

```
cli/  ─┐
       ├─►  app/service.ts (planDirectory) ─► fs/scanner ─► core/planner ─► RenamePlan
web/  ─┘                                                                       │
                                                                               ▼
                                   fs/executor (due fasi + rollback) ◄── fs/journal (undo)
```

CLI e web UI usano le stesse funzioni (`scanDirectory`, `buildPlan`, `executePlan`, `undoLast`): hanno lo stesso comportamento per costruzione.

### `src/core` (puro)

| File | Responsabilità |
|---|---|
| `types.ts` | Tipi di dominio: `FileEntry`, `Rule`, `Preset`, `RenamePlan`, ... |
| `filename.ts` | Separa nome/estensione (`.tar.gz`, file nascosti), chiave di collisione |
| `natural-sort.ts` | Ordinamento naturale deterministico (`2` prima di `10`) |
| `validation.ts` | Validazione cross-platform del nome finale |
| `rules/` | Una funzione per regola (`apply-simple.ts`, `apply-contextual.ts`), template, formati data, regex sicure |
| `sequence.ts` | Gruppi di numerazione, ordine, **cifre automatiche** |
| `planner.ts` | `buildPlan`: regole → numerazione → validazione → controllo conflitti |
| `preset.ts` | Validazione stretta del JSON dei preset |

### `src/fs` (I/O)

| File | Responsabilità |
|---|---|
| `scanner.ts` | Elenca i file (filtri, ricorsione, **mai symlink**), raccoglie i nomi "fratelli" per i conflitti |
| `exif.ts` | Lettore EXIF minimale per JPEG, a prova di file corrotti |
| `executor.ts` | Rinomina a due fasi, rollback, `undoLast` |
| `journal.ts` | Registro di annullamento (scrittura atomica, permessi 0600, lettura come input non fidato) |
| `fs-port.ts` | Interfaccia minima sul file system: permette di iniettare guasti nei test |
| `preset-file.ts` | Caricamento file preset con limite di dimensione |

## Flusso di una rinomina

1. **Scan**: `scanDirectory` produce `FileEntry[]` (nome, estensione, date, dimensione) e l'elenco di tutti i nomi presenti in ogni cartella.
2. **Plan**: `buildPlan` ordina i file, assegna i numeri (per gruppo), applica le regole al solo nome, riattacca l'estensione, valida e controlla i conflitti (duplicati nel lotto + nomi già esistenti fuori dal lotto).
3. **Preview**: la CLI (o la UI) mostra il piano. Un piano con errori **non è eseguibile**.
4. **Execute**: scrive il registro `pending`, controlla che sorgenti e destinazioni siano ancora valide, poi fa la rinomina a due fasi:
   - fase 1: ogni file → nome temporaneo univoco nella *stessa cartella* (`.renamer-<id>-<n>.tmp`);
   - fase 2: ogni temporaneo → nome finale (con controllo "non esiste" subito prima).
   Un errore qualsiasi in una delle due fasi fa **ripristinare tutto** in ordine inverso.
5. **Journal**: stato `applied` (o `rolled_back` / `rollback_failed`). `undo` esegue la stessa procedura al contrario.

La rinomina a due fasi rende corretti scambi (`a↔b`), catene e cicli, e i cambi di sola maiuscola/minuscola su file system case-insensitive (APFS, NTFS).

## Numerazione e cifre automatiche

Per ogni gruppo di numerazione con `N` file:

`cifre = lunghezza( max(inizio, inizio + (N-1) · passo) )`

Esempi: 7 file da 1 → 1 cifra; 12 file → 2; 120 file → 3; 10 file da 95 → 3 (`095`…`104`). Con `scope: perFolder|perExtension` ogni gruppo calcola le proprie cifre. Le cifre fisse sono un *minimo*: non troncano mai un numero.

## Decisioni principali

| Decisione | Motivo |
|---|---|
| Piano separato dall'esecuzione | Anteprima live, test senza disco, nessuna sorpresa |
| Chiave di collisione: NFC + minuscolo | Stesso risultato su macOS e Windows (file system case-insensitive) |
| Errori di piano bloccano tutto il lotto | Evita rinomine parziali difficili da capire |
| Registro di undo scritto *prima* | Un crash non lascia rinomine senza traccia; se il registro non è scrivibile non si rinomina nulla |
| Validazione manuale dei preset (no librerie) | Zero dipendenze, messaggi in italiano, controllo totale delle chiavi |
| ESM + `NodeNext` + `strict` + `noUncheckedIndexedAccess` | Massimo controllo del compilatore |

## Interfaccia web (`src/web`)

```
browser (public/ + client/)  ──HTTP JSON + token──►  server.ts ─► service.ts ─► core + fs
                                                      (sicurezza,    (logica,
                                                       routing)       cache scansioni)
```

| File | Responsabilità |
|---|---|
| `server.ts` | Server `node:http` su `127.0.0.1`: controlli Host/Origin/token, routing, header di sicurezza |
| `security.ts` | Token, confronto a tempo costante, host e origin ammessi |
| `http-utils.ts` | Lettura JSON con limite di dimensione, risposte e errori, header di sicurezza |
| `static.ts` | File statici con protezione da path traversal |
| `service.ts` | **Logica applicativa**, indipendente da HTTP: scan, plan, apply, undo, elenco cartelle |
| `shared/api-types.ts` | Contratto API (solo tipi), condiviso da server e client |
| `client/` | UI in TypeScript senza framework: un modulo per passo (`step-files`, `step-rename`, `step-confirm`) |
| `client/rule-schemas.ts`, `preset-builder.ts` | Schema dichiarativo delle regole e costruzione del preset (puri, testati contro il core) |
| `public/` | `index.html` e `app.css` |

### API

| Chiamata | Scopo |
|---|---|
| `GET /api/info` | Versione, scorciatoie (Home, Desktop, …), ultima rinomina annullabile |
| `GET /api/folders?path=` | Sottocartelle di un percorso (per *Sfoglia…*) |
| `POST /api/scan` | Elenca i file (filtri) e restituisce un `scanId` (cache in memoria, max 5) |
| `POST /api/plan` | Anteprima: `scanId` + file esclusi + configurazione → elementi prima/dopo, conflitti, `planId` |
| `POST /api/apply` | Esegue. Rilegge la cartella dal disco, ricostruisce il piano e lo confronta con `expectedPlanId`: se diverso risponde **409** e non tocca nulla |
| `POST /api/undo` | Annulla l'ultima rinomina (solo se `runId` coincide con l'ultima) |

I filtri vengono dalla scansione, non dalla configurazione: il client non può cambiarli in `plan`/`apply`. Un'operazione di scrittura alla volta (la seconda riceve 409 `BUSY`).

### Perché conferma = confronto del `planId`

Tra l'anteprima e il clic su *Rinomina* il disco può cambiare (un file creato, uno spostato). `planId` è l'impronta di ciò che l'anteprima mostrava; `apply` la ricalcola sul disco *adesso*. Se differisce, l'utente vede «La cartella è cambiata» e rigenera l'anteprima: **non si esegue mai un piano diverso da quello confermato**.
