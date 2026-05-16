import { useMemo } from 'react';
import { getDisplayName, type League, type Match, type Player, type User } from '../api';
import { S, mutedText } from '../theme';

type MatchGridProps = {
  league: League;
  user: User;
  matches: Match[];
  isAdmin: boolean;
  onEnterScore: (player1: Player, player2: Player) => void;
};

function MatchGrid({ league, user, matches, isAdmin, onEnterScore }: MatchGridProps) {
  const pairs = useMemo(() => {
    const result: Array<[Player, Player]> = [];
    for (let i = 0; i < league.players.length; i++) {
      for (let j = i + 1; j < league.players.length; j++) {
        result.push([league.players[i], league.players[j]]);
      }
    }
    return result;
  }, [league.players]);

  const matchForPair = useMemo(() => {
    const map = new Map<string, Match>();
    const sorted = [...matches].sort((a, b) =>
      (b.submittedAt || b.createdAt || '').localeCompare(a.submittedAt || a.createdAt || ''),
    );
    for (const [a, b] of pairs) {
      const key = [a.id, b.id].sort().join('|');
      const match = sorted.find(item => {
        const ids = [item.submitterId, item.opponentId].sort().join('|');
        return ids === key && item.status !== 'rejected';
      });
      if (match) {
        map.set(key, match);
      }
    }
    return map;
  }, [matches, pairs]);

  const getKey = (a: Player, b: Player) => [a.id, b.id].sort().join('|');
  const isMe = (player: Player) => player.id === user.id || player.phone === user.phone;

  const renderStatus = (match: Match, p1: Player, p2: Player) => {
    if (match.status === 'accepted') {
      const sets = match.score?.sets;
      if (sets && sets.length > 0) {
        const label = sets.map(set => `${set.me}–${set.opp}`).join(', ');
        return <span style={{ ...mutedText, fontSize: '0.82rem', color: '#16a34a', fontWeight: 600 }}>✓ {label}</span>;
      }
      return <span style={{ ...mutedText, fontSize: '0.82rem', color: '#16a34a', fontWeight: 600 }}>✓ Accepted</span>;
    }
    if (match.status === 'pending') {
      const sides = match.acceptedSides || [];
      if (match.requiresBothAccept) {
        const p1Side = match.submitterId === p1.id ? 'submitter' : 'opponent';
        const p2Side = p1Side === 'submitter' ? 'opponent' : 'submitter';
        const p1done = sides.includes(p1Side);
        const p2done = sides.includes(p2Side);
        return (
          <span style={{ ...mutedText, fontSize: '0.78rem', color: '#d97706' }}>
            ⏳ {p1done ? '✓' : '○'} {getDisplayName(p1)} · {p2done ? '✓' : '○'} {getDisplayName(p2)}
          </span>
        );
      }
      return <span style={{ ...mutedText, fontSize: '0.78rem', color: '#d97706' }}>⏳ Pending confirmation</span>;
    }
    return null;
  };

  return (
    <div style={{ display: 'grid', gap: '0.5rem' }}>
      {pairs.map(([p1, p2]) => {
        const key = getKey(p1, p2);
        const match = matchForPair.get(key);
        const accepted = match?.status === 'accepted';
        const pending = match?.status === 'pending';
        const canEnter = !accepted;
        const imInvolved = isMe(p1) || isMe(p2);
        const canSubmit = imInvolved || isAdmin;

        return (
          <div
            key={key}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: '0.75rem',
              alignItems: 'center',
              padding: '0.65rem 0.8rem',
              borderRadius: '0.75rem',
              border: `1px solid ${accepted ? '#86efac' : pending ? '#fde68a' : '#e5e7eb'}`,
              background: accepted ? '#f0fdf4' : pending ? '#fffbeb' : '#fff',
            }}
          >
            <div style={{ display: 'grid', gap: '0.15rem' }}>
              <span style={{ fontWeight: imInvolved ? 700 : 400, color: '#78350f', fontSize: '0.9rem' }}>
                {getDisplayName(p1)} <span style={{ color: '#9ca3af', fontWeight: 400 }}>vs</span> {getDisplayName(p2)}
                {imInvolved && <span style={{ fontSize: '0.75rem', color: '#d97706', marginLeft: '0.4rem' }}>· you</span>}
              </span>
              {match && renderStatus(match, p1, p2)}
            </div>
            {canSubmit && canEnter && (
              <button
                style={{ ...S.smallOutlineBtn, whiteSpace: 'nowrap', fontSize: '0.78rem' }}
                onClick={() => onEnterScore(p1, p2)}
              >
                {pending ? '↩ Re-enter' : '+ Score'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default MatchGrid;
