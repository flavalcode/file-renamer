# Sicurezza

Lo strumento modifica file dell'utente: gli obiettivi sono **non perdere dati**, **non toccare nulla fuori dalla cartella scelta** e **non fidarsi di input esterni** (preset, registro di undo, nomi dei file, file immagine). Ogni minaccia sotto è coperta da test in `tests/security/` e dai test dei singoli moduli.

## Modello delle minacce

| # | Minaccia | Contromisura | Test |
|---|---|---|---|
| T1 | **Path traversal / injection tramite i nomi** (`../x`, `a/b`, `C:\x`, NUL, `.`/`..`, spoofing bidi) | Le regole vedono solo il nome senza estensione; il nome finale è validato (`validateFileName`) con il set di caratteri più restrittivo; ogni operazione deve restare **nella stessa cartella** (`assertSafeOperations`) | `T1` |
| T1b | Token/valori che si re-espandono (`{parent}` dentro un nome file) | Template a **passaggio singolo**; in modalità letterale `$&` non è speciale | `core.rules`, `T1` |
| T2 | **ReDoS** con regex fornite dall'utente | Lunghezza massima, flag `u`, rifiuto delle forme con quantificatori annidati / alternanze ripetute; i nomi hanno max 255 caratteri | `T2` |
| T3 | **Preset malevolo o enorme** (prototype pollution, chiavi inattese, valori estremi) | Validazione stretta: oggetto nuovo costruito solo da chiavi note, chiavi sconosciute (incluso `__proto__`) rifiutate, limiti su dimensione file, numero regole, lunghezze, `maxFiles` | `T3`, `core.preset` |
| T4 | **Link simbolici** verso dati fuori cartella | Scanner: mai seguiti né rinominati; l'esecutore rilegge con `lstat` e accetta solo file regolari | `T4` |
| T5 | **Perdita di dati**: sovrascrittura, errore a metà lotto, file che cambiano tra anteprima ed esecuzione | Dry-run di default; piano bloccato su conflitti; rinomina a due fasi; controllo "non esiste" prima di ogni mossa; **rollback** automatico; undo | `T5`, `fs.executor` |
| T6 | **Registro di undo manomesso** (sposterebbe file altrove) | Il registro è trattato come input non fidato: percorsi assoluti, stessa cartella tra `from` e `to`, `runId` e stato validati; file illeggibili ignorati; permessi 0600 (cartella 0700); scrittura atomica | `T6`, `fs.journal` |
| T7 | **Esaurimento risorse** | `maxFiles` (errore, non troncamento), profondità massima 32, lettura EXIF limitata a 256 KB e a prova di file corrotti (fuzz) | `T7`, `fs.exif` |
| T9 | **Pagine web ostili** che chiamano l'app locale (CSRF, DNS rebinding) | Ascolto solo su `127.0.0.1`; controllo di `Host` (solo `127.0.0.1:porta` / `localhost:porta`) e di `Origin`; token casuale (24 byte) richiesto in ogni chiamata API, confronto a tempo costante; `Content-Type: application/json` obbligatorio (le «richieste semplici» cross-site sono rifiutate); nessun CORS | `web.api` |
| T10 | **XSS tramite nomi di file** (`<img onerror=…>.txt`) | La UI non usa mai `innerHTML` & simili (un test lo vieta nel codice sorgente): ogni valore è un nodo di testo. CSP `default-src 'none'; script-src 'self'; style-src 'self'` (niente script o stile inline, niente `eval`) | `web.client-logic`, prova in browser |
| T11 | **Token rubato** da cronologia/log/referrer | Il token viaggia nel *fragment* dell'URL (`#t=…`), che il browser non invia al server né nel `Referer`; la UI lo sposta in `sessionStorage` e lo toglie dall'indirizzo; `Referrer-Policy: no-referrer`, `Cache-Control: no-store` | `web.api` |
| T12 | **Path traversal sui file statici** | Percorso risolto e verificato dentro la cartella degli asset; vietati `..`, `%2e%2e`, backslash, NUL e file che iniziano con `.` | `web.api` |
| T13 | **Anteprima diversa da ciò che si esegue** (disco cambiato, doppio clic, due schede) | `apply` ricalcola il piano sul disco e lo confronta con `expectedPlanId` (409 se diverso); una sola scrittura alla volta; la scansione usata viene scartata dopo l'esecuzione | `web.api` |
| T14 | **Comandi di sistema dall'apertura del browser** | Solo l'indirizzo locale dell'app (`http://127.0.0.1:porta/#t=…`) è ammesso da `open`/`start`/`xdg-open`; spawn senza shell | `cli.ui` |
| T8 | **Fuga di informazioni** | Nessuna rete, nessuna telemetria, nessuna dipendenza a runtime. I messaggi d'errore non mostrano stack trace (solo con `RENAMER_DEBUG=1`) | `T7` |

## Limiti noti (da conoscere)

- **TOCTOU residuo.** Il controllo "la destinazione non esiste" avviene un attimo prima di ogni rinomina; `rename` sovrascrive in silenzio su POSIX e Windows. Un altro programma che crea esattamente quel file nella finestra di pochi millisecondi può ancora vincere la corsa. Una difesa completa richiederebbe `link()` + `unlink()` o API specifiche del sistema, non disponibili su tutti i file system (FAT/exFAT, condivisioni di rete).
- **Il controllo anti-ReDoS è euristico**, non una dimostrazione formale: blocca le forme esponenziali classiche, ma non tutte le possibili. Il limite di 255 caratteri sui nomi riduce il danno; non esiste un timeout per le regex in Node.
- **Il registro di undo contiene percorsi di file** (dati personali in chiaro). È leggibile solo dall'utente, ma non è cifrato. Si può cancellare dalla cartella indicata nel README.
- **Rollback best-effort.** Se anche il ripristino fallisce (disco scollegato, file aperto), l'esito è `rollback_failed`: nessun dato viene cancellato, ma alcuni file possono restare con un nome temporaneo `.renamer-<id>-<n>.tmp` (il messaggio lo spiega).
- **File nascosti su Windows** riconosciuti solo dal nome, non dall'attributo.
- **Modifiche concorrenti**: se un'altra applicazione modifica la cartella *durante* l'esecuzione, il comportamento dipende dal sistema; il piano resta comunque protetto dai controlli sopra.

## Interfaccia web: cosa è stato implementato e cosa no

Implementato: ascolto solo su loopback, token di sessione, controllo Host/Origin, nessun CORS, JSON obbligatorio, limite di 4 MB sul corpo, timeout su intestazioni e richieste, accesso al disco solo tramite le funzioni della libreria, CSP restrittivo e header di sicurezza.

**Non implementato (da sapere):**

- **Nessun limite di frequenza** delle richieste: l'app è locale e protetta da token; il carico è limitato dal tetto di 4 MB per richiesta e da una sola scrittura alla volta.
- **Qualsiasi cartella raggiungibile dall'utente è scegliibile**, comprese quelle di sistema: l'app non è una sandbox, agisce con i permessi dell'utente che la avvia (come il Terminale). L'unica protezione è il rifiuto delle sottocartelle partendo dalla radice del disco.
- **Chi può eseguire codice sul computer con lo stesso utente** può leggere il token dal processo o dalla riga di comando mostrata: la protezione riguarda le pagine web, non i programmi locali.
- **HTTP in chiaro su loopback** (nessun TLS): il traffico non lascia il computer.

## Segnalare un problema

Progetto interno: apri un'issue nel repository, indicando versione, sistema operativo e (senza dati sensibili) comando usato.
