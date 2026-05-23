const API_BASE = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8080';

export interface SportScoring {
  unit: string;
  unit_plural: string;
  wins_needed: number;
  max_units: number;
  points_to_win: number;
  win_by: number;
  max_points: number | null;
}

export const SPORT_SCORING: Record<string, SportScoring> = {
  'tennis':       { unit: 'Set',  unit_plural: 'Sets',  wins_needed: 2, max_units: 3, points_to_win: 6,  win_by: 2, max_points: 7  },
  'table-tennis': { unit: 'Game', unit_plural: 'Games', wins_needed: 3, max_units: 5, points_to_win: 11, win_by: 2, max_points: null },
  'pickleball':   { unit: 'Game', unit_plural: 'Games', wins_needed: 2, max_units: 3, points_to_win: 11, win_by: 2, max_points: null },
  'badminton':    { unit: 'Game', unit_plural: 'Games', wins_needed: 2, max_units: 3, points_to_win: 21, win_by: 2, max_points: 30  },
};

/** Returns 'me' | 'opp' | null — who won this set/game, or null if undecided. */
export function unitWinner(me: number, opp: number, sport: string): 'me' | 'opp' | null {
  const cfg = SPORT_SCORING[sport] ?? SPORT_SCORING['tennis'];
  const hi = Math.max(me, opp), lo = Math.min(me, opp);
  const side = me > opp ? 'me' : 'opp';
  if (cfg.unit === 'Set') {
    if (hi === 6 && lo <= 4) return side;
    if (hi === 7 && (lo === 5 || lo === 6)) return side;
    return null;
  }
  const { points_to_win: ptw, win_by: wb, max_points: mx } = cfg;
  if (hi >= ptw && (hi - lo) >= wb) return side;
  if (mx !== null && hi >= mx) return side;
  return null;
}

export interface User {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
  email?: string;
  pin?: string;
  favoriteSport?: string;
  createdAt: string;
}

export interface Player {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
}

export interface LeagueRules {
  blockDurationDays: number;
  playoffsWeeks: number;
  minGamesPerBlock: number;
  penaltyForNoGame: number;
  scoring: {
    win: number;
    loss: number;
    noGame: number;
  };
  scoringFormat?: ScoringFormat | null;
  matchFormat: 'adhoc' | 'round-robin';
  minMatchesPerWeek: number;
  penaltyPerMissedWeek: number;
  upsetBonus: number;
  /** Controls when players can self-join the league */
  joinPolicy: 'draft_only' | 'until_ranked' | 'until_complete' | 'admin_only';
  /** Where a late-joining player lands in the standings */
  newPlayerRankPolicy: 'bottom' | 'middle' | 'provisional' | 'admin_set';
  /** Max players who can join after draft phase (null = unlimited) */
  lateJoinCap: number | null;
  /** Doubles mode for the league */
  doublesMode?: 'none' | 'adhoc' | 'fixed_pairs';
}

export interface ScoringFormat {
  wins_needed: number;
  max_units: number;
  points_to_win: number;
  win_by: number;       // 2 = need 2-point lead, 0 = first to target wins exactly
  max_points: number | null;
}

export interface PlayoffMatchup {
  side1Seed?: number;
  side2Seed?: number;
  fromSfs?: string[];
  matchId: string | null;
  winnerId: string | null;
}

export interface PlayoffGroup {
  name: string;
  playerIds: string[];
  matchups: Record<string, PlayoffMatchup>;
}

export interface Playoffs {
  groups: PlayoffGroup[];
  generatedAt: string;
}

export interface LeagueBlock {
  index: number;
  startDate: string;
  endDate: string;
}

export interface League {
  id: string;
  name: string;
  sport: string;
  status: 'draft' | 'ranking' | 'ranked' | 'active' | 'playoffs' | 'completed';
  leagueType?: string;
  phase?: string;
  adminIds: string[];
  players: Player[];
  startDate: string | null;
  endDate: string | null;
  rules: LeagueRules;
  stackRanks: Record<string, string[]>;
  finalRanking: string[];
  createdAt: string;
  startedAt?: string;
  playoffs?: Playoffs;
  blocks?: LeagueBlock[];
  doublesPairs?: DoublesPair[];
  doublesStackRanks?: Record<string, string[]>;
  doublesFinalRanking?: string[];
}

export interface DoublesPair {
  id: string;
  player1Id: string;
  player2Id: string;
  name: string;
  createdAt: string;
}

export interface Sport {
  id: string;
  label: string;
}

export interface RolesResponse {
  userId: string;
  isSuperAdmin: boolean;
  adminLeagueIds: string[];
}

export interface SetScore {
  me: number;
  opp: number;
}

export interface MatchScore {
  sets?: SetScore[];
  submitterWon?: boolean;
  submitter?: number;
  opponent?: number;
  details?: string;
}

export interface Match {
  id: string;
  leagueId: string;
  submitterId?: string;
  opponentId?: string;
  submitter?: Partial<User | Player>;
  opponent?: Partial<User | Player>;
  score?: MatchScore;
  status?: string;
  note?: string;
  createdAt?: string;
  submittedAt?: string;
  resolvedAt?: string;
  datePlayed?: string;
  adminSubmittedBy?: string;
  requiresBothAccept?: boolean;
  acceptedSides?: string[];
  isPlayoff?: boolean;
  playoffGroup?: string | null;
  playoffMatchupId?: string | null;
  winner?: string;
  // Doubles-specific fields
  matchType?: 'singles' | 'doubles';
  doublesMode?: 'adhoc' | 'fixed_pairs';
  team1PlayerIds?: string[];
  team2PlayerIds?: string[];
  requiresAllAccept?: boolean;
  acceptedPlayerIds?: string[];
  pair1Id?: string | null;
  pair2Id?: string | null;
  winnerTeam?: 'team1' | 'team2' | null;
}

export interface MatchLogEntry {
  matchId: string;
  opponentId: string;
  result: 'win' | 'loss';
  basePoints: number;
  upsetBonus: number;
  score?: MatchScore;
  submittedAt?: string;
}

export interface StandingsRow {
  player: Player;
  wins: number;
  losses: number;
  points: number;
  rank: number;
  matchLog: MatchLogEntry[];
}

export interface StandingsResponse {
  leagueId: string;
  standings: StandingsRow[];
}

export interface RoundDef {
  label: string;
  startDate: string;
  endDate: string;
}

export interface PlayerBreakdownRow {
  playerId: string;
  playerName: string;
  startRank: number;
  currentRank: number;
  roundRanks: { roundIndex: number; label: string; rank: number }[];
}

export interface StandingBreakdownResponse {
  leagueId: string;
  rounds: RoundDef[];
  breakdown: PlayerBreakdownRow[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'message' in data ? String((data as { message?: string }).message) : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return data as T;
}

async function get<T>(path: string): Promise<T> {
  return request<T>(path);
}

async function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function leagueTypeLabel(rules: LeagueRules | undefined, leagueType?: string): string {
  if (leagueType === 'team') return 'Team League';
  const mode = rules?.doublesMode ?? 'none';
  if (mode === 'adhoc') return 'Doubles · Ad-hoc';
  if (mode === 'fixed_pairs') return 'Doubles · Fixed';
  return 'Singles';
}

export function getDisplayName(person?: Partial<User | Player> | null): string {
  if (!person) return 'Unknown player';
  const fullName = `${person.firstName || ''} ${person.lastName || ''}`.trim();
  return fullName || person.phone || 'Unknown player';
}

export function isLeagueMember(league: League, user: User): boolean {
  return league.players.some(player => player.id === user.id || player.phone === user.phone);
}

export function formatLeagueDates(league: League): string {
  if (!league.startDate && !league.endDate) return 'Dates TBD';
  const start = league.startDate ? new Date(league.startDate).toLocaleDateString() : 'TBD';
  const end = league.endDate ? new Date(league.endDate).toLocaleDateString() : 'TBD';
  return `${start} – ${end}`;
}

export function findLeaguePlayer(league: League | undefined, playerId?: string, fallback?: Partial<User | Player> | null): string {
  if (fallback) return getDisplayName(fallback);
  const player = league?.players.find(entry => entry.id === playerId);
  return getDisplayName(player);
}

export function authCheckPhone(phone: string): Promise<{ exists: boolean }> {
  return get(`/api/auth/check-phone?phone=${encodeURIComponent(phone)}`);
}

export function loginWithPin(phone: string, pin: string): Promise<{ success: boolean; user: User; message?: string }> {
  return post('/api/auth/login-with-pin', { phone, pin });
}

export function requestPinReset(phone: string): Promise<{ success: boolean; sent?: boolean; maskedEmail?: string; message?: string }> {
  return post('/api/auth/request-pin-reset', { phone });
}

export function verifyPinReset(phone: string, code: string, newPin: string): Promise<{ success: boolean; user: User; message?: string }> {
  return post('/api/auth/verify-pin-reset', { phone, code, newPin });
}

export function signup(phone: string, firstName: string, lastName: string, email: string, pin: string, favoriteSport?: string): Promise<{ success: boolean; user: User; message?: string }> {
  return post('/api/signup', { phone, firstName, lastName, email, pin, ...(favoriteSport ? { favoriteSport } : {}) });
}

export function getSports(): Promise<Sport[]> {
  return get('/api/sports');
}

export function getLeaguesBySport(sport: string): Promise<League[]> {
  return get(`/api/leagues?sport=${encodeURIComponent(sport)}`);
}

export async function getAllLeagues(): Promise<League[]> {
  const sports = await getSports();
  const buckets = await Promise.all(sports.map(sport => getLeaguesBySport(sport.id).catch(() => [])));
  const deduped = new Map<string, League>();
  buckets.flat().forEach(league => deduped.set(league.id, league));
  return Array.from(deduped.values());
}

export function getLeague(id: string): Promise<League> {
  return get(`/api/leagues/${encodeURIComponent(id)}`);
}

export function createLeague(
  phone: string,
  name: string,
  sport: string,
  startDate: string,
  endDate: string,
  rules?: Partial<LeagueRules>,
  leagueType?: string,
): Promise<{ success: boolean; league: League }> {
  return post('/api/leagues/create', { phone, name, sport, startDate, endDate, ...(rules ? { rules } : {}), ...(leagueType ? { leagueType } : {}) });
}

export function convertToTeamLeague(leagueId: string, phone: string): Promise<{ success: boolean; league?: League; message?: string }> {
  return post(`/api/leagues/${encodeURIComponent(leagueId)}/convert-to-team`, { phone });
}

export function joinLeague(id: string, phone: string): Promise<{ success: boolean; league: League; message?: string }> {
  return post(`/api/leagues/${encodeURIComponent(id)}/join`, { phone });
}

/** Returns true if a league is open for self-join by a non-member. */
export function isLeagueJoinable(league: League): boolean {
  const { status, rules } = league;
  if (status === 'completed') return false;
  // backward-compat: old data may have allowLateJoin bool
  const policy = rules?.joinPolicy ?? ((rules as any)?.allowLateJoin ? 'until_ranked' : 'draft_only');
  const allowedByPolicy: Record<string, string[]> = {
    admin_only:     [],
    draft_only:     ['draft'],
    until_ranked:   ['draft', 'ranking'],
    until_complete: ['draft', 'ranking', 'ranked', 'active', 'playoffs'],
  };
  return (allowedByPolicy[policy] ?? ['draft']).includes(status);
}

export function addPlayer(id: string, phone: string, targetPhone: string): Promise<{ success: boolean; league: League }> {
  return post(`/api/leagues/${encodeURIComponent(id)}/add-player`, { phone, targetPhone });
}

export function removePlayer(leagueId: string, phone: string, targetId: string): Promise<{ success: boolean; league: League }> {
  return fetch(`${API_BASE}/api/leagues/${encodeURIComponent(leagueId)}/remove-player?phone=${encodeURIComponent(phone)}&target_id=${encodeURIComponent(targetId)}`, { method: 'DELETE' })
    .then(r => r.json());
}

export function addAdmin(id: string, phone: string, targetPhone: string): Promise<{ success: boolean; league: League }> {
  return post(`/api/leagues/${encodeURIComponent(id)}/add-admin`, { phone, targetPhone });
}

export function startRanking(id: string, phone: string): Promise<{ success: boolean; league: League }> {
  return post(`/api/leagues/${encodeURIComponent(id)}/start-ranking`, { phone });
}

export function reopenRanking(id: string, phone: string): Promise<{ success: boolean; league?: League; message?: string }> {
  return post(`/api/leagues/${encodeURIComponent(id)}/reopen-ranking`, { phone });
}

export function submitRanking(id: string, phone: string, rankedIds: string[]): Promise<{ success: boolean; league: League; submitted: number; total: number; allDone: boolean; message?: string }> {
  return post(`/api/leagues/${encodeURIComponent(id)}/submit-ranking`, { phone, rankedIds });
}

export function finalizeRanking(id: string, phone: string, rankedIds?: string[]): Promise<{ success: boolean; league: League; message?: string }> {
  return post(`/api/leagues/${encodeURIComponent(id)}/finalize-ranking`, rankedIds ? { phone, rankedIds } : { phone });
}

export function recalculateRanking(id: string, phone: string): Promise<{ success: boolean; league: League; message?: string }> {
  return post(`/api/leagues/${encodeURIComponent(id)}/recalculate-ranking`, { phone });
}

export function startLeague(id: string, phone: string): Promise<{ success: boolean; league: League }> {
  return post(`/api/leagues/${encodeURIComponent(id)}/start`, { phone });
}

export function updateLeagueBlocks(id: string, phone: string, blocks: LeagueBlock[]): Promise<{ success: boolean; league: League; message?: string }> {
  return fetch(`${API_BASE}/api/leagues/${encodeURIComponent(id)}/blocks`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, blocks }),
  }).then(r => r.json());
}

export function startPlayoffs(leagueId: string, phone: string): Promise<{ success: boolean; league?: League; message?: string }> {
  return post(`/api/leagues/${encodeURIComponent(leagueId)}/start-playoffs`, { phone });
}

export function submitMatch(
  phone: string,
  leagueId: string,
  opponentId: string,
  score: MatchScore,
  submitterPlayerId?: string,
): Promise<{ success: boolean; match: Match }> {
  return post('/api/matches/submit', {
    phone,
    leagueId,
    opponentId,
    score,
    ...(submitterPlayerId ? { submitterPlayerId } : {}),
  });
}

export function submitPlayoffMatch(data: {
  phone: string;
  leagueId: string;
  opponentId: string;
  score: MatchScore;
  playoffGroup: string;
  playoffMatchupId: string;
  submitterPlayerId?: string;
}): Promise<{ success: boolean; match?: Match; message?: string }> {
  return post('/api/matches/submit', {
    ...data,
    isPlayoff: true,
  });
}

export function acceptMatch(id: string, phone: string, leagueId: string): Promise<{ success: boolean; match: Match }> {
  return post(`/api/matches/${encodeURIComponent(id)}/accept`, { phone, leagueId });
}

export function rejectMatch(id: string, phone: string, leagueId: string, note?: string): Promise<{ success: boolean; match: Match }> {
  return post(`/api/matches/${encodeURIComponent(id)}/reject`, note ? { phone, leagueId, note } : { phone, leagueId });
}

export function getPendingMatches(userId: string): Promise<Match[]> {
  return get(`/api/matches/pending?userId=${encodeURIComponent(userId)}`);
}

export function getLeagueMatches(id: string): Promise<Match[]> {
  return get(`/api/leagues/${encodeURIComponent(id)}/matches`);
}

export function getLeagueStandings(id: string): Promise<StandingsResponse> {
  return get(`/api/leagues/${encodeURIComponent(id)}/standings`);
}

export function getStandingBreakdown(id: string): Promise<StandingBreakdownResponse> {
  return get(`/api/leagues/${encodeURIComponent(id)}/standing-breakdown`);
}

export async function getPlayoffs(leagueId: string): Promise<Playoffs | null> {
  const playoffs = await get<Partial<Playoffs> & { groups?: PlayoffGroup[] }>(`/api/leagues/${encodeURIComponent(leagueId)}/playoffs`);
  if (!playoffs || !Array.isArray(playoffs.groups) || playoffs.groups.length === 0 || !playoffs.generatedAt) {
    return null;
  }
  return playoffs as Playoffs;
}

export function getMyRoles(phone: string): Promise<RolesResponse> {
  return get(`/api/me/roles?phone=${encodeURIComponent(phone)}`);
}

export function loginAs(phone: string, targetPhone: string): Promise<{ success: boolean; user: User; impersonating?: User }> {
  return post('/api/admin/login-as', { phone, targetPhone });
}

export function addSuperAdmin(phone: string, targetPhone: string): Promise<{ success: boolean; superAdmins: User[] }> {
  return post('/api/admin/superadmin/add', { phone, targetPhone });
}

export function getAllUsers(): Promise<User[]> {
  return get('/api/all-users');
}

export function deleteUser(requesterPhone: string, userId: string): Promise<{ success: boolean; message: string }> {
  return fetch(`${API_BASE}/api/admin/users/${userId}?phone=${encodeURIComponent(requesterPhone)}`, { method: 'DELETE' })
    .then(res => res.json());
}

export function deleteLeague(requesterPhone: string, leagueId: string): Promise<{ success: boolean; message: string }> {
  return fetch(`${API_BASE}/api/admin/leagues/${encodeURIComponent(leagueId)}?phone=${encodeURIComponent(requesterPhone)}`, { method: 'DELETE' })
    .then(res => res.json());
}

export function renameLeague(
  leagueId: string,
  phone: string,
  name: string,
): Promise<{ success: boolean; league: League; message?: string }> {
  return request(`/api/leagues/${encodeURIComponent(leagueId)}/name`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, name }),
  });
}

export function updateLeagueRules(
  leagueId: string,
  phone: string,
  rules: Partial<LeagueRules> & { scoringFormat?: ScoringFormat | null },
): Promise<{ success: boolean; league: League; message?: string }> {
  return request(`/api/leagues/${encodeURIComponent(leagueId)}/rules`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, rules }),
  });
}

export function updateUserProfile(
  userId: string,
  updates: { firstName?: string; lastName?: string; email?: string; favoriteSport?: string | null },
): Promise<{ success: boolean; user: User; message?: string }> {
  return request(`/api/users/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
}

export function syncPlayerNames(adminPhone: string): Promise<{ success: boolean; leaguesUpdated: number; usersProcessed: number; message?: string }> {
  return post('/api/admin/sync-player-names', { phone: adminPhone });
}

// ── Data browser & App config (super-admin) ────────────────────────────────

export interface DataEntry {
  name: string;
  type: 'file' | 'dir';
  size: number | null;
  modified: string;
  path: string;
}

export interface DataBrowseResult {
  success: boolean;
  dataDir: string;
  currentPath: string;
  entries: DataEntry[];
  message?: string;
}

export interface AppConfig {
  dataDir: string;
  environment: string;
  pythonVersion: string;
  sports: { id: string; label: string }[];
  superAdminCount: number;
  superAdmins: string[];
  userCount: number;
  leagueCountBySport: Record<string, number>;
  totalDataFiles: number;
  defaultRules: LeagueRules;
  sportScoring: Record<string, SportScoring>;
  corsOrigins: string[];
  startedAt: string;
}

export function dataBrowse(phone: string, path = ''): Promise<DataBrowseResult> {
  return get(`/api/admin/data/browse?phone=${encodeURIComponent(phone)}&path=${encodeURIComponent(path)}`);
}

export function dataReadFile(phone: string, path: string): Promise<{ success: boolean; path: string; size: number; isJson: boolean; content: unknown; message?: string }> {
  return get(`/api/admin/data/file?phone=${encodeURIComponent(phone)}&path=${encodeURIComponent(path)}`);
}

export function dataDownloadUrl(phone: string): string {
  return `${API_BASE}/api/admin/data/download?phone=${encodeURIComponent(phone)}`;
}

export interface DataIssue {
  type: string;
  severity: 'warning' | 'error';
  description: string;
  fix: string | null;
  leagueId?: string;
  leagueName?: string;
  sport?: string;
  [key: string]: unknown;
}

export function auditData(phone: string): Promise<{ success: boolean; issues: DataIssue[]; total: number; message?: string }> {
  return get(`/api/admin/maintenance/audit?phone=${encodeURIComponent(phone)}`);
}

export function migrateLeagueIds(phone: string): Promise<{ success: boolean; migrated: { old: string; new: string; sport: string }[]; skipped: string[]; message?: string }> {
  return post('/api/admin/maintenance/migrate-league-ids', { phone });
}

export function fixPlayerIds(phone: string): Promise<{ success: boolean; fixed: { leagueId: string; leagueName: string; oldId: string; newId: string }[]; message?: string }> {
  return post('/api/admin/maintenance/fix-player-ids', { phone });
}

export function purgeStaleVotes(phone: string): Promise<{ success: boolean; purged: { leagueId: string; leagueName: string; staleVoterIds: string[]; staleFinalRankingIds: string[] }[]; message?: string }> {
  return post('/api/admin/maintenance/purge-stale-votes', { phone });
}


export function getAppConfig(phone: string): Promise<{ success: boolean; config: AppConfig; message?: string }> {
  return get(`/api/admin/config?phone=${encodeURIComponent(phone)}`);
}

// ── Doubles ────────────────────────────────────────────────────────

export interface DoublesStandingsRow {
  pair: DoublesPair;
  wins: number;
  losses: number;
  points: number;
  sets_won: number;
  games_won: number;
  rank: number;
  matchLog: {
    matchId: string;
    opponentPairId: string;
    result: 'win' | 'loss';
    basePoints: number;
    score?: MatchScore;
    submittedAt?: string;
  }[];
}

export interface DoublesStandingsResponse {
  leagueId: string;
  standings: DoublesStandingsRow[];
}

export function submitDoublesMatch(data: {
  phone: string;
  leagueId: string;
  team1PlayerIds: [string, string];
  team2PlayerIds: [string, string];
  score: MatchScore;
  pair1Id?: string;
  pair2Id?: string;
  submitterPlayerId?: string;
}): Promise<{ success: boolean; match?: Match; message?: string }> {
  return post('/api/matches/submit-doubles', data);
}

export function getDoublesPairs(leagueId: string): Promise<{ success: boolean; pairs: DoublesPair[]; message?: string }> {
  return get(`/api/leagues/${encodeURIComponent(leagueId)}/doubles/pairs`);
}

export function createDoublesPair(
  leagueId: string,
  phone: string,
  player1Id: string,
  player2Id: string,
  name?: string,
): Promise<{ success: boolean; pair?: DoublesPair; league?: League; message?: string }> {
  return post(`/api/leagues/${encodeURIComponent(leagueId)}/doubles/pairs`, {
    phone, player1Id, player2Id, ...(name ? { name } : {}),
  });
}

export function deleteDoublesPair(leagueId: string, pairId: string, phone: string): Promise<{ success: boolean; league?: League; message?: string }> {
  return fetch(`${API_BASE}/api/leagues/${encodeURIComponent(leagueId)}/doubles/pairs/${encodeURIComponent(pairId)}?phone=${encodeURIComponent(phone)}`, { method: 'DELETE' })
    .then(r => r.json());
}

export function getDoublesStandings(leagueId: string): Promise<DoublesStandingsResponse> {
  return get(`/api/leagues/${encodeURIComponent(leagueId)}/doubles/standings`);
}

export interface DoublesRankingResponse {
  success: boolean;
  pairs: DoublesPair[];
  stackRanks: Record<string, string[]>;
  finalRanking: string[];
  submittedCount: number;
  totalPlayers: number;
  message?: string;
}

export function getDoublesRanking(leagueId: string): Promise<DoublesRankingResponse> {
  return get(`/api/leagues/${encodeURIComponent(leagueId)}/doubles/ranking`);
}

export function submitDoublesRanking(leagueId: string, phone: string, rankedPairIds: string[]): Promise<{ success: boolean; league?: League; submittedCount?: number; totalPlayers?: number; message?: string }> {
  return post(`/api/leagues/${encodeURIComponent(leagueId)}/doubles/ranking/submit`, { phone, rankedPairIds });
}

export function finalizeDoublesRanking(leagueId: string, phone: string, rankedPairIds?: string[]): Promise<{ success: boolean; league?: League; message?: string }> {
  return post(`/api/leagues/${encodeURIComponent(leagueId)}/doubles/ranking/finalize`, { phone, ...(rankedPairIds ? { rankedPairIds } : {}) });
}

export function fixDoublesMatchTypes(leagueId: string, phone: string): Promise<{ success: boolean; fixed?: number; total?: number; message?: string }> {
  return post(`/api/leagues/${encodeURIComponent(leagueId)}/admin/fix-match-types`, { phone });
}

// ── Team League ─────────────────────────────────────────────────

export interface TeamLeagueTeam {
  id: string;
  name: string;
  playerIds: string[];
}

export interface TeamLeagueFixture {
  id: string;
  round: number;
  team1Id: string;
  team2Id: string;
  status: 'pending' | 'completed';
  matchIds: string[];
  matches?: Match[];
  team1Points: number;
  team2Points: number;
  winnerId: string | null;
}

export interface TeamStandingsRow {
  team: TeamLeagueTeam;
  rank: number;
  wins: number;
  losses: number;
  draws: number;
  matchPtsFor: number;
  matchPtsAgainst: number;
  points: number;
}

export interface TeamIndividualRow {
  player: Player;
  teamId: string;
  rank: number;
  wins: number;
  losses: number;
  points: number;
}

export interface TeamStandingsResponse {
  success: boolean;
  teamStandings: TeamStandingsRow[];
  individualStandings: TeamIndividualRow[];
  teams: Record<string, TeamLeagueTeam>;
}

export function teamAutoGroup(leagueId: string, phone: string, numTeams: number): Promise<{
  success: boolean; message?: string;
  teams?: { index: number; name: string; playerIds: string[]; players: Player[] }[];
  totalPlayers?: number; numTeams?: number;
}> {
  return post(`/api/leagues/${encodeURIComponent(leagueId)}/team/auto-group`, { phone, numTeams });
}

export function teamConfirm(leagueId: string, phone: string, teams: { name: string; playerIds: string[] }[], settings: { singlesPerFixture: number; doublesPerFixture: number }): Promise<{ success: boolean; league?: League; teamsCount?: number; fixturesCount?: number; message?: string }> {
  return post(`/api/leagues/${encodeURIComponent(leagueId)}/team/confirm`, { phone, teams, settings });
}

export function getTeamFixtures(leagueId: string): Promise<{ success: boolean; fixtures: TeamLeagueFixture[]; teams: Record<string, TeamLeagueTeam> }> {
  return get(`/api/leagues/${encodeURIComponent(leagueId)}/team/fixtures`);
}

export function getTeamStandings(leagueId: string): Promise<TeamStandingsResponse> {
  return get(`/api/leagues/${encodeURIComponent(leagueId)}/team/standings`);
}

export function teamTagMatch(leagueId: string, fixtureId: string, matchId: string, phone: string): Promise<{ success: boolean; fixture?: TeamLeagueFixture; message?: string }> {
  return post(`/api/leagues/${encodeURIComponent(leagueId)}/team/fixtures/${encodeURIComponent(fixtureId)}/tag-match`, { phone, matchId });
}

export function teamRecomputeFixture(leagueId: string, fixtureId: string, phone: string): Promise<{ success: boolean; fixture?: TeamLeagueFixture; message?: string }> {
  return post(`/api/leagues/${encodeURIComponent(leagueId)}/team/fixtures/${encodeURIComponent(fixtureId)}/recompute`, { phone });
}
