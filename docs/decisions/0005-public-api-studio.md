# 0005: Public API workflows and a portable visual studio

Date: 2026-10-10 · Status: accepted

## Decision

Keep the component package focused on rendering, metadata and linked selection. Add an open-source application studio in the public gallery, with reusable browser-side API adapters in its source. This is a working application example, not a hosted data platform or a new package entry.

The studio offers public-data templates, a custom public JSON source, visual configuration of a bounded component set, an inspectable preview, native React source export and versioned project JSON. Project files contain source configuration and presentation settings; they do not contain fetched records, access tokens or executable code. Import validates structure and size before application; field mappings are checked against the loaded dataset. Changing a source resets incompatible views explicitly.

External data is fetched on request using bounded, cancellable requests. The interface identifies the source URL, actual fetch time, coverage, units and attribution. Failures and empty results remain visible; there is no silent replacement with fixtures. Test fixtures are confined to deterministic tests. Applications using private authenticated data need an application-owned backend; this public browser studio provides no credential vault or arbitrary server proxy.

Visual editing and React code are two routes to the same components. Exported native component source and the matching data helper remain readable, reusable and Apache-2.0, with source-data attribution preserved. The starter bundles the built preview tarball for local installation; no registry publication or stable release is implied.

Navigation keeps the current route visible during lazy loading, provides a meaningful initial/loading shell, and uses brief route-level motion with a reduced-motion alternative. Cross-origin website navigation retains browser semantics.

## Boundaries

No database persistence, deployment service, model inference, notebook kernel, arbitrary code execution, team workspace or data authorization is introduced. Local saving is explicit and stores configuration only. Source APIs retain their own usage terms, availability and CORS restrictions.
