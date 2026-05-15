// Open side panel when toolbar icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// When a tab becomes active or navigates, forward the URL to the side panel
function notifyUrl(tabId, url) {
  if (!url || url.startsWith("chrome://") || url.startsWith("chrome-extension://")) return;
  chrome.runtime.sendMessage({ type: "TAB_URL", url, tabId }).catch(() => {});
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (tab && tab.url) notifyUrl(tabId, tab.url);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) notifyUrl(tabId, tab.url);
});
