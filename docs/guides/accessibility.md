# Accessible analytic surfaces

Quartile implements keyboard interaction, generated chart summaries, and table fallbacks. These are features to test in your application, not a certification of WCAG conformance. The project has not yet completed a manual NVDA, JAWS, or VoiceOver compatibility audit.

## Make the meaning available

Give charts a useful title or `aria-label`, label fields through `dataset`, state units and comparison periods, and add a short written takeaway when the analytic context matters. Color should not be the only way to distinguish series or success/failure. Keep legends and direct labels legible after overriding tokens.

Charts expose their data to assistive technology through summaries and tables. Passing `view="table"` makes the formatted table visible. Provide a clear chart/table toggle when your audience needs exact values or alternative navigation. The [SaaS](https://quartile-design.vercel.app/examples/saas) and [operations](https://quartile-design.vercel.app/examples/operations) examples include that toggle.

Scatter plots with more than 200 points expose a visible data-table control and 50 exact rows per page. This avoids inserting thousands of hidden table rows; every plotted value remains reachable through the pager. Canvas and WebGL use the same keyboard interaction, summaries, and table alternative as SVG. For queried plots, state the number of displayed points and total matching source records so a bounded subset is not mistaken for the entire source.

## Test the actual workflow

1. Use only the keyboard to reach controls, chart marks, menus, and table rows. Check visible focus and that dialogs restore focus when closed.
2. Within charts, check arrow navigation and Home/End where supported. Test selection with Enter/Space for selectable marks and the chart-specific brush interaction.
3. Apply a filter, inspect the changed KPI/table, remove one chip, and clear all filters. Ensure the state can be understood without watching animation.
4. Try empty, loading, error, null-valued, single-point, and negative-valued data. Empty results should not sound like a meaningful zero measurement.
5. Test at 200%/400% zoom, a narrow viewport, reduced motion, light/dark themes, and your brand overrides.
6. Test your supported browser/screen-reader pairs. Record exact versions, expected behavior, and observed failures in issues.

`DataTable` virtualizes beyond 200 rows by default when pagination is not enabled. Assistive technologies may handle virtualized content differently. For a predictable bounded table, use `pageSize`, or `virtualize={false}` only when the dataset is suitably small. Always verify column headers and sort announcements with your supported assistive technology.

Automated checks can catch missing labels and invalid roles, but they cannot establish whether an analytic interaction is understandable. Keep a manual test record and link any known limitations in your own product documentation.
