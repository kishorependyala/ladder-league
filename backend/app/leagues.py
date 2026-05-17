"""
League and match storage helpers.

Data layout:
  data/sports/{sport}/leagues/{leagueId}.json
  data/sports/{sport}/leagues/{leagueId}/matches/{matchId}.json
  data/config/superadmins.json
"""
import json
import os
from datetime import datetime
from typing import Optional
from copy import deepcopy

SPORTS = ["tennis", "table-tennis", "pickleball", "badminton"]
SPORT_LABELS = {
    "tennis": "Tennis",
    "table-tennis": "Table Tennis",
    "pickleball": "Pickleball",
    "badminton": "Badminton",
}

# Scoring format per sport:
#   unit          - "set" (tennis) or "game" (others)
#   wins_needed   - units needed to win the match
#   max_units     - maximum units in a match (e.g. 3 for best-of-3)
#   points_to_win - target score per unit
#   win_by        - margin required
#   max_points    - hard ceiling (None = no ceiling)
SPORT_SCORING = {
    "tennis": {
        "unit": "set", "unit_plural": "sets",
        "wins_needed": 2, "max_units": 3,
        "points_to_win": 6, "win_by": 2, "max_points": 7,
    },
    "table-tennis": {
        "unit": "game", "unit_plural": "games",
        "wins_needed": 3, "max_units": 5,
        "points_to_win": 11, "win_by": 2, "max_points": None,
    },
    "pickleball": {
        "unit": "game", "unit_plural": "games",
        "wins_needed": 2, "max_units": 3,
        "points_to_win": 11, "win_by": 2, "max_points": None,
    },
    "badminton": {
        "unit": "game", "unit_plural": "games",
        "wins_needed": 2, "max_units": 3,
        "points_to_win": 21, "win_by": 2, "max_points": 30,
    },
}


def _resolve_scoring_cfg(sport: str, scoring_format: Optional[dict] = None) -> dict:
    """Merge sport defaults with any per-league scoringFormat overrides."""
    base = dict(SPORT_SCORING.get(sport, SPORT_SCORING["tennis"]))
    if scoring_format:
        base.update({k: v for k, v in scoring_format.items() if v is not None})
    return base


def unit_winner(me: int, opp: int, sport: str, scoring_format: Optional[dict] = None) -> Optional[str]:
    """Return 'me', 'opp', or None if the set/game is not yet decided."""
    cfg = _resolve_scoring_cfg(sport, scoring_format)
    hi, lo = max(me, opp), min(me, opp)
    side = "me" if me > opp else "opp"
    if cfg["unit"] == "set":  # tennis-style
        if hi == 6 and lo <= 4: return side
        if hi == 7 and lo in (5, 6): return side
        return None
    else:
        ptw, wb, mx = cfg["points_to_win"], cfg["win_by"], cfg["max_points"]
        if hi >= ptw and (hi - lo) >= wb: return side
        if mx and hi >= mx: return side
        return None


def compute_match_winner(sets: list, sport: str, scoring_format: Optional[dict] = None) -> Optional[str]:
    """Return 'submitter', 'opponent', or None from a list of {me, opp} dicts."""
    cfg = _resolve_scoring_cfg(sport, scoring_format)
    me_wins = opp_wins = 0
    for s in sets:
        w = unit_winner(s.get("me", 0), s.get("opp", 0), sport, scoring_format)
        if w == "me": me_wins += 1
        elif w == "opp": opp_wins += 1
    wn = cfg["wins_needed"]
    if me_wins >= wn: return "submitter"
    if opp_wins >= wn: return "opponent"
    return None


def _data_dir() -> str:
    from app.main import DATA_DIR
    return DATA_DIR


def _sports_dir() -> str:
    return os.path.join(_data_dir(), "sports")


def _league_path(sport: str, league_id: str) -> str:
    return os.path.join(_sports_dir(), sport, "leagues", f"{league_id}.json")


def _matches_dir(sport: str, league_id: str) -> str:
    return os.path.join(_sports_dir(), sport, "leagues", league_id, "matches")


def _match_path(sport: str, league_id: str, match_id: str) -> str:
    return os.path.join(_matches_dir(sport, league_id), f"{match_id}.json")


def _config_dir() -> str:
    return os.path.join(_data_dir(), "config")


# ── ID generation ──────────────────────────────────────────────────

def _next_id(directory: str, prefix: str = "") -> str:
    """Generate yyyyMMdd + 10-digit sequence ID, scanning existing files."""
    os.makedirs(directory, exist_ok=True)
    today = datetime.now().strftime("%Y%m%d")
    tag = today if not prefix else f"{prefix}{today}"
    existing = [
        f[len(tag): len(tag) + 10]
        for f in os.listdir(directory)
        if f.startswith(tag) and f.endswith(".json") and len(f) == len(tag) + 15
    ]
    seq = max((int(s) for s in existing if s.isdigit()), default=0) + 1
    return f"{tag}{seq:010d}"


def next_league_id(sport: str) -> str:
    leagues_dir = os.path.join(_sports_dir(), sport, "leagues")
    os.makedirs(leagues_dir, exist_ok=True)
    return _next_id(leagues_dir)


def next_match_id(sport: str, league_id: str) -> str:
    mdir = _matches_dir(sport, league_id)
    os.makedirs(mdir, exist_ok=True)
    return _next_id(mdir)


# ── League CRUD ────────────────────────────────────────────────────

def save_league(league: dict):
    sport = league["sport"]
    lid = league["id"]
    path = _league_path(sport, lid)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(league, f, indent=2)


def delete_league(league_id: str) -> bool:
    """Delete a league file (and its matches folder) by ID. Returns True if found and deleted."""
    for sport in SPORTS:
        path = _league_path(sport, league_id)
        if os.path.exists(path):
            os.remove(path)
            # also remove matches subfolder if present
            matches_dir = os.path.join(os.path.dirname(path), league_id)
            if os.path.isdir(matches_dir):
                import shutil
                shutil.rmtree(matches_dir)
            return True
    return False


def get_league(sport: str, league_id: str) -> Optional[dict]:
    path = _league_path(sport, league_id)
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


def get_league_by_id(league_id: str) -> Optional[dict]:
    """Search all sports for a league by ID."""
    for sport in SPORTS:
        lg = get_league(sport, league_id)
        if lg:
            return lg
    return None


def list_leagues(sport: Optional[str] = None) -> list:
    sports = [sport] if sport else SPORTS
    leagues = []
    for s in sports:
        d = os.path.join(_sports_dir(), s, "leagues")
        if not os.path.exists(d):
            continue
        for fname in sorted(os.listdir(d)):
            if fname.endswith(".json"):
                fpath = os.path.join(d, fname)
                with open(fpath) as f:
                    leagues.append(json.load(f))
    return leagues


# ── Match CRUD ─────────────────────────────────────────────────────

def save_match(match: dict):
    sport = match["sport"]
    lid = match["leagueId"]
    mid = match["id"]
    path = _match_path(sport, lid, mid)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(match, f, indent=2)


def get_match(sport: str, league_id: str, match_id: str) -> Optional[dict]:
    path = _match_path(sport, league_id, match_id)
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


def list_matches(sport: str, league_id: str) -> list:
    mdir = _matches_dir(sport, league_id)
    if not os.path.exists(mdir):
        return []
    matches = []
    for fname in sorted(os.listdir(mdir)):
        if fname.endswith(".json"):
            with open(os.path.join(mdir, fname)) as f:
                matches.append(json.load(f))
    return matches


def get_pending_matches_for_user(user_id: str) -> list:
    """Return all matches awaiting acceptance by this user."""
    pending = []
    for league in list_leagues():
        if league.get("status") not in ("active", "playoffs"):
            continue
        for m in list_matches(league["sport"], league["id"]):
            if m.get("status") != "pending":
                continue
            accepted_sides = m.get("acceptedSides", [])
            requires_both = m.get("requiresBothAccept", False)
            if requires_both:
                if m.get("opponentId") == user_id and "opponent" not in accepted_sides:
                    pending.append(m)
                elif m.get("submitterId") == user_id and "submitter" not in accepted_sides:
                    pending.append(m)
            else:
                if m.get("opponentId") == user_id:
                    pending.append(m)
    return pending


# ── Super admin ────────────────────────────────────────────────────

def load_superadmin_phones() -> list:
    path = os.path.join(_config_dir(), "superadmins.json")
    if not os.path.exists(path):
        return []
    with open(path) as f:
        return json.load(f).get("superAdminPhones", [])


def is_super_admin(phone: str) -> bool:
    return phone in load_superadmin_phones()


def add_super_admin(phone: str):
    path = os.path.join(_config_dir(), "superadmins.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    phones = load_superadmin_phones()
    if phone not in phones:
        phones.append(phone)
        with open(path, "w") as f:
            json.dump({"superAdminPhones": phones}, f, indent=2)


def _playoff_group_name(index: int) -> str:
    name = ""
    value = index
    while True:
        name = chr(ord("A") + (value % 26)) + name
        value = value // 26 - 1
        if value < 0:
            return f"Group {name}"


def _split_playoff_player_ids(player_ids: list[str]) -> list[list[str]]:
    total = len(player_ids)
    if total <= 0:
        return []
    if total == 1:
        return [player_ids[:]]
    if total == 2:
        return [player_ids[:2]]

    base_size = 3 if total < 8 else 4
    full_groups = total // base_size
    remainder = total % base_size

    if remainder == 0:
        sizes = [base_size] * full_groups
    elif remainder == 1 and full_groups >= 1:
        sizes = [base_size] * (full_groups - 1) + [base_size - 1, 2]
    else:
        sizes = [base_size] * full_groups + [remainder]

    groups = []
    cursor = 0
    for size in sizes:
        groups.append(player_ids[cursor:cursor + size])
        cursor += size
    return [group for group in groups if group]


def generate_playoffs(league_doc: dict, standings: list[dict]) -> dict:
    ranked_player_ids = [
        row.get("player", {}).get("id")
        for row in sorted(standings, key=lambda row: row.get("rank", 999999))
        if row.get("player", {}).get("id")
    ]
    groups = []

    for index, group_player_ids in enumerate(_split_playoff_player_ids(ranked_player_ids)):
        matchup_map = {}
        if len(group_player_ids) >= 4:
            matchup_map = {
                "sf1": {"side1Seed": 0, "side2Seed": 3, "matchId": None, "winnerId": None},
                "sf2": {"side1Seed": 1, "side2Seed": 2, "matchId": None, "winnerId": None},
                "final": {"fromSfs": ["sf1", "sf2"], "matchId": None, "winnerId": None},
            }
        elif len(group_player_ids) == 3:
            matchup_map = {
                "sf1": {"side1Seed": 1, "side2Seed": 2, "matchId": None, "winnerId": None},
                "final": {"side1Seed": 0, "fromSfs": ["sf1"], "matchId": None, "winnerId": None},
            }
        elif len(group_player_ids) == 2:
            matchup_map = {
                "final": {"side1Seed": 0, "side2Seed": 1, "matchId": None, "winnerId": None},
            }

        groups.append({
            "name": _playoff_group_name(index),
            "playerIds": group_player_ids,
            "matchups": matchup_map,
        })

    updated_league = deepcopy(league_doc)
    updated_league["playoffs"] = {
        "groups": groups,
        "generatedAt": datetime.now().isoformat(),
    }
    return updated_league


# ── Ranking ────────────────────────────────────────────────────────

def compute_final_ranking(league: dict) -> list:
    """
    Average position: each player's submitted ranking contributes positional scores.
    Lower average position = higher final rank.
    Players not ranked by a voter are placed last.
    """
    player_ids = [p["id"] for p in league.get("players", [])]
    n = len(player_ids)
    submissions = league.get("stackRanks", {})  # { userId: [playerId, ...] }

    scores: dict = {pid: 0.0 for pid in player_ids}
    voters = 0

    for _, ranked_list in submissions.items():
        voters += 1
        # Assign position score (1 = best). Unranked players get n+1.
        positions = {pid: (ranked_list.index(pid) + 1) if pid in ranked_list else n + 1
                     for pid in player_ids}
        for pid, pos in positions.items():
            scores[pid] += pos

    if voters == 0:
        return player_ids  # no submissions — keep original order

    return sorted(player_ids, key=lambda pid: scores[pid])


# ── Legacy migration ───────────────────────────────────────────────

def migrate_legacy_leagues(data_dir: str):
    """One-time: convert old leagues.json {leagueName: [members]} into new format."""
    legacy = os.path.join(data_dir, "leagues.json")
    if not os.path.exists(legacy):
        return

    with open(legacy) as f:
        old = json.load(f)

    if not isinstance(old, dict):
        return

    # Detect if already migrated (values are lists of member dicts)
    # Skip if already migrated marker exists
    marker = legacy + ".migrated"
    if os.path.exists(marker):
        return

    from app.main import get_user_by_phone

    sport_map = {
        "tennis": "tennis",
        "badminton": "badminton",
        "pickleball": "pickleball",
        "table-tennis": "table-tennis",
        "table tennis": "table-tennis",
    }

    migrated = 0
    for league_name, members in old.items():
        # Guess sport from name
        sport = "tennis"
        lower = league_name.lower()
        for key, val in sport_map.items():
            if key in lower:
                sport = val
                break

        leagues_dir = os.path.join(data_dir, "sports", sport, "leagues")
        os.makedirs(leagues_dir, exist_ok=True)
        lid = _next_id(leagues_dir)

        # Resolve member user IDs
        player_list = []
        for m in members:
            u = get_user_by_phone(m.get("phone", ""))
            if u:
                player_list.append({"id": u["id"], "phone": u["phone"],
                                     "firstName": u["firstName"], "lastName": u["lastName"]})

        league_doc = {
            "id": lid,
            "name": league_name,
            "sport": sport,
            "status": "active",
            "adminIds": [],
            "players": player_list,
            "startDate": None,
            "endDate": None,
            "rules": default_rules(),
            "stackRanks": {},
            "finalRanking": [p["id"] for p in player_list],
            "createdAt": datetime.now().isoformat(),
        }
        path = os.path.join(leagues_dir, f"{lid}.json")
        with open(path, "w") as f:
            json.dump(league_doc, f, indent=2)
        migrated += 1

    if migrated:
        os.rename(legacy, marker)
        print(f"[MIGRATE] Converted {migrated} leagues from leagues.json → sports/")


def default_rules() -> dict:
    return {
        "blockDurationDays": 7,
        "playoffsWeeks": 1,
        "minGamesPerBlock": 1,
        "penaltyForNoGame": 1,
        "scoring": {
            "win": 3,
            "loss": 0,
            "noGame": -1,
        },
        "scoringFormat": None,
        "matchFormat": "adhoc",
        "minMatchesPerWeek": 1,
        "penaltyPerMissedWeek": 1,
        "upsetBonus": 1,
        # joinPolicy controls when players can self-join:
        #   'draft_only'         - only while league is in draft (default)
        #   'until_ranked'       - open during draft + ranking phases
        #   'until_complete'     - open at any time until league completes
        #   'admin_only'         - no self-join; admin must add manually
        "joinPolicy": "draft_only",
        # newPlayerRankPolicy: where a late-joining player lands in standings
        #   'bottom'       - placed last (safest, default)
        #   'middle'       - placed at midpoint of current standings
        #   'provisional'  - placed at midpoint, marked provisional for N matches
        #   'admin_set'    - left unranked until admin manually assigns a position
        "newPlayerRankPolicy": "bottom",
        # lateJoinCap: max number of players who can join after draft (null = unlimited)
        "lateJoinCap": None,
    }
