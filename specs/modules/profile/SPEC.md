# Profile — Module Spec

## Overview

The user profile lets each WorkSuite user edit information about themselves (display name, language, avatar). It is reachable at `/profile` from the user menu in the topbar.

---

## Avatar / photo (revisión 2026-04-25)

### What it does
A user can choose how their avatar appears across WorkSuite. Three options:
1. **Upload a photo** (drag-and-drop or click to upload).
2. **Pick a preset avatar** from a small gallery.
3. **Remove the avatar** and fall back to initials (the original behaviour).

The avatar is shown wherever a user's avatar appears in the app: Vector Logic Kanban TaskCard, TaskDetailModal, navbar UserMenu, AdminUsers list, assignee chips, etc.

### Who uses it
Every WorkSuite user can edit their own avatar from the Profile page. **Admins can edit other users' avatars** from the AdminUsers screen (same picker reused).

### Main flow

**Self-edit (Profile page):**
1. User clicks the avatar block at the top of `/profile`.
2. A modal opens with three sections:
   - **Upload**: drag-and-drop area or "Choose file" button. Accepts JPG, PNG, WEBP up to **2MB**.
   - **Crop step (after upload)**: when a file is selected, the modal shows a square crop area with zoom slider (using a small client-side cropper). User confirms and the cropped image is uploaded.
   - **Preset gallery**: 8 preset avatars (gradient circles in: purple, blue, green, amber, red, teal, pink, gray). Clicking one selects it.
   - **Remove**: a button "Use initials" that clears the avatar.
3. While the upload is in progress, a spinner shows over the avatar block.
4. On success, the new avatar persists and refreshes everywhere immediately.

**Admin-edit (AdminUsers):**
1. Admin opens the row for a user.
2. Same picker modal opens, scoped to that user.
3. Admin can upload, pick preset, or remove for any user.
4. Audit: the change is saved with `updated_at` only — no extra audit log in v1.

### Rules and limits
- Max upload size: 2 MB. Larger → inline error.
- Allowed formats: JPG, PNG, WEBP. Other → inline error.
- Only one avatar active per user. New upload replaces the previous file in storage.
- Self users can only change their own avatar. Admins can change any user's.
- Initials are still computed from the user's name and shown when no avatar is set.

### Connections
- **Supabase Storage** bucket `user-avatars` (public read for logged-in users).
- **Supabase Storage Image Transformation**: avatars are rendered with `?width=64&quality=80` for the small chips/avatars and `?width=256&quality=85` for the profile page. No Edge Function required.
- All avatar render sites switch to a shared `<UserAvatar />` component that reads `user.avatarUrl` and falls back to initials.

### Out of scope
*(none — items previously listed have been moved into scope.)*

### Data model
**users table** gains a column:
- `avatar_url text NULL` — when set, holds either a Supabase Storage public URL (uploaded photo) or a string of the form `preset:NAME` (one of: `purple`, `blue`, `green`, `amber`, `red`, `teal`, `pink`, `gray`).

**Storage bucket** `user-avatars`:
- Public read for any authenticated user.
- Write/delete restricted to:
  - The owner (user whose `id` matches the file name prefix).
  - Any user with `role = 'admin'`.
- Naming: `{user_id}/avatar.{ext}` (folder-per-user pattern so RLS uses `storage.foldername(name)[1]`). The previous file is overwritten on new upload.
- Image transformation enabled at request time via the URL params `?width=64&quality=80` (avatar chips) and `?width=256&quality=85` (profile page). Falls back to original size if the project tier doesn't support transforms.

**DBA verdict (2026-04-25):** Migration `supabase/migrations/20260425_user_avatar_url_and_storage.sql` applied to prod. Column added, bucket provisioned, 7 RLS policies in place (1 public read + 3 owner write/update/delete + 3 admin write/update/delete).
