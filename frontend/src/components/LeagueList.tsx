import React, { useState } from 'react';
import type { League, User } from '../api';
import { formatLeagueDates, getDisplayName, isLeagueMember } from '../api';
import { leagueShareUrl } from '../App';
import { S, mutedText, statusPill, subheading } from '../theme';

function CopyLeagueLink({ leagueId }: { leagueId: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = leagueShareUrl(leagueId);
    navigator.clipboard.writeText(url).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = url; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      title="Copy league link"
      style={{
        padding: '0.2rem 0.55rem',
        borderRadius: '0.5rem',
        border: `1px solid ${copied ? '#22c55e' : '#e5e7eb'}`,
        background: copied ? '#f0fdf4' : '#f9fafb',
        color: copied ? '#16a34a' : '#6b7280',
        fontSize: '0.75rem',
        fontWeight: copied ? 700 : 500,
        cursor: 'pointer',
        transition: 'all 0.15s',
        whiteSpace: 'nowrap',
      }}
    >
      {copied ? '✓ Copied!' : '🔗 Share'}
    </button>
  );
}

type LeagueListProps = {
  title: string | React.ReactNode;
  leagues: League[];
  user: User;
  emptyMessage: string;
  onOpenLeague: (league: League) => void;
  onJoinLeague?: (league: League) => void;
  joiningLeagueId?: string | null;
};

function LeagueList({ title, leagues, user, emptyMessage, onOpenLeague, onJoinLeague, joiningLeagueId }: LeagueListProps) {
  return (
    <div style={{ ...S.card, display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <h3 style={subheading}>{title}</h3>
        <span style={{ color: '#9ca3af', fontSize: '0.9rem' }}>{leagues.length} league{leagues.length === 1 ? '' : 's'}</span>
      </div>

      {leagues.length === 0 && <p style={mutedText}>{emptyMessage}</p>}

      <div style={{ display: 'grid', gap: '0.9rem' }}>
        {leagues.map(league => {
          const member = isLeagueMember(league, user);
          const preStart = ['draft', 'ranking', 'ranked'].includes(league.status);
          const hasRanked = !!league.stackRanks?.[user.id];
          const needsRanking = member && preStart && !hasRanked;
          const playerPreview = league.players.slice(0, 4).map(player => getDisplayName(player)).join(', ');
          return (
            <div key={league.id} style={{ border: `1px solid ${needsRanking ? '#f59e0b' : '#fed7aa'}`, borderRadius: '0.9rem', padding: '1rem', background: needsRanking ? '#fffbeb' : '#fff', display: 'grid', gap: '0.8rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                    <strong style={{ color: '#78350f', fontSize: '1rem' }}>{league.name}</strong>
                    <span style={statusPill(league.status)}>{league.status}</span>
                    <span style={{ fontSize: '0.82rem', color: '#92400e', fontWeight: 700 }}>{league.sport}</span>
                  </div>
                  <p style={{ ...mutedText, marginTop: '0.3rem' }}>{formatLeagueDates(league)}</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <CopyLeagueLink leagueId={league.id} />
                  <button style={needsRanking ? S.smallBtn : S.smallOutlineBtn} onClick={() => onOpenLeague(league)}>
                    {needsRanking ? '📋 Rank now' : (member && preStart ? '📋 Update ranking' : 'Open')}
                  </button>
                  {!member && league.status === 'draft' && onJoinLeague && (
                    <button style={S.smallBtn} disabled={joiningLeagueId === league.id} onClick={() => onJoinLeague(league)}>
                      {joiningLeagueId === league.id ? 'Joining…' : 'Join'}
                    </button>
                  )}
                  {member && !preStart && <span style={{ ...statusPill('active'), textTransform: 'none' }}>Joined</span>}
                  {member && preStart && (
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: needsRanking ? '#92400e' : '#16a34a', background: needsRanking ? '#fef3c7' : '#dcfce7', borderRadius: '0.4rem', padding: '0.2rem 0.5rem' }}>
                      {needsRanking ? '⚠ Ranking pending' : '✓ Ranking submitted'}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'grid', gap: '0.25rem' }}>
                <span style={{ color: '#78350f', fontWeight: 600, fontSize: '0.88rem' }}>Players ({league.players.length})</span>
                <span style={{ color: '#6b7280', fontSize: '0.92rem' }}>{playerPreview || 'No players yet.'}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default LeagueList;
