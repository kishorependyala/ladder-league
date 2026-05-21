import { useCallback, useEffect, useState } from 'react';
import {
  createDoublesPair, deleteDoublesPair, getDisplayName, getDoublesStandings,
  type DoublesStandingsRow, type League, type Player, type User,
} from '../api';
import { S, mutedText, subheading, tableCell, tableHeadCell } from '../theme';

type Props = {
  league: League;
  user: User;
  isAdmin: boolean;
  onLeagueUpdated?: (league: League) => void;
};

export default function DoublesStandings({ league, user, isAdmin, onLeagueUpdated }: Props) {
  const doublesMode = league.rules?.doublesMode ?? 'none';
  const [standings, setStandings] = useState<DoublesStandingsRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Pair management state (admin only, fixed_pairs mode)
  const [showAddPair, setShowAddPair] = useState(false);
  const [newP1, setNewP1] = useState('');
  const [newP2, setNewP2] = useState('');
  const [newPairName, setNewPairName] = useState('');
  const [pairBusy, setPairBusy] = useState(false);
  const [pairError, setPairError] = useState('');

  const loadStandings = useCallback(async () => {
    if (doublesMode !== 'fixed_pairs') return;
    setLoading(true);
    setError('');
    try {
      const res = await getDoublesStandings(league.id);
      setStandings(res.standings ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load doubles standings.');
    }
    setLoading(false);
  }, [league.id, doublesMode]);

  useEffect(() => { loadStandings(); }, [loadStandings]);

  const handleAddPair = async () => {
    if (!newP1 || !newP2) { setPairError('Select both players.'); return; }
    if (newP1 === newP2) { setPairError('Players must be different.'); return; }
    setPairBusy(true);
    setPairError('');
    try {
      const res = await createDoublesPair(league.id, user.phone, newP1, newP2, newPairName || undefined);
      if (!res.success) throw new Error(res.message || 'Failed to create pair.');
      if (res.league) onLeagueUpdated?.(res.league);
      setNewP1('');
      setNewP2('');
      setNewPairName('');
      setShowAddPair(false);
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

  const pName = (id: string) => {
    const p = league.players.find(pl => pl.id === id);
    return p ? getDisplayName(p) : id;
  };

  // ── Adhoc mode: just show info banner ─────────────────────────────
  if (doublesMode === 'adhoc') {
    return (
      <div style={{ display: 'grid', gap: '0.8rem' }}>
        <h3 style={subheading}>🏸 Doubles</h3>
        <div style={S.infoBox}>
          <strong>Ad-hoc doubles mode</strong> — partners are chosen fresh each match.
          Points from doubles wins/losses are included in the main individual standings above.
        </div>
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '0.75rem', padding: '0.9rem 1rem', fontSize: '0.88rem', color: '#166534' }}>
          <strong>Rules:</strong>
          <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.25rem', display: 'grid', gap: '0.25rem' }}>
            <li>All 4 players must be members of this league</li>
            <li>All 4 players (or an admin) must approve each match result</li>
            <li>The same combination of 4 players may not play more than <strong>twice per week</strong></li>
            <li>Points from doubles count toward the main individual standings</li>
          </ul>
        </div>
      </div>
    );
  }

  // ── Fixed pairs mode ───────────────────────────────────────────────
  const pairs = league.doublesPairs ?? [];

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3 style={subheading}>🏸 Doubles Standings</h3>
        {isAdmin && (
          <button style={S.smallBtn} onClick={() => setShowAddPair(v => !v)}>
            {showAddPair ? 'Cancel' : '➕ Add pair'}
          </button>
        )}
      </div>

      {error && <div style={S.errorBox}>{error}</div>}

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

      {/* Pairs list with standings */}
      {loading ? (
        <p style={mutedText}>Loading doubles standings…</p>
      ) : standings.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 460 }}>
            <thead>
              <tr>
                {['Rank', 'Pair', 'W', 'L', 'Points'].map(h => (
                  <th key={h} style={tableHeadCell}>{h}</th>
                ))}
                {isAdmin && <th style={tableHeadCell} />}
              </tr>
            </thead>
            <tbody>
              {standings.map(row => (
                <tr key={row.pair.id} style={{ background: row.rank % 2 === 0 ? '#fffbeb' : '#fff' }}>
                  <td style={tableCell}>{row.rank}</td>
                  <td style={{ ...tableCell, fontWeight: 700 }}>
                    <span>{row.pair.name}</span>
                    <span style={{ ...mutedText, fontWeight: 400, fontSize: '0.8rem', display: 'block' }}>
                      {pName(row.pair.player1Id)} &amp; {pName(row.pair.player2Id)}
                    </span>
                  </td>
                  <td style={tableCell}>{row.wins}</td>
                  <td style={tableCell}>{row.losses}</td>
                  <td style={{ ...tableCell, color: '#d97706', fontWeight: 700 }}>{row.points}</td>
                  {isAdmin && (
                    <td style={tableCell}>
                      <button onClick={() => handleDeletePair(row.pair.id)} style={{ ...S.linkBtn, color: '#dc2626', fontSize: '0.78rem' }}>
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : pairs.length > 0 ? (
        <div style={{ display: 'grid', gap: '0.6rem' }}>
          <p style={mutedText}>No doubles matches played yet.</p>
          <div style={{ display: 'grid', gap: '0.4rem' }}>
            {pairs.map(pair => (
              <div key={pair.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.9rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '0.65rem' }}>
                <div>
                  <span style={{ fontWeight: 600, color: '#78350f' }}>{pair.name}</span>
                  <span style={{ ...mutedText, fontSize: '0.8rem', marginLeft: '0.5rem' }}>
                    {pName(pair.player1Id)} &amp; {pName(pair.player2Id)}
                  </span>
                </div>
                {isAdmin && (
                  <button onClick={() => handleDeletePair(pair.id)} style={{ ...S.linkBtn, color: '#dc2626', fontSize: '0.78rem' }}>
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p style={mutedText}>{isAdmin ? 'No pairs yet. Add a pair above to get started.' : 'No pairs have been created yet.'}</p>
      )}

      {doublesMode === 'fixed_pairs' && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '0.75rem', padding: '0.9rem 1rem', fontSize: '0.88rem', color: '#166534' }}>
          <strong>Rules:</strong>
          <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.25rem', display: 'grid', gap: '0.25rem' }}>
            <li>Fixed pairs compete as a unit — standings are tracked per pair</li>
            <li>All 4 players (or an admin) must approve each match result</li>
            <li>The same pair matchup may not play more than <strong>twice per week</strong></li>
          </ul>
        </div>
      )}
    </div>
  );
}
