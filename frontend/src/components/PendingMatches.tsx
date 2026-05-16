import { useMemo, useState } from 'react';
import { acceptMatch, findLeaguePlayer, rejectMatch, type League, type Match, type User } from '../api';
import { S, mutedText, subheading } from '../theme';

type PendingMatchesProps = {
  matches: Match[];
  user: User;
  leagueLookup?: Record<string, League>;
  leagueId?: string;
  isAdmin?: boolean;
  onActionComplete?: () => void;
};

function PendingMatches({ matches, user, leagueLookup, leagueId, isAdmin = false, onActionComplete }: PendingMatchesProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const visibleMatches = useMemo(
    () => matches.filter(match => !leagueId || match.leagueId === leagueId),
    [leagueId, matches],
  );

  const getLeagueName = (match: Match) => leagueLookup?.[match.leagueId]?.name || 'League';
  const getPlayerName = (match: Match, side: 'submitter' | 'opponent') => {
    const league = leagueLookup?.[match.leagueId];
    return side === 'submitter'
      ? findLeaguePlayer(league, match.submitterId, match.submitter)
      : findLeaguePlayer(league, match.opponentId, match.opponent);
  };

  const formatScore = (match: Match) => {
    const sets = match.score?.sets;
    if (sets && sets.length > 0) {
      return sets.map(set => `${set.me}–${set.opp}`).join(', ');
    }
    if (typeof match.score?.submitter === 'number' && typeof match.score?.opponent === 'number') {
      return `${match.score.submitter} - ${match.score.opponent}`;
    }
    return 'a result';
  };

  const getPendingText = (match: Match) => {
    const submitterName = getPlayerName(match, 'submitter');
    const opponentName = getPlayerName(match, 'opponent');
    if (!match.requiresBothAccept) {
      return `${submitterName} submitted, waiting for ${opponentName} to confirm`;
    }
    const sides = match.acceptedSides || [];
    const submitterDone = sides.includes('submitter') ? '✓' : '○';
    const opponentDone = sides.includes('opponent') ? '✓' : '○';
    const prefix = match.adminSubmittedBy ? 'Admin entered:' : 'Waiting for confirmations:';
    return `${prefix} ${submitterName} ${submitterDone} · ${opponentName} ${opponentDone}`;
  };

  const getActionState = (match: Match) => {
    const acceptedSides = match.acceptedSides || [];
    const mySide = user.id === match.submitterId ? 'submitter' : user.id === match.opponentId ? 'opponent' : null;
    if (match.requiresBothAccept) {
      if (mySide) {
        return {
          canAccept: !acceptedSides.includes(mySide),
          canReject: true,
          acceptLabel: 'Accept',
        };
      }
      if (isAdmin) {
        return {
          canAccept: true,
          canReject: true,
          acceptLabel: 'Accept for both',
        };
      }
      return { canAccept: false, canReject: false, acceptLabel: 'Accept' };
    }
    if (user.id === match.opponentId) {
      return { canAccept: true, canReject: true, acceptLabel: 'Accept' };
    }
    if (isAdmin) {
      return { canAccept: true, canReject: true, acceptLabel: 'Admin accept' };
    }
    return { canAccept: false, canReject: false, acceptLabel: 'Accept' };
  };

  const handleAccept = async (match: Match) => {
    setBusyId(match.id);
    setError('');
    setMessage('');
    try {
      const response = await acceptMatch(match.id, user.phone, match.leagueId);
      setMessage(response.match.status === 'accepted' ? 'Match accepted. Standings will refresh shortly.' : 'Confirmation recorded.');
      onActionComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept match.');
    }
    setBusyId(null);
  };

  const handleReject = async (match: Match) => {
    setBusyId(match.id);
    setError('');
    setMessage('');
    try {
      await rejectMatch(match.id, user.phone, match.leagueId, notes[match.id]);
      setMessage('Match rejected.');
      onActionComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reject match.');
    }
    setBusyId(null);
  };

  return (
    <div style={{ ...S.card, display: 'grid', gap: '1rem' }}>
      <h3 style={subheading}>Pending match approvals</h3>
      {error && <div style={S.errorBox}>{error}</div>}
      {message && <div style={S.successBox}>{message}</div>}
      {visibleMatches.length === 0 ? (
        <p style={mutedText}>No matches need your approval right now.</p>
      ) : (
        <div style={{ display: 'grid', gap: '0.9rem' }}>
          {visibleMatches.map(match => {
            const actions = getActionState(match);
            return (
              <div key={match.id} style={{ border: '1px solid #fed7aa', borderRadius: '0.9rem', padding: '1rem', background: '#fffbeb', display: 'grid', gap: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div>
                    <strong style={{ color: '#78350f' }}>{getLeagueName(match)}</strong>
                    <p style={{ ...mutedText, marginTop: '0.25rem' }}>
                      {getPlayerName(match, 'submitter')} vs {getPlayerName(match, 'opponent')} · {formatScore(match)}
                    </p>
                    <p style={{ ...mutedText, marginTop: '0.25rem' }}>{getPendingText(match)}</p>
                    {match.score?.details && <p style={{ ...mutedText, marginTop: '0.25rem' }}>{match.score.details}</p>}
                  </div>
                  <span style={{ color: '#9ca3af', fontSize: '0.86rem' }}>{match.submittedAt ? new Date(match.submittedAt).toLocaleString() : match.createdAt ? new Date(match.createdAt).toLocaleString() : ''}</span>
                </div>
                {actions.canReject && (
                  <label style={{ display: 'grid', gap: '0.35rem' }}>
                    <span style={{ color: '#78350f', fontWeight: 600, fontSize: '0.88rem' }}>Rejection note (optional)</span>
                    <input
                      value={notes[match.id] || ''}
                      onChange={event => setNotes(prev => ({ ...prev, [match.id]: event.target.value }))}
                      placeholder="Explain what needs to be fixed"
                      style={S.inp}
                    />
                  </label>
                )}
                {(actions.canAccept || actions.canReject) && (
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {actions.canAccept && (
                      <button style={S.smallBtn} disabled={busyId === match.id} onClick={() => handleAccept(match)}>
                        {busyId === match.id ? 'Saving…' : actions.acceptLabel}
                      </button>
                    )}
                    {actions.canReject && (
                      <button style={S.smallOutlineBtn} disabled={busyId === match.id} onClick={() => handleReject(match)}>
                        Reject
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default PendingMatches;
