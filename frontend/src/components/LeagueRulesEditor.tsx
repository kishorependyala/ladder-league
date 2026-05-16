import { useEffect, useState } from 'react';
import { SPORT_SCORING, updateLeagueRules, type League, type ScoringFormat } from '../api';
import { S, mutedText, subheading } from '../theme';

type Props = {
  league: League;
  adminPhone: string;
  onUpdated: (league: League) => void;
};

type FormatPreset = 'single' | 'best3' | 'best5' | 'custom';

function getPreset(fmt: ScoringFormat | null | undefined): FormatPreset {
  if (!fmt) return 'best3'; // will show sport default
  if (fmt.wins_needed === 1) return 'single';
  if (fmt.wins_needed === 2) return 'best3';
  if (fmt.wins_needed === 3) return 'best5';
  return 'custom';
}

export default function LeagueRulesEditor({ league, adminPhone, onUpdated }: Props) {
  const sportDefault = SPORT_SCORING[league.sport] ?? SPORT_SCORING['tennis'];
  const saved = league.rules?.scoringFormat ?? null;

  // ── local form state ─────────────────────────────────────────
  const [preset, setPreset] = useState<FormatPreset>(() => getPreset(saved));
  const [customWins, setCustomWins] = useState(saved?.wins_needed ?? sportDefault.wins_needed);
  const [useCustomPoints, setUseCustomPoints] = useState(!!saved?.points_to_win);
  const [customPoints, setCustomPoints] = useState(saved?.points_to_win ?? sportDefault.points_to_win);
  const [winBy, setWinBy] = useState<'margin' | 'exact'>(
    saved ? (saved.win_by >= 2 ? 'margin' : 'exact') : 'margin',
  );
  const [useMaxCap, setUseMaxCap] = useState(saved?.max_points !== undefined && saved.max_points !== null);
  const [maxCap, setMaxCap] = useState(saved?.max_points ?? sportDefault.max_points ?? 30);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved2, setSaved2] = useState(false);

  // Keep wins_needed in sync with preset
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
    setError(''); setBusy(true);
    const fmt: ScoringFormat = {
      wins_needed: customWins,
      max_units: effectiveMaxUnits,
      points_to_win: effectivePoints,
      win_by: winBy === 'margin' ? 2 : 0,
      max_points: useMaxCap ? maxCap : null,
    };
    try {
      const res = await updateLeagueRules(league.id, adminPhone, { scoringFormat: fmt });
      if (res.success) { onUpdated(res.league); setSaved2(true); setTimeout(() => setSaved2(false), 2500); }
      else setError(res.message || 'Failed to save.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Error saving rules.'); }
    setBusy(false);
  };

  const handleReset = async () => {
    setError(''); setBusy(true);
    try {
      const res = await updateLeagueRules(league.id, adminPhone, { scoringFormat: null });
      if (res.success) {
        onUpdated(res.league);
        // reset local state to sport defaults
        setPreset('best3'); setUseCustomPoints(false); setCustomPoints(sportDefault.points_to_win);
        setWinBy('margin'); setUseMaxCap(false); setMaxCap(sportDefault.max_points ?? 30);
        setSaved2(true); setTimeout(() => setSaved2(false), 2500);
      } else setError(res.message || 'Failed to reset.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Error resetting rules.'); }
    setBusy(false);
  };

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      {error && <div style={S.errorBox}>{error}</div>}
      {saved2 && <div style={S.successBox}>✓ Rules saved!</div>}

      {/* current sport defaults info */}
      <div style={{ background: '#fffbeb', borderRadius: '0.75rem', padding: '0.75rem 1rem', fontSize: '0.82rem', color: '#92400e', border: '1px solid #fde68a' }}>
        <strong>Sport defaults ({league.sport}):</strong>{' '}
        {sportDefault.wins_needed} {sportDefault.unit_plural} to win · {sportDefault.points_to_win} pts/
        {sportDefault.unit} · win by {sportDefault.win_by}
        {sportDefault.max_points ? ` · cap ${sportDefault.max_points}` : ''}
      </div>

      {/* ── Format (number of sets) ── */}
      <Section title="Match format">
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {(['single', 'best3', 'best5', 'custom'] as FormatPreset[]).map(p => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              style={{
                padding: '0.45rem 0.9rem', borderRadius: '99px', border: '2px solid',
                borderColor: preset === p ? '#f59e0b' : '#e5e7eb',
                background: preset === p ? '#fef3c7' : '#fff',
                color: preset === p ? '#92400e' : '#6b7280',
                fontWeight: preset === p ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer',
              }}
            >
              {presetLabel(p)}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.6rem' }}>
            <label style={{ ...mutedText, fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{sportDefault.unit_plural} needed to win:</label>
            <input
              type="number" min={1} max={5} value={customWins}
              onChange={e => setCustomWins(Math.max(1, Math.min(5, Number(e.target.value))))}
              style={{ ...S.inp, width: 72, textAlign: 'center' }}
            />
          </div>
        )}
        <p style={{ ...mutedText, fontSize: '0.78rem', marginTop: '0.35rem' }}>
          Match = {customWins} {customWins === 1 ? sportDefault.unit : sportDefault.unit_plural} to win
          &nbsp;(max {effectiveMaxUnits} {sportDefault.unit_plural} played)
        </p>
      </Section>

      {/* ── Points per set ── */}
      <Section title={`Points per ${sportDefault.unit}`}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {[false, true].map(custom => (
            <button
              key={String(custom)}
              onClick={() => setUseCustomPoints(custom)}
              style={{
                padding: '0.45rem 0.9rem', borderRadius: '99px', border: '2px solid',
                borderColor: useCustomPoints === custom ? '#f59e0b' : '#e5e7eb',
                background: useCustomPoints === custom ? '#fef3c7' : '#fff',
                color: useCustomPoints === custom ? '#92400e' : '#6b7280',
                fontWeight: useCustomPoints === custom ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer',
              }}
            >
              {custom ? 'Custom' : `Default (${sportDefault.points_to_win} pts)`}
            </button>
          ))}
        </div>
        {useCustomPoints && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.6rem' }}>
            <label style={{ ...mutedText, fontSize: '0.82rem', whiteSpace: 'nowrap' }}>Target points:</label>
            <input
              type="number" min={1} max={100} value={customPoints}
              onChange={e => setCustomPoints(Math.max(1, Number(e.target.value)))}
              style={{ ...S.inp, width: 80, textAlign: 'center' }}
            />
          </div>
        )}
      </Section>

      {/* ── Win condition ── */}
      <Section title="Win condition">
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {([['margin', `${effectivePoints} pts + 2-point lead required`], ['exact', `First to ${effectivePoints} wins`]] as [typeof winBy, string][]).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setWinBy(v)}
              style={{
                padding: '0.45rem 0.9rem', borderRadius: '99px', border: '2px solid',
                borderColor: winBy === v ? '#f59e0b' : '#e5e7eb',
                background: winBy === v ? '#fef3c7' : '#fff',
                color: winBy === v ? '#92400e' : '#6b7280',
                fontWeight: winBy === v ? 700 : 500, fontSize: '0.85rem', cursor: 'pointer',
              }}
            >
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
                type="number" min={effectivePoints + 1} max={200} value={maxCap}
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

      {/* ── Summary ── */}
      <div style={{ background: '#f0fdf4', borderRadius: '0.75rem', padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#166534', border: '1px solid #bbf7d0' }}>
        <strong>Effective rules:</strong> First to win {customWins} {customWins === 1 ? sportDefault.unit : sportDefault.unit_plural}
        · {effectivePoints} pts/{sportDefault.unit}
        · {winBy === 'margin' ? `win by 2${useMaxCap ? ` (cap ${maxCap})` : ''}` : 'exact score'}
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
