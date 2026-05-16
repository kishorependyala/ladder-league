from fastapi import FastAPI, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
from pydantic import BaseModel
from dotenv import load_dotenv
import json
import os
from datetime import datetime

# Load .env from the backend directory (ignored in prod; Azure uses App Service env vars)
_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
load_dotenv(os.path.join(_BACKEND_DIR, '.env'))

from app.utils.email_sender import send_email
from app.utils.pin_reset import generate_code, verify_code

app = FastAPI()

# Allow CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class League(BaseModel):
    sport: str
    leagues: List[str]

class Member(BaseModel):
    name: str
    recent: list[str]  # List of last 5 results, e.g., ['Win', 'Loss', ...]
    points: int
    games_played: int

class User(BaseModel):
    phone: str
    firstName: str
    lastName: str
    email: Optional[str] = None
    pin: Optional[str] = None

# Resolve DATA_DIR: env var (set by Azure App Service or .env) wins, then repo default.
# Relative paths in DATA_DIR are resolved relative to the backend directory.
_raw_data_dir = os.environ.get('DATA_DIR', '../data')
DATA_DIR = os.path.abspath(os.path.join(_BACKEND_DIR, _raw_data_dir))
SCORES_DIR = os.path.join(DATA_DIR, 'scores')
USERS_DIR = os.path.join(DATA_DIR, 'users')
LEAGUES_FILE = os.path.join(DATA_DIR, 'leagues.json')

# Ensure persistent directories exist on startup (critical for Azure /home mount)
for _d in [DATA_DIR, USERS_DIR, os.path.join(DATA_DIR, 'config'), os.path.join(DATA_DIR, 'sports')]:
    os.makedirs(_d, exist_ok=True)

# ── User storage helpers ────────────────────────────────────────────

def _next_user_id() -> str:
    """Generate a unique user ID: yyyyMMdd + 10-digit sequence (per day)."""
    today = datetime.now().strftime('%Y%m%d')
    os.makedirs(USERS_DIR, exist_ok=True)
    existing = [
        f[8:18] for f in os.listdir(USERS_DIR)
        if f.startswith(today) and f.endswith('.json') and len(f) == 23
    ]
    seq = max((int(s) for s in existing), default=0) + 1
    return f"{today}{seq:010d}"

def load_users() -> list:
    if not os.path.exists(USERS_DIR):
        return []
    users = []
    for fname in sorted(os.listdir(USERS_DIR)):
        if fname.endswith('.json'):
            with open(os.path.join(USERS_DIR, fname), 'r') as f:
                users.append(json.load(f))
    return users

def get_user_by_phone(phone: str) -> Optional[dict]:
    if not os.path.exists(USERS_DIR):
        return None
    for fname in os.listdir(USERS_DIR):
        if fname.endswith('.json'):
            with open(os.path.join(USERS_DIR, fname), 'r') as f:
                u = json.load(f)
            if u.get('phone') == phone:
                return u
    return None

def save_user(user: dict):
    os.makedirs(USERS_DIR, exist_ok=True)
    uid = user['id']
    with open(os.path.join(USERS_DIR, f'{uid}.json'), 'w') as f:
        json.dump(user, f, indent=2)

def _migrate_legacy_users():
    """One-time migration: move users.json entries into per-file storage."""
    legacy = os.path.join(DATA_DIR, 'users.json')
    if not os.path.exists(legacy):
        return
    with open(legacy, 'r') as f:
        old_users = json.load(f)
    if not old_users:
        return
    os.makedirs(USERS_DIR, exist_ok=True)
    migrated = 0
    for u in old_users:
        if not get_user_by_phone(u['phone']):
            uid = _next_user_id()
            u.setdefault('id', uid)
            u.setdefault('createdAt', datetime.now().isoformat())
            save_user(u)
            migrated += 1
    if migrated:
        os.rename(legacy, legacy + '.migrated')
        print(f"[MIGRATE] Moved {migrated} users from users.json → users/")

_migrate_legacy_users()

from app.leagues import (
    SPORTS, SPORT_LABELS, SPORT_SCORING,
    next_league_id, next_match_id,
    save_league, get_league, get_league_by_id, list_leagues, delete_league,
    save_match, get_match, list_matches, get_pending_matches_for_user,
    is_super_admin, add_super_admin, load_superadmin_phones,
    compute_final_ranking, migrate_legacy_leagues, default_rules,
    compute_match_winner, generate_playoffs,
)

migrate_legacy_leagues(DATA_DIR)

def load_leagues():
    if not os.path.exists(LEAGUES_FILE):
        return {}
    with open(LEAGUES_FILE, 'r') as f:
        return json.load(f)

def save_leagues(leagues):
    with open(LEAGUES_FILE, 'w') as f:
        json.dump(leagues, f, indent=2)


@app.get("/api/auth/check-phone")
def check_phone(phone: str = Query(...)):
    return {"exists": get_user_by_phone(phone) is not None}

@app.post("/api/auth/login-with-pin")
def login_with_pin(data: dict = Body(...)):
    phone = data.get('phone')
    pin = data.get('pin')
    user = get_user_by_phone(phone)
    if not user:
        return {"success": False, "message": "User not found"}
    if user.get('pin') != pin:
        return {"success": False, "message": "Incorrect PIN"}
    return {"success": True, "user": user}

@app.post("/api/auth/request-pin-reset")
def request_pin_reset(data: dict = Body(...)):
    phone = data.get('phone')
    user = get_user_by_phone(phone)
    if not user or not user.get('email'):
        return {"success": False, "message": "No email on file for this account"}
    code = generate_code(phone)
    sent = send_email(
        user['email'],
        "Ladder League – PIN Reset Code",
        f"Your PIN reset code is: {code}\n\nThis code expires in 15 minutes."
    )
    masked = user['email'][:2] + '***' + user['email'][user['email'].index('@'):]
    return {"success": True, "sent": sent, "maskedEmail": masked}

@app.post("/api/auth/verify-pin-reset")
def verify_pin_reset(data: dict = Body(...)):
    phone = data.get('phone')
    code = data.get('code')
    new_pin = data.get('newPin')
    if not verify_code(phone, code):
        return {"success": False, "message": "Invalid or expired code"}
    user = get_user_by_phone(phone)
    if not user:
        return {"success": False, "message": "User not found"}
    user['pin'] = new_pin
    save_user(user)
    return {"success": True, "user": user}

@app.post("/api/signup")
def signup(user: User = Body(...)):
    if get_user_by_phone(user.phone):
        return {"success": False, "message": "User already exists"}
    uid = _next_user_id()
    user_data = {**user.dict(), "id": uid, "createdAt": datetime.now().isoformat()}
    save_user(user_data)
    return {"success": True, "user": user_data}

@app.post("/api/login")
def login(data: dict = Body(...)):
    phone = data.get('phone')
    user = get_user_by_phone(phone)
    if user:
        return {"success": True, "user": user}
    return {"success": False, "message": "User not found"}

@app.get("/api/all-users")
def all_users():
    return load_users()


@app.put("/api/users/{user_id}")
def api_update_user(user_id: str, data: dict = Body(...)):
    user = get_user_by_id(user_id)
    if not user:
        return {"success": False, "message": "User not found"}
    for field in ("firstName", "lastName", "email"):
        if field in data:
            user[field] = data[field].strip() if isinstance(data[field], str) else data[field]
    save_user(user)
    return {"success": True, "user": user}


@app.post("/api/join-league")
def join_league(data: dict = Body(...)):
    league = data.get('league')
    user = data.get('user')  # expects dict with at least 'phone', 'firstName', 'lastName'
    if not league or not user:
        return {"success": False, "message": "Missing league or user info"}
    leagues = load_leagues()
    if league not in leagues:
        leagues[league] = []
    # Check if user already in league by phone
    if any(u['phone'] == user['phone'] for u in leagues[league]):
        # Update user info if needed
        for u in leagues[league]:
            if u['phone'] == user['phone']:
                u.update(user)
        save_leagues(leagues)
        return {"success": True, "message": "User already in league, info updated"}
    leagues[league].append(user)
    save_leagues(leagues)
    return {"success": True, "message": "User added to league"}

@app.get("/api/user-leagues")
def get_user_leagues(phone: str = Query(...)):
    leagues = load_leagues()
    joined = []
    for league, members in leagues.items():
        if any(u.get('phone') == phone for u in members):
            joined.append(league)
    return joined

@app.post("/api/add-score")
def add_score(data: dict = Body(...)):
    league = data.get('league')
    if not league:
        return {"success": False, "message": "Missing league name"}
    os.makedirs(SCORES_DIR, exist_ok=True)
    score_file = os.path.join(SCORES_DIR, f"{league.replace(' ', '_').lower()}_scores.json")
    # Load existing scores
    if os.path.exists(score_file):
        with open(score_file, 'r') as f:
            try:
                scores = json.load(f)
            except Exception:
                scores = []
    else:
        scores = []
    # Add timestamp
    data['timestamp'] = datetime.now().isoformat()
    scores.append(data)
    with open(score_file, 'w') as f:
        json.dump(scores, f, indent=2)
    return {"success": True, "message": "Score saved"}

@app.get("/api/league-scores")
def get_league_scores(league: str = Query(...)):
    score_file = os.path.join(SCORES_DIR, f"{league.replace(' ', '_').lower()}_scores.json")
    if os.path.exists(score_file):
        with open(score_file, 'r') as f:
            try:
                return json.load(f)
            except Exception:
                return []
    return []


# ═══════════════════════════════════════════════════════════════════
#  SPORTS & LEAGUES
# ═══════════════════════════════════════════════════════════════════

@app.get("/api/sports")
def get_sports():
    return [{"id": s, "label": SPORT_LABELS[s]} for s in SPORTS]


@app.get("/api/sports/scoring")
def get_sports_scoring():
    return SPORT_SCORING


@app.get("/api/leagues")
def api_list_leagues(sport: Optional[str] = Query(None)):
    return list_leagues(sport)


@app.get("/api/leagues/{league_id}")
def api_get_league(league_id: str):
    lg = get_league_by_id(league_id)
    if not lg:
        return {"success": False, "message": "League not found"}
    return lg


@app.post("/api/leagues/create")
def api_create_league(data: dict = Body(...)):
    phone = data.get("phone")
    if not phone:
        return {"success": False, "message": "phone required"}
    creator = get_user_by_phone(phone)
    if not creator:
        return {"success": False, "message": "User not found"}
    if not is_super_admin(phone) and not data.get("adminOverride"):
        return {"success": False, "message": "Only super admins can create leagues"}

    sport = data.get("sport", "").lower().replace(" ", "-")
    if sport not in SPORTS:
        return {"success": False, "message": f"sport must be one of {SPORTS}"}

    lid = next_league_id(sport)
    rules = {**default_rules(), **data.get("rules", {})}
    league = {
        "id": lid,
        "name": data.get("name", "").strip(),
        "sport": sport,
        "status": "draft",          # draft → ranking → active → playoffs → completed
        "adminIds": [creator["id"]],
        "players": [],
        "startDate": data.get("startDate"),
        "endDate": data.get("endDate"),
        "rules": rules,
        "stackRanks": {},
        "finalRanking": [],
        "createdAt": datetime.now().isoformat(),
    }
    save_league(league)
    return {"success": True, "league": league}


@app.post("/api/leagues/{league_id}/add-admin")
def api_add_admin(league_id: str, data: dict = Body(...)):
    requester_phone = data.get("phone")
    target_phone = data.get("targetPhone")
    lg = get_league_by_id(league_id)
    if not lg:
        return {"success": False, "message": "League not found"}
    requester = get_user_by_phone(requester_phone)
    if not requester:
        return {"success": False, "message": "Requester not found"}
    if not is_super_admin(requester_phone) and requester["id"] not in lg["adminIds"]:
        return {"success": False, "message": "Not authorized"}
    target = get_user_by_phone(target_phone)
    if not target:
        return {"success": False, "message": "Target user not found"}
    if target["id"] not in lg["adminIds"]:
        lg["adminIds"].append(target["id"])
        save_league(lg)
    return {"success": True, "league": lg}


@app.post("/api/leagues/{league_id}/add-player")
def api_add_player(league_id: str, data: dict = Body(...)):
    requester_phone = data.get("phone")
    target_phone = data.get("targetPhone")
    lg = get_league_by_id(league_id)
    if not lg:
        return {"success": False, "message": "League not found"}
    requester = get_user_by_phone(requester_phone)
    if not requester:
        return {"success": False, "message": "Requester not found"}
    if not is_super_admin(requester_phone) and requester["id"] not in lg["adminIds"]:
        return {"success": False, "message": "Not authorized"}
    target = get_user_by_phone(target_phone)
    if not target:
        return {"success": False, "message": "Target user not found"}
    if any(p["id"] == target["id"] for p in lg["players"]):
        return {"success": False, "message": "Player already in league"}
    lg["players"].append({"id": target["id"], "phone": target["phone"],
                           "firstName": target["firstName"], "lastName": target["lastName"]})
    save_league(lg)
    return {"success": True, "league": lg}


@app.delete("/api/leagues/{league_id}/remove-player")
def api_remove_player(league_id: str, phone: str = Query(...), target_id: str = Query(...)):
    lg = get_league_by_id(league_id)
    if not lg:
        return {"success": False, "message": "League not found"}
    if not is_super_admin(phone) and phone not in [get_user_by_id(a).get("phone", "") if get_user_by_id(a) else "" for a in lg["adminIds"]]:
        return {"success": False, "message": "Not authorized"}
    before = len(lg["players"])
    lg["players"] = [p for p in lg["players"] if p["id"] != target_id]
    if len(lg["players"]) == before:
        return {"success": False, "message": "Player not found in league"}
    # also remove from adminIds if present
    lg["adminIds"] = [a for a in lg["adminIds"] if a != target_id]
    save_league(lg)
    return {"success": True, "league": lg}


@app.post("/api/leagues/{league_id}/join")
def api_join_league(league_id: str, data: dict = Body(...)):
    phone = data.get("phone")
    user = get_user_by_phone(phone)
    if not user:
        return {"success": False, "message": "User not found"}
    lg = get_league_by_id(league_id)
    if not lg:
        return {"success": False, "message": "League not found"}

    # Check player isn't already in the league
    if any(p["id"] == user["id"] for p in lg["players"]):
        return {"success": False, "message": "You are already a member of this league"}

    rules = lg.get("rules", default_rules())
    allow_late = rules.get("allowLateJoin", False)
    status = lg["status"]

    # Open statuses: draft is always open for self-join
    # ranking/ranked/active only open if allowLateJoin is enabled
    if status == "draft":
        pass  # always open
    elif status in ("ranking", "ranked", "active") and allow_late:
        pass  # open by admin rule
    elif status in ("playoffs", "completed"):
        return {"success": False, "message": "This league has already concluded"}
    else:
        return {"success": False, "message": "This league is not open for new members"}

    lg["players"].append({
        "id": user["id"],
        "phone": user["phone"],
        "firstName": user["firstName"],
        "lastName": user["lastName"],
    })
    save_league(lg)
    return {"success": True, "league": lg}


# ═══════════════════════════════════════════════════════════════════
#  RANKING PHASE
# ═══════════════════════════════════════════════════════════════════

@app.post("/api/leagues/{league_id}/start-ranking")
def api_start_ranking(league_id: str, data: dict = Body(...)):
    phone = data.get("phone")
    lg = get_league_by_id(league_id)
    if not lg:
        return {"success": False, "message": "League not found"}
    requester = get_user_by_phone(phone)
    if not requester or (requester["id"] not in lg["adminIds"] and not is_super_admin(phone)):
        return {"success": False, "message": "Not authorized"}
    if lg["status"] != "draft":
        return {"success": False, "message": "League must be in draft status"}
    lg["status"] = "ranking"
    save_league(lg)
    return {"success": True, "league": lg}


@app.post("/api/leagues/{league_id}/submit-ranking")
def api_submit_ranking(league_id: str, data: dict = Body(...)):
    phone = data.get("phone")
    ranked_ids = data.get("rankedIds", [])  # ordered list of player IDs
    user = get_user_by_phone(phone)
    if not user:
        return {"success": False, "message": "User not found"}
    lg = get_league_by_id(league_id)
    if not lg:
        return {"success": False, "message": "League not found"}
    if lg["status"] not in ("draft", "ranking", "ranked"):
        return {"success": False, "message": "League is not in a ranking phase"}
    if not any(p["id"] == user["id"] for p in lg["players"]):
        return {"success": False, "message": "You are not in this league"}

    lg.setdefault("stackRanks", {})[user["id"]] = ranked_ids

    # Auto-finalize when all players have submitted (only during active ranking phase)
    all_submitted = all(p["id"] in lg["stackRanks"] for p in lg["players"])
    if all_submitted and lg["status"] == "ranking":
        lg["finalRanking"] = compute_final_ranking(lg)
        lg["status"] = "ranked"

    save_league(lg)
    submitted_count = len(lg["stackRanks"])
    total = len(lg["players"])
    return {"success": True, "league": lg,
            "submitted": submitted_count, "total": total, "allDone": all_submitted}


@app.post("/api/leagues/{league_id}/finalize-ranking")
def api_finalize_ranking(league_id: str, data: dict = Body(...)):
    phone = data.get("phone")
    manual_order = data.get("rankedIds")  # optional manual override
    lg = get_league_by_id(league_id)
    if not lg:
        return {"success": False, "message": "League not found"}
    requester = get_user_by_phone(phone)
    if not requester or (requester["id"] not in lg["adminIds"] and not is_super_admin(phone)):
        return {"success": False, "message": "Not authorized"}
    if lg["status"] not in ("ranking", "ranked"):
        return {"success": False, "message": "League must be in ranking/ranked phase"}

    lg["finalRanking"] = manual_order if manual_order else compute_final_ranking(lg)
    lg["status"] = "ranked"
    save_league(lg)
    return {"success": True, "league": lg}


@app.post("/api/leagues/{league_id}/start")
def api_start_league(league_id: str, data: dict = Body(...)):
    phone = data.get("phone")
    lg = get_league_by_id(league_id)
    if not lg:
        return {"success": False, "message": "League not found"}
    requester = get_user_by_phone(phone)
    if not requester or (requester["id"] not in lg["adminIds"] and not is_super_admin(phone)):
        return {"success": False, "message": "Not authorized"}
    if lg["status"] not in ("ranked", "draft"):
        return {"success": False, "message": "Finalize rankings before starting"}
    if not lg.get("finalRanking"):
        lg["finalRanking"] = [p["id"] for p in lg["players"]]
    lg["status"] = "active"
    lg["startedAt"] = datetime.now().isoformat()
    save_league(lg)
    return {"success": True, "league": lg}


@app.post("/api/leagues/{league_id}/start-playoffs")
def api_start_playoffs(league_id: str, data: dict = Body(...)):
    phone = data.get("phone")
    lg = get_league_by_id(league_id)
    if not lg:
        return {"success": False, "message": "League not found"}
    requester = get_user_by_phone(phone)
    if not requester or (requester["id"] not in lg.get("adminIds", []) and not is_super_admin(phone)):
        return {"success": False, "message": "Not authorized"}
    if lg.get("status") != "active":
        return {"success": False, "message": "League must be active to start playoffs"}
    if len(lg.get("players", [])) < 2:
        return {"success": False, "message": "At least two players are required"}

    standings = _compute_league_standings(lg)
    lg = generate_playoffs(lg, standings)
    lg["status"] = "playoffs"
    save_league(lg)
    return {"success": True, "league": lg}


# ═══════════════════════════════════════════════════════════════════
#  MATCHES
# ═══════════════════════════════════════════════════════════════════

def _normalize_playoff_group(value: Optional[str]) -> str:
    raw = (value or "").strip()
    if raw.lower().startswith("group "):
        raw = raw[6:]
    return raw.upper()


def _match_winner_player_id(match: dict) -> Optional[str]:
    winner = match.get("winner")
    if winner == "submitter":
        return match.get("submitterId")
    if winner == "opponent":
        return match.get("opponentId")
    return winner


def _resolve_playoff_participants(group: dict, matchup_id: str) -> list[str]:
    matchup = group.get("matchups", {}).get(matchup_id, {})
    player_ids = group.get("playerIds", [])
    participants: list[str] = []

    def resolve_seed(seed_index: Optional[int]) -> Optional[str]:
        if seed_index is None:
            return None
        if 0 <= seed_index < len(player_ids):
            return player_ids[seed_index]
        return None

    def resolve_sf_winner(ref_index: int) -> Optional[str]:
        refs = matchup.get("fromSfs", [])
        if ref_index >= len(refs):
            return None
        return group.get("matchups", {}).get(refs[ref_index], {}).get("winnerId")

    refs = matchup.get("fromSfs", [])
    side1 = resolve_seed(matchup.get("side1Seed")) or resolve_sf_winner(0)
    side2 = resolve_seed(matchup.get("side2Seed"))
    if side2 is None:
        ref_index = 0 if matchup.get("side1Seed") is not None or len(refs) == 1 else 1
        side2 = resolve_sf_winner(ref_index)

    if side1:
        participants.append(side1)
    if side2:
        participants.append(side2)
    return participants


def _sync_playoff_match_result(league: dict, match: dict):
    if not match.get("isPlayoff"):
        return

    winner_id = _match_winner_player_id(match)
    if not winner_id:
        return

    group_code = _normalize_playoff_group(match.get("playoffGroup"))
    matchup_id = match.get("playoffMatchupId")
    updated = False

    for group in league.get("playoffs", {}).get("groups", []):
        if _normalize_playoff_group(group.get("name")) != group_code:
            continue
        matchup = group.get("matchups", {}).get(matchup_id)
        if not matchup:
            continue
        matchup["winnerId"] = winner_id
        matchup["matchId"] = match.get("id")
        updated = True
        break

    if updated:
        save_league(league)


@app.post("/api/matches/submit")
def api_submit_match(data: dict = Body(...)):
    phone = data.get("phone")
    league_id = data.get("leagueId")
    opponent_id = data.get("opponentId")
    score_data = data.get("score", {})
    submitter_player_id = data.get("submitterPlayerId")
    is_playoff = bool(data.get("isPlayoff"))
    playoff_group = _normalize_playoff_group(data.get("playoffGroup")) if is_playoff else None
    playoff_matchup_id = data.get("playoffMatchupId") if is_playoff else None

    caller = get_user_by_phone(phone)
    if not caller:
        return {"success": False, "message": "User not found"}
    lg = get_league_by_id(league_id)
    if not lg or lg.get("status") not in ("active", "playoffs"):
        return {"success": False, "message": "League not found or not accepting matches"}
    if not any(p["id"] == opponent_id for p in lg["players"]):
        return {"success": False, "message": "Opponent not in league"}

    is_admin = caller["id"] in lg.get("adminIds", []) or is_super_admin(phone)

    if submitter_player_id:
        if not is_admin:
            return {"success": False, "message": "Only admins can enter matches on behalf of players"}
        submitter_id = submitter_player_id
        require_both = False if is_playoff else True
        admin_submitted_by = caller["id"]
        accepted_sides = []
    else:
        submitter_id = caller["id"]
        require_both = False
        admin_submitted_by = None
        accepted_sides = []

    if not any(p["id"] == submitter_id for p in lg["players"]):
        return {"success": False, "message": "Submitter player not in league"}
    if submitter_id == opponent_id:
        return {"success": False, "message": "Players must be different"}

    if is_playoff:
        if lg.get("status") != "playoffs":
            return {"success": False, "message": "Playoff matches can only be submitted during playoffs"}
        if not playoff_group or not playoff_matchup_id:
            return {"success": False, "message": "Playoff group and matchup are required"}

        playoff_group_doc = next(
            (group for group in lg.get("playoffs", {}).get("groups", []) if _normalize_playoff_group(group.get("name")) == playoff_group),
            None,
        )
        if not playoff_group_doc:
            return {"success": False, "message": "Playoff group not found"}
        playoff_matchup = playoff_group_doc.get("matchups", {}).get(playoff_matchup_id)
        if not playoff_matchup:
            return {"success": False, "message": "Playoff matchup not found"}
        if playoff_matchup.get("winnerId"):
            return {"success": False, "message": "Playoff matchup already completed"}

        expected_participants = sorted(_resolve_playoff_participants(playoff_group_doc, playoff_matchup_id))
        submitted_participants = sorted([submitter_id, opponent_id])
        if len(expected_participants) != 2:
            return {"success": False, "message": "Playoff matchup participants are not ready yet"}
        if submitted_participants != expected_participants:
            return {"success": False, "message": "Submitted players do not match the playoff bracket"}

    mid = next_match_id(lg["sport"], league_id)
    match = {
        "id": mid,
        "leagueId": league_id,
        "sport": lg["sport"],
        "submitterId": submitter_id,
        "opponentId": opponent_id,
        "adminSubmittedBy": admin_submitted_by,
        "requiresBothAccept": require_both,
        "acceptedSides": accepted_sides,
        "score": score_data,
        "status": "pending",
        "submittedAt": datetime.now().isoformat(),
        "resolvedAt": None,
        "isPlayoff": is_playoff,
        "playoffGroup": playoff_group,
        "playoffMatchupId": playoff_matchup_id,
    }
    save_match(match)
    return {"success": True, "match": match}


@app.post("/api/matches/{match_id}/accept")
def api_accept_match(match_id: str, data: dict = Body(...)):
    phone = data.get("phone")
    league_id = data.get("leagueId")
    user = get_user_by_phone(phone)
    if not user:
        return {"success": False, "message": "User not found"}
    lg = get_league_by_id(league_id)
    if not lg:
        return {"success": False, "message": "League not found"}
    match = get_match(lg["sport"], league_id, match_id)
    if not match:
        return {"success": False, "message": "Match not found"}
    if match["status"] != "pending":
        return {"success": False, "message": "Match already resolved"}

    is_admin = user["id"] in lg.get("adminIds", []) or is_super_admin(phone)

    def finalize_match(m):
        m["status"] = "accepted"
        m["resolvedAt"] = datetime.now().isoformat()
        score = m.get("score", {})
        sets = score.get("sets", [])
        scoring_fmt = lg.get("rules", {}).get("scoringFormat")
        if sets:
            m["winner"] = compute_match_winner(sets, lg["sport"], scoring_fmt)
        else:
            sub_score = score.get("submitter", 0)
            opp_score = score.get("opponent", 0)
            m["winner"] = m["submitterId"] if sub_score >= opp_score else m["opponentId"]

    def save_and_sync(m):
        save_match(m)
        if m.get("status") == "accepted":
            _sync_playoff_match_result(lg, m)
        return {"success": True, "match": m}

    if match.get("requiresBothAccept"):
        if is_admin and user["id"] not in [match["submitterId"], match["opponentId"]]:
            match["acceptedSides"] = ["submitter", "opponent"]
            finalize_match(match)
            return save_and_sync(match)
        if user["id"] == match["submitterId"]:
            side = "submitter"
        elif user["id"] == match["opponentId"]:
            side = "opponent"
        else:
            return {"success": False, "message": "Not authorized to accept this match"}
        sides = match.get("acceptedSides", [])
        if side not in sides:
            sides.append(side)
        match["acceptedSides"] = sides
        if "submitter" in sides and "opponent" in sides:
            finalize_match(match)
        return save_and_sync(match)
    else:
        if match["opponentId"] != user["id"] and not is_admin:
            return {"success": False, "message": "Only the opponent can accept"}
        finalize_match(match)
        return save_and_sync(match)


@app.post("/api/matches/{match_id}/reject")
def api_reject_match(match_id: str, data: dict = Body(...)):
    phone = data.get("phone")
    league_id = data.get("leagueId")
    user = get_user_by_phone(phone)
    if not user:
        return {"success": False, "message": "User not found"}
    lg = get_league_by_id(league_id)
    if not lg:
        return {"success": False, "message": "League not found"}
    match = get_match(lg["sport"], league_id, match_id)
    if not match:
        return {"success": False, "message": "Match not found"}
    if match["status"] != "pending":
        return {"success": False, "message": "Match already resolved"}

    is_admin = user["id"] in lg.get("adminIds", []) or is_super_admin(phone)

    if not is_admin and match["opponentId"] != user["id"] and match["submitterId"] != user["id"]:
        return {"success": False, "message": "Not authorized to reject this match"}

    match["status"] = "rejected"
    match["resolvedAt"] = datetime.now().isoformat()
    match["rejectionNote"] = data.get("note", "")
    save_match(match)
    return {"success": True, "match": match}


@app.get("/api/matches/pending")
def api_pending_matches(userId: str = Query(...)):
    return get_pending_matches_for_user(userId)


@app.get("/api/leagues/{league_id}/matches")
def api_league_matches(league_id: str):
    lg = get_league_by_id(league_id)
    if not lg:
        return []
    return list_matches(lg["sport"], league_id)


@app.get("/api/leagues/{league_id}/playoffs")
def api_league_playoffs(league_id: str):
    lg = get_league_by_id(league_id)
    if not lg:
        return {"groups": []}
    return lg.get("playoffs") or {"groups": []}


def _compute_league_standings(lg: dict) -> list[dict]:
    matches = list_matches(lg["sport"], lg["id"])
    rules = {**default_rules(), **lg.get("rules", {})}
    scoring = rules.get("scoring", {"win": 3, "loss": 0, "noGame": -1})
    final_ranking = lg.get("finalRanking", [])
    ranking_positions = {player_id: index for index, player_id in enumerate(final_ranking)}

    stats: dict = {}
    for p in lg["players"]:
        stats[p["id"]] = {"player": p, "wins": 0, "losses": 0, "points": 0, "rank": 0, "matchLog": []}

    for m in matches:
        if m.get("status") != "accepted" or m.get("isPlayoff"):
            continue
        sid = m["submitterId"]
        oid = m["opponentId"]
        winner = _match_winner_player_id(m)
        if not winner:
            score = m.get("score", {})
            sets = score.get("sets", [])
            if sets:
                scoring_fmt = rules.get("scoringFormat")
                computed_winner = compute_match_winner(sets, lg["sport"], scoring_fmt)
                winner = sid if computed_winner == "submitter" else oid
            else:
                sub_score = score.get("submitter", 0)
                opp_score = score.get("opponent", 0)
                winner = sid if sub_score >= opp_score else oid
        loser = oid if winner == sid else sid

        win_pts = scoring.get("win", 3)
        loss_pts = scoring.get("loss", 0)
        upset_bonus = 0
        winner_seed = ranking_positions.get(winner)
        loser_seed = ranking_positions.get(loser)
        if winner_seed is not None and loser_seed is not None and winner_seed > loser_seed:
            upset_bonus = rules.get("upsetBonus", 0)

        submitted_at = m.get("submittedAt") or m.get("createdAt")
        if winner in stats:
            stats[winner]["wins"] += 1
            stats[winner]["points"] += win_pts + upset_bonus
            stats[winner]["matchLog"].append({
                "matchId": m["id"],
                "opponentId": loser,
                "result": "win",
                "basePoints": win_pts,
                "upsetBonus": upset_bonus,
                "score": m.get("score"),
                "submittedAt": submitted_at,
            })
        if loser in stats:
            stats[loser]["losses"] += 1
            stats[loser]["points"] += loss_pts
            stats[loser]["matchLog"].append({
                "matchId": m["id"],
                "opponentId": winner,
                "result": "loss",
                "basePoints": loss_pts,
                "upsetBonus": 0,
                "score": m.get("score"),
                "submittedAt": submitted_at,
            })

    tiebreak_ranking = final_ranking or [p["id"] for p in lg["players"]]
    sorted_stats = sorted(
        stats.values(),
        key=lambda x: (-(x["points"]), tiebreak_ranking.index(x["player"]["id"]) if x["player"]["id"] in tiebreak_ranking else 999)
    )
    for i, s in enumerate(sorted_stats):
        s["rank"] = i + 1
    return sorted_stats


@app.get("/api/leagues/{league_id}/standings")
def api_standings(league_id: str):
    lg = get_league_by_id(league_id)
    if not lg:
        return {"success": False, "message": "League not found"}
    return {"leagueId": league_id, "standings": _compute_league_standings(lg)}


# ═══════════════════════════════════════════════════════════════════
#  ADMIN & SUPER ADMIN
# ═══════════════════════════════════════════════════════════════════

@app.get("/api/me/roles")
def api_my_roles(phone: str = Query(...)):
    user = get_user_by_phone(phone)
    if not user:
        return {"success": False, "message": "User not found"}
    leagues_admin = [lg for lg in list_leagues() if user["id"] in lg.get("adminIds", [])]
    return {
        "userId": user["id"],
        "isSuperAdmin": is_super_admin(phone),
        "adminLeagueIds": [lg["id"] for lg in leagues_admin],
    }


@app.post("/api/admin/superadmin/add")
def api_add_superadmin(data: dict = Body(...)):
    requester_phone = data.get("phone")
    target_phone = data.get("targetPhone")
    if not is_super_admin(requester_phone):
        return {"success": False, "message": "Not authorized"}
    add_super_admin(target_phone)
    return {"success": True, "superAdmins": load_superadmin_phones()}


@app.post("/api/admin/login-as")
def api_login_as(data: dict = Body(...)):
    requester_phone = data.get("phone")
    target_phone = data.get("targetPhone")
    if not is_super_admin(requester_phone):
        return {"success": False, "message": "Not authorized"}
    target = get_user_by_phone(target_phone)
    if not target:
        return {"success": False, "message": "Target user not found"}
    return {"success": True, "user": target, "impersonating": True}


@app.delete("/api/admin/users/{user_id}")
def api_delete_user(user_id: str, phone: str = Query(...)):
    if not is_super_admin(phone):
        return {"success": False, "message": "Not authorized"}
    path = os.path.join(USERS_DIR, f"{user_id}.json")
    if not os.path.exists(path):
        return {"success": False, "message": "User not found"}
    os.remove(path)
    return {"success": True, "message": f"User {user_id} deleted"}


@app.put("/api/leagues/{league_id}/rules")
def api_update_league_rules(league_id: str, data: dict = Body(...)):
    phone = data.get("phone")
    if not phone:
        return {"success": False, "message": "phone required"}
    lg = get_league_by_id(league_id)
    if not lg:
        return {"success": False, "message": "League not found"}
    if not is_super_admin(phone) and phone not in [p.get("phone") for p in lg.get("players", [])] and \
       get_user_by_phone(phone) and get_user_by_phone(phone)["id"] not in lg.get("adminIds", []):
        return {"success": False, "message": "Not authorized"}
    rules = lg.get("rules", default_rules())
    incoming = data.get("rules", {})
    # Deep merge: top-level keys merged, scoring sub-dict merged
    for key, val in incoming.items():
        if key == "scoring" and isinstance(val, dict):
            rules["scoring"] = {**rules.get("scoring", {}), **val}
        else:
            rules[key] = val
    lg["rules"] = rules
    save_league(lg)
    return {"success": True, "league": lg}


@app.delete("/api/admin/leagues/{league_id}")
def api_delete_league(league_id: str, phone: str = Query(...)):
    if not is_super_admin(phone):
        return {"success": False, "message": "Not authorized"}
    if not delete_league(league_id):
        return {"success": False, "message": "League not found"}
    return {"success": True, "message": f"League {league_id} deleted"}



# ═══════════════════════════════════════════════════════════════════
#  DATA BROWSER & APP CONFIG  (super-admin only)
# ═══════════════════════════════════════════════════════════════════

def _safe_rel(path: str) -> str:
    """Normalise a user-supplied relative path so it can't escape DATA_DIR."""
    # Strip leading slashes / dots to prevent directory traversal
    clean = os.path.normpath(path.lstrip("/").lstrip(".")) if path else "."
    if clean == ".":
        return ""
    return clean


@app.get("/api/admin/data/browse")
def api_data_browse(phone: str = Query(...), path: str = Query(default="")):
    if not is_super_admin(phone):
        return {"success": False, "message": "Not authorized"}
    rel = _safe_rel(path)
    abs_path = os.path.join(DATA_DIR, rel) if rel else DATA_DIR
    abs_path = os.path.abspath(abs_path)
    # Guard: must still be inside DATA_DIR
    if not abs_path.startswith(os.path.abspath(DATA_DIR)):
        return {"success": False, "message": "Access denied"}
    if not os.path.exists(abs_path):
        return {"success": False, "message": "Path not found"}
    if os.path.isfile(abs_path):
        return {"success": False, "message": "Path is a file; use /api/admin/data/file"}
    entries = []
    try:
        for name in sorted(os.listdir(abs_path)):
            full = os.path.join(abs_path, name)
            entry_rel = os.path.relpath(full, DATA_DIR)
            stat = os.stat(full)
            entries.append({
                "name": name,
                "type": "dir" if os.path.isdir(full) else "file",
                "size": stat.st_size if os.path.isfile(full) else None,
                "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                "path": entry_rel,
            })
    except PermissionError:
        return {"success": False, "message": "Permission denied"}
    return {
        "success": True,
        "dataDir": DATA_DIR,
        "currentPath": os.path.relpath(abs_path, DATA_DIR) if abs_path != DATA_DIR else "",
        "entries": entries,
    }


@app.get("/api/admin/data/file")
def api_data_file(phone: str = Query(...), path: str = Query(...)):
    if not is_super_admin(phone):
        return {"success": False, "message": "Not authorized"}
    rel = _safe_rel(path)
    abs_path = os.path.abspath(os.path.join(DATA_DIR, rel))
    if not abs_path.startswith(os.path.abspath(DATA_DIR)):
        return {"success": False, "message": "Access denied"}
    if not os.path.isfile(abs_path):
        return {"success": False, "message": "File not found"}
    size = os.path.getsize(abs_path)
    if size > 500_000:  # 500 KB cap
        return {"success": False, "message": f"File too large to display ({size} bytes)"}
    try:
        with open(abs_path, "r", encoding="utf-8") as f:
            raw = f.read()
        try:
            content = json.loads(raw)
            is_json = True
        except Exception:
            content = raw
            is_json = False
        return {"success": True, "path": rel, "size": size, "isJson": is_json, "content": content}
    except Exception as e:
        return {"success": False, "message": str(e)}


@app.get("/api/admin/config")
def api_admin_config(phone: str = Query(...)):
    if not is_super_admin(phone):
        return {"success": False, "message": "Not authorized"}
    from app.leagues import SPORTS, SPORT_LABELS, SPORT_SCORING, default_rules
    superadmins = load_superadmin_phones()
    # Count data files
    total_files = sum(len(files) for _, _, files in os.walk(DATA_DIR))
    user_count = len([f for f in os.listdir(USERS_DIR) if f.endswith(".json")]) if os.path.isdir(USERS_DIR) else 0
    leagues_by_sport = {}
    for sp in SPORTS:
        ld = os.path.join(DATA_DIR, "sports", sp, "leagues")
        if os.path.isdir(ld):
            leagues_by_sport[sp] = len([f for f in os.listdir(ld) if f.endswith(".json")])
        else:
            leagues_by_sport[sp] = 0
    return {
        "success": True,
        "config": {
            "dataDir": DATA_DIR,
            "environment": os.environ.get("WEBSITE_SITE_NAME", "local"),
            "pythonVersion": __import__("sys").version,
            "sports": [{"id": s, "label": SPORT_LABELS[s]} for s in SPORTS],
            "superAdminCount": len(superadmins),
            "superAdmins": superadmins,
            "userCount": user_count,
            "leagueCountBySport": leagues_by_sport,
            "totalDataFiles": total_files,
            "defaultRules": default_rules(),
            "sportScoring": SPORT_SCORING,
            "corsOrigins": ["*"],
            "startedAt": datetime.now().isoformat(),
        }
    }
