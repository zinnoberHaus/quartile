import { Analytics, type BeforeSendEvent } from '@vercel/analytics/react';
import { useEffect, useState } from 'react';

// Page URLs can contain user-supplied data-source URLs and other private state.
function redactUrl(event: BeforeSendEvent): BeforeSendEvent {
  const url = new URL(event.url);
  url.search = '';
  url.hash = '';
  return { ...event, url: url.toString() };
}

/** Browser only: renders nothing on the server or while hydrating, then loads analytics. */
export function SiteAnalytics() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <Analytics beforeSend={redactUrl} /> : null;
}
