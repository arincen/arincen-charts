import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The code the pages print but cannot run.
 *
 * Most examples in these docs are executed — the page reads its own code block
 * and evaluates it, and `docs-examples.test.js` runs the same blocks here. That
 * cannot cover everything: a React component needs React, a Vue component needs
 * a compiler, and an HTML page with a script tag is not JavaScript at all. The
 * three framework pages are the two integrations most readers will actually
 * use, and until now not one line of them had ever been checked.
 *
 * Parsing is weaker than running and it is not nothing. It catches the mistakes
 * that actually appear in documentation — an unbalanced brace after an edit, a
 * stray character from a paste, a snippet truncated by a bad merge — none of
 * which a proofreader reliably sees and all of which a reader hits immediately.
 *
 * It cannot catch a method that does not exist. That gap is covered from the
 * other side: `docs-coverage.test.js` fails if a name in these pages is not a
 * name the library exports.
 */

const docsRoot = fileURLToPath(new URL('../docs', import.meta.url));

function markdown(directory) {
    return readdirSync(directory).flatMap((entry) => {
        if (['node_modules', '.vitepress', 'dist'].includes(entry)) {
            return [];
        }

        const path = join(directory, entry);

        return statSync(path).isDirectory()
            ? markdown(path)
            : (entry.endsWith('.md') ? [path] : []);
    });
}

/**
 * Every fenced block on a page, with its language and line number.
 *
 * @returns {{ language: string, line: number, code: string }[]}
 */
function fences(source) {
    const found = [];
    const lines = source.split('\n');

    let open = null;

    lines.forEach((line, index) => {
        const start = line.match(/^```([a-z]*)\s*$/);

        if (! open && start) {
            open = { language: start[1] || 'text', line: index + 1, body: [] };

            return;
        }

        if (open && line.startsWith('```')) {
            found.push({ language: open.language, line: open.line, code: open.body.join('\n') });
            open = null;

            return;
        }

        if (open) {
            open.body.push(line);
        }
    });

    return found;
}

/**
 * Fragments, deliberately. A page shows the interesting three lines of an
 * options object far more often than it shows a whole file, and demanding that
 * every block parse as a complete program would mean padding the docs with
 * scaffolding nobody reads.
 *
 * So each block is wrapped in the smallest context that makes a fragment legal,
 * and only a block that is broken in *every* reading is reported.
 */
const READINGS = [
    (code) => code,
    (code) => `async function wrapper() {\n${code}\n}`,
    (code) => `const wrapper = {\n${code}\n};`,
    (code) => `const wrapper = [\n${code}\n];`,
    (code) => `wrapper(\n${code}\n);`,
];

/**
 * `new Function` compiles a script, and a script may not contain `import`.
 * Removing those lines is not ducking the check — an import is one line with
 * one shape, and whether the names in it exist is settled by
 * `docs-coverage.test.js`, which nothing here could add to.
 */
const withoutModuleSyntax = (code) => code
    // An import may run over several lines — the reference page lists fourteen
    // names across four — so the match runs to the `from` clause rather than to
    // the end of the line. Non-greedy, or one import would swallow the file.
    .replace(/^[ \t]*import\b[\s\S]*?from\s*['"][^'"]*['"];?[^\n]*$/gm, '')
    // And the single-line forms: a side-effect import, or one with a trailing
    // comment.
    .replace(/^[ \t]*import\b[^;\n]*;?[^\n]*$/gm, '')
    .replace(/^[ \t]*export\s+/gm, '');

/**
 * An ellipsis stands for "your code here" in several snippets, and is not
 * JavaScript. Substituting an identifier keeps the surrounding syntax under
 * test instead of throwing the whole block away.
 */
const withoutEllipsis = (code) => code.replace(/…/g, 'undefined');

function compiles(code) {
    return READINGS.some((wrap) => {
        try {
            // eslint-disable-next-line no-new-func
            new Function(wrap(code));

            return true;
        } catch {
            return false;
        }
    });
}

function parses(code) {
    const stripped = withoutEllipsis(withoutModuleSyntax(code));

    if (compiles(stripped)) {
        return true;
    }

    // A fence often shows two or three alternatives rather than one program —
    // three ways to set an option, one after another. Those never parse as a
    // single anything, so each chunk is judged on its own.
    const chunks = stripped.split(/\n\s*\n(?=\S)/).map((chunk) => chunk.trim()).filter(Boolean);

    if (chunks.length > 1 && chunks.every(compiles)) {
        return true;
    }

    // The last reading: a catalogue. Several pages list shapes rather than
    // statements — five ways to write a time, one per line, or the same
    // declaration twice with a tick and a cross beside it. Neither is a program
    // and both are exactly right for the page. Every line is still checked;
    // only the claim that they run together is dropped.
    const lines = stripped.split('\n').map((line) => line.trim()).filter(Boolean);

    return lines.length > 1 && lines.every((line) => compiles(line) || compiles(`(${line})`));
}

const CHECKED = ['js', 'javascript'];

const pages = markdown(docsRoot).map((path) => ({
    name: path.slice(docsRoot.length + 1),
    blocks: fences(readFileSync(path, 'utf8')).filter((block) => CHECKED.includes(block.language)),
}));

test('there are snippets to check', () => {
    const total = pages.reduce((sum, page) => sum + page.blocks.length, 0);

    assert.ok(total > 100, `only found ${total} JavaScript blocks — the fence parser is broken`);
});

for (const page of pages.filter((page) => page.blocks.length)) {
    test(`every JavaScript snippet in ${page.name} parses`, () => {
        const broken = page.blocks
            .filter((block) => ! parses(block.code))
            .map((block) => `${page.name}:${block.line}`);

        assert.deepEqual(broken, [], `these blocks are not valid JavaScript in any reading:\n  ${broken.join('\n  ')}`);
    });
}

/**
 * JSX and single-file components, which `new Function` will never accept.
 *
 * Only the things a text scan can be certain about: brackets that do not close,
 * and a fence that ends mid-token. Crude, and it is exactly the class of damage
 * an edit to a long snippet causes.
 */
const MARKUP = ['jsx', 'tsx', 'vue', 'html'];

const markupPages = markdown(docsRoot).map((path) => ({
    name: path.slice(docsRoot.length + 1),
    blocks: fences(readFileSync(path, 'utf8')).filter((block) => MARKUP.includes(block.language)),
})).filter((page) => page.blocks.length);

for (const page of markupPages) {
    test(`every markup snippet in ${page.name} is balanced`, () => {
        const broken = [];

        for (const block of page.blocks) {
            // Strings and comments would confuse a bracket count, so they go
            // first. This is not a parser and does not pretend to be one.
            // Strings first, then comments. The other order treats the `//`
            // in `https://unpkg.com/…` as the start of a comment and eats the
            // rest of the line, which reported a perfectly balanced snippet as
            // missing two brackets.
            const bare = block.code
                .replace(/'(?:\\.|[^'\\])*'/g, "''")
                .replace(/"(?:\\.|[^"\\])*"/g, '""')
                .replace(/`(?:\\.|[^`\\])*`/g, '``')
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/\/\/[^\n]*/g, '');

            const pairs = [['{', '}'], ['(', ')'], ['[', ']']];

            for (const [open, close] of pairs) {
                const opened = (bare.match(new RegExp(`\\${open}`, 'g')) ?? []).length;
                const closed = (bare.match(new RegExp(`\\${close}`, 'g')) ?? []).length;

                if (opened !== closed) {
                    broken.push(`${page.name}:${block.line} — ${opened} ${open} against ${closed} ${close}`);
                }
            }
        }

        assert.deepEqual(broken, [], `unbalanced brackets:\n  ${broken.join('\n  ')}`);
    });
}
