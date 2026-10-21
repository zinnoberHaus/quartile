import { Analytics, type BeforeSendEvent } from '@vercel/analytics/react';

// Page URLs can contain user-supplied data-source URLs and other private state.
function redactUrl(event: BeforeSendEvent): BeforeSendEvent {
  const url = new URL(event.url);
  url.search = '';
  url.hash = '';
  return { ...event, url: url.toString() };
}

export function SiteAnalytics() {
  return <Analytics beforeSend={redactUrl} />;
}
