// ============================================
// STUDENT BUDDY — Content Script
// Runs on every page. Extracts clean page text
// for the AI Summarizer feature.
// ============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'extractText') {
    try {
      // Clone body and strip non-content elements
      const clone = document.body.cloneNode(true);
      const strip = clone.querySelectorAll(
        'script, style, noscript, nav, footer, header, aside, ' +
        '[class*="nav"], [class*="footer"], [class*="header"], ' +
        '[class*="sidebar"], [class*="menu"], [class*="ad"]'
      );
      strip.forEach(el => el.remove());

      const text = (clone.innerText || clone.textContent || '')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .substring(0, 15000);

      sendResponse({
        text,
        url: window.location.href,
        title: document.title
      });
    } catch (e) {
      sendResponse({
        text: document.body.innerText.substring(0, 15000),
        url: window.location.href,
        title: document.title
      });
    }
  }
  return true; // Keep channel open for async
});
