#!/usr/bin/env python3
from __future__ import annotations
"""
Social Media Audit Tool — instaloader edition
Audits a public (or logged-in) Instagram account by scraping via instaloader.
Produces a PDF report covering profile completeness, post frequency,
engagement metrics, and content quality.

Usage:
    # Public profile, no login (rate-limited to ~30 posts):
    python social_media_audit.py --username HANDLE --output report.pdf

    # Logged-in (more posts, better data):
    python social_media_audit.py --username HANDLE --login YOUR_IG_USERNAME --output report.pdf

    # Demo mode (no scraping needed):
    python social_media_audit.py --demo --output report.pdf

Note: Facebook scraping is not supported via instaloader.
      Use social_media_audit_api.py for Facebook via the official Meta API.
"""

import argparse
import math
import re
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from io import BytesIO

# ── instaloader ───────────────────────────────────────────────────────────────
try:
    import instaloader
except ImportError:
    sys.exit("instaloader is required: pip install instaloader --break-system-packages")

# ── DeepSeek (OpenAI-compatible) ───────────────────────────────────────────────
try:
    from openai import OpenAI as _OpenAI
    HAS_OPENAI = True
except ImportError:
    HAS_OPENAI = False

# ── PDF / chart imports ────────────────────────────────────────────────────────
try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import cm, mm
    from reportlab.platypus import (
        HRFlowable,
        Image,
        PageBreak,
        Paragraph,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )
    from reportlab.platypus.flowables import KeepTogether
except ImportError:
    sys.exit("reportlab is required: pip install reportlab --break-system-packages")

try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.ticker as mtick
    HAS_MATPLOTLIB = True
except ImportError:
    HAS_MATPLOTLIB = False
    print("Warning: matplotlib not found — charts will be omitted. "
          "Install with: pip install matplotlib --break-system-packages")


# ══════════════════════════════════════════════════════════════════════════════
#  FIRST LIGHT MARKETING — BRAND COLOURS & STYLES
# ══════════════════════════════════════════════════════════════════════════════

FL_CORAL      = colors.HexColor("#FF5757")   # Exact brand coral (extracted from live site)
FL_CORAL_DARK = colors.HexColor("#E03E3E")   # Deeper coral for sub-banners
FL_CREAM      = colors.HexColor("#FFE9DD")   # Brand body background (from site CSS)
FL_CREAM_MID  = colors.HexColor("#F5CFC0")   # Mid cream for borders/dividers
FL_DARK       = colors.HexColor("#1A1A1A")   # Near-black body text (from site CSS)
FL_MID_GREY   = colors.HexColor("#6B6B6B")   # Secondary / caption text
FL_LIGHT      = colors.HexColor("#FFF8EE")   # Light cream tint (from site CSS)
FL_WHITE      = colors.white

# Status colours
GREEN         = colors.HexColor("#3DAA7D")
AMBER         = colors.HexColor("#E8973A")
RED           = colors.HexColor("#D94F4F")

# ── Brand font registration (Fraunces + Public Sans) ──────────────────────────
# Run setup_fonts.py once to download these. Falls back to built-ins if absent.
import os as _os_fonts
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont as _TTFont

_FONTS_DIR = _os_fonts.path.join(_os_fonts.path.dirname(_os_fonts.path.abspath(__file__)), "fonts")

_FONT_MAP = {
    "FL-Heading":       "Fraunces-Bold.ttf",
    "FL-Body":          "PublicSans-Regular.ttf",
    "FL-BodyBold":      "PublicSans-Bold.ttf",
    "FL-BodySemiBold":  "PublicSans-SemiBold.ttf",
    "FL-BodyItalic":    "PublicSans-Italic.ttf",
}

_FONT_FALLBACKS = {
    "FL-Heading":       "Times-Bold",
    "FL-Body":          "Helvetica",
    "FL-BodyBold":      "Helvetica-Bold",
    "FL-BodySemiBold":  "Helvetica-Bold",
    "FL-BodyItalic":    "Helvetica-Oblique",
}

_FONTS_LOADED = False
for _alias, _fname in _FONT_MAP.items():
    _path = _os_fonts.path.join(_FONTS_DIR, _fname)
    if _os_fonts.path.exists(_path):
        try:
            pdfmetrics.registerFont(_TTFont(_alias, _path))
            _FONTS_LOADED = True
        except Exception as _e:
            pass  # fall back silently

def _f(name: str) -> str:
    """Return the registered brand font name, or its built-in fallback."""
    try:
        pdfmetrics.getFont(name)
        return name
    except Exception:
        return _FONT_FALLBACKS.get(name, "Helvetica")

# Aliases used elsewhere in the file
DARK         = FL_DARK
MID_GREY     = FL_MID_GREY
LIGHT_GREY   = FL_CREAM
BRAND_PURPLE = FL_CORAL
BRAND_BLUE   = FL_CORAL

PAGE_W, PAGE_H = A4
MARGIN = 2 * cm


def score_colour(score: float) -> colors.Color:
    if score >= 75:
        return GREEN
    if score >= 50:
        return AMBER
    return RED


def score_label(score: float) -> str:
    if score >= 75:
        return "Good"
    if score >= 50:
        return "Needs work"
    return "Poor"


# ── Draw the First Light sunburst logo mark onto a canvas ─────────────────────

import math as _math


def _draw_sunburst(c, cx: float, cy: float, size: float,
                   ray_colour=FL_CORAL, bg_colour=None):
    """
    Draw the First Light Marketing sunburst icon.
    cx, cy = centre point (bottom of the arc baseline).
    size   = radius of the outer rays.
    """
    from reportlab.lib.units import mm

    if bg_colour:
        c.setFillColor(bg_colour)
        c.circle(cx, cy, size * 1.15, fill=1, stroke=0)

    c.setStrokeColor(ray_colour)
    c.setFillColor(ray_colour)

    inner_r = size * 0.38
    outer_r = size

    # Ray angles — upper semicircle only, mirroring the logo
    # 13 rays spread from ~10° to ~170° (left to right across top)
    ray_angles_deg = [10, 22, 34, 46, 58, 70, 82, 90, 98, 110, 122, 134, 146, 158, 170]
    # Alternate slightly shorter rays for the logo's varied length look
    ray_lengths =    [0.65,0.80,0.88,0.95,1.0,1.0,1.0,1.0,1.0,1.0,0.95,0.88,0.80,0.65,0.55]

    lw = size * 0.028
    c.setLineWidth(lw)
    for angle_deg, length_frac in zip(ray_angles_deg, ray_lengths):
        angle = _math.radians(angle_deg)
        x0 = cx + inner_r * _math.cos(angle)
        y0 = cy + inner_r * _math.sin(angle)
        x1 = cx + outer_r * length_frac * _math.cos(angle)
        y1 = cy + outer_r * length_frac * _math.sin(angle)
        c.line(x0, y0, x1, y1)

    # Baseline — two short horizontal lines either side of centre
    c.setLineWidth(lw * 0.8)
    baseline_y = cy + inner_r * 0.05
    gap = inner_r * 0.25
    c.line(cx - outer_r * 0.7, baseline_y, cx - gap, baseline_y)
    c.line(cx + gap,           baseline_y, cx + outer_r * 0.7, baseline_y)


def _draw_logo_text(c, cx: float, top_y: float, size: float,
                    colour=FL_CORAL):
    """Draw 'FIRST LIGHT / MARKETING' text centred at cx, below top_y."""
    title_size  = size * 0.32
    sub_size    = size * 0.16
    c.setFillColor(colour)
    c.setFont(_f("FL-Heading"), title_size)
    c.drawCentredString(cx, top_y - title_size * 1.1, "FIRST LIGHT")
    c.setFont(_f("FL-Body"), sub_size)
    # Letter-spacing simulation via individual chars
    subtitle = "M A R K E T I N G"
    c.drawCentredString(cx, top_y - title_size * 1.1 - sub_size * 1.6, subtitle)


def _logo_flowable(width: float, height: float, on_dark: bool = False):
    """Return a reportlab Flowable that draws the full logo."""
    from reportlab.platypus import Flowable

    class LogoFlowable(Flowable):
        def __init__(self, w, h, dark):
            super().__init__()
            self.width  = w
            self.height = h
            self.dark   = dark

        def draw(self):
            ray_c  = FL_WHITE if self.dark else FL_CORAL
            text_c = FL_WHITE if self.dark else FL_CORAL
            cx = self.width / 2
            sunburst_r = self.height * 0.38
            cy = self.height * 0.54
            _draw_sunburst(self.canv, cx, cy, sunburst_r, ray_colour=ray_c)
            _draw_logo_text(self.canv, cx, cy, sunburst_r * 2, colour=text_c)

    return LogoFlowable(width, height, on_dark)


# ══════════════════════════════════════════════════════════════════════════════
#  INSTALOADER FETCHER
# ══════════════════════════════════════════════════════════════════════════════

POSTS_TO_FETCH = 30


def fetch_instagram(username: str, login_user: str | None = None, limit: int = POSTS_TO_FETCH) -> tuple[dict, list[dict]]:
    """
    Scrape an Instagram profile and its recent posts via instaloader.

    Args:
        username:   The Instagram handle to audit (without @).
        login_user: If provided, log in as this IG account before scraping.
                    Avoids rate-limits and works on private accounts you follow.
                    You'll be prompted for the password interactively.

    Returns:
        (profile_dict, posts_list) — normalised to the same shape the
        analysis engine expects.
    """
    L = instaloader.Instaloader(
        download_pictures=False,
        download_videos=False,
        download_video_thumbnails=False,
        download_geotags=False,
        download_comments=True,   # enables comment data fetching
        save_metadata=False,
        compress_json=False,
        max_connection_attempts=1,
        quiet=True,
    )

    if login_user:
        try:
            # Try loading a saved session first so we don't have to re-auth
            L.load_session_from_file(login_user)
            print(f"  Loaded saved session for {login_user}")
        except FileNotFoundError:
            import getpass
            password = getpass.getpass(f"Instagram password for {login_user}: ")
            L.login(login_user, password)
            L.save_session_to_file()
            print(f"  Logged in as {login_user} and saved session")

    print(f"  Fetching profile @{username}…")
    try:
        profile = instaloader.Profile.from_username(L.context, username)
    except instaloader.exceptions.ProfileNotExistsException:
        sys.exit(f"Profile @{username} not found.")
    except instaloader.exceptions.LoginRequiredException:
        sys.exit(
            f"@{username} is private. Use --login YOUR_IG_USERNAME to log in first."
        )
    except Exception:
        _log_instagram_profile_diagnostic(L, username)
        raise

    _business_category = getattr(profile, "business_category_name", None)
    # account_type from raw node: 1 = Personal, 2 = Business, 3 = Creator
    _account_type = profile._node.get("account_type", 1)
    _account_type_label = {1: "Personal", 2: "Business", 3: "Creator"}.get(_account_type, "Unknown")
    profile_dict = {
        "username":            profile.username,
        "name":                profile.full_name or None,
        "biography":           profile.biography or None,
        "website":             profile.external_url or None,
        "profile_picture_url": profile.profile_pic_url or None,
        "followers_count":     profile.followers,
        "follows_count":       profile.followees,
        "media_count":         profile.mediacount,
        "is_verified":         profile.is_verified,
        "is_business":         profile.is_business_account,
        "is_professional":     _account_type in (2, 3),   # Business or Creator
        "account_type_label":  _account_type_label,
        "business_category":   _business_category,
        "biography_hashtags":  getattr(profile, "biography_hashtags", []),
        "igtv_count":          getattr(profile, "igtvcount", 0),
        "is_private":          profile.is_private,
    }

    # Instagram allows a maximum of 3 pinned posts, so fetching limit+3 is enough
    # to guarantee we can sort by date and still have `limit` real posts remaining.
    fetch_limit = limit + 3
    print(f"  Fetching up to {fetch_limit} posts (+3 for pinned posts; will trim to {limit} most recent)…")
    raw_posts = []
    try:
        for post in profile.get_posts():
            # Read comment count directly from feed node — avoids the secondary
            # metadata fetch that post.comments triggers (which Instagram blocks).
            try:
                comments = post._node.get("comments")
            except Exception:
                comments = None
            try:
                video_views = post.video_view_count if post.is_video else None
            except Exception:
                video_views = None
            try:
                location = post.location.name if post.location else None
            except Exception:
                location = None
            try:
                mentions = post.caption_mentions  # list of @handles mentioned
            except Exception:
                mentions = []
            try:
                tagged = post.tagged_users  # list of tagged usernames
            except Exception:
                tagged = []
            try:
                is_sponsored = post.is_sponsored
            except Exception:
                is_sponsored = False
            try:
                slide_count = post.mediacount if post.typename == "GraphSidecar" else 1
            except Exception:
                slide_count = 1

            raw_posts.append({
                "id":             post.shortcode,
                "caption":        post.caption or "",
                "media_type":     post.typename,       # GraphImage / GraphVideo / GraphSidecar
                "is_video":       post.is_video,
                "timestamp":      post.date_utc.replace(tzinfo=timezone.utc).isoformat(),
                "like_count":     post.likes,
                "comments_count": comments,            # None = unavailable
                "video_views":    video_views,
                "location":       location,
                "mentions":       mentions,
                "tagged_users":   tagged,
                "is_sponsored":   is_sponsored,
                "slide_count":    slide_count,
            })
            if len(raw_posts) >= fetch_limit:
                break
    except instaloader.exceptions.LoginRequiredException:
        print("  Warning: could not fetch posts without login — profile may be private.")

    # Sort by timestamp descending and take the most recent `limit` posts.
    # This removes pinned posts (which Instagram returns first but may have old dates).
    raw_posts.sort(key=lambda p: p["timestamp"], reverse=True)
    posts = raw_posts[:limit]

    pinned_dropped = len(raw_posts) - len(posts)
    if pinned_dropped > 0:
        print(f"  Dropped {pinned_dropped} older/pinned post(s) after sorting by date.")
    print(f"  Using {len(posts)} most recent posts.")
    return profile_dict, posts


def _log_instagram_profile_diagnostic(loader: "instaloader.Instaloader", username: str) -> None:
    """Log a short, non-secret diagnostic for failed profile metadata requests."""
    url = "https://www.instagram.com/api/v1/users/web_profile_info/"
    try:
        session = getattr(loader.context, "_session", None)
        if session is None:
            print("  Instagram diagnostic: no session object available.")
            return

        response = session.get(
            url,
            params={"username": username},
            timeout=12,
            allow_redirects=False,
        )
        content_type = response.headers.get("content-type", "")
        location = response.headers.get("location", "")
        preview = _safe_response_preview(response.text)

        print(
            "  Instagram diagnostic: "
            f"status={response.status_code}, "
            f"content_type={content_type or 'unknown'}, "
            f"location={location or 'none'}, "
            f"body_preview={preview}"
        )
    except Exception as diag_error:
        print(f"  Instagram diagnostic failed: {type(diag_error).__name__}: {diag_error}")


def _safe_response_preview(value: str, limit: int = 500) -> str:
    cleaned = re.sub(r"\s+", " ", value or "").strip()
    cleaned = re.sub(r"([?&](?:sessionid|csrftoken|ds_user_id|mid|ig_did|token)=)[^&\\s\"']+", r"\1[redacted]", cleaned, flags=re.I)
    return cleaned[:limit] or "[empty]"


# ══════════════════════════════════════════════════════════════════════════════
#  DEMO / MOCK DATA
# ══════════════════════════════════════════════════════════════════════════════

def _demo_ig_posts(n: int = 30) -> list[dict]:
    now = datetime.now(timezone.utc)
    posts = []
    captions = [
        "Excited to launch our new product line! 🚀 #launch #startup #product",
        "Behind the scenes at our studio today.",
        "Thank you for 10k followers! 🎉 #milestone #grateful #community #growth",
        "Our team is growing — we're hiring! Link in bio. #hiring #jobs",
        "New blog post: 5 tips for a better workflow. Check it out! #productivity",
        "Weekend vibes 🌿",
        "Happy Monday! Here's what we're working on this week. #BTS #teamwork",
        "Customer spotlight: see how @partner uses our tool. #casestudy",
        "Big news coming next week… stay tuned! 👀 #teaser",
        "We just hit a huge milestone — thank you all! #grateful",
    ]
    for i in range(n):
        # vary gaps: mostly ~3 days, occasional gaps
        days_ago = int(i * 3.2 + (i % 5) * 1.5)
        is_vid      = (i % 5 == 4)
        is_carousel = (i % 7 == 3)
        posts.append({
            "id": f"ig_post_{i}",
            "caption": captions[i % len(captions)],
            "media_type": "GraphVideo" if is_vid else ("GraphSidecar" if is_carousel else "GraphImage"),
            "is_video":   is_vid,
            "timestamp": (now - timedelta(days=days_ago)).isoformat(),
            "like_count": max(0, int(450 - i * 8 + (i % 3) * 30)),
            "comments_count": max(0, int(22 - i * 0.4 + (i % 4) * 5)),
            "video_views": max(0, int(2000 - i * 30)) if is_vid else None,
            "location": "Dublin, Ireland" if i % 6 == 0 else None,
            "mentions": ["partner_account"] if i % 8 == 0 else [],
            "tagged_users": ["tagged_user"] if i % 9 == 0 else [],
            "is_sponsored": False,
            "slide_count": 3 if is_carousel else 1,
        })
    return posts



DEMO_DATA = {
    "ig": {
        "profile": {
            "username":            "acme_brand",
            "name":                "ACME Brand",
            "biography":           "Building great products. 🌍 Link below for our latest launch.",
            "website":             "https://acmebrand.com",
            "profile_picture_url": "https://example.com/pic.jpg",
            "followers_count":     12_430,
            "follows_count":       640,
            "media_count":         187,
            "is_verified":         False,
            "is_business":         True,
            "business_category":   None,   # intentionally blank to show gap
        },
        "media": _demo_ig_posts(30),
    },
}


# ══════════════════════════════════════════════════════════════════════════════
#  ANALYSIS ENGINE
# ══════════════════════════════════════════════════════════════════════════════

class AuditResult:
    """Container for one platform's audit data."""
    def __init__(self, platform: str, profile: dict, posts: list[dict]):
        self.platform = platform          # "Instagram" | "Facebook"
        self.profile  = profile
        self.posts    = posts
        self.scores: dict[str, float] = {}
        self.details: dict[str, dict]  = {}
        self.overall: float = 0.0


def _parse_dt(s: str) -> datetime:
    """Parse ISO-8601 or +00:00 variants."""
    s = s.rstrip("Z")
    for fmt in ("%Y-%m-%dT%H:%M:%S+0000", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S%z"):
        try:
            dt = datetime.strptime(s, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            continue
    # last resort — truncate offset
    return datetime.fromisoformat(s[:19]).replace(tzinfo=timezone.utc)


# ── Profile completeness ───────────────────────────────────────────────────────

IG_PROFILE_FIELDS = {
    "username":            ("Handle",               10),
    "name":                ("Display name",         10),
    "biography":           ("Bio",                  20),
    "website":             ("Website link",         20),
    "profile_picture_url": ("Profile picture",      15),
    "is_professional":     ("Professional account", 15),  # Business or Creator
    "business_category":   ("Business category",    10),
}


def _completeness_score(profile: dict, fields: dict) -> tuple[float, list[dict]]:
    rows = []
    earned = 0
    total  = sum(w for _, (_, w) in fields.items())
    for key, (label, weight) in fields.items():
        val = profile.get(key)
        # Normalise "empty" values
        if isinstance(val, dict):
            # nested objects like picture.data.url or cover.source
            inner = list(val.values())
            val = inner[0] if inner else None
            if isinstance(val, dict):
                val = list(val.values())[0] if val else None
        present = bool(val) and val not in (None, "", "null", 0)
        if present:
            earned += weight
        # For the professional account field, surface the account type label
        detail = profile.get("account_type_label") if key == "is_professional" else None
        rows.append({"label": label, "present": present, "weight": weight, "detail": detail})
    return round(earned / total * 100, 1), rows


# ── Post frequency ─────────────────────────────────────────────────────────────

def _frequency_score(posts: list[dict], ts_key: str) -> tuple[float, dict]:
    if not posts:
        return 0.0, {"posts_analysed": 0}

    now = datetime.now(timezone.utc)
    timestamps = []
    for p in posts:
        raw = p.get(ts_key, "")
        if raw:
            try:
                timestamps.append(_parse_dt(raw))
            except Exception:
                pass

    if not timestamps:
        return 0.0, {"posts_analysed": 0}

    timestamps.sort(reverse=True)

    # Use the actual span of the fetched posts rather than a fixed 90-day window.
    # If only one post exists, treat the window as 7 days.
    oldest = timestamps[-1]
    newest = timestamps[0]
    span_days = max((newest - oldest).days, 7)
    span_weeks = span_days / 7.0
    posts_per_week = len(timestamps) / span_weeks

    # Score: 3+ posts/week = 100, 1/week = 50, <1 scales down
    raw_score = min(100.0, posts_per_week / 3.0 * 100.0)
    score = round(raw_score, 1)

    # Gap analysis — days between consecutive posts
    gaps = []
    if len(timestamps) > 1:
        for a, b in zip(timestamps, timestamps[1:]):
            gaps.append((a - b).total_seconds() / 86400)
    avg_gap = round(sum(gaps) / len(gaps), 1) if gaps else 0
    max_gap = round(max(gaps), 1) if gaps else 0

    # Express longest gap as a multiple of the average to give it context
    gap_multiple = round(max_gap / avg_gap, 1) if avg_gap > 0 else 0

    return score, {
        "posts_analysed":  len(timestamps),
        "span_days":       span_days,
        "posts_per_week":  round(posts_per_week, 2),
        "avg_gap_days":    avg_gap,
        "max_gap_days":    max_gap,
        "gap_multiple":    gap_multiple,
        "oldest_post":     oldest.strftime("%d %b %Y"),
        "newest_post":     newest.strftime("%d %b %Y"),
        "weekly_counts":   _weekly_counts(timestamps, now),
    }


def _weekly_counts(timestamps: list[datetime], now: datetime) -> list[int]:
    """Return post counts per week, only as far back as the oldest post."""
    if not timestamps:
        return []
    oldest = min(timestamps)
    span_weeks = max(1, int((now - oldest).days / 7) + 1)
    counts = [0] * span_weeks
    for ts in timestamps:
        week_idx = int((now - ts).days / 7)
        if 0 <= week_idx < span_weeks:
            counts[span_weeks - 1 - week_idx] += 1
    return counts


# ── Engagement metrics ─────────────────────────────────────────────────────────

def _engagement_benchmark(followers: int) -> float:
    """
    Return the engagement rate (%) that scores 100 for this follower tier.
    Benchmarks drop as accounts grow — a 200k account hitting 3% would be
    exceptional; the realistic 'good' target is ~0.7%.
    """
    if followers < 10_000:
        return 4.0    # nano: 3–6% is typical
    if followers < 50_000:
        return 2.5    # micro: 1–3%
    if followers < 100_000:
        return 1.5    # mid: 1–2%
    if followers < 500_000:
        return 0.8    # macro: 0.5–1%
    return 0.4        # mega: 0.1–0.5%


def _engagement_score_ig(posts: list[dict], followers: int) -> tuple[float, dict]:
    if not posts or followers == 0:
        return 0.0, {}
    rates = []
    for p in posts:
        comments = p.get("comments_count") or 0
        eng = p.get("like_count", 0) + comments
        rates.append(eng / followers * 100)
    avg = round(sum(rates) / len(rates), 2)
    benchmark = _engagement_benchmark(followers)
    score = min(100.0, avg / benchmark * 100.0)

    comments_available = [p["comments_count"] for p in posts if p.get("comments_count") is not None]
    avg_comments = round(sum(comments_available) / len(comments_available), 1) if comments_available else None

    return round(score, 1), {
        "avg_engagement_rate": avg,
        "benchmark_rate":      benchmark,
        "avg_likes":    round(sum(p.get("like_count", 0) for p in posts) / len(posts), 1),
        "avg_comments": avg_comments,
        "top_posts": sorted(posts, key=lambda p: p.get("like_count", 0), reverse=True)[:3],
    }


def _engagement_score_fb(posts: list[dict], fans: int) -> tuple[float, dict]:
    if not posts or fans == 0:
        return 0.0, {}
    rates = []
    for p in posts:
        eng = p.get("reactions", 0) + p.get("comments", 0) + p.get("shares", 0)
        rates.append(eng / fans * 100)
    avg = round(sum(rates) / len(rates), 2)
    score = min(100.0, avg / 1.0 * 100.0)  # FB avg ~0.5-1%
    return round(score, 1), {
        "avg_engagement_rate": avg,
        "avg_reactions": round(sum(p.get("reactions", 0) for p in posts) / len(posts), 1),
        "avg_comments":  round(sum(p.get("comments",  0) for p in posts) / len(posts), 1),
        "avg_shares":    round(sum(p.get("shares",    0) for p in posts) / len(posts), 1),
        "top_posts": sorted(posts, key=lambda p: p.get("reactions", 0), reverse=True)[:3],
    }


# ── Content quality ────────────────────────────────────────────────────────────

CALL_TO_ACTION_PATTERNS = [
    # Bio / link
    r"\blink in (my |our )?bio\b",
    r"\btap (the )?link\b",
    r"\bcheck (the |out the )?link\b",
    r"\bhead to (our|the|my)\b",
    r"\bvisit (our|the|my) ?(website|site|store|shop|page|profile)\b",
    r"\bcheck it out\b",
    r"\blearn more\b",
    r"\bclick here\b",
    # Shopping / conversion
    r"\bshop now\b",
    r"\border now\b",
    r"\bget yours\b",
    r"\bgrab yours\b",
    r"\bget it now\b",
    r"\bavailable now\b",
    # Sign-up / booking
    r"\bsign up\b",
    r"\bregister\b",
    r"\bbook now\b",
    r"\bbook (a |your )?(call|session|slot|demo|appointment)\b",
    r"\bdownload\b",
    r"\bsubscribe\b",
    # Engagement / comments
    r"\bcomment below\b",
    r"\bleave a comment\b",
    r"\bdrop (a |your )?comment\b",
    r"\btell us\b",
    r"\blet us know\b",
    r"\bwhat do you think\b",
    # Tags / shares / saves
    r"\btag (a |your |someone|a friend)\b",
    r"\bshare (this|with|to)\b",
    r"\bsave (this|the post|for later)\b",
    r"\blike (this|this post|and save)\b",
    # Video / swipe
    r"\bswipe (up|left|right)\b",
    r"\bwatch (the|our|this|full|now)\b",
    # DM
    r"\bdm (us|me)\b",
    r"\bsend us a (dm|message)\b",
    r"\bmessage us\b",
    # Contests
    r"\benter (to win|the|now)\b",
    r"\bgiveaway\b",
]

def _content_quality_score(posts: list[dict], caption_key: str) -> tuple[float, dict]:
    captions = [p.get(caption_key) or "" for p in posts]
    captions = [c for c in captions if c]  # filter empty

    if not captions:
        return 0.0, {"captions_analysed": 0}

    n = len(captions)

    # Hashtag analysis
    all_tags = []
    hashtag_counts = []
    for c in captions:
        tags = re.findall(r"#\w+", c.lower())
        all_tags.extend(tags)
        hashtag_counts.append(len(tags))
    avg_hashtags = sum(hashtag_counts) / n
    top_hashtags = [tag for tag, _ in Counter(all_tags).most_common(10)]

    # Optimal hashtag range: 5-15
    if 5 <= avg_hashtags <= 15:
        hashtag_score = 100.0
    elif avg_hashtags < 5:
        hashtag_score = avg_hashtags / 5 * 100
    else:
        hashtag_score = max(0, 100 - (avg_hashtags - 15) * 5)

    # Caption length: 100-500 chars is ideal. Under 100 = too sparse.
    # Soft penalty above 500 (some long-form content performs well so don't crater the score).
    lengths = [len(c) for c in captions]
    avg_len = sum(lengths) / n
    if 100 <= avg_len <= 500:
        length_score = 100.0
    elif avg_len < 100:
        length_score = avg_len  # scales 0→100 as length approaches 100
    else:
        # Lose 1 point per 20 chars over 500; floor at 30 (long captions aren't always bad)
        length_score = max(30, 100 - (avg_len - 500) / 20)

    # CTA presence
    cta_count = sum(
        1 for c in captions
        if any(re.search(p, c, re.IGNORECASE) for p in CALL_TO_ACTION_PATTERNS)
    )
    cta_score = cta_count / n * 100

    # Emoji usage (adds personality, 1-3 per post is ideal)
    emoji_pattern = re.compile(
        "[\U00010000-\U0010ffff\U00002600-\U000027BF\U0001F300-\U0001F9FF]",
        flags=re.UNICODE,
    )
    emoji_counts = [len(emoji_pattern.findall(c)) for c in captions]
    avg_emoji = sum(emoji_counts) / n
    if avg_emoji == 0:
        emoji_score = 30.0    # deliberate brand choice — penalise lightly, not harshly
    elif avg_emoji <= 2:
        emoji_score = min(100.0, avg_emoji / 2 * 100)
    else:
        emoji_score = max(40, 100 - (avg_emoji - 2) * 10)

    overall = round((hashtag_score * 0.3 + length_score * 0.25 + cta_score * 0.25 + emoji_score * 0.2), 1)

    # Content mix
    n_total = len(posts)
    n_video    = sum(1 for p in posts if p.get("is_video"))
    n_carousel = sum(1 for p in posts if p.get("media_type") == "GraphSidecar")
    n_image    = n_total - n_video - n_carousel
    n_location = sum(1 for p in posts if p.get("location"))
    n_mentions = sum(1 for p in posts if p.get("mentions"))
    n_tagged   = sum(1 for p in posts if p.get("tagged_users"))
    n_sponsored = sum(1 for p in posts if p.get("is_sponsored"))

    # Video view rate vs likes (engagement proxy for video)
    video_posts = [p for p in posts if p.get("is_video") and p.get("video_views") is not None]
    avg_video_views = (
        round(sum(p["video_views"] for p in video_posts) / len(video_posts))
        if video_posts else None
    )

    return overall, {
        "captions_analysed":    n,
        "avg_hashtags":         round(avg_hashtags, 1),
        "avg_caption_length":   round(avg_len),
        "pct_with_cta":         round(cta_count / n * 100),
        "avg_emojis":           round(avg_emoji, 1),
        "top_hashtags":         top_hashtags,
        "hashtag_score":        round(hashtag_score, 1),
        "length_score":         round(length_score, 1),
        "cta_score":            round(cta_score, 1),
        "emoji_score":          round(emoji_score, 1),
        # Content mix
        "pct_video":            round(n_video    / n_total * 100) if n_total else 0,
        "pct_carousel":         round(n_carousel / n_total * 100) if n_total else 0,
        "pct_image":            round(n_image    / n_total * 100) if n_total else 0,
        "pct_with_location":    round(n_location / n_total * 100) if n_total else 0,
        "pct_with_mention":     round(n_mentions / n_total * 100) if n_total else 0,
        "pct_with_tag":         round(n_tagged   / n_total * 100) if n_total else 0,
        "pct_sponsored":        round(n_sponsored/ n_total * 100) if n_total else 0,
        "avg_video_views":      avg_video_views,
    }


# ── Orchestrate ────────────────────────────────────────────────────────────────

def audit_instagram(profile: dict, media: list[dict]) -> AuditResult:
    result = AuditResult("Instagram", profile, media)
    followers = profile.get("followers_count", 1) or 1

    comp_score, comp_rows = _completeness_score(profile, IG_PROFILE_FIELDS)
    freq_score, freq_data = _frequency_score(media, "timestamp")
    eng_score,  eng_data  = _engagement_score_ig(media, followers)
    cq_score,   cq_data   = _content_quality_score(media, "caption")

    result.scores = {
        "Profile Completeness": comp_score,
        "Post Frequency":       freq_score,
        "Engagement":           eng_score,
        "Content Quality":      cq_score,
    }
    result.details = {
        "completeness": comp_rows,
        "frequency":    freq_data,
        "engagement":   eng_data,
        "content":      cq_data,
    }
    result.overall = round(
        comp_score * 0.20 + freq_score * 0.25 + eng_score * 0.35 + cq_score * 0.20, 1
    )
    return result




# ══════════════════════════════════════════════════════════════════════════════
#  CHART HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _chart_gauge(score: float, label: str, platform_colour: str = "#FA5050") -> BytesIO | None:
    if not HAS_MATPLOTLIB:
        return None

    CORAL   = "#FA5050"
    TRACK   = "#F5E0DE"   # warm cream track
    score_clr = "#3DAA7D" if score >= 75 else ("#E8973A" if score >= 50 else "#D94F4F")

    fig, ax = plt.subplots(figsize=(2.8, 1.7), subplot_kw={"aspect": "equal"})
    fig.patch.set_alpha(0)
    ax.set_xlim(-1.25, 1.25)
    ax.set_ylim(-0.15, 1.35)
    ax.axis("off")

    # Track arc (full 180°)
    theta_all = [math.pi * (1 - i / 180) for i in range(181)]
    xs = [math.cos(t) for t in theta_all]
    ys = [math.sin(t) for t in theta_all]
    xi = [0.72 * math.cos(t) for t in theta_all]
    yi = [0.72 * math.sin(t) for t in theta_all]
    ax.fill_between(xs, ys, xi, alpha=1, color=TRACK, zorder=1, linewidth=0)
    ax.fill_between(xs, yi, [0] * len(xs), color="white", zorder=2, linewidth=0)

    # Filled arc proportional to score
    fill_steps = int(score / 100 * 180)
    theta_fill = [math.pi * (1 - i / 180) for i in range(fill_steps + 1)]
    xf = [math.cos(t) for t in theta_fill]
    yf = [math.sin(t) for t in theta_fill]
    xfi = [0.72 * math.cos(t) for t in theta_fill]
    yfi = [0.72 * math.sin(t) for t in theta_fill]
    if theta_fill:
        ax.fill_between(xf, yf, xfi, alpha=1, color=score_clr, zorder=3, linewidth=0)
        ax.fill_between(xf, yfi, [0] * len(xf), color="white", zorder=4, linewidth=0)

    # Needle dot at tip
    if fill_steps > 0:
        tip_angle = theta_fill[-1]
        tx = 0.86 * math.cos(tip_angle)
        ty = 0.86 * math.sin(tip_angle)
        ax.plot(tx, ty, "o", color=score_clr, markersize=5, zorder=5)

    # Centre score text
    ax.text(0, 0.28, f"{score:.0f}", ha="center", va="center",
            fontsize=20, fontweight="bold", color="#2A2A2A", zorder=6,
            fontfamily="serif")
    # Label below arc
    ax.text(0, -0.08, label, ha="center", va="center",
            fontsize=6.5, color="#6B6B6B", zorder=6, fontfamily="sans-serif")

    buf = BytesIO()
    fig.savefig(buf, format="png", dpi=160, bbox_inches="tight", transparent=True)
    plt.close(fig)
    buf.seek(0)
    return buf


def _chart_weekly(weekly_counts: list[int]) -> BytesIO | None:
    if not HAS_MATPLOTLIB:
        return None

    CORAL   = "#FA5050"
    CORAL_L = "#FDECEA"
    n = len(weekly_counts)
    # Use abbreviated labels: only show every nth label if too many weeks
    if n <= 12:
        labels = [f"W{i+1}" for i in range(n)]
    else:
        labels = [f"W{i+1}" if i % 4 == 0 else "" for i in range(n)]

    fig, ax = plt.subplots(figsize=(6.5, 2.2))
    fig.patch.set_alpha(0)
    ax.set_facecolor("none")

    bars = ax.bar(range(n), weekly_counts, color=CORAL, alpha=0.9,
                  edgecolor="white", linewidth=0.8, width=0.65)

    # Subtle horizontal grid only
    ax.yaxis.set_major_locator(mtick.MaxNLocator(integer=True, nbins=4))
    ax.yaxis.grid(True, color=CORAL_L, linewidth=0.8, zorder=0)
    ax.set_axisbelow(True)

    # Value labels on bars > 0
    for bar, val in zip(bars, weekly_counts):
        if val > 0:
            ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.05,
                    str(val), ha="center", va="bottom", fontsize=6.5,
                    color=CORAL, fontweight="bold")

    ax.set_xticks(range(n))
    ax.set_xticklabels(labels, fontsize=6.5, color="#6B6B6B")
    ax.tick_params(axis="y", labelsize=6.5, colors="#6B6B6B")
    ax.tick_params(axis="x", length=0)
    ax.tick_params(axis="y", length=0)
    for spine in ax.spines.values():
        spine.set_visible(False)

    buf = BytesIO()
    fig.savefig(buf, format="png", dpi=160, bbox_inches="tight", transparent=True)
    plt.close(fig)
    buf.seek(0)
    return buf


# ══════════════════════════════════════════════════════════════════════════════
#  PDF BUILDER
# ══════════════════════════════════════════════════════════════════════════════

def _styles():
    custom = {}
    defs = [
        # name         font()                     size  colour        spaceBefore  spaceAfter
        ("Title",    _f("FL-Heading"),             28,   FL_CORAL,     0,    8),
        ("H1",       _f("FL-Heading"),             16,   FL_WHITE,     0,    0),
        ("H2",       _f("FL-Heading"),             12,   FL_WHITE,     0,    0),
        ("H3",       _f("FL-BodyBold"),             8,   FL_MID_GREY,  4,    2),
        ("Body",     _f("FL-Body"),                 9,   FL_DARK,      0,    4),
        ("Small",    _f("FL-BodyItalic"),           7.5, FL_MID_GREY,  0,    2),
        ("Score",    _f("FL-Heading"),             32,   FL_CORAL,     0,    0),
        ("Badge",    _f("FL-BodyBold"),             9,   FL_WHITE,     0,    0),
        ("CoverSub", _f("FL-BodyItalic"),          12,   FL_CREAM,     0,    0),
        ("Label",    _f("FL-BodySemiBold"),         8,   FL_DARK,      0,    2),
    ]
    for name, font, size, colour, sb, sa in defs:
        custom[name] = ParagraphStyle(
            name, fontName=font, fontSize=size, textColor=colour,
            spaceBefore=sb, spaceAfter=sa, leading=size * 1.4,
        )
    return custom


def _section_banner(text: str, sub: bool = False) -> "Table":
    """Coral background header band with white text — replaces plain H1/H2 paragraphs."""
    font_size = 11 if sub else 16
    bg = FL_CORAL_DARK if sub else FL_CORAL
    lpad = 16 if sub else 12
    tpad = 5 if sub else 8
    style = ParagraphStyle(
        "banner_inner",
        fontName=_f("FL-Heading"),
        fontSize=font_size,
        textColor=FL_WHITE,
        leading=font_size * 1.3,
        spaceBefore=0, spaceAfter=0,
    )
    t = Table([[Paragraph(text, style)]], colWidths=[PAGE_W - 2 * MARGIN])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), bg),
        ("LEFTPADDING",   (0, 0), (-1, -1), lpad),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
        ("TOPPADDING",    (0, 0), (-1, -1), tpad),
        ("BOTTOMPADDING", (0, 0), (-1, -1), tpad),
    ]))
    return t


def _divider(coral: bool = False):
    clr = FL_CORAL if coral else FL_CREAM_MID
    return HRFlowable(width="100%", thickness=1.0 if coral else 0.5, color=clr,
                      spaceBefore=2, spaceAfter=6)


def _coloured_badge(text: str, bg: colors.Color) -> Paragraph:
    style = ParagraphStyle(
        "badge_inner",
        fontName=_f("FL-BodyBold"), fontSize=8,
        textColor=colors.white,
        backColor=bg,
        borderPadding=(2, 6, 2, 6),
        borderRadius=4,
    )
    return Paragraph(text, style)


def _score_row(label: str, score: float) -> Table:
    colour = score_colour(score)
    bar_width = PAGE_W - 2 * MARGIN - 6 * cm
    fill = bar_width * score / 100

    # Build a mini bar as a nested table
    bar_table = Table(
        [["", ""]],
        colWidths=[fill, bar_width - fill],
        rowHeights=[10],
    )
    bar_table.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (0, 0), colour),
        ("BACKGROUND",   (1, 0), (1, 0), FL_CREAM),
        ("TOPPADDING",   (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 0),
        ("LEFTPADDING",  (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))

    row = Table(
        [[Paragraph(label, _styles()["Body"]), bar_table, Paragraph(f"{score:.0f}%", _styles()["H3"])]],
        colWidths=[4 * cm, bar_width, 2 * cm],
        rowHeights=[14],
    )
    row.setStyle(TableStyle([
        ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",   (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 2),
        ("LEFTPADDING",  (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    return row


def _completeness_table(rows: list[dict], s: dict) -> Table:
    data = [[
        Paragraph("Field",   s["H3"]),
        Paragraph("Status",  s["H3"]),
        Paragraph("Weight",  s["H3"]),
    ]]
    for r in rows:
        clr = GREEN if r["present"] else RED
        # Show the specific account type label if available, otherwise Present/Missing
        detail = r.get("detail")
        if detail:
            status = f"✓  {detail}" if r["present"] else f"✗  {detail}"
        else:
            status = "✓  Present" if r["present"] else "✗  Missing"
        data.append([
            Paragraph(r["label"], s["Body"]),
            Paragraph(f'<font color="{clr.hexval()}">{status}</font>', s["Body"]),
            Paragraph(f'{r["weight"]}%', s["Small"]),
        ])
    t = Table(data, colWidths=[6 * cm, 5 * cm, 2 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0), FL_CORAL),
        ("TEXTCOLOR",     (0, 0), (-1, 0), FL_WHITE),
        ("FONT",          (0, 0), (-1, 0), _f("FL-BodyBold"), 8),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [colors.white, FL_LIGHT]),
        ("GRID",          (0, 0), (-1, -1), 0.3, FL_CREAM_MID),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("ROUNDEDCORNERS",(0, 0), (-1, -1), 3),
    ]))
    return t


def _build_ai_prompt(result: AuditResult) -> str:
    freq = result.details.get("frequency", {})
    eng  = result.details.get("engagement", {})
    cq   = result.details.get("content", {})
    comp = result.details.get("completeness", [])

    missing = [r["label"] for r in comp if isinstance(r, dict) and not r.get("present")]
    top_posts = eng.get("top_posts", [])
    top_captions = [p.get("caption", "")[:200] for p in top_posts if p.get("caption")]

    return f"""You are a senior social media strategist writing the recommendations section of a client audit report for First Light Marketing.

ACCOUNT DATA:
- Handle: @{result.profile.get("username", "")}
- Followers: {result.profile.get("followers_count", 0):,}
- Posts analysed: {freq.get("posts_analysed", 0)} (most recent)
- Period covered: {freq.get("span_days", 0)} days

SCORES (out of 100):
- Profile Completeness: {result.scores.get("Profile Completeness", 0):.0f}
- Post Frequency: {result.scores.get("Post Frequency", 0):.0f}
- Engagement: {result.scores.get("Engagement", 0):.0f}
- Content Quality: {result.scores.get("Content Quality", 0):.0f}
- Overall: {result.overall:.0f}

FREQUENCY:
- Posts per week: {freq.get("posts_per_week", 0):.2f}
- Average gap between posts: {freq.get("avg_gap_days", 0)} days
- Longest gap: {freq.get("max_gap_days", 0)} days ({freq.get("gap_multiple", 0)}× average)

ENGAGEMENT:
- Average engagement rate: {eng.get("avg_engagement_rate", 0):.2f}%
- Benchmark for this follower tier: {eng.get("benchmark_rate", 3.0):.1f}% (industry average for accounts this size)
- Average likes per post: {eng.get("avg_likes", 0)}
- Average comments per post: {"Not available (Instagram API limitation)" if eng.get("avg_comments") is None else eng.get("avg_comments")}

CONTENT:
- Average caption length: {cq.get("avg_caption_length", 0)} characters
- Average hashtags per post: {cq.get("avg_hashtags", 0)}
- Posts with a call-to-action: {cq.get("pct_with_cta", 0)}%
- Average emojis per post: {cq.get("avg_emojis", 0)}
- Top hashtags used: {", ".join(cq.get("top_hashtags", [])[:8])}

MISSING PROFILE FIELDS: {", ".join(missing) if missing else "None"}

TOP PERFORMING POST CAPTIONS:
{chr(10).join(f'- "{c}"' for c in top_captions) if top_captions else "- Not available"}

Write a recommendations section for this client. Be specific, direct, and reference actual data from above.
Avoid generic advice — everything should feel tailored to this account.

Return ONLY valid JSON in this exact structure, no other text:
{{
  "summary": "A 3-4 sentence executive summary of the account's current social media health. Mention their strongest area and biggest opportunity. Write in second person (you/your).",
  "recommendations": [
    {{
      "title": "Short action-oriented title (5-8 words)",
      "body": "3-4 sentences of specific, practical advice. Reference actual numbers or patterns from the data. Explain the why, not just the what. End with one concrete next step."
    }}
  ]
}}

Include exactly 5 recommendations, ordered from highest to lowest impact.
Each recommendation must address a distinct problem — do not repeat the same insight across multiple recommendations.
If you mention a specific tactic (e.g. POV captions, save-for-later) in one recommendation, do not repeat it in another.
The 5 recommendations should collectively cover 5 different areas of improvement."""


def _recommendations(result: AuditResult, deepseek_key: str | None = None) -> tuple[dict, bool]:
    """
    Return (rec_data, ai_generated).
    rec_data = {"summary": str, "recommendations": [{"title": str, "body": str}, ...]}
    AI-powered if a key is provided and the call succeeds, rule-based otherwise.
    """

    if deepseek_key and HAS_OPENAI:
        try:
            print("  Generating AI recommendations via DeepSeek…")
            client = _OpenAI(
                api_key=deepseek_key,
                base_url="https://api.deepseek.com",
            )
            prompt = _build_ai_prompt(result)
            response = client.chat.completions.create(
                model="deepseek-reasoner",
                messages=[{"role": "user", "content": prompt}],
                timeout=120,
            )
            content = response.choices[0].message.content.strip()
            content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content, flags=re.MULTILINE).strip()
            import json as _json
            data = _json.loads(content)
            if isinstance(data, dict) and "recommendations" in data:
                print(f"  ✓ Got {len(data['recommendations'])} AI recommendations")
                return data, True
        except Exception as e:
            print(f"\n  ⚠️  DeepSeek failed: {e}")
            print("  Falling back to rule-based recommendations.")
            print("  To debug, check: API key valid? Internet connection? pip install openai pillow?\n")

    # ── Rule-based fallback ────────────────────────────────────────────────────
    comp = result.details.get("completeness", [])
    freq = result.details.get("frequency", {})
    eng  = result.details.get("engagement", {})
    cq   = result.details.get("content", {})

    recs = []
    missing = [r["label"] for r in comp if isinstance(r, dict) and not r.get("present")]
    if missing:
        recs.append({"title": "Complete Your Profile",
                     "body": f"The following fields are missing: {', '.join(missing)}. "
                             "A complete profile builds trust with new visitors and improves discoverability."})

    ppw = freq.get("posts_per_week", 0)
    if ppw < 1:
        recs.append({"title": "Post More Consistently",
                     "body": f"You're averaging {ppw:.1f} posts/week. Aim for at least 3 to stay visible in feeds. "
                             "Batch-create content in one session and schedule it out across the week."})
    elif freq.get("gap_multiple", 0) >= 3:
        recs.append({"title": "Avoid Long Posting Gaps",
                     "body": f"Your longest gap ({freq['max_gap_days']:.0f} days) was {freq['gap_multiple']}× "
                             "your usual average. Use a content calendar to plan ahead and avoid momentum loss."})

    er = eng.get("avg_engagement_rate", 0)
    if er < 1.0:
        recs.append({"title": "Improve Engagement Rate",
                     "body": f"Your engagement rate is {er:.2f}%, below the 1–3% Instagram average. "
                             "Try ending captions with a question, running a poll in Stories, "
                             "or posting when your audience is most active."})

    if cq.get("pct_with_cta", 100) < 50:
        recs.append({"title": "Add Calls-to-Action",
                     "body": f"Only {cq.get('pct_with_cta', 0)}% of your posts include a call-to-action. "
                             "Every post should direct followers somewhere — link in bio, save this post, "
                             "tag a friend, or comment below."})

    avg_tags = cq.get("avg_hashtags", 0)
    if avg_tags < 5:
        recs.append({"title": "Use More Hashtags",
                     "body": f"You're averaging only {avg_tags:.1f} hashtags per post. "
                             "Adding 5–15 targeted hashtags can significantly improve reach with new audiences. "
                             "Mix broad, niche, and branded tags."})
    elif avg_tags > 20:
        recs.append({"title": "Refine Your Hashtag Strategy",
                     "body": f"At {avg_tags:.1f} hashtags per post you risk looking spammy. "
                             "Trim to 5–15 highly relevant tags and rotate them to avoid shadowbanning."})

    if not recs:
        recs.append({"title": "Maintain Your Momentum",
                     "body": "Your account is performing well across all key metrics. "
                             "Keep your current posting cadence, continue using CTAs, "
                             "and look for opportunities to collaborate with complementary accounts to grow your reach."})

    summary = (
        f"@{result.profile.get('username', '')} has an overall score of {result.overall:.0f}/100. "
        f"Your strongest area is {max(result.scores, key=result.scores.get)} "
        f"({max(result.scores.values()):.0f}/100), with the most room for improvement in "
        f"{min(result.scores, key=result.scores.get)} ({min(result.scores.values()):.0f}/100). "
        "The recommendations below outline the highest-impact actions to improve your Instagram presence."
    )
    return {"summary": summary, "recommendations": recs}, False


def _platform_section(story: list, result: AuditResult, s: dict, plat_colour: colors.Color,
                       deepseek_key: str | None = None, no_recs: bool = False):
    freq = result.details.get("frequency", {})
    eng  = result.details.get("engagement", {})
    cq   = result.details.get("content", {})

    # ── Platform header ────────────────────────────────────────────────────────
    story.append(_section_banner(f"Instagram Audit — @{result.profile.get('username', '')}"))
    story.append(Spacer(1, 8))

    # Overall score + sub-scores
    overall_colour = score_colour(result.overall)
    header_data = [[
        Paragraph(f"Overall Score", s["H3"]),
        Paragraph(f"{result.overall:.0f} / 100", s["Score"]),
        Paragraph(score_label(result.overall), ParagraphStyle(
            "ol", fontName=_f("FL-BodyBold"), fontSize=10,
            textColor=overall_colour, spaceAfter=0,
        )),
    ]]
    header_tbl = Table(header_data, colWidths=[5*cm, 4*cm, 4*cm])
    header_tbl.setStyle(TableStyle([
        ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",   (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 0),
    ]))
    story.append(header_tbl)
    story.append(Spacer(1, 8))

    # Gauge charts
    if HAS_MATPLOTLIB:
        gauge_cells = []
        for label, score in result.scores.items():
            buf = _chart_gauge(score, label)
            if buf:
                gauge_cells.append(Image(buf, width=3.8*cm, height=2.4*cm))
        if gauge_cells:
            t = Table([gauge_cells], colWidths=[4.2*cm] * len(gauge_cells))
            t.setStyle(TableStyle([
                ("ALIGN", (0,0), (-1,-1), "CENTER"),
                ("VALIGN",(0,0), (-1,-1), "MIDDLE"),
            ]))
            story.append(t)
            story.append(Spacer(1, 4))

    # Score bars
    story.append(Spacer(1, 4))
    for label, score in result.scores.items():
        story.append(_score_row(label, score))
    story.append(Spacer(1, 10))

    # ── Profile completeness ───────────────────────────────────────────────────
    story.append(_section_banner("Profile Completeness", sub=True))
    story.append(Spacer(1, 6))
    comp_rows = result.details.get("completeness", [])
    if comp_rows:
        story.append(_completeness_table(comp_rows, s))
    story.append(Spacer(1, 12))

    # ── Post frequency ─────────────────────────────────────────────────────────
    story.append(_section_banner("Post Frequency", sub=True))
    gap_multiple = freq.get("gap_multiple", 0)
    gap_note = f" ({gap_multiple}× avg)" if gap_multiple >= 2 else ""
    freq_rows = [
        ["Posts analysed",   str(freq.get("posts_analysed", "—"))],
        ["Period covered",   f"{freq.get('span_days', '—')} days"],
        ["Posts per week",   str(freq.get("posts_per_week", "—"))],
        ["Average gap",      f"{freq.get('avg_gap_days', '—')} days"],
        ["Longest gap",      f"{freq.get('max_gap_days', '—')} days{gap_note}"],
        ["Most recent post", freq.get("newest_post", "—")],
        ["Oldest post",      freq.get("oldest_post", "—")],
    ]
    freq_tbl = Table(
        [[Paragraph(k, s["H3"]), Paragraph(v, s["Body"])] for k, v in freq_rows],
        colWidths=[6*cm, 7*cm],
    )
    freq_tbl.setStyle(TableStyle([
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, FL_LIGHT]),
        ("GRID",          (0, 0), (-1, -1), 0.3, FL_CREAM),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
    ]))
    story.append(freq_tbl)
    story.append(Spacer(1, 6))

    # Weekly post chart
    weekly = freq.get("weekly_counts", [])
    if HAS_MATPLOTLIB and weekly:
        buf = _chart_weekly(weekly)
        if buf:
            n_weeks = len(weekly)
            story.append(Spacer(1, 4))
            story.append(Paragraph(f"Posts per week — {n_weeks} week{'s' if n_weeks != 1 else ''}, oldest → newest", s["Small"]))
            story.append(Spacer(1, 2))
            story.append(Image(buf, width=PAGE_W - 2*MARGIN - 1*cm, height=3.4*cm))
    story.append(Spacer(1, 12))

    # ── Engagement ─────────────────────────────────────────────────────────────
    story.append(_section_banner("Engagement Metrics", sub=True))
    er = eng.get("avg_engagement_rate", 0)
    benchmark = eng.get("benchmark_rate", 3.0)
    avg_comments = eng.get("avg_comments")
    comments_display = str(avg_comments) if avg_comments is not None else "N/A"
    eng_rows = [
        ["Avg engagement rate", f"{er:.2f}%"],
        ["Benchmark for account size", f"{benchmark:.1f}%"],
        ["Avg likes per post",  str(eng.get("avg_likes", "—"))],
        ["Avg comments/post",   comments_display],
    ]
    eng_tbl = Table(
        [[Paragraph(k, s["H3"]), Paragraph(v, s["Body"])] for k, v in eng_rows],
        colWidths=[6*cm, 7*cm],
    )
    eng_tbl.setStyle(TableStyle([
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, FL_LIGHT]),
        ("GRID",          (0, 0), (-1, -1), 0.3, FL_CREAM),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
    ]))
    story.append(eng_tbl)
    story.append(Spacer(1, 12))

    # ── Content quality ────────────────────────────────────────────────────────
    story.append(_section_banner("Content Quality", sub=True))
    cq_rows = [
        ["Captions analysed",   str(cq.get("captions_analysed", "—"))],
        ["Avg caption length",  f"{cq.get('avg_caption_length', '—')} chars"],
        ["Avg hashtags/post",   str(cq.get("avg_hashtags", "—"))],
        ["Posts with CTA",      f"{cq.get('pct_with_cta', '—')}%"],
        ["Avg emojis/post",     str(cq.get("avg_emojis", "—"))],
        ["— Content mix —",     ""],
        ["Images",              f"{cq.get('pct_image', '—')}%"],
        ["Videos",              f"{cq.get('pct_video', '—')}%"],
        ["Carousels",           f"{cq.get('pct_carousel', '—')}%"],
        ["Posts with location", f"{cq.get('pct_with_location', '—')}%"],
        ["Posts with @mention", f"{cq.get('pct_with_mention', '—')}%"],
        ["Posts with tag",      f"{cq.get('pct_with_tag', '—')}%"],
        ["Sponsored posts",     f"{cq.get('pct_sponsored', '—')}%"],
    ]
    if cq.get("avg_video_views") is not None:
        cq_rows.append(["Avg video views", f"{cq['avg_video_views']:,}"])
    cq_tbl = Table(
        [[Paragraph(k, s["H3"]), Paragraph(v, s["Body"])] for k, v in cq_rows],
        colWidths=[6*cm, 7*cm],
    )
    cq_tbl.setStyle(TableStyle([
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, FL_LIGHT]),
        ("GRID",          (0, 0), (-1, -1), 0.3, FL_CREAM),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
    ]))
    story.append(cq_tbl)

    # Top hashtags
    top_tags = cq.get("top_hashtags", [])
    if top_tags:
        story.append(Spacer(1, 4))
        story.append(Paragraph("Top hashtags: " + "  ".join(top_tags), s["Small"]))
    story.append(Spacer(1, 10))

    # ── Recommendations ────────────────────────────────────────────────────────
    if no_recs:
        return  # healthcheck mode — skip recommendations entirely

    rec_data, ai_generated = _recommendations(result, deepseek_key=deepseek_key)
    source_label = (
        "AI-generated by DeepSeek Reasoner"
        if ai_generated else
        "Rule-based recommendations"
    )
    source_style = ParagraphStyle(
        "rec_source", fontName=_f("FL-Body"), fontSize=7.5,
        textColor=GREEN if ai_generated else FL_MID_GREY, spaceAfter=6,
    )
    story.append(PageBreak())
    story.append(_section_banner("Recommendations"))
    story.append(Spacer(1, 8))
    story.append(Paragraph(source_label, source_style))

    # Executive summary box
    summary = rec_data.get("summary", "")
    if summary:
        summary_tbl = Table(
            [[Paragraph(summary, ParagraphStyle(
                "summary_body", fontName=_f("FL-Body"), fontSize=9.5,
                textColor=FL_DARK, leading=14,
            ))]],
            colWidths=[PAGE_W - 2 * MARGIN],
        )
        summary_tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), FL_CREAM),
            ("LEFTPADDING",   (0, 0), (-1, -1), 12),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 12),
            ("TOPPADDING",    (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ]))
        story.append(summary_tbl)
        story.append(Spacer(1, 14))

    # Individual recommendation blocks
    for i, rec in enumerate(rec_data.get("recommendations", []), 1):
        title = rec.get("title", f"Recommendation {i}") if isinstance(rec, dict) else f"Recommendation {i}"
        body  = rec.get("body", rec) if isinstance(rec, dict) else str(rec)

        # Numbered coral circle + title row
        number_style = ParagraphStyle(
            "rec_num", fontName=_f("FL-Heading"), fontSize=13,
            textColor=FL_CORAL, leading=16,
        )
        title_style = ParagraphStyle(
            "rec_title", fontName=_f("FL-Heading"), fontSize=12,
            textColor=FL_DARK, leading=16,
        )
        body_style = ParagraphStyle(
            "rec_body", fontName=_f("FL-Body"), fontSize=9,
            textColor=FL_DARK, leading=14, spaceAfter=0,
        )
        header_row = Table(
            [[Paragraph(str(i), number_style), Paragraph(title, title_style)]],
            colWidths=[1 * cm, PAGE_W - 2 * MARGIN - 1 * cm],
        )
        header_row.setStyle(TableStyle([
            ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING",   (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 0),
            ("LEFTPADDING",  (0, 0), (-1, -1), 0),
        ]))
        block = Table(
            [[header_row], [Paragraph(body, body_style)]],
            colWidths=[PAGE_W - 2 * MARGIN],
        )
        block.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), colors.white),
            ("LEFTPADDING",   (0, 0), (-1, -1), 12),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 12),
            ("TOPPADDING",    (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ("LINEBELOW",     (0, -1), (-1, -1), 0.5, FL_CREAM),
            ("LINEBEFORE",    (0, 0), (0, -1), 3, FL_CORAL),
        ]))
        story.append(block)
        story.append(Spacer(1, 6))
    story.append(Spacer(1, 4))


def _fl_page_template(canvas_obj, doc):
    """Header and footer drawn on every page after the cover."""
    canvas_obj.saveState()
    w, h = A4

    # ── Top bar ───────────────────────────────────────────────────────────────
    canvas_obj.setFillColor(FL_CORAL)
    canvas_obj.rect(0, h - 1.1 * cm, w, 1.1 * cm, fill=1, stroke=0)

    # Mini sunburst in top bar
    _draw_sunburst(canvas_obj, 1.5 * cm, h - 0.55 * cm, 0.32 * cm,
                   ray_colour=FL_WHITE)

    # Agency name in top bar
    canvas_obj.setFillColor(FL_WHITE)
    canvas_obj.setFont(_f("FL-Body"), 7.5)
    canvas_obj.drawString(2.3 * cm, h - 0.68 * cm, "FIRST LIGHT MARKETING")

    # Page number (right side)
    canvas_obj.setFont(_f("FL-Body"), 7.5)
    canvas_obj.drawRightString(w - MARGIN, h - 0.68 * cm,
                               f"Page {doc.page}")

    # ── Bottom bar ────────────────────────────────────────────────────────────
    canvas_obj.setFillColor(FL_CREAM)
    canvas_obj.rect(0, 0, w, 0.8 * cm, fill=1, stroke=0)
    canvas_obj.setFillColor(FL_CORAL)
    canvas_obj.setFont(_f("FL-Body"), 7)
    canvas_obj.drawCentredString(w / 2, 0.28 * cm,
        "Prepared by First Light Marketing  ·  firstlightmarketing.co.uk  ·  Confidential")

    canvas_obj.restoreState()


def _fl_cover_template(canvas_obj, doc):
    """Full coral cover page background — no header/footer strip."""
    canvas_obj.saveState()
    w, h = A4
    # Coral fill top third
    canvas_obj.setFillColor(FL_CORAL)
    canvas_obj.rect(0, h * 0.55, w, h * 0.45, fill=1, stroke=0)
    # Subtle cream strip at very bottom
    canvas_obj.setFillColor(FL_CREAM)
    canvas_obj.rect(0, 0, w, 0.6 * cm, fill=1, stroke=0)
    canvas_obj.restoreState()


def build_pdf(results: list[AuditResult], output_path: str,
              deepseek_key: str | None = None, logo_path: str | None = None,
              no_recs: bool = False):
    from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate

    s = _styles()
    w, h = A4

    # ── Document with two page templates ──────────────────────────────────────
    doc = BaseDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=1.4 * cm, bottomMargin=1.2 * cm,
        title="Social Media Audit — First Light Marketing",
        author="First Light Marketing",
    )
    cover_frame = Frame(MARGIN, 1.2*cm, w - 2*MARGIN, h - 1.2*cm, id="cover")
    body_frame  = Frame(MARGIN, 1.2*cm, w - 2*MARGIN, h - 1.4*cm - 1.2*cm, id="body")

    doc.addPageTemplates([
        PageTemplate(id="Cover", frames=[cover_frame], onPage=_fl_cover_template),
        PageTemplate(id="Body",  frames=[body_frame],  onPage=_fl_page_template),
    ])

    story = []

    # ── Cover page ────────────────────────────────────────────────────────────
    story.append(Spacer(1, h * 0.05))
    # Use real logo PNG if available, else fall back to drawn version
    import os as _os
    _logo_candidates = [
        logo_path,
        _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "1.png"),
        _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "logo.png"),
    ]
    _logo_file = next((p for p in _logo_candidates if p and _os.path.exists(p)), None)
    if _logo_file:
        # Real PNG — size it to sit in the coral band
        from PIL import Image as _PILImage
        with _PILImage.open(_logo_file) as _im:
            _iw, _ih = _im.size
        _max_w = (w - 2 * MARGIN) * 0.55
        _max_h = h * 0.28
        _scale = min(_max_w / _iw, _max_h / _ih)
        _rw, _rh = _iw * _scale, _ih * _scale
        story.append(Spacer(1, (h * 0.33 - _rh) / 2))
        story.append(Image(_logo_file, width=_rw, height=_rh, hAlign="CENTER"))
        story.append(Spacer(1, (h * 0.33 - _rh) / 2))
    else:
        story.append(_logo_flowable(w - 2 * MARGIN, h * 0.30, on_dark=True))

    # White content area
    story.append(Spacer(1, 0.6 * cm))
    story.append(Paragraph("Instagram Audit Report",
                            ParagraphStyle("cover_title", fontName=_f("FL-Heading"),
                                           fontSize=28, textColor=FL_CORAL, leading=34,
                                           spaceAfter=4)))
    story.append(Spacer(1, 4))

    handle = results[0].profile.get("username", "") if results else ""
    if handle:
        story.append(Paragraph(
            f"@{handle}",
            ParagraphStyle("handle", fontName=_f("FL-Heading"), fontSize=16,
                           textColor=FL_CORAL, spaceAfter=4),
        ))

    story.append(Paragraph(
        f"Prepared {datetime.now().strftime('%d %B %Y')}",
        ParagraphStyle("date", fontName=_f("FL-Body"), fontSize=10,
                       textColor=FL_MID_GREY, spaceAfter=12),
    ))
    story.append(_divider(coral=True))
    story.append(Spacer(1, 8))

    # Summary scorecard on cover
    summary_data = [[
        Paragraph("Metric",       s["H3"]),
        Paragraph("Score",        s["H3"]),
        Paragraph("Rating",       s["H3"]),
    ]]
    for r in results:
        for label, score in r.scores.items():
            summary_data.append([
                Paragraph(label, s["Body"]),
                Paragraph(f"{score:.0f} / 100", s["Body"]),
                Paragraph(
                    f'<font color="{score_colour(score).hexval()}">'
                    f'{score_label(score)}</font>',
                    s["Body"],
                ),
            ])
        summary_data.append([
            Paragraph("<b>Overall</b>", s["Body"]),
            Paragraph(
                f'<font color="{FL_CORAL.hexval()}"><b>{r.overall:.0f} / 100</b></font>',
                s["Body"],
            ),
            Paragraph(
                f'<font color="{score_colour(r.overall).hexval()}">'
                f'<b>{score_label(r.overall)}</b></font>',
                s["Body"],
            ),
        ])

    cw = (w - 2*MARGIN) / 3
    summary_tbl = Table(summary_data, colWidths=[cw * 1.6, cw * 0.8, cw * 0.6])
    summary_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0), FL_CORAL),
        ("TEXTCOLOR",     (0, 0), (-1, 0), FL_WHITE),
        ("ROWBACKGROUNDS",(0, 1), (-1, -2), [FL_WHITE, FL_LIGHT]),
        ("BACKGROUND",    (0, -1), (-1, -1), FL_CREAM),
        ("GRID",          (0, 0), (-1, -1), 0.3, FL_CREAM),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
    ]))
    story.append(summary_tbl)

    # ── Switch to body template for detail pages ───────────────────────────────
    from reportlab.platypus import NextPageTemplate
    story.append(NextPageTemplate("Body"))
    story.append(PageBreak())

    for i, result in enumerate(results):
        if i > 0:
            story.append(PageBreak())
        _platform_section(story, result, s, FL_CORAL, deepseek_key=deepseek_key, no_recs=no_recs)

    # ── Services & CTA page ────────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(_section_banner("How First Light Marketing Can Help"))
    story.append(Spacer(1, 12))

    intro_style = ParagraphStyle(
        "services_intro", fontName=_f("FL-BodyItalic"), fontSize=11,
        textColor=FL_DARK, leading=16, spaceAfter=14,
    )
    story.append(Paragraph(
        "Marketing support shaped around what your business actually needs. Whether you need "
        "strategic direction, content creation, launch support or a flexible marketing partner, "
        "Niamh can step in where the pressure is highest and help the full picture work together.",
        intro_style,
    ))

    # Services list
    services = [
        (
            "Marketing Support",
            "Your marketing partner, without the full-time salary. Whether you need someone "
            "to take marketing off your plate or extra support alongside your existing team, "
            "Niamh becomes an extension of your business — from planning campaigns to managing "
            "day-to-day marketing.",
        ),
        (
            "Marketing Strategy",
            "Clear direction before you start. If you're unsure where to focus, struggling to "
            "attract the right customers, or need an experienced marketer to guide your next steps, "
            "we'll uncover opportunities, identify what's holding your business back, and create a "
            "practical plan to move forward with confidence.",
        ),
        (
            "Content Creation",
            "Content that connects with your audience. People don't buy because they've seen one "
            "advert — they buy because they've seen your business consistently showing up. "
            "Photography and video designed to build trust, showcase your business, and give you a "
            "library of content that works across social, website, email, and advertising.",
        ),
        (
            "Campaigns & Launches",
            "Bringing your biggest ideas to life. Whether it's a product, service, event, or "
            "seasonal campaign, every moving part is managed to ensure your launch is organised, "
            "consistent, and impactful — from planning timelines and coordinating content to "
            "briefing creatives and analysing results.",
        ),
        (
            "Fractional Marketing",
            "Senior marketing expertise, when you need it. Not every business needs a full-time "
            "Marketing Manager, but every business benefits from experienced support. Flexible, "
            "strategic, and hands-on — without the cost and commitment of a full-time hire. "
            "Ideal for businesses that are growing but not quite ready for in-house marketing.",
        ),
    ]

    svc_title_style = ParagraphStyle(
        "svc_title", fontName=_f("FL-Heading"), fontSize=11,
        textColor=FL_CORAL, leading=14, spaceBefore=0, spaceAfter=2,
    )
    svc_body_style = ParagraphStyle(
        "svc_body", fontName=_f("FL-Body"), fontSize=9,
        textColor=FL_DARK, leading=13, spaceAfter=0,
    )

    svc_rows = []
    for title, body in services:
        cell = [Paragraph(title, svc_title_style), Paragraph(body, svc_body_style)]
        svc_rows.append(cell)

    # Two-column layout
    col_w = (PAGE_W - 2 * MARGIN - 0.5 * cm) / 2
    svc_data = [svc_rows[i:i+2] for i in range(0, len(svc_rows), 2)]
    for row_pair in svc_data:
        while len(row_pair) < 2:
            row_pair.append([Paragraph("", svc_body_style)])
        tbl = Table(
            [[row_pair[0], row_pair[1]]],
            colWidths=[col_w, col_w],
        )
        tbl.setStyle(TableStyle([
            ("VALIGN",        (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING",   (0, 0), (-1, -1), 10),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
            ("TOPPADDING",    (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ("BACKGROUND",    (0, 0), (-1, -1), FL_LIGHT),
            ("LINEBEFORE",    (0, 0), (0, -1), 3, FL_CORAL),
            ("LINEBEFORE",    (1, 0), (1, -1), 3, FL_CORAL),
        ]))
        story.append(tbl)
        story.append(Spacer(1, 8))

    # Contact button
    story.append(Spacer(1, 16))
    story.append(_divider(coral=True))
    story.append(Spacer(1, 14))

    contact_url = "https://www.firstlightmarketing.co.uk/contact"
    btn_style = ParagraphStyle(
        "cta_btn", fontName=_f("FL-BodyBold"), fontSize=11,
        textColor=FL_WHITE, leading=14, alignment=1,   # centred
    )
    btn_tbl = Table(
        [[Paragraph(
            f'<link href="{contact_url}">Get in touch →</link>',
            btn_style,
        )]],
        colWidths=[8 * cm],
        rowHeights=[1.1 * cm],
        hAlign="CENTER",
    )
    btn_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), FL_CORAL),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING",   (0, 0), (-1, -1), 20),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 20),
    ]))
    story.append(btn_tbl)
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        f'<link href="{contact_url}">{contact_url}</link>',
        ParagraphStyle("cta_url", fontName=_f("FL-Body"), fontSize=8,
                       textColor=FL_MID_GREY, alignment=1),
    ))

    # ── Footer note ────────────────────────────────────────────────────────────
    story.append(Spacer(1, 20))
    story.append(_divider(coral=True))
    story.append(Paragraph(
        "This report is based on publicly available data. "
        "Engagement benchmarks are approximate industry averages and may vary by niche. "
        "Prepared exclusively for the named client by First Light Marketing.",
        s["Small"],
    ))

    doc.build(story)
    print(f"✓ Report written to {output_path}")


# ══════════════════════════════════════════════════════════════════════════════
#  COMPETITOR COMPARISON — CHART, AI PROMPT, PDF
# ══════════════════════════════════════════════════════════════════════════════

def _chart_comparison_bars(client: AuditResult, competitor: AuditResult) -> BytesIO | None:
    """Grouped bar chart comparing client vs competitor across all score categories."""
    if not HAS_MATPLOTLIB:
        return None

    categories  = list(client.scores.keys())
    client_vals = [client.scores[k] for k in categories]
    comp_vals   = [competitor.scores[k] for k in categories]
    n = len(categories)

    fig, ax = plt.subplots(figsize=(7.2, 3.6))
    fig.patch.set_facecolor("white")
    ax.set_facecolor("#FEF4F2")

    x     = list(range(n))
    bar_w = 0.35

    c_label = f"@{client.profile.get('username', 'Client')}"
    x_label = f"@{competitor.profile.get('username', 'Competitor')}"

    bars_a = ax.bar([i - bar_w/2 for i in x], client_vals, width=bar_w,
                    color="#FA5050", zorder=3, label=c_label)
    bars_b = ax.bar([i + bar_w/2 for i in x], comp_vals,   width=bar_w,
                    color="#2A2A2A", zorder=3, label=x_label, alpha=0.70)

    ax.set_xticks(x)
    ax.set_xticklabels([c.replace(" ", "\n") for c in categories],
                       fontsize=9, color="#2A2A2A")
    ax.set_ylim(0, 115)
    ax.set_ylabel("Score / 100", fontsize=9, color="#6B6B6B")
    ax.yaxis.set_major_formatter(mtick.FormatStrFormatter('%d'))
    ax.tick_params(axis='y', colors="#6B6B6B", labelsize=8)
    ax.tick_params(axis='x', colors="#2A2A2A")
    for spine in ["top", "right"]:
        ax.spines[spine].set_visible(False)
    ax.spines["left"].set_color("#F9D8D4")
    ax.spines["bottom"].set_color("#F9D8D4")
    ax.yaxis.grid(True, color="#F9D8D4", linewidth=0.8, zorder=0)
    ax.set_axisbelow(True)

    for bar in bars_a:
        h = bar.get_height()
        ax.text(bar.get_x() + bar.get_width() / 2, h + 1.5, f"{h:.0f}",
                ha="center", va="bottom", fontsize=7.5, color="#FA5050", fontweight="bold")
    for bar in bars_b:
        h = bar.get_height()
        ax.text(bar.get_x() + bar.get_width() / 2, h + 1.5, f"{h:.0f}",
                ha="center", va="bottom", fontsize=7.5, color="#2A2A2A", fontweight="bold")

    ax.legend(frameon=False, fontsize=8.5, loc="upper right")
    plt.tight_layout(pad=0.6)

    buf = BytesIO()
    fig.savefig(buf, format="png", dpi=150, bbox_inches="tight",
                facecolor="white", transparent=False)
    plt.close(fig)
    buf.seek(0)
    return buf


def _build_comparison_ai_prompt(client: AuditResult, competitor: AuditResult) -> str:
    c_freq = client.details.get("frequency", {})
    c_eng  = client.details.get("engagement", {})
    c_cq   = client.details.get("content", {})
    x_freq = competitor.details.get("frequency", {})
    x_eng  = competitor.details.get("engagement", {})
    x_cq   = competitor.details.get("content", {})
    c_h    = client.profile.get("username", "client")
    x_h    = competitor.profile.get("username", "competitor")

    return f"""You are a senior social media strategist at First Light Marketing.
You are writing the competitive analysis section of a client report.
The CLIENT is @{c_h}. The COMPETITOR is @{x_h}.
All recommendations should address the client (@{c_h}) to help them close gaps or build on advantages.

CLIENT (@{c_h}):
- Followers: {client.profile.get("followers_count", 0):,}
- Overall Score: {client.overall:.0f}/100
- Profile Completeness: {client.scores.get("Profile Completeness", 0):.0f}/100
- Post Frequency: {client.scores.get("Post Frequency", 0):.0f}/100
- Engagement: {client.scores.get("Engagement", 0):.0f}/100
- Content Quality: {client.scores.get("Content Quality", 0):.0f}/100
- Posts/week: {c_freq.get("posts_per_week", 0):.2f}
- Avg engagement rate: {c_eng.get("avg_engagement_rate", 0):.2f}%
- Avg likes/post: {c_eng.get("avg_likes", 0)}
- Avg caption length: {c_cq.get("avg_caption_length", 0):.0f} chars
- Avg hashtags: {c_cq.get("avg_hashtags", 0):.1f}
- Posts with CTA: {c_cq.get("pct_with_cta", 0):.0f}%
- Avg emojis: {c_cq.get("avg_emojis", 0):.1f}

COMPETITOR (@{x_h}):
- Followers: {competitor.profile.get("followers_count", 0):,}
- Overall Score: {competitor.overall:.0f}/100
- Profile Completeness: {competitor.scores.get("Profile Completeness", 0):.0f}/100
- Post Frequency: {competitor.scores.get("Post Frequency", 0):.0f}/100
- Engagement: {competitor.scores.get("Engagement", 0):.0f}/100
- Content Quality: {competitor.scores.get("Content Quality", 0):.0f}/100
- Posts/week: {x_freq.get("posts_per_week", 0):.2f}
- Avg engagement rate: {x_eng.get("avg_engagement_rate", 0):.2f}%
- Avg likes/post: {x_eng.get("avg_likes", 0)}
- Avg caption length: {x_cq.get("avg_caption_length", 0):.0f} chars
- Avg hashtags: {x_cq.get("avg_hashtags", 0):.1f}
- Posts with CTA: {x_cq.get("pct_with_cta", 0):.0f}%
- Avg emojis: {x_cq.get("avg_emojis", 0):.1f}

Return ONLY valid JSON in this exact structure, no other text:
{{
  "verdict": "3-4 sentences. State the overall score gap. Name who leads overall. Identify the single most important gap for the client to close. Be direct and reference actual numbers.",
  "client_strengths": [
    "One sentence per strength — reference a specific metric or number."
  ],
  "competitor_advantages": [
    "One sentence per advantage the competitor holds — reference a specific metric or number."
  ],
  "recommendations": [
    {{
      "title": "Short action-oriented title (5-8 words)",
      "body": "3-4 sentences. Reference the competitive gap with actual numbers. Explain why it matters. End with one concrete next step."
    }}
  ]
}}

Include exactly 3 items in client_strengths, exactly 3 in competitor_advantages, and exactly 5 recommendations.
Each recommendation must address a distinct problem — do not repeat the same insight.
Order recommendations from highest to lowest competitive impact."""


def _comparison_ai(client: AuditResult, competitor: AuditResult,
                   deepseek_key: str | None = None) -> tuple[dict, bool]:
    """Run AI comparison analysis. Returns (data, ai_generated)."""
    if deepseek_key and HAS_OPENAI:
        try:
            print("  Generating AI competitive analysis via DeepSeek…")
            from openai import OpenAI as _OAI
            oa = _OAI(api_key=deepseek_key, base_url="https://api.deepseek.com")
            resp = oa.chat.completions.create(
                model="deepseek-reasoner",
                messages=[{"role": "user", "content": _build_comparison_ai_prompt(client, competitor)}],
                timeout=120,
            )
            content = resp.choices[0].message.content.strip()
            content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content, flags=re.MULTILINE).strip()
            import json as _j
            data = _j.loads(content)
            if isinstance(data, dict) and "recommendations" in data:
                print("  ✓ Got AI competitive analysis")
                return data, True
        except Exception as e:
            print(f"  ⚠️  DeepSeek failed: {e} — falling back to rule-based analysis")

    # ── Rule-based fallback ────────────────────────────────────────────────────
    c_h = client.profile.get("username", "your account")
    x_h = competitor.profile.get("username", "the competitor")
    gap = client.overall - competitor.overall

    if gap >= 0:
        verdict = (
            f"@{c_h} leads overall with {client.overall:.0f}/100 versus @{x_h} at "
            f"{competitor.overall:.0f}/100 — a {gap:.0f}-point advantage. "
            "While you are ahead on balance, there are specific areas where the competitor "
            "has an edge worth addressing to protect and grow that lead."
        )
    else:
        verdict = (
            f"@{x_h} currently leads with {competitor.overall:.0f}/100 versus your "
            f"{client.overall:.0f}/100 — a {abs(gap):.0f}-point gap. "
            "The recommendations below focus on the highest-impact areas to close this gap."
        )

    strengths, gaps_list = [], []
    for metric in client.scores:
        diff = client.scores[metric] - competitor.scores.get(metric, 0)
        if diff >= 5:
            strengths.append(
                f"{metric}: you score {client.scores[metric]:.0f} vs {competitor.scores.get(metric, 0):.0f} "
                f"— a {diff:.0f}-point lead."
            )
        elif diff <= -5:
            gaps_list.append(
                f"{metric}: competitor scores {competitor.scores.get(metric, 0):.0f} vs your "
                f"{client.scores[metric]:.0f} — a {abs(diff):.0f}-point gap."
            )

    while len(strengths)  < 3:
        strengths.append("Your account maintains a consistent presence that builds audience trust over time.")
    while len(gaps_list) < 3:
        gaps_list.append("There are opportunities to differentiate your content strategy from the competitor's.")

    c_eng  = client.details.get("engagement", {})
    x_eng  = competitor.details.get("engagement", {})
    c_freq = client.details.get("frequency", {})
    x_freq = competitor.details.get("frequency", {})
    c_cq   = client.details.get("content", {})
    x_cq   = competitor.details.get("content", {})

    recs = [
        {
            "title": "Close the Engagement Rate Gap",
            "body": (
                f"Your engagement rate is {c_eng.get('avg_engagement_rate', 0):.2f}% versus the "
                f"competitor's {x_eng.get('avg_engagement_rate', 0):.2f}%. "
                "End captions with a direct question to prompt comments, and reply to every comment "
                "within the first hour of posting to signal activity to the algorithm. "
                "Stories polls are a quick win to boost interaction without requiring new feed content."
            ),
        },
        {
            "title": "Match or Exceed Posting Frequency",
            "body": (
                f"You post {c_freq.get('posts_per_week', 0):.1f} times per week versus the "
                f"competitor's {x_freq.get('posts_per_week', 0):.1f}. "
                "Consistent posting volume is one of the strongest signals to the Instagram algorithm. "
                "Batch-create a week's content in a single session and schedule it in advance to "
                "maintain cadence without daily pressure."
            ),
        },
        {
            "title": "Add Clear CTAs to Every Post",
            "body": (
                f"Only {c_cq.get('pct_with_cta', 0):.0f}% of your posts include a clear call-to-action. "
                "Every caption should direct followers to a next step — link in bio, save this post, "
                "comment below, or tag a friend. "
                "The first line of your caption determines whether someone taps 'more' or scrolls past — "
                "test bold openers that lead directly into the value of the post."
            ),
        },
        {
            "title": "Refine Your Hashtag Strategy",
            "body": (
                f"You average {c_cq.get('avg_hashtags', 0):.1f} hashtags versus the competitor's "
                f"{x_cq.get('avg_hashtags', 0):.1f}. "
                "Mix broad, niche, and branded hashtags to maximise discoverability across different "
                "audience segments. Rotate your hashtag sets regularly to avoid shadowbanning and "
                "track which combinations drive the most reach."
            ),
        },
        {
            "title": "Study Competitor's Top-Performing Content",
            "body": (
                "Identify the competitor's highest-performing posts by engagement and study the "
                "format, caption style, and timing. "
                "Use it as a signal for what your shared audience responds to, then execute similar "
                "angles in your own brand voice. "
                "Set a monthly review to track any new formats or topics they introduce."
            ),
        },
    ]

    return {
        "verdict":               verdict,
        "client_strengths":      strengths[:3],
        "competitor_advantages": gaps_list[:3],
        "recommendations":       recs,
    }, False


def build_comparison_pdf(client: AuditResult, competitor: AuditResult, output_path: str,
                         deepseek_key: str | None = None, logo_path: str | None = None):
    """Build a branded competitor comparison PDF report."""
    from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate, NextPageTemplate

    s    = _styles()
    w, h = A4
    c_h  = client.profile.get("username", "Client")
    x_h  = competitor.profile.get("username", "Competitor")

    doc = BaseDocTemplate(
        output_path, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=1.4 * cm, bottomMargin=1.2 * cm,
        title=f"Competitor Analysis: @{c_h} vs @{x_h} — First Light Marketing",
        author="First Light Marketing",
    )
    cover_frame = Frame(MARGIN, 1.2*cm, w - 2*MARGIN, h - 1.2*cm, id="cover")
    body_frame  = Frame(MARGIN, 1.2*cm, w - 2*MARGIN, h - 1.4*cm - 1.2*cm, id="body")
    doc.addPageTemplates([
        PageTemplate(id="Cover", frames=[cover_frame], onPage=_fl_cover_template),
        PageTemplate(id="Body",  frames=[body_frame],  onPage=_fl_page_template),
    ])

    story = []

    # ── Cover ─────────────────────────────────────────────────────────────────
    story.append(Spacer(1, h * 0.05))
    import os as _os
    _logo_candidates = [
        logo_path,
        _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "1.png"),
        _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "logo.png"),
    ]
    _logo_file = next((p for p in _logo_candidates if p and _os.path.exists(p)), None)
    if _logo_file:
        from PIL import Image as _PILImage
        with _PILImage.open(_logo_file) as _im:
            _iw, _ih = _im.size
        _max_w = (w - 2 * MARGIN) * 0.55
        _max_h = h * 0.28
        _scale = min(_max_w / _iw, _max_h / _ih)
        _rw, _rh = _iw * _scale, _ih * _scale
        story.append(Spacer(1, (h * 0.33 - _rh) / 2))
        story.append(Image(_logo_file, width=_rw, height=_rh, hAlign="CENTER"))
        story.append(Spacer(1, (h * 0.33 - _rh) / 2))
    else:
        story.append(_logo_flowable(w - 2 * MARGIN, h * 0.30, on_dark=True))

    story.append(Spacer(1, 0.6 * cm))
    story.append(Paragraph(
        "Instagram Competitor Analysis",
        ParagraphStyle("cov_title", fontName=_f("FL-Heading"), fontSize=26,
                       textColor=FL_CORAL, leading=32, spaceAfter=4),
    ))
    story.append(Paragraph(
        f"@{c_h}  vs  @{x_h}",
        ParagraphStyle("cov_vs", fontName=_f("FL-Heading"), fontSize=15,
                       textColor=FL_DARK, spaceAfter=4),
    ))
    story.append(Paragraph(
        f"Prepared {datetime.now().strftime('%d %B %Y')}",
        ParagraphStyle("cov_date", fontName=_f("FL-Body"), fontSize=10,
                       textColor=FL_MID_GREY, spaceAfter=12),
    ))
    story.append(_divider(coral=True))
    story.append(Spacer(1, 8))

    # Score table: Metric | @client | @competitor | Edge
    cov_hdr  = ParagraphStyle("cov_hdr",  fontName=_f("FL-BodyBold"), fontSize=9, textColor=FL_WHITE)
    cov_cell = ParagraphStyle("cov_cell", fontName=_f("FL-Body"),      fontSize=9, textColor=FL_DARK, leading=13)

    score_cats = list(client.scores.keys()) + ["Overall"]
    cov_data = [[
        Paragraph("Metric",    cov_hdr),
        Paragraph(f"@{c_h}",   cov_hdr),
        Paragraph(f"@{x_h}",   cov_hdr),
        Paragraph("Edge",      cov_hdr),
    ]]
    for cat in score_cats:
        c_val = client.overall       if cat == "Overall" else client.scores.get(cat, 0)
        x_val = competitor.overall   if cat == "Overall" else competitor.scores.get(cat, 0)
        if c_val > x_val + 0.5:
            edge = f'<font color="#FA5050">▲ @{c_h}</font>'
        elif x_val > c_val + 0.5:
            edge = f'<font color="#6B6B6B">▲ @{x_h}</font>'
        else:
            edge = "Draw"
        bold = cat == "Overall"
        label_txt = f"<b>{cat}</b>" if bold else cat
        c_txt     = f"<b>{c_val:.0f}</b>" if bold else f"{c_val:.0f}"
        x_txt     = f"<b>{x_val:.0f}</b>" if bold else f"{x_val:.0f}"
        cov_data.append([
            Paragraph(label_txt, cov_cell),
            Paragraph(c_txt,     cov_cell),
            Paragraph(x_txt,     cov_cell),
            Paragraph(edge,      cov_cell),
        ])

    cw = w - 2*MARGIN
    cov_tbl = Table(cov_data, colWidths=[cw*0.40, cw*0.20, cw*0.20, cw*0.20])
    cov_tbl.setStyle(TableStyle([
        ("BACKGROUND",     (0, 0), (-1, 0),  FL_CORAL),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [FL_WHITE, FL_LIGHT]),
        ("BACKGROUND",     (0, -1), (-1, -1), FL_CREAM),
        ("GRID",           (0, 0), (-1, -1), 0.3, FL_CREAM_MID),
        ("TOPPADDING",     (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING",  (0, 0), (-1, -1), 5),
        ("LEFTPADDING",    (0, 0), (-1, -1), 8),
    ]))
    story.append(cov_tbl)

    # ── Body ──────────────────────────────────────────────────────────────────
    story.append(NextPageTemplate("Body"))
    story.append(PageBreak())

    # ── Page 1: key metrics + bar chart ───────────────────────────────────────
    story.append(_section_banner("Head-to-Head Metrics"))
    story.append(Spacer(1, 10))

    c_freq = client.details.get("frequency", {})
    c_eng  = client.details.get("engagement", {})
    c_cq   = client.details.get("content", {})
    x_freq = competitor.details.get("frequency", {})
    x_eng  = competitor.details.get("engagement", {})
    x_cq   = competitor.details.get("content", {})

    mtr_h   = ParagraphStyle("mtr_h",  fontName=_f("FL-BodyBold"), fontSize=9, textColor=FL_WHITE)
    mtr_b   = ParagraphStyle("mtr_b",  fontName=_f("FL-Body"),      fontSize=9, textColor=FL_DARK, leading=13)
    mtr_b_b = ParagraphStyle("mtr_bb", fontName=_f("FL-BodyBold"), fontSize=9, textColor=FL_CORAL, leading=13)

    def _winner_style(c_raw, x_raw):
        try:
            c_f = float(str(c_raw).replace("%", "").replace(",", ""))
            x_f = float(str(x_raw).replace("%", "").replace(",", ""))
            return (mtr_b_b, mtr_b) if c_f >= x_f else (mtr_b, mtr_b)
        except Exception:
            return mtr_b, mtr_b

    metric_rows = [
        ("Followers",
         f"{client.profile.get('followers_count', 0):,}",
         f"{competitor.profile.get('followers_count', 0):,}"),
        ("Posts analysed",
         str(c_freq.get("posts_analysed", "—")),
         str(x_freq.get("posts_analysed", "—"))),
        ("Posts per week",
         f"{c_freq.get('posts_per_week', 0):.2f}",
         f"{x_freq.get('posts_per_week', 0):.2f}"),
        ("Avg engagement rate",
         f"{c_eng.get('avg_engagement_rate', 0):.2f}%",
         f"{x_eng.get('avg_engagement_rate', 0):.2f}%"),
        ("Avg likes per post",
         str(c_eng.get("avg_likes", "—")),
         str(x_eng.get("avg_likes", "—"))),
        ("Avg caption length",
         f"{c_cq.get('avg_caption_length', 0):.0f} chars",
         f"{x_cq.get('avg_caption_length', 0):.0f} chars"),
        ("Avg hashtags",
         f"{c_cq.get('avg_hashtags', 0):.1f}",
         f"{x_cq.get('avg_hashtags', 0):.1f}"),
        ("Posts with CTA",
         f"{c_cq.get('pct_with_cta', 0):.0f}%",
         f"{x_cq.get('pct_with_cta', 0):.0f}%"),
    ]
    mtr_data = [[
        Paragraph("Metric",   mtr_h),
        Paragraph(f"@{c_h}",  mtr_h),
        Paragraph(f"@{x_h}",  mtr_h),
    ]]
    for label, c_v, x_v in metric_rows:
        cs, _ = _winner_style(c_v, x_v)
        mtr_data.append([
            Paragraph(label, mtr_b),
            Paragraph(c_v,   cs),
            Paragraph(x_v,   mtr_b),
        ])

    col_w = (w - 2*MARGIN) / 3
    mtr_tbl = Table(mtr_data, colWidths=[col_w * 1.4, col_w * 0.8, col_w * 0.8])
    mtr_tbl.setStyle(TableStyle([
        ("BACKGROUND",     (0, 0), (-1, 0),  FL_CORAL),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [FL_WHITE, FL_LIGHT]),
        ("GRID",           (0, 0), (-1, -1), 0.3, FL_CREAM_MID),
        ("TOPPADDING",     (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING",  (0, 0), (-1, -1), 5),
        ("LEFTPADDING",    (0, 0), (-1, -1), 8),
    ]))
    story.append(mtr_tbl)
    story.append(Spacer(1, 14))

    chart_buf = _chart_comparison_bars(client, competitor)
    if chart_buf:
        story.append(Image(chart_buf, width=w - 2*MARGIN, height=(w - 2*MARGIN) * 0.46))

    story.append(PageBreak())

    # ── Page 2: AI competitive analysis ───────────────────────────────────────
    story.append(_section_banner("Competitive Analysis"))
    story.append(Spacer(1, 10))

    ai_data, ai_generated = _comparison_ai(client, competitor, deepseek_key=deepseek_key)

    if ai_generated:
        story.append(Paragraph(
            "AI-powered analysis",
            ParagraphStyle("ai_badge", fontName=_f("FL-BodyItalic"), fontSize=8,
                           textColor=FL_MID_GREY, spaceAfter=8),
        ))

    verdict_s = ParagraphStyle("verdict", fontName=_f("FL-Body"), fontSize=10,
                               textColor=FL_DARK, leading=15, spaceAfter=12)
    story.append(Paragraph(ai_data.get("verdict", ""), verdict_s))

    # Strengths vs advantages — two columns
    bullet_s    = ParagraphStyle("bullet",  fontName=_f("FL-Body"),     fontSize=9,
                                 textColor=FL_DARK,    leading=13, leftIndent=10, spaceAfter=4)
    str_title_s = ParagraphStyle("str_t",   fontName=_f("FL-Heading"),    fontSize=10,
                                 textColor=FL_CORAL,   leading=13, spaceAfter=6)
    gap_title_s = ParagraphStyle("gap_t",   fontName=_f("FL-Heading"),    fontSize=10,
                                 textColor=FL_MID_GREY, leading=13, spaceAfter=6)

    str_cell = ([Paragraph(f"Where @{c_h} leads", str_title_s)] +
                [Paragraph(f"• {item}", bullet_s) for item in ai_data.get("client_strengths", [])])
    gap_cell = ([Paragraph(f"Where @{x_h} leads", gap_title_s)] +
                [Paragraph(f"• {item}", bullet_s) for item in ai_data.get("competitor_advantages", [])])

    sw = (w - 2*MARGIN - 0.5*cm) / 2
    str_tbl = Table([[str_cell, gap_cell]], colWidths=[sw, sw])
    str_tbl.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND",    (0, 0), (0, -1),  FL_LIGHT),
        ("BACKGROUND",    (1, 0), (1, -1),  colors.HexColor("#F5F5F5")),
        ("LEFTPADDING",   (0, 0), (-1, -1), 10),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
        ("TOPPADDING",    (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LINEBEFORE",    (0, 0), (0, -1),  3, FL_CORAL),
        ("LINEBEFORE",    (1, 0), (1, -1),  3, FL_MID_GREY),
    ]))
    story.append(str_tbl)
    story.append(Spacer(1, 18))

    story.append(_section_banner(f"Recommendations for @{c_h}", sub=True))
    story.append(Spacer(1, 10))

    rec_title_s = ParagraphStyle("rec_t", fontName=_f("FL-Heading"), fontSize=11,
                                 textColor=FL_CORAL, leading=14, spaceAfter=2)
    rec_body_s  = ParagraphStyle("rec_b", fontName=_f("FL-Body"),  fontSize=9,
                                 textColor=FL_DARK,  leading=13)

    for i, rec in enumerate(ai_data.get("recommendations", []), 1):
        cell = [
            Paragraph(f"{i}. {rec['title']}", rec_title_s),
            Paragraph(rec["body"], rec_body_s),
        ]
        rec_tbl = Table([[cell]], colWidths=[w - 2*MARGIN])
        rec_tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), FL_LIGHT if i % 2 else FL_WHITE),
            ("LEFTPADDING",   (0, 0), (-1, -1), 12),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 12),
            ("TOPPADDING",    (0, 0), (-1, -1), 9),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
            ("LINEBEFORE",    (0, 0), (-1, -1), 3, FL_CORAL),
        ]))
        story.append(rec_tbl)
        story.append(Spacer(1, 6))

    # ── Services page ─────────────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(_section_banner("How First Light Marketing Can Help"))
    story.append(Spacer(1, 12))

    intro_style = ParagraphStyle("svc_intro", fontName=_f("FL-BodyItalic"), fontSize=11,
                                 textColor=FL_DARK, leading=16, spaceAfter=14)
    story.append(Paragraph(
        "Marketing support shaped around what your business actually needs. Whether you need "
        "strategic direction, content creation, launch support or a flexible marketing partner, "
        "Niamh can step in where the pressure is highest and help the full picture work together.",
        intro_style,
    ))

    services = [
        ("Marketing Support",
         "Your marketing partner, without the full-time salary. Whether you need someone "
         "to take marketing off your plate or extra support alongside your existing team, "
         "Niamh becomes an extension of your business — from planning campaigns to managing "
         "day-to-day marketing."),
        ("Marketing Strategy",
         "Clear direction before you start. If you're unsure where to focus, struggling to "
         "attract the right customers, or need an experienced marketer to guide your next steps, "
         "we'll uncover opportunities, identify what's holding your business back, and create a "
         "practical plan to move forward with confidence."),
        ("Content Creation",
         "Content that connects with your audience. People don't buy because they've seen one "
         "advert — they buy because they've seen your business consistently showing up. "
         "Photography and video designed to build trust, showcase your business, and give you a "
         "library of content that works across social, website, email, and advertising."),
        ("Campaigns & Launches",
         "Bringing your biggest ideas to life. Whether it's a product, service, event, or "
         "seasonal campaign, every moving part is managed to ensure your launch is organised, "
         "consistent, and impactful — from planning timelines and coordinating content to "
         "briefing creatives and analysing results."),
        ("Fractional Marketing",
         "Senior marketing expertise, when you need it. Not every business needs a full-time "
         "Marketing Manager, but every business benefits from experienced support. Flexible, "
         "strategic, and hands-on — without the cost and commitment of a full-time hire. "
         "Ideal for businesses that are growing but not quite ready for in-house marketing."),
    ]

    svc_title_s2 = ParagraphStyle("svc_t2", fontName=_f("FL-Heading"), fontSize=11,
                                  textColor=FL_CORAL, leading=14, spaceAfter=2)
    svc_body_s2  = ParagraphStyle("svc_b2", fontName=_f("FL-Body"),  fontSize=9,
                                  textColor=FL_DARK,  leading=13)

    svc_rows = [[Paragraph(t, svc_title_s2), Paragraph(b, svc_body_s2)] for t, b in services]
    svc_col  = (PAGE_W - 2*MARGIN - 0.5*cm) / 2
    for pair in [svc_rows[i:i+2] for i in range(0, len(svc_rows), 2)]:
        while len(pair) < 2:
            pair.append([Paragraph("", svc_body_s2)])
        t = Table([[pair[0], pair[1]]], colWidths=[svc_col, svc_col])
        t.setStyle(TableStyle([
            ("VALIGN",        (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING",   (0, 0), (-1, -1), 10),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
            ("TOPPADDING",    (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ("BACKGROUND",    (0, 0), (-1, -1), FL_LIGHT),
            ("LINEBEFORE",    (0, 0), (0, -1), 3, FL_CORAL),
            ("LINEBEFORE",    (1, 0), (1, -1), 3, FL_CORAL),
        ]))
        story.append(t)
        story.append(Spacer(1, 8))

    story.append(Spacer(1, 16))
    story.append(_divider(coral=True))
    story.append(Spacer(1, 14))

    contact_url = "https://www.firstlightmarketing.co.uk/contact"
    btn_tbl = Table(
        [[Paragraph(f'<link href="{contact_url}">Get in touch →</link>',
                    ParagraphStyle("btn2", fontName=_f("FL-BodyBold"), fontSize=11,
                                   textColor=FL_WHITE, leading=14, alignment=1))]],
        colWidths=[8 * cm], rowHeights=[1.1 * cm], hAlign="CENTER",
    )
    btn_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), FL_CORAL),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING",   (0, 0), (-1, -1), 20),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 20),
    ]))
    story.append(btn_tbl)
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        f'<link href="{contact_url}">{contact_url}</link>',
        ParagraphStyle("url2", fontName=_f("FL-Body"), fontSize=8,
                       textColor=FL_MID_GREY, alignment=1),
    ))
    story.append(Spacer(1, 20))
    story.append(_divider(coral=True))
    story.append(Paragraph(
        "This report is based on publicly available data scraped via instaloader. "
        "Engagement benchmarks are approximate industry averages and may vary by niche. "
        "Prepared exclusively for the named client by First Light Marketing.",
        s["Small"],
    ))

    doc.build(story)
    print(f"  ✓ Comparison report saved to {output_path}")


# ══════════════════════════════════════════════════════════════════════════════
#  CLI ENTRY POINT
# ══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="Audit an Instagram account and produce a PDF report."
    )
    parser.add_argument(
        "--username", "-u",
        help="Instagram handle to audit (without @)",
    )
    parser.add_argument(
        "--login", "-l",
        help="Your Instagram username to log in with (avoids rate limits; "
             "saves session so you only need to enter password once)",
        metavar="YOUR_IG_USERNAME",
    )
    parser.add_argument(
        "--posts", "-n",
        type=int, default=POSTS_TO_FETCH,
        help=f"Max posts to fetch (default: {POSTS_TO_FETCH})",
    )
    parser.add_argument(
        "--output", "-o",
        default="social_media_audit.pdf",
        help="Output PDF path (default: social_media_audit.pdf)",
    )
    parser.add_argument(
        "--demo",
        action="store_true",
        help="Run with built-in demo data (no scraping)",
    )
    parser.add_argument(
        "--deepseek-key", "-k",
        default=None,
        help="DeepSeek API key for AI-powered recommendations "
             "(falls back to rule-based if omitted). "
             "Can also be set via DEEPSEEK_API_KEY env var.",
    )
    parser.add_argument(
        "--logo",
        default=None,
        help="Path to logo PNG (transparent). Defaults to 2-transparent.png "
             "in the same folder as this script.",
    )
    parser.add_argument(
        "--from-cache",
        metavar="FILE",
        default=None,
        help="Skip scraping and load data from a previously saved cache JSON file.",
    )
    parser.add_argument(
        "--no-recs",
        action="store_true",
        help="Skip AI recommendations — produces a faster healthcheck-style report.",
    )
    parser.add_argument(
        "--compare",
        metavar="CACHE_FILE",
        default=None,
        help="Compare against a competitor. Pass a cache JSON file for the competitor account. "
             "Produces a side-by-side competitor analysis report instead of a solo audit.",
    )
    args = parser.parse_args()

    import os as _os
    # Read key from: --deepseek-key flag → DEEPSEEK_API_KEY env var → 'key' file next to script
    _script_dir = _os.path.dirname(_os.path.abspath(__file__))
    _key_file = _os.path.join(_script_dir, "key")
    _file_key = None
    if _os.path.exists(_key_file):
        with open(_key_file) as _f:
            _file_key = _f.read().strip() or None
    deepseek_key = (
        args.deepseek_key
        or _os.environ.get("DEEPSEEK_API_KEY")
        or _file_key
    )
    if deepseek_key:
        source = ("--deepseek-key flag" if args.deepseek_key
                  else "DEEPSEEK_API_KEY env" if _os.environ.get("DEEPSEEK_API_KEY")
                  else "'key' file")
        print(f"  DeepSeek key loaded from {source}")
    if deepseek_key and not HAS_OPENAI:
        print("Warning: openai package not installed — AI recommendations disabled. "
              "Run: pip install openai")

    results: list[AuditResult] = []

    if args.demo:
        print("Running in demo mode with sample data…")
        d = DEMO_DATA
        results.append(audit_instagram(d["ig"]["profile"], d["ig"]["media"]))

    elif args.from_cache:
        import json as _json
        print(f"  Loading cached data from {args.from_cache}…")
        with open(args.from_cache) as _f:
            _cached = _json.load(_f)
        ig_profile = _cached["profile"]
        ig_media   = _cached["posts"]
        print(f"  Loaded @{ig_profile['username']} — {len(ig_media)} posts")
        results.append(audit_instagram(ig_profile, ig_media))

    else:
        if not args.username:
            sys.exit("Error: --username is required (or use --demo / --from-cache).")

        print(f"Auditing @{args.username}…")
        ig_profile, ig_media = fetch_instagram(args.username, login_user=args.login, limit=args.posts)

        # Auto-save raw data so the next run can use --from-cache
        import json as _json
        import os as _os2
        _cache_path = _os2.path.join(
            _os2.path.dirname(_os2.path.abspath(__file__)),
            f"{args.username}_cache.json",
        )
        with open(_cache_path, "w") as _f:
            _json.dump({"profile": ig_profile, "posts": ig_media}, _f, indent=2, default=str)
        print(f"  ✓ Raw data cached to {_cache_path}")

        results.append(audit_instagram(ig_profile, ig_media))

    if args.compare:
        import json as _json2
        print(f"  Loading competitor cache from {args.compare}…")
        with open(args.compare) as _fc:
            _comp_cache = _json2.load(_fc)
        comp_profile = _comp_cache["profile"]
        comp_media   = _comp_cache["posts"]
        print(f"  Loaded @{comp_profile['username']} — {len(comp_media)} posts")
        competitor_result = audit_instagram(comp_profile, comp_media)
        print("Building competitor analysis PDF…")
        build_comparison_pdf(
            results[0], competitor_result,
            args.output,
            deepseek_key=deepseek_key,
            logo_path=args.logo,
        )
    else:
        print("Building PDF report…")
        build_pdf(results, args.output, deepseek_key=deepseek_key, logo_path=args.logo,
                  no_recs=args.no_recs)


if __name__ == "__main__":
    main()
