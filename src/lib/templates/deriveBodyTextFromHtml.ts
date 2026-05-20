/** BR-BodyTextDerivation — strip tags and collapse whitespace from email HTML body. */
export function deriveBodyTextFromHtml(bodyHtml: string): string {
  return bodyHtml
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
