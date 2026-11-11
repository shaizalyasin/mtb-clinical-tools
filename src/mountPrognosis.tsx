import { createRoot, Root } from 'react-dom/client';
import {
    Autorun,
    CustomTabConfig,
    PatientViewPageStore,
    resolveStore,
} from './portal';
import { PrognosisTab } from './PrognosisTab';
import { readPrognosisTarget } from './snapshot';
import './styles.css';

interface Instance {
    root: Root;
    disposeAutorun: () => void;
}

const instances = new WeakMap<HTMLElement, Instance>();

function teardown(div: HTMLElement): void {
    const instance = instances.get(div);
    if (!instance) return;
    instances.delete(div);
    instance.disposeAutorun();
    setTimeout(() => instance.root.unmount());
}

function renderError(div: HTMLElement, message: string): void {
    const root = createRoot(div);
    instances.set(div, { root, disposeAutorun: () => undefined });
    root.render(<div className="mtb-demo mtb-error">{message}</div>);
}

export function mountPrognosisTab(
    div: HTMLElement,
    tab: CustomTabConfig,
    store: PatientViewPageStore | null,
    autorun: Autorun,
    isUnmount: boolean
): void {
    if (isUnmount) {
        teardown(div);
        return;
    }

    // Same idempotency guard as the demo tab: the portal can call us twice for
    // one div, and a second React root on the same node is a hard bug to find.
    teardown(div);

    const pageStore = resolveStore(store);
    if (!pageStore) {
        renderError(
            div,
            'Prognosis: could not resolve PatientViewPageStore. The mount ' +
                'contract has drifted -- see CONTRACT.md.'
        );
        return;
    }

    const params = tab.customParameters ?? {};
    // Empty means same origin, which is what the auth overlay provides. The
    // base stack runs the service on its own port, so init.sh renders an
    // absolute URL here instead.
    const riskBaseUrl =
        typeof params.riskBaseUrl === 'string' ? params.riskBaseUrl : '/risk';
    const apiBase = typeof params.apiBase === 'string' ? params.apiBase : '/api';

    const root = createRoot(div);

    // readPrognosisTarget touches only identifiers the demo tab already reads,
    // so this adds nothing to the per-upgrade check surface in CONTRACT.md.
    // The network work lives in the component's effect, keyed on those
    // identifiers, so a mobx re-render does not re-issue requests.
    const disposeAutorun = autorun(() => {
        const target = readPrognosisTarget(pageStore);
        root.render(
            <PrognosisTab
                studyId={target.studyId}
                patientId={target.patientId}
                sampleId={target.sampleId}
                riskBaseUrl={riskBaseUrl}
                apiBase={apiBase}
            />
        );
    });

    instances.set(div, { root, disposeAutorun });
}
