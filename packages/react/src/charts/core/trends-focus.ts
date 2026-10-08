/**
 * True when focus arrived by keyboard. Charts only start their keyboard cursor then, so clicking a
 * chart does not leave a tooltip pinned to the first point once the pointer moves away.
 */
export function isKeyboardFocus(el: Element): boolean {
  try {
    return el.matches(':focus-visible');
  } catch {
    return true;
  }
}
