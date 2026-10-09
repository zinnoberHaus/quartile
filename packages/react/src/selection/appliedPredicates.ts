import { createContext } from 'react';
import type { Predicate } from '../data/predicates';

/** Internal query-stage context: predicates already applied before a spec aggregates rows. */
export const AppliedPredicatesContext = createContext<ReadonlySet<Predicate>>(new Set());
