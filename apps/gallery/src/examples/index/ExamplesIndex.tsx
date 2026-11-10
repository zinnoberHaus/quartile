import { QuartileProvider } from '@quartile/react';
import { Link } from '../../router';
import { type GalleryRoute, GROUPS, pagesInGroup, type StaticPage } from '../../routes';
import { ExamplesBrand } from '../../shell/Brand';
import { links } from '../../shell/links';
import './index.css';

function Card({ page }: { page: GalleryRoute | StaticPage }) {
  const content = (
    <>
      <span className="xi-card-name">{page.name}</span>
      <span className="xi-card-description">{page.description}</span>
      <span className="xi-card-path">{page.path}</span>
    </>
  );
  // A static file is a document of its own: the browser loads it, the router cannot render it.
  return 'page' in page ? (
    <Link className="xi-card" to={page.path}>
      {content}
    </Link>
  ) : (
    <a className="xi-card" href={page.path}>
      {content}
    </a>
  );
}

/** The app's home, /examples: every page of the route table as a card, grouped by section. */
export function ExamplesIndex() {
  return (
    <QuartileProvider className="g-page">
      <header className="g-header xi-header">
        <ExamplesBrand />
        <nav className="g-header-nav" aria-label="Quartile">
          <a href={links.docs}>Docs</a>
          <Link to="/examples/playground">Playground</Link>
          <a href={links.github}>GitHub</a>
          <a href={links.landing}>usequartile.com</a>
        </nav>
      </header>
      <main className="xi-main">
        <div className="xi-intro">
          <h1>Examples</h1>
          <p>
            Quartile is an open-source chart block for Markdown, AI answers and web pages. These
            pages show the block at work and the React components it renders through. Each one
            renders from the public repository and runs in your browser. They start from fictional
            sample data; App Studio requests public APIs.
          </p>
          <nav className="xi-jump" aria-label="Sections">
            {GROUPS.map((group) => (
              <Link key={group.id} to={`#${group.id}`}>
                {group.title}
                <span aria-hidden="true">{pagesInGroup(group.id).length}</span>
              </Link>
            ))}
          </nav>
        </div>
        {GROUPS.map((group) => (
          <section
            key={group.id}
            id={group.id}
            className="xi-group"
            aria-labelledby={`xi-${group.id}`}
          >
            <div className="xi-group-head">
              <h2 id={`xi-${group.id}`}>{group.title}</h2>
              <p>{group.description}</p>
            </div>
            <ul className="xi-cards">
              {pagesInGroup(group.id).map((page) => (
                <li key={page.path}>
                  <Card page={page} />
                </li>
              ))}
            </ul>
          </section>
        ))}
        <footer className="g-footer">
          <span>
            Quartile · Apache-2.0 · 0.1 preview, not on npm yet ·{' '}
            <a href={`${links.docs}/docs/installation`}>Install the preview build</a>
          </span>
          <a href={links.github}>Source on GitHub</a>
        </footer>
      </main>
    </QuartileProvider>
  );
}
