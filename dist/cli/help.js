import { VERSION } from '../version.js';
export const HELP_TEXT = `renamer ${VERSION} - rinomina massiva di file (l'estensione non viene mai modificata)

USO
  renamer <cartella> [opzioni]        Anteprima (default) o applicazione della rinomina
  renamer ui [--port <n>] [--no-open] Avvia l'interfaccia web locale (si apre nel browser)
  renamer undo [--yes]                Annulla l'ultima rinomina applicata
  renamer history                     Elenca le ultime rinomine registrate
  renamer validate <preset.json>      Controlla un preset

Senza --apply NON viene modificato nulla (dry-run).

MODALITÀ "NOME LIBERO"
  --name <testo>          Nome personalizzato (supporta {parent}, {date}, {modified}, {created})
  --delimiter <testo>     Delimitatore prima del numero (default: _)
  --start <n>             Primo numero (default: 1)
  --step <n>              Passo (default: 1)
  --digits <auto|n>       Cifre: auto (default) oppure fisse

MODALITÀ "REGOLE"
  --rule '<json>'         Regola in JSON, ripetibile (vedi docs/RULES.md)
                          es. --rule '{"type":"case","mode":"lower"}'
  --seq                   Aggiunge la numerazione (anche implicita se usi le opzioni sotto)
  --start/--step/--digits/--delimiter  come sopra

NUMERAZIONE (entrambe le modalità)
  --scope <global|perFolder|perExtension>      Ambito della sequenza (default: global)
  --order-by <name|modified|created|exif|size> Ordine di assegnazione (default: name)
  --reverse                                    Ordine inverso

PRESET
  --preset <file>         Usa un preset JSON (non combinabile con le opzioni di modalità)

FILTRI (sovrascrivono quelli del preset)
  -r, --recursive         Include le sottocartelle
  --include-hidden        Include i file nascosti
  --ext <jpg,png>         Solo queste estensioni
  --include <glob>        Solo i nomi che corrispondono (ripetibile)
  --exclude <glob>        Esclude i nomi che corrispondono (ripetibile)
  --name-regex <regex>    Solo i nomi che corrispondono all'espressione
  --max-files <n>         Limite di sicurezza sul numero di file

ESECUZIONE E OUTPUT
  --apply                 Applica davvero la rinomina
  -y, --yes               Non chiede conferma
  --all                   Mostra anche i file invariati
  --json                  Output JSON
  --no-color              Senza colori
  --state-dir <cartella>  Cartella del registro di annullamento
  -h, --help              Mostra questo aiuto
  -v, --version           Mostra la versione

CODICI DI USCITA
  0 ok   1 errore   2 uso/preset non valido   3 piano bloccato da errori o conflitti
`;
