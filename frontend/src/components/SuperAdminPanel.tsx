import { useEffect, useMemo, useState } from 'react';
import { addAdmin, addPlayer, addSuperAdmin, createLeague, deleteLeague, deleteUser, getAllLeagues, getAllUsers, getDisplayName, getMyRoles, getSports, loginAs, removePlayer, type League, type RolesResponse, type Sport, type User } from '../api';
import { S, mutedText, sectionTitle, subheading } from '../theme';

type SuperAdminPanelProps = {
  sessionUser: User;
  impersonating: User | null;
  onImpersonate: (user: User) => void;
  onReturn: () => void;
  onUsersChanged?: () => void;
};

function SuperAdminPanel({ sessionUser, impersonating, onImpersonate, onReturn, onUsersChanged }: SuperAdminPanelProps) {
  const [roles, setRoles] = useState<RolesResponse | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [query, setQuery] = useState('');
  const [busyPhone, setBusyPhone] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // create / manage league state
  const [sports, setSports] = useState<Sport[]>([]);
  const [newLeagueName, setNewLeagueName] = useState('');
  const [newLeagueSport, setNewLeagueSport] = useState('');
  const [newLeagueStart, setNewLeagueStart] = useState('');
  const [newLeagueEnd, setNewLeagueEnd] = useState('');
  const [busyCreate, setBusyCreate] = useState(false);
  // which league is currently being set up (right after creation or from dropdown)
  const [managingLeagueId, setManagingLeagueId] = useState('');
  const [playerSearchQ, setPlayerSearchQ] = useState('');
  const [busyPlayerOp, setBusyPlayerOp] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getMyRoles(sessionUser.phone), getAllUsers(), getAllLeagues(), getSports()])
      .then(([roleData, userData, leagueData, sportData]) => {
        setRoles(roleData);
        setUsers(Array.isArray(userData) ? userData : []);
        setLeagues(Array.isArray(leagueData) ? leagueData : []);
        setSports(Array.isArray(sportData) ? sportData : []);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Could not load super admin tools.'));
  }, [sessionUser.phone]);

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return users.slice(0, 20);
    return users
      .filter(user => [user.phone, user.firstName, user.lastName, `${user.firstName} ${user.lastName}`].some(value => value.toLowerCase().includes(normalized)))
      .slice(0, 20);
  }, [query, users]);

  // players to add to the managed league (search candidates not already in league)
  const managingLeague = useMemo(() => leagues.find(l => l.id === managingLeagueId) ?? null, [leagues, managingLeagueId]);

  const playerCandidates = useMemo(() => {
    if (!managingLeague) return [];
    const inLeague = new Set(managingLeague.players.map(p => p.id));
    const normalized = playerSearchQ.trim().toLowerCase();
    return users
      .filter(u => !inLeague.has(u.id))
      .filter(u => !normalized || [u.phone, u.firstName, u.lastName, `${u.firstName} ${u.lastName}`].some(v => v.toLowerCase().includes(normalized)))
      .slice(0, 10);
  }, [managingLeague, users, playerSearchQ]);

  const refreshLeagues = () => getAllLeagues().then(data => setLeagues(Array.isArray(data) ? data : []));

  const handleLoginAs = async (targetPhone: string) => {
    setBusyPhone(targetPhone);
    setError(''); setMessage('');
    try {
      const response = await loginAs(sessionUser.phone, targetPhone);
      onImpersonate(response.user);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not impersonate user.'); }
    setBusyPhone(null);
  };

  const handleAddSuperAdmin = async (targetPhone: string) => {
    setBusyPhone(targetPhone);
    setError(''); setMessage('');
    try {
      await addSuperAdmin(sessionUser.phone, targetPhone);
      setMessage(`${targetPhone} is now a super admin.`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not add super admin.'); }
    setBusyPhone(null);
  };

  const handleDeleteUser = async (user: User) => {
    if (!window.confirm(`Delete ${user.firstName} ${user.lastName} (${user.phone})? This cannot be undone.`)) return;
    setBusyPhone(user.phone);
    setError(''); setMessage('');
    try {
      const res = await deleteUser(sessionUser.phone, user.id);
      if (res.success) {
        setUsers(prev => prev.filter(u => u.id !== user.id));
        setMessage(`${user.firstName} ${user.lastName} deleted.`);
        onUsersChanged?.();
      } else { setError(res.message || 'Could not delete user.'); }
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not delete user.'); }
    setBusyPhone(null);
  };

  const handleDeleteLeague = async () => {
    if (!managingLeagueId) return;
    const league = leagues.find(l => l.id === managingLeagueId);
    if (!window.confirm(`Delete league "${league?.name}"? This will permanently remove all data including matches. This cannot be undone.`)) return;
    setError(''); setMessage('');
    try {
      const res = await deleteLeague(sessionUser.phone, managingLeagueId);
      if (res.success) {
        setLeagues(prev => prev.filter(l => l.id !== managingLeagueId));
        setManagingLeagueId('');
        setMessage(`League "${league?.name}" deleted.`);
      } else {
        setError(res.message || 'Could not delete league.');
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not delete league.'); }
  };

  const handleCreateLeague = async () => {    if (!newLeagueName || !newLeagueSport || !newLeagueStart || !newLeagueEnd) {
      setError('Name, sport, start date, and end date are required.');
      return;
    }
    setBusyCreate(true);
    setError(''); setMessage('');
    try {
      const res = await createLeague(sessionUser.phone, newLeagueName, newLeagueSport, newLeagueStart, newLeagueEnd);
      setNewLeagueName(''); setNewLeagueSport(''); setNewLeagueStart(''); setNewLeagueEnd('');
      setLeagues(prev => [...prev, res.league]);
      setManagingLeagueId(res.league.id);
      setMessage(`League "${res.league.name}" created. Now add players and admins below.`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not create league.'); }
    setBusyCreate(false);
  };

  const handleAddPlayerToLeague = async (targetPhone: string) => {
    if (!managingLeagueId) return;
    setBusyPlayerOp(`add-${targetPhone}`);
    setError(''); setMessage('');
    try {
      const res = await addPlayer(managingLeagueId, sessionUser.phone, targetPhone);
      setLeagues(prev => prev.map(l => l.id === managingLeagueId ? res.league : l));
      setPlayerSearchQ('');
      setMessage('Player added.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not add player.'); }
    setBusyPlayerOp(null);
  };

  const handleRemovePlayerFromLeague = async (playerId: string, playerName: string) => {
    if (!managingLeagueId) return;
    if (!window.confirm(`Remove ${playerName} from this league?`)) return;
    setBusyPlayerOp(`remove-${playerId}`);
    setError(''); setMessage('');
    try {
      const res = await removePlayer(managingLeagueId, sessionUser.phone, playerId);
      setLeagues(prev => prev.map(l => l.id === managingLeagueId ? res.league : l));
      setMessage(`${playerName} removed from league.`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not remove player.'); }
    setBusyPlayerOp(null);
  };

  const handleToggleAdmin = async (playerId: string, phone: string, isAdmin: boolean) => {
    if (!managingLeagueId) return;
    setBusyPlayerOp(`admin-${playerId}`);
    setError(''); setMessage('');
    try {
      if (!isAdmin) {
        const res = await addAdmin(managingLeagueId, sessionUser.phone, phone);
        setLeagues(prev => prev.map(l => l.id === managingLeagueId ? res.league : l));
        setMessage('Admin added.');
      } else {
        // no remove-admin endpoint yet — inform user
        setError('Removing admin role is not yet supported. Use the backend directly if needed.');
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not update admin role.'); }
    setBusyPlayerOp(null);
  };

  if (roles && !roles.isSuperAdmin) {
    return (
      <div style={{ ...S.card, display: 'grid', gap: '0.8rem' }}>
        <h2 style={sectionTitle}>Super admin tools</h2>
        <div style={S.errorBox}>This account is not a super admin.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      {/* header */}
      <div style={{ ...S.card, display: 'grid', gap: '0.8rem' }}>
        <div>
          <h2 style={sectionTitle}>Super admin tools</h2>
          <p style={{ ...mutedText, marginTop: '0.3rem' }}>Manage users, leagues, impersonate accounts, and grant platform-wide access.</p>
        </div>
        {impersonating && (
          <div style={S.infoBox}>
            Impersonating another user. <button onClick={onReturn} style={S.linkBtn}>Return to your account</button>
          </div>
        )}
        {error && <div style={S.errorBox}>{error}</div>}
        {message && <div style={S.successBox}>{message}</div>}
      </div>

      {/* super admin grant */}
            {/* create league + player / admin management */}
      <div style={{ ...S.card, display: 'grid', gap: '0.9rem' }}>
        <h3 style={subheading}>Create a league</h3>
        <input value={newLeagueName} onChange={e => setNewLeagueName(e.target.value)} placeholder="League name" style={S.inp} />
        <select value={newLeagueSport} onChange={e => setNewLeagueSport(e.target.value)} style={{ ...S.inp, background: '#fff' }}>
          <option value="">— Select sport —</option>
          {sports.map(sp => <option key={sp.id} value={sp.id}>{sp.label}</option>)}
        </select>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <label style={{ display: 'grid', gap: '0.3rem' }}>
            <span style={{ ...mutedText, fontSize: '0.8rem' }}>Start date</span>
            <input type="date" value={newLeagueStart} onChange={e => setNewLeagueStart(e.target.value)} style={S.inp} />
          </label>
          <label style={{ display: 'grid', gap: '0.3rem' }}>
            <span style={{ ...mutedText, fontSize: '0.8rem' }}>End date</span>
            <input type="date" value={newLeagueEnd} onChange={e => setNewLeagueEnd(e.target.value)} style={S.inp} />
          </label>
        </div>
        <button style={S.smallBtn} disabled={busyCreate} onClick={handleCreateLeague}>
          {busyCreate ? 'Creating…' : '+ Create league'}
        </button>

        {/* divider — manage players / admins for any league */}
        <div style={{ borderTop: '1px solid #fed7aa', paddingTop: '0.8rem', display: 'grid', gap: '0.6rem' }}>
          <p style={{ ...mutedText, fontSize: '0.85rem' }}>Manage players &amp; admins for an existing league:</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.5rem', alignItems: 'center' }}>
            <select
              value={managingLeagueId}
              onChange={e => { setManagingLeagueId(e.target.value); setPlayerSearchQ(''); setError(''); setMessage(''); }}
              style={{ ...S.inp, background: '#fff' }}
            >
              <option value="">— Select a league —</option>
              {leagues.map(l => <option key={l.id} value={l.id}>{l.name} ({l.sport})</option>)}
            </select>
            <button
              style={{ ...S.smallBtn, background: '#dc2626', boxShadow: 'none' }}
              disabled={!managingLeagueId}
              onClick={handleDeleteLeague}
              title="Delete this league"
            >
              🗑 Delete league
            </button>
          </div>
        </div>

        {managingLeague && (() => {
          const adminSet = new Set(managingLeague.adminIds ?? []);
          return (
            <div style={{ display: 'grid', gap: '0.8rem' }}>
              {/* current players */}
              <p style={subheading}>Players in league ({managingLeague.players.length})</p>
              {managingLeague.players.length === 0
                ? <p style={mutedText}>No players yet.</p>
                : (
                  <div style={{ display: 'grid', gap: '0.4rem' }}>
                    {managingLeague.players.map(p => {
                      const isAdmin = adminSet.has(p.id);
                      const busy = busyPlayerOp === `remove-${p.id}` || busyPlayerOp === `admin-${p.id}`;
                      return (
                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', padding: '0.5rem 0.7rem', background: '#fffbeb', borderRadius: '0.6rem', border: '1px solid #fde68a' }}>
                          <span style={{ flex: 1, color: '#78350f', fontWeight: 500 }}>
                            {p.firstName} {p.lastName}
                            {isAdmin && <span style={{ marginLeft: '0.4rem', fontSize: '0.75rem', color: '#92400e', background: '#fef3c7', borderRadius: '0.3rem', padding: '0.1rem 0.35rem' }}>admin</span>}
                          </span>
                          <span style={{ ...mutedText, fontSize: '0.8rem' }}>{p.phone}</span>
                          <button
                            style={{ ...S.smallOutlineBtn, fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                            disabled={busy}
                            onClick={() => handleToggleAdmin(p.id, p.phone, isAdmin)}
                            title={isAdmin ? 'Already admin (remove not yet supported)' : 'Make admin'}
                          >
                            {isAdmin ? '★ Admin' : '☆ Make admin'}
                          </button>
                          <button
                            style={{ ...S.smallBtn, background: '#dc2626', boxShadow: 'none', fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                            disabled={busy}
                            onClick={() => handleRemovePlayerFromLeague(p.id, `${p.firstName} ${p.lastName}`)}
                          >
                            {busyPlayerOp === `remove-${p.id}` ? '…' : '🗑'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )
              }

              {/* add players */}
              <p style={subheading}>Add players</p>
              <input value={playerSearchQ} onChange={e => setPlayerSearchQ(e.target.value)} placeholder="Search by name or phone…" style={S.inp} />
              {playerSearchQ && playerCandidates.length === 0 && <p style={mutedText}>No users found.</p>}
              {playerCandidates.map(u => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.4rem 0.6rem', background: '#f9fafb', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
                  <span style={{ flex: 1, color: '#374151' }}>{getDisplayName(u)}</span>
                  <span style={{ ...mutedText, fontSize: '0.8rem' }}>{u.phone}</span>
                  <button
                    style={{ ...S.smallBtn, fontSize: '0.75rem', padding: '0.2rem 0.6rem' }}
                    disabled={busyPlayerOp === `add-${u.phone}`}
                    onClick={() => handleAddPlayerToLeague(u.phone)}
                  >
                    {busyPlayerOp === `add-${u.phone}` ? '…' : '+ Add'}
                  </button>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* users list */}
      <div style={{ ...S.card, display: 'grid', gap: '0.8rem' }}>
        <h3 style={subheading}>Users ({users.length})</h3>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by phone or name" style={S.inp} />
        {filteredUsers.length === 0 ? (
          <p style={mutedText}>No users match your search.</p>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {filteredUsers.map(u => (
              <div key={u.id} style={{ border: '1px solid #fed7aa', borderRadius: '0.9rem', padding: '0.9rem', background: '#fffbeb', display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <strong style={{ color: '#78350f' }}>{getDisplayName(u)}</strong>
                  <p style={{ ...mutedText, marginTop: '0.2rem', fontSize: '0.85rem' }}>{u.phone}{u.email ? ` · ${u.email}` : ''}</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button style={S.smallOutlineBtn} disabled={!!busyPhone} onClick={() => handleAddSuperAdmin(u.phone)}>☆ Super admin</button>
                  <button style={S.smallBtn} disabled={!!busyPhone} onClick={() => handleLoginAs(u.phone)}>
                    {busyPhone === u.phone ? 'Working…' : '→ Login as'}
                  </button>
                  <button
                    style={{ ...S.smallBtn, background: '#dc2626', boxShadow: 'none' }}
                    disabled={!!busyPhone || u.id === sessionUser.id}
                    onClick={() => handleDeleteUser(u)}
                    title={u.id === sessionUser.id ? "Can't delete yourself" : 'Delete user'}
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default SuperAdminPanel;
