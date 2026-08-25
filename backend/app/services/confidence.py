from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Report, Station


# =========================================================
# CHARGELENS CONFIDENCE ENGINE
#
# MVP WEIGHTS
#
# Recent verification        25%
# User reports               25%
# Report consistency         15%
# Historical reliability     15%
# Data freshness             10%
# Current status             10%
#
# This is deliberately rule-based and explainable.
# =========================================================


def clamp(value: float, minimum: float = 0, maximum: float = 100) -> float:
    return max(
        minimum,
        min(maximum, value),
    )


def calculate_confidence(
    station: Station,
    reports: list[Report],
) -> dict:
    now = datetime.now(timezone.utc)

    # =====================================================
    # 1. RECENT VERIFICATION — 25%
    # =====================================================

    verification_score = 0.0

    if station.last_verified_at:

        last_verified = station.last_verified_at

        if last_verified.tzinfo is None:
            last_verified = last_verified.replace(
                tzinfo=timezone.utc
            )

        age_hours = (
            now - last_verified
        ).total_seconds() / 3600

        if age_hours <= 1:
            verification_score = 100

        elif age_hours <= 6:
            verification_score = 90

        elif age_hours <= 24:
            verification_score = 75

        elif age_hours <= 72:
            verification_score = 55

        elif age_hours <= 168:
            verification_score = 30

        else:
            verification_score = 10

    # =====================================================
    # 2. USER REPORTS — 25%
    # =====================================================

    recent_cutoff = now - timedelta(days=30)

    recent_reports = []

    for report in reports:

        created_at = report.created_at

        if created_at.tzinfo is None:
            created_at = created_at.replace(
                tzinfo=timezone.utc
            )

        if created_at >= recent_cutoff:
            recent_reports.append(report)

    if not recent_reports:

        report_score = station.confidence_score

    else:

        positive = sum(
            1
            for report in recent_reports
            if report.report_type
            in {
                "working",
                "available",
            }
        )

        negative = sum(
            1
            for report in recent_reports
            if report.report_type
            in {
                "broken",
                "maintenance",
                "payment_problem",
                "slow_charging",
            }
        )

        busy = sum(
            1
            for report in recent_reports
            if report.report_type
            in {
                "busy",
                "queue",
            }
        )

        total = (
            positive
            + negative
            + busy
        )

        report_score = (
            (
                positive * 100
                + busy * 65
                + negative * 20
            )
            / total
        )

    # =====================================================
    # 3. REPORT CONSISTENCY — 15%
    # =====================================================

    if len(recent_reports) <= 1:

        consistency_score = 70

    else:

        report_types = [
            report.report_type
            for report in recent_reports
        ]

        most_common_count = max(
            report_types.count(report_type)
            for report_type in set(report_types)
        )

        consistency_score = (
            most_common_count
            / len(report_types)
        ) * 100

    # =====================================================
    # 4. HISTORICAL RELIABILITY — 15%
    #
    # The station's stored score acts as the current
    # reliability baseline for the MVP.
    # =====================================================

    historical_score = clamp(
        float(station.confidence_score)
    )

    # =====================================================
    # 5. DATA FRESHNESS — 10%
    # =====================================================

    if station.last_verified_at:

        last_verified = station.last_verified_at

        if last_verified.tzinfo is None:
            last_verified = last_verified.replace(
                tzinfo=timezone.utc
            )

        age_hours = (
            now - last_verified
        ).total_seconds() / 3600

        if age_hours <= 6:
            freshness_score = 100

        elif age_hours <= 24:
            freshness_score = 80

        elif age_hours <= 72:
            freshness_score = 55

        elif age_hours <= 168:
            freshness_score = 30

        else:
            freshness_score = 10

    else:

        freshness_score = 0

    # =====================================================
    # 6. CURRENT STATUS — 10%
    # =====================================================

    status_scores = {

        "available": 100,

        "working": 100,

        "busy": 65,

        "unknown": 45,

        "maintenance": 20,

        "broken": 10,

    }

    status_score = status_scores.get(
        station.status.lower(),
        45,
    )

    # =====================================================
    # FINAL SCORE
    # =====================================================

    final_score = (
        verification_score * 0.25
        + report_score * 0.25
        + consistency_score * 0.15
        + historical_score * 0.15
        + freshness_score * 0.10
        + status_score * 0.10
    )

    final_score = round(
        clamp(final_score),
        1,
    )

    # =====================================================
    # CONFIDENCE LEVEL
    # =====================================================

    if final_score >= 90:

        level = "VERY HIGH"

    elif final_score >= 80:

        level = "HIGH"

    elif final_score >= 70:

        level = "GOOD"

    elif final_score >= 50:

        level = "UNCERTAIN"

    else:

        level = "LOW"

    # =====================================================
    # EXPLANATION
    # =====================================================

    explanation = []

    if verification_score >= 90:
        explanation.append(
            "Recently verified"
        )

    elif verification_score >= 70:
        explanation.append(
            "Verified within the last day"
        )

    else:
        explanation.append(
            "Verification is becoming stale"
        )

    if report_score >= 85:
        explanation.append(
            "Recent driver reports are positive"
        )

    elif report_score >= 65:
        explanation.append(
            "Driver reports are mixed"
        )

    else:
        explanation.append(
            "Recent driver reports indicate problems"
        )

    if consistency_score >= 80:
        explanation.append(
            "Recent reports are consistent"
        )

    else:
        explanation.append(
            "Recent reports are inconsistent"
        )

    if status_score >= 90:
        explanation.append(
            "Current status is operational"
        )

    elif status_score >= 60:
        explanation.append(
            "Station may currently be busy"
        )

    else:
        explanation.append(
            "Current status indicates a problem"
        )

    return {

        "score": final_score,

        "level": level,

        "factors": {

            "recent_verification":
                round(
                    verification_score,
                    1,
                ),

            "user_reports":
                round(
                    report_score,
                    1,
                ),

            "report_consistency":
                round(
                    consistency_score,
                    1,
                ),

            "historical_reliability":
                round(
                    historical_score,
                    1,
                ),

            "data_freshness":
                round(
                    freshness_score,
                    1,
                ),

            "current_status":
                round(
                    status_score,
                    1,
                ),
        },

        "explanation":
            explanation,

        "recent_report_count":
            len(recent_reports),

    }


# =========================================================
# STATION REPORT RETRIEVAL
# =========================================================

def get_station_reports(
    db: Session,
    station_id: int,
) -> list[Report]:

    return list(
        db.scalars(
            select(Report)
            .where(
                Report.station_id == station_id
            )
            .order_by(
                Report.created_at.desc()
            )
            .limit(100)
        ).all()
    )