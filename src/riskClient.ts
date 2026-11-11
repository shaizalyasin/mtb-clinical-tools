/**
 * Client for the mtb-survival-model service.
 *
 * The service is stateless and keeps nothing, so there is no session to
 * establish and no identifier to pass. It receives payloads and returns a
 * score. If it is unreachable, the tab says so rather than showing a blank
 * panel: an absent prognosis is a fact worth stating.
 */

import { PatientPayloads } from './portalApi';

export interface Attribution {
    feature: string;
    column: string;
    contribution: number;
    direction: 'increases risk' | 'decreases risk';
}

export interface ReferenceCohort {
    oncotree_code: string;
    n: number;
    is_pan_cancer_fallback: boolean;
}

export interface Prediction {
    risk_score: number;
    risk_tertile: 'low' | 'intermediate' | 'high';
    percentile_within_cancer_type: number;
    reference_cohort: ReferenceCohort;
    attributions: Attribution[];
    missing_features: string[];
    input_caveats: string[];
    model_version: string;
    scale: string;
    disclaimer: string;
}

export interface KmCurve {
    tertile: 'low' | 'intermediate' | 'high';
    n: number;
    events: number;
    time: number[];
    survival: number[];
    at_risk: number[];
}

export interface KmReference {
    reference_cohort: ReferenceCohort;
    tertile_thresholds: [number, number];
    curves: KmCurve[];
    logrank: { statistic: number | null; p_value: number | null };
    max_follow_up_months: number;
    model_version: string;
}

export class RiskServiceError extends Error {}

function base(url: string): string {
    return url.replace(/\/$/, '');
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
        response = await fetch(url, init);
    } catch (cause) {
        throw new RiskServiceError(
            `Could not reach the risk service at ${url}. Is the risk overlay running?`
        );
    }
    if (!response.ok) {
        throw new RiskServiceError(
            `Risk service returned HTTP ${response.status} for ${url}.`
        );
    }
    return (await response.json()) as T;
}

export function predict(
    baseUrl: string,
    payloads: PatientPayloads,
    signal?: AbortSignal
): Promise<Prediction> {
    return call<Prediction>(`${base(baseUrl)}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloads),
        signal,
    });
}

/**
 * The reference curves are static per cancer type, so they are cached for the
 * lifetime of the page. Only the patient's own tertile marker changes between
 * patients of the same type.
 */
const kmCache = new Map<string, Promise<KmReference>>();

export function referenceKm(
    baseUrl: string,
    oncotreeCode: string
): Promise<KmReference> {
    const key = `${base(baseUrl)}|${oncotreeCode}`;
    let cached = kmCache.get(key);
    if (!cached) {
        cached = call<KmReference>(
            `${base(baseUrl)}/reference-km/${encodeURIComponent(oncotreeCode)}`
        );
        // A failed request must not be cached, or the tab can never recover.
        cached.catch(() => kmCache.delete(key));
        kmCache.set(key, cached);
    }
    return cached;
}
