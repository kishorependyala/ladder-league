import { useEffect, useMemo, useState } from 'react';
import './App.css';
import { getAllLeagues, getMyRoles, getSports, type League, type RolesResponse, type User } from './api';
import AppHeader from './components/AppHeader';
import AuthFlow from './components/AuthFlow';
import LeagueAdmin from './components/LeagueAdmin';
import LeagueDashboard from './components/LeagueDashboard';
import LeagueStandings from './components/LeagueStandings';
import RankingPhase from './components/RankingPhase';
import SuperAdminPanel from './components/SuperAdminPanel';
import { S, mutedText, sectionTitle, statusPill } from './theme';

type Tab = 'home' | 'league-admin' | 'super-admin';

// ── Tab bar ────────────────────────────────────────────────────────
function TabBar({ tabs, active, onChange }: {
  tabs: { id: Tab; label: string; emoji: string }[];
  active: Tab;
  onChange: (t: Tab) => void;
}) {
  return (
    <div style={{
      display: 'flex', gap: '0.25rem',
      borderBottom: '2px solid #fed7aa',
      background: '#fff',
      padding: '0 1rem',
      position: 'sticky', top: 56, zIndex: 90,
      boxShadow: '0 2px 8px rgba(120,53,15,0.06)',
    }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          padding: '0.75rem 1.1rem',
          background: 'none',
          border: 'none',
          borderBottom: active === t.id ? '3px solid #f59e0b' : '3px solid transparent',
          color: active === t.id ? '#92400e' : '#6b7280',
          fontWeight: active === t.id ? 700 : 500,
          fontSize: '0.92rem',
          cursor: 'pointer',
          transition: 'all 0.15s',
          marginBottom: '-2px',
        }}>
          {t.emoji} {t.label}
        </button>
      ))}
    </div>
  );
}

const SESSION_KEY = 'ladder_league_user';

function App() {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem(SESSION_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });
  const [impersonating, setImpersonating] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null);
  const [roles, setRoles] = useState<RolesResponse | null>(null);
  const [sports, setSports] = useState<any[]>([]);
  const [allLeagues, setAllLeagues] = useState<League[]>([]);

  useEffect(() => {
    if (!user) return;
    Promise.all([getMyRoles(user.phone), getAllLeagues(), getSports()])
      .then(([r, l, s]) => { setRoles(r); setAllLeagues(Array.isArray(l) ? l : []); setSports(Array.isArray(s) ? s : []); })
      .catch(() => {});
  }, [user]);

  const handleAuth = (u: User) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(u));
    setUser(u); setImpersonating(null); setTab('home'); setSelectedLeague(null);
  };
  const handleLogout = () => {
    localStorage.removeItem(SESSION_KEY);
    setUser(null); setImpersonating(null); setTab('home'); setSelectedLeague(null);
  };
  const handleHome = () => { setTab('home'); setSelectedLeague(null); };

  const handleOpenLeague = (league: League) => setSelectedLeague(league);

  const handleImpersonate = (next: User) => {
    if (!user) return;
    setImpersonating(imp => imp || user);
    setUser(next); setTab('home'); setSelectedLeague(null);
  };
  const handleReturnToAccount = () => {
    if (!impersonating) return;
    setUser(impersonating); setImpersonating(null); setTab('home'); setSelectedLeague(null);
  };

  const manageableLeagues = useMemo(() => {
    if (!roles || !user) return [];
    if (roles.isSuperAdmin) return allLeagues;
    return allLeagues.filter(l => roles.adminLeagueIds.includes(l.id) || l.adminIds.includes(user.id));
  }, [allLeagues, roles, user]);

  const refreshLeagues = () => {
    if (!user) return;
    getAllLeagues().then(l => setAllLeagues(Array.isArray(l) ? l : [])).catch(() => {});
  };

  if (!user) return <AuthFlow onAuth={handleAuth} />;

  const tabs: { id: Tab; label: string; emoji: string }[] = [
    { id: 'home', label: 'My Leagues', emoji: '🏆' },
    ...(manageableLeagues.length > 0 || roles?.isSuperAdmin ? [{ id: 'league-admin' as Tab, label: 'League Admin', emoji: '⚙️' }] : []),
    ...(roles?.isSuperAdmin ? [{ id: 'super-admin' as Tab, label: 'Super Admin', emoji: '🔐' }] : []),
  ];

  // ── League detail view (ranking / standings) ───────────────────
  const leagueDetail = selectedLeague && (
    selectedLeague.status === 'active' || selectedLeague.status === 'playoffs' || selectedLeague.status === 'completed'
      ? <LeagueStandings league={selectedLeague} user={user} />
      : selectedLeague.status === 'draft' || selectedLeague.status === 'ranking' || selectedLeague.status === 'ranked'
        ? <RankingPhase league={selectedLeague} user={user} onLeagueChange={setSelectedLeague} />
        : (
          <div style={{ display: 'grid', gap: '1.25rem' }}>
            <div style={{ ...S.card, display: 'grid', gap: '0.8rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                  <h2 style={sectionTitle}>{selectedLeague.name}</h2>
                  <p style={{ ...mutedText, marginTop: '0.3rem', textTransform: 'capitalize' }}>{selectedLeague.sport}</p>
                </div>
                <span style={statusPill(selectedLeague.status)}>{selectedLeague.status}</span>
              </div>
              <div style={S.infoBox}>This league is being prepared. Admins will start the ranking phase soon.</div>
              <div>
                <button style={S.smallOutlineBtn} onClick={() => setSelectedLeague(null)}>← Back</button>
              </div>
            </div>
          </div>
        )
  );

  // ── Tab content ────────────────────────────────────────────────
  let tabContent: React.ReactNode;
  if (selectedLeague) {
    tabContent = leagueDetail;
  } else if (tab === 'super-admin') {
    tabContent = (
      <SuperAdminPanel
        sessionUser={user}
        impersonating={impersonating}
        onImpersonate={handleImpersonate}
        onReturn={handleReturnToAccount}
        onUsersChanged={refreshLeagues}
      />
    );
  } else if (tab === 'league-admin') {
    tabContent = (
      <LeagueAdmin
        user={user}
        leagues={manageableLeagues}
        onOpenLeague={handleOpenLeague}
        onLeagueChange={setSelectedLeague}
        onRefresh={refreshLeagues}
      />
    );
  } else {
    tabContent = (
      <LeagueDashboard
        user={user}
        onOpenLeague={handleOpenLeague}
        onOpenSuperAdmin={() => setTab('super-admin')}
      />
    );
  }

  return (
    <div style={S.shell}>
      <AppHeader user={user} onLogout={handleLogout} onHome={handleHome} />
      <TabBar tabs={tabs} active={selectedLeague ? tab : tab} onChange={t => { setTab(t); setSelectedLeague(null); }} />
      <main style={S.main}>
        {impersonating && (
          <button onClick={handleReturnToAccount} style={{ ...S.infoBox, border: '1px solid #fdba74', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
            👤 Impersonating <strong>{user.firstName} {user.lastName}</strong> — click to return to your account
          </button>
        )}
        {selectedLeague && (
          <button onClick={() => setSelectedLeague(null)} style={{ ...S.linkBtn, fontSize: '0.88rem' }}>
            ← Back to {tab === 'league-admin' ? 'League Admin' : 'My Leagues'}
          </button>
        )}
        {tabContent}
      </main>
    </div>
  );
}

export default App;

