/**
 * Kaplan-Meier curves by model risk tertile, drawn as inline SVG.
 *
 * Hand-rolled rather than pulled from a chart library: this bundle is injected
 * into someone else's page, so every kilobyte and every global it adds is a
 * cost the host pays. A step plot with three series does not justify a
 * dependency.
 *
 * The curves come from the service as out-of-fold predictions, meaning the
 * separation drawn here is what the model achieves on patients it was not
 * trained on. An in-sample version of this figure would look better and be
 * misleading, which matters more here than anywhere else in the tab because
 * this is the part a clinician reads first.
 */

import { KmCurve, KmReference } from './riskClient';

const WIDTH = 620;
const HEIGHT = 300;
const PAD = { top: 14, right: 16, bottom: 34, left: 46 };

const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;

const COLOURS: Record<KmCurve['tertile'], string> = {
    low: '#2c7fb8',
    intermediate: '#8c8c8c',
    high: '#c0392b',
};

const LABELS: Record<KmCurve['tertile'], string> = {
    low: 'Low risk',
    intermediate: 'Intermediate',
    high: 'High risk',
};

function stepPath(curve: KmCurve, horizon: number): string {
    const x = (months: number) => PAD.left + (months / horizon) * PLOT_W;
    const y = (survival: number) => PAD.top + (1 - survival) * PLOT_H;

    if (!curve.time.length) return '';

    const parts: string[] = [`M ${x(0)} ${y(1)}`];
    let previous = 1;
    for (let i = 0; i < curve.time.length; i += 1) {
        const months = curve.time[i];
        if (months > horizon) break;
        // Horizontal to the event time at the previous level, then drop.
        parts.push(`L ${x(months).toFixed(1)} ${y(previous).toFixed(1)}`);
        parts.push(`L ${x(months).toFixed(1)} ${y(curve.survival[i]).toFixed(1)}`);
        previous = curve.survival[i];
    }
    return parts.join(' ');
}

export function KaplanMeier({
    km,
    highlight,
}: {
    km: KmReference;
    highlight?: KmCurve['tertile'];
}) {
    const horizon = Math.max(km.max_follow_up_months, 1);
    const xTicks: number[] = [];
    for (let month = 0; month <= horizon; month += 12) xTicks.push(month);
    const yTicks = [0, 0.25, 0.5, 0.75, 1];

    const x = (months: number) => PAD.left + (months / horizon) * PLOT_W;
    const y = (survival: number) => PAD.top + (1 - survival) * PLOT_H;

    return (
        <figure className="mtb-km">
            <svg
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                className="mtb-km-svg"
                role="img"
                aria-label={
                    `Kaplan-Meier survival curves by predicted risk tertile for ` +
                    `${km.reference_cohort.oncotree_code}, ` +
                    `${km.reference_cohort.n} patients`
                }
            >
                {yTicks.map(tick => (
                    <g key={`y${tick}`}>
                        <line
                            x1={PAD.left}
                            x2={PAD.left + PLOT_W}
                            y1={y(tick)}
                            y2={y(tick)}
                            className="mtb-km-grid"
                        />
                        <text
                            x={PAD.left - 8}
                            y={y(tick) + 3.5}
                            className="mtb-km-axis"
                            textAnchor="end"
                        >
                            {tick.toFixed(2).replace(/0$/, '')}
                        </text>
                    </g>
                ))}

                {xTicks.map(tick => (
                    <text
                        key={`x${tick}`}
                        x={x(tick)}
                        y={PAD.top + PLOT_H + 16}
                        className="mtb-km-axis"
                        textAnchor="middle"
                    >
                        {tick}
                    </text>
                ))}
                <text
                    x={PAD.left + PLOT_W / 2}
                    y={HEIGHT - 4}
                    className="mtb-km-axis-title"
                    textAnchor="middle"
                >
                    Months since sequencing
                </text>

                {km.curves.map(curve => {
                    const emphasised = highlight === curve.tertile;
                    return (
                        <path
                            key={curve.tertile}
                            d={stepPath(curve, horizon)}
                            fill="none"
                            stroke={COLOURS[curve.tertile]}
                            strokeWidth={emphasised ? 3 : 1.5}
                            opacity={!highlight || emphasised ? 1 : 0.4}
                        />
                    );
                })}
            </svg>

            <div className="mtb-km-legend">
                {km.curves.map(curve => (
                    <span
                        key={curve.tertile}
                        className={
                            'mtb-km-key' +
                            (highlight === curve.tertile ? ' mtb-km-key-on' : '')
                        }
                    >
                        <i style={{ background: COLOURS[curve.tertile] }} />
                        {LABELS[curve.tertile]} (n={curve.n.toLocaleString()},{' '}
                        {curve.events.toLocaleString()} deaths)
                        {highlight === curve.tertile ? ' — this patient' : ''}
                    </span>
                ))}
            </div>

            <table className="mtb-km-atrisk">
                <caption>Number at risk</caption>
                <thead>
                    <tr>
                        <th scope="col" />
                        {xTicks.map(tick => (
                            <th key={tick} scope="col">
                                {tick}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {km.curves.map(curve => (
                        <tr key={curve.tertile}>
                            <th scope="row" style={{ color: COLOURS[curve.tertile] }}>
                                {LABELS[curve.tertile]}
                            </th>
                            {xTicks.map(tick => {
                                let remaining = curve.n;
                                for (let i = 0; i < curve.time.length; i += 1) {
                                    if (curve.time[i] >= tick) {
                                        remaining = curve.at_risk[i];
                                        break;
                                    }
                                    remaining = 0;
                                }
                                return <td key={tick}>{remaining.toLocaleString()}</td>;
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </figure>
    );
}
