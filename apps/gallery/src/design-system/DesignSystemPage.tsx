import { QuartileProvider } from '@quartile/react';
import { useEffect, useState } from 'react';
import { Link } from '../router';
import { Wordmark } from '../shell/Logo';
import { links } from '../shell/links';
import { BrandSection } from './sections/Brand';
import { ButtonsSection } from './sections/Buttons';
import { ChartStatesSection } from './sections/ChartStates';
import { ChartsSection } from './sections/Charts';
import { ColorSection } from './sections/Color';
import { DarkThemeSection } from './sections/DarkTheme';
import { DashboardPatternSection } from './sections/DashboardPattern';
import { DataDisplaySection } from './sections/DataDisplay';
import { FeedbackSection } from './sections/Feedback';
import { InputsSection } from './sections/Inputs';
import { LandscapeSection } from './sections/Landscape';
import { LinkedSelectionSection } from './sections/LinkedSelection';
import { NavigationSection } from './sections/Navigation';
import { OverviewSection } from './sections/Overview';
import { SpaceSection } from './sections/Space';
import { TypographySection } from './sections/Typography';

const NAV: { group: string; items: [string, string][] }[] = [
  {
    group: 'Start',
    items: [
      ['overview', 'Overview'],
      ['landscape', 'Landscape'],
      ['brand', 'Logo & wordmark'],
    ],
  },
  {
    group: 'Foundations',
    items: [
      ['color', 'Color'],
      ['typography', 'Typography'],
      ['space', 'Space & shape'],
    ],
  },
  {
    group: 'Components',
    items: [
      ['buttons', 'Buttons'],
      ['inputs', 'Inputs & selection'],
      ['navigation', 'Navigation'],
      ['feedback', 'Feedback & overlays'],
      ['data-display', 'Data display'],
    ],
  },
  {
    group: 'Visualization',
    items: [
      ['charts', 'Chart gallery'],
      ['chart-states', 'Chart states'],
    ],
  },
  {
    group: 'Patterns',
    items: [
      ['dashboard-layout', 'Dashboard layout'],
      ['linked-selection', 'Linked selection'],
      ['dark-theme', 'Dark theme'],
    ],
  },
];

function useActiveSection() {
  const [active, setActive] = useState('overview');
  useEffect(() => {
    const ids = NAV.flatMap((g) => g.items.map(([id]) => id));
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-80px 0px -70% 0px' },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, []);
  return active;
}

export function DesignSystemPage() {
  const active = useActiveSection();
  return (
    <QuartileProvider className="g-page">
      <header className="g-header">
        <Link to="/" className="g-brand">
          <Wordmark size={18} />
        </Link>
        <span className="g-divider" />
        <span className="g-header-title">Design System</span>
        <span className="g-version">v0.1</span>
        <span style={{ flex: 1 }} />
        <nav className="g-header-nav">
          <a href={links.landing}>Landing</a>
          <a href={links.docs}>Docs</a>
          <Link to="/examples/storefront">Example app</Link>
          <Link to="/examples/saas">Use cases</Link>
          <a href={links.github}>GitHub</a>
        </nav>
      </header>
      <div className="g-layout">
        <aside className="g-sidebar" aria-label="Sections">
          {NAV.map((g) => (
            <div key={g.group} className="g-nav-group">
              <span className="g-nav-heading">{g.group}</span>
              {g.items.map(([id, label]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="g-nav-link"
                  aria-current={active === id ? 'true' : undefined}
                >
                  {label}
                </a>
              ))}
            </div>
          ))}
        </aside>
        <main className="g-main">
          <h1 className="q-visually-hidden">Quartile design system</h1>
          <OverviewSection />
          <LandscapeSection />
          <BrandSection />
          <ColorSection />
          <TypographySection />
          <SpaceSection />
          <ButtonsSection />
          <InputsSection />
          <NavigationSection />
          <FeedbackSection />
          <DataDisplaySection />
          <ChartsSection />
          <ChartStatesSection />
          <DashboardPatternSection />
          <LinkedSelectionSection />
          <DarkThemeSection />
          <footer className="g-footer">
            <span>
              Quartile · Apache-2.0 · Everything on this page renders from @quartile/react.
            </span>
            <a href={links.github}>Source on GitHub</a>
          </footer>
        </main>
      </div>
    </QuartileProvider>
  );
}
