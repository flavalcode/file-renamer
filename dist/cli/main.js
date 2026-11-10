#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { browserCommand } from './open-browser.js';
import { runCli } from './run.js';
const io = {
    stdout: (text) => void process.stdout.write(text),
    stderr: (text) => void process.stderr.write(text),
    isTTY: process.stdout.isTTY === true && process.stdin.isTTY === true,
    env: process.env,
    cwd: process.cwd(),
    async confirm(question) {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        try {
            const answer = (await rl.question(question)).trim().toLowerCase();
            return ['s', 'si', 'sì', 'y', 'yes'].includes(answer);
        }
        finally {
            rl.close();
        }
    },
    openUrl(url) {
        const command = browserCommand(url, process.platform);
        if (!command)
            return;
        try {
            const child = spawn(command.command, [...command.args], { stdio: 'ignore', detached: true, windowsHide: true });
            child.on('error', () => undefined);
            child.unref();
        }
        catch {
        }
    },
    waitForShutdown: () => new Promise((resolve) => {
        process.once('SIGINT', resolve);
        process.once('SIGTERM', resolve);
    }),
};
process.exitCode = await runCli(process.argv.slice(2), io);
