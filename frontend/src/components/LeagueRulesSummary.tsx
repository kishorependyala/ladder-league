import { useState } from 'react';
import { type League, SPORT_SCORING } from '../api';
import { S, mutedText, subheading } from '../theme';

type Props = {
  league: League;
  /** compact=true shows a collapsed pill-row summary; false shows the full table */
  compact?: boolean;
};

export default function LeagueRulesSummary({ league, compact = false }: Props) {
  const [expanded, setExpanded] = useState(false);
  const rules = league.rules;
  const fmt = rules?.scoringFormat;
  const sport = SPORT_SCORING[league.sport] ?? SPORT_SCORING['tennis'];
  const winsNeeded   = fmt?.wins_needed   ?? sport.wins_needed;
  const pointsToWin  = fmt?.points_to_win ?? sport.points_to_win;
  const winBy        = fmt?.win_by        ?? sport.win_by;
  const maxPts       = fmt?.max_points    ?? sport.max_points;
  const unit         = sport.unit;
  const unitPlural   = sport.unit_plural;

  const winPts    = rules?.scoring?.win    ?? 3;
  const lossPts   = rules?.scoring?.loss   ?? 0;
  const noGamePts = rules?.scoring?.noGame ?? -1;

  const joinLabels: Record<string, string> = {
    admin_only:     'Admin-only',
    draft_only:     'Draft phase only',
    until_ranked:   'Open until rankings finalised',
    until_complete: 'Open until league ends',
  };
  const joinPolicy = rules?.joinPolicy ?? 'draft_only';

  // ── Sections ────────────────────────────────────────────────────
  const sections: { heading: string; rows: { icon: string; label: string; value: string }[] }[] = [
    {
      heading: '🎮 Game format',
      rows: [
        { icon: '🎯', label: 'Match',         value: `Best of ${winsNeeded * 2 - 1} ${unitPlural} · first to win ${winsNeeded}` },
        { icon: '📊', label: `Per ${unit}`,   value: `${pointsToWin} pts${winBy >= 2 ? `, win by ${winBy}` : ''}${maxPts ? ` (cap ${maxPts})` : ''}` },
        { icon: '📋', label: 'Scheduling',    value: rules?.matchFormat === 'round-robin' ? 'Round-robin (all vs all)' : 'Ad-hoc (anyone vs anyone)' },
      ],
    },
    {
      heading: '🏅 Standings scoring',
      rows: [
        { icon: '✅', label: 'Win',           value: `+${winPts} pts` },
        { icon: '❌', label: 'Loss',          value: `${lossPts >= 0 ? '+' : ''}${lossPts} pts` },
        { icon: '⏸️', label: 'No game',       value: `${noGamePts} pts` },
        { icon: '🔥', label: 'Upset bonus',   value: `+${rules?.upsetBonus ?? 1} pts (lower rank beats higher)` },
      ],
    },
    {
      heading: '📅 Schedule',
      rows: [
        { icon: '📅', label: 'Min matches/week',    value: String(rules?.minMatchesPerWeek ?? 1) },
        { icon: '⚠️', label: 'Missed week penalty', value: `${rules?.penaltyPerMissedWeek ?? 1} pts deducted` },
        { icon: '🗓️', label: 'Block duration',      value: `${rules?.blockDurationDays ?? 7} days` },
        { icon: '🏆', label: 'Playoffs',            value: `${rules?.playoffsWeeks ?? 1} week${(rules?.playoffsWeeks ?? 1) !== 1 ? 's' : ''}` },
      ],
    },
    {
      heading: '🚪 Joining',
      rows: [
        { icon: '🚪', label: 'Join policy',         value: joinLabels[joinPolicy] ?? joinPolicy },
        ...(rules?.lateJoinCap != null
          ? [{ icon: '🔢', label: 'Late-join cap', value: `${rules.lateJoinCap} player${rules.lateJoinCap !== 1 ? 's' : ''}` }]
          : []),
        { icon: '📍', label: 'New player rank',     value: ({ bottom: 'Bottom', middle: 'Middle', provisional: 'Middle (provisional)', admin_set: 'Admin assigned' } as Record<string,string>)[rules?.newPlayerRankPolicy ?? 'bottom'] ?? 'Bottom' },
      ],
    },
  ];

  // ── Compact pill summary (collapsed state) ──────────────────────
  const pills = [
    `Best of ${winsNeeded * 2 - 1} ${unitPlural}`,
    `Win +${winPts} · Loss ${lossPts >= 0 ? '+' : ''}${lossPts} · No game ${noGamePts}`,
    `${rules?.minMatchesPerWeek ?? 1}+ match/wk`,
    `Upset +${rules?.upsetBonus ?? 1}`,
  ];

  if (compact) {
    return (
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        {/* Collapsed summary row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#92400e' }}>📖 Rules</span>
          {pills.map(p => (
            <span key={p} style={{ fontSize: '0.74rem', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '999px', padding: '0.15rem 0.55rem', color: '#78350f', whiteSpace: 'nowrap' }}>
              {p}
            </span>
          ))}
          <button
            style={{ ...S.linkBtn, fontSize: '0.75rem', color: '#f59e0b', marginLeft: 'auto', whiteSpace: 'nowrap' }}
            onClick={() => setExpanded(e => !e)}
          >
            {expanded ? '▲ Less' : '▼ Full rules'}
          </button>
        </div>

        {expanded && <FullRulesTable sections={sections} />}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      <h3 style={{ ...subheading, marginBottom: '0.1rem' }}>📖 League Rules</h3>
      <FullRulesTable sections={sections} />
    </div>
  );
}

function FullRulesTable({ sections }: { sections: { heading: string; rows: { icon: string; label: string; value: string }[] }[] }) {
  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      {sections.map(sec => (
        <div key={sec.heading}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>
            {sec.heading}
          </div>
          <div style={{ display: 'grid', gap: '0.25rem' }}>
            {sec.rows.map(({ icon, label, value }) => (
              <div key={label} style={{ display: 'flex', gap: '0.6rem', alignItems: 'baseline', padding: '0.35rem 0.6rem', borderRadius: '0.5rem', background: '#fffbeb', border: '1px solid #fde68a' }}>
                <span style={{ fontSize: '0.95rem', lineHeight: 1.2, flexShrink: 0 }}>{icon}</span>
                <span style={{ ...mutedText, fontSize: '0.78rem', fontWeight: 600, minWidth: 150, flexShrink: 0 }}>{label}</span>
                <span style={{ fontSize: '0.85rem', color: '#111827' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
