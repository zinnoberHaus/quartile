import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { lazy, Suspense, useDeferredValue } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  Link,
  navigate,
  RouteLocationProvider,
  useBrowserLocation,
  useLocation,
} from '../../../apps/gallery/src/router';

afterEach(cleanup);

describe('gallery navigation', () => {
  it('retains native external, modifier, target, download and cancelled click behavior', () => {
    render(
      <div>
        <Link to="/next?source=weather#chart">Internal</Link>
        <Link to="https://example.org/report">External</Link>
        <Link to="/next" target="_blank">
          New tab
        </Link>
        <Link to="/data.csv" download>
          Download
        </Link>
        <Link to="/next" onClick={(event) => event.preventDefault()}>
          Cancelled
        </Link>
      </div>,
    );
    function prevented(label: string, init: MouseEventInit = {}) {
      let value = false;
      document.addEventListener(
        'click',
        (event) => {
          value = event.defaultPrevented;
          event.preventDefault(); // Stop JSDOM trying to follow a deliberately native link.
        },
        { once: true },
      );
      fireEvent(
        screen.getByRole('link', { name: label }),
        new MouseEvent('click', { bubbles: true, cancelable: true, ...init }),
      );
      return value;
    }
    for (const modifier of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey']) {
      expect(prevented('Internal', { [modifier]: true })).toBe(false);
    }
    expect(prevented('External')).toBe(false);
    expect(prevented('New tab')).toBe(false);
    expect(prevented('Download')).toBe(false);
    expect(prevented('Cancelled')).toBe(true);
    expect(prevented('Internal')).toBe(true);
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(
      '/next?source=weather#chart',
    );
  });

  it('keeps the interactive old route through a cold import and discards a superseded route', async () => {
    navigate('/navigation-start');
    let finish!: (value: { default: () => React.JSX.Element }) => void;
    const Slow = lazy(
      () =>
        new Promise<{ default: () => React.JSX.Element }>((resolve) => {
          finish = resolve;
        }),
    );
    function Page() {
      const location = useLocation();
      return (
        <>
          <h1>
            {location.pathname}
            {location.search}
          </h1>
          <Link to="/slow">Slow route</Link>
          <Link to="/fast?source=earthquakes">Fast route</Link>
        </>
      );
    }
    function TestRouter() {
      const requested = useBrowserLocation();
      const shown = useDeferredValue(requested);
      return (
        <>
          <span role="status">{requested === shown ? 'Ready' : 'Loading next route'}</span>
          <Suspense fallback={<p>Initial loading</p>}>
            <RouteLocationProvider location={shown}>
              {shown.pathname === '/slow' ? <Slow /> : <Page />}
            </RouteLocationProvider>
          </Suspense>
        </>
      );
    }
    render(<TestRouter />);
    fireEvent.click(screen.getByRole('link', { name: 'Slow route' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Loading next route'));
    expect(screen.getByRole('heading').textContent).toBe('/navigation-start');
    expect(screen.queryByText('Initial loading')).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Fast route' }));
    await waitFor(() =>
      expect(screen.getByRole('heading').textContent).toBe('/fast?source=earthquakes'),
    );
    await act(async () => finish({ default: Page }));
    expect(screen.getByRole('heading').textContent).toBe('/fast?source=earthquakes');
    act(() => window.history.back());
    await waitFor(() => expect(screen.getByRole('heading').textContent).toBe('/slow'));
    act(() => window.history.forward());
    await waitFor(() =>
      expect(screen.getByRole('heading').textContent).toBe('/fast?source=earthquakes'),
    );
  });
});
