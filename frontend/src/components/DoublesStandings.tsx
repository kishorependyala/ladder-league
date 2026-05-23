import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createDoublesPair, deleteDoublesPair, finalizeDoublesRanking, fixDoublesMatchTypes, getDisplayName,
  getDoublesStandings, submitDoublesRanking,
  type DoublesPair, type League, type Player, type User,
} from '../api';
import { S, mutedText, subheading, tableCell, tableHeadCell } from '../theme';

type Props = {
  league: League;
  user: User;
  isAdmin: boolean;
  onLeagueUpdated?: (league: League) => void;
};

// ── Shared helpers ──────────────────────────────────────────────────

function StandingsTable({ standings, pName, isAdmin, onDelete }: {
  standings: { pair: DoublesPair; rank: number; wins: number; losses: number; points: number; sets_won?: number; games_won?: number }[];
  pName: (id: string) => string;
  isAdmin: boolean;
  onDelete?: (pairId: string) => void;
}) {
  if (standings.length === 0) return null;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
        <thead>
          <tr>
            {['#', 'Pair', 'W', 'L', 'Sets', 'Games', 'Pts'].map(h => <th key={h} style={tableHeadCell}>{h}</th>)}
            {isAdmin && onDelete && <th style={tableHeadCell} />}
          </tr>
        </thead>
        <tbody>
          {standings.map(row => (
            <tr key={row.pair.id} style={{ background: row.rank % 2 === 0 ? '#fffbeb' : '#fff' }}>
              <td style={{ ...tableCell, color: '#92400e', fontWeight: 700 }}>{row.rank}</td>
              <td style={{ ...tableCell, fontWeight: 600 }}>
                {row.pair.name}
                <span style={{ ...mutedText, fontWeight: 400, fontSize: '0.8rem', display: 'block' }}>
                  {pName(row.pair.player1Id)} &amp; {pName(row.pair.player2Id)}
                </span>
              </td>
              <td style={{ ...tableCell, color: '#16a34a', fontWeight: 600 }}>{row.wins}</td>
              <td style={{ ...tableCell, color: '#dc2626' }}>{row.losses}</td>
              <td style={tableCell}>{row.sets_won ?? 0}</td>
              <td style={tableCell}>{row.games_won ?? 0}</td>
              <td style={{ ...tableCell, color: '#d97706', fontWeight: 700 }}>{row.points}</td>
              {isAdmin && onDelete && (
                <td style={tableCell}>
                  <button onClick={() => onDelete(row.pair.id)} style={{ ...S.linkBtn, color: '#dc2626', fontSize: '0.78rem' }}>Remove</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Pair ranking (drag-sortable vote, like singles) ──────────────────

function PairRankingVote({ league, user, isAdmin, pairs, onLeagueUpdated }: {
  league: League;
  user: User;
  isAdmin: boolean;
  pairs: DoublesPair[];
  onLeagueUpdated?: (league: League) => void;
}) {
  const leaguePlayerId = league.players.find(p => p.id === user.id || p.phone === user.phone)?.id ?? user.id;
  const myVote: string[] = league.doublesStackRanks?.[leaguePlayerId] ?? [];
  const finalRanking: string[] = league.doublesFinalRanking ?? [];

  const pairsById = Object.fromEntries(pairs.map(p => [p.id, p]));

  // Build initial order: my vote → finalRanking → pairs order
  const buildOrder = () => {
    const preferred = myVote.length ? myVote : finalRanking.length ? finalRanking : pairs.map(p => p.id);
    const combined = preferred.filter(id => pairsById[id]);
    const missing = pairs.map(p => p.id).filter(id => !combined.includes(id));
    return [...combined, ...missing];
  };

  const [order, setOrder] = useState<string[]>(buildOrder);
  const [submittedCount, setSubmittedCount] = useState(
    Object.keys(league.doublesStackRanks ?? {}).filter(vid =>
      league.players.some(p => p.id === vid)
    ).length
  );
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected === null) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (listRef.current && !listRef.current.contains(e.target as Node)) setSelected(null);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler, { passive: true });
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('touchstart', handler); };
  }, [selected]);

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

  const handleSubmit = async () => {
    setLoading(true); setError(''); setMessage('');
    try {
      const res = await submitDoublesRanking(league.id, user.phone, order);
      if (!res.success) throw new Error(res.message || 'Could not submit ranking.');
      if (res.league) onLeagueUpdated?.(res.league);
      setSubmittedCount(res.submittedCount ?? submittedCount);
      setMessage('Your ranking was saved!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error submitting ranking.');
    }
    setLoading(false);
  };

  const handleFinalize = async () => {
    setLoading(true); setError('');
    try {
      const res = await finalizeDoublesRanking(league.id, user.phone, order);
      if (!res.success) throw new Error(res.message || 'Could not finalize.');
      if (res.league) onLeagueUpdated?.(res.league);
      setMessage('Pair ranking finalized!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error finalizing ranking.');
    }
    setLoading(false);
  };

  const totalPlayers = league.players.length;

  return (
    <div style={{ display: 'grid', gap: '0.9rem' }}>
      <p style={{ ...mutedText, fontSize: '0.85rem' }}>
        Drag pairs into your preferred rank order, then submit. Rankings are combined across all players.
        <br />{submittedCount}/{totalPlayers} players have voted.
      </p>

      {finalRanking.length > 0 && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '0.75rem', padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#166534' }}>
          <strong>Current consensus ranking:</strong>{' '}
          {finalRanking.filter(id => pairsById[id]).map((id, i) => (
            <span key={id}>{i + 1}. {pairsById[id]?.name}{i < finalRanking.length - 1 ? ' · ' : ''}</span>
          ))}
        </div>
      )}

      <div ref={listRef} style={{ display: 'grid', gap: '0.4rem' }}>
        {order.map((pairId, i) => {
          const pair = pairsById[pairId];
          if (!pair) return null;
          const isSel = selected === i;
          const isDragging = dragIndex === i;
          const isDragOver = dragOverIndex === i;
          return (
            <div
              key={pairId}
              draggable
              onDragStart={() => { setDragIndex(i); setSelected(null); }}
              onDragOver={e => { e.preventDefault(); setDragOverIndex(i); }}
              onDrop={() => { if (dragIndex !== null) reorder(dragIndex, i); setDragIndex(null); setDragOverIndex(null); }}
              onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
              onClick={() => setSelected(isSel ? null : i)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.6rem',
                padding: '0.6rem 0.8rem', borderRadius: '0.65rem', cursor: 'grab', userSelect: 'none',
                border: `1px solid ${isSel ? '#f59e0b' : isDragOver ? '#fbbf24' : '#fde68a'}`,
                background: isDragging ? '#fef9c3' : isSel ? '#fffbeb' : '#fff',
                opacity: isDragging ? 0.5 : 1,
                boxShadow: isSel ? '0 0 0 2px #fbbf24' : undefined,
                transition: 'border-color 0.1s',
              }}
            >
              <span style={{ ...mutedText, fontSize: '0.75rem', minWidth: '1.2rem', textAlign: 'right' }}>#{i + 1}</span>
              <span style={{ flex: 1 }}>
                <span style={{ fontWeight: 600, color: '#78350f' }}>{pair.name}</span>
              </span>
              {isSel && (
                <span style={{ display: 'flex', gap: '0.25rem' }}>
                  <button onClick={e => { e.stopPropagation(); reorder(i, i - 1); }} disabled={i === 0} style={{ ...S.smallOutlineBtn, padding: '0.15rem 0.4rem', fontSize: '0.8rem' }}>▲</button>
                  <button onClick={e => { e.stopPropagation(); reorder(i, i + 1); }} disabled={i === order.length - 1} style={{ ...S.smallOutlineBtn, padding: '0.15rem 0.4rem', fontSize: '0.8rem' }}>▼</button>
                </span>
              )}
            </div>
          );
        })}
      </div>

      {error && <div style={S.errorBox}>{error}</div>}
      {message && <div style={S.infoBox}>{message}</div>}

      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <button style={S.smallBtn} onClick={handleSubmit} disabled={loading}>
          {loading ? '…' : '✓ Submit ranking'}
        </button>
        {isAdmin && (
          <button style={{ ...S.smallBtn, background: '#16a34a' }} onClick={handleFinalize} disabled={loading}>
            {loading ? '…' : '🏁 Finalize ranking'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────

export default function DoublesStandings({ league, user, isAdmin, onLeagueUpdated }: Props) {
  const doublesMode = league.rules?.doublesMode ?? 'none';
  const [standings, setStandings] = useState<{ pair: DoublesPair; rank: number; wins: number; losses: number; points: number; sets_won: number; games_won: number }[]>([]);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'standings' | 'ranking'>('standings');
  const [fixBusy, setFixBusy] = useState(false);
  const [fixMsg, setFixMsg] = useState('');

  // Pair management state (admin only, fixed_pairs mode)
  const [showAddPair, setShowAddPair] = useState(false);
  const [newP1, setNewP1] = useState('');
  const [newP2, setNewP2] = useState('');
  const [newPairName, setNewPairName] = useState('');
  const [pairBusy, setPairBusy] = useState(false);
  const [pairError, setPairError] = useState('');

  const loadStandings = useCallback(async () => {
    if (doublesMode === 'none') return;
    setStandingsLoading(true); setError('');
    try {
      const res = await getDoublesStandings(league.id);
      setStandings(res.standings ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load standings.');
    }
    setStandingsLoading(false);
  }, [league.id, doublesMode]);

  useEffect(() => { loadStandings(); }, [loadStandings]);

  const handleFixMatchTypes = async () => {
    setFixBusy(true); setFixMsg('');
    try {
      const res = await fixDoublesMatchTypes(league.id, user.phone);
      if (!res.success) throw new Error(res.message || 'Failed');
      setFixMsg(`Fixed ${res.fixed} of ${res.total} matches. Reloading standings…`);
      await loadStandings();
    } catch (err) {
      setFixMsg(err instanceof Error ? err.message : 'Error fixing matches.');
    }
    setFixBusy(false);
  };

  const pName = (id: string) => {
    const p = league.players.find((pl: Player) => pl.id === id);
    return p ? getDisplayName(p) : id;
  };

  const handleAddPair = async () => {
    if (!newP1 || !newP2) { setPairError('Select both players.'); return; }
    if (newP1 === newP2) { setPairError('Players must be different.'); return; }
    setPairBusy(true); setPairError('');
    try {
      const res = await createDoublesPair(league.id, user.phone, newP1, newP2, newPairName || undefined);
      if (!res.success) throw new Error(res.message || 'Failed to create pair.');
      if (res.league) onLeagueUpdated?.(res.league);
      setNewP1(''); setNewP2(''); setNewPairName(''); setShowAddPair(false);
      loadStandings();
    } catch (err) {
      setPairError(err instanceof Error ? err.message : 'Error creating pair.');
    }
    setPairBusy(false);
  };

  const handleDeletePair = async (pairId: string) => {
    if (!window.confirm('Remove this pair?')) return;
    try {
      const res = await deleteDoublesPair(league.id, pairId, user.phone);
      if (!res.success) throw new Error(res.message || 'Failed to delete pair.');
      if (res.league) onLeagueUpdated?.(res.league);
      loadStandings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error deleting pair.');
    }
  };

  const pairs = league.doublesPairs ?? [];

  // ── Ad-hoc mode ─────────────────────────────────────────────────
  if (doublesMode === 'adhoc') {
    return (
      <div style={{ display: 'grid', gap: '0.9rem' }}>
        <h3 style={subheading}>🏸 Doubles Standings</h3>
        {error && <div style={S.errorBox}>{error}</div>}
        {standingsLoading ? (
          <p style={mutedText}>Loading…</p>
        ) : standings.length === 0 ? (
          <p style={{ ...mutedText, fontStyle: 'italic' }}>No doubles matches played yet — rankings will appear here as pairs play.</p>
        ) : (
          <StandingsTable standings={standings} pName={pName} isAdmin={isAdmin} />
        )}
        {isAdmin && (
          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button style={{ ...S.smallOutlineBtn, fontSize: '0.78rem' }} disabled={fixBusy} onClick={handleFixMatchTypes}>
              {fixBusy ? '…' : '🔧 Fix legacy match types'}
            </button>
            {fixMsg && <span style={{ ...mutedText, fontSize: '0.8rem' }}>{fixMsg}</span>}
          </div>
        )}
      </div>
    );
  }

  // ── Fixed pairs mode ─────────────────────────────────────────────
  const tabBtn = (tab: typeof activeTab, label: string) => (
    <button
      style={{ ...S.smallOutlineBtn, ...(activeTab === tab ? { background: '#92400e', color: '#fff', borderColor: '#92400e' } : {}) }}
      onClick={() => setActiveTab(tab)}
    >{label}</button>
  );

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3 style={subheading}>🏸 Doubles Standings</h3>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {tabBtn('standings', 'Standings')}
          {tabBtn('ranking', 'Stack Ranking')}
          {isAdmin && activeTab === 'standings' && (
            <button style={S.smallBtn} onClick={() => setShowAddPair(v => !v)}>
              {showAddPair ? 'Cancel' : '➕ Add pair'}
            </button>
          )}
        </div>
      </div>

      {error && <div style={S.errorBox}>{error}</div>}

      {activeTab === 'standings' && (
        <>
          {isAdmin && showAddPair && (
            <div style={{ ...S.card, display: 'grid', gap: '0.75rem', background: '#fffbeb' }}>
              <h4 style={{ margin: 0, color: '#92400e', fontWeight: 700, fontSize: '0.95rem' }}>New doubles pair</h4>
              {pairError && <div style={S.errorBox}>{pairError}</div>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={S.fieldGroup}>
                  <label style={S.label}>Player 1</label>
                  <select value={newP1} onChange={e => setNewP1(e.target.value)} style={S.select}>
                    <option value="">Select…</option>
                    {league.players.filter((p: Player) => p.id !== newP2).map((p: Player) => (
                      <option key={p.id} value={p.id}>{getDisplayName(p)}</option>
                    ))}
                  </select>
                </div>
                <div style={S.fieldGroup}>
                  <label style={S.label}>Player 2</label>
                  <select value={newP2} onChange={e => setNewP2(e.target.value)} style={S.select}>
                    <option value="">Select…</option>
                    {league.players.filter((p: Player) => p.id !== newP1).map((p: Player) => (
                      <option key={p.id} value={p.id}>{getDisplayName(p)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={S.fieldGroup}>
                <label style={S.label}>Pair name (optional)</label>
                <input
                  value={newPairName}
                  onChange={e => setNewPairName(e.target.value)}
                  placeholder={newP1 && newP2 ? `${pName(newP1).split(' ')[1] ?? pName(newP1)}/${pName(newP2).split(' ')[1] ?? pName(newP2)}` : 'e.g. Smith/Jones'}
                  style={S.inp}
                />
              </div>
              <button style={S.smallBtn} disabled={pairBusy} onClick={handleAddPair}>
                {pairBusy ? 'Creating…' : 'Create pair'}
              </button>
            </div>
          )}

          {standingsLoading ? (
            <p style={mutedText}>Loading doubles standings…</p>
          ) : standings.length > 0 ? (
            <StandingsTable standings={standings} pName={pName} isAdmin={isAdmin} onDelete={handleDeletePair} />
          ) : pairs.length > 0 ? (
            <div style={{ display: 'grid', gap: '0.4rem' }}>
              <p style={mutedText}>No matches played yet.</p>
              {pairs.map(pair => (
                <div key={pair.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.9rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '0.65rem' }}>
                  <div>
                    <span style={{ fontWeight: 600, color: '#78350f' }}>{pair.name}</span>
                    <span style={{ ...mutedText, fontSize: '0.8rem', marginLeft: '0.5rem' }}>
                      {pName(pair.player1Id)} &amp; {pName(pair.player2Id)}
                    </span>
                  </div>
                  {isAdmin && (
                    <button onClick={() => handleDeletePair(pair.id)} style={{ ...S.linkBtn, color: '#dc2626', fontSize: '0.78rem' }}>Remove</button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p style={mutedText}>{isAdmin ? 'No pairs yet. Add a pair above to get started.' : 'No pairs have been created yet.'}</p>
          )}
          {isAdmin && (
            <div style={{ marginTop: '0.25rem', display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <button style={{ ...S.smallOutlineBtn, fontSize: '0.78rem' }} disabled={fixBusy} onClick={handleFixMatchTypes}>
                {fixBusy ? '…' : '🔧 Fix legacy match types'}
              </button>
              {fixMsg && <span style={{ ...mutedText, fontSize: '0.8rem' }}>{fixMsg}</span>}
            </div>
          )}
        </>
      )}

      {activeTab === 'ranking' && (
        pairs.length === 0 ? (
          <p style={mutedText}>No pairs registered yet — add pairs first before ranking.</p>
        ) : (
          <PairRankingVote
            league={league}
            user={user}
            isAdmin={isAdmin}
            pairs={pairs}
            onLeagueUpdated={onLeagueUpdated}
          />
        )
      )}
    </div>
  );
}


