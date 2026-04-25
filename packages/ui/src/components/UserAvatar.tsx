import type { CSSProperties } from 'react';

export type AvatarPreset =
  | 'purple' | 'blue' | 'green' | 'amber' | 'red' | 'teal' | 'pink' | 'gray';

export const AVATAR_PRESETS: AvatarPreset[] = [
  'purple', 'blue', 'green', 'amber', 'red', 'teal', 'pink', 'gray',
];

// Brand palette for avatar presets — fixed colors by design (the user chooses
// one of these as identity), so they intentionally look the same in light and
// dark mode. Not theme tokens.
const PRESET_GRADIENTS: Record<AvatarPreset, string> = {
  purple: 'linear-gradient(135deg, var(--purple), var(--ac2))',
  blue:   'linear-gradient(135deg, var(--ac2), var(--ac))',
  green:  'linear-gradient(135deg, var(--green), var(--green-dim))',
  amber:  'linear-gradient(135deg, var(--amber), var(--amber-dim))',
  red:    'linear-gradient(135deg, var(--red), var(--red-dim))',
  teal:   'linear-gradient(135deg, #5fdbd1, #14b8a6)',
  pink:   'linear-gradient(135deg, #ffa1d6, #ec4899)',
  gray:   'linear-gradient(135deg, #c2c6d6, #6b7280)',
};

export interface UserAvatarUser {
  id?:        string;
  name?:      string | null;
  email?:     string | null;
  avatar?:    string | null;     // 2-char initials fallback
  avatarUrl?: string | null;     // photo URL or `preset:NAME`
}

export interface UserAvatarProps {
  user: UserAvatarUser | null | undefined;
  size?: number;                        // px, default 22
  /** Render the user-uploaded image at this requested width (Supabase Storage transform). Default = size * 3 for retina. */
  imageWidth?: number;
  title?: string | undefined;
  style?: CSSProperties;
  className?: string;
}

export function getAvatarInitials(user?: UserAvatarUser | null): string {
  if (!user) return '?';
  if (user.avatar && user.avatar.trim()) return user.avatar.toUpperCase().slice(0, 2);
  const source = user.name || user.email || '';
  return source.trim().split(/\s+/).map(s => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
}

export function isPresetAvatarUrl(value?: string | null): value is `preset:${AvatarPreset}` {
  return !!value && value.startsWith('preset:');
}

export function getPresetFromAvatarUrl(value?: string | null): AvatarPreset | null {
  if (!isPresetAvatarUrl(value)) return null;
  const name = value.slice('preset:'.length) as AvatarPreset;
  return (AVATAR_PRESETS as string[]).includes(name) ? name : null;
}

/** Append Supabase Storage image-transform params (no-op on tiers without transforms). */
function withTransform(url: string, width: number): string {
  if (!url.includes('/storage/v1/object/public/')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}width=${width}&quality=85`;
}

export function UserAvatar({
  user, size = 22, imageWidth, title, style, className,
}: UserAvatarProps) {
  const initials = getAvatarInitials(user);
  const url = user?.avatarUrl ?? null;
  const preset = getPresetFromAvatarUrl(url);
  const isImage = !!url && !preset;

  const baseStyle: CSSProperties = {
    width: size, height: size, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: Math.max(8, Math.round(size * 0.4)),
    fontWeight: 700, letterSpacing: '.02em',
    border: '1px solid var(--bd)',
    overflow: 'hidden',
    flexShrink: 0,
    ...style,
  };

  if (isImage && url) {
    const w = imageWidth ?? size * 3;
    return (
      <div className={className} style={baseStyle} title={title}>
        <img
          src={withTransform(url, w)}
          alt={initials}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          draggable={false}
        />
      </div>
    );
  }

  if (preset) {
    return (
      <div className={className}
        style={{
          ...baseStyle,
          background: PRESET_GRADIENTS[preset],
          color: 'white',
        }}
        title={title}>
        {initials}
      </div>
    );
  }

  return (
    <div className={className}
      style={{
        ...baseStyle,
        background: 'linear-gradient(135deg, var(--ac), var(--ac2))',
        color: 'var(--ac-on)',
      }}
      title={title}>
      {initials}
    </div>
  );
}

export const PRESET_GRADIENT_MAP = PRESET_GRADIENTS;
