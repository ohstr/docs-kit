# docs-kit

A shared [Astro](https://astro.build) + [Starlight](https://starlight.astro.build)
docs-site generator for `ohstr` projects. A project repo doesn't vendor
this app under its own `site/` — it calls this repo's reusable GitHub
Actions workflow, which builds this app against *that repo's* README.md
(and optionally `AGENTS.md`/`CHANGELOG.md`) and deploys straight to that
repo's own GitHub Pages.

One place to fix a bug or improve the site for every project at once,
instead of N copies drifting apart.

## What it does

- Mirrors a target repo's `README.md` into the site's home page, `AGENTS.md`
  into `/agents/` and `CHANGELOG.md` into `/changelog/` — both optional,
  silently skipped if the repo doesn't have one.
- Builds the left sidebar from README's own `##` headings: prose sections
  (Features, Installation, ...) as top-level entries, and any heading that
  starts with a backtick (` `` `cmd`` ` `` `) grouped under a collapsible
  "Commands" section — this is how a CLI's per-command reference sections
  end up organized without any manual sidebar config.
- Rewrites README's own relative links: the three mirrored files become
  in-site links, everything else (`LICENSE`, `skills/`, workflow files, ...)
  becomes an absolute link back to the source repo on GitHub.
- Generates a themed favicon and accent color per project from two inputs
  (`accent-hue`, `favicon-glyph`) — no per-project asset to hand-craft.
- Ships two non-obvious fixes on top of stock Starlight: badge rows
  (`[![...]](...)` badge sequences) render inline instead of stacking one
  per line, and the mobile sidebar menu actually closes when you tap a
  same-page section link (Starlight's own popover only auto-closes on a
  real page navigation, which a `/#section` anchor never triggers).

## Using it in a project repo

Add `.github/workflows/pages.yml`:

```yaml
name: Deploy Pages

on:
  push:
    branches: [main]
    paths:
      - README.md
      - AGENTS.md
      - CHANGELOG.md
      - .github/workflows/pages.yml
  workflow_dispatch:

jobs:
  docs:
    # Required here, not inside build-docs.yml itself: a reusable workflow
    # can't self-grant pages/id-token when called cross-repo — the caller's
    # own job has to. Omitting this fails instantly with zero jobs ever
    # scheduled (GitHub reports it as a generic "workflow file issue").
    permissions:
      contents: read
      pages: write
      id-token: write
    uses: ohstr/docs-kit/.github/workflows/build-docs.yml@main
    with:
      title: your-project-name
      description: One-line description, used as the page's meta description.
      accent-hue: 142 # pick a hue that reads as "yours"; omit for Starlight's default blue
      favicon-glyph: "$" # short text/glyph for the generated favicon
```

Then, once via the GitHub UI (Settings → Pages), set the source to
**GitHub Actions** — the workflow's `configure-pages` step only flips this
automatically when Pages was never enabled; a repo previously on the
legacy branch/folder source needs the switch made explicitly once, or the
old Jekyll auto-builder keeps firing on every push and failing (see
`build-docs.yml`'s permissions — this is exactly the failure mode this kit
avoids by using Actions-based deployment from the start).

### Inputs

| Input | Required | Default | Purpose |
|---|---|---|---|
| `title` | yes | — | Site title and README page title |
| `description` | no | `''` | Meta description |
| `accent-hue` | no | `234` (Starlight blue) | HSL hue, 0-360 |
| `favicon-glyph` | no | `>_` | Generated favicon text |
| `extra-css` | no | `''` | Path (in the calling repo) to a CSS file applied after this kit's base styles — for art-direction beyond a hue |
| `extra-public-dir` | no | `''` | Path (in the calling repo) to a directory of static files (install scripts, an agent `PROMPT.md`, ...) copied verbatim into the deployed site's root |
| `docs-kit-ref` | no | `main` | Which ref of this repo to build with — **pin this to a released tag** once one exists, so a docs-kit change doesn't silently change every project's site on its next push |

Everything else (the site's URL, base path, and the GitHub repo link)
is derived automatically from the calling repo's own `github.*` Actions
context — nothing to configure.

### Local dev

There's no per-project `site/` to `cd` into. From the project repo's root:

```sh
git clone https://github.com/ohstr/docs-kit /tmp/docs-kit
cd /tmp/docs-kit && npm install
DOCS_CONTENT_DIR=$OLDPWD DOCS_TITLE=your-project-name DOCS_ACCENT_HUE=142 npm run dev
```

Open `http://localhost:4321/` (no base path locally unless you also set
`DOCS_BASE_PATH`). Hot reload watches the *target* repo's README.md/
AGENTS.md/CHANGELOG.md, not this kit's own files.

## Env vars (what `build-docs.yml` actually sets)

`astro.config.mjs` and `scripts/sync-docs.mjs` are both driven entirely by
these — see the comments at the top of each for the full contract:

- `DOCS_CONTENT_DIR` — path to the target repo's checkout
- `DOCS_GITHUB_URL`, `DOCS_SITE_URL`, `DOCS_BASE_PATH`
- `DOCS_TITLE`, `DOCS_DESCRIPTION`
- `DOCS_ACCENT_HUE`, `DOCS_FAVICON_GLYPH`
- `DOCS_EXTRA_CSS`

## Repo layout

```
astro.config.mjs      # reads the env vars above, builds sidebar + theme
scripts/sync-docs.mjs # mirrors README.md/AGENTS.md/CHANGELOG.md -> src/content/docs
src/styles/custom.css # the one universal fix (badge inline-row) — theming itself
                       # is generated inline in astro.config.mjs's `head`, not here
src/content.config.ts # Starlight's content collection, unchanged from stock
.github/workflows/build-docs.yml  # the reusable workflow project repos call
```
