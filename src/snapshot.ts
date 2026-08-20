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
