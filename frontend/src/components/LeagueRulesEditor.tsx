import { useEffect, useState } from 'react';
import { SPORT_SCORING, updateLeagueRules, type League, type ScoringFormat } from '../api';
import { S, mutedText, subheading } from '../theme';

type Props = {
  league: League;
  adminPhone: string;
  onUpdated: (league: League) => void;
};

type FormatPreset = 'single' | 'best3' | 'best5' | 'custom';

type MatchScheduling = 'adhoc' | 'round-robin';

function getPreset(fmt: ScoringFormat | null | undefined): FormatPreset {
  if (!fmt) return 'best3';
  if (fmt.wins_needed === 1) return 'single';
  if (fmt.wins_needed === 2) return 'best3';
  if (fmt.wins_needed === 3) return 'best5';
  return 'custom';
}

function pillBtnStyle(active: boolean) {
  return {
    padding: '0.45rem 0.9rem',
    borderRadius: '99px',
    border: '2px solid',
    borderColor: active ? '#f59e0b' : '#e5e7eb',
    background: active ? '#fef3c7' : '#fff',
    color: active ? '#92400e' : '#6b7280',
    fontWeight: active ? 700 : 500,
    fontSize: '0.85rem',
    cursor: 'pointer',
  } as const;
}

export default function LeagueRulesEditor({ league, adminPhone, onUpdated }: Props) {
  const sportDefault = SPORT_SCORING[league.sport] ?? SPORT_SCORING.tennis;
  const saved = league.rules?.scoringFormat ?? null;

  const [preset, setPreset] = useState<FormatPreset>(() => getPreset(saved));
  const [customWins, setCustomWins] = useState(saved?.wins_needed ?? sportDefault.wins_needed);
  const [useCustomPoints, setUseCustomPoints] = useState(!!saved?.points_to_win);
  const [customPoints, setCustomPoints] = useState(saved?.points_to_win ?? sportDefault.points_to_win);
  const [winBy, setWinBy] = useState<'margin' | 'exact'>(saved ? (saved.win_by >= 2 ? 'margin' : 'exact') : 'margin');
  const [useMaxCap, setUseMaxCap] = useState(saved?.max_points !== undefined && saved.max_points !== null);
  const [maxCap, setMaxCap] = useState(saved?.max_points ?? sportDefault.max_points ?? 30);
  const [matchFormat, setMatchFormat] = useState<MatchScheduling>(league.rules?.matchFormat ?? 'adhoc');
  const [minMatchesPerWeek, setMinMatchesPerWeek] = useState(league.rules?.minMatchesPerWeek ?? 1);
  const [penaltyPerMissedWeek, setPenaltyPerMissedWeek] = useState(league.rules?.penaltyPerMissedWeek ?? 1);
  const [upsetBonus, setUpsetBonus] = useState(league.rules?.upsetBonus ?? 1);
  const [allowLateJoin, setAllowLateJoin] = useState(league.rules?.allowLateJoin ?? false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved2, setSaved2] = useState(false);

  useEffect(() => {
    if (preset === 'single') setCustomWins(1);
    else if (preset === 'best3') setCustomWins(2);
    else if (preset === 'best5') setCustomWins(3);
  }, [preset]);

  const effectivePoints = useCustomPoints ? customPoints : sportDefault.points_to_win;
  const effectiveMaxUnits = preset === 'single' ? 1 : preset === 'best3' ? 3 : preset === 'best5' ? 5 : customWins * 2 - 1;

  const presetLabel = (p: FormatPreset) => ({
    single: `Single ${sportDefault.unit}`,
    best3: `Best of 3 ${sportDefault.unit_plural}`,
    best5: `Best of 5 ${sportDefault.unit_plural}`,
    custom: 'Custom',
  }[p]);

  const handleSave = async () => {
    setError('');
    setBusy(true);
    const fmt: ScoringFormat = {
      wins_needed: customWins,
      max_units: effectiveMaxUnits,
      points_to_win: effectivePoints,
      win_by: winBy === 'margin' ? 2 : 0,
      max_points: useMaxCap ? maxCap : null,
    };
    try {
      const res = await updateLeagueRules(league.id, adminPhone, {
        scoringFormat: fmt,
        matchFormat,
        minMatchesPerWeek,
        penaltyPerMissedWeek,
        upsetBonus,
        allowLateJoin,
      });
      if (res.success) {
        onUpdated(res.league);
        setSaved2(true);
        setTimeout(() => setSaved2(false), 2500);
      } else {
        setError(res.message || 'Failed to save.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error saving rules.');
    }
    setBusy(false);
  };

  const handleReset = async () => {
    setError('');
    setBusy(true);
    try {
      const res = await updateLeagueRules(league.id, adminPhone, {
        scoringFormat: null,
        matchFormat: 'adhoc',
        minMatchesPerWeek: 1,
        penaltyPerMissedWeek: 1,
        upsetBonus: 1,
        allowLateJoin: false,
      });
      if (res.success) {
        onUpdated(res.league);
        setPreset('best3');
        setUseCustomPoints(false);
        setCustomPoints(sportDefault.points_to_win);
        setWinBy('margin');
        setUseMaxCap(false);
        setMaxCap(sportDefault.max_points ?? 30);
        setMatchFormat('adhoc');
        setMinMatchesPerWeek(1);
        setPenaltyPerMissedWeek(1);
        setUpsetBonus(1);
        setSaved2(true);
        setTimeout(() => setSaved2(false), 2500);
      } else {
        setError(res.message || 'Failed to reset.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error resetting rules.');
    }
    setBusy(false);
  };

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      {error && <div style={S.errorBox}>{error}</div>}
      {saved2 && <div style={S.successBox}>✓ Rules saved!</div>}

      <div style={{ background: '#fffbeb', borderRadius: '0.75rem', padding: '0.75rem 1rem', fontSize: '0.82rem', color: '#92400e', border: '1px solid #fde68a' }}>
        <strong>Sport defaults ({league.sport}):</strong>{' '}
        {sportDefault.wins_needed} {sportDefault.unit_plural} to win · {sportDefault.points_to_win} pts/
        {sportDefault.unit} · win by {sportDefault.win_by}
        {sportDefault.max_points ? ` · cap ${sportDefault.max_points}` : ''}
      </div>

      <Section title="League format">
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <div style={{ display: 'grid', gap: '0.35rem' }}>
            <label style={{ ...mutedText, fontSize: '0.82rem', fontWeight: 600 }}>Match scheduling</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button onClick={() => setMatchFormat('adhoc')} style={pillBtnStyle(matchFormat === 'adhoc')}>
                Ad-hoc (anyone vs anyone)
              </button>
              <button onClick={() => setMatchFormat('round-robin')} style={pillBtnStyle(matchFormat === 'round-robin')}>
                Round-robin (all vs all)
              </button>
            </div>
            {matchFormat === 'round-robin' && (
              <div style={S.infoBox}>Every player must play every other player. The match grid tracks completion.</div>
            )}
          </div>

          <div style={{ display: 'grid', gap: '0.35rem' }}>
            <label style={{ ...mutedText, fontSize: '0.82rem', fontWeight: 600 }}>Min matches per week</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {[1, 2, 3].map(value => (
                <button key={value} onClick={() => setMinMatchesPerWeek(value)} style={pillBtnStyle(minMatchesPerWeek === value)}>
                  {value}
                </button>
              ))}
            </div>
          </div>

          {minMatchesPerWeek > 0 && (
            <div style={{ display: 'grid', gap: '0.35rem' }}>
              <label style={{ ...mutedText, fontSize: '0.82rem', fontWeight: 600 }}>Penalty per missed week (points deducted)</label>
              <input
                type="number"
                min={0}
                max={10}
                value={penaltyPerMissedWeek}
                onChange={e => setPenaltyPerMissedWeek(Math.max(0, Math.min(10, Number(e.target.value) || 0)))}
                style={{ ...S.inp, width: 96 }}
              />
            </div>
          )}

          <div style={{ display: 'grid', gap: '0.35rem' }}>
            <label style={{ ...mutedText, fontSize: '0.82rem', fontWeight: 600 }}>Upset bonus</label>
            <p style={{ ...mutedText, fontSize: '0.78rem' }}>Extra points awarded when a lower-ranked player beats a higher-ranked player</p>
            <input
              type="number"
              min={0}
              max={10}
              value={upsetBonus}
              onChange={e => setUpsetBonus(Math.max(0, Math.min(10, Number(e.target.value) || 0)))}
              style={{ ...S.inp, width: 96 }}
            />
          </div>
        </div>
      </Section>

      <Section title="Match format">
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {(['single', 'best3', 'best5', 'custom'] as FormatPreset[]).map(p => (
            <button key={p} onClick={() => setPreset(p)} style={pillBtnStyle(preset === p)}>
              {presetLabel(p)}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.6rem' }}>
            <label style={{ ...mutedText, fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{sportDefault.unit_plural} needed to win:</label>
            <input
              type="number"
              min={1}
              max={5}
              value={customWins}
              onChange={e => setCustomWins(Math.max(1, Math.min(5, Number(e.target.value))))}
              style={{ ...S.inp, width: 72, textAlign: 'center' }}
            />
          </div>
        )}
        <p style={{ ...mutedText, fontSize: '0.78rem', marginTop: '0.35rem' }}>
          Match = {customWins} {customWins === 1 ? sportDefault.unit : sportDefault.unit_plural}
          &nbsp;(max {effectiveMaxUnits} {sportDefault.unit_plural} played)
        </p>
      </Section>

      <Section title={`Points per ${sportDefault.unit}`}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {[false, true].map(custom => (
            <button key={String(custom)} onClick={() => setUseCustomPoints(custom)} style={pillBtnStyle(useCustomPoints === custom)}>
              {custom ? 'Custom' : `Default (${sportDefault.points_to_win} pts)`}
            </button>
          ))}
        </div>
        {useCustomPoints && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.6rem' }}>
            <label style={{ ...mutedText, fontSize: '0.82rem', whiteSpace: 'nowrap' }}>Target points:</label>
            <input
              type="number"
              min={1}
              max={100}
              value={customPoints}
              onChange={e => setCustomPoints(Math.max(1, Number(e.target.value)))}
              style={{ ...S.inp, width: 80, textAlign: 'center' }}
            />
          </div>
        )}
      </Section>

      <Section title="Win condition">
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {([['margin', `${effectivePoints} pts + 2-point lead required`], ['exact', `First to ${effectivePoints} wins`]] as [typeof winBy, string][]).map(([v, label]) => (
            <button key={v} onClick={() => setWinBy(v)} style={pillBtnStyle(winBy === v)}>
              {label}
            </button>
          ))}
        </div>
        {winBy === 'margin' && (
          <div style={{ marginTop: '0.6rem' }}>
            <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}>
              <input type="checkbox" checked={useMaxCap} onChange={e => setUseMaxCap(e.target.checked)} style={{ width: 16, height: 16 }} />
              <span style={{ ...mutedText, fontSize: '0.85rem' }}>Cap max points at</span>
              <input
                type="number"
                min={effectivePoints + 1}
                max={200}
                value={maxCap}
                disabled={!useMaxCap}
                onChange={e => setMaxCap(Math.max(effectivePoints + 1, Number(e.target.value)))}
                style={{ ...S.inp, width: 72, textAlign: 'center', opacity: useMaxCap ? 1 : 0.4 }}
              />
            </label>
            <p style={{ ...mutedText, fontSize: '0.75rem', marginTop: '0.3rem' }}>
              {useMaxCap ? `At ${maxCap} pts, higher score wins regardless of margin` : 'No cap — play continues until 2-point lead'}
            </p>
          </div>
        )}
      </Section>

      {/* ── Membership ── */}
      <Section title="🚪 Membership">
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', padding: '0.75rem', background: allowLateJoin ? '#f0fdf4' : '#f9fafb', borderRadius: '0.75rem', border: `1px solid ${allowLateJoin ? '#bbf7d0' : '#e5e7eb'}`, transition: 'all 0.15s' }}>
          <div
            onClick={() => setAllowLateJoin(v => !v)}
            style={{ width: 40, height: 22, borderRadius: 99, background: allowLateJoin ? '#22c55e' : '#d1d5db', position: 'relative', flexShrink: 0, cursor: 'pointer', transition: 'background 0.2s' }}
          >
            <div style={{ position: 'absolute', top: 3, left: allowLateJoin ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
          </div>
          <div>
            <div style={{ fontWeight: 600, color: allowLateJoin ? '#15803d' : '#374151', fontSize: '0.9rem' }}>
              Allow players to join after ranking
            </div>
            <div style={{ ...mutedText, fontSize: '0.78rem', marginTop: '0.15rem' }}>
              {allowLateJoin
                ? 'Players can self-join while the league is in ranking, ranked, or active status'
                : 'Only admin can add players once ranking has started'}
            </div>
          </div>
        </label>
      </Section>

      <div style={{ background: '#f0fdf4', borderRadius: '0.75rem', padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#166534', border: '1px solid #bbf7d0' }}>
        <strong>Effective rules:</strong> First to win {customWins} {customWins === 1 ? sportDefault.unit : sportDefault.unit_plural}
        · {effectivePoints} pts/{sportDefault.unit}
        · {winBy === 'margin' ? `win by 2${useMaxCap ? ` (cap ${maxCap})` : ''}` : 'exact score'}
        · {matchFormat === 'adhoc' ? ' ad-hoc scheduling' : ' round-robin scheduling'}
        · {minMatchesPerWeek}/week minimum
        · upset bonus {upsetBonus}
        · {allowLateJoin ? 'late join ON' : 'late join OFF'}
      </div>

      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <button style={S.primaryBtn} onClick={handleSave} disabled={busy}>{busy ? 'Saving…' : '✓ Save rules'}</button>
        {saved && <button style={S.smallOutlineBtn} onClick={handleReset} disabled={busy}>↺ Reset to sport defaults</button>}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: '0.5rem' }}>
      <h4 style={{ ...subheading, fontSize: '0.88rem', margin: 0 }}>{title}</h4>
      {children}
    </div>
  );
}
