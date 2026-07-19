async function init() {
    let a = {
        id: 'vk-dl',
        js: ['context.js'],
        matches: ['https://vk.com/*', 'https://vk.ru/*'],
        runAt: 'document_start',
        world: 'MAIN'
    }, e = () => {};
    await chrome.scripting.unregisterContentScripts({ ids: [a.id] }).catch(e);
    await chrome.scripting.registerContentScripts([a]).catch(e);
    chrome.tabs.query({ url: a.matches }, e =>
        e.forEach(t =>
            chrome.scripting.executeScript({ target: { tabId: t.id }, files: a.js, world: a.world }).catch(e))
    );
}
chrome.runtime.onInstalled.addListener(init);
init();
