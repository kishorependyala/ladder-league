import { useState } from 'react';
import { getDisplayName, teamAutoGroup, teamConfirm, type League, type Player, type User } from '../api';
import { S, mutedText, subheading, tableCell, tableHeadCell } from '../theme';

type Props = {
  league: League;
  user: User;
  onLeagueUpdated: (lg: League) => void;
};

type DraftTeam = { name: string; playerIds: string[] };

export default function TeamFormation({ league, user, onLeagueUpdated }: Props) {
  const [numTeams, setNumTeams] = useState(Math.max(2, Math.floor(league.players.length / 3)));
  const [singlesPerFixture, setSinglesPerFixture] = useState(2);
  const [doublesPerFixture, setDoublesPerFixture] = useState(1);
  const [teams, setTeams] = useState<DraftTeam[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [dragPlayer, setDragPlayer] = useState<string | null>(null);
  const [dragFromTeam, setDragFromTeam] = useState<number | null>(null);

  const playerMap: Record<string, Player> = Object.fromEntries(league.players.map(p => [p.id, p]));

  const handleAutoGroup = async () => {
    setLoading(true); setError(''); setMessage('');
    try {
      const res = await teamAutoGroup(league.id, user.phone, numTeams);
      if (!res.success) throw new Error(res.message || 'Failed');
      setTeams((res.teams ?? []).map(t => ({ name: t.name, playerIds: t.playerIds })));
      setMessage(`Auto-grouped ${res.totalPlayers} players into ${res.numTeams} teams. Adjust if needed, then confirm.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error auto-grouping');
    }
    setLoading(false);
  };

  const handleConfirm = async () => {
    if (!window.confirm(`Confirm ${teams.length} teams and generate round-robin fixtures?${unassigned.length > 0 ? `\n\n${unassigned.length} player(s) will not be assigned to any team.` : ''}`)) return;
    setConfirmLoading(true); setError('');
    try {
      const res = await teamConfirm(league.id, user.phone, teams, { singlesPerFixture, doublesPerFixture });
      if (!res.success) throw new Error(res.message || 'Failed');
      if (res.league) onLeagueUpdated(res.league);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error confirming teams');
    }
    setConfirmLoading(false);
  };

  const handleDrop = (toTeamIdx: number) => {
    if (dragPlayer === null || dragFromTeam === null || dragFromTeam === toTeamIdx) return;
    setTeams(prev => {
      const next = prev.map(t => ({ ...t, playerIds: [...t.playerIds] }));
      // Remove from source team (if dragging from a real team, not the unassigned pool)
      if (dragFromTeam >= 0) {
        next[dragFromTeam].playerIds = next[dragFromTeam].playerIds.filter(id => id !== dragPlayer);
      }
      // Add to destination team (if not dropping back to unassigned pool)
      if (toTeamIdx >= 0 && !next[toTeamIdx].playerIds.includes(dragPlayer)) {
        next[toTeamIdx].playerIds.push(dragPlayer);
      }
      return next;
    });
    setDragPlayer(null); setDragFromTeam(null);
  };

  const unassigned = league.players.filter(p => !teams.some(t => t.playerIds.includes(p.id)));

  return (
    <div style={{ display: 'grid', gap: '1.2rem' }}>
      <h3 style={subheading}>🏆 Team Formation</h3>

      {/* Settings */}
      <div style={{ ...S.card, display: 'grid', gap: '1rem', background: '#fffbeb' }}>
        <h4 style={{ margin: 0, color: '#92400e', fontWeight: 700 }}>Configure Teams</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
          <div style={S.fieldGroup}>
            <label style={S.label}>Number of teams</label>
            <input type="number" min={2} max={Math.floor(league.players.length / 2)} value={numTeams}
              onChange={e => setNumTeams(parseInt(e.target.value) || 2)} style={S.inp} />
          </div>
          <div style={S.fieldGroup}>
            <label style={S.label}>Singles per fixture</label>
            <input type="number" min={0} max={10} value={singlesPerFixture}
              onChange={e => setSinglesPerFixture(parseInt(e.target.value) || 0)} style={S.inp} />
          </div>
          <div style={S.fieldGroup}>
            <label style={S.label}>Doubles per fixture</label>
            <input type="number" min={0} max={10} value={doublesPerFixture}
              onChange={e => setDoublesPerFixture(parseInt(e.target.value) || 0)} style={S.inp} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button style={S.smallBtn} onClick={handleAutoGroup} disabled={loading}>
            {loading ? '⏳ Grouping…' : '🔀 Auto-group by ranking'}
          </button>
          <span style={{ ...mutedText, fontSize: '0.82rem' }}>
            {league.players.length} players → {numTeams} teams of ~{Math.ceil(league.players.length / numTeams)}
          </span>
        </div>
      </div>

      {error && <div style={S.errorBox}>{error}</div>}
      {message && <div style={S.infoBox}>{message}</div>}

      {/* Team cards */}
      {teams.length > 0 && (
        <>
          <p style={{ ...mutedText, fontSize: '0.82rem' }}>
            Drag players between teams to adjust. Each tier is shown by row colour.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.8rem' }}>
            {teams.map((team, ti) => (
              <div key={ti}
                onDragOver={e => e.preventDefault()}
                onDrop={() => handleDrop(ti)}
                style={{ border: '2px dashed #fed7aa', borderRadius: '0.85rem', padding: '0.8rem', background: '#fffbeb', minHeight: 120 }}>
                <input
                  value={team.name}
                  onChange={e => setTeams(prev => prev.map((t, i) => i === ti ? { ...t, name: e.target.value } : t))}
                  style={{ ...S.inp, fontWeight: 700, color: '#92400e', marginBottom: '0.5rem' }}
                />
                <div style={{ display: 'grid', gap: '0.3rem' }}>
                  {team.playerIds.map(pid => {
                    const p = playerMap[pid];
                    return p ? (
                      <div key={pid} draggable
                        onDragStart={() => { setDragPlayer(pid); setDragFromTeam(ti); }}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.6rem', background: '#fff', border: '1px solid #fde68a', borderRadius: '0.5rem', cursor: 'grab', fontSize: '0.88rem' }}>
                        <span>⠿</span>
                        <span style={{ fontWeight: 600, color: '#78350f' }}>{getDisplayName(p)}</span>
                      </div>
                    ) : null;
                  })}
                  {team.playerIds.length === 0 && <p style={{ ...mutedText, fontSize: '0.8rem' }}>Drop players here</p>}
                </div>
              </div>
            ))}
          </div>

          <div
            onDragOver={e => e.preventDefault()}
            onDrop={() => handleDrop(-1)}
            style={{ ...S.card, background: unassigned.length > 0 ? '#fef2f2' : '#f9fafb', border: `2px dashed ${unassigned.length > 0 ? '#fca5a5' : '#d1d5db'}`, minHeight: 60 }}>
            <p style={{ ...mutedText, fontWeight: 600, marginBottom: '0.4rem' }}>
              🚫 Unassigned / Sit out — drag players here to exclude from teams:
            </p>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {unassigned.length === 0
                ? <span style={{ ...mutedText, fontSize: '0.82rem' }}>No players sitting out</span>
                : unassigned.map(p => (
                  <div key={p.id} draggable
                    onDragStart={() => { setDragPlayer(p.id); setDragFromTeam(-1); }}
                    style={{ padding: '0.3rem 0.6rem', background: '#fff', border: '1px solid #fca5a5', borderRadius: '0.5rem', cursor: 'grab', fontSize: '0.85rem' }}>
                    {getDisplayName(p)}
                  </div>
                ))
              }
            </div>
          </div>

          {/* Summary table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 400 }}>
              <thead><tr>{['Team', 'Players', 'Count'].map(h => <th key={h} style={tableHeadCell}>{h}</th>)}</tr></thead>
              <tbody>
                {teams.map((t, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? '#fffbeb' : '#fff' }}>
                    <td style={{ ...tableCell, fontWeight: 700, color: '#92400e' }}>{t.name}</td>
                    <td style={tableCell}>{t.playerIds.map(id => getDisplayName(playerMap[id] ?? { id, firstName: id, lastName: '', phone: '' })).join(', ')}</td>
                    <td style={tableCell}>{t.playerIds.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button style={{ ...S.smallBtn, background: '#16a34a' }} onClick={handleConfirm} disabled={confirmLoading}>
              {confirmLoading ? '⏳ Confirming…' : `✅ Confirm ${teams.length} teams & generate fixtures${unassigned.length > 0 ? ` (${unassigned.length} sitting out)` : ''}`}
            </button>
            <button style={S.smallOutlineBtn} onClick={() => { setTeams([]); setMessage(''); }}>Reset</button>
          </div>
        </>
      )}
    </div>
  );
}
