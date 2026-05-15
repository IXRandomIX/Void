// Open side panel when toolbar icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Forward active tab URL to both the sidepanel and injected content script
function notifyUrl(tabId, url) {
  if (!url || url.startsWith("chrome://") || url.startsWith("chrome-extension://")) return;
  const msg = { type: "TAB_URL", url, tabId };
  chrome.runtime.sendMessage(msg).catch(() => {});
  chrome.tabs.sendMessage(tabId, msg).catch(() => {});
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (tab && tab.url) notifyUrl(tabId, tab.url);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) notifyUrl(tabId, tab.url);
});
