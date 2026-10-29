/** Minutes needed to read a post's Markdown body, at 220 words a minute. */
export const getReadingTime = (body = "") =>
  Math.max(1, Math.round(body.split(/\s+/).filter(Boolean).length / 220));
