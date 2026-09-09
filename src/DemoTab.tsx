import type { ReactNode } from 'react';
import { AuthPanel } from './AuthPanel';
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
    mtbBackend,
    mtbBaseUrl,
}: {
    snapshot: StoreSnapshot;
    mountCount: number;
    mtbBackend: boolean;
    mtbBaseUrl: string;
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
                None of this panel is part of cBioPortal. It is our own code,
                served from somewhere else, reading this patient's real data
                out of the page it was loaded into.
            </p>
            <p className="mtb-note">
                The counts start as <em>loading…</em> and fill in a moment
                later, on their own &mdash; so they are being read live, not
                copied once when the tab opened.
            </p>
            {mtbBackend && (
                <AuthPanel
                    patientId={snapshot.patientId}
                    baseUrl={mtbBaseUrl}
                />
            )}

            <p className="mtb-note">
                Tab mounted <Value>{mountCount}</Value>{' '}
                {mountCount === 1 ? 'time' : 'times'} this page load. Switch away
                and back and the counter rises, but the panel never appears
                twice &mdash; it cleans up after itself.
            </p>
        </div>
    );
}
