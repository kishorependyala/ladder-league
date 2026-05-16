import type { User } from '../api';
import { S } from '../theme';

function AppHeader({ user, onLogout, onHome, onProfile, onShareApp, appLinkCopied }: {
  user: User | null;
  onLogout: () => void;
  onHome: () => void;
  onProfile: () => void;
  onShareApp: () => void;
  appLinkCopied: boolean;
}) {
  return (
    <header style={S.header}>
      <button onClick={onHome} style={S.headerLogoBtn}>
        <span style={{ fontSize: '1.4rem' }}>🏆</span>
        <span style={{ fontWeight: 800, fontSize: '1.15rem', letterSpacing: '-0.01em' }}>Ladder League</span>
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <button
          onClick={onShareApp}
          title="Copy app link"
          style={{
            background: appLinkCopied ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.12)',
            border: '1px solid rgba(255,255,255,0.25)',
            borderRadius: '1.5rem',
            padding: '0.3rem 0.65rem',
            cursor: 'pointer',
            fontSize: '0.82rem',
            color: 'inherit',
            fontWeight: 500,
            transition: 'all 0.15s',
          }}
        >
          {appLinkCopied ? '✓ Copied!' : '🔗 Share'}
        </button>
        {user && (
          <button
            onClick={onProfile}
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '1.5rem',
              padding: '0.3rem 0.75rem',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.88rem',
              color: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              transition: 'background 0.15s',
            }}
            onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.25)')}
            onMouseOut={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
            title="View / edit profile"
          >
            👤 {user.firstName} {user.lastName}
          </button>
        )}
        <button onClick={onLogout} style={S.headerBtn}>Log Out</button>
      </div>
    </header>
  );
}

export default AppHeader;
