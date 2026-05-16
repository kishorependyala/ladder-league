import { useEffect, useState } from 'react';
import { SPORT_SCORING, updateLeagueRules, type League, type LeagueRules, type ScoringFormat } from '../api';
import { S, mutedText, subheading } from '../theme';

type Props = {
  league: League;
  adminPhone: string;
  onUpdated: (league: League) => void;
};

type FormatPreset = 'single' | 'best3' | 'best5' | 'custom';
type MatchScheduling = 'adhoc' | 'round-robin';
type JoinPolicy = LeagueRules['joinPolicy'];
type RankPolicy = LeagueRules['newPlayerRankPolicy'];

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

/** Backwards-compat: read joinPolicy from either new field or old allowLateJoin bool */
function resolveJoinPolicy(rules: LeagueRules | undefined): JoinPolicy {
  if (!rules) return 'draft_only';
  if (rules.joinPolicy) return rules.joinPolicy;
  return (rules as any).allowLateJoin ? 'until_ranked' : 'draft_only';
}

const JOIN_POLICY_OPTIONS: { value: JoinPolicy; icon: string; label: string; desc: string; color: string }[] = [
  { value: 'admin_only',     icon: '🔒', label: 'Admin only',           desc: 'No self-join — admin manually adds all players',               color: '#6b7280' },
  { value: 'draft_only',     icon: '📋', label: 'Draft phase only',     desc: 'Players can join while the league is being set up',            color: '#3b82f6' },
  { value: 'until_ranked',   icon: '⏳', label: 'Until ranking closes', desc: 'Open during draft & ranking — closes once rankings finalise',  color: '#f59e0b' },
  { value: 'until_complete', icon: '🟢', label: 'Always open',          desc: 'Players can join any time until the league is fully complete', color: '#22c55e' },
];

const RANK_POLICY_OPTIONS: { value: RankPolicy; icon: string; label: string; desc: string }[] = [
  { value: 'bottom',      icon: '⬇️', label: 'Last place',       desc: 'New player starts at the bottom — safest, fairest for existing members' },
  { value: 'middle',      icon: '↕️', label: 'Mid-table',        desc: 'Inserted in the middle of current standings' },
  { value: 'provisional', icon: '🔖', label: 'Provisional mid',  desc: 'Placed mid-table but marked provisional — becomes official after a few matches' },
  { value: 'admin_set',   icon: '✏️', label: 'Admin places',     desc: 'Left unranked until admin manually assigns a position' },
];

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
  const [joinPolicy, setJoinPolicy] = useState<JoinPolicy>(() => resolveJoinPolicy(league.rules));
  const [rankPolicy, setRankPolicy] = useState<RankPolicy>(league.rules?.newPlayerRankPolicy ?? 'bottom');
  const [useLateJoinCap, setUseLateJoinCap] = useState(league.rules?.lateJoinCap != null);
  const [lateJoinCap, setLateJoinCap] = useState(league.rules?.lateJoinCap ?? 5);

  // League-point values
  const [winPts, setWinPts] = useState(league.rules?.scoring?.win ?? 3);
  const [lossPts, setLossPts] = useState(league.rules?.scoring?.loss ?? 0);
  const [noGamePts, setNoGamePts] = useState(league.rules?.scoring?.noGame ?? -1);

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
        joinPolicy,
        newPlayerRankPolicy: rankPolicy,
        lateJoinCap: useLateJoinCap ? lateJoinCap : null,
        scoring: { win: winPts, loss: lossPts, noGame: noGamePts },
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
        joinPolicy: 'draft_only',
        newPlayerRankPolicy: 'bottom',
        lateJoinCap: null,
        scoring: { win: 3, loss: 0, noGame: -1 },
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
        setJoinPolicy('draft_only');
        setRankPolicy('bottom');
        setUseLateJoinCap(false);
        setWinPts(3);
        setLossPts(0);
        setNoGamePts(-1);
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

      {/* ── League Points ── */}
      <Section title="🏆 League points per match">
        <p style={{ ...mutedText, fontSize: '0.78rem', margin: 0 }}>Points awarded in the league standings for each match outcome.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
          {([
            { label: '🏅 Win',       val: winPts,    set: setWinPts,    min: 0, max: 20 },
            { label: '📉 Loss',      val: lossPts,   set: setLossPts,   min: -5, max: 10 },
            { label: '⏸️ No-game',   val: noGamePts, set: setNoGamePts, min: -10, max: 0 },
          ] as { label: string; val: number; set: (n: number) => void; min: number; max: number }[]).map(({ label, val, set, min, max }) => (
            <div key={label} style={{ display: 'grid', gap: '0.3rem' }}>
              <label style={{ ...mutedText, fontSize: '0.8rem', fontWeight: 600 }}>{label}</label>
              <input
                type="number"
                min={min}
                max={max}
                value={val}
                onChange={e => set(Math.max(min, Math.min(max, Number(e.target.value) || 0)))}
                style={{ ...S.inp, textAlign: 'center' }}
              />
            </div>
          ))}
        </div>
        <p style={{ ...mutedText, fontSize: '0.75rem', marginTop: '0.1rem' }}>
          Win: <strong>+{winPts}</strong> pts &nbsp;·&nbsp; Loss: <strong>{lossPts >= 0 ? '+' : ''}{lossPts}</strong> pts &nbsp;·&nbsp; No-game: <strong>{noGamePts}</strong> pts &nbsp;·&nbsp; Upset bonus: <strong>+{upsetBonus}</strong>
        </p>
      </Section>

      {/* ── Membership ── */}
      <Section title="🚪 Membership & late join">
        {/* Join policy */}
        <div style={{ display: 'grid', gap: '0.35rem' }}>
          <label style={{ ...mutedText, fontSize: '0.82rem', fontWeight: 600 }}>When can players join?</label>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {JOIN_POLICY_OPTIONS.map(opt => (
              <label
                key={opt.value}
                onClick={() => setJoinPolicy(opt.value)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                  padding: '0.75rem 0.9rem',
                  borderRadius: '0.75rem',
                  border: `2px solid ${joinPolicy === opt.value ? opt.color : '#e5e7eb'}`,
                  background: joinPolicy === opt.value ? '#f9fafb' : '#fff',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s',
                }}
              >
                <div style={{
                  marginTop: 2,
                  width: 18, height: 18, borderRadius: '50%',
                  border: `2px solid ${joinPolicy === opt.value ? opt.color : '#d1d5db'}`,
                  background: joinPolicy === opt.value ? opt.color : '#fff',
                  flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {joinPolicy === opt.value && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#111827' }}>
                    {opt.icon} {opt.label}
                  </div>
                  <div style={{ ...mutedText, fontSize: '0.78rem', marginTop: '0.15rem' }}>{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Rank policy — only relevant when late join is possible */}
        {joinPolicy !== 'admin_only' && joinPolicy !== 'draft_only' && (
          <div style={{ display: 'grid', gap: '0.35rem', marginTop: '0.5rem' }}>
            <label style={{ ...mutedText, fontSize: '0.82rem', fontWeight: 600 }}>Default rank for late joiners</label>
            <div style={{ display: 'grid', gap: '0.4rem' }}>
              {RANK_POLICY_OPTIONS.map(opt => (
                <label
                  key={opt.value}
                  onClick={() => setRankPolicy(opt.value)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                    padding: '0.6rem 0.9rem',
                    borderRadius: '0.65rem',
                    border: `2px solid ${rankPolicy === opt.value ? '#f59e0b' : '#e5e7eb'}`,
                    background: rankPolicy === opt.value ? '#fffbeb' : '#fff',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s',
                  }}
                >
                  <div style={{
                    marginTop: 2,
                    width: 16, height: 16, borderRadius: '50%',
                    border: `2px solid ${rankPolicy === opt.value ? '#f59e0b' : '#d1d5db'}`,
                    background: rankPolicy === opt.value ? '#f59e0b' : '#fff',
                    flexShrink: 0,
                  }}>
                    {rankPolicy === opt.value && <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff', margin: '3px auto' }} />}
                  </div>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: '0.86rem' }}>{opt.icon} {opt.label}</span>
                    <span style={{ ...mutedText, fontSize: '0.77rem', marginLeft: '0.4rem' }}>{opt.desc}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Late join cap */}
        {joinPolicy !== 'admin_only' && joinPolicy !== 'draft_only' && (
          <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', cursor: 'pointer', userSelect: 'none', marginTop: '0.25rem' }}>
            <input type="checkbox" checked={useLateJoinCap} onChange={e => setUseLateJoinCap(e.target.checked)} style={{ width: 16, height: 16 }} />
            <span style={{ ...mutedText, fontSize: '0.85rem' }}>Limit late joiners to</span>
            <input
              type="number"
              min={1}
              max={50}
              value={lateJoinCap}
              disabled={!useLateJoinCap}
              onChange={e => setLateJoinCap(Math.max(1, Number(e.target.value)))}
              style={{ ...S.inp, width: 60, textAlign: 'center', opacity: useLateJoinCap ? 1 : 0.4 }}
            />
            <span style={{ ...mutedText, fontSize: '0.85rem' }}>players</span>
          </label>
        )}
      </Section>

      <div style={{ background: '#f0fdf4', borderRadius: '0.75rem', padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#166534', border: '1px solid #bbf7d0' }}>
        <strong>Effective rules:</strong> First to win {customWins} {customWins === 1 ? sportDefault.unit : sportDefault.unit_plural}
        · {effectivePoints} pts/{sportDefault.unit}
        · {winBy === 'margin' ? `win by 2${useMaxCap ? ` (cap ${maxCap})` : ''}` : 'exact score'}
        · {matchFormat === 'adhoc' ? ' ad-hoc scheduling' : ' round-robin scheduling'}
        · {minMatchesPerWeek}/week minimum
        · upset bonus {upsetBonus}
        · <strong>W/L/NG: {winPts}/{lossPts}/{noGamePts}</strong>
        · join: {JOIN_POLICY_OPTIONS.find(o => o.value === joinPolicy)?.label ?? joinPolicy}
        {joinPolicy !== 'admin_only' && joinPolicy !== 'draft_only' && ` · new rank: ${RANK_POLICY_OPTIONS.find(o => o.value === rankPolicy)?.label ?? rankPolicy}`}
        {useLateJoinCap && ` · max ${lateJoinCap} late joiners`}
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
