import { useEffect, useMemo, useState } from 'react';
import { addAdmin, addPlayer, finalizeRanking, getAllUsers, getDisplayName, removePlayer, startLeague, startRanking, type League, type Player, type User } from '../api';
import { S, mutedText, sectionTitle, statusPill, subheading } from '../theme';

const API_BASE = 'http://localhost:8080';

type LeagueAdminProps = {
  user: User;
  leagues: League[];
  onOpenLeague: (league: League) => void;
  onLeagueChange: (league: League) => void;
  onRefresh: () => void | Promise<void>;
};

type AddMode = 'search' | 'new';

function LeagueCard({
  league,
  user,
  allUsers,
  onLeagueUpdate,
  onOpenLeague,
}: {
  league: League;
  user: User;
  allUsers: User[];
  onLeagueUpdate: (l: League) => void;
  onOpenLeague: (l: League) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // add player state
  const [addMode, setAddMode] = useState<AddMode>('search');
  const [searchQ, setSearchQ] = useState('');
  // new user form
  const [newPhone, setNewPhone] = useState('');
  const [newFirst, setNewFirst] = useState('');
  const [newLast, setNewLast] = useState('');

  const adminSet = useMemo(() => new Set(league.adminIds ?? []), [league.adminIds]);
  const inLeagueSet = useMemo(() => new Set(league.players.map(p => p.id)), [league.players]);

  const searchCandidates = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return [];
    return allUsers
      .filter(u => !inLeagueSet.has(u.id))
      .filter(u => [u.phone, u.firstName, u.lastName, `${u.firstName} ${u.lastName}`].some(v => v.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [searchQ, allUsers, inLeagueSet]);

  const act = async (key: string, fn: () => Promise<League>) => {
    setBusyId(key); setError(''); setMessage('');
    try { onLeagueUpdate(await fn()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Action failed.'); }
    setBusyId(null);
  };

  const handleRemovePlayer = (p: Player) => {
    if (!window.confirm(`Remove ${p.firstName} ${p.lastName} from this league?`)) return;
    act(`remove-${p.id}`, async () => {
      const res = await removePlayer(league.id, user.phone, p.id);
      if (!res.success) throw new Error((res as any).message);
      setMessage(`${p.firstName} ${p.lastName} removed.`);
      return res.league;
    });
  };

  const handleMakeAdmin = (p: Player) => {
    act(`admin-${p.id}`, async () => {
      const res = await addAdmin(league.id, user.phone, p.phone);
      if (!res.success) throw new Error((res as any).message);
      setMessage(`${p.firstName} ${p.lastName} is now an admin.`);
      return res.league;
    });
  };

  const handleAddExisting = (targetUser: User) => {
    act(`add-${targetUser.id}`, async () => {
      const res = await addPlayer(league.id, user.phone, targetUser.phone);
      if (!res.success) throw new Error((res as any).message);
      setMessage(`${getDisplayName(targetUser)} added.`);
      setSearchQ('');
      return res.league;
    });
  };

  const handleAddNew = async () => {
    if (!newPhone || !newFirst || !newLast) {
      setError('Phone, first name, and last name are required.'); return;
    }
    setBusyId('add-new'); setError(''); setMessage('');
    try {
      // create user (default pin 0000)
      const signupRes = await fetch(`${API_BASE}/api/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: newPhone, firstName: newFirst, lastName: newLast, pin: '0000' }),
      }).then(r => r.json());
      const targetPhone = signupRes.success ? signupRes.user.phone : newPhone;
      // add to league
      const addRes = await addPlayer(league.id, user.phone, targetPhone);
      if (!addRes.success) throw new Error((addRes as any).message);
      setMessage(`${newFirst} ${newLast} created and added.${signupRes.success ? '' : ' (User already existed.)'}`);
      setNewPhone(''); setNewFirst(''); setNewLast('');
      onLeagueUpdate(addRes.league);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed.'); }
    setBusyId(null);
  };

  const handleProgress = () => {
    const key = `progress-${league.id}`;
    act(key, async () => {
      if (league.status === 'draft') {
        const r = await startRanking(league.id, user.phone); return r.league;
      } else if (league.status === 'ranking') {
        const r = await finalizeRanking(league.id, user.phone); return r.league;
      } else {
        const r = await startLeague(league.id, user.phone); return r.league;
      }
    });
  };

  return (
    <div style={{ border: '1px solid #fed7aa', borderRadius: '1rem', padding: '1.1rem', background: '#fff', display: 'grid', gap: '1rem' }}>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <strong style={{ color: '#78350f', fontSize: '1.05rem' }}>{league.name}</strong>
            <span style={statusPill(league.status)}>{league.status}</span>
          </div>
          <p style={{ ...mutedText, marginTop: '0.2rem', fontSize: '0.85rem' }}>
            {league.sport}
            {league.startDate && <> &nbsp;·&nbsp; Starts {league.startDate}</>}
            {league.endDate && <> &nbsp;→&nbsp; {league.endDate}</>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button style={S.smallOutlineBtn} onClick={() => onOpenLeague(league)}>Open</button>
          {['draft', 'ranking', 'ranked'].includes(league.status) && (
            <button style={S.smallBtn} disabled={!!busyId} onClick={handleProgress}>
              {league.status === 'draft' ? 'Start ranking' : league.status === 'ranking' ? 'Finalize ranking' : 'Start league'}
            </button>
          )}
        </div>
      </div>

      {error && <div style={S.errorBox}>{error}</div>}
      {message && <div style={S.successBox}>{message}</div>}

      {/* player list */}
      <div>
        <p style={{ ...subheading, marginBottom: '0.5rem' }}>Players ({league.players.length})</p>
        {league.players.length === 0
          ? <p style={mutedText}>No players yet.</p>
          : (
            <div style={{ display: 'grid', gap: '0.4rem' }}>
              {league.players.map(p => {
                const isAdmin = adminSet.has(p.id);
                const busy = busyId === `remove-${p.id}` || busyId === `admin-${p.id}`;
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', padding: '0.45rem 0.7rem', background: '#fffbeb', borderRadius: '0.6rem', border: '1px solid #fde68a' }}>
                    <span style={{ flex: 1, color: '#78350f', fontWeight: 500, fontSize: '0.92rem' }}>
                      {p.firstName} {p.lastName}
                      {isAdmin && <span style={{ marginLeft: '0.4rem', fontSize: '0.72rem', color: '#92400e', background: '#fef3c7', borderRadius: '0.3rem', padding: '0.1rem 0.35rem' }}>admin</span>}
                    </span>
                    <span style={{ ...mutedText, fontSize: '0.8rem' }}>{p.phone}</span>
                    {!isAdmin && (
                      <button
                        style={{ ...S.smallOutlineBtn, fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                        disabled={busy}
                        onClick={() => handleMakeAdmin(p)}
                      >
                        ☆ Make admin
                      </button>
                    )}
                    <button
                      style={{ ...S.smallBtn, background: '#dc2626', boxShadow: 'none', fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                      disabled={busy}
                      onClick={() => handleRemovePlayer(p)}
                      title="Remove from league"
                    >
                      {busyId === `remove-${p.id}` ? '…' : '✕ Remove'}
                    </button>
                  </div>
                );
              })}
            </div>
          )
        }
      </div>

      {/* add player */}
      <div style={{ borderTop: '1px solid #fde68a', paddingTop: '0.8rem', display: 'grid', gap: '0.6rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <p style={{ ...subheading, margin: 0 }}>Add player</p>
          <button
            style={{ ...S.smallOutlineBtn, fontSize: '0.75rem', padding: '0.15rem 0.5rem', background: addMode === 'search' ? '#fef3c7' : undefined }}
            onClick={() => setAddMode('search')}
          >
            From system
          </button>
          <button
            style={{ ...S.smallOutlineBtn, fontSize: '0.75rem', padding: '0.15rem 0.5rem', background: addMode === 'new' ? '#fef3c7' : undefined }}
            onClick={() => setAddMode('new')}
          >
            New player
          </button>
        </div>

        {addMode === 'search' ? (
          <div style={{ display: 'grid', gap: '0.4rem' }}>
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search by name or phone…" style={S.inp} />
            {searchQ && searchCandidates.length === 0 && <p style={mutedText}>No users found.</p>}
            {searchCandidates.map(u => (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.7rem', background: '#f9fafb', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
                <span style={{ flex: 1, fontSize: '0.9rem' }}>{getDisplayName(u)}</span>
                <span style={{ ...mutedText, fontSize: '0.8rem' }}>{u.phone}</span>
                <button
                  style={{ ...S.smallBtn, fontSize: '0.75rem', padding: '0.2rem 0.6rem' }}
                  disabled={busyId === `add-${u.id}`}
                  onClick={() => handleAddExisting(u)}
                >
                  {busyId === `add-${u.id}` ? '…' : '+ Add'}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            <input value={newPhone} onChange={e => setNewPhone(e.target.value.replace(/\D/g, ''))} placeholder="Phone number *" style={S.inp} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <input value={newFirst} onChange={e => setNewFirst(e.target.value)} placeholder="First name *" style={S.inp} />
              <input value={newLast} onChange={e => setNewLast(e.target.value)} placeholder="Last name *" style={S.inp} />
            </div>
            <p style={{ ...mutedText, fontSize: '0.8rem' }}>Default PIN 0000 will be assigned. Player can change it after login.</p>
            <button style={S.smallBtn} disabled={busyId === 'add-new'} onClick={handleAddNew}>
              {busyId === 'add-new' ? 'Creating…' : '+ Create & add player'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function LeagueAdmin({ user, leagues, onOpenLeague, onLeagueChange, onRefresh }: LeagueAdminProps) {
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [localLeagues, setLocalLeagues] = useState<League[]>(leagues);

  useEffect(() => { setLocalLeagues(leagues); }, [leagues]);
  useEffect(() => { getAllUsers().then(u => setAllUsers(Array.isArray(u) ? u : [])); }, []);

  const handleLeagueUpdate = (updated: League) => {
    setLocalLeagues(prev => prev.map(l => l.id === updated.id ? updated : l));
    onLeagueChange(updated);
    onRefresh();
  };

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <h2 style={sectionTitle}>League admin</h2>
      {localLeagues.length === 0
        ? <p style={mutedText}>You are not managing any leagues yet. A super admin can create leagues and assign you as admin.</p>
        : localLeagues.map(league => (
          <LeagueCard
            key={league.id}
            league={league}
            user={user}
            allUsers={allUsers}
            onLeagueUpdate={handleLeagueUpdate}
            onOpenLeague={onOpenLeague}
          />
        ))
      }
    </div>
  );
}

export default LeagueAdmin;
