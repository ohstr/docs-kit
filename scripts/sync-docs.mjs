#!/usr/bin/env node
// Regenerates src/content/docs/*.md from a target repo's own README.md,
// AGENTS.md, and CHANGELOG.md before every build — those files stay each
// project's single source of truth; nothing under src/content is ever
// hand-edited downstream. AGENTS.md/CHANGELOG.md are optional: skipped
// silently if the target repo doesn't have one.
//
// Configuration (all via env vars, set by the calling workflow — see
// README.md for the full list and local-dev defaults):
//   DOCS_CONTENT_DIR   path to the target repo's checkout. Default: cwd.
//   DOCS_GITHUB_URL    e.g. "https://github.com/ohstr/ncash". Required for
//                      rewriting non-mirrored relative links (LICENSE,
//                      skills/, ...) to absolute GitHub blob/tree URLs.
//   DOCS_BASE_PATH     e.g. "/ncash". Must match astro.config.mjs's `base`
//                      — mirrored links need it since Starlight only
//                      base-prefixes its own nav, not markdown body links.
//   DOCS_TITLE         site title, also README's page title.
//   DOCS_DESCRIPTION   meta description for the README page.
//
// Pass --watch to keep running and re-sync on every change to the source
// files, for `astro dev`'s hot reload (astro dev only watches inside this
// project, not the target repo, so without this a content edit needs a
// manual re-sync + browser refresh). Note this only refreshes page content —
// astro.config.mjs reads src/generated/readme-nav.json once, at dev-server
// startup, so adding/removing a README section still needs a restart to
// show up in the sidebar; editing a section's existing body text does not.

import { readFileSync, writeFileSync, mkdirSync, existsSync, watch } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const siteDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(siteDir, 'src/content/docs');

const repoRoot = process.env.DOCS_CONTENT_DIR
  ? path.resolve(process.env.DOCS_CONTENT_DIR)
  : process.cwd();

// Empty string is a valid base (site served at domain root) — only fall
// back to it when the env var is entirely unset, not just falsy-empty.
const BASE = process.env.DOCS_BASE_PATH ?? '';

const GITHUB_URL = (process.env.DOCS_GITHUB_URL ?? '').replace(/\/$/, '');

const SITE_TITLE = process.env.DOCS_TITLE ?? 'Docs';
const SITE_DESCRIPTION = process.env.DOCS_DESCRIPTION ?? '';

// path (relative to repo root) -> site route for pages that get mirrored here.
const ROUTES = {
  'README.md': `${BASE}/`,
  'AGENTS.md': `${BASE}/agents/`,
  'CHANGELOG.md': `${BASE}/changelog/`,
};

const PAGES = [
  {
    src: 'README.md',
    out: 'index.md',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    required: true,
    // The left sidebar already lists this page's own sections (see
    // astro.config.mjs, built from readme-nav.json below) — a right-hand
    // "On this page" outline here would just repeat the same list twice.
    tableOfContents: false,
  },
  {
    src: 'AGENTS.md',
    out: 'agents.md',
    title: 'AGENTS.md',
    description: 'The agent-facing output/error contract for this project.',
    required: false,
  },
  {
    src: 'CHANGELOG.md',
    out: 'changelog.md',
    title: 'Changelog',
    description: `Release history for ${SITE_TITLE}.`,
    required: false,
  },
];

function rewriteLinks(markdown) {
  // Any relative link — not http(s), not a bare in-page "#anchor" — either
  // points at one of the pages mirrored here (ROUTES) or needs to become an
  // absolute link back to the source repo on GitHub, since nothing else in
  // the tree (LICENSE, skills/, workflow files, ...) has a route here.
  return markdown.replace(/\]\((?!#)([^)\s]+?)(#[^)]*)?\)/g, (match, target, anchor = '') => {
    if (/^(https?:)?\/\//.test(target) || target.startsWith('/')) return match;
    const route = ROUTES[target];
    if (route) return `](${route}${anchor})`;
    if (!GITHUB_URL) return match;
    const kind = target.endsWith('/') ? 'tree' : 'blob';
    return `](${GITHUB_URL}/${kind}/main/${target}${anchor})`;
  });
}

function stripLeadingH1(markdown) {
  // Starlight renders `title` from frontmatter as the page's H1, so drop the
  // source file's own leading "# ..." heading to avoid a duplicate.
  return markdown.replace(/^#\s+.*\n+/, '');
}

function escapeFrontmatterString(value) {
  return value.replace(/"/g, '\\"');
}

// Mirrors GitHub's own heading-anchor algorithm (and what rehype-slug
// produces for Starlight's pages): lowercase, drop anything that isn't a
// letter/digit/space/hyphen (so punctuation like "/" and ":" disappears
// rather than becoming a hyphen), then turn runs of whitespace into "-".
function slugify(headingText) {
  return headingText
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, '-');
}

// Extracts top-level (H2) headings from README.md, skipping fenced code
// blocks (shell/JSON examples often contain lines starting with "#").
// Command-style sections (heading starts with a backtick, e.g. "`ncash
// init`") get grouped separately from prose sections — see astro.config.mjs.
function extractReadmeSections(markdown) {
  const sections = [];
  let inFence = false;
  for (const line of markdown.split('\n')) {
    if (/^(```|~~~)/.test(line.trim())) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^##\s+(.+?)\s*$/.exec(line);
    if (!match) continue;
    const heading = match[1];
    const plainText = heading.replace(/`/g, '');
    sections.push({
      label: heading,
      anchor: `/#${slugify(plainText)}`,
      isCommand: heading.startsWith('`'),
    });
  }
  return sections;
}

function syncAll() {
  mkdirSync(outDir, { recursive: true });

  for (const page of PAGES) {
    const srcPath = path.join(repoRoot, page.src);
    if (!existsSync(srcPath)) {
      if (page.required) {
        throw new Error(`${page.src} not found at ${repoRoot} (DOCS_CONTENT_DIR)`);
      }
      continue;
    }

    const raw = readFileSync(srcPath, 'utf8');
    const body = rewriteLinks(stripLeadingH1(raw)).trimEnd();
    const frontmatter = [
      '---',
      `title: "${escapeFrontmatterString(page.title)}"`,
      `description: "${escapeFrontmatterString(page.description)}"`,
      ...(page.tableOfContents === false ? ['tableOfContents: false'] : []),
      '---',
      '',
      `<!-- Generated from ${page.src} by docs-kit's sync-docs.mjs — do not edit directly. -->`,
      '',
    ].join('\n');
    writeFileSync(path.join(outDir, page.out), frontmatter + body + '\n');
    console.log(`synced ${page.src} -> src/content/docs/${page.out}`);

    if (page.src === 'README.md') {
      const generatedDir = path.join(siteDir, 'src/generated');
      mkdirSync(generatedDir, { recursive: true });
      const sections = extractReadmeSections(raw);
      writeFileSync(
        path.join(generatedDir, 'readme-nav.json'),
        JSON.stringify(sections, null, 2) + '\n'
      );
      console.log(`synced ${page.src} -> src/generated/readme-nav.json (${sections.length} sections)`);
    }
  }
}

syncAll();

if (process.argv.includes('--watch')) {
  const watched = PAGES.filter((p) => existsSync(path.join(repoRoot, p.src)));
  console.log(`watching ${watched.map((p) => p.src).join(', ')} for changes...`);
  let pending = null;
  for (const page of watched) {
    watch(path.join(repoRoot, page.src), () => {
      // Editors often emit several events per save; debounce to one sync.
      clearTimeout(pending);
      pending = setTimeout(() => {
        try {
          syncAll();
        } catch (err) {
          console.error('sync failed:', err.message);
        }
      }, 100);
    });
  }
}
