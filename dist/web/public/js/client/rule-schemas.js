export const RULE_SCHEMAS = [
    {
        type: 'replace',
        label: 'Trova e sostituisci',
        description: 'Sostituisce un testo nel nome (l\'estensione non viene toccata).',
        fields: [
            { key: 'find', label: 'Testo da cercare', kind: 'text', placeholder: 'IMG_' },
            { key: 'with', label: 'Sostituisci con', kind: 'text', allowEmpty: true, placeholder: '(vuoto = elimina)' },
            { key: 'caseSensitive', label: 'Distingui maiuscole/minuscole', kind: 'bool', initial: true },
            { key: 'all', label: 'Sostituisci tutte le occorrenze', kind: 'bool', initial: true },
            { key: 'regex', label: 'Espressione regolare (avanzato)', kind: 'bool', initial: false },
        ],
    },
    {
        type: 'affix',
        label: 'Prefisso / suffisso',
        description: 'Aggiunge testo all\'inizio e/o alla fine del nome.',
        fields: [
            { key: 'prefix', label: 'Prefisso', kind: 'text', placeholder: '2026_' },
            { key: 'suffix', label: 'Suffisso', kind: 'text', placeholder: '_finale' },
        ],
    },
    {
        type: 'case',
        label: 'Maiuscole / minuscole',
        description: 'Cambia la capitalizzazione del nome.',
        fields: [
            {
                key: 'mode',
                label: 'Stile',
                kind: 'select',
                initial: 'lower',
                options: [
                    { value: 'lower', label: 'minuscolo' },
                    { value: 'upper', label: 'MAIUSCOLO' },
                    { value: 'title', label: 'Iniziali Maiuscole' },
                    { value: 'sentence', label: 'Prima lettera maiuscola' },
                ],
            },
        ],
    },
    {
        type: 'separators',
        label: 'Spazi e separatori',
        description: 'Sostituisce gli spazi e ripulisce i separatori ripetuti.',
        fields: [
            {
                key: 'spaces',
                label: 'Spazi',
                kind: 'select',
                initial: 'underscore',
                options: [
                    { value: 'keep', label: 'lascia invariati' },
                    { value: 'underscore', label: 'sostituisci con _' },
                    { value: 'dash', label: 'sostituisci con -' },
                    { value: 'dot', label: 'sostituisci con .' },
                    { value: 'remove', label: 'rimuovi' },
                ],
            },
            { key: 'collapse', label: 'Riduci i separatori ripetuti a uno solo', kind: 'bool', initial: true },
            { key: 'trim', label: 'Togli spazi e separatori a inizio e fine', kind: 'bool', initial: true },
        ],
    },
    {
        type: 'removeChars',
        label: 'Rimuovi caratteri',
        description: 'Elimina cifre, punteggiatura, emoji, parti tra parentesi o caratteri a scelta.',
        fields: [
            { key: 'digits', label: 'Cifre', kind: 'bool', initial: false },
            { key: 'punctuation', label: 'Punteggiatura e simboli', kind: 'bool', initial: false },
            { key: 'emoji', label: 'Emoji', kind: 'bool', initial: false },
            { key: 'brackets', label: 'Parti tra parentesi ( ) [ ] { }', kind: 'bool', initial: false },
            { key: 'custom', label: 'Altri caratteri da togliere', kind: 'text', placeholder: '#$%' },
        ],
    },
    {
        type: 'accents',
        label: 'Togli gli accenti',
        description: 'Città → Citta, è → e.',
        fields: [],
    },
    {
        type: 'cut',
        label: 'Taglia caratteri',
        description: 'Rimuove un numero di caratteri dall\'inizio e/o dalla fine del nome.',
        fields: [
            { key: 'fromStart', label: 'Dall\'inizio', kind: 'int', placeholder: '0' },
            { key: 'fromEnd', label: 'Dalla fine', kind: 'int', placeholder: '0' },
        ],
    },
    {
        type: 'insert',
        label: 'Inserisci testo',
        description: 'Inserisce un testo in una posizione precisa del nome.',
        fields: [
            { key: 'text', label: 'Testo', kind: 'text' },
            {
                key: 'position',
                label: 'Dove',
                kind: 'select',
                initial: 'end',
                options: [
                    { value: 'start', label: 'all\'inizio' },
                    { value: 'end', label: 'alla fine' },
                    { value: 'index', label: 'dopo N caratteri' },
                    { value: 'before', label: 'prima di un testo' },
                    { value: 'after', label: 'dopo un testo' },
                ],
            },
            { key: 'index', label: 'Numero di caratteri', kind: 'int', placeholder: '3', showIf: { key: 'position', in: ['index'] } },
            { key: 'anchor', label: 'Testo di riferimento', kind: 'text', showIf: { key: 'position', in: ['before', 'after'] } },
        ],
    },
    {
        type: 'date',
        label: 'Aggiungi data',
        description: 'Aggiunge una data (modifica, creazione, scatto EXIF o oggi).',
        fields: [
            {
                key: 'source',
                label: 'Quale data',
                kind: 'select',
                initial: 'modified',
                options: [
                    { value: 'modified', label: 'ultima modifica' },
                    { value: 'created', label: 'creazione' },
                    { value: 'exif', label: 'scatto (EXIF, foto JPEG)' },
                    { value: 'today', label: 'oggi' },
                ],
            },
            { key: 'format', label: 'Formato', kind: 'text', placeholder: 'YYYY-MM-DD', hint: 'YYYY anno · MM mese · DD giorno · HH mm ss' },
            {
                key: 'position',
                label: 'Posizione',
                kind: 'select',
                initial: 'prefix',
                options: [
                    { value: 'prefix', label: 'davanti al nome' },
                    { value: 'suffix', label: 'dietro al nome' },
                ],
            },
            { key: 'separator', label: 'Separatore', kind: 'text', allowEmpty: true, initial: '_' },
        ],
    },
    {
        type: 'template',
        label: 'Modello libero',
        description: 'Costruisce il nome da un modello con segnaposto.',
        fields: [
            {
                key: 'template',
                label: 'Modello',
                kind: 'text',
                placeholder: '{parent}_{name}',
                hint: '{name} nome attuale · {parent} cartella · {date} oggi · {modified} / {created}',
            },
        ],
    },
];
export function schemaFor(type) {
    return RULE_SCHEMAS.find((schema) => schema.type === type);
}
