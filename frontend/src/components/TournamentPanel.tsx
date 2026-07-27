import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createTournament, deleteTournament, getDisplayName, getTournament, getTournamentResults, setTournamentResultsWindow,
  type League, type Tournament, type TournamentGroup, type TournamentMatchup, type User,
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

async function downloadAsImage(ref: HTMLElement | null, filename: string) {
  if (!ref) return;
  const html2canvas = (await import('html2canvas')).default;
  const canvas = await html2canvas(ref, { backgroundColor: '#ffffff', scale: 2 });
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function MatchupCard({ league, m, highlight }: { league: League; m: TournamentMatchup; highlight?: string }) {
  const done = !!m.winnerId;
  return (
    <div style={{
      display: 'grid', gap: '0.15rem', padding: '0.5rem 0.7rem', borderRadius: '0.6rem',
      background: done ? '#f0fdf4' : '#fffbeb', border: `1px solid ${done ? '#bbf7d0' : '#fde68a'}`,
    }}>
      {m.label && <div style={{ fontSize: '0.72rem', color: '#92400e', fontWeight: 700 }}>{m.label}</div>}
      {highlight && <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>{highlight}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', fontSize: '0.88rem' }}>
        <span style={{ fontWeight: m.winnerId === m.playerAId ? 800 : 500, color: m.winnerId === m.playerAId ? '#166534' : '#374151' }}>
          {playerName(league, m.playerAId)}
        </span>
        <span style={{ color: '#9ca3af' }}>vs</span>
        <span style={{ fontWeight: m.winnerId === m.playerBId ? 800 : 500, color: m.winnerId === m.playerBId ? '#166534' : '#374151' }}>
          {playerName(league, m.playerBId)}
        </span>
      </div>
    </div>
  );
}

function GroupCard({ league, group }: { league: League; group: TournamentGroup }) {
  return (
    <div style={{ border: '1px solid #fed7aa', borderRadius: '0.75rem', padding: '0.8rem', display: 'grid', gap: '0.6rem', background: '#fff' }}>
      <div style={{ fontWeight: 800, color: '#92400e' }}>{group.name} <span style={{ ...mutedText, fontWeight: 400, fontSize: '0.78rem' }}>({group.type === 'roundrobin' ? 'Round Robin' : 'Knockout'})</span></div>
      {group.rounds.map(r => (
        <div key={r.roundIndex} style={{ display: 'grid', gap: '0.4rem' }}>
          <div style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 }}>
            {r.label} · {new Date(r.startsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}–{new Date(r.endsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
            {r.byePlayerId && <span> · Bye: {playerName(league, r.byePlayerId)}</span>}
          </div>
          <div style={{ display: 'grid', gap: '0.4rem' }}>
            {r.matches.map(m => <MatchupCard key={m.matchupId} league={league} m={m} />)}
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

  const scheduleRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

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
          <div style={{ display: 'grid', gap: '0.3rem', maxHeight: 220, overflowY: 'auto' }}>
            {league.players.map(p => (
              <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem', padding: '0.2rem 0' }}>
                <input type="checkbox" checked={selected.includes(p.id)} onChange={() => togglePlayer(p.id)} />
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
          <div ref={scheduleRef} style={{ background: '#fff', padding: '1rem', borderRadius: '0.9rem', display: 'grid', gap: '0.8rem' }}>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#92400e' }}>{league.name} — Tournament</div>
            <div style={{ ...mutedText, fontSize: '0.82rem' }}>
              {tournament.scheduledDate} starting {tournament.startTime} · {tournament.groups.length} group(s)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(tournament.groups.length, 3)}, 1fr)`, gap: '0.8rem' }}>
              {tournament.groups.map(g => <GroupCard key={g.name} league={league} group={g} />)}
            </div>
            {tournament.stage2 && (
              <div style={{ borderTop: '1px dashed #fde68a', paddingTop: '0.6rem', display: 'grid', gap: '0.4rem' }}>
                <div style={{ fontWeight: 700, color: '#92400e', fontSize: '0.9rem' }}>Placement Matches</div>
                {tournament.stage2.rounds.map(r => (
                  <div key={r.roundIndex} style={{ display: 'grid', gap: '0.4rem' }}>
                    {r.matches.map(m => (
                      <MatchupCard
                        key={m.matchupId} league={league} m={m}
                        highlight={m.fromGroupRank?.map(fg => `${fg.group} #${fg.rank}`).join(' vs ')}
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
              <div style={{ borderTop: '1px dashed #fde68a', paddingTop: '0.6rem' }}>
                <div style={{ fontWeight: 700, color: '#92400e', fontSize: '0.9rem', marginBottom: '0.3rem' }}>Current Overall Ranking</div>
                <ol style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.88rem' }}>
                  {tournament.finalRanking.map(id => <li key={id}>{playerName(league, id)}</li>)}
                </ol>
              </div>
            )}
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
              <div ref={resultsRef} style={{ background: '#fff', padding: '1rem', borderRadius: '0.9rem', display: 'grid', gap: '0.8rem' }}>
                <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#92400e' }}>{league.name} — Final Results</div>
                <div style={{ ...mutedText, fontSize: '0.82rem' }}>
                  Matches played {results.resultsWindow?.startDate} to {results.resultsWindow?.endDate}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(results.groups.length, 3)}, 1fr)`, gap: '0.8rem' }}>
                  {results.groups.map(g => <GroupCard key={g.name} league={league} group={g} />)}
                </div>
                {results.stage2 && (
                  <div style={{ borderTop: '1px dashed #fde68a', paddingTop: '0.6rem', display: 'grid', gap: '0.4rem' }}>
                    <div style={{ fontWeight: 700, color: '#92400e', fontSize: '0.9rem' }}>Placement Results</div>
                    {results.stage2.rounds.map(r => (
                      <div key={r.roundIndex} style={{ display: 'grid', gap: '0.4rem' }}>
                        {r.matches.map(m => (
                          <MatchupCard
                            key={m.matchupId} league={league} m={m}
                            highlight={m.fromGroupRank?.map(fg => `${fg.group} #${fg.rank}`).join(' vs ')}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                )}
                {results.finalRanking && (
                  <div style={{ borderTop: '2px solid #fde68a', paddingTop: '0.6rem' }}>
                    <div style={{ fontWeight: 800, color: '#92400e', fontSize: '1rem', marginBottom: '0.3rem' }}>🏆 Final Overall Ranking</div>
                    <ol style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.92rem' }}>
                      {results.finalRanking.map((id, i) => (
                        <li key={id} style={{ fontWeight: i < 2 ? 800 : 500 }}>{playerName(league, id)}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
