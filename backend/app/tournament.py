"""Ad-hoc knockout/round-robin tournament brackets for a subset of league players.

Distinct from the season-ending `playoffs` system in leagues.py — a tournament here is
created/edited/recreated by the admin at any time, for any hand-picked subset of players
(4, 5, 6, 8, or 12). Tournament matches are entered through the normal match-submission
flow and count toward ladder standings/points like any other match — what makes a match
"belong" to the tournament's results is simply that it was played between two players who
share an expected matchup slot, within the date range the admin sets for the tournament.
Supported formats:

- 4 / 8 / 12 players → one group of 4 per every 4 players ("Group A", "Group B", ...),
  each an independent 4-player knockout: semi 1 = group-seed 1 vs 3, semi 2 = group-seed
  2 vs 4, then a final (semi winners) and a 3rd-place match (semi losers). Groups do not
  play each other.
- 6 players → two groups of 3 (Group A = overall seeds 1/3/5, Group B = seeds 2/4/6),
  each a round-robin, then a cross-group placement stage: A-rank1 vs B-rank1 for 1st/2nd,
  A-rank2 vs B-rank2 for 3rd/4th, A-rank3 vs B-rank3 for 5th/6th.
- 5 players → a single round-robin among all five; final ranking comes straight from the
  round-robin standings (no placement stage).
"""

from __future__ import annotations

from datetime import datetime, date, timedelta
from typing import Optional

SUPPORTED_PLAYER_COUNTS = (4, 5, 6, 8, 12)


def _group_name(index: int) -> str:
    return f"Group {chr(ord('A') + index)}"


def distribute_snake(seeded_ids: list[str], num_groups: int) -> list[list[str]]:
    """Distribute overall seeds 1..N across `num_groups` groups by seed % num_groups,
    e.g. for 2 groups: seeds 1,3,5 → group 0; seeds 2,4,6 → group 1 (matches the 6-player
    reference format), and for 3 groups seeds cycle A,B,C,A,B,C...
    """
    groups: list[list[str]] = [[] for _ in range(num_groups)]
    for i, pid in enumerate(seeded_ids):
        groups[i % num_groups].append(pid)
    return groups


def round_robin_pairs(ids: list[str]) -> list[list[tuple[Optional[str], Optional[str]]]]:
    """Classic circle-method round robin. Returns a list of rounds, each a list of
    (a, b) pairs — one side may be None to represent a bye when `ids` has odd length.
    """
    arr: list[Optional[str]] = list(ids)
    if len(arr) % 2 == 1:
        arr.append(None)
    n = len(arr)
    rounds = []
    cur = arr[:]
    for _ in range(n - 1):
        pairs = [(cur[i], cur[n - 1 - i]) for i in range(n // 2)]
        rounds.append(pairs)
        cur = [cur[0]] + [cur[-1]] + cur[1:-1]
    return rounds


def _time_slot(scheduled_date: str, start_time: str, offset_minutes: int, duration_minutes: int) -> dict:
    try:
        anchor = datetime.fromisoformat(f"{scheduled_date}T{start_time or '09:00'}")
    except ValueError:
        anchor = datetime.fromisoformat(f"{scheduled_date}T09:00")
    start = anchor + timedelta(minutes=offset_minutes)
    end = start + timedelta(minutes=duration_minutes)
    return {
        "startsAt": start.isoformat(),
        "endsAt": end.isoformat(),
        "label": f"{start.strftime('%-I:%M %p')}–{end.strftime('%-I:%M %p')}",
    }


def _build_roundrobin_group(name: str, seeded_ids: list[str], duration_minutes: int,
                             scheduled_date: str, start_time: str) -> dict:
    rounds_pairs = round_robin_pairs(seeded_ids)
    rounds = []
    matchups = {}
    for r_idx, pairs in enumerate(rounds_pairs):
        round_matches = []
        for m_idx, (a, b) in enumerate(pairs):
            if a is None or b is None:
                continue  # the bye side has no match
            mid = f"{name}-rr-{r_idx}-{m_idx}"
            matchup = {
                "matchupId": mid, "playerAId": a, "playerBId": b,
                "matchId": None, "winnerId": None,
            }
            matchups[mid] = matchup
            round_matches.append(matchup)
        bye_player_id = None
        for a, b in pairs:
            if a is None:
                bye_player_id = b
            elif b is None:
                bye_player_id = a
        rounds.append({
            "roundIndex": r_idx,
            "label": f"Round {r_idx + 1}",
            "matches": round_matches,
            "byePlayerId": bye_player_id,
            **_time_slot(scheduled_date, start_time, r_idx * duration_minutes, duration_minutes),
            "durationMinutes": duration_minutes,
        })
    return {
        "name": name, "type": "roundrobin", "playerIds": seeded_ids,
        "rounds": rounds, "matchups": matchups,
    }


def _build_knockout4_group(name: str, seeded_ids: list[str], semis_minutes: int, finals_minutes: int,
                            scheduled_date: str, start_time: str, round0_offset: int) -> dict:
    sf1_id, sf2_id, final_id, third_id = f"{name}-sf1", f"{name}-sf2", f"{name}-final", f"{name}-third"
    matchups = {
        sf1_id: {"matchupId": sf1_id, "label": "Semifinal 1", "playerAId": seeded_ids[0], "playerBId": seeded_ids[2], "matchId": None, "winnerId": None},
        sf2_id: {"matchupId": sf2_id, "label": "Semifinal 2", "playerAId": seeded_ids[1], "playerBId": seeded_ids[3], "matchId": None, "winnerId": None},
        final_id: {"matchupId": final_id, "label": "Final", "pendingA": "Winner Semifinal 1", "pendingB": "Winner Semifinal 2", "fromMatchups": [sf1_id, sf2_id], "side": "winners", "playerAId": None, "playerBId": None, "matchId": None, "winnerId": None},
        third_id: {"matchupId": third_id, "label": "3rd Place", "pendingA": "Loser Semifinal 1", "pendingB": "Loser Semifinal 2", "fromMatchups": [sf1_id, sf2_id], "side": "losers", "playerAId": None, "playerBId": None, "matchId": None, "winnerId": None},
    }
    rounds = [
        {
            "roundIndex": 0, "label": "Semifinals",
            "matches": [matchups[sf1_id], matchups[sf2_id]],
            **_time_slot(scheduled_date, start_time, round0_offset, semis_minutes),
            "durationMinutes": semis_minutes,
        },
        {
            "roundIndex": 1, "label": "Final & 3rd Place",
            "matches": [matchups[final_id], matchups[third_id]],
            **_time_slot(scheduled_date, start_time, round0_offset + semis_minutes, finals_minutes),
            "durationMinutes": finals_minutes,
        },
    ]
    return {
        "name": name, "type": "knockout4", "playerIds": seeded_ids,
        "rounds": rounds, "matchups": matchups,
    }


def build_tournament(player_ids_seeded: list[str], scheduled_date: str, start_time: str,
                      match_duration_minutes: int, finals_duration_minutes: int) -> dict:
    n = len(player_ids_seeded)
    if n not in SUPPORTED_PLAYER_COUNTS:
        raise ValueError(f"Tournament requires exactly {', '.join(map(str, SUPPORTED_PLAYER_COUNTS))} players (got {n}).")

    created = {
        "createdAt": datetime.now().isoformat(),
        "updatedAt": datetime.now().isoformat(),
        "scheduledDate": scheduled_date,
        "startTime": start_time or "09:00",
        "matchDurationMinutes": match_duration_minutes,
        "finalsDurationMinutes": finals_duration_minutes,
        "playerIds": player_ids_seeded,
        "resultsWindow": None,
    }

    if n == 5:
        group = _build_roundrobin_group(_group_name(0), player_ids_seeded, match_duration_minutes, scheduled_date, start_time)
        created["format"] = "round_robin_5"
        created["groups"] = [group]
        created["stage2"] = None
        return created

    if n == 6:
        groups_ids = distribute_snake(player_ids_seeded, 2)
        groups = [_build_roundrobin_group(_group_name(i), gid, match_duration_minutes, scheduled_date, start_time) for i, gid in enumerate(groups_ids)]
        group_stage_rounds = max(len(g["rounds"]) for g in groups)
        stage2_offset = group_stage_rounds * match_duration_minutes
        stage2_matches = []
        stage2_labels = ["1st & 2nd Place", "3rd & 4th Place", "5th & 6th Place"]
        for rank_idx in range(3):
            mid = f"stage2-{rank_idx}"
            stage2_matches.append({
                "matchupId": mid,
                "label": stage2_labels[rank_idx],
                "fromGroupRank": [{"group": groups[0]["name"], "rank": rank_idx + 1}, {"group": groups[1]["name"], "rank": rank_idx + 1}],
                "playerAId": None, "playerBId": None, "matchId": None, "winnerId": None,
            })
        created["format"] = "two_groups_of_3"
        created["groups"] = groups
        created["stage2"] = {
            "label": "Cross-Group Placement Finals",
            "rounds": [{
                "roundIndex": 0, "label": "Placement Finals",
                "matches": stage2_matches,
                **_time_slot(scheduled_date, start_time, stage2_offset, finals_duration_minutes),
                "durationMinutes": finals_duration_minutes,
            }],
        }
        return created

    # 4 / 8 / 12 → one knockout-of-4 group per 4 players
    num_groups = n // 4
    groups_ids = distribute_snake(player_ids_seeded, num_groups) if num_groups > 1 else [player_ids_seeded]
    groups = [
        _build_knockout4_group(_group_name(i), gid, match_duration_minutes, finals_duration_minutes, scheduled_date, start_time, 0)
        for i, gid in enumerate(groups_ids)
    ]
    created["format"] = "groups_of_4"
    created["groups"] = groups
    created["stage2"] = None
    return created


# ── Resolution (live progress or final locked results) ──────────────────────

def _match_for_pair(matches: list[dict], a: str, b: str) -> Optional[dict]:
    """Find the accepted match between exactly these two players from the given
    match list. Tournament matches count as normal ladder matches too — the caller
    is responsible for narrowing `matches` to the tournament's date range (or not,
    for a live/in-progress view); this just needs an accepted head-to-head result."""
    candidates = [
        m for m in matches
        if m.get("status") == "accepted" and {m.get("submitterId"), m.get("opponentId")} == {a, b}
    ]
    if candidates:
        return sorted(candidates, key=lambda m: m.get("resolvedAt") or "")[-1]
    return None


def _winner_of(match: Optional[dict], a: str, b: str) -> Optional[str]:
    if not match:
        return None
    w = match.get("winner")
    if w == "submitter":
        return match.get("submitterId")
    if w == "opponent":
        return match.get("opponentId")
    return None


def resolve_group(group: dict, matches: list[dict]) -> dict:
    """Fill in matchIds/winnerIds for a group's matchups from already-played matches,
    and compute a standings/placement list. Mutates and returns a resolved copy."""
    import copy
    g = copy.deepcopy(group)

    if g["type"] == "roundrobin":
        record: dict = {pid: {"wins": 0, "losses": 0, "played": 0} for pid in g["playerIds"]}
        for mu in g["matchups"].values():
            a, b = mu["playerAId"], mu["playerBId"]
            match = _match_for_pair(matches, a, b)
            winner = _winner_of(match, a, b)
            mu["matchId"] = match["id"] if match else None
            mu["winnerId"] = winner
            if winner:
                loser = a if winner == b else b
                record[winner]["wins"] += 1
                record[winner]["played"] += 1
                record[loser]["losses"] += 1
                record[loser]["played"] += 1
        standings = sorted(
            g["playerIds"],
            key=lambda pid: (-record[pid]["wins"], record[pid]["losses"]),
        )
        g["standings"] = [
            {"playerId": pid, "rank": i + 1, "wins": record[pid]["wins"], "losses": record[pid]["losses"]}
            for i, pid in enumerate(standings)
        ]
        return g

    # knockout4
    mu_map = g["matchups"]
    sf_ids = [mid for mid in mu_map if mid.endswith("-sf1") or mid.endswith("-sf2")]
    winners: dict = {}
    losers: dict = {}
    for mid in sorted(sf_ids):
        mu = mu_map[mid]
        a, b = mu["playerAId"], mu["playerBId"]
        match = _match_for_pair(matches, a, b)
        winner = _winner_of(match, a, b)
        mu["matchId"] = match["id"] if match else None
        mu["winnerId"] = winner
        if winner:
            winners[mid] = winner
            losers[mid] = a if winner == b else b

    sf1_id = f"{g['name']}-sf1"
    sf2_id = f"{g['name']}-sf2"
    final_id = f"{g['name']}-final"
    third_id = f"{g['name']}-third"
    final_mu = mu_map[final_id]
    third_mu = mu_map[third_id]
    final_mu["playerAId"] = winners.get(sf1_id)
    final_mu["playerBId"] = winners.get(sf2_id)
    third_mu["playerAId"] = losers.get(sf1_id)
    third_mu["playerBId"] = losers.get(sf2_id)

    final_winner = final_third_winner = None
    if final_mu["playerAId"] and final_mu["playerBId"]:
        match = _match_for_pair(matches, final_mu["playerAId"], final_mu["playerBId"])
        final_winner = _winner_of(match, final_mu["playerAId"], final_mu["playerBId"])
        final_mu["matchId"] = match["id"] if match else None
        final_mu["winnerId"] = final_winner
    if third_mu["playerAId"] and third_mu["playerBId"]:
        match = _match_for_pair(matches, third_mu["playerAId"], third_mu["playerBId"])
        final_third_winner = _winner_of(match, third_mu["playerAId"], third_mu["playerBId"])
        third_mu["matchId"] = match["id"] if match else None
        third_mu["winnerId"] = final_third_winner

    placements = []
    if final_winner:
        runner_up = final_mu["playerAId"] if final_winner == final_mu["playerBId"] else final_mu["playerBId"]
        placements.append({"playerId": final_winner, "rank": 1})
        placements.append({"playerId": runner_up, "rank": 2})
    if final_third_winner:
        fourth = third_mu["playerAId"] if final_third_winner == third_mu["playerBId"] else third_mu["playerBId"]
        placements.append({"playerId": final_third_winner, "rank": 3})
        placements.append({"playerId": fourth, "rank": 4})
    g["standings"] = placements
    return g


def resolve_tournament(tournament: dict, matches: list[dict]) -> dict:
    """Resolve every group + stage2 from currently accepted tournament matches
    (`matches` should already be filtered to the desired date window by the caller)."""
    import copy
    t = copy.deepcopy(tournament)
    resolved_groups = [resolve_group(g, matches) for g in t.get("groups", [])]
    t["groups"] = resolved_groups

    if t.get("stage2"):
        rank_to_player = []
        for g in resolved_groups:
            m = {row["rank"]: row["playerId"] for row in g.get("standings", [])}
            rank_to_player.append(m)
        for stage2_round in t["stage2"]["rounds"]:
            for mu in stage2_round["matches"]:
                slots = mu["fromGroupRank"]
                group_names = [g["name"] for g in resolved_groups]
                a_idx = group_names.index(slots[0]["group"])
                b_idx = group_names.index(slots[1]["group"])
                a = rank_to_player[a_idx].get(slots[0]["rank"])
                b = rank_to_player[b_idx].get(slots[1]["rank"])
                mu["playerAId"], mu["playerBId"] = a, b
                if a and b:
                    match = _match_for_pair(matches, a, b)
                    winner = _winner_of(match, a, b)
                    mu["matchId"] = match["id"] if match else None
                    mu["winnerId"] = winner

    # Overall final ranking, best-effort given what's resolved so far.
    final_ranking = []
    if t["format"] == "round_robin_5":
        final_ranking = [row["playerId"] for row in resolved_groups[0].get("standings", [])]
    elif t["format"] == "two_groups_of_3" and t.get("stage2"):
        placed = set()
        ordered = []
        for mu in t["stage2"]["rounds"][0]["matches"]:
            if mu.get("winnerId"):
                winner = mu["winnerId"]
                loser = mu["playerAId"] if winner == mu["playerBId"] else mu["playerBId"]
                ordered.extend([winner, loser])
                placed.update([winner, loser])
            else:
                for pid in (mu.get("playerAId"), mu.get("playerBId")):
                    if pid and pid not in placed:
                        ordered.append(pid)
                        placed.add(pid)
        final_ranking = ordered
    else:  # groups_of_4 — each group is independent; concatenate group placements in order
        for g in resolved_groups:
            ranked = [row["playerId"] for row in sorted(g.get("standings", []), key=lambda r: r["rank"])]
            remaining = [pid for pid in g["playerIds"] if pid not in ranked]
            final_ranking.extend(ranked + remaining)

    t["finalRanking"] = final_ranking
    return t
