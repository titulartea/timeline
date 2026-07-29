/**
 * Format numeric year to BC/AD text without '년' suffix
 * Example: -500 -> "BC 500", 2026 -> "AD 2026"
 */
export function formatYearWithBcAd(year: number): string {
  if (isNaN(year)) return '0';
  if (year < 0) {
    return `BC ${Math.abs(year)}`;
  } else if (year === 0) {
    return `BC 1`;
  } else {
    return `AD ${year}`;
  }
}

/**
 * Formats a range of years (e.g., BC 500 ~ BC 300 or BC 500 ~ AD 200)
 */
export function formatYearRange(startYear: number, endYear?: number | null): string {
  const startStr = formatYearWithBcAd(startYear);
  if (!endYear || endYear === startYear) {
    return startStr;
  }
  const endStr = formatYearWithBcAd(endYear);
  return `${startStr} ~ ${endStr}`;
}
