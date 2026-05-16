import { useState } from 'react';
import { updateUserProfile, type User } from '../api';
import { S, mutedText } from '../theme';

type UserProfileProps = {
  user: User;
  onClose: () => void;
  onUpdated: (updated: User) => void;
};

function UserProfile({ user, onClose, onUpdated }: UserProfileProps) {
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [email, setEmail] = useState(user.email || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim()) { setError('First and last name are required.'); return; }
    setError(''); setLoading(true);
    try {
      const result = await updateUserProfile(user.id, { firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim() || undefined });
      if (result.success) {
        onUpdated(result.user);
        setSaved(true);
        setEditing(false);
        setTimeout(() => setSaved(false), 2500);
      } else {
        setError(result.message || 'Failed to save.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save.');
    }
    setLoading(false);
  };

  const handleCancel = () => {
    setFirstName(user.firstName); setLastName(user.lastName); setEmail(user.email || '');
    setError(''); setEditing(false);
  };

  const initials = `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase();

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: '1.25rem', width: '100%', maxWidth: 500, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header band */}
        <div style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', padding: '2rem 1.75rem 3.5rem', position: 'relative' }}>
          <button onClick={onClose} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', color: '#fff', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem', fontWeight: 800, color: '#d97706', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>
            {initials}
          </div>
          {!editing && (
            <div style={{ marginTop: '0.75rem', color: '#fff' }}>
              <div style={{ fontSize: '1.35rem', fontWeight: 800 }}>{user.firstName} {user.lastName}</div>
              <div style={{ fontSize: '0.88rem', opacity: 0.85 }}>{user.phone}</div>
            </div>
          )}
        </div>

        {/* Content */}
        <div style={{ padding: '1.5rem', marginTop: editing ? 0 : '-1.5rem', display: 'grid', gap: '1rem' }}>
          {saved && <div style={S.successBox}>✓ Profile updated!</div>}
          {error && <div style={S.errorBox}>{error}</div>}

          {editing ? (
            <>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#78350f', marginBottom: '-0.25rem' }}>Edit Profile</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <Field label="First name">
                  <input style={S.inp} value={firstName} onChange={e => setFirstName(e.target.value)} autoFocus />
                </Field>
                <Field label="Last name">
                  <input style={S.inp} value={lastName} onChange={e => setLastName(e.target.value)} />
                </Field>
              </div>
              <Field label="Email (optional)">
                <input style={S.inp} type="email" value={email} placeholder="your@email.com" onChange={e => setEmail(e.target.value)} />
              </Field>
              <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
                <button style={S.smallOutlineBtn} onClick={handleCancel} disabled={loading}>Cancel</button>
                <button style={S.primaryBtn} onClick={handleSave} disabled={loading}>{loading ? 'Saving…' : '✓ Save changes'}</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ background: '#fffbeb', borderRadius: '0.85rem', padding: '1rem', display: 'grid', gap: '0.75rem' }}>
                <InfoRow label="📧 Email" value={user.email || '—'} />
                <InfoRow label="📅 Member since" value={user.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '—'} />
              </div>
              <button
                style={{ ...S.primaryBtn, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                onClick={() => setEditing(true)}
              >
                ✏️ Edit profile
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: '0.25rem' }}>
      <label style={{ ...mutedText, fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ ...mutedText, fontSize: '0.88rem' }}>{label}</span>
      <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#78350f' }}>{value}</span>
    </div>
  );
}

export default UserProfile;
