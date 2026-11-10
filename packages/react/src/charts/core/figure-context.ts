import { createContext } from 'react';

/**
 * Id of an element that describes the enclosing figure, such as the source line a card shows
 * under its chart. ChartFrame points `aria-describedby` at it, so the text belongs to the
 * figure's accessible description without being repeated inside it.
 */
export const FigureDescriptionContext = createContext<string | undefined>(undefined);
