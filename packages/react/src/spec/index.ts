// The spec layer: JSON Schema for every component a model may generate, a validator and a renderer.

export type { SpecViewProps } from './SpecView';
export { SpecView } from './SpecView';
export type {
  ComponentSpec,
  DashboardSpec,
  QuartileSpec,
  SpecComponentName,
  SpecFieldRef,
  SpecMeasure,
} from './schema';
export { quartileSchema, SPEC_COMPONENTS } from './schema';
export type { SpecError, SpecValidation } from './validate';
export { validateSpec } from './validate';
