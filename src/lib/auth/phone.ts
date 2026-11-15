// Panama mobile numbers only for v1: +507 followed by 8 digits starting with 6.
export function normalizePanamaPhone(input: string): string | null {
  const cleaned = input.trim().replace(/[\s\-().]/g, '');
  if (!/^\+?\d+$/.test(cleaned)) return null;
  const hasPlus = cleaned.startsWith('+');
  const digits = hasPlus ? cleaned.slice(1) : cleaned;
  let local: string;
  if (digits.startsWith('507') && (hasPlus || digits.length === 11)) local = digits.slice(3);
  else if (!hasPlus) local = digits;
  else return null;
  return /^6\d{7}$/.test(local) ? `+507${local}` : null;
}
