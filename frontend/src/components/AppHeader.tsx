import type { User } from '../api';
import { S } from '../theme';

function AppHeader({ user, onLogout, onHome }: { user: User | null; onLogout: () => void; onHome: () => void }) {
  return (
    <header style={S.header}>
      <button onClick={onHome} style={S.headerLogoBtn}>
        <span style={{ fontSize: '1.4rem' }}>🏆</span>
        <span style={{ fontWeight: 800, fontSize: '1.15rem', letterSpacing: '-0.01em' }}>Ladder League</span>
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {user && (
          <span style={{ fontWeight: 600, fontSize: '0.88rem', opacity: 0.92 }}>
            👤 {user.firstName} {user.lastName}
          </span>
        )}
        <button onClick={onLogout} style={S.headerBtn}>Log Out</button>
      </div>
    </header>
  );
}

export default AppHeader;
