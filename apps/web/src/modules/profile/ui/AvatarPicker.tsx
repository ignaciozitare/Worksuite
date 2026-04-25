// @ts-nocheck
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { UserAvatar, AVATAR_PRESETS, PRESET_GRADIENT_MAP } from '@worksuite/ui';
import type { UserAvatarUser } from '@worksuite/ui';
import { avatarRepo } from '../container';

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const CROP_PX = 512;

interface Props {
  user: UserAvatarUser & { id: string };
  onClose: () => void;
  onSaved: (newAvatarUrl: string | null) => void;
}

type Mode = 'home' | 'crop';

export function AvatarPicker({ user, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('home');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Crop state
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const imageElRef = useRef<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const handleFile = (file: File) => {
    setError(null);
    if (!ALLOWED_MIME.includes(file.type)) {
      setError(t('profile.avatarErrorFormat'));
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(t('profile.avatarErrorSize'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageDataUrl(reader.result as string);
      setMode('crop');
      setZoom(1); setOffset({ x: 0, y: 0 });
    };
    reader.onerror = () => setError(t('profile.avatarErrorRead'));
    reader.readAsDataURL(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const cropAndUpload = async () => {
    const img = imageElRef.current;
    if (!img) return;
    setBusy(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = CROP_PX; canvas.height = CROP_PX;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas');

      // Draw the source image with current zoom + pan, centered.
      const baseSize = Math.min(img.naturalWidth, img.naturalHeight) * zoom;
      const sx = Math.max(0, (img.naturalWidth  - baseSize) / 2 - offset.x);
      const sy = Math.max(0, (img.naturalHeight - baseSize) / 2 - offset.y);
      const sw = Math.min(baseSize, img.naturalWidth  - sx);
      const sh = Math.min(baseSize, img.naturalHeight - sy);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, CROP_PX, CROP_PX);

      const blob: Blob = await new Promise((resolve, reject) =>
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('blob')), 'image/jpeg', 0.9)
      );

      const url = await avatarRepo.uploadPhoto(user.id, blob, 'jpg');
      await avatarRepo.setAvatarUrl(user.id, url);
      onSaved(url);
      onClose();
    } catch (err: any) {
      setError(err?.message || t('profile.avatarErrorUpload'));
    } finally {
      setBusy(false);
    }
  };

  const pickPreset = async (name: string) => {
    setBusy(true); setError(null);
    try {
      const value = `preset:${name}`;
      await avatarRepo.setAvatarUrl(user.id, value);
      onSaved(value);
      onClose();
    } catch (err: any) {
      setError(err?.message || t('profile.avatarErrorSave'));
    } finally { setBusy(false); }
  };

  const removeAvatar = async () => {
    setBusy(true); setError(null);
    try {
      await avatarRepo.setAvatarUrl(user.id, null);
      onSaved(null);
      onClose();
    } catch (err: any) {
      setError(err?.message || t('profile.avatarErrorSave'));
    } finally { setBusy(false); }
  };

  return (
    <div onClick={e => e.target === e.currentTarget && !busy && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 300, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(2px)', padding: 20,
      }}>
      <div style={{
        background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 16,
        width: '100%', maxWidth: 520, maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,.6)',
      }}>
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--bd)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx)', margin: 0 }}>
            {mode === 'crop' ? t('profile.avatarCropTitle') : t('profile.avatarPickerTitle')}
          </h3>
          <button onClick={() => !busy && onClose()} disabled={busy}
            style={{ background: 'none', border: 'none', cursor: busy ? 'not-allowed' : 'pointer', color: 'var(--tx3)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>

        <div style={{ padding: '18px 20px', overflowY: 'auto', flex: 1 }}>
          {error && (
            <div style={{
              marginBottom: 12, padding: '8px 12px', borderRadius: 6,
              background: 'var(--red-dim)', color: 'var(--red)', fontSize: 12,
            }}>{error}</div>
          )}

          {mode === 'home' && (
            <>
              {/* Upload area */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={onDrop}
                style={{
                  border: '2px dashed var(--bd)', borderRadius: 10,
                  padding: 22, textAlign: 'center', cursor: busy ? 'not-allowed' : 'pointer',
                  background: 'var(--sf2)', marginBottom: 18,
                  opacity: busy ? .5 : 1,
                }}>
                <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--tx3)' }}>
                  cloud_upload
                </span>
                <div style={{ fontSize: 13, color: 'var(--tx)', marginTop: 6, fontWeight: 600 }}>
                  {t('profile.avatarUploadDrop')}
                </div>
                <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>
                  {t('profile.avatarUploadHint')}
                </div>
                <input ref={fileInputRef} type="file" accept={ALLOWED_MIME.join(',')}
                  style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </div>

              {/* Presets */}
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
                {t('profile.avatarPresets')}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6, marginBottom: 18 }}>
                {AVATAR_PRESETS.map(p => (
                  <button key={p}
                    onClick={() => !busy && pickPreset(p)}
                    disabled={busy}
                    title={p}
                    style={{
                      aspectRatio: '1', borderRadius: '50%',
                      background: PRESET_GRADIENT_MAP[p],
                      border: '2px solid transparent',
                      cursor: busy ? 'not-allowed' : 'pointer',
                      transition: 'transform .15s, border-color .15s',
                      padding: 0,
                    }}
                    onMouseEnter={e => { if (!busy) { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.borderColor = 'var(--ac)'; } }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = 'transparent'; }}
                  />
                ))}
              </div>

              {/* Remove */}
              <button onClick={removeAvatar} disabled={busy}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  background: 'var(--sf2)', border: '1px solid var(--bd)',
                  color: 'var(--tx2)', cursor: busy ? 'not-allowed' : 'pointer',
                  fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                }}>
                {t('profile.avatarRemove')}
              </button>
            </>
          )}

          {mode === 'crop' && imageDataUrl && (
            <>
              <div
                onMouseDown={e => { dragStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y }; }}
                onMouseMove={e => {
                  if (!dragStart.current) return;
                  setOffset({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
                }}
                onMouseUp={() => { dragStart.current = null; }}
                onMouseLeave={() => { dragStart.current = null; }}
                style={{
                  width: '100%', aspectRatio: '1', position: 'relative',
                  borderRadius: '50%', overflow: 'hidden', background: 'var(--sf2)',
                  marginBottom: 14, cursor: dragStart.current ? 'grabbing' : 'grab',
                  userSelect: 'none',
                }}>
                <img ref={imageElRef} src={imageDataUrl} alt=""
                  draggable={false}
                  style={{
                    position: 'absolute', top: '50%', left: '50%',
                    transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${1 / zoom})`,
                    minWidth: '100%', minHeight: '100%', objectFit: 'cover',
                    pointerEvents: 'none',
                  }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 4 }}>
                  {t('profile.avatarZoom')}
                </div>
                <input type="range" min="1" max="3" step="0.05" value={zoom}
                  onChange={e => setZoom(parseFloat(e.target.value))}
                  style={{ width: '100%' }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setMode('home'); setImageDataUrl(null); }} disabled={busy}
                  style={{
                    flex: 1, padding: '10px 12px', borderRadius: 8,
                    background: 'var(--sf2)', border: '1px solid var(--bd)',
                    color: 'var(--tx2)', cursor: busy ? 'not-allowed' : 'pointer',
                    fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                  }}>
                  {t('common.back')}
                </button>
                <button onClick={cropAndUpload} disabled={busy}
                  style={{
                    flex: 2, padding: '10px 12px', borderRadius: 8,
                    background: 'var(--ac)', border: 'none',
                    color: 'var(--ac-on)', cursor: busy ? 'wait' : 'pointer',
                    fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                  }}>
                  {busy ? t('common.loading') : t('profile.avatarSave')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
