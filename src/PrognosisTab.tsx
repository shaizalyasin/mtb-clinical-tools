/**
 * The Prognosis tab.
 *
 * Layout order is deliberate and follows the model spec: the Kaplan-Meier plot
 * first, then the percentile in plain language, then the attributions. A raw
 * Cox score is meaningless to a clinician, so the percentile against the
 * patient's own cancer type is the headline and the score is reported only for
 * completeness.
 */

import { useEffect, useRef, useState } from 'react';
import { KaplanMeier } from './KaplanMeier';
import { fetchPatientPayloads } from './portalApi';
import {
    KmReference,
    Prediction,
    RiskServiceError,
    predict,
    referenceKm,
} from './riskClient';
import { Loadable } from './snapshot';

type Phase =
    | { kind: 'waiting' }
    | { kind: 'loading'; step: string }
    | { kind: 'error'; message: string }
    | { kind: 'ready'; prediction: Prediction; km: KmReference | null };

const TERTILE_WORDS: Record<Prediction['risk_tertile'], string> = {
    low: 'lower third',
    intermediate: 'middle third',
    high: 'upper third',
};

function ordinal(value: number): string {
    const last = value % 10;
    const teens = value % 100;
    if (teens >= 11 && teens <= 13) return `${value}th`;
    if (last === 1) return `${value}st`;
    if (last === 2) return `${value}nd`;
    if (last === 3) return `${value}rd`;
    return `${value}th`;
}

function AttributionBars({ prediction }: { prediction: Prediction }) {
    const widest = Math.max(
        ...prediction.attributions.map(a => Math.abs(a.contribution)),
        0.0001
    );
    return (
        <table className="mtb-attr">
            <tbody>
                {prediction.attributions.map(attribution => {
                    const share = (Math.abs(attribution.contribution) / widest) * 50;
                    const increases = attribution.contribution > 0;
                    return (
                        <tr key={attribution.column}>
                            <th scope="row">{attribution.feature}</th>
                            <td>
                                <div className="mtb-attr-track">
                                    <span className="mtb-attr-zero" />
                                    <span
                                        className={
                                            'mtb-attr-bar ' +
                                            (increases
                                                ? 'mtb-attr-up'
                                                : 'mtb-attr-down')
                                        }
                                        style={
                                            increases
                                                ? { left: '50%', width: `${share}%` }
                                                : {
                                                      right: '50%',
                                                      width: `${share}%`,
                                                  }
                                        }
                                    />
                                </div>
                            </td>
                            <td className="mtb-attr-value">
                                {attribution.contribution > 0 ? '+' : ''}
                                {attribution.contribution.toFixed(3)}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}

export function PrognosisTab({
    studyId,
    patientId,
    sampleId,
    riskBaseUrl,
    apiBase,
}: {
    studyId: string;
    patientId: string;
    sampleId: Loadable<string>;
    riskBaseUrl: string;
    apiBase: string;
}) {
    const [phase, setPhase] = useState<Phase>({ kind: 'waiting' });
    const requestId = useRef(0);

    const resolvedSample = sampleId.state === 'ready' ? sampleId.value : null;

    useEffect(() => {
        if (sampleId.state === 'error') {
            setPhase({
                kind: 'error',
                message: 'cBioPortal could not load this patient’s samples.',
            });
            return;
        }
        if (!resolvedSample || !studyId || !patientId) {
            setPhase({ kind: 'waiting' });
            return;
        }

        // The portal re-runs our autorun whenever any observable it touches
        // changes, so this effect must be keyed tightly and must ignore the
        // results of any request it has superseded.
        requestId.current += 1;
        const thisRequest = requestId.current;
        const controller = new AbortController();
        const stale = () => requestId.current !== thisRequest;

        (async () => {
            try {
                setPhase({ kind: 'loading', step: 'Reading patient data' });
                const payloads = await fetchPatientPayloads(
                    studyId,
                    patientId,
                    resolvedSample,
                    apiBase
                );
                if (stale()) return;

                setPhase({ kind: 'loading', step: 'Scoring' });
                const prediction = await predict(
                    riskBaseUrl,
                    payloads,
                    controller.signal
                );
                if (stale()) return;

                // A missing reference curve must not lose the prediction, so
                // this failure is absorbed rather than propagated.
                let km: KmReference | null = null;
                try {
                    km = await referenceKm(
                        riskBaseUrl,
                        prediction.reference_cohort.oncotree_code
                    );
                } catch {
                    km = null;
                }
                if (stale()) return;

                setPhase({ kind: 'ready', prediction, km });
            } catch (error) {
                if (stale()) return;
                setPhase({
                    kind: 'error',
                    message:
                        error instanceof RiskServiceError
                            ? error.message
                            : `Could not produce a prognosis: ${String(error)}`,
                });
            }
        })();

        return () => controller.abort();
    }, [studyId, patientId, resolvedSample, sampleId.state, riskBaseUrl, apiBase]);

    return (
        <div className="mtb-demo mtb-prognosis">
            <h3 className="mtb-heading">Predicted overall survival risk</h3>

            {phase.kind === 'waiting' && (
                <p className="mtb-pending">Waiting for the patient&rsquo;s sample&hellip;</p>
            )}

            {phase.kind === 'loading' && (
                <p className="mtb-pending">{phase.step}&hellip;</p>
            )}

            {phase.kind === 'error' && (
                <p className="mtb-error">{phase.message}</p>
            )}

            {phase.kind === 'ready' && (
                <Result prediction={phase.prediction} km={phase.km} />
            )}
        </div>
    );
}

function Result({
    prediction,
    km,
}: {
    prediction: Prediction;
    km: KmReference | null;
}) {
    const cohort = prediction.reference_cohort;

    return (
        <>
            {km ? (
                <KaplanMeier km={km} highlight={prediction.risk_tertile} />
            ) : (
                <p className="mtb-pending">
                    Reference survival curves are unavailable for this cancer type.
                </p>
            )}

            <p className="mtb-statement">
                Predicted risk is higher than{' '}
                <strong>{prediction.percentile_within_cancer_type}%</strong> of
                patients
                {cohort.is_pan_cancer_fallback ? (
                    <>
                        {' '}
                        in the <strong>pan-cancer</strong> reference cohort (n ={' '}
                        {cohort.n.toLocaleString()}). There were too few patients
                        of this cancer type to compare against.
                    </>
                ) : (
                    <>
                        {' '}
                        with <strong>{cohort.oncotree_code}</strong> in the
                        reference cohort (n = {cohort.n.toLocaleString()}).
                    </>
                )}{' '}
                That places them in the {TERTILE_WORDS[prediction.risk_tertile]},
                at the {ordinal(prediction.percentile_within_cancer_type)}{' '}
                percentile.
            </p>

            <h4 className="mtb-subheading">What drove this estimate</h4>
            <AttributionBars prediction={prediction} />
            <p className="mtb-footnote">
                Contributions are on the log-hazard scale, red to the right
                increases predicted risk and blue to the left decreases it. Risk
                score {prediction.risk_score.toFixed(3)}, model{' '}
                {prediction.model_version}.
            </p>

            {(prediction.missing_features.length > 0 ||
                prediction.input_caveats.length > 0) && (
                <div className="mtb-caveats">
                    <h4 className="mtb-subheading">
                        Known gaps in the inputs for this patient
                    </h4>
                    <ul>
                        {prediction.missing_features.map(item => (
                            <li key={item}>
                                <code>{item}</code> was not available, so the model
                                treated it as missing rather than as a normal value.
                            </li>
                        ))}
                        {prediction.input_caveats.map(item => (
                            <li key={item}>{item}</li>
                        ))}
                    </ul>
                </div>
            )}

            <p className="mtb-disclaimer">{prediction.disclaimer}</p>
        </>
    );
}
