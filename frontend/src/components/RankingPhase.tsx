import { useEffect, useMemo, useRef, useState } from 'react';
import { finalizeRanking, getDisplayName, getMyRoles, startLeague, submitRanking, type League, type Player, type RolesResponse, type User } from '../api';
import { S, mutedText, sectionTitle, statusPill, subheading } from '../theme';

type RankingPhaseProps = {
  league: League;
  user: User;
  onLeagueChange: (league: League) => void;
};

function RankingPhase({ league, user, onLeagueChange }: RankingPhaseProps) {
  const [roles, setRoles] = useState<RolesResponse | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // touch drag state
  const touchDragIndex = useRef<number | null>(null);
  const touchClientY = useRef<number>(0);

  useEffect(() => {
    getMyRoles(user.phone).then(setRoles).catch(() => setRoles(null));
  }, [user.phone]);

  const playersById = useMemo(
    () => Object.fromEntries(league.players.map(player => [player.id, player])) as Record<string, Player>,
    [league.players],
  );

  useEffect(() => {
    const preferred = league.stackRanks[user.id] || league.finalRanking;
    const fallback = league.players.map(player => player.id);
    const combined = (preferred.length ? preferred : fallback).filter(id => playersById[id]);
    const missing = fallback.filter(id => !combined.includes(id));
    setOrder([...combined, ...missing]);
  }, [league.finalRanking, league.players, league.stackRanks, playersById, user.id]);

  const reorder = (from: number, to: number) => {
    if (from === to) return;
    setOrder(current => {
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  // ── HTML5 drag handlers ────────────────────────────────────────
  const onDragStart = (index: number) => setDragIndex(index);
  const onDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };
  const onDrop = (index: number) => {
    if (dragIndex !== null) reorder(dragIndex, index);
    setDragIndex(null);
    setDragOverIndex(null);
  };
  const onDragEnd = () => { setDragIndex(null); setDragOverIndex(null); };

  // ── Touch handlers ─────────────────────────────────────────────
  const onTouchStart = (e: React.TouchEvent, index: number) => {
    touchDragIndex.current = index;
    touchClientY.current = e.touches[0].clientY;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    const el = document.elementFromPoint(e.touches[0].clientX, e.touches[0].clientY);
    const row = el?.closest('[data-rank-index]') as HTMLElement | null;
    if (row) setDragOverIndex(Number(row.dataset.rankIndex));
  };
  const onTouchEnd = () => {
    if (touchDragIndex.current !== null && dragOverIndex !== null)
      reorder(touchDragIndex.current, dragOverIndex);
    touchDragIndex.current = null;
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const isAdmin = Boolean(roles?.isSuperAdmin || roles?.adminLeagueIds.includes(league.id) || league.adminIds.includes(user.id));
  const submissions = Object.keys(league.stackRanks || {}).length;
  const hasSubmitted = Boolean(league.stackRanks?.[user.id]);

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const response = await submitRanking(league.id, user.phone, order);
      onLeagueChange(response.league);
      if (response.allDone) setMessage('🎉 Everyone has submitted — the admin can now finalize the ranking.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit ranking.');
    }
    setLoading(false);
  };

  const handleFinalize = async () => {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const response = await finalizeRanking(league.id, user.phone, order);
      onLeagueChange(response.league);
      setMessage('Final ranking saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not finalize ranking.');
    }
    setLoading(false);
  };

  const handleStartLeague = async () => {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const response = await startLeague(league.id, user.phone);
      onLeagueChange(response.league);
      setMessage('League is now active.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start league.');
    }
    setLoading(false);
  };

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <div style={{ ...S.card, display: 'grid', gap: '0.8rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <h2 style={sectionTitle}>{league.name}</h2>
            <p style={{ ...mutedText, marginTop: '0.3rem' }}>{league.sport} · {league.players.length} players</p>
          </div>
          <span style={statusPill(league.status)}>{league.status}</span>
        </div>

        {/* submission progress — one dot per player */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ ...mutedText, fontSize: '0.82rem' }}>Submitted</span>
            <span style={{ fontWeight: 700, color: '#78350f', fontSize: '0.85rem' }}>{submissions} / {league.players.length}</span>
          </div>
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            {league.players.map((player, i) => {
              const done = !!league.stackRanks?.[player.id];
              const isMe = player.id === user.id;
              return (
                <div key={player.id} title={done ? `${getDisplayName(player)} ✓` : `${getDisplayName(player)} — pending`} style={{ width: 32, height: 32, borderRadius: 999, background: done ? '#22c55e' : '#fde68a', border: `2px solid ${isMe ? '#f59e0b' : done ? '#16a34a' : '#fed7aa'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700, color: done ? '#fff' : '#92400e', flexShrink: 0 }}>
                  {done ? '✓' : i + 1}
                </div>
              );
            })}
          </div>
        </div>

        {!hasSubmitted && (
          <div style={S.infoBox}>
            Drag rows to rank from <strong>strongest (1)</strong> to <strong>weakest ({league.players.length})</strong>. Rankings are private — you can update yours until the admin finalizes.
          </div>
        )}
        {hasSubmitted && <div style={S.successBox}>✓ Ranking submitted — you can still drag to update before the admin finalizes.</div>}
        {error && <div style={S.errorBox}>{error}</div>}
        {message && <div style={S.successBox}>{message}</div>}
      </div>

      {league.status === 'draft' && (
        <div style={{ ...S.card, background: '#fffbeb', border: '1px solid #f59e0b' }}>
          <p style={{ color: '#92400e', fontSize: '0.9rem' }}>📋 You can rank players at any time until the admin finalizes the ranking.</p>
        </div>
      )}

      {['draft', 'ranking', 'ranked'].includes(league.status) && (
        <div style={{ ...S.card, display: 'grid', gap: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h3 style={subheading}>Your ranking {hasSubmitted && <span style={{ fontSize: '0.78rem', color: '#16a34a', fontWeight: 400 }}>· submitted</span>}</h3>
            <span style={{ ...mutedText, fontSize: '0.8rem' }}>☰ drag to reorder</span>
          </div>

          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {order.map((playerId, index) => {
              const isMe = playerId === user.id;
              const isDragging = dragIndex === index;
              const isOver = dragOverIndex === index;
              return (
                <div
                  key={playerId}
                  data-rank-index={index}
                  draggable
                  onDragStart={() => onDragStart(index)}
                  onDragOver={e => onDragOver(e, index)}
                  onDrop={() => onDrop(index)}
                  onDragEnd={onDragEnd}
                  onTouchStart={e => onTouchStart(e, index)}
                  onTouchMove={onTouchMove}
                  onTouchEnd={onTouchEnd}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '44px 1fr 32px',
                    gap: '0.75rem',
                    alignItems: 'center',
                    padding: '0.75rem 1rem',
                    borderRadius: '0.9rem',
                    border: `2px solid ${isOver ? '#f59e0b' : isMe ? '#a3e635' : '#fed7aa'}`,
                    background: isDragging ? '#fef3c7' : isOver ? '#fffbeb' : isMe ? '#f7fee7' : '#fff',
                    cursor: 'grab',
                    opacity: isDragging ? 0.5 : 1,
                    transition: 'border-color 0.15s, background 0.15s, opacity 0.15s',
                    userSelect: 'none',
                    boxShadow: isDragging ? '0 4px 12px rgba(0,0,0,0.12)' : isOver ? '0 2px 8px rgba(245,158,11,0.25)' : 'none',
                  }}
                >
                  {/* rank badge */}
                  <div style={{ width: 36, height: 36, borderRadius: 999, background: index === 0 ? '#f59e0b' : index === 1 ? '#9ca3af' : index === 2 ? '#cd7f32' : '#e5e7eb', color: index < 3 ? '#fff' : '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.95rem' }}>
                    {index + 1}
                  </div>

                  {/* name */}
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ color: '#78350f', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {getDisplayName(playersById[playerId])}{isMe ? ' 👤' : ''}
                    </strong>
                  </div>

                  {/* drag handle */}
                  <div style={{ color: '#d1d5db', fontSize: '1.1rem', textAlign: 'center', cursor: 'grab', lineHeight: 1 }}>⠿</div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', paddingTop: '0.25rem' }}>
            <button style={S.smallBtn} disabled={loading} onClick={handleSubmit}>
              {loading ? 'Saving…' : hasSubmitted ? 'Update ranking' : 'Submit ranking'}
            </button>
            {isAdmin && league.status !== 'draft' && (
              <button style={S.smallOutlineBtn} disabled={loading} onClick={handleFinalize}>Finalize ranking (admin)</button>
            )}
          </div>
        </div>
      )}

      {league.status === 'ranked' && isAdmin && (
        <div style={{ ...S.card, display: 'grid', gap: '0.8rem' }}>
          <h3 style={subheading}>All rankings submitted</h3>
          <p style={mutedText}>Borda count has determined the final ranking. Review below and start the league when ready.</p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button style={S.smallBtn} disabled={loading} onClick={handleStartLeague}>{loading ? 'Starting…' : 'Start league →'}</button>
            <button style={S.smallOutlineBtn} disabled={loading} onClick={handleFinalize}>Re-finalize (override)</button>
          </div>
        </div>
      )}

      {league.finalRanking.length > 0 && (
        <div style={{ ...S.card, display: 'grid', gap: '0.8rem' }}>
          <h3 style={subheading}>Final ranking</h3>
          <div style={{ display: 'grid', gap: '0.45rem' }}>
            {league.finalRanking.map((playerId, index) => (
              <div key={playerId} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '0.65rem 0.8rem', borderRadius: '0.8rem', background: playerId === user.id ? '#f7fee7' : '#fff', border: `1px solid ${playerId === user.id ? '#a3e635' : '#e5e7eb'}` }}>
                <div style={{ width: 28, height: 28, borderRadius: 999, background: index === 0 ? '#f59e0b' : index === 1 ? '#9ca3af' : index === 2 ? '#cd7f32' : '#e5e7eb', color: index < 3 ? '#fff' : '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.82rem', flexShrink: 0 }}>
                  {index + 1}
                </div>
                <span style={{ color: '#78350f', fontWeight: playerId === user.id ? 700 : 400 }}>
                  {getDisplayName(playersById[playerId])}{playerId === user.id ? ' 👤' : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default RankingPhase;
