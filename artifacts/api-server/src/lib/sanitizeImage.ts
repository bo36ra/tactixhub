// Shared by player photos, team logos, and opponent logos — all three
// are base64 data-URI images stored directly in a text column, so the
// same validation applies to all: must actually look like an image
// data URI, and capped well under what a phone camera photo would
// produce (this is meant for a small logo/headshot, not a full-res
// picture).
const MAX_IMAGE_LENGTH = 500_000;

export function sanitizeImage(image: unknown): string | null | undefined {
  if (image === undefined) return undefined; // not provided — leave as is
  if (image === null || image === "") return null; // explicit removal
  if (typeof image !== "string" || !image.startsWith("data:image/") || image.length > MAX_IMAGE_LENGTH) {
    return undefined;
  }
  return image;
}
