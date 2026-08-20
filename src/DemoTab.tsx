import type { ReactNode } from 'react';
import { Loadable, StoreSnapshot } from './snapshot';

function Value({ children }: { children: ReactNode }) {
    return <span className="mtb-value">{children}</span>;
}

function Loaded<T>({
    value,
    render,
}: {
    value: Loadable<T>;
    render: (v: T) => React.ReactNode;
}) {
    if (value.state === 'pending')
        return <span className="mtb-pending">loading&hellip;</span>;
    if (value.state === 'error')
        return <span className="mtb-error">failed to load</span>;
    return <Value>{render(value.value)}</Value>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="mtb-row">
            <span className="mtb-label">{label}</span>
            {children}
        </div>
    );
}

export function DemoTab({
    snapshot,
    mountCount,
}: {
    snapshot: StoreSnapshot;
    mountCount: number;
}) {
    return (
        <div className="mtb-demo">
            <h3 className="mtb-heading">MTB Clinical Tools &mdash; mount demo</h3>
            <p className="mtb-intro">
                Rendered by <code>mtb-tools.js</code>, a bundle served outside
                cBioPortal and injected through <code>custom_tabs</code>. The
                portal's own frontend source is unmodified.
            </p>

            <div className="mtb-grid">
                <Row label="Study">
                    <Value>{snapshot.studyId || '—'}</Value>
                </Row>
                <Row label="Patient">
                    <Value>{snapshot.patientId || '—'}</Value>
                </Row>
                <Row label="Sample (from URL)">
                    <Value>{snapshot.sampleId || '— (patient-level view)'}</Value>
                </Row>
                <Row label="Samples">
                    <Loaded
                        value={snapshot.sampleIds}
                        render={ids => ids.join(', ') || 'none'}
                    />
                </Row>
                <Row label="Mutations">
                    <Loaded
                        value={snapshot.mutationCount}
                        render={n => `${n}`}
                    />
                </Row>
                <Row label="Clinical events">
                    <Loaded
                        value={snapshot.clinicalEventCount}
                        render={n => `${n}`}
                    />
                </Row>
            </div>

            <p className="mtb-note">
                The counts above start as <em>loading…</em> and resolve on their
                own. That transition is the proof: this component is reacting to
                the portal's live <code>PatientViewPageStore</code> through the
                injected <code>autorun</code>, not reading a value copied at
                mount time.
            </p>
            <p className="mtb-note">
                Tab mounted <Value>{mountCount}</Value>{' '}
                {mountCount === 1 ? 'time' : 'times'} this page load. Switch away
                and back &mdash; this counter rises, but the panel above must
                never appear twice.
            </p>
        </div>
    );
}
