import { messageOf } from './actions.js';
import { createApi } from './api.js';
import { h, replaceChildren } from './dom.js';
import { initialState } from './state.js';
import { renderStepConfirm } from './step-confirm.js';
import { renderStepFiles } from './step-files.js';
import { renderStepRename } from './step-rename.js';
const TOKEN_KEY = 'renamer-token';
const STEP_LABELS = ['File', 'Rinomina', 'Conferma'];
function readToken() {
    const match = /[#&]t=([A-Za-z0-9_-]+)/u.exec(window.location.hash);
    if (match?.[1]) {
        sessionStorage.setItem(TOKEN_KEY, match[1]);
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    return sessionStorage.getItem(TOKEN_KEY);
}
function fatal(view, text) {
    replaceChildren(view, h('div', { class: 'banner banner-error', role: 'alert' }, text));
}
async function main() {
    const view = document.getElementById('view');
    const stepper = document.getElementById('stepper');
    if (!view || !stepper)
        return;
    const token = readToken();
    if (!token) {
        fatal(view, 'Sessione non trovata. Apri l\'app dal link mostrato nel terminale (quello che termina con #t=…).');
        return;
    }
    const api = createApi(token);
    const state = initialState();
    const renderStepper = () => replaceChildren(stepper, ...STEP_LABELS.map((label, index) => {
        const number = (index + 1);
        const status = number === state.step ? 'current' : number < state.step ? 'done' : 'todo';
        return h('li', { class: `step step-${status}`, 'aria-current': status === 'current' ? 'step' : undefined }, h('span', { class: 'step-number' }, status === 'done' ? '✓' : String(number)), h('span', {}, label));
    }));
    const render = (moveFocus) => {
        renderStepper();
        const renderer = state.step === 1 ? renderStepFiles : state.step === 2 ? renderStepRename : renderStepConfirm;
        renderer(view, ctx);
        if (moveFocus) {
            window.scrollTo(0, 0);
            document.getElementById('step-heading')?.focus({ preventScroll: true });
        }
    };
    const ctx = {
        state,
        api,
        go(step) {
            if (step !== 3)
                state.outcome = null;
            state.step = step;
            render(true);
        },
        async refreshInfo() {
            state.info = await api.info();
            render(false);
        },
    };
    try {
        state.info = await api.info();
    }
    catch (error) {
        fatal(view, messageOf(error));
        return;
    }
    render(false);
}
void main();
