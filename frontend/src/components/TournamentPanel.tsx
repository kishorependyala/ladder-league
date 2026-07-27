import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createTournament, deleteTournament, getDisplayName, getLeagueStandings, getTournament, getTournamentResults, setTournamentResultsWindow,
  type League, type StandingsRow, type Tournament, type TournamentGroup, type TournamentMatchup, type User,
} from '../api';
import { S, mutedText, subheading } from '../theme';

type Props = {
  league: League;
  user: User;
  isAdmin: boolean;
};

const SUPPORTED_COUNTS = [4, 5, 6, 8, 12];

function playerName(league: League, id: string | null | undefined): string {
  if (!id) return 'TBD';
  const p = league.players.find(pl => pl.id === id);
  return p ? getDisplayName(p) : id;
}

function initials(league: League, id: string | null | undefined): string {
  if (!id) return '?';
  const p = league.players.find(pl => pl.id === id);
  const name = p ? getDisplayName(p) : id;
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || name.slice(0, 2).toUpperCase();
}

/** Human label for a not-yet-determined matchup slot (e.g. "Group A 1st place"),
 * falling back to the player's actual name once known. */
function slotLabel(league: League, playerId: string | null | undefined, pendingText?: string): string {
  if (playerId) return playerName(league, playerId);
  return pendingText || 'TBD';
}

async function downloadAsImage(ref: HTMLElement | null, filename: string) {
  if (!ref) return;
  const html2canvas = (await import('html2canvas')).default;
  const canvas = await html2canvas(ref, { backgroundColor: '#0f172a', scale: 2.5 });
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function MatchupCard({ league, m, pendingA, pendingB }: { league: League; m: TournamentMatchup; pendingA?: string; pendingB?: string }) {
  const done = !!m.winnerId;
  const nameA = slotLabel(league, m.playerAId, pendingA);
  const nameB = slotLabel(league, m.playerBId, pendingB);
  return (
    <div style={{
      display: 'grid', gap: '0.3rem', padding: '0.55rem 0.7rem', borderRadius: '0.7rem',
      background: done ? 'linear-gradient(135deg,#ecfdf5,#f0fdf4)' : '#fff',
      border: `1px solid ${done ? '#a7f3d0' : '#e5e7eb'}`,
      boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
    }}>
      {m.label && <div style={{ fontSize: '0.68rem', color: '#d97706', fontWeight: 800, letterSpacing: '0.03em', textTransform: 'uppercase' }}>{m.label}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{
          width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.62rem', fontWeight: 700, color: '#fff', flexShrink: 0,
          background: m.winnerId === m.playerAId ? '#16a34a' : (m.playerAId ? '#94a3b8' : '#e5e7eb'),
        }}>{m.playerAId ? initials(league, m.playerAId) : '?'}</span>
        <span style={{ flex: 1, fontSize: '0.86rem', fontWeight: m.winnerId === m.playerAId ? 800 : 500, color: m.winnerId === m.playerAId ? '#166534' : (m.playerAId ? '#1f2937' : '#9ca3af') }}>
          {nameA}
        </span>
        {done && m.winnerId === m.playerAId && <span style={{ fontSize: '0.65rem' }}>🏆</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.65rem', color: '#cbd5e1', fontWeight: 700, paddingLeft: 30 }}>
        <div style={{ flex: 1, height: 1, background: '#f1f5f9' }} />
        vs
        <div style={{ flex: 1, height: 1, background: '#f1f5f9' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{
          width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.62rem', fontWeight: 700, color: '#fff', flexShrink: 0,
          background: m.winnerId === m.playerBId ? '#16a34a' : (m.playerBId ? '#94a3b8' : '#e5e7eb'),
        }}>{m.playerBId ? initials(league, m.playerBId) : '?'}</span>
        <span style={{ flex: 1, fontSize: '0.86rem', fontWeight: m.winnerId === m.playerBId ? 800 : 500, color: m.winnerId === m.playerBId ? '#166534' : (m.playerBId ? '#1f2937' : '#9ca3af') }}>
          {nameB}
        </span>
        {done && m.winnerId === m.playerBId && <span style={{ fontSize: '0.65rem' }}>🏆</span>}
      </div>
    </div>
  );
}

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th'];

function groupRankSide(fromGroupRank: { group: string; rank: number }[] | undefined, side: 0 | 1): string | undefined {
  const fg = fromGroupRank?.[side];
  if (!fg) return undefined;
  return `${fg.group} ${ORDINALS[fg.rank - 1] || `#${fg.rank}`} place`;
}

function GroupCard({ league, group }: { league: League; group: TournamentGroup }) {
  return (
    <div style={{ borderRadius: '0.9rem', padding: '0.9rem', display: 'grid', gap: '0.6rem', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{
          fontWeight: 800, color: '#fff', fontSize: '0.78rem', padding: '0.2rem 0.6rem', borderRadius: '999px',
          background: 'linear-gradient(135deg,#f59e0b,#d97706)',
        }}>{group.name}</span>
        <span style={{ ...mutedText, fontWeight: 500, fontSize: '0.72rem' }}>{group.type === 'roundrobin' ? 'ROUND ROBIN' : 'KNOCKOUT'}</span>
      </div>
      {group.rounds.map(r => (
        <div key={r.roundIndex} style={{ display: 'grid', gap: '0.4rem' }}>
          <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ background: '#e2e8f0', borderRadius: '0.4rem', padding: '0.1rem 0.4rem' }}>
              {new Date(r.startsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}–{new Date(r.endsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
            </span>
            {r.label}
            {r.byePlayerId && <span style={{ color: '#94a3b8', fontWeight: 500 }}>· Bye: {playerName(league, r.byePlayerId)}</span>}
          </div>
          <div style={{ display: 'grid', gap: '0.4rem' }}>
            {r.matches.map(m => (
              <MatchupCard key={m.matchupId} league={league} m={m} pendingA={m.pendingA} pendingB={m.pendingB} />
            ))}
          </div>
        </div>
      ))}
      {group.standings && (
        <div style={{ display: 'grid', gap: '0.2rem', borderTop: '1px dashed #fde68a', paddingTop: '0.5rem' }}>
          {group.standings.map(s => (
            <div key={s.playerId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span>#{s.rank} {playerName(league, s.playerId)}</span>
              <span style={{ color: '#6b7280' }}>{s.wins}W - {s.losses}L</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TournamentPanel({ league, user, isAdmin }: Props) {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [scheduledDate, setScheduledDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [matchMinutes, setMatchMinutes] = useState(30);
  const [finalsMinutes, setFinalsMinutes] = useState(45);

  const [windowStart, setWindowStart] = useState('');
  const [windowEnd, setWindowEnd] = useState('');
  const [results, setResults] = useState<Tournament | null>(null);
  const [standings, setStandings] = useState<StandingsRow[]>([]);

  const scheduleRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getLeagueStandings(league.id).then(res => setStandings(res.standings || [])).catch(() => setStandings([]));
  }, [league.id]);

  const rankOf = useCallback((pid: string) => standings.find(s => s.player.id === pid)?.rank, [standings]);

  const refresh = useCallback(() => {
    setLoading(true);
    getTournament(league.id)
      .then(res => {
        if (res.success) {
          setTournament(res.tournament);
          if (res.tournament) {
            setSelected(res.tournament.playerIds);
            setScheduledDate(res.tournament.scheduledDate);
            setStartTime(res.tournament.startTime);
            setMatchMinutes(res.tournament.matchDurationMinutes);
            setFinalsMinutes(res.tournament.finalsDurationMinutes);
            if (res.tournament.resultsWindow) {
              setWindowStart(res.tournament.resultsWindow.startDate);
              setWindowEnd(res.tournament.resultsWindow.endDate);
            }
          }
        }
      })
      .finally(() => setLoading(false));
  }, [league.id]);

  useEffect(() => { refresh(); }, [refresh]);

  const togglePlayer = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  const handleGenerate = async () => {
    setError(''); setMessage('');
    if (!SUPPORTED_COUNTS.includes(selected.length)) {
      setError(`Pick exactly 4, 5, 6, 8, or 12 players (currently ${selected.length} selected).`);
      return;
    }
    if (!scheduledDate) { setError('Pick an expected play date.'); return; }
    setBusy(true);
    try {
      const res = await createTournament(league.id, user.phone, selected, scheduledDate, startTime, matchMinutes, finalsMinutes);
      if (res.success) {
        setTournament(res.tournament ?? null);
        setShowForm(false);
        setMessage('✅ Tournament schedule created.');
      } else {
        setError(res.message || 'Failed to create tournament.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this tournament? This does not delete any match scores.')) return;
    setBusy(true);
    try {
      const res = await deleteTournament(league.id, user.phone);
      if (res.success) { setTournament(null); setResults(null); setMessage('Tournament removed.'); }
      else setError(res.message || 'Failed to delete tournament.');
    } finally {
      setBusy(false);
    }
  };

  const handleSetWindow = async () => {
    setError(''); setMessage('');
    if (!windowStart || !windowEnd) { setError('Pick a start and end date.'); return; }
    setBusy(true);
    try {
      const res = await setTournamentResultsWindow(league.id, user.phone, windowStart, windowEnd);
      if (res.success) setTournament(res.tournament ?? null);
      else setError(res.message || 'Failed to set results window.');
    } finally {
      setBusy(false);
    }
  };

  const handleComputeResults = async () => {
    setError(''); setMessage('');
    setBusy(true);
    try {
      const res = await getTournamentResults(league.id);
      if (res.success) setResults(res.tournament ?? null);
      else setError(res.message || 'Failed to compute final results.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p style={mutedText}>Loading tournament…</p>;

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {message && <div style={{ ...S.card, background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '0.6rem 0.9rem', fontSize: '0.85rem', color: '#166534' }}>{message}</div>}
      {error && <div style={S.errorBox}>{error}</div>}

      {isAdmin && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button style={S.smallBtn} disabled={busy} onClick={() => setShowForm(v => !v)}>
            {tournament ? '✏️ Edit / Regenerate' : '➕ Create Tournament'}
          </button>
          {tournament && (
            <button style={{ ...S.smallOutlineBtn, color: '#dc2626', borderColor: '#fca5a5' }} disabled={busy} onClick={handleDelete}>
              🗑️ Delete Tournament
            </button>
          )}
        </div>
      )}

      {isAdmin && showForm && (
        <div style={{ ...S.card, display: 'grid', gap: '0.7rem' }}>
          <p style={{ ...subheading, margin: 0 }}>Pick players ({selected.length} selected — need 4, 5, 6, 8 or 12)</p>
          <p style={{ ...mutedText, fontSize: '0.78rem', margin: 0 }}>Sorted by current active ranking — seeding will follow this order.</p>
          <div style={{ display: 'grid', gap: '0.3rem', maxHeight: 260, overflowY: 'auto' }}>
            {[...league.players].sort((a, b) => (rankOf(a.id) ?? 999) - (rankOf(b.id) ?? 999)).map(p => (
              <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem', padding: '0.2rem 0' }}>
                <input type="checkbox" checked={selected.includes(p.id)} onChange={() => togglePlayer(p.id)} />
                <span style={{ ...mutedText, fontSize: '0.75rem', width: 28 }}>{rankOf(p.id) ? `#${rankOf(p.id)}` : ''}</span>
                {getDisplayName(p)}
              </label>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            <label style={{ display: 'grid', gap: '0.2rem', fontSize: '0.8rem', color: '#6b7280' }}>
              Expected play date
              <input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} style={S.inp} />
            </label>
            <label style={{ display: 'grid', gap: '0.2rem', fontSize: '0.8rem', color: '#6b7280' }}>
              Start time
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={S.inp} />
            </label>
            <label style={{ display: 'grid', gap: '0.2rem', fontSize: '0.8rem', color: '#6b7280' }}>
              Match duration (minutes)
              <input type="number" min={10} value={matchMinutes} onChange={e => setMatchMinutes(Number(e.target.value))} style={S.inp} />
            </label>
            <label style={{ display: 'grid', gap: '0.2rem', fontSize: '0.8rem', color: '#6b7280' }}>
              Final/placement match duration (minutes)
              <input type="number" min={10} value={finalsMinutes} onChange={e => setFinalsMinutes(Number(e.target.value))} style={S.inp} />
            </label>
          </div>
          <button style={S.primaryBtn} disabled={busy} onClick={handleGenerate}>
            {busy ? 'Generating…' : (tournament ? 'Regenerate Bracket' : 'Generate Bracket')}
          </button>
        </div>
      )}

      {!tournament && !showForm && <p style={mutedText}>No tournament has been set up yet.</p>}

      {tournament && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ ...subheading, margin: 0 }}>🏆 Tournament Schedule</p>
            <button style={S.smallOutlineBtn} onClick={() => downloadAsImage(scheduleRef.current, `${league.name}-tournament-schedule.png`)}>
              📷 Download Image
            </button>
          </div>
          <div ref={scheduleRef} style={{ background: '#0f172a', padding: '1rem', borderRadius: '1.1rem', display: 'grid', gap: '0.9rem' }}>
            <div style={{
              borderRadius: '0.9rem', padding: '0.9rem 1.1rem',
              background: 'linear-gradient(120deg,#f59e0b,#ea580c 55%,#dc2626)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem',
            }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: '1.15rem', color: '#fff' }}>🏆 {league.name}</div>
                <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.78rem', fontWeight: 600, marginTop: '0.15rem' }}>
                  Tournament Schedule · {tournament.groups.length} Group{tournament.groups.length > 1 ? 's' : ''} · {tournament.playerIds.length} Players
                </div>
              </div>
              <div style={{ color: '#fff', fontSize: '0.78rem', fontWeight: 700, background: 'rgba(255,255,255,0.18)', padding: '0.3rem 0.7rem', borderRadius: '999px' }}>
                {new Date(tournament.scheduledDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · {tournament.startTime}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(tournament.groups.length, 3)}, 1fr)`, gap: '0.8rem' }}>
              {tournament.groups.map(g => <GroupCard key={g.name} league={league} group={g} />)}
            </div>
            {tournament.stage2 && (
              <div style={{ borderRadius: '0.9rem', padding: '0.8rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'grid', gap: '0.5rem' }}>
                <div style={{ fontWeight: 800, color: '#fbbf24', fontSize: '0.8rem', letterSpacing: '0.03em', textTransform: 'uppercase' }}>⚔️ Placement Matches</div>
                {tournament.stage2.rounds.map(r => (
                  <div key={r.roundIndex} style={{ display: 'grid', gridTemplateColumns: `repeat(${r.matches.length}, 1fr)`, gap: '0.5rem' }}>
                    {r.matches.map(m => (
                      <MatchupCard
                        key={m.matchupId} league={league} m={m}
                        pendingA={groupRankSide(m.fromGroupRank, 0)} pendingB={groupRankSide(m.fromGroupRank, 1)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
            {tournament.finalRanking && tournament.finalRanking.some(id => {
              const g = tournament.groups.find(gr => gr.playerIds.includes(id));
              return g?.standings?.length;
            }) && (
              <div style={{ borderRadius: '0.9rem', padding: '0.8rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontWeight: 800, color: '#fbbf24', fontSize: '0.8rem', letterSpacing: '0.03em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>📊 Current Overall Ranking</div>
                <div style={{ display: 'grid', gap: '0.3rem' }}>
                  {tournament.finalRanking.map((id, i) => (
                    <div key={id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#e2e8f0' }}>
                      <span style={{ width: 20, textAlign: 'right', color: '#94a3b8', fontWeight: 700, fontSize: '0.75rem' }}>{i + 1}.</span>
                      {playerName(league, id)}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              🏆 Ladder League
            </div>
          </div>

          {isAdmin && (
            <div style={{ ...S.card, display: 'grid', gap: '0.6rem' }}>
              <p style={{ ...subheading, margin: 0 }}>Final Results Date Range</p>
              <p style={{ ...mutedText, fontSize: '0.8rem' }}>Set the date range of matches played for this tournament to lock in final standings.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                <input type="date" value={windowStart} onChange={e => setWindowStart(e.target.value)} style={S.inp} />
                <input type="date" value={windowEnd} onChange={e => setWindowEnd(e.target.value)} style={S.inp} />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button style={S.smallBtn} disabled={busy} onClick={handleSetWindow}>Save Date Range</button>
                <button style={S.smallOutlineBtn} disabled={busy || !tournament.resultsWindow} onClick={handleComputeResults}>Compute Final Results</button>
              </div>
            </div>
          )}

          {!isAdmin && tournament.resultsWindow && (
            <button style={S.smallOutlineBtn} disabled={busy} onClick={handleComputeResults}>🏁 View Final Results</button>
          )}

          {results && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ ...subheading, margin: 0 }}>🏁 Final Standings & Playoffs</p>
                <button style={S.smallOutlineBtn} onClick={() => downloadAsImage(resultsRef.current, `${league.name}-tournament-results.png`)}>
                  📷 Download Image
                </button>
              </div>
              <div ref={resultsRef} style={{ background: '#0f172a', padding: '1rem', borderRadius: '1.1rem', display: 'grid', gap: '0.9rem' }}>
                <div style={{
                  borderRadius: '0.9rem', padding: '0.9rem 1.1rem',
                  background: 'linear-gradient(120deg,#7c3aed,#4f46e5 55%,#0ea5e9)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem',
                }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '1.15rem', color: '#fff' }}>🏁 {league.name}</div>
                    <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.78rem', fontWeight: 600, marginTop: '0.15rem' }}>Final Standings &amp; Playoffs</div>
                  </div>
                  <div style={{ color: '#fff', fontSize: '0.78rem', fontWeight: 700, background: 'rgba(255,255,255,0.18)', padding: '0.3rem 0.7rem', borderRadius: '999px' }}>
                    {results.resultsWindow?.startDate} → {results.resultsWindow?.endDate}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(results.groups.length, 3)}, 1fr)`, gap: '0.8rem' }}>
                  {results.groups.map(g => <GroupCard key={g.name} league={league} group={g} />)}
                </div>
                {results.stage2 && (
                  <div style={{ borderRadius: '0.9rem', padding: '0.8rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'grid', gap: '0.5rem' }}>
                    <div style={{ fontWeight: 800, color: '#a78bfa', fontSize: '0.8rem', letterSpacing: '0.03em', textTransform: 'uppercase' }}>⚔️ Placement Results</div>
                    {results.stage2.rounds.map(r => (
                      <div key={r.roundIndex} style={{ display: 'grid', gridTemplateColumns: `repeat(${r.matches.length}, 1fr)`, gap: '0.5rem' }}>
                        {r.matches.map(m => (
                          <MatchupCard
                            key={m.matchupId} league={league} m={m}
                            pendingA={groupRankSide(m.fromGroupRank, 0)} pendingB={groupRankSide(m.fromGroupRank, 1)}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                )}
                {results.finalRanking && (
                  <div style={{ borderRadius: '0.9rem', padding: '0.9rem', background: 'linear-gradient(135deg,rgba(251,191,36,0.12),rgba(255,255,255,0.03))', border: '1px solid rgba(251,191,36,0.3)' }}>
                    <div style={{ fontWeight: 800, color: '#fbbf24', fontSize: '0.95rem', marginBottom: '0.5rem' }}>🏆 Final Overall Ranking</div>
                    <div style={{ display: 'grid', gap: '0.35rem' }}>
                      {results.finalRanking.map((id, i) => (
                        <div key={id} style={{
                          display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.35rem 0.5rem', borderRadius: '0.5rem',
                          background: i === 0 ? 'rgba(251,191,36,0.15)' : 'transparent',
                        }}>
                          <span style={{ fontSize: i < 3 ? '1rem' : '0.8rem' }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                          <span style={{ color: '#f1f5f9', fontWeight: i < 3 ? 800 : 500, fontSize: '0.9rem' }}>{playerName(league, id)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  🏆 Ladder League
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
