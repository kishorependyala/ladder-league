import { useEffect, useMemo, useState } from 'react';
import './App.css';
import { getAllLeagues, getMyRoles, getPendingMatches, getSports, type League, type Match, type RolesResponse, type User } from './api';
import AppHeader from './components/AppHeader';
import AuthFlow from './components/AuthFlow';
import LeagueAdmin from './components/LeagueAdmin';
import LeagueDashboard from './components/LeagueDashboard';
import LeagueStandings from './components/LeagueStandings';
import RankingPhase from './components/RankingPhase';
import SuperAdminPanel from './components/SuperAdminPanel';
import UserProfile from './components/UserProfile';
import { S, mutedText, sectionTitle, statusPill } from './theme';

type Tab = 'home' | 'league-admin' | 'super-admin';

// ── Shareable URL helpers ───────────────────────────────────────────
export function leagueShareUrl(leagueId: string): string {
  return `${window.location.origin}${window.location.pathname}#league=${encodeURIComponent(leagueId)}`;
}
export function appShareUrl(): string {
  return `${window.location.origin}${window.location.pathname}`;
}
function readHashLeagueId(): string | null {
  const m = window.location.hash.match(/^#league=(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

// ── Copy-link hook ──────────────────────────────────────────────────
export function useCopyLink() {
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const copy = (url: string) => {
    navigator.clipboard.writeText(url).catch(() => {
      // fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = url; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    });
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };
  return { copy, copiedUrl };
}

// ── Auto-update detector ────────────────────────────────────────────
// Every 15 seconds, fetch index.html and compare the main JS bundle
// filename (which is content-hashed). If a new build is detected, reload.
function useAutoUpdate(intervalMs = 15000) {
  useEffect(() => {
    // Capture the currently loaded main bundle src
    const currentScript = document.querySelector<HTMLScriptElement>('script[src*="/static/js/main."]');
    const currentSrc = currentScript?.src ?? '';

    const check = async () => {
      try {
        const res = await fetch('/', { cache: 'no-store' });
        const html = await res.text();
        const match = html.match(/\/static\/js\/main\.[^"]+\.js/);
        if (match && currentSrc && !currentSrc.includes(match[0])) {
          window.location.reload();
        }
      } catch {
        // network error — ignore, try again next tick
      }
    };

    const id = setInterval(check, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

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

// ── Pending actions helpers ─────────────────────────────────────────
function needsMyAction(match: Match, userId: string): boolean {
  if (match.matchType === 'doubles') {
    const all = [...(match.team1PlayerIds ?? []), ...(match.team2PlayerIds ?? [])];
    return all.includes(userId) && !(match.acceptedPlayerIds ?? []).includes(userId);
  }
  if (match.requiresBothAccept) {
    const sides = match.acceptedSides ?? [];
    if (match.submitterId === userId) return !sides.includes('submitter');
    if (match.opponentId === userId) return !sides.includes('opponent');
  }
  return match.opponentId === userId;
}

function PendingActionsBanner({
  user, allLeagues, onOpenLeague, onDismiss,
}: { user: User; allLeagues: League[]; onOpenLeague: (l: League) => void; onDismiss: () => void }) {
  const [actionable, setActionable] = useState<Match[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getPendingMatches(user.id)
      .then(matches => {
        setActionable((Array.isArray(matches) ? matches : []).filter(m => needsMyAction(m, user.id)));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [user.id]);

  if (!loaded || actionable.length === 0) return null;

  // Group by league
  const byLeague: Record<string, { league: League | undefined; matches: Match[] }> = {};
  for (const m of actionable) {
    if (!byLeague[m.leagueId]) {
      byLeague[m.leagueId] = { league: allLeagues.find(l => l.id === m.leagueId), matches: [] };
    }
    byLeague[m.leagueId].matches.push(m);
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
      border: '2px solid #f59e0b',
      borderRadius: '1rem',
      padding: '1rem 1.25rem',
      display: 'grid',
      gap: '0.75rem',
      boxShadow: '0 4px 16px rgba(245,158,11,0.18)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <span style={{ fontSize: '1.4rem' }}>⏳</span>
          <div>
            <p style={{ margin: 0, fontWeight: 700, color: '#78350f', fontSize: '1rem' }}>
              {actionable.length} match{actionable.length > 1 ? 'es' : ''} waiting for your confirmation
            </p>
            <p style={{ margin: '0.15rem 0 0', fontSize: '0.82rem', color: '#92400e' }}>
              Tap a league below to review and confirm
            </p>
          </div>
        </div>
        <button onClick={onDismiss} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#92400e', lineHeight: 1, padding: '0.1rem' }} title="Dismiss">✕</button>
      </div>

      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        {Object.entries(byLeague).map(([leagueId, { league, matches }]) => (
          <button
            key={leagueId}
            onClick={() => league && onOpenLeague(league)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              background: '#fff', border: '2px solid #f59e0b',
              borderRadius: '0.75rem', padding: '0.5rem 0.9rem',
              cursor: 'pointer', fontWeight: 600, color: '#78350f',
              fontSize: '0.88rem', boxShadow: '0 2px 8px rgba(245,158,11,0.12)',
            }}
          >
            <span style={{
              background: '#f59e0b', color: '#fff',
              borderRadius: '999px', fontSize: '0.72rem',
              fontWeight: 700, padding: '0.1rem 0.45rem', minWidth: '1.4rem', textAlign: 'center',
            }}>{matches.length}</span>
            {league?.name ?? leagueId}
            {matches.some(m => m.matchType === 'doubles') && ' 🏸'}
          </button>
        ))}
      </div>
    </div>
  );
}

const SESSION_KEY = 'ladder_league_user';

function App() {
  useAutoUpdate();
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
  const [showProfile, setShowProfile] = useState(false);
  const [showPendingBanner, setShowPendingBanner] = useState(true);
  const { copy, copiedUrl } = useCopyLink();

  // ── Sync URL hash ↔ selectedLeague ────────────────────────────────
  useEffect(() => {
    if (selectedLeague) {
      const next = `#league=${encodeURIComponent(selectedLeague.id)}`;
      if (window.location.hash !== next) window.history.pushState(null, '', next);
    } else {
      if (window.location.hash) window.history.pushState(null, '', window.location.pathname);
    }
  }, [selectedLeague]);

  // Restore from hash on login / league list load
  useEffect(() => {
    const id = readHashLeagueId();
    if (!id || !allLeagues.length) return;
    const target = allLeagues.find(l => l.id === id);
    if (target && (!selectedLeague || selectedLeague.id !== id)) setSelectedLeague(target);
  }, [allLeagues]); // eslint-disable-line react-hooks/exhaustive-deps

  // Browser back/forward button support
  useEffect(() => {
    const handler = () => {
      const id = readHashLeagueId();
      if (!id) setSelectedLeague(null);
      else {
        const target = allLeagues.find(l => l.id === id);
        if (target) setSelectedLeague(target);
      }
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [allLeagues]);

  useEffect(() => {
    if (!user) return;
    Promise.all([getMyRoles(user.phone), getAllLeagues(), getSports()])
      .then(([r, l, s]) => { setRoles(r); setAllLeagues(Array.isArray(l) ? l : []); setSports(Array.isArray(s) ? s : []); })
      .catch(() => {});
  }, [user]);

  const handleAuth = (u: User) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(u));
    setUser(u); setImpersonating(null); setTab('home'); setSelectedLeague(null); setShowPendingBanner(true);
  };
  const handleLogout = () => {
    localStorage.removeItem(SESSION_KEY);
    setUser(null); setImpersonating(null); setTab('home'); setSelectedLeague(null); setShowPendingBanner(true);
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
    || (selectedLeague.leagueType === 'team' && selectedLeague.status === 'ranked' && selectedLeague.phase !== 'ranking')
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
      <AppHeader
        user={user}
        onLogout={handleLogout}
        onHome={handleHome}
        onProfile={() => setShowProfile(true)}
        onShareApp={() => copy(appShareUrl())}
        appLinkCopied={copiedUrl === appShareUrl()}
      />
      <TabBar tabs={tabs} active={selectedLeague ? tab : tab} onChange={t => { setTab(t); setSelectedLeague(null); }} />
      <main style={S.main}>
        {impersonating && (
          <button onClick={handleReturnToAccount} style={{ ...S.infoBox, border: '1px solid #fdba74', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
            👤 Impersonating <strong>{user.firstName} {user.lastName}</strong> — click to return to your account
          </button>
        )}
        {showPendingBanner && (
          <PendingActionsBanner
            user={user}
            allLeagues={allLeagues}
            onOpenLeague={league => { setSelectedLeague(league); setShowPendingBanner(false); }}
            onDismiss={() => setShowPendingBanner(false)}
          />
        )}
        {selectedLeague && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button onClick={() => setSelectedLeague(null)} style={{ ...S.linkBtn, fontSize: '0.88rem' }}>
              ← Back to {tab === 'league-admin' ? 'League Admin' : 'My Leagues'}
            </button>
            <button
              onClick={() => copy(leagueShareUrl(selectedLeague.id))}
              style={{ padding: '0.2rem 0.6rem', borderRadius: '0.5rem', border: `1px solid ${copiedUrl === leagueShareUrl(selectedLeague.id) ? '#22c55e' : '#e5e7eb'}`, background: copiedUrl === leagueShareUrl(selectedLeague.id) ? '#f0fdf4' : '#f9fafb', color: copiedUrl === leagueShareUrl(selectedLeague.id) ? '#16a34a' : '#6b7280', fontSize: '0.78rem', fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s' }}
            >
              {copiedUrl === leagueShareUrl(selectedLeague.id) ? '✓ Copied!' : '🔗 Share this league'}
            </button>
          </div>
        )}
        {tabContent}
      </main>
      <footer style={{ textAlign: 'center', padding: '1.25rem', fontSize: '0.78rem', color: '#9ca3af' }}>
        A product of <strong style={{ color: '#78350f' }}>TeaBreakTech</strong>
      </footer>
      {showProfile && user && (
        <UserProfile
          user={user}
          onClose={() => setShowProfile(false)}
          onUpdated={updated => {
            localStorage.setItem('ladder_league_user', JSON.stringify(updated));
            setUser(updated);
            setShowProfile(false);
          }}
        />
      )}
    </div>
  );
}

export default App;

