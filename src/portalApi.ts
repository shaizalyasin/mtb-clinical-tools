/**
 * Fetches the payloads the risk model needs, from cBioPortal's own REST API.
 *
 * These requests go to the portal, same origin, with no Authorization header
 * and no credentials option: the browser attaches the session cookie by
 * itself. That is deliberate and is the reason the risk service never talks to
 * cBioPortal. The data is retrieved under the signed-in user's own rights and
 * then handed on, so the service holds no portal credentials and cannot be
 * used to read a patient the user is not entitled to see.
 *
 * Unlike `portal.ts`, nothing here touches cBioPortal internals. This is the
 * public REST API, so it is not part of the per-upgrade check surface.
 */

export interface ClinicalDatum {
    clinicalAttributeId: string;
    value: string;
    patientId?: string;
    sampleId?: string;
}

export interface MolecularProfile {
    molecularProfileId: string;
    molecularAlterationType: string;
    datatype?: string;
}

export interface PatientPayloads {
    clinical_data: ClinicalDatum[];
    mutations: unknown[];
    discrete_cna: unknown[];
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    if (!response.ok) {
        throw new Error(`${init?.method ?? 'GET'} ${url} returned ${response.status}`);
    }
    return (await response.json()) as T;
}

function postBody(sampleId: string): RequestInit {
    return {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sampleIds: [sampleId] }),
    };
}

/**
 * Profile ids follow a convention (`<studyId>_mutations`) but are not
 * guaranteed to, so they are looked up rather than constructed.
 */
async function profiles(api: string, studyId: string) {
    const all = await json<MolecularProfile[]>(
        `${api}/studies/${encodeURIComponent(studyId)}/molecular-profiles`
    );
    return {
        mutation: all.find(p => p.molecularAlterationType === 'MUTATION_EXTENDED'),
        cna: all.find(
            p =>
                p.molecularAlterationType === 'COPY_NUMBER_ALTERATION' &&
                p.datatype === 'DISCRETE'
        ),
    };
}

export async function fetchPatientPayloads(
    studyId: string,
    patientId: string,
    sampleId: string,
    apiBase = '/api'
): Promise<PatientPayloads> {
    const api = apiBase.replace(/\/$/, '');
    const study = encodeURIComponent(studyId);
    const sample = encodeURIComponent(sampleId);
    const patient = encodeURIComponent(patientId);

    const { mutation, cna } = await profiles(api, studyId);

    // Sample-level and patient-level attributes are separate endpoints and the
    // model needs both: cancer type and TMB are per sample, age and sex per
    // patient.
    const [sampleClinical, patientClinical] = await Promise.all([
        json<ClinicalDatum[]>(`${api}/studies/${study}/samples/${sample}/clinical-data`),
        json<ClinicalDatum[]>(`${api}/studies/${study}/patients/${patient}/clinical-data`),
    ]);

    // A study may carry no CNA profile at all. That is a missing feature, not
    // an error, so it must not fail the whole request.
    const mutations = mutation
        ? await json<unknown[]>(
              `${api}/molecular-profiles/${encodeURIComponent(
                  mutation.molecularProfileId
              )}/mutations/fetch?projection=DETAILED`,
              postBody(sampleId)
          )
        : [];

    let discreteCna: unknown[] = [];
    if (cna) {
        try {
            discreteCna = await json<unknown[]>(
                `${api}/molecular-profiles/${encodeURIComponent(
                    cna.molecularProfileId
                )}/discrete-copy-number/fetch` +
                    `?discreteCopyNumberEventType=ALL&projection=DETAILED`,
                postBody(sampleId)
            );
        } catch {
            discreteCna = [];
        }
    }

    return {
        clinical_data: [...sampleClinical, ...patientClinical],
        mutations,
        discrete_cna: discreteCna,
    };
}
