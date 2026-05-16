import { useMemo, useState } from 'react';
import { SPORT_SCORING, type League, type ScoringFormat } from '../api';
import { S, mutedText, subheading } from '../theme';

type Props = { league: League };

function resolveScoring(sport: string, fmt?: ScoringFormat | null) {
  const base = { ...(SPORT_SCORING[sport] ?? SPORT_SCORING['tennis']) };
  if (!fmt) return base;
  return {
    ...base,
    wins_needed:   fmt.wins_needed   ?? base.wins_needed,
    max_units:     fmt.max_units     ?? base.max_units,
    points_to_win: fmt.points_to_win ?? base.points_to_win,
    win_by:        fmt.win_by        ?? base.win_by,
    max_points:    fmt.max_points    ?? base.max_points,
  };
}

function unitWinner(me: number, opp: number, sport: string, fmt?: ScoringFormat | null): 'me' | 'opp' | null {
  const cfg = resolveScoring(sport, fmt);
  const hi = Math.max(me, opp), lo = Math.min(me, opp);
  const side = me > opp ? 'me' : 'opp';
  if (cfg.unit === 'Set') {
    if (hi === 6 && lo <= 4) return side;
    if (hi === 7 && (lo === 5 || lo === 6)) return side;
    return null;
  }
  const { points_to_win: ptw, win_by: wb, max_points: mx } = cfg;
  if (hi >= ptw && (hi - lo) >= wb) return side;
  if (mx !== null && mx !== undefined && hi >= mx) return side;
  return null;
}

function scoreLabel(me: number, opp: number, sport: string, fmt?: ScoringFormat | null): string {
  const w = unitWinner(me, opp, sport, fmt);
  if (w === null) return '…';
  if (me === opp) return '—';
  return w === 'me' ? '✓' : '✗';
}

export default function ScoreCalculator({ league }: Props) {
  const fmt = league.rules?.scoringFormat ?? null;
  const cfg = resolveScoring(league.sport, fmt);
  const maxSets = cfg.max_units;
  const winsNeeded = cfg.wins_needed;

  const winPts   = league.rules?.scoring?.win    ?? 3;
  const lossPts  = league.rules?.scoring?.loss   ?? 0;
  const noGamePts= league.rules?.scoring?.noGame ?? -1;
  const upsetBonus = league.rules?.upsetBonus ?? 1;

  const [nameA, setNameA] = useState('Player A');
  const [nameB, setNameB] = useState('Player B');
  const [sets, setSets] = useState<{ me: number; opp: number }[]>(
    Array.from({ length: maxSets }, () => ({ me: 0, opp: 0 }))
  );
  const [isUpset, setIsUpset] = useState(false);

  const setScore = (i: number, side: 'me' | 'opp', val: string) => {
    const num = Math.max(0, parseInt(val, 10) || 0);
    setSets(prev => prev.map((s, idx) => idx === i ? { ...s, [side]: num } : s));
  };

  const reset = () => {
    setSets(Array.from({ length: maxSets }, () => ({ me: 0, opp: 0 })));
    setIsUpset(false);
  };

  const setWinners = useMemo(() =>
    sets.map(s => unitWinner(s.me, s.opp, league.sport, fmt)),
    [sets, league.sport, fmt]
  );

  const { meWins, oppWins, matchWinner, activeSets } = useMemo(() => {
    let me = 0, opp = 0;
    let active = 0;
    for (const w of setWinners) {
      if (w === 'me') { me++; active++; }
      else if (w === 'opp') { opp++; active++; }
      if (me >= winsNeeded || opp >= winsNeeded) break;
    }
    let winner: 'me' | 'opp' | null = null;
    if (me >= winsNeeded) winner = 'me';
    else if (opp >= winsNeeded) winner = 'opp';
    return { meWins: me, oppWins: opp, matchWinner: winner, activeSets: active };
  }, [setWinners, winsNeeded]);

  const aLeaguePts = matchWinner === 'me'  ? winPts  + (isUpset ? upsetBonus : 0)
                   : matchWinner === 'opp' ? lossPts : null;
  const bLeaguePts = matchWinner === 'opp' ? winPts  + (isUpset ? upsetBonus : 0)
                   : matchWinner === 'me'  ? lossPts : null;

  const winnerName  = matchWinner === 'me' ? nameA : matchWinner === 'opp' ? nameB : null;
  const loserName   = matchWinner === 'me' ? nameB : matchWinner === 'opp' ? nameA : null;

  const unitLabel = cfg.unit.toLowerCase();
  const unitLabelPl = (cfg as any).unit_plural?.toLowerCase() ?? `${unitLabel}s`;

  // determine which sets to show (only up to where match is decided + 1)
  const setsToShow = Math.min(
    maxSets,
    matchWinner ? activeSets : maxSets
  );

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      {/* League rules summary */}
      <div style={{ background: '#fffbeb', borderRadius: '0.75rem', padding: '0.75rem 1rem', fontSize: '0.82rem', color: '#92400e', border: '1px solid #fde68a' }}>
        <strong>Active rules ({league.sport}):</strong>{' '}
        First to {winsNeeded} {winsNeeded === 1 ? unitLabel : unitLabelPl} wins
        · {cfg.points_to_win} pts/{ unitLabel}
        · {cfg.win_by >= 2 ? `win by ${cfg.win_by}` : 'exact score'}
        {cfg.max_points ? ` · cap ${cfg.max_points}` : ''}
        · win earns {winPts} pts, loss earns {lossPts} pts
        {upsetBonus > 0 ? ` · upset bonus +${upsetBonus}` : ''}
      </div>

      {/* Player names */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '0.75rem', alignItems: 'center' }}>
        <input
          value={nameA}
          onChange={e => setNameA(e.target.value)}
          placeholder="Player A"
          style={{ ...S.inp, textAlign: 'center', fontWeight: 600 }}
        />
        <span style={{ ...mutedText, fontWeight: 700, textAlign: 'center' }}>vs</span>
        <input
          value={nameB}
          onChange={e => setNameB(e.target.value)}
          placeholder="Player B"
          style={{ ...S.inp, textAlign: 'center', fontWeight: 600 }}
        />
      </div>

      {/* Set scores */}
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ ...mutedText, fontSize: '0.78rem', fontWeight: 600, textAlign: 'center' }}>{nameA}</span>
          <span />
          <span style={{ ...mutedText, fontSize: '0.78rem', fontWeight: 600, textAlign: 'center' }}>{nameB}</span>
          <span />
        </div>
        {Array.from({ length: setsToShow }, (_, i) => {
          const w = setWinners[i];
          const decided = w !== null;
          const aWon = w === 'me';
          const bWon = w === 'opp';
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="number"
                min={0}
                value={sets[i].me}
                onChange={e => setScore(i, 'me', e.target.value)}
                style={{
                  ...S.inp, textAlign: 'center', fontWeight: 700, fontSize: '1.1rem',
                  borderColor: aWon ? '#22c55e' : bWon ? '#ef4444' : '#e5e7eb',
                  background: aWon ? '#f0fdf4' : bWon ? '#fef2f2' : '#fff',
                }}
              />
              <span style={{ textAlign: 'center', color: '#9ca3af', fontWeight: 700 }}>–</span>
              <input
                type="number"
                min={0}
                value={sets[i].opp}
                onChange={e => setScore(i, 'opp', e.target.value)}
                style={{
                  ...S.inp, textAlign: 'center', fontWeight: 700, fontSize: '1.1rem',
                  borderColor: bWon ? '#22c55e' : aWon ? '#ef4444' : '#e5e7eb',
                  background: bWon ? '#f0fdf4' : aWon ? '#fef2f2' : '#fff',
                }}
              />
              <span style={{ fontSize: '0.85rem', color: decided ? (aWon ? '#16a34a' : '#dc2626') : '#9ca3af', fontWeight: 600, minWidth: 28 }}>
                {decided
                  ? (aWon ? `${nameA.split(' ')[0]} ✓` : `${nameB.split(' ')[0]} ✓`)
                  : <span style={{ color: '#d1d5db' }}>{unitLabel} {i + 1}</span>}
              </span>
            </div>
          );
        })}
        {!matchWinner && setsToShow < maxSets && (
          <p style={{ ...mutedText, fontSize: '0.8rem', textAlign: 'center' }}>
            Enter scores above · max {maxSets} {unitLabelPl}
          </p>
        )}
      </div>

      {/* Result card */}
      {matchWinner ? (
        <div style={{
          borderRadius: '1rem',
          padding: '1.25rem',
          background: 'linear-gradient(135deg, #fef3c7, #fffbeb)',
          border: '2px solid #f59e0b',
          display: 'grid',
          gap: '1rem',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#92400e' }}>
              🏆 {winnerName} wins
            </div>
            <div style={{ ...mutedText, fontSize: '0.9rem', marginTop: '0.3rem' }}>
              {meWins}–{oppWins} in {unitLabelPl} · {loserName} loses
            </div>
          </div>

          {/* League points breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {[
              { name: nameA, pts: aLeaguePts!, won: matchWinner === 'me' },
              { name: nameB, pts: bLeaguePts!, won: matchWinner === 'opp' },
            ].map(({ name, pts, won }) => (
              <div key={name} style={{
                background: won ? '#fff' : '#f9fafb',
                borderRadius: '0.75rem',
                padding: '0.75rem',
                border: `1px solid ${won ? '#f59e0b' : '#e5e7eb'}`,
                textAlign: 'center',
              }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#374151' }}>{name}</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: won ? '#16a34a' : '#dc2626', lineHeight: 1.2 }}>
                  {pts >= 0 ? `+${pts}` : pts}
                </div>
                <div style={{ ...mutedText, fontSize: '0.76rem' }}>
                  {won ? `${winPts} (win)${isUpset ? ` +${upsetBonus} (upset)` : ''}` : `${lossPts} (loss)`}
                </div>
              </div>
            ))}
          </div>

          {/* Upset bonus toggle */}
          {upsetBonus > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', justifyContent: 'center' }}>
              <div
                onClick={() => setIsUpset(v => !v)}
                style={{ width: 36, height: 20, borderRadius: 99, background: isUpset ? '#f59e0b' : '#d1d5db', position: 'relative', flexShrink: 0, cursor: 'pointer', transition: 'background 0.2s' }}
              >
                <div style={{ position: 'absolute', top: 2, left: isUpset ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
              </div>
              <span style={{ fontSize: '0.85rem', color: isUpset ? '#92400e' : '#6b7280' }}>
                🔥 Upset win (lower-ranked beats higher-ranked) +{upsetBonus} bonus
              </span>
            </label>
          )}
        </div>
      ) : (
        <div style={{ background: '#f9fafb', borderRadius: '0.75rem', padding: '1rem', textAlign: 'center', border: '1px solid #e5e7eb' }}>
          <span style={{ ...mutedText, fontSize: '0.9rem' }}>
            {meWins > 0 || oppWins > 0
              ? `${nameA}: ${meWins} ${unitLabelPl} · ${nameB}: ${oppWins} ${unitLabelPl} · need ${winsNeeded} to win`
              : `Enter ${unitLabel} scores to see the result`}
          </span>
        </div>
      )}

      {/* No-game scenario */}
      {noGamePts !== 0 && (
        <div style={{ background: '#fef9c3', borderRadius: '0.65rem', padding: '0.65rem 1rem', fontSize: '0.82rem', color: '#854d0e', border: '1px solid #fde047' }}>
          ⏸ If a match is not played: both players receive {noGamePts < 0 ? noGamePts : `+${noGamePts}`} pts (no-game penalty)
        </div>
      )}

      <button style={S.smallOutlineBtn} onClick={reset}>↺ Reset scores</button>
    </div>
  );
}
