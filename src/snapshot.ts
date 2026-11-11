import { PatientViewPageStore, RemoteData } from './portal';

export type Loadable<T> =
    | { state: 'pending' }
    | { state: 'error' }
    | { state: 'ready'; value: T };

export interface StoreSnapshot {
    patientId: string;
    studyId: string;
    /** Empty on a plain patient page; only set when the URL names a sample. */
    sampleId: string;
    mutationCount: Loadable<number>;
    sampleIds: Loadable<string[]>;
    clinicalEventCount: Loadable<number>;
}

/**
 * Reads a remoteData container in the order upstream does: check isPending /
 * isComplete, only then touch .result.
 *
 * Touching every branch matters for more than correctness here -- this function
 * runs inside the portal's `autorun`, so mobx only re-runs us for the
 * observables we actually dereference. Reading isPending and isComplete on
 * every call is what makes the pending -> ready transition reactive.
 */
function read<T, R>(
    remote: RemoteData<T> | undefined,
    project: (value: T) => R
): Loadable<R> {
    if (!remote) return { state: 'pending' };
    if (remote.isError) return { state: 'error' };
    if (remote.isPending) return { state: 'pending' };
    if (!remote.isComplete) return { state: 'pending' };
    return { state: 'ready', value: project(remote.result) };
}

export interface PrognosisTarget {
    patientId: string;
    studyId: string;
    /** The sample to score. */
    sampleId: Loadable<string>;
}

/**
 * The identifiers the Prognosis tab needs, and nothing else.
 *
 * Deliberately narrower than readSnapshot: every store field read widens the
 * surface that has to be re-checked on a cBioPortal upgrade, and these are all
 * fields the demo tab already depends on, so this adds nothing new to
 * CONTRACT.md.
 *
 * store.sampleId is empty unless the URL names a sample, which it usually does
 * not, so the first entry of store.samples is the real source. Taking the
 * first is the same choice the training pipeline makes when a patient has more
 * than one sample.
 */
export function readPrognosisTarget(
    store: PatientViewPageStore
): PrognosisTarget {
    const explicit = store.sampleId;
    const fromSamples = read(store.samples, s => s.map(x => x.sampleId));

    let sampleId: Loadable<string>;
    if (explicit) {
        sampleId = { state: 'ready', value: explicit };
    } else if (fromSamples.state === 'ready') {
        sampleId = fromSamples.value.length
            ? { state: 'ready', value: fromSamples.value[0] }
            : { state: 'error' };
    } else {
        sampleId = fromSamples;
    }

    return {
        patientId: store.patientId,
        studyId: store.studyId,
        sampleId,
    };
}

export function readSnapshot(store: PatientViewPageStore): StoreSnapshot {
    return {
        patientId: store.patientId,
        studyId: store.studyId,
        sampleId: store.sampleId,
        mutationCount: read(store.mutationData, m => m.length),
        sampleIds: read(store.samples, s => s.map(x => x.sampleId)),
        clinicalEventCount: read(store.clinicalEvents, e => e.length),
    };
}
