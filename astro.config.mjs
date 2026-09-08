// @ts-check
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// --- Configuration (env vars set by the calling workflow; see README.md) ---
const TITLE = process.env.DOCS_TITLE ?? 'Docs';
const DESCRIPTION = process.env.DOCS_DESCRIPTION ?? '';
const GITHUB_URL = process.env.DOCS_GITHUB_URL; // e.g. https://github.com/ohstr/ncash
const SITE_URL = process.env.DOCS_SITE_URL ?? 'https://ohstr.github.io';
const BASE_PATH = process.env.DOCS_BASE_PATH ?? '';
const ACCENT_HUE = Number(process.env.DOCS_ACCENT_HUE ?? 234); // 234 = Starlight's own default blue
const FAVICON_GLYPH = process.env.DOCS_FAVICON_GLYPH ?? '>_';
const EXTRA_CSS = process.env.DOCS_EXTRA_CSS; // optional absolute path, from the target repo

// Favicon is generated (not a static file) so every project gets a themed
// tab icon for free — same glyph shape as before, tinted to DOCS_ACCENT_HUE.
writeFileSync(
	fileURLToPath(new URL('./public/favicon.svg', import.meta.url)),
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="70" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-weight="700" fill="hsl(${ACCENT_HUE}, 70%, 45%)">${FAVICON_GLYPH}</text></svg>\n`
);

// Written by scripts/sync-docs.mjs (runs as the `prebuild`/`predev` npm
// script, before this file is evaluated) from README.md's own H2 headings —
// see that script for the extraction/slug logic.
const readmeNavPath = fileURLToPath(new URL('./src/generated/readme-nav.json', import.meta.url));
/** @type {{ label: string; anchor: string; isCommand: boolean }[]} */
const readmeSections = JSON.parse(readFileSync(readmeNavPath, 'utf8'));

const commandSections = readmeSections.filter((s) => s.isCommand);
const otherSections = readmeSections.filter((s) => !s.isCommand);

const hasAgents = existsSync(fileURLToPath(new URL('./src/content/docs/agents.md', import.meta.url)));
const hasChangelog = existsSync(
	fileURLToPath(new URL('./src/content/docs/changelog.md', import.meta.url))
);
const referenceItems = [
	...(hasAgents ? [{ label: 'AGENTS.md', link: '/agents/' }] : []),
	...(hasChangelog ? [{ label: 'Changelog', link: '/changelog/' }] : []),
];

const sidebar = [
	{ label: 'Overview', link: '/#_top' },
	...otherSections.map((s) => ({ label: s.label.replace(/`/g, ''), link: s.anchor })),
	...(commandSections.length
		? [
				{
					label: 'Commands',
					collapsed: false,
					items: commandSections.map((s) => ({ label: s.label.replace(/`/g, ''), link: s.anchor })),
				},
			]
		: []),
	// AGENTS.md / Changelog aren't README sections, so they're a separate
	// group rather than mixed into the list above — but still plain sidebar
	// entries (not a custom Header override) so mobile gets them for free
	// through Starlight's own responsive sidebar/menu, instead of needing a
	// second, hand-maintained "mobile version" of the same links.
	...(referenceItems.length ? [{ label: 'Reference', items: referenceItems }] : []),
];

// https://astro.build/config
export default defineConfig({
	site: SITE_URL,
	base: BASE_PATH,
	integrations: [
		starlight({
			title: TITLE,
			description: DESCRIPTION,
			social: GITHUB_URL ? [{ icon: 'github', label: 'GitHub', href: GITHUB_URL }] : [],
			customCss: ['./src/styles/custom.css', ...(EXTRA_CSS ? [EXTRA_CSS] : [])],
			sidebar,
			head: [
				{
					tag: 'style',
					// Cash-green-style per-project accent, generated from
					// DOCS_ACCENT_HUE — see @astrojs/starlight's own
					// style/props.css for the --sl-color-accent-* tokens this
					// overrides and their default values/pattern.
					content: `
						:root {
							--sl-color-accent-low: hsl(${ACCENT_HUE}, 50%, 20%);
							--sl-color-accent: hsl(${ACCENT_HUE}, 70%, 45%);
							--sl-color-accent-high: hsl(${ACCENT_HUE}, 70%, 85%);
						}
						:root[data-theme='light'] {
							--sl-color-accent-high: hsl(${ACCENT_HUE}, 70%, 25%);
							--sl-color-accent: hsl(${ACCENT_HUE}, 70%, 38%);
							--sl-color-accent-low: hsl(${ACCENT_HUE}, 60%, 90%);
						}
					`,
				},
				{
					tag: 'script',
					content: `
						// Starlight's mobile sidebar is a native-Popover-API element that
						// only ever auto-closes on a real page (re)load — fine when every
						// sidebar link is a different page, but most of ours are same-page
						// "/#section" anchors (see astro.config.mjs), which never reload
						// the page, so the menu was staying open after tapping a link.
						document.addEventListener('click', (event) => {
							const link = event.target.closest('a');
							if (!link) return;
							const sidebar = document.getElementById('starlight__sidebar');
							if (sidebar?.contains(link)) sidebar.hidePopover?.();
						});
					`,
				},
			],
		}),
	],
});
