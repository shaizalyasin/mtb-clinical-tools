# The upstream contract

This bundle is injected into cBioPortal at runtime and reads the portal's own
React/MobX internals. **None of what it depends on is a supported public API.**
cBioPortal's `custom_tabs` mechanism is documented, but the shape of the store
handed to a tab is not, and upstream is free to change it in any release.

That is a real cost, and it is worth being precise about how big it is: it is a
**five-minute checklist per upgrade**, not a fork rebase. The whole point of
this repo is to convert an open-ended merge conflict into the closed checklist
below.

Everything the bundle depends on is confined to
[`src/portal.ts`](src/portal.ts). If the checks below pass, nothing else needs
looking at.

## Verified against

cBioPortal **6.4.4** (`cbioportal/cbioportal:6.4.4`), frontend source at tag
`v6.4.4` of `cbioportal/cbioportal-frontend`.

## The upgrade checklist

Clone `cbioportal-frontend` at the new tag and check these six things.

### 0. The tab id is still routable

**Not a bundle concern but a deployment-config concern, and it fails the loudest,
so check it first.** The custom tab's `id` becomes a URL path segment, and
cBioPortal's router validates it. `customTabParamValidator` in `src/routes.tsx`
accepts a custom tab id only if the path matches one of:

```
patient/openResource_.+          <- the demo uses this
study/<StudyViewResourceTabPrefix>.+
.+/customTab[0-9]
```

`LocationValidationWrapper` combines it as
`validator(params) || customTabParamValidator(location)`, so anything else
renders an `ErrorPage`. The failure mode is nasty: the tab appears in the tab
bar and is clickable, and clicking it blanks the **entire patient view**. It
does not look like a custom-tab problem.

Confirm those patterns still hold, and that the id in the deployment's
`frontend.json` still matches one.

### 1. The mount signature

`src/shared/lib/customTabs.ts`, `showCustomTab()`. Expected:

```ts
getBrowserWindow()[tab.mountCallbackName](div, tab, url, store, autorun, isUnmount);
```

Six arguments, in that order. `autorun` must still be the portal's own MobX
`autorun`. The bundle does not ship MobX, and binding to the host's observable
graph is what makes the tab reactive.

### 2. `mountCallbackName` is still resolved off `window`

Same function. The config is JSON, so the callback is named, not passed.

Note that `mountCallback` *can* also be expressed in JSON: `prepareCustomTabConfigurations()`
in `src/shared/lib/customTabs/customTabHelpers.tsx` runs `eval()` on it when it
is a string. We deliberately do not use that: a named global lets the bundle
own its own code, keeps the config to a URL and a name, and avoids `eval`.

### 3. Where the live store actually comes from

**This is the one that already bit us, and the most likely to change.**

At 6.4.4 the `store` argument arrives as `null` on the patient page. The live
call path is:

```
PatientViewPageTabs.tsx        buildCustomTabs()
  customTabHelpers.tsx         customTabCallback()
                                 showCustomTab(div, tab, location.href, null, isUnmount)
                                                                       ^^^^
```

The variant that does pass the store, `PatientViewPage.customTabMountCallback`
(`src/pages/patientView/PatientViewPage.tsx`), is dead code at this tag; its
only call site is commented out in `PatientViewPageTabs.tsx`.

So the bundle instead reads the global that `PatientViewPage`'s constructor
publishes:

```ts
getBrowserWindow().patientViewPageStore = this.pageStore;
```

**Check both**: that the global is still assigned, and whether the `store`
argument has started being populated. `resolveStore()` prefers the argument and
falls back to the global, so if upstream fixes the call site, this bundle picks
that up with no change.

### 4. Store field names

`src/pages/patientView/clinicalInformation/PatientViewPageStore.ts`. The bundle
reads:

| Field | Kind at 6.4.4 |
| --- | --- |
| `patientId` | `@computed` getter |
| `studyId` | `@observable` |
| `sampleId` | `@computed` getter, **empty string** unless the URL names a sample |
| `mutationData` | `remoteData` |
| `samples` | `remoteData` |
| `clinicalEvents` | `remoteData` |

`remoteData` containers expose `isPending` / `isComplete` / `isError` /
`result`. Upstream gates on these itself; see `hideTissueImageTab` and
`shouldShowTrialMatch` in `PatientViewPage.tsx`, so the pattern in
`src/snapshot.ts` mirrors upstream's own usage.

### 5. Tab lifecycle

`src/shared/components/MSKTabs/MSKTabs.tsx`. `MSKTab` fires `onTabDidMount` from
`componentDidMount` and `onTabUnmount` from `componentWillUnmount`, and
`buildCustomTabs` wires both to the same callback, discriminated by `isUnmount`.

Whether unmount fires at all depends on `unmountOnHide` in the tab config.
`buildCustomTabs` passes `unmountOnHide={thisTab.unmountOnHide === true}`, so it
is **false unless the config explicitly sets `true`**. The demo config sets
`true` deliberately, so that switching tabs genuinely exercises the teardown
path instead of leaving the tab mounted and hidden.

## What a failed check looks like

The bundle fails loudly rather than silently:

- Store can't be resolved → the tab renders a "mount contract has drifted"
  message pointing here, instead of a blank panel.
- A `remoteData` field disappears → its row shows `loading…` forever. A count
  that never resolves is the signal to come back to this document.
- The tab id stops being routable → clicking the tab blanks the whole patient
  view (check 0).

## Running the check

The deployment repo's `./verify.sh` drives a real browser through all of it and
prints a pass/fail line per criterion. After bumping the image tag, run it. If
it comes back 8/8, the contract still holds and there is nothing else to do. If
something fails, this document says where to look.
