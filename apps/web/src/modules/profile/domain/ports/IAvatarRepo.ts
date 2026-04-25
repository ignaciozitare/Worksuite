export interface IAvatarRepo {
  /** Upload a cropped square avatar blob for the given user.
   *  Returns the public URL to persist on `users.avatar_url`. */
  uploadPhoto(userId: string, blob: Blob, ext: 'jpg' | 'png' | 'webp'): Promise<string>;

  /** Persist the value on the user's `avatar_url` column.
   *  `null` clears the avatar (UI falls back to initials).
   *  A `preset:NAME` string sets a preset.
   *  A full URL sets an uploaded photo. */
  setAvatarUrl(userId: string, value: string | null): Promise<void>;
}
