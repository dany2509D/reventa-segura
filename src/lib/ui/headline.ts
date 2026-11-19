/**
 * Splits an event name into the two lines of the home poster headline: the subtitle after " · " is
 * dropped, and the break goes where the longer line is as short as possible. toUpperCase (not the
 * locale-aware variant) gives the same text on the server and in every browser.
 */
export function splitHeadline(name: string): [string, string] {
  const main = name.normalize('NFC').split(' · ')[0].trim();
  const words = main.split(/\s+/).filter(Boolean).map((w) => w.toUpperCase());
  if (words.length <= 1) return [words[0] ?? '', ''];
  let best = 1;
  let bestLongest = Number.POSITIVE_INFINITY;
  for (let i = 1; i < words.length; i++) {
    const longest = Math.max(words.slice(0, i).join(' ').length, words.slice(i).join(' ').length);
    if (longest < bestLongest) {
      bestLongest = longest;
      best = i;
    }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}
