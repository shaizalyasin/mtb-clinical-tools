import { mountDemoTab } from './mount';
import { MountCallback } from './portal';

/**
 * The global named by `mountCallbackName` in the frontend.json custom_tabs
 * entry. cBioPortal resolves it off `window` after loading this file, so the
 * name here and the name in the deployment config must match exactly.
 */
const renderMtbDemoTab: MountCallback = (
    div,
    tab,
    _url,
    store,
    autorun,
    isUnmount
) => {
    mountDemoTab(div, tab, store, autorun, isUnmount);
};

(window as unknown as Record<string, unknown>).renderMtbDemoTab =
    renderMtbDemoTab;
