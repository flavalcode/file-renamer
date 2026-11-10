# Regole e formato dei preset

Un **preset** è un file JSON condiviso da CLI e (in futuro) UI. Le chiavi sconosciute sono errori: un refuso non passa inosservato. Tutti gli errori vengono elencati insieme (`renamer validate file.json`).

## Struttura

```jsonc
{
  "version": 1,                 // opzionale, per ora solo 1
  "mode": "free",               // "free" | "rules"
  "free": { ... },              // solo con mode "free"
  "rules": [ ... ],             // solo con mode "rules" (1-50 regole)
  "sequence": { ... } | null,   // solo con mode "rules"; null = nessuna numerazione
  "filters": { ... }            // opzionale
}
```

### Modalità `free` (Nome libero)

Risultato: `{name}{delimiter}{numero}{estensione originale}`. Il nome originale viene scartato.

| Campo | Default | Note |
|---|---|---|
| `name` | – (obbligatorio) | Max 255 caratteri. Token: `{parent}`, `{date}`, `{modified}`, `{created}` (con `:formato`, es. `{date:YYYY}`). `{{` e `}}` = graffe letterali. Vietati `/ \ : * ? " < > \|` e caratteri di controllo |
| `delimiter` | `_` | 0-10 caratteri (anche vuoto) |
| `start` | `1` | Intero 0 – 1 000 000 000 |
| `step` | `1` | Intero 1 – 1 000 000 |
| `digits` | `"auto"` | `"auto"` oppure intero 1-12 (minimo di cifre) |
| `scope` | `global` | `global`, `perFolder`, `perExtension` |
| `orderBy` | `name` | `name` (naturale), `modified`, `created`, `exif`, `size`, `manual` (ordine di ingresso) |
| `reverse` | `false` | Inverte l'ordine di assegnazione |

### Modalità `rules`

Le regole trasformano il **nome senza estensione**, in ordine. Poi, se `sequence` è presente, si aggiunge `{delimiter}{numero}` (stessi campi di `free`, tranne `name`).

## Catalogo delle regole

| `type` | Campi | Esempio → risultato |
|---|---|---|
| `replace` | `find`, `with`, `regex` (false), `caseSensitive` (true), `all` (true) | `IMG_`→`Vacanza_`: `IMG_01`→`Vacanza_01`. In modalità letterale `$&` non ha significato speciale; con `regex: true` valgono `$1`, `$2`… |
| `affix` | `prefix`, `suffix` (almeno uno) | `2026_` + nome |
| `case` | `mode`: `lower` `upper` `title` `sentence` | `hELLO wORLD` → `Hello World` (title) / `Hello world` (sentence) |
| `separators` | `spaces`: `keep` `underscore` `dash` `dot` `remove`; `collapse`; `trim` | `a  b c` → `a_b_c` (underscore + collapse) |
| `removeChars` | `digits`, `punctuation`, `emoji`, `brackets`, `custom` | `file (1)` → `file` (brackets); `custom: "#$"` toglie quei caratteri |
| `accents` | – | `Città è ß` → `Citta e ss` |
| `cut` | `fromStart`, `fromEnd` (0-255) | `abcdef` con 2 e 1 → `cde` |
| `insert` | `text`, `position`: `start` `end` `index` `before` `after`; `index`; `anchor` | `index:2` su `abcd` con `X` → `abXcd`. Se `anchor` non c'è nel file, il file resta invariato |
| `date` | `source`: `modified` `created` `exif` `today`; `format` (`YYYY-MM-DD`); `position`: `prefix` `suffix`; `separator` (`_`) | `2026-11-09_nome` |
| `template` | `template` | `{parent}_{name}`: token `{name}` `{parent}` `{date[:fmt]}` `{modified[:fmt]}` `{created[:fmt]}` |

**Formato data**: `YYYY` `YY` `MM` `DD` `HH` `mm` `ss`, in ora locale. `exif` usa la data di scatto dei JPEG; se manca, usa la data di modifica e segnala un avviso.

**Template**: l'espansione avviene in un solo passaggio, quindi un file chiamato `{parent}.txt` non viene espanso di nuovo.

**Regex** (`replace` con `regex: true`, `filters.nameRegex`): max 200 caratteri, flag `u` sempre attivo, e rifiutate le forme a rischio di blocco (quantificatori annidati come `(a+)+`, alternanze ripetute come `(a|aa)*`).

## Filtri

| Campo | Default | Note |
|---|---|---|
| `extensions` | `[]` (tutte) | Senza punto, indifferente al maiuscolo: `["jpg","png"]`. Accetta `tar.gz` |
| `include` / `exclude` | `[]` | Glob sul nome file: `*` e `?` |
| `nameRegex` | – | Espressione sul nome completo (case-insensitive) |
| `recursive` | `false` | Include le sottocartelle (max 32 livelli). I link simbolici non vengono mai seguiti |
| `includeHidden` | `false` | Nascosti: `.nome`, `~$*`, `Thumbs.db`, `desktop.ini` |
| `maxFiles` | `10000` | Superarlo è un errore (mai troncamento silenzioso). Max 100 000 |

## Cosa blocca il piano

| Codice | Causa |
|---|---|
| `EMPTY_NAME` | Il nuovo nome è vuoto |
| `INVALID_CHARS` | Caratteri non ammessi (`< > : " / \ \| ? *`, controllo) |
| `RESERVED_NAME` | Nome riservato di Windows (`CON`, `NUL`, `COM1`…, anche con estensione) |
| `TRAILING_DOT_OR_SPACE` | Nome che termina con punto o spazio |
| `NAME_TOO_LONG` | Oltre 255 byte UTF-8 o 255 unità UTF-16 |
| `SUSPICIOUS_UNICODE` | Caratteri di controllo della direzione del testo |
| `DUPLICATE_TARGET` | Più file otterrebbero lo stesso nome (senza distinguere maiuscole/minuscole) |
| `EXISTS_ON_DISK` | Esiste già un file/cartella con quel nome non incluso nel lotto |
| `RULE_ERROR` | Una regola non è applicabile (parametri, template, regex) |

Avvisi (non bloccanti): `PATH_TOO_LONG` (percorso > 259 caratteri, problema su Windows), `EXIF_MISSING`.

## Esempio completo

```json
{
  "version": 1,
  "mode": "rules",
  "rules": [
    { "type": "replace", "find": "IMG_", "with": "Vacanza_" },
    { "type": "removeChars", "brackets": true },
    { "type": "accents" },
    { "type": "case", "mode": "lower" },
    { "type": "separators", "spaces": "underscore", "collapse": true, "trim": true }
  ],
  "sequence": { "start": 1, "digits": "auto", "delimiter": "_", "scope": "perFolder", "orderBy": "modified" },
  "filters": { "extensions": ["jpg", "png"], "recursive": true }
}
```
