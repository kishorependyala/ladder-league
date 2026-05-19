import { useEffect, useMemo, useState } from 'react';
import { addAdmin, addPlayer, finalizeRanking, getAllUsers, getDisplayName, removePlayer, renameLeague, startLeague, startRanking, updateLeagueBlocks, type League, type LeagueBlock, type Player, type User } from '../api';
import { S, mutedText, sectionTitle, statusPill, subheading } from '../theme';
import LeagueRulesEditor from './LeagueRulesEditor';

const API_BASE = 'http://localhost:8080';

type LeagueAdminProps = {
  user: User;
  leagues: League[];
  onOpenLeague: (league: League) => void;
  onLeagueChange: (league: League) => void;
  onRefresh: () => void | Promise<void>;
};

type AddMode = 'search' | 'new';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function blockDays(b: LeagueBlock) {
  const diff = (new Date(b.endDate).getTime() - new Date(b.startDate).getTime()) / 86400000;
  return Math.round(diff);
}

function currentBlockIndex(blocks: LeagueBlock[]): number {
  const today = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < blocks.length; i++) {
    if (today >= blocks[i].startDate && today < blocks[i].endDate) return i;
  }
  if (blocks.length && new Date().toISOString().slice(0, 10) >= blocks[blocks.length - 1].endDate) return blocks.length; // all done
  return -1;
}

// ── ScheduleEditor ────────────────────────────────────────────────────────────
function ScheduleEditor({ league, user, onLeagueUpdate }: { league: League; user: User; onLeagueUpdate: (l: League) => void }) {
  const defaultBlocks = (): LeagueBlock[] => league.blocks ?? [];
  const [blocks, setBlocks] = useState<LeagueBlock[]>(defaultBlocks);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // keep in sync when league prop changes
  useEffect(() => { setBlocks(league.blocks ?? []); }, [league.blocks]);

  const todayIso = new Date().toISOString().slice(0, 10);
  const curIdx = currentBlockIndex(blocks);

  const startEdit = (i: number) => {
    setEditIdx(i);
    setEditStart(blocks[i].startDate);
    setEditEnd(blocks[i].endDate);
    setError('');
    setMessage('');
  };

  const cancelEdit = () => { setEditIdx(null); setError(''); };

  const saveEdit = () => {
    if (!editStart || !editEnd || editEnd <= editStart) {
      setError('End date must be after start date.');
      return;
    }
    const updated = blocks.map((b, i) => i === editIdx ? { ...b, startDate: editStart, endDate: editEnd } : b);
    setBlocks(updated);
    setEditIdx(null);
    setError('');
  };

  const addBlock = () => {
    const last = blocks[blocks.length - 1];
    const start = last ? last.endDate : todayIso;
    const blockDays = (league.rules?.blockDurationDays ?? 7);
    const endDate = new Date(new Date(start).getTime() + blockDays * 86400000).toISOString().slice(0, 10);
    setBlocks(prev => [...prev, { index: prev.length, startDate: start, endDate: endDate }]);
  };

  const removeBlock = (i: number) => {
    setBlocks(prev => prev.filter((_, idx) => idx !== i).map((b, idx) => ({ ...b, index: idx })));
  };

  const saveAll = async () => {
    setSaving(true); setError(''); setMessage('');
    try {
      const res = await updateLeagueBlocks(league.id, user.phone, blocks);
      if (res.success) { onLeagueUpdate(res.league); setMessage('Schedule saved.'); }
      else setError(res.message || 'Failed to save.');
    } catch { setError('Could not reach server.'); }
    setSaving(false);
  };

  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <p style={{ ...mutedText, margin: 0, fontSize: '0.82rem' }}>
          Each block is a play window. Default duration: <strong>{league.rules?.blockDurationDays ?? 7} days</strong>. Edit any block's dates below.
        </p>
        <button style={{ ...S.smallBtn, fontSize: '0.78rem', padding: '0.25rem 0.65rem' }} onClick={addBlock}>+ Add block</button>
      </div>

      {error && <div style={S.errorBox}>{error}</div>}
      {message && <div style={S.successBox}>{message}</div>}

      <div style={{ display: 'grid', gap: '0.4rem' }}>
        {blocks.map((b, i) => {
          const isCurrent = i === curIdx;
          const isPast = b.endDate <= todayIso;
          const isFuture = b.startDate > todayIso;
          const isEditing = editIdx === i;

          return (
            <div key={i} style={{
              display: 'grid', gap: '0.35rem',
              padding: '0.6rem 0.75rem',
              borderRadius: '0.65rem',
              border: `1.5px solid ${isCurrent ? '#f59e0b' : isPast ? '#e5e7eb' : '#fed7aa'}`,
              background: isCurrent ? '#fffbeb' : isPast ? '#f9fafb' : '#fff',
              opacity: isPast ? 0.75 : 1,
            }}>
              {isEditing ? (
                <div style={{ display: 'grid', gap: '0.4rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#78350f', minWidth: 56 }}>Block {i + 1}</span>
                    <label style={{ fontSize: '0.78rem', color: '#6b7280' }}>Start</label>
                    <input type="date" value={editStart} onChange={e => setEditStart(e.target.value)}
                      style={{ ...S.inp, padding: '0.3rem 0.5rem', fontSize: '0.85rem', width: 'auto' }} />
                    <label style={{ fontSize: '0.78rem', color: '#6b7280' }}>End</label>
                    <input type="date" value={editEnd} onChange={e => setEditEnd(e.target.value)}
                      style={{ ...S.inp, padding: '0.3rem 0.5rem', fontSize: '0.85rem', width: 'auto' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button style={{ ...S.smallBtn, fontSize: '0.75rem', padding: '0.2rem 0.6rem' }} onClick={saveEdit}>✓ Apply</button>
                    <button style={{ ...S.smallOutlineBtn, fontSize: '0.75rem', padding: '0.2rem 0.6rem' }} onClick={cancelEdit}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, color: '#78350f', fontSize: '0.85rem', minWidth: 56 }}>Block {i + 1}</span>
                  {isCurrent && <span style={{ fontSize: '0.7rem', background: '#fef3c7', color: '#92400e', borderRadius: '0.3rem', padding: '0.1rem 0.4rem', fontWeight: 700 }}>▶ Current</span>}
                  {isPast && !isCurrent && <span style={{ fontSize: '0.7rem', background: '#f3f4f6', color: '#9ca3af', borderRadius: '0.3rem', padding: '0.1rem 0.4rem' }}>Done</span>}
                  {isFuture && <span style={{ fontSize: '0.7rem', background: '#eff6ff', color: '#3b82f6', borderRadius: '0.3rem', padding: '0.1rem 0.4rem' }}>Upcoming</span>}
                  <span style={{ flex: 1, color: '#374151', fontSize: '0.85rem' }}>
                    {fmtDate(b.startDate)} → {fmtDate(b.endDate)}
                    <span style={{ marginLeft: '0.5rem', color: '#9ca3af', fontSize: '0.78rem' }}>({blockDays(b)} days)</span>
                  </span>
                  <button style={{ ...S.smallOutlineBtn, fontSize: '0.72rem', padding: '0.18rem 0.5rem' }} onClick={() => startEdit(i)}>✏️ Edit</button>
                  {blocks.length > 1 && (
                    <button style={{ ...S.smallBtn, background: '#dc2626', boxShadow: 'none', fontSize: '0.72rem', padding: '0.18rem 0.5rem' }} onClick={() => removeBlock(i)}>✕</button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Playoffs indicator after last block */}
        {blocks.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: '0.65rem', border: '1.5px dashed #a78bfa', background: '#faf5ff', opacity: 0.9 }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#7c3aed' }}>🏆 Playoffs / Knockout</span>
            <span style={{ fontSize: '0.82rem', color: '#6b7280' }}>starts after Block {blocks.length} ({fmtDate(blocks[blocks.length - 1].endDate)})</span>
          </div>
        )}
        {blocks.length === 0 && (
          <p style={mutedText}>No blocks yet. Click "+ Add block" to create the schedule.</p>
        )}
      </div>

      <button style={S.smallBtn} disabled={saving || editIdx !== null} onClick={saveAll}>
        {saving ? 'Saving…' : '💾 Save schedule'}
      </button>
    </div>
  );
}



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
  const [activeTab, setActiveTab] = useState<'players' | 'rules' | 'schedule'>('players');

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(league.name);
  const [nameBusy, setNameBusy] = useState(false);

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

  const handleRename = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === league.name) { setEditingName(false); return; }
    setNameBusy(true);
    try {
      const res = await renameLeague(league.id, user.phone, trimmed);
      if (res.success) { onLeagueUpdate(res.league); setMessage('League renamed.'); }
      else setError(res.message || 'Failed to rename.');
    } catch { setError('Failed to rename.'); }
    setNameBusy(false);
    setEditingName(false);
  };

  return (
    <div style={{ border: '1px solid #fed7aa', borderRadius: '1rem', padding: '1.1rem', background: '#fff', display: 'grid', gap: '1rem' }}>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {editingName ? (
              <>
                <input
                  autoFocus
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') { setEditingName(false); setNameInput(league.name); } }}
                  style={{ ...S.inp, fontWeight: 700, color: '#78350f', fontSize: '1rem', flex: 1, minWidth: 0 }}
                  disabled={nameBusy}
                />
                <button style={{ ...S.smallBtn, padding: '0.25rem 0.6rem' }} onClick={handleRename} disabled={nameBusy}>{nameBusy ? '…' : '✓'}</button>
                <button style={{ ...S.smallOutlineBtn, padding: '0.25rem 0.6rem' }} onClick={() => { setEditingName(false); setNameInput(league.name); }}>✕</button>
              </>
            ) : (
              <>
                <strong style={{ color: '#78350f', fontSize: '1.05rem' }}>{league.name}</strong>
                <span style={statusPill(league.status)}>{league.status}</span>
                <button
                  onClick={() => { setNameInput(league.name); setEditingName(true); }}
                  title="Rename league"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '0.85rem', padding: '0.1rem 0.3rem', borderRadius: '0.35rem' }}
                >✏️</button>
              </>
            )}
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

      {/* tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #fde68a' }}>
        {((['players', 'rules', ...(['active','playoffs','completed'].includes(league.status) ? ['schedule'] : [])] as const)).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t as 'players' | 'rules' | 'schedule')}
            style={{
              padding: '0.5rem 1rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === t ? '3px solid #f59e0b' : '3px solid transparent',
              marginBottom: -2,
              color: activeTab === t ? '#92400e' : '#6b7280',
              fontWeight: activeTab === t ? 700 : 500,
              fontSize: '0.88rem',
              cursor: 'pointer',
            }}
          >
            {t === 'players' ? `👥 Players (${league.players.length})` : t === 'rules' ? '📋 League Rules' : '📅 Schedule'}
          </button>
        ))}
      </div>
      {/* Players tab */}
      {activeTab === 'players' && (
        <>
          <div>
            {league.players.length === 0
              ? <p style={mutedText}>No players yet.</p>
              : (
                <div style={{ display: 'grid', gap: '0.4rem' }}>
                  {/* Split into pending / ranked groups when in ranking phase */}
                  {league.status === 'ranking' && (() => {
                    const submitted = league.players.filter(p => !!league.stackRanks?.[p.id]).length;
                    const total = league.players.length;
                    const pct = total ? (submitted / total) * 100 : 0;
                    const pending = league.players.filter(p => !league.stackRanks?.[p.id]);
                    const ranked  = league.players.filter(p =>  !!league.stackRanks?.[p.id]);

                    const playerRow = (p: Player, done: boolean) => {
                      const isAdmin = adminSet.has(p.id);
                      const busy = busyId === `remove-${p.id}` || busyId === `admin-${p.id}`;
                      return (
                        <div key={p.id} style={{
                          display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '0.6rem',
                          background: done ? '#f0fdf4' : '#fff7ed',
                          border: `1.5px solid ${done ? '#86efac' : '#fdba74'}`,
                          borderLeft: `5px solid ${done ? '#22c55e' : '#f97316'}`,
                        }}>
                          {/* status dot */}
                          <div style={{ width: 10, height: 10, borderRadius: 999, background: done ? '#22c55e' : '#d1d5db', flexShrink: 0 }} />
                          <span style={{ flex: 1, color: '#1f2937', fontWeight: 600, fontSize: '0.92rem' }}>
                            {p.firstName} {p.lastName}
                            {isAdmin && <span style={{ marginLeft: '0.4rem', fontSize: '0.7rem', color: '#92400e', background: '#fef3c7', borderRadius: '0.3rem', padding: '0.1rem 0.3rem' }}>admin</span>}
                          </span>
                          <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>{p.phone}</span>
                          {!isAdmin && (
                            <button style={{ ...S.smallOutlineBtn, fontSize: '0.72rem', padding: '0.18rem 0.45rem' }} disabled={busy} onClick={() => handleMakeAdmin(p)}>☆ Admin</button>
                          )}
                          <button style={{ ...S.smallBtn, background: '#dc2626', boxShadow: 'none', fontSize: '0.72rem', padding: '0.18rem 0.45rem' }} disabled={busy} onClick={() => handleRemovePlayer(p)}>
                            {busyId === `remove-${p.id}` ? '…' : '✕'}
                          </button>
                        </div>
                      );
                    };

                    return (
                      <div style={{ display: 'grid', gap: '0.6rem' }}>
                        {/* progress bar */}
                        <div style={{ padding: '0.55rem 0.7rem', background: '#f9fafb', borderRadius: '0.65rem', border: '1px solid #e5e7eb' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#374151' }}>Ranking progress</span>
                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: submitted === total ? '#16a34a' : '#d97706' }}>
                              {submitted} / {total} submitted
                            </span>
                          </div>
                          <div style={{ height: 10, borderRadius: 999, background: '#e5e7eb', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: submitted === total ? '#16a34a' : '#22c55e', borderRadius: 999, transition: 'width 0.4s ease' }} />
                          </div>
                        </div>

                        {/* Pending section */}
                        {pending.length > 0 && (
                          <div style={{ display: 'grid', gap: '0.35rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <div style={{ flex: 1, height: 1, background: '#fed7aa' }} />
                              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#ea580c', background: '#fff7ed', border: '1px solid #fdba74', borderRadius: '99px', padding: '0.15rem 0.6rem', whiteSpace: 'nowrap' as const }}>
                                ⏳ Hasn't ranked — {pending.length}
                              </span>
                              <div style={{ flex: 1, height: 1, background: '#fed7aa' }} />
                            </div>
                            {pending.map(p => playerRow(p, false))}
                          </div>
                        )}

                        {/* Ranked section */}
                        {ranked.length > 0 && (
                          <div style={{ display: 'grid', gap: '0.35rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <div style={{ flex: 1, height: 1, background: '#bbf7d0' }} />
                              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#15803d', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '99px', padding: '0.15rem 0.6rem', whiteSpace: 'nowrap' as const }}>
                                ✓ Ranked — {ranked.length}
                              </span>
                              <div style={{ flex: 1, height: 1, background: '#bbf7d0' }} />
                            </div>
                            {ranked.map(p => playerRow(p, true))}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Normal player list when not in ranking phase */}
                  {league.status !== 'ranking' && league.players.map(p => {
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
                          <button style={{ ...S.smallOutlineBtn, fontSize: '0.75rem', padding: '0.2rem 0.5rem' }} disabled={busy} onClick={() => handleMakeAdmin(p)}>
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
        </>
      )}

      {/* Rules tab */}
      {activeTab === 'rules' && (
        <LeagueRulesEditor
          league={league}
          adminPhone={user.phone}
          onUpdated={onLeagueUpdate}
        />
      )}

      {/* Schedule tab */}
      {activeTab === 'schedule' && (
        <ScheduleEditor league={league} user={user} onLeagueUpdate={onLeagueUpdate} />
      )}
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
