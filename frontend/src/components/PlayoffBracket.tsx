import { useCallback, useEffect, useMemo, useState } from 'react';
import { getDisplayName, getLeagueMatches, getPlayoffs, type League, type Match, type Player, type PlayoffGroup, type PlayoffMatchup, type Playoffs, type StandingsRow, type User } from '../api';
import { S, mutedText, subheading } from '../theme';
import SubmitMatch from './SubmitMatch';

type PlayoffBracketProps = {
  league: League;
  user: User;
  standings: StandingsRow[];
  isAdmin: boolean;
  onRefresh: () => void;
};

type ResolvedSlot = {
  label: string;
  player?: Player;
};

type ActiveMatchup = {
  player1: Player;
  player2: Player;
  playoffGroup: string;
  playoffMatchupId: string;
};

function buildGroupName(index: number): string {
  let name = '';
  let value = index;
  while (true) {
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26) - 1;
    if (value < 0) return `Group ${name}`;
  }
}

function splitPreviewPlayerIds(playerIds: string[]): string[][] {
  const total = playerIds.length;
  if (total <= 0) return [];
  if (total === 1) return [playerIds.slice()];
  if (total === 2) return [playerIds.slice(0, 2)];

  const baseSize = total < 8 ? 3 : 4;
  const fullGroups = Math.floor(total / baseSize);
  const remainder = total % baseSize;
  const sizes = remainder === 0
    ? Array(fullGroups).fill(baseSize)
    : remainder === 1 && fullGroups >= 1
      ? [...Array(Math.max(0, fullGroups - 1)).fill(baseSize), baseSize - 1, 2]
      : [...Array(fullGroups).fill(baseSize), remainder];

  const groups: string[][] = [];
  let cursor = 0;
  for (const size of sizes) {
    groups.push(playerIds.slice(cursor, cursor + size));
    cursor += size;
  }
  return groups.filter(group => group.length > 0);
}

export function computePreviewGroups(standings: StandingsRow[], players: Player[]): PlayoffGroup[] {
  const rankById = new Map(standings.map(row => [row.player.id, row.rank]));
  const orderedIds = [...players]
    .sort((a, b) => (rankById.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rankById.get(b.id) ?? Number.MAX_SAFE_INTEGER))
    .map(player => player.id);

  return splitPreviewPlayerIds(orderedIds).map((groupPlayerIds, index) => {
    const matchups: Record<string, PlayoffMatchup> = groupPlayerIds.length >= 4
      ? {
          sf1: { side1Seed: 0, side2Seed: 3, matchId: null, winnerId: null },
          sf2: { side1Seed: 1, side2Seed: 2, matchId: null, winnerId: null },
          final: { fromSfs: ['sf1', 'sf2'], matchId: null, winnerId: null },
        }
      : groupPlayerIds.length === 3
        ? {
            sf1: { side1Seed: 1, side2Seed: 2, matchId: null, winnerId: null },
            final: { side1Seed: 0, fromSfs: ['sf1'], matchId: null, winnerId: null },
          }
        : {
            final: { side1Seed: 0, side2Seed: 1, matchId: null, winnerId: null },
          };

    return {
      name: buildGroupName(index),
      playerIds: groupPlayerIds,
      matchups,
    };
  });
}

function placeholderForSfWinner(sfId?: string): string {
  return `${(sfId || 'SF').toUpperCase()} Winner`;
}

function resolveSlot(
  matchup: PlayoffMatchup,
  slotType: 'side1' | 'side2',
  groupPlayerIds: string[],
  groupMatchups: Record<string, PlayoffMatchup>,
  leaguePlayers: Player[],
  options?: { preview?: boolean; rankByPlayerId?: Record<string, number> },
): ResolvedSlot {
  const preview = Boolean(options?.preview);
  const getPlayer = (playerId?: string | null) => leaguePlayers.find(player => player.id === playerId);
  const directSeed = slotType === 'side1' ? matchup.side1Seed : matchup.side2Seed;

  if (typeof directSeed === 'number') {
    const playerId = groupPlayerIds[directSeed];
    const player = getPlayer(playerId);
    if (preview) {
      return { label: `Rank ${options?.rankByPlayerId?.[playerId] ?? directSeed + 1}`, player };
    }
    return { label: getDisplayName(player), player };
  }

  const refs = matchup.fromSfs || [];
  const refIndex = slotType === 'side1'
    ? 0
    : typeof matchup.side1Seed === 'number'
      ? 0
      : 1;
  const sfId = refs[refIndex];
  if (!sfId) {
    return { label: 'TBD' };
  }

  const winnerId = groupMatchups[sfId]?.winnerId;
  const winner = getPlayer(winnerId);
  if (winner) {
    return { label: getDisplayName(winner), player: winner };
  }

  return { label: placeholderForSfWinner(sfId) };
}

function PlayoffBracket({ league, user, standings, isAdmin, onRefresh }: PlayoffBracketProps) {
  const [playoffs, setPlayoffs] = useState<Playoffs | null>(league.playoffs ?? null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeMatchup, setActiveMatchup] = useState<ActiveMatchup | null>(null);

  const rankByPlayerId = useMemo(
    () => Object.fromEntries(standings.map(row => [row.player.id, row.rank])),
    [standings],
  );

  const loadBracket = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextPlayoffs, nextMatches] = await Promise.all([
        getPlayoffs(league.id),
        getLeagueMatches(league.id),
      ]);
      setPlayoffs(nextPlayoffs ?? league.playoffs ?? null);
      setMatches((Array.isArray(nextMatches) ? nextMatches : []).filter(match => match.isPlayoff));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load playoff bracket.');
    }
    setLoading(false);
  }, [league.id, league.playoffs, league.status]);

  useEffect(() => {
    setPlayoffs(league.playoffs ?? null);
  }, [league.playoffs]);

  useEffect(() => {
    loadBracket();
  }, [loadBracket]);

  const latestMatchBySlot = useMemo(() => {
    const map = new Map<string, Match>();
    const sorted = [...matches].sort((a, b) =>
      (b.submittedAt || b.createdAt || '').localeCompare(a.submittedAt || a.createdAt || ''),
    );
    for (const match of sorted) {
      const key = `${match.playoffGroup || ''}|${match.playoffMatchupId || ''}`;
      if (!map.has(key)) {
        map.set(key, match);
      }
    }
    return map;
  }, [matches]);

  const groups = playoffs?.groups || [];

  const handleSubmitted = async () => {
    setActiveMatchup(null);
    await Promise.resolve(onRefresh());
    await loadBracket();
  };

  if (league.status === 'active') return null;

  return (
    <div style={{ ...S.card, display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'grid', gap: '0.35rem' }}>
        <h3 style={subheading}>Playoff Bracket</h3>
        <p style={mutedText}>Seeds are locked. Winners advance automatically as playoff results are accepted.</p>
      </div>

      {error && <div style={S.errorBox}>{error}</div>}
      {loading && <p style={mutedText}>Loading bracket…</p>}
      {!loading && groups.length === 0 && <p style={mutedText}>No playoff bracket yet.</p>}

      {groups.length > 0 && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {groups.map(group => {
            const groupCode = group.name.replace(/^Group\s+/i, '');
            const isFourPlayerGroup = group.playerIds.length >= 4;
            const semifinalIds = ['sf1', 'sf2'].filter(id => Boolean(group.matchups[id]));
            const finalMatchup = group.matchups.final;

            const renderMatchup = (matchupId: string, matchup: PlayoffMatchup, title: string, preview = false) => {
              const side1 = resolveSlot(matchup, 'side1', group.playerIds, group.matchups, league.players, preview ? { preview: true, rankByPlayerId } : undefined);
              const side2 = resolveSlot(matchup, 'side2', group.playerIds, group.matchups, league.players, preview ? { preview: true, rankByPlayerId } : undefined);
              const liveMatch = latestMatchBySlot.get(`${groupCode}|${matchupId}`) || (matchup.matchId ? matches.find(match => match.id === matchup.matchId) : undefined);
              const accepted = Boolean(matchup.winnerId || liveMatch?.status === 'accepted');
              const pending = !accepted && liveMatch?.status === 'pending';
              const canEnter = !preview && !accepted && Boolean(side1.player && side2.player) && (isAdmin || side1.player?.id === user.id || side2.player?.id === user.id);

              return (
                <div
                  key={matchupId}
                  style={{
                    borderRadius: '0.9rem',
                    border: `1px solid ${accepted ? '#86efac' : pending ? '#fde68a' : '#fed7aa'}`,
                    background: accepted ? '#f0fdf4' : pending ? '#fffbeb' : '#fff7ed',
                    padding: '0.9rem',
                    display: 'grid',
                    gap: '0.55rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
                    <strong style={{ color: '#92400e' }}>{title}</strong>
                    {accepted && <span style={{ color: '#16a34a', fontSize: '0.8rem', fontWeight: 700 }}>Accepted</span>}
                    {pending && <span style={{ color: '#d97706', fontSize: '0.8rem', fontWeight: 700 }}>Pending</span>}
                  </div>
                  <div style={{ display: 'grid', gap: '0.4rem' }}>
                    <div style={{ fontWeight: 600, color: '#78350f' }}>{side1.label}</div>
                    <div style={{ ...mutedText, fontSize: '0.8rem' }}>vs</div>
                    <div style={{ fontWeight: 600, color: '#78350f' }}>{side2.label}</div>
                  </div>
                  {canEnter && side1.player && side2.player && (
                    <div>
                      <button
                        style={S.smallOutlineBtn}
                        onClick={() => setActiveMatchup({
                          player1: side1.player!,
                          player2: side2.player!,
                          playoffGroup: groupCode,
                          playoffMatchupId: matchupId,
                        })}
                      >
                        {pending ? 'Re-enter Score' : 'Enter Score'}
                      </button>
                    </div>
                  )}
                </div>
              );
            };

            return (
              <div key={group.name} style={{ border: '1px solid #fde68a', borderRadius: '1rem', padding: '1rem', background: '#fffbeb', display: 'grid', gap: '0.9rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <h4 style={{ ...subheading, color: '#78350f' }}>{group.name}</h4>
                  <span style={{ ...mutedText, fontSize: '0.85rem' }}>{group.playerIds.length} players</span>
                </div>

                <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: isFourPlayerGroup ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr)' }}>
                  {semifinalIds.length > 0 && (
                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                      {semifinalIds.map(matchupId => renderMatchup(matchupId, group.matchups[matchupId], matchupId.toUpperCase(), league.status === 'active'))}
                    </div>
                  )}
                  {finalMatchup && (
                    <div style={{ display: 'grid', alignContent: 'start' }}>
                      {renderMatchup('final', finalMatchup, 'Final', league.status === 'active')}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeMatchup && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={() => setActiveMatchup(null)}
        >
          <div style={{ width: '100%', maxWidth: 680, maxHeight: '100%', overflowY: 'auto' }} onClick={event => event.stopPropagation()}>
            <SubmitMatch
              league={league}
              user={user}
              prePlayer1={activeMatchup.player1}
              prePlayer2={activeMatchup.player2}
              playoffInfo={{
                playoffGroup: activeMatchup.playoffGroup,
                playoffMatchupId: activeMatchup.playoffMatchupId,
              }}
              onCancel={() => setActiveMatchup(null)}
              onSubmitted={handleSubmitted}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default PlayoffBracket;
