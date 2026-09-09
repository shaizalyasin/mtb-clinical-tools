import { useCallback, useEffect, useState } from 'react';

/**
 * Exercises the authenticated path to the MTB backend, the way the real MTB
 * and Follow-up tabs will have to.
 *
 * Two things are being demonstrated:
 *
 *  1. The bundle sends no tokens. Every request below is a plain fetch with no
 *     Authorization header and no credentials option. Because the page and the
 *     backend share an origin, the browser attaches both cBioPortal's
 *     JSESSIONID and the proxy's OIDC session cookie by itself.
 *
 *  2. It still has to handle login. An unauthenticated write comes back 401
 *     with a loginUrl rather than data, and the tab has to open that flow and
 *     retry. "No token handling" is true; "nothing to do about auth" is not.
 */

interface Identity {
    login: string | null;
    name: string | null;
    roles: string | null;
    sawCbioportalSession: boolean;
    sawProxySession: boolean;
}

interface ReadResult {
    recommendations: Array<{ id: string; title: string; author: string }>;
    identity: Identity;
}

type Phase =
    | { kind: 'idle' }
    | { kind: 'saving' }
    | { kind: 'login-required' }
    | { kind: 'awaiting-login' }
    | { kind: 'saved'; identity: Identity }
    | { kind: 'error'; message: string };

/** Empty base = same origin, which is the whole point. */
function mtbUrl(base: string, patientId: string): string {
    return `${base}/mtb/${encodeURIComponent(patientId || 'unknown')}`;
}

function openLogin(base: string, loginUrl: string): Promise<void> {
    return new Promise(resolve => {
        const popup = window.open(
            `${base}${loginUrl}`,
            'mtb-login',
            'width=520,height=680'
        );

        // The login page posts back to its opener, but a user who closes the
        // window manually must not leave us waiting forever.
        const done = () => {
            window.removeEventListener('message', onMessage);
            clearInterval(poll);
            resolve();
        };
        const onMessage = (e: MessageEvent) => {
            if (e.data && (e.data as any).mtbLogin) done();
        };
        window.addEventListener('message', onMessage);
        const poll = setInterval(() => {
            if (!popup || popup.closed) done();
        }, 500);
    });
}

export function AuthPanel({
    patientId,
    baseUrl,
}: {
    patientId: string;
    baseUrl: string;
}) {
    const [read, setRead] = useState<ReadResult | null>(null);
    const [readError, setReadError] = useState<string | null>(null);
    const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

    const refresh = useCallback(async () => {
        try {
            // No credentials option, no Authorization header -- deliberately.
            const res = await fetch(mtbUrl(baseUrl, patientId));
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setRead(await res.json());
            setReadError(null);
        } catch (e) {
            setReadError(String(e));
        }
    }, [baseUrl, patientId]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const save = useCallback(async () => {
        setPhase({ kind: 'saving' });

        const attempt = () =>
            fetch(mtbUrl(baseUrl, patientId), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: `Recommendation drafted ${new Date().toLocaleTimeString()}`,
                }),
            });

        try {
            let res = await attempt();

            if (res.status === 401) {
                const { loginUrl } = await res.json();
                setPhase({ kind: 'login-required' });
                await openLogin(baseUrl, loginUrl || '/mtb/login');
                setPhase({ kind: 'awaiting-login' });
                res = await attempt();
            }

            // A second 401 means the login window was dismissed without
            // signing in. Saying "HTTP 401" here is useless to whoever is
            // looking at the demo -- say what to do instead.
            if (res.status === 401) {
                setPhase({
                    kind: 'error',
                    message:
                        'Still signed out, so the write was refused. Sign in as ' +
                        'mtbuser / mtbuser in the window that opens, then press Save again.',
                });
                return;
            }

            if (!res.ok) {
                setPhase({
                    kind: 'error',
                    message: `Write refused with HTTP ${res.status}.`,
                });
                return;
            }

            const body = await res.json();
            setPhase({ kind: 'saved', identity: body.identity });
            await refresh();
        } catch (e) {
            setPhase({ kind: 'error', message: String(e) });
        }
    }, [baseUrl, patientId, refresh]);

    const identity =
        phase.kind === 'saved' ? phase.identity : read?.identity ?? null;

    return (
        <div className="mtb-auth">
            <h4 className="mtb-subheading">
                MTB backend &mdash; via OpenResty / Keycloak
            </h4>

            <div className="mtb-grid">
                <div className="mtb-row">
                    <span className="mtb-label">Read (GET, unauthenticated)</span>
                    {readError ? (
                        <span className="mtb-error">{readError}</span>
                    ) : read ? (
                        <span className="mtb-value">
                            {read.recommendations.length} stored
                        </span>
                    ) : (
                        <span className="mtb-pending">loading&hellip;</span>
                    )}
                </div>
                <div className="mtb-row">
                    <span className="mtb-label">Signed in as</span>
                    <span className="mtb-value">
                        {identity?.login && identity.login !== 'unknown'
                            ? `${identity.name} (${identity.login})`
                            : '— not signed in'}
                    </span>
                </div>
                <div className="mtb-row">
                    <span className="mtb-label">Roles from Keycloak</span>
                    <span className="mtb-value">{identity?.roles ?? '—'}</span>
                </div>
                <div className="mtb-row">
                    <span className="mtb-label">Cookies the backend saw</span>
                    <span className="mtb-value">
                        {identity
                            ? [
                                  identity.sawCbioportalSession
                                      ? 'cBioPortal JSESSIONID'
                                      : null,
                                  identity.sawProxySession
                                      ? 'proxy OIDC session'
                                      : null,
                              ]
                                  .filter(Boolean)
                                  .join(' + ') || 'none'
                            : '—'}
                    </span>
                </div>
            </div>

            <div className="mtb-actions">
                <button
                    className="mtb-button"
                    onClick={save}
                    disabled={phase.kind === 'saving'}
                >
                    Save a recommendation (POST)
                </button>
                <span className="mtb-status">
                    {phase.kind === 'idle' && (
                        <>
                            The write needs a Keycloak session; the read above
                            does not. Demo login:{' '}
                            <strong>mtbuser / mtbuser</strong>.
                        </>
                    )}
                    {phase.kind === 'saving' && 'Posting…'}
                    {phase.kind === 'login-required' &&
                        '401 login_required — opening the Keycloak login flow…'}
                    {phase.kind === 'awaiting-login' && 'Retrying the write…'}
                    {phase.kind === 'saved' &&
                        `Saved. The bundle sent no token — the proxy identified the user and injected the headers.`}
                    {phase.kind === 'error' && (
                        <span className="mtb-error">{phase.message}</span>
                    )}
                </span>
            </div>
        </div>
    );
}
