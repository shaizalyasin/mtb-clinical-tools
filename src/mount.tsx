import { createRoot, Root } from 'react-dom/client';
import { DemoTab } from './DemoTab';
import {
    Autorun,
    CustomTabConfig,
    PatientViewPageStore,
    resolveStore,
} from './portal';
import { readSnapshot } from './snapshot';
import './styles.css';

interface Instance {
    root: Root;
    disposeAutorun: () => void;
}

/**
 * One instance per host <div>. A WeakMap rather than a module-level variable:
 * the portal owns the div and can hand us a different one per mount, and this
 * way a discarded div takes its entry with it.
 */
const instances = new WeakMap<HTMLElement, Instance>();

/** Diagnostic only -- surfaced in the UI so tab-switching is observable. */
let mountCount = 0;

function teardown(div: HTMLElement): void {
    const instance = instances.get(div);
    if (!instance) return;
    instances.delete(div);
    instance.disposeAutorun();
    // React 18 forbids unmounting while it is rendering, which is exactly the
    // situation if the portal tears the tab down mid-render.
    setTimeout(() => instance.root.unmount());
}

function renderError(div: HTMLElement, message: string): void {
    const root = createRoot(div);
    instances.set(div, { root, disposeAutorun: () => undefined });
    root.render(<div className="mtb-demo mtb-error">{message}</div>);
}

export function mountDemoTab(
    div: HTMLElement,
    tab: CustomTabConfig,
    store: PatientViewPageStore | null,
    autorun: Autorun,
    isUnmount: boolean
): void {
    // The portal calls the same callback for mount and unmount.
    if (isUnmount) {
        teardown(div);
        return;
    }

    // Idempotency. Upstream's MSKTab fires onTabDidMount from componentDidMount
    // and there is no guarantee we won't be called twice for one div -- and
    // because showCustomTab defers us behind a cached dependency promise, two
    // rapid mounts can land back to back. Tearing down first makes a second
    // mount a no-op instead of a second React root on the same node.
    teardown(div);

    const pageStore = resolveStore(store);
    if (!pageStore) {
        renderError(
            div,
            'MTB demo: could not resolve PatientViewPageStore. The mount ' +
                'contract has drifted -- see CONTRACT.md.'
        );
        return;
    }

    mountCount += 1;
    const thisMount = mountCount;
    const root = createRoot(div);

    // Whether to exercise the authenticated backend, and where it lives. An
    // empty base URL means same origin, which is what the proxy setup gives us.
    const params = tab.customParameters ?? {};
    const mtbBackend = params.mtbBackend === true;
    const mtbBaseUrl =
        typeof params.mtbBaseUrl === 'string' ? params.mtbBaseUrl : '';

    // `autorun` is the portal's own mobx autorun, handed to us as the 5th
    // argument. Using it -- rather than shipping our own mobx -- is what binds
    // us to the *host's* observable graph. readSnapshot dereferences the store
    // fields, so mobx re-runs this whenever any of them changes, including when
    // a remoteData flips from pending to complete.
    const disposeAutorun = autorun(() => {
        const snapshot = readSnapshot(pageStore);
        root.render(
            <DemoTab
                snapshot={snapshot}
                mountCount={thisMount}
                mtbBackend={mtbBackend}
                mtbBaseUrl={mtbBaseUrl}
            />
        );
    });

    instances.set(div, { root, disposeAutorun });
}
