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

/** As cBioPortal returns them: identifiers, profile ids, genomic coordinates. */
interface RawAlteration {
    hugoGeneSymbol?: string;
    gene?: { hugoGeneSymbol?: string };
    mutationType?: string;
    variantClassification?: string;
    alteration?: number;
}

/**
 * The fields the model reads, and nothing else.
 *
 * cBioPortal's responses carry studyId, patientId, sampleId, molecularProfileId
 * and the full genomic coordinates of every variant. Forwarding them verbatim
 * would hand the risk service an identified record, which contradicts the whole
 * reason the service is stateless and has no route back to the portal. So the
 * payload is reduced here, in the browser, before it leaves the page.
 *
 * risk/verify-risk.mjs asserts that no identifier reaches the service, so this
 * cannot quietly regress.
 */
export interface MinimalAlteration {
    hugoGeneSymbol?: string;
    mutationType?: string;
    variantClassification?: string;
    alteration?: number;
}

export interface MinimalClinicalDatum {
    clinicalAttributeId: string;
    value: string;
}

export interface PatientPayloads {
    clinical_data: MinimalClinicalDatum[];
    mutations: MinimalAlteration[];
    discrete_cna: MinimalAlteration[];
}

function minimalClinical(items: ClinicalDatum[]): MinimalClinicalDatum[] {
    return items.map(item => ({
        clinicalAttributeId: item.clinicalAttributeId,
        value: item.value,
    }));
}

/** Mutations and discrete CNA reduce to the same three fields the model uses. */
function minimalAlterations(items: RawAlteration[]): MinimalAlteration[] {
    return items.map(item => ({
        hugoGeneSymbol: item.hugoGeneSymbol ?? item.gene?.hugoGeneSymbol,
        mutationType: item.mutationType,
        variantClassification: item.variantClassification,
        alteration: item.alteration,
    }));
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
        ? await json<RawAlteration[]>(
              `${api}/molecular-profiles/${encodeURIComponent(
                  mutation.molecularProfileId
              )}/mutations/fetch?projection=DETAILED`,
              postBody(sampleId)
          )
        : [];

    let discreteCna: RawAlteration[] = [];
    if (cna) {
        try {
            discreteCna = await json<RawAlteration[]>(
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

    // Reduced here, not at the call site, so there is exactly one place where
    // portal data can turn into a request body.
    return {
        clinical_data: minimalClinical([...sampleClinical, ...patientClinical]),
        mutations: minimalAlterations(mutations),
        discrete_cna: minimalAlterations(discreteCna),
    };
}
