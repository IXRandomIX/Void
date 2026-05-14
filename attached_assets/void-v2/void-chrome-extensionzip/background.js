chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-void") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.sidePanel.open({ tabId: tabs[0].id });
      }
    });
  }
});
