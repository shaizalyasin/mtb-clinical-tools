/**
 * The entire surface where this bundle touches cBioPortal internals.
 *
 * Everything in this file is verified against cbioportal-frontend v6.4.4. None
 * of it is a supported public API, so this is the one file to re-check when the
 * portal image tag is bumped. See CONTRACT.md.
 */

/** A mobx `autorun`, handed to us by the portal. See MountCallback. */
export type Autorun = (fn: () => void) => () => void;

/**
 * cBioPortal's ICustomTabConfiguration, as far as we care about it.
 * `customParameters` is whatever we put in the frontend.json entry.
 */
export interface CustomTabConfig {
    id: string;
    title: string;
    location: string;
    customParameters?: Record<string, unknown>;
}

/**
 * Verified at v6.4.4 in src/shared/lib/customTabs.ts -> showCustomTab():
 *
 *     getBrowserWindow()[tab.mountCallbackName](
 *         div, tab, url, store, autorun, isUnmount
 *     );
 *
 * The callback is invoked for BOTH mount and unmount; `isUnmount` discriminates.
 * It is called only after the tab's pathsToJs/pathsToCSS dependency promise
 * resolves, and that promise is cached per tab config object.
 */
export type MountCallback = (
    div: HTMLElement,
    tab: CustomTabConfig,
    url: string,
    store: PatientViewPageStore | null,
    autorun: Autorun,
    isUnmount: boolean
) => void;

/**
 * cBioPortal's MobxPromise. Upstream itself gates on isPending/isComplete and
 * reads .result -- e.g. PatientViewPage.tsx's `hideTissueImageTab` and
 * `shouldShowTrialMatch` at v6.4.4.
 */
export interface RemoteData<T> {
    isPending: boolean;
    isComplete: boolean;
    isError: boolean;
    result: T;
}

/**
 * The fields of PatientViewPageStore this demo reads. All verified present at
 * v6.4.4 in src/pages/patientView/clinicalInformation/PatientViewPageStore.ts:
 *
 *   patientId  @computed  (line ~351)
 *   studyId    @observable (line ~361)
 *   sampleId   @computed  (line ~393) -- NOTE: empty string unless the URL
 *                                       carries an explicit sampleId
 *   mutationData, discreteCNAData, clinicalDataPatient, clinicalDataForSamples,
 *   clinicalEvents, samples -- all `readonly x = remoteData(...)`
 */
export interface PatientViewPageStore {
    patientId: string;
    studyId: string;
    sampleId: string;
    mutationData: RemoteData<unknown[]>;
    samples: RemoteData<Array<{ sampleId: string }>>;
    clinicalEvents: RemoteData<unknown[]>;
}

interface PortalWindow extends Window {
    /**
     * Set in the PatientViewPage constructor at v6.4.4:
     *     getBrowserWindow().patientViewPageStore = this.pageStore;
     * (src/pages/patientView/PatientViewPage.tsx, line ~189)
     *
     * This is our actual source for the store, because the `store` argument
     * arrives as null on the patient page -- see resolveStore().
     */
    patientViewPageStore?: PatientViewPageStore;
}

/**
 * Resolve the live PatientViewPageStore.
 *
 * The `store` parameter is part of the documented mount signature, but at
 * v6.4.4 the patient page never populates it. The live call path is
 *
 *   PatientViewPageTabs.tsx -> buildCustomTabs()
 *     -> customTabHelpers.tsx customTabCallback()
 *        -> showCustomTab(div, tab, location.href, null, isUnmount)
 *                                                 ^^^^
 *
 * The variant that does pass the store, PatientViewPage.customTabMountCallback,
 * is dead code at this tag -- its only call site is commented out in
 * PatientViewPageTabs.tsx.
 *
 * So we prefer the argument (in case a later version starts populating it, or
 * for the study/results/group-comparison pages) and fall back to the window
 * global, which is the same live instance.
 */
export function resolveStore(
    store: PatientViewPageStore | null
): PatientViewPageStore | undefined {
    return store ?? (window as PortalWindow).patientViewPageStore;
}
