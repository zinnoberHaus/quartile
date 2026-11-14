import { Link } from '../router';
import { EXAMPLES_PATH } from '../routes';
import { Wordmark } from './Logo';

const SIZE = 18;

/** The brand in every page header: the wordmark and "examples", linking to the examples index. */
export function ExamplesBrand() {
  return (
    <Link
      to={EXAMPLES_PATH}
      className="g-brand"
      aria-label="Quartile examples"
      style={{ fontSize: SIZE }}
    >
      <Wordmark size={SIZE} />
      <span className="g-brand-section">examples</span>
    </Link>
  );
}
