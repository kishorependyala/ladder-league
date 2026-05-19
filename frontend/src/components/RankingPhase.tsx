import { useEffect, useMemo, useRef, useState } from 'react';
import { finalizeRanking, getDisplayName, getMyRoles, isLeagueJoinable, isLeagueMember, joinLeague, startLeague, submitRanking, type League, type Player, type RolesResponse, type User } from '../api';
import { S, mutedText, sectionTitle, statusPill, subheading } from '../theme';
import LeagueRulesSummary from './LeagueRulesSummary';

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
  const [selected, setSelected] = useState<number | null>(null); // tap-to-select index

  const touchDragIndex = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getMyRoles(user.phone).then(setRoles).catch(() => setRoles(null));
  }, [user.phone]);

  const playersById = useMemo(
    () => Object.fromEntries(league.players.map(p => [p.id, p])) as Record<string, Player>,
    [league.players],
  );

  // The player's actual ID within this league (may differ from user.id due to legacy data)
  const leaguePlayerId = useMemo(
    () => league.players.find(p => p.id === user.id || p.phone === user.phone)?.id ?? user.id,
    [league.players, user.id, user.phone],
  );

  useEffect(() => {
    // Always show the user's own saved vote first; fall back to finalRanking.
    // (The finalRanking overview is shown separately below, not in the personal vote UI.)
    const preferred = league.stackRanks[leaguePlayerId] || league.finalRanking;
    const fallback = league.players.map(p => p.id);
    const combined = (preferred.length ? preferred : fallback).filter(id => playersById[id]);
    const missing = fallback.filter(id => !combined.includes(id));
    setOrder([...combined, ...missing]);
  }, [league.finalRanking, league.players, league.stackRanks, league.status, playersById, leaguePlayerId]);

  const reorder = (from: number, to: number) => {
    if (from === to || to < 0 || to >= order.length) return;
    setOrder(cur => {
      const next = [...cur];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    setSelected(to);
  };

  const moveUp   = (i: number) => reorder(i, i - 1);
  const moveDown = (i: number) => reorder(i, i + 1);
  const moveTop  = (i: number) => reorder(i, 0);
  const moveBot  = (i: number) => reorder(i, order.length - 1);

  // ── Desktop drag ──────────────────────────────────────────────────
  const onDragStart = (i: number) => { setDragIndex(i); setSelected(null); };
  const onDragOver  = (e: React.DragEvent, i: number) => { e.preventDefault(); setDragOverIndex(i); };
  const onDrop      = (i: number) => { if (dragIndex !== null) reorder(dragIndex, i); setDragIndex(null); setDragOverIndex(null); };
  const onDragEnd   = () => { setDragIndex(null); setDragOverIndex(null); };

  // ── Touch drag (long-press move on mobile) ─────────────────────────
  const onTouchStart = (e: React.TouchEvent, i: number) => {
    touchDragIndex.current = i;
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

  const isAdmin    = Boolean(roles?.isSuperAdmin || roles?.adminLeagueIds.includes(league.id) || league.adminIds.includes(user.id));
  const isPlayer   = isLeagueMember(league, user);
  const canJoin    = !isPlayer && isLeagueJoinable(league);
  // Count only submissions from players currently in the league (ignores stale votes from removed players)
  const submissions = league.players.filter(p => league.stackRanks?.[p.id]).length;
  const hasSubmitted = Boolean(league.stackRanks?.[leaguePlayerId]);

  const handleJoin = async () => {
    setLoading(true); setError(''); setMessage('');
    try {
      const res = await joinLeague(league.id, user.phone);
      if (!res.success) { setError(res.message || 'Could not join league.'); setLoading(false); return; }
      onLeagueChange(res.league);
      setMessage('✓ Joined! You can now submit your ranking.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not join league.'); }
    setLoading(false);
  };

  const handleSubmit = async () => {
    setLoading(true); setError(''); setMessage('');
    try {
      const res = await submitRanking(league.id, user.phone, order);
      if (!res.success) { setError(res.message || 'Could not save ranking.'); setLoading(false); return; }
      onLeagueChange(res.league);
      if (res.allDone) setMessage('🎉 Everyone has submitted — the admin can now finalize.');
      else setMessage('✓ Ranking saved!');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not submit ranking.'); }
    setLoading(false);
  };

  const handleFinalize = async () => {
    setLoading(true); setError(''); setMessage('');
    try {
      const res = await finalizeRanking(league.id, user.phone, order);
      if (!res.success) { setError(res.message || 'Could not finalize ranking.'); setLoading(false); return; }
      onLeagueChange(res.league);
      setMessage('Final ranking saved.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not finalize.'); }
    setLoading(false);
  };

  const handleStartLeague = async () => {
    setLoading(true); setError(''); setMessage('');
    try {
      const res = await startLeague(league.id, user.phone);
      onLeagueChange(res.league);
      setMessage('League is now active.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not start league.'); }
    setLoading(false);
  };

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      {/* Header card */}
      <div style={{ ...S.card, display: 'grid', gap: '0.8rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <h2 style={sectionTitle}>{league.name}</h2>
            <p style={{ ...mutedText, marginTop: '0.3rem' }}>{league.sport} · {league.players.length} players</p>
          </div>
          <span style={statusPill(league.status)}>{league.status}</span>
        </div>

        {/* Compact rules summary */}
        <LeagueRulesSummary league={league} compact />

        {/* submission progress */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', alignItems: 'center' }}>
            <span style={{ ...mutedText, fontSize: '0.82rem' }}>Rankings submitted</span>
            <span style={{ fontWeight: 700, fontSize: '0.85rem', color: submissions === league.players.length ? '#16a34a' : '#78350f' }}>
              {submissions} / {league.players.length}
            </span>
          </div>
          {/* progress bar: green = submitted, gray = pending */}
          <div style={{ height: 10, borderRadius: 999, background: '#e5e7eb', overflow: 'hidden', marginBottom: '0.6rem' }}>
            <div style={{
              height: '100%',
              width: `${league.players.length ? (submissions / league.players.length) * 100 : 0}%`,
              background: submissions === league.players.length ? '#16a34a' : '#22c55e',
              borderRadius: 999,
              transition: 'width 0.4s ease',
            }} />
          </div>
          {/* per-player dots: green = submitted, gray = pending */}
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            {league.players.map(p => {
              const done = !!league.stackRanks?.[p.id];
              const isMe = p.id === leaguePlayerId;
              return (
                <div key={p.id} title={done ? `${getDisplayName(p)} ✓ submitted` : `${getDisplayName(p)} — pending`}
                  style={{
                    width: 30, height: 30, borderRadius: 999,
                    background: done ? '#22c55e' : '#d1d5db',
                    border: `2px solid ${isMe ? '#f59e0b' : done ? '#16a34a' : '#9ca3af'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.7rem', fontWeight: 700,
                    color: done ? '#fff' : '#6b7280',
                    boxShadow: isMe ? '0 0 0 2px rgba(245,158,11,0.4)' : 'none',
                  }}>
                  {done ? '✓' : isMe ? '!' : '·'}
                </div>
              );
            })}
          </div>
          {!hasSubmitted && isPlayer && (
            <p style={{ margin: '0.45rem 0 0', fontSize: '0.78rem', color: '#d97706', fontWeight: 600 }}>
              ⚠ You haven't submitted your ranking yet.
            </p>
          )}
        </div>

        {isPlayer && !hasSubmitted && (
          <div style={S.infoBox}>
            Rank from <strong>strongest → weakest</strong>. Tap a row to select it, then use the arrows — or drag on desktop. Rankings are private until finalized.
          </div>
        )}
        {isPlayer && hasSubmitted && <div style={S.successBox}>✓ Submitted — you can still update before the admin finalizes.</div>}
        {!isPlayer && canJoin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={S.infoBox} >You are not yet a player in this league.</div>
            <button style={S.primaryBtn} disabled={loading} onClick={handleJoin}>
              {loading ? 'Joining…' : '→ Join league'}
            </button>
          </div>
        )}
        {!isPlayer && !canJoin && <div style={S.infoBox}>You are not a player in this league — admin view only.</div>}
        {error && <div style={S.errorBox}>{error}</div>}
        {message && <div style={S.successBox}>{message}</div>}
      </div>

      {['draft', 'ranking', 'ranked'].includes(league.status) && (
        <div style={{ ...S.card, display: 'grid', gap: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h3 style={subheading}>
              Your ranking {hasSubmitted && <span style={{ fontSize: '0.78rem', color: '#16a34a', fontWeight: 400 }}>· saved</span>}
            </h3>
            <span style={{ ...mutedText, fontSize: '0.78rem' }}>Tap a card to select · use arrows to move</span>
          </div>

          <div ref={listRef} style={{ display: 'grid', gap: '0.5rem' }}>
            {order.map((playerId, index) => {
              const isMe = playerId === leaguePlayerId;
              const isDragging = dragIndex === index;
              const isOver = dragOverIndex === index && dragIndex !== index;
              const isSelected = selected === index;
              const player = playersById[playerId];

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
                  onClick={() => setSelected(isSelected ? null : index)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.7rem 0.75rem',
                    borderRadius: '0.9rem',
                    border: `2px solid ${isSelected ? '#f59e0b' : isOver ? '#fb923c' : isMe ? '#a3e635' : '#fed7aa'}`,
                    background: isSelected ? '#fef3c7' : isDragging ? '#fef9c3' : isOver ? '#fff7ed' : isMe ? '#f7fee7' : '#fff',
                    opacity: isDragging ? 0.45 : 1,
                    transition: 'border-color 0.12s, background 0.12s',
                    userSelect: 'none',
                    cursor: 'pointer',
                    boxShadow: isSelected ? '0 0 0 3px rgba(245,158,11,0.25)' : isOver ? '0 2px 8px rgba(251,146,60,0.2)' : 'none',
                    touchAction: 'none',
                  }}
                >
                  {/* rank badge */}
                  <div style={{
                    width: 38, height: 38, borderRadius: 999, flexShrink: 0,
                    background: index === 0 ? '#f59e0b' : index === 1 ? '#9ca3af' : index === 2 ? '#cd7f32' : '#e5e7eb',
                    color: index < 3 ? '#fff' : '#6b7280',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: '1rem',
                  }}>
                    {index + 1}
                  </div>

                  {/* name */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ color: '#1f2937', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.95rem' }}>
                      {getDisplayName(player)}{isMe ? ' 👤' : ''}
                    </strong>
                    {isSelected && (
                      <span style={{ fontSize: '0.72rem', color: '#d97706', fontWeight: 600 }}>selected · use arrows →</span>
                    )}
                  </div>

                  {/* move buttons — always visible, large touch targets */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    <button
                      onMouseDown={e => { e.stopPropagation(); moveUp(index); }}
                      onTouchEnd={e => { e.stopPropagation(); e.preventDefault(); moveUp(index); }}
                      disabled={index === 0}
                      title="Move up"
                      style={{
                        width: 36, height: 36, borderRadius: '0.5rem',
                        border: '1.5px solid #e5e7eb', background: index === 0 ? '#f9fafb' : '#fff',
                        color: index === 0 ? '#d1d5db' : '#374151',
                        fontSize: '1rem', cursor: index === 0 ? 'default' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, padding: 0, lineHeight: 1,
                      }}
                    >↑</button>
                    <button
                      onMouseDown={e => { e.stopPropagation(); moveDown(index); }}
                      onTouchEnd={e => { e.stopPropagation(); e.preventDefault(); moveDown(index); }}
                      disabled={index === order.length - 1}
                      title="Move down"
                      style={{
                        width: 36, height: 36, borderRadius: '0.5rem',
                        border: '1.5px solid #e5e7eb', background: index === order.length - 1 ? '#f9fafb' : '#fff',
                        color: index === order.length - 1 ? '#d1d5db' : '#374151',
                        fontSize: '1rem', cursor: index === order.length - 1 ? 'default' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, padding: 0, lineHeight: 1,
                      }}
                    >↓</button>
                  </div>

                  {/* extreme-move buttons when selected */}
                  {isSelected && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      <button
                        onMouseDown={e => { e.stopPropagation(); moveTop(index); }}
                        onTouchEnd={e => { e.stopPropagation(); e.preventDefault(); moveTop(index); }}
                        disabled={index === 0}
                        title="Move to top"
                        style={{ width: 36, height: 36, borderRadius: '0.5rem', border: '1.5px solid #fde68a', background: '#fef3c7', color: index === 0 ? '#d1d5db' : '#92400e', fontSize: '0.7rem', cursor: index === 0 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, padding: 0, lineHeight: 1.1, textAlign: 'center' }}
                      >⤒<br/>top</button>
                      <button
                        onMouseDown={e => { e.stopPropagation(); moveBot(index); }}
                        onTouchEnd={e => { e.stopPropagation(); e.preventDefault(); moveBot(index); }}
                        disabled={index === order.length - 1}
                        title="Move to bottom"
                        style={{ width: 36, height: 36, borderRadius: '0.5rem', border: '1.5px solid #fde68a', background: '#fef3c7', color: index === order.length - 1 ? '#d1d5db' : '#92400e', fontSize: '0.7rem', cursor: index === order.length - 1 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, padding: 0, lineHeight: 1.1, textAlign: 'center' }}
                      >⤓<br/>bot</button>
                    </div>
                  )}

                  {/* drag handle (desktop hint) */}
                  <div style={{ color: '#d1d5db', fontSize: '1.1rem', cursor: 'grab', paddingLeft: '0.15rem', userSelect: 'none', flexShrink: 0 }}>⠿</div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', paddingTop: '0.25rem' }}>
            {isPlayer && (
              <button style={S.primaryBtn} disabled={loading} onClick={handleSubmit}>
                {loading ? 'Saving…' : hasSubmitted ? '✓ Update ranking' : '✓ Submit ranking'}
              </button>
            )}
            {isAdmin && league.status !== 'draft' && (
              <button style={S.smallOutlineBtn} disabled={loading} onClick={handleFinalize}>Finalize (admin)</button>
            )}
          </div>
        </div>
      )}

      {league.status === 'ranked' && isAdmin && (
        <div style={{ ...S.card, display: 'grid', gap: '0.8rem' }}>
          <h3 style={subheading}>All rankings submitted</h3>
          <p style={mutedText}>Borda count has determined the final ranking. Review and start the league when ready.</p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button style={S.smallBtn} disabled={loading} onClick={handleStartLeague}>{loading ? 'Starting…' : 'Start league →'}</button>
            <button style={S.smallOutlineBtn} disabled={loading} onClick={handleFinalize}>Re-finalize (override)</button>
          </div>
        </div>
      )}

      {Object.keys(league.stackRanks || {}).length > 0 && (
        <RankingOverview league={league} playersById={playersById} userId={leaguePlayerId} />
      )}
    </div>
  );
}

// ── Anonymous ranking overview ─────────────────────────────────────────────

type RankingOverviewProps = {
  league: League;
  playersById: Record<string, Player>;
  userId: string;
};

function rankCellStyle(pos: number, n: number): React.CSSProperties {
  const t = n <= 1 ? 0 : (pos - 1) / (n - 1); // 0 = best, 1 = worst
  // green → amber → red gradient
  const r = Math.round(t < 0.5 ? 22 + (245 - 22) * (t * 2) : 245 + (220 - 245) * ((t - 0.5) * 2));
  const g = Math.round(t < 0.5 ? 163 + (158 - 163) * (t * 2) : 158 + (38 - 158) * ((t - 0.5) * 2));
  const b = Math.round(t < 0.5 ? 74 + (11 - 74) * (t * 2) : 11);
  return {
    background: `rgba(${r},${g},${b},0.15)`,
    color: `rgb(${r},${g},${b})`,
    fontWeight: 700,
    borderRadius: '0.45rem',
    textAlign: 'center' as const,
    padding: '0.35rem 0.2rem',
    fontSize: '0.82rem',
    minWidth: 32,
  };
}

function RankingOverview({ league, playersById, userId }: RankingOverviewProps) {
  const stackRanks = league.stackRanks || {};
  const n = league.players.length;

  // Stable-shuffle voter keys so no one can infer submission order from index
  // Use a simple deterministic shuffle seeded by league.id
  const voterKeys = useMemo(() => {
    // Only include votes from players currently in the league (skip stale entries from removed players)
    const currentPlayerIds = new Set(league.players.map(p => p.id));
    const keys = Object.keys(stackRanks).filter(k => currentPlayerIds.has(k)).sort();
    // Fisher-Yates seeded by sum of charCodes of league.id
    const seed = league.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const arr = [...keys];
    let s = seed;
    for (let i = arr.length - 1; i > 0; i--) {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      const j = Math.abs(s) % (i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [stackRanks, league.id]);

  // How many players haven't submitted yet (pending columns shown as grayed placeholders)
  const submittedIds = new Set(Object.keys(stackRanks));
  const pendingCount = league.players.filter(p => !submittedIds.has(p.id)).length;

  // Compute avg rank and final position per player
  const finalPositions: Record<string, number> = {};
  league.finalRanking.forEach((id, i) => { finalPositions[id] = i + 1; });

  // Order rows by finalRanking if available, then append any players added after ranking was saved
  const orderedPlayers = (() => {
    if (league.finalRanking.length > 0) {
      const fromRanking = league.finalRanking.map(id => playersById[id]).filter(Boolean) as Player[];
      const ranked = new Set(league.finalRanking);
      const unranked = league.players.filter(p => !ranked.has(p.id));
      return [...fromRanking, ...unranked];
    }
    return league.players;
  })();

  return (
    <div style={{ ...S.card, display: 'grid', gap: '1rem' }}>
      <div>
        <h3 style={subheading}>
          Rankings overview{' '}
          <span style={{ fontSize: '0.78rem', fontWeight: 400, color: '#9ca3af' }}>· votes are anonymous</span>
        </h3>
        <p style={{ ...mutedText, fontSize: '0.82rem', marginTop: '0.25rem' }}>
          Each column is one voter's ranking. Cells show the position they gave each player (1 = best). Final rank is the average position result.
          {pendingCount > 0 && (
            <span style={{ marginLeft: '0.5rem', color: '#d97706', fontWeight: 600 }}>
              · {voterKeys.length}/{league.players.length} submitted
            </span>
          )}
        </p>
      </div>

      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as unknown as undefined }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 300 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.4rem 0.5rem 0.4rem 0', fontSize: '0.78rem', color: '#9ca3af', fontWeight: 600, whiteSpace: 'nowrap', minWidth: 110 }}>Player</th>
              {voterKeys.map((_, i) => (
                <th key={i} style={{ padding: '0.4rem 0.25rem', fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600, textAlign: 'center', minWidth: 36 }}>
                  #{i + 1}
                </th>
              ))}
              {Array.from({ length: pendingCount }, (_, i) => (
                <th key={`pending-${i}`} style={{ padding: '0.4rem 0.25rem', fontSize: '0.75rem', color: '#d1d5db', fontWeight: 600, textAlign: 'center', minWidth: 36 }}>
                  ?
                </th>
              ))}
              <th style={{ padding: '0.4rem 0.25rem', fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600, textAlign: 'center', minWidth: 40 }}>Avg</th>
              {league.finalRanking.length > 0 && (
                <th style={{ padding: '0.4rem 0.25rem 0.4rem 0.5rem', fontSize: '0.75rem', color: '#78350f', fontWeight: 700, textAlign: 'center', minWidth: 48 }}>Final</th>
              )}
            </tr>
          </thead>
          <tbody>
            {orderedPlayers.map(player => {
              if (!player) return null;
              const positions = voterKeys.map(key => {
                const ranked = stackRanks[key] as string[];
                const idx = ranked.indexOf(player.id);
                return idx >= 0 ? idx + 1 : n + 1;
              });
              const avg = positions.length ? (positions.reduce((a, b) => a + b, 0) / positions.length) : null;
              const isMe = player.id === userId;
              return (
                <tr key={player.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '0.5rem 0.5rem 0.5rem 0', fontWeight: isMe ? 700 : 400, color: isMe ? '#78350f' : '#374151', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                    {getDisplayName(player)}{isMe ? ' 👤' : ''}
                  </td>
                  {positions.map((pos, i) => (
                    <td key={i} style={{ padding: '0.35rem 0.25rem' }}>
                      <div style={rankCellStyle(pos, n)}>{pos > n ? '—' : pos}</div>
                    </td>
                  ))}
                  {Array.from({ length: pendingCount }, (_, i) => (
                    <td key={`pending-${i}`} style={{ padding: '0.35rem 0.25rem' }}>
                      <div style={{ width: 28, height: 28, borderRadius: 6, background: '#f9fafb', border: '1px dashed #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', fontSize: '0.75rem', color: '#d1d5db' }}>—</div>
                    </td>
                  ))}
                  <td style={{ padding: '0.35rem 0.25rem' }}>
                    <div style={{ ...rankCellStyle(avg ?? n, n), opacity: 0.85, fontSize: '0.78rem' }}>
                      {avg !== null ? avg.toFixed(1) : '—'}
                    </div>
                  </td>
                  {league.finalRanking.length > 0 && (
                    <td style={{ padding: '0.35rem 0.25rem 0.35rem 0.5rem' }}>
                      <div style={{ width: 30, height: 30, borderRadius: 999, margin: '0 auto', background: finalPositions[player.id] === 1 ? '#f59e0b' : finalPositions[player.id] === 2 ? '#9ca3af' : finalPositions[player.id] === 3 ? '#cd7f32' : '#e5e7eb', color: (finalPositions[player.id] ?? 99) <= 3 ? '#fff' : '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.82rem' }}>
                        {finalPositions[player.id] ?? '—'}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default RankingPhase;
