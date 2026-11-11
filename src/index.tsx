import { mountDemoTab } from './mount';
import { mountPrognosisTab } from './mountPrognosis';
import { MountCallback } from './portal';

/**
 * The globals named by `mountCallbackName` in the frontend.json custom_tabs
 * entries. cBioPortal resolves each off `window` after loading this file, so
 * the names here and the names in the deployment config must match exactly.
 *
 * Both tabs ship in one bundle because custom_tabs loads one script per entry
 * and two entries pointing at the same URL is a single download the browser
 * caches, whereas two bundles would each carry their own copy of React.
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

const renderMtbPrognosisTab: MountCallback = (
    div,
    tab,
    _url,
    store,
    autorun,
    isUnmount
) => {
    mountPrognosisTab(div, tab, store, autorun, isUnmount);
};

const globals = window as unknown as Record<string, unknown>;
globals.renderMtbDemoTab = renderMtbDemoTab;
globals.renderMtbPrognosisTab = renderMtbPrognosisTab;
