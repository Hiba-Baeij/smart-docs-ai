export const TITLE_MAX_CHARACTERS = 60;

/**
 * The title a conversation gets from its first question when the person gave none: the question
 * on one line, cut at 60 characters with an ellipsis. Characters are code points, so an emoji or
 * a letter outside the basic plane is never cut in half; whitespace is collapsed so a pasted
 * paragraph does not become a multi-line title.
 */
export function defaultTitle(question: string): string {
  const oneLine = question.replace(/\s+/g, ' ').trim();
  const characters = Array.from(oneLine);

  if (characters.length <= TITLE_MAX_CHARACTERS) {
    return oneLine;
  }
  return `${characters.slice(0, TITLE_MAX_CHARACTERS).join('').trimEnd()}…`;
}
