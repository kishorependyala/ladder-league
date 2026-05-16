import { useEffect, useMemo, useState } from 'react';
import { addAdmin, addPlayer, addSuperAdmin, createLeague, deleteLeague, deleteUser, getAllLeagues, getAllUsers, getDisplayName, getMyRoles, getSports, loginAs, removePlayer, signup, type League, type RolesResponse, type Sport, type User } from '../api';
import { S, mutedText, sectionTitle, subheading } from '../theme';
import LeagueRulesEditor from './LeagueRulesEditor';

type SuperAdminPanelProps = {
  sessionUser: User;
  impersonating: User | null;
  onImpersonate: (user: User) => void;
  onReturn: () => void;
  onUsersChanged?: () => void;
};

type SubTab = 'leagues' | 'users' | 'create';

const DELETE_PIN = '1234567';

function SuperAdminPanel({ sessionUser, impersonating, onImpersonate, onReturn, onUsersChanged }: SuperAdminPanelProps) {
  const [subTab, setSubTab] = useState<SubTab>('leagues');
  const [roles, setRoles] = useState<RolesResponse | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

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

  const refreshLeagues = () => getAllLeagues().then(d => setLeagues(Array.isArray(d) ? d : []));
  const refreshUsers = () => getAllUsers().then(d => setUsers(Array.isArray(d) ? d : []));

  const notify = (msg: string) => { setMessage(msg); setError(''); setTimeout(() => setMessage(''), 3000); };
  const fail = (msg: string) => { setError(msg); setMessage(''); };

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
      <div style={{ ...S.card, display: 'grid', gap: '0.6rem' }}>
        <h2 style={sectionTitle}>🔐 Super admin</h2>
        {impersonating && (
          <div style={S.infoBox}>Impersonating another user. <button onClick={onReturn} style={S.linkBtn}>Return to your account</button></div>
        )}
        {error && <div style={S.errorBox}>{error}</div>}
        {message && <div style={S.successBox}>{message}</div>}
      </div>

      {/* sub-tab bar */}
      <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '2px solid #fed7aa', background: '#fff', padding: '0 1rem', borderRadius: '1rem 1rem 0 0', boxShadow: '0 2px 8px rgba(120,53,15,0.06)' }}>
        {([['leagues', '🏆', 'Leagues'], ['users', '👥', 'Users'], ['create', '➕', 'Create League']] as [SubTab, string, string][]).map(([id, emoji, label]) => (
          <button key={id} onClick={() => setSubTab(id)} style={{ padding: '0.75rem 1.1rem', background: 'none', border: 'none', borderBottom: subTab === id ? '3px solid #f59e0b' : '3px solid transparent', color: subTab === id ? '#92400e' : '#6b7280', fontWeight: subTab === id ? 700 : 500, fontSize: '0.9rem', cursor: 'pointer', marginBottom: '-2px', transition: 'all 0.15s' }}>
            {emoji} {label}
          </button>
        ))}
      </div>

      {/* tab content */}
      {subTab === 'leagues' && (
        <LeaguesTab
          leagues={leagues} sports={sports} users={users}
          sessionUser={sessionUser}
          onLeaguesChange={setLeagues}
          onNotify={notify} onFail={fail}
          refreshLeagues={refreshLeagues}
        />
      )}
      {subTab === 'users' && (
        <UsersTab
          users={users} sessionUser={sessionUser}
          onImpersonate={onImpersonate}
          onUsersChange={setUsers}
          onUsersChanged={onUsersChanged}
          onNotify={notify} onFail={fail}
          refreshUsers={refreshUsers}
        />
      )}
      {subTab === 'create' && (
        <CreateLeagueTab
          sports={sports} sessionUser={sessionUser}
          onCreated={(league) => { setLeagues(prev => [...prev, league]); setSubTab('leagues'); notify(`League "${league.name}" created.`); }}
          onFail={fail}
        />
      )}
    </div>
  );
}

// ── Leagues tab ────────────────────────────────────────────────────────────

type LeaguesTabProps = {
  leagues: League[]; sports: Sport[]; users: User[];
  sessionUser: User;
  onLeaguesChange: (leagues: League[]) => void;
  onNotify: (msg: string) => void; onFail: (msg: string) => void;
  refreshLeagues: () => void;
};

function LeaguesTab({ leagues, sports, users, sessionUser, onLeaguesChange, onNotify, onFail, refreshLeagues }: LeaguesTabProps) {
  const [managingId, setManagingId] = useState<string | null>(null);
  const [manageTab, setManageTab] = useState<'players' | 'rules'>('players');
  const [deleteTarget, setDeleteTarget] = useState<League | null>(null);
  const [deletePin, setDeletePin] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [busyPlayerOp, setBusyPlayerOp] = useState<string | null>(null);
  const [playerSearchQ, setPlayerSearchQ] = useState('');

  const managingLeague = useMemo(() => leagues.find(l => l.id === managingId) ?? null, [leagues, managingId]);

  const sportLabel = (id: string) => sports.find(s => s.id === id)?.label ?? id;

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (deletePin !== DELETE_PIN) { onFail('Incorrect PIN.'); return; }
    setDeleteBusy(true);
    try {
      const res = await deleteLeague(sessionUser.phone, deleteTarget.id);
      if (res.success) {
        onLeaguesChange(leagues.filter(l => l.id !== deleteTarget.id));
        if (managingId === deleteTarget.id) setManagingId(null);
        onNotify(`League "${deleteTarget.name}" deleted.`);
        setDeleteTarget(null); setDeletePin('');
      } else { onFail(res.message || 'Could not delete league.'); }
    } catch (e) { onFail(e instanceof Error ? e.message : 'Error deleting league.'); }
    setDeleteBusy(false);
  };

  const playerCandidates = useMemo(() => {
    if (!managingLeague) return [];
    const inLeague = new Set(managingLeague.players.map(p => p.id));
    const q = playerSearchQ.trim().toLowerCase();
    return users
      .filter(u => !inLeague.has(u.id))
      .filter(u => !q || [u.phone, u.firstName, u.lastName, `${u.firstName} ${u.lastName}`].some(v => v.toLowerCase().includes(q)))
      .slice(0, 10);
  }, [managingLeague, users, playerSearchQ]);

  const handleAddPlayer = async (phone: string) => {
    if (!managingId) return;
    setBusyPlayerOp(`add-${phone}`);
    try {
      const res = await addPlayer(managingId, sessionUser.phone, phone);
      onLeaguesChange(leagues.map(l => l.id === managingId ? res.league : l));
      setPlayerSearchQ(''); onNotify('Player added.');
    } catch (e) { onFail(e instanceof Error ? e.message : 'Could not add player.'); }
    setBusyPlayerOp(null);
  };

  const handleRemovePlayer = async (playerId: string, name: string) => {
    if (!managingId || !window.confirm(`Remove ${name} from this league?`)) return;
    setBusyPlayerOp(`remove-${playerId}`);
    try {
      const res = await removePlayer(managingId, sessionUser.phone, playerId);
      onLeaguesChange(leagues.map(l => l.id === managingId ? res.league : l));
      onNotify(`${name} removed.`);
    } catch (e) { onFail(e instanceof Error ? e.message : 'Could not remove player.'); }
    setBusyPlayerOp(null);
  };

  const handleToggleAdmin = async (playerId: string, phone: string, isAdmin: boolean) => {
    if (!managingId) return;
    if (isAdmin) { onFail('Removing admin role is not yet supported.'); return; }
    setBusyPlayerOp(`admin-${playerId}`);
    try {
      const res = await addAdmin(managingId, sessionUser.phone, phone);
      onLeaguesChange(leagues.map(l => l.id === managingId ? res.league : l));
      onNotify('Admin role granted.');
    } catch (e) { onFail(e instanceof Error ? e.message : 'Could not update admin.'); }
    setBusyPlayerOp(null);
  };

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {/* Delete PIN modal */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
          onClick={() => { setDeleteTarget(null); setDeletePin(''); }}>
          <div style={{ background: '#fff', borderRadius: '1.25rem', width: '100%', maxWidth: 380, padding: '1.75rem', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', display: 'grid', gap: '1rem' }}
            onClick={e => e.stopPropagation()}>
            <div>
              <h3 style={{ ...subheading, color: '#dc2626' }}>🗑 Delete league</h3>
              <p style={{ ...mutedText, marginTop: '0.4rem' }}>
                You're about to permanently delete <strong>"{deleteTarget.name}"</strong> including all matches and data.
              </p>
            </div>
            <div style={{ display: 'grid', gap: '0.3rem' }}>
              <label style={{ ...mutedText, fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Enter admin PIN to confirm</label>
              <input
                style={S.inp} type="password" placeholder="PIN" autoFocus
                value={deletePin} onChange={e => setDeletePin(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && confirmDelete()}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
              <button style={S.smallOutlineBtn} onClick={() => { setDeleteTarget(null); setDeletePin(''); }}>Cancel</button>
              <button style={{ ...S.primaryBtn, background: '#dc2626', boxShadow: 'none' }} onClick={confirmDelete} disabled={deleteBusy}>
                {deleteBusy ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leagues table */}
      <div style={{ ...S.card, display: 'grid', gap: '1rem' }}>
        <h3 style={subheading}>All leagues ({leagues.length})</h3>
        {leagues.length === 0 ? (
          <p style={mutedText}>No leagues yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #fed7aa' }}>
                  <th style={{ textAlign: 'left', padding: '0.6rem 0.75rem', color: '#92400e', fontWeight: 700 }}>League</th>
                  <th style={{ textAlign: 'left', padding: '0.6rem 0.75rem', color: '#92400e', fontWeight: 700 }}>Sport</th>
                  <th style={{ textAlign: 'left', padding: '0.6rem 0.75rem', color: '#92400e', fontWeight: 700 }}>Status</th>
                  <th style={{ textAlign: 'left', padding: '0.6rem 0.75rem', color: '#92400e', fontWeight: 700 }}>Players</th>
                  <th style={{ padding: '0.6rem 0.75rem' }}></th>
                </tr>
              </thead>
              <tbody>
                {leagues.map((league, i) => (
                  <tr key={league.id} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? '#fffbeb' : '#fff' }}>
                    <td style={{ padding: '0.65rem 0.75rem', fontWeight: 600, color: '#78350f' }}>{league.name}</td>
                    <td style={{ padding: '0.65rem 0.75rem', color: '#6b7280' }}>{sportLabel(league.sport)}</td>
                    <td style={{ padding: '0.65rem 0.75rem' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 600, padding: '0.2rem 0.55rem', borderRadius: '99px', background: league.status === 'active' ? '#dcfce7' : league.status === 'draft' ? '#fef9c3' : '#f3f4f6', color: league.status === 'active' ? '#166534' : league.status === 'draft' ? '#854d0e' : '#374151' }}>
                        {league.status}
                      </span>
                    </td>
                    <td style={{ padding: '0.65rem 0.75rem', color: '#6b7280', textAlign: 'center' }}>{league.players.length}</td>
                    <td style={{ padding: '0.65rem 0.75rem' }}>
                      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button
                          style={{ ...S.smallOutlineBtn, fontSize: '0.8rem', padding: '0.3rem 0.7rem' }}
                          onClick={() => { setManagingId(managingId === league.id ? null : league.id); setPlayerSearchQ(''); }}
                        >
                          {managingId === league.id ? '✕ Close' : '⚙ Manage'}
                        </button>
                        <button
                          style={{ ...S.smallBtn, background: '#dc2626', boxShadow: 'none', fontSize: '0.8rem', padding: '0.3rem 0.7rem' }}
                          onClick={() => { setDeleteTarget(league); setDeletePin(''); }}
                        >
                          🗑 Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Manage panel */}
      {managingLeague && (
        <div style={{ ...S.card, display: 'grid', gap: '1rem', border: '2px solid #f59e0b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h3 style={subheading}>⚙ Managing: {managingLeague.name}</h3>
            <span style={{ ...mutedText, fontSize: '0.82rem' }}>{sportLabel(managingLeague.sport)} · {managingLeague.players.length} players · {managingLeague.status}</span>
          </div>

          {/* inner tab bar */}
          <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '2px solid #fde68a' }}>
            {([['players', '👥', 'Players'], ['rules', '⚖️', 'Match Rules']] as ['players' | 'rules', string, string][]).map(([id, emoji, label]) => (
              <button key={id} onClick={() => setManageTab(id)} style={{ padding: '0.5rem 0.9rem', background: 'none', border: 'none', borderBottom: manageTab === id ? '3px solid #f59e0b' : '3px solid transparent', color: manageTab === id ? '#92400e' : '#6b7280', fontWeight: manageTab === id ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer', marginBottom: '-2px' }}>
                {emoji} {label}
              </button>
            ))}
          </div>

          {manageTab === 'players' && (
            <div style={{ display: 'grid', gap: '1rem' }}>
              {/* current players */}
              <div>
                <p style={{ ...subheading, fontSize: '0.9rem', marginBottom: '0.5rem' }}>Players ({managingLeague.players.length})</p>
                {managingLeague.players.length === 0 ? <p style={mutedText}>No players yet.</p> : (
                  <div style={{ display: 'grid', gap: '0.4rem' }}>
                    {managingLeague.players.map(p => {
                      const isAdmin = (managingLeague.adminIds ?? []).includes(p.id);
                      const busy = busyPlayerOp === `remove-${p.id}` || busyPlayerOp === `admin-${p.id}`;
                      return (
                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', padding: '0.5rem 0.7rem', background: '#fffbeb', borderRadius: '0.6rem', border: '1px solid #fde68a' }}>
                          <span style={{ flex: 1, color: '#78350f', fontWeight: 500 }}>
                            {p.firstName} {p.lastName}
                            {isAdmin && <span style={{ marginLeft: '0.4rem', fontSize: '0.72rem', color: '#92400e', background: '#fef3c7', borderRadius: '0.3rem', padding: '0.1rem 0.35rem' }}>admin</span>}
                          </span>
                          <span style={{ ...mutedText, fontSize: '0.8rem' }}>{p.phone}</span>
                          <button style={{ ...S.smallOutlineBtn, fontSize: '0.75rem', padding: '0.2rem 0.5rem' }} disabled={busy} onClick={() => handleToggleAdmin(p.id, p.phone, isAdmin)}>
                            {isAdmin ? '★ Admin' : '☆ Make admin'}
                          </button>
                          <button style={{ ...S.smallBtn, background: '#dc2626', boxShadow: 'none', fontSize: '0.75rem', padding: '0.2rem 0.5rem' }} disabled={busy} onClick={() => handleRemovePlayer(p.id, `${p.firstName} ${p.lastName}`)}>
                            {busyPlayerOp === `remove-${p.id}` ? '…' : '🗑'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* add players */}
              <div>
                <p style={{ ...subheading, fontSize: '0.9rem', marginBottom: '0.5rem' }}>Add players</p>
                <input value={playerSearchQ} onChange={e => setPlayerSearchQ(e.target.value)} placeholder="Search by name or phone…" style={S.inp} />
                {playerSearchQ && playerCandidates.length === 0 && <p style={{ ...mutedText, marginTop: '0.4rem' }}>No users found.</p>}
                <div style={{ display: 'grid', gap: '0.4rem', marginTop: '0.5rem' }}>
                  {playerCandidates.map(u => (
                    <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.4rem 0.6rem', background: '#f9fafb', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
                      <span style={{ flex: 1, color: '#374151' }}>{getDisplayName(u)}</span>
                      <span style={{ ...mutedText, fontSize: '0.8rem' }}>{u.phone}</span>
                      <button style={{ ...S.smallBtn, fontSize: '0.75rem', padding: '0.2rem 0.6rem' }} disabled={busyPlayerOp === `add-${u.phone}`} onClick={() => handleAddPlayer(u.phone)}>
                        {busyPlayerOp === `add-${u.phone}` ? '…' : '+ Add'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {manageTab === 'rules' && (
            <LeagueRulesEditor
              league={managingLeague}
              adminPhone={sessionUser.phone}
              onUpdated={updated => onLeaguesChange(leagues.map(l => l.id === updated.id ? updated : l))}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Users tab ──────────────────────────────────────────────────────────────

type UsersTabProps = {
  users: User[]; sessionUser: User;
  onImpersonate: (user: User) => void;
  onUsersChange: (users: User[]) => void;
  onUsersChanged?: () => void;
  onNotify: (msg: string) => void; onFail: (msg: string) => void;
  refreshUsers: () => void;
};

function UsersTab({ users, sessionUser, onImpersonate, onUsersChange, onUsersChanged, onNotify, onFail }: UsersTabProps) {
  const [query, setQuery] = useState('');
  const [busyPhone, setBusyPhone] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  // new user form
  const [newFirst, setNewFirst] = useState('');
  const [newLast, setNewLast] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPin, setNewPin] = useState('0000');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState('');

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u => [u.phone, u.firstName, u.lastName, `${u.firstName} ${u.lastName}`].some(v => v.toLowerCase().includes(q)));
  }, [query, users]);

  const handleLoginAs = async (phone: string) => {
    setBusyPhone(phone);
    try {
      const { loginAs } = await import('../api');
      const res = await loginAs(sessionUser.phone, phone);
      onImpersonate(res.user);
    } catch (e) { onFail(e instanceof Error ? e.message : 'Could not impersonate.'); }
    setBusyPhone(null);
  };

  const handleAddSuperAdminRole = async (phone: string) => {
    setBusyPhone(phone);
    try {
      await addSuperAdmin(sessionUser.phone, phone);
      onNotify(`${phone} is now a super admin.`);
    } catch (e) { onFail(e instanceof Error ? e.message : 'Could not grant super admin.'); }
    setBusyPhone(null);
  };

  const handleDeleteUser = async (u: User) => {
    if (!window.confirm(`Delete ${u.firstName} ${u.lastName} (${u.phone})? This cannot be undone.`)) return;
    setBusyPhone(u.phone);
    try {
      const res = await deleteUser(sessionUser.phone, u.id);
      if (res.success) {
        onUsersChange(users.filter(x => x.id !== u.id));
        onUsersChanged?.();
        onNotify(`${u.firstName} ${u.lastName} deleted.`);
      } else { onFail(res.message || 'Could not delete user.'); }
    } catch (e) { onFail(e instanceof Error ? e.message : 'Could not delete user.'); }
    setBusyPhone(null);
  };

  const handleAddUser = async () => {
    if (!newFirst.trim() || !newLast.trim() || !newPhone.trim()) { setAddError('First name, last name, and phone are required.'); return; }
    setAddBusy(true); setAddError('');
    try {
      const res = await signup(newPhone.trim(), newFirst.trim(), newLast.trim(), newEmail.trim(), newPin || '0000');
      if (res.success) {
        onUsersChange([...users, res.user]);
        onUsersChanged?.();
        onNotify(`${res.user.firstName} ${res.user.lastName} added.`);
        setNewFirst(''); setNewLast(''); setNewPhone(''); setNewEmail(''); setNewPin('0000');
        setShowAdd(false);
      } else { setAddError(res.message || 'Could not create user.'); }
    } catch (e) { setAddError(e instanceof Error ? e.message : 'Could not create user.'); }
    setAddBusy(false);
  };

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {/* add user panel */}
      <div style={{ ...S.card, display: 'grid', gap: '0.8rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={subheading}>Users ({users.length})</h3>
          <button style={S.smallBtn} onClick={() => { setShowAdd(v => !v); setAddError(''); }}>
            {showAdd ? '✕ Cancel' : '+ Add user'}
          </button>
        </div>

        {showAdd && (
          <div style={{ display: 'grid', gap: '0.75rem', padding: '1rem', background: '#fffbeb', borderRadius: '0.8rem', border: '1px solid #fde68a' }}>
            <h4 style={{ ...subheading, fontSize: '0.9rem', margin: 0 }}>New user</h4>
            {addError && <div style={S.errorBox}>{addError}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
              <input style={S.inp} placeholder="First name" value={newFirst} onChange={e => setNewFirst(e.target.value)} />
              <input style={S.inp} placeholder="Last name" value={newLast} onChange={e => setNewLast(e.target.value)} />
            </div>
            <input style={S.inp} placeholder="Phone number" value={newPhone} onChange={e => setNewPhone(e.target.value)} />
            <input style={S.inp} placeholder="Email (optional)" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
            <div style={{ display: 'grid', gap: '0.3rem' }}>
              <label style={{ ...mutedText, fontSize: '0.78rem', fontWeight: 600 }}>PIN (default 0000)</label>
              <input style={S.inp} placeholder="PIN" value={newPin} onChange={e => setNewPin(e.target.value)} maxLength={8} />
            </div>
            <button style={S.primaryBtn} onClick={handleAddUser} disabled={addBusy}>{addBusy ? 'Adding…' : '+ Add user'}</button>
          </div>
        )}

        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name or phone…" style={S.inp} />

        {filteredUsers.length === 0 ? (
          <p style={mutedText}>No users match your search.</p>
        ) : (
          <div style={{ display: 'grid', gap: '0.6rem' }}>
            {filteredUsers.map(u => (
              <div key={u.id} style={{ border: '1px solid #fed7aa', borderRadius: '0.9rem', padding: '0.85rem', background: '#fffbeb', display: 'flex', justifyContent: 'space-between', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <strong style={{ color: '#78350f' }}>{getDisplayName(u)}</strong>
                  <p style={{ ...mutedText, marginTop: '0.15rem', fontSize: '0.82rem' }}>{u.phone}{u.email ? ` · ${u.email}` : ''}</p>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <button style={{ ...S.smallOutlineBtn, fontSize: '0.8rem' }} disabled={!!busyPhone} onClick={() => handleAddSuperAdminRole(u.phone)}>☆ Super admin</button>
                  <button style={{ ...S.smallBtn, fontSize: '0.8rem' }} disabled={!!busyPhone} onClick={() => handleLoginAs(u.phone)}>
                    {busyPhone === u.phone ? '…' : '→ Login as'}
                  </button>
                  <button
                    style={{ ...S.smallBtn, background: '#dc2626', boxShadow: 'none', fontSize: '0.8rem' }}
                    disabled={!!busyPhone || u.id === sessionUser.id}
                    title={u.id === sessionUser.id ? "Can't delete yourself" : 'Delete user'}
                    onClick={() => handleDeleteUser(u)}
                  >🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Create League tab ──────────────────────────────────────────────────────

type CreateLeagueTabProps = {
  sports: Sport[]; sessionUser: User;
  onCreated: (league: League) => void;
  onFail: (msg: string) => void;
};

function CreateLeagueTab({ sports, sessionUser, onCreated, onFail }: CreateLeagueTabProps) {
  const [name, setName] = useState('');
  const [sport, setSport] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    if (!name || !sport || !start || !end) { onFail('All fields are required.'); return; }
    setBusy(true);
    try {
      const res = await createLeague(sessionUser.phone, name, sport, start, end);
      onCreated(res.league);
      setName(''); setSport(''); setStart(''); setEnd('');
    } catch (e) { onFail(e instanceof Error ? e.message : 'Could not create league.'); }
    setBusy(false);
  };

  return (
    <div style={{ ...S.card, display: 'grid', gap: '1rem', maxWidth: 520 }}>
      <h3 style={subheading}>➕ Create a new league</h3>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="League name" style={S.inp} />
      <select value={sport} onChange={e => setSport(e.target.value)} style={{ ...S.inp, background: '#fff' }}>
        <option value="">— Select sport —</option>
        {sports.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <label style={{ display: 'grid', gap: '0.3rem' }}>
          <span style={{ ...mutedText, fontSize: '0.8rem' }}>Start date</span>
          <input type="date" value={start} onChange={e => setStart(e.target.value)} style={S.inp} />
        </label>
        <label style={{ display: 'grid', gap: '0.3rem' }}>
          <span style={{ ...mutedText, fontSize: '0.8rem' }}>End date</span>
          <input type="date" value={end} onChange={e => setEnd(e.target.value)} style={S.inp} />
        </label>
      </div>
      <button style={S.primaryBtn} disabled={busy} onClick={handleCreate}>
        {busy ? 'Creating…' : '+ Create league'}
      </button>
    </div>
  );
}

export default SuperAdminPanel;
