import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The "Suggest a change to this page" link lands somewhere.
 *
 * VitePress builds that link from a pattern and the page's own path, so it is
 * correct exactly while the public mirror carries the same files under the same
 * names. Nothing kept those in step: the mirror was last pushed with an
 * eight-page structure, and every page written afterwards — the frameworks, the
 * plugins, the recipes — offered readers an edit link to a file GitHub had
 * never heard of. Sixteen pages inviting a contribution and answering with 404.
 *
 * The failure is invisible from inside the repository, because locally every
 * one of those files exists. It can only be caught by asking the other side.
 *
 * Network, therefore, and skipped rather than failed when there is none: a
 * suite that cannot run on a plane stops being run.
 */

const docsRoot = fileURLToPath(new URL('../docs', import.meta.url));

const config = readFileSync(join(docsRoot, '.vitepress/config.mjs'), 'utf8');

/** The pattern VitePress substitutes `:path` into. */
const pattern = config.match(/pattern:\s*'([^']+)'/)?.[1] ?? null;

function markdown(directory, prefix = '') {
    return readdirSync(directory).flatMap((entry) => {
        if (['node_modules', '.vitepress', 'dist'].includes(entry)) {
            return [];
        }

        const path = join(directory, entry);
        const relative = prefix ? `${prefix}/${entry}` : entry;

        return statSync(path).isDirectory()
            ? markdown(path, relative)
            : (entry.endsWith('.md') ? [relative] : []);
    });
}

const pages = markdown(docsRoot);

test('the docs declare an edit link at all', () => {
    assert.ok(pattern, 'no editLink pattern found — this test is checking nothing');
    assert.ok(pattern.includes(':path'), `the pattern has no :path to substitute: ${pattern}`);
});

/**
 * `https://github.com/owner/repo/edit/branch/prefix/:path`
 *
 * Broken apart rather than fetched directly: the edit URL is a redirect to an
 * editor and answers 200 for a missing file when signed out, so asking it
 * whether a page exists gets a cheerful lie. The contents API answers honestly.
 */
function parsePattern(url) {
    const match = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/edit\/([^/]+)\/(.*):path$/);

    if (! match) {
        return null;
    }

    return { owner: match[1], repo: match[2], branch: match[3], prefix: match[4] };
}

const target = pattern ? parsePattern(pattern) : null;

test('the edit link points at a real repository, on a real branch', async (t) => {
    if (! target) {
        assert.fail(`the editLink pattern is not a GitHub edit URL: ${pattern}`);
    }

    const response = await fetch(
        `https://api.github.com/repos/${target.owner}/${target.repo}/branches/${target.branch}`,
        { headers: { accept: 'application/vnd.github+json' } },
    ).catch(() => null);

    if (! response) {
        t.skip('no network — the mirror cannot be checked from here');

        return;
    }

    if (response.status === 403 || response.status === 429) {
        t.skip('GitHub rate limit reached; try again later or set GITHUB_TOKEN');

        return;
    }

    assert.equal(
        response.status,
        200,
        `${target.owner}/${target.repo}@${target.branch} answered ${response.status} — `
            + 'every "Suggest a change" link on the site is broken',
    );
});

test('every page exists in the public mirror', async (t) => {
    if (! target) {
        return;
    }

    const url = `https://api.github.com/repos/${target.owner}/${target.repo}`
        + `/git/trees/${target.branch}?recursive=1`;

    const response = await fetch(url, { headers: { accept: 'application/vnd.github+json' } })
        .catch(() => null);

    if (! response) {
        t.skip('no network — the mirror cannot be checked from here');

        return;
    }

    if (response.status === 403 || response.status === 429) {
        t.skip('GitHub rate limit reached; try again later or set GITHUB_TOKEN');

        return;
    }

    assert.equal(response.status, 200, `listing the repository answered ${response.status}`);

    const tree = await response.json();
    const present = new Set((tree.tree ?? []).map((entry) => entry.path));

    const missing = pages
        .map((page) => `${target.prefix}${page}`)
        .filter((path) => ! present.has(path));

    assert.deepEqual(
        missing,
        [],
        `${missing.length} page(s) offer an edit link to a file that is not in `
            + `${target.owner}/${target.repo}@${target.branch}:\n  ${missing.join('\n  ')}\n\n`
            + 'Re-run `node mirror-public-repo.mjs <target>` and push.',
    );
});
