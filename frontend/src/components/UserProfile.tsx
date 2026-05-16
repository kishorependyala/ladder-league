import { useState } from 'react';
import { updateUserProfile, type User } from '../api';
import { S, mutedText, subheading } from '../theme';

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
    if (!firstName.trim() || !lastName.trim()) {
      setError('First and last name are required.');
      return;
    }
    setError('');
    setLoading(true);
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
    setFirstName(user.firstName);
    setLastName(user.lastName);
    setEmail(user.email || '');
    setError('');
    setEditing(false);
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={onClose}
    >
      <div
        style={{ ...S.card, width: '100%', maxWidth: 420, display: 'grid', gap: '1rem' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={subheading}>👤 My Profile</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#9ca3af' }}>✕</button>
        </div>

        {saved && <div style={S.successBox}>✓ Profile updated!</div>}
        {error && <div style={S.errorBox}>{error}</div>}

        {editing ? (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div>
                <label style={{ ...mutedText, fontSize: '0.8rem', display: 'block', marginBottom: '0.3rem' }}>First name</label>
                <input
                  style={S.input}
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label style={{ ...mutedText, fontSize: '0.8rem', display: 'block', marginBottom: '0.3rem' }}>Last name</label>
                <input
                  style={S.input}
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label style={{ ...mutedText, fontSize: '0.8rem', display: 'block', marginBottom: '0.3rem' }}>Email (optional)</label>
              <input
                style={S.input}
                type="email"
                value={email}
                placeholder="your@email.com"
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button style={S.smallOutlineBtn} onClick={handleCancel} disabled={loading}>Cancel</button>
              <button style={S.btn} onClick={handleSave} disabled={loading}>
                {loading ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.6rem' }}>
            <Row label="Name" value={`${user.firstName} ${user.lastName}`} />
            <Row label="Phone" value={user.phone} />
            <Row label="Email" value={user.email || '—'} />
            <Row label="Member since" value={user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.25rem' }}>
              <button style={S.btn} onClick={() => setEditing(true)}>✏️ Edit profile</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #fef3c7', paddingBottom: '0.4rem' }}>
      <span style={{ ...mutedText, fontSize: '0.85rem' }}>{label}</span>
      <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#78350f' }}>{value}</span>
    </div>
  );
}

export default UserProfile;
