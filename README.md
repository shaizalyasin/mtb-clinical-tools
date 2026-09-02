# mtb-clinical-tools

The MTB features, as a standalone bundle.

This repo builds two files:

```
dist/mtb-tools.js
dist/mtb-tools.css
```

Those get served from anywhere static, and an unmodified cBioPortal is pointed
at them through a `custom_tabs` entry in its `frontend.json`. cBioPortal loads
them into its own page and calls a global we expose. No cBioPortal source is
patched, and no cBioPortal image is rebuilt.

Right now it holds one demo tab, whose only job is to prove the mechanism works
against a real portal. The real MTB features move in here afterwards.

## Why this exists

The MTB features currently live as hardcoded React components inside a fork of
`cbioportal-frontend`. That fork has to be rebased against upstream forever, and
it can't be shared with another institution without shipping them a whole
portal build.

Moving the features out here changes the upgrade story from "rebase a fork" to
"bump an image tag" — with one caveat, documented in
[CONTRACT.md](CONTRACT.md), which is a short per-upgrade check rather than a
merge.

## What the demo tab does

It reads the live `PatientViewPageStore` out of the running portal and renders:

- study / patient / sample identifiers
- the sample list, the mutation count, and the clinical-event count

The counts start as *loading…* and resolve on their own a moment later. **That
transition is the entire point.** It is what distinguishes reading the portal's
live, reactive MobX store from reading a value scraped out of the URL at mount
time. If a count never leaves *loading…*, the contract has broken — see
[CONTRACT.md](CONTRACT.md).

The panel also shows how many times it has mounted this page load, so switching
away and back is visibly exercising the mount/unmount path rather than doing
nothing.

A second panel, talking to an authenticated backend, appears only when the
deployment turns it on through `customParameters.mtbBackend`. It is off in the
plain demo — see the auth overlay in the deployment repository.

## How it attaches

cBioPortal's `custom_tabs` mechanism is JS injection into the portal's own page
— not an iframe. The portal:

1. appends each `pathsToCSS` entry as a `<link>` and loads each `pathsToJs`
   entry as a `<script>` (caching the resulting promise per tab),
2. looks up `mountCallbackName` on `window`,
3. calls it as `(div, tab, url, store, autorun, isUnmount)`.

Because it is the same document and the same origin, the callback gets the
portal's real MobX `autorun` and can subscribe to the portal's real store. The
bundle ships its own React and does *not* ship MobX — reactivity comes from the
injected `autorun`, which is what binds it to the host's observable graph.

One wrinkle worth knowing up front: at 6.4.4 the `store` argument arrives as
`null` on the patient page, so the store is read from
`window.patientViewPageStore` instead. Both paths are handled. The details, and
why, are in [CONTRACT.md](CONTRACT.md).

## Layout

| File | What it holds |
| --- | --- |
| [`src/portal.ts`](src/portal.ts) | **Every** dependency on cBioPortal internals, isolated on purpose |
| [`src/index.tsx`](src/index.tsx) | Registers `window.renderMtbDemoTab` |
| [`src/mount.tsx`](src/mount.tsx) | Mount/unmount lifecycle, idempotency, autorun disposal |
| [`src/snapshot.ts`](src/snapshot.ts) | Reads store fields the way upstream does |
| [`src/DemoTab.tsx`](src/DemoTab.tsx) | The React component |
| [`src/AuthPanel.tsx`](src/AuthPanel.tsx) | The authenticated-backend panel, shown only when the deployment enables it |

Keeping the contract in one file is deliberate: an upgrade check is a read of
`src/portal.ts` against the new tag, not an audit of the whole repo.

## Build

Via Docker, which needs nothing installed locally:

```bash
docker build -t mtb-clinical-tools .
docker run --rm -p 8081:80 mtb-clinical-tools
```

Or directly:

```bash
npm install
npm run build      # -> dist/
npm run dev        # watch mode
npm run typecheck
```

Note: `npm run build` from a Windows UNC path (`\\wsl.localhost\...`) will not
find its config, because the shell falls back to `C:\Windows` as the working
directory. Build inside WSL or in the container instead.

## Adding a real feature later

1. Add a component, and add whatever store fields it needs to the interfaces in
   `src/portal.ts` — so the contract stays inventoried in one place.
2. Read those fields in `src/snapshot.ts`, gating on `isPending` / `isComplete`
   before touching `.result`.
3. If it needs a second tab, export another global and add a second
   `custom_tabs` entry. One bundle can back many tabs.

Features that need their own backend (FhirSpark, and anything else that talks to
a service) will need that service reachable from the browser and, if it is on
another origin, CORS on that service. The bundle itself stays a static file.

## Deploying it

See the companion deployment repository, [`mtb`](../mtb), which brings up
official cBioPortal 6.4.4 with this bundle injected and verifies it in a
browser.
