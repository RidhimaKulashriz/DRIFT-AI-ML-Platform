"""Shared helpers and CSS for the DRIFT dashboard."""
import json
import os
import streamlit as st

BACKEND = os.getenv("DRIFT_BACKEND_URL", os.getenv("BACKEND_URL", "http://127.0.0.1:8000")).rstrip("/")

# ── Severity mappings (ops-center palette) ───────────────────────
SEV_COLOR   = {"L3": "#FF2D55", "L2": "#FF6B35", "L1": "#30D158"}
SEV_LABEL   = {"L3": "CRITICAL", "L2": "HIGH",   "L1": "LOW"}
SEV_BADGE   = {"L3": "hw-badge-critical", "L2": "hw-badge-high", "L1": "hw-badge-low"}
SEV_FOLIUM  = {"L3": "#FF2D55", "L2": "#FF6B35", "L1": "#30D158"}
SEV_RADIUS  = {"L3": 12, "L2": 10, "L1": 6}
SEV_OPACITY = {"L3": 0.9,  "L2": 0.85, "L1": 0.75}


# ── CSS injection ────────────────────────────────────────────────
def inject_css():
    """Inject the full DRIFT ops-center design system."""
    st.markdown("""<style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Rajdhani:wght@500;600;700&family=Inter:wght@400;500&display=swap');

    /* ── Global reset ──────────────────────────────────────── */
    html, body,
    [data-testid="stAppViewContainer"],
    [data-testid="stMain"],
    section.main,
    .stApp {
        background-color: #080C10 !important;
        color: #E6EDF3 !important;
        font-family: 'Inter', sans-serif !important;
    }
    .main .block-container {
        padding: 0.5rem 1.2rem 2rem !important;
        max-width: 100% !important;
        background-image:
            linear-gradient(rgba(0,217,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,217,255,0.03) 1px, transparent 1px);
        background-size: 40px 40px;
    }
    #MainMenu, footer                { display: none !important; }
    [data-testid="stHeader"]         { display: none !important; }
    [data-testid="stToolbar"]        { display: none !important; }
    [data-testid="stDecoration"]     { display: none !important; }
    .viewerBadge_container__1QSob   { display: none !important; }

    /* ── Sidebar ───────────────────────────────────────────── */
    [data-testid="stSidebar"] {
        background-color: #0D1117 !important;
        border-right: 1px solid #21262D !important;
    }
    [data-testid="stSidebar"] p,
    [data-testid="stSidebar"] label,
    [data-testid="stSidebar"] span,
    [data-testid="stSidebar"] .stMarkdown { color: #E6EDF3 !important; }

    [data-testid="stSidebar"] .stTextInput input {
        background: #161B22 !important;
        border: 1px solid #21262D !important;
        border-radius: 0 !important;
        color: #E6EDF3 !important;
        font-family: 'JetBrains Mono', monospace !important;
        font-size: 0.8rem !important;
    }
    [data-testid="stSidebar"] .stTextInput input:focus {
        border-color: #00D9FF !important;
        box-shadow: 0 0 0 2px rgba(0,217,255,0.1) !important;
    }
    [data-testid="stSidebar"] .stMultiSelect [data-baseweb="select"] {
        background: #161B22 !important;
        border-color: #21262D !important;
        border-radius: 0 !important;
    }

    /* ── Buttons ───────────────────────────────────────────── */
    .stButton > button {
        background: transparent !important;
        color: #00D9FF !important;
        border: 1px solid #00D9FF !important;
        border-radius: 0 !important;
        font-family: 'Rajdhani', sans-serif !important;
        font-weight: 700 !important;
        font-size: 0.8rem !important;
        letter-spacing: 0.1em !important;
        text-transform: uppercase !important;
        transition: all 0.15s ease !important;
        padding: 0.35rem 0.9rem !important;
    }
    .stButton > button:hover {
        background: #00D9FF !important;
        color: #080C10 !important;
    }
    .stDownloadButton > button {
        background: transparent !important;
        color: #00D9FF !important;
        border: 1px solid #00D9FF !important;
        border-radius: 0 !important;
        font-family: 'Rajdhani', sans-serif !important;
        font-weight: 700 !important;
        letter-spacing: 0.1em !important;
        font-size: 0.8rem !important;
    }
    .stDownloadButton > button:hover {
        background: rgba(0,217,255,0.1) !important;
    }

    /* ── Text inputs ───────────────────────────────────────── */
    .stTextInput input {
        background: #161B22 !important;
        border: 1px solid #21262D !important;
        border-radius: 0 !important;
        color: #E6EDF3 !important;
        font-family: 'JetBrains Mono', monospace !important;
        font-size: 0.82rem !important;
    }
    .stTextInput input:focus {
        border-color: #00D9FF !important;
        box-shadow: 0 0 0 2px rgba(0,217,255,0.1) !important;
    }
    .stTextInput input::placeholder {
        color: #30363D !important;
        font-family: 'JetBrains Mono', monospace !important;
    }

    /* ── Select / Multiselect ──────────────────────────────── */
    .stSelectbox [data-baseweb="select"] > div,
    .stMultiSelect [data-baseweb="select"] > div {
        background: #161B22 !important;
        border-color: #21262D !important;
        border-radius: 0 !important;
        color: #E6EDF3 !important;
    }
    .stMultiSelect [data-baseweb="tag"] {
        background: rgba(0,217,255,0.15) !important;
        color: #00D9FF !important;
    }

    /* ── Toggle ────────────────────────────────────────────── */
    [data-testid="stToggle"] label { color: #8B949E !important; }

    /* ── Radio → flat pill buttons ─────────────────────────── */
    div[data-testid="stRadio"] > div {
        display: flex !important; gap: 6px !important; flex-wrap: wrap !important;
    }
    div[data-testid="stRadio"] label {
        background: #161B22 !important;
        border: 1px solid #21262D !important;
        border-radius: 0 !important;
        padding: 4px 14px !important;
        cursor: pointer !important;
        font-family: 'Rajdhani', sans-serif !important;
        font-size: 0.75rem !important;
        font-weight: 700 !important;
        letter-spacing: 0.1em !important;
        text-transform: uppercase !important;
        color: #8B949E !important;
        transition: all 0.15s !important;
        margin: 0 !important;
    }
    div[data-testid="stRadio"] label:has(input:checked) {
        background: rgba(0,217,255,0.1) !important;
        border-color: #00D9FF !important;
        color: #00D9FF !important;
    }
    div[data-testid="stRadio"] input {
        opacity: 0; position: absolute; width: 0; height: 0;
    }

    /* ── Folium iframe ─────────────────────────────────────── */
    div[data-testid="stIframe"] > iframe {
        border: 1px solid #21262D !important;
        border-radius: 0 !important;
        background: #080C10 !important;
    }

    /* ── Misc ──────────────────────────────────────────────── */
    .stSpinner > div { border-top-color: #00D9FF !important; }
    .stAlert        { border-radius: 0 !important; }
    hr              { border-color: #21262D !important; }
    .stCaption {
        color: #30363D !important;
        font-family: 'JetBrains Mono', monospace !important;
        font-size: 0.62rem !important;
    }

    /* ══════════════════════════════════════════════════════════
       HW DESIGN SYSTEM
       ══════════════════════════════════════════════════════════ */

    /* Panel */
    .hw-panel {
        background: #0D1117;
        border: 1px solid #21262D;
        margin-bottom: 10px;
    }
    .hw-panel-header {
        border-left: 3px solid #00D9FF;
        padding: 7px 14px 7px 10px;
        background: #0D1117;
        border-bottom: 1px solid #21262D;
        display: flex;
        align-items: center;
        justify-content: space-between;
    }
    .hw-panel-title {
        font-family: 'Rajdhani', sans-serif;
        font-weight: 700;
        font-size: 0.7rem;
        letter-spacing: 0.15em;
        text-transform: uppercase;
        color: #00D9FF;
    }
    .hw-panel-meta {
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.6rem;
        color: #30363D;
    }

    /* Stats row */
    .hw-stats-row {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 8px;
        margin-bottom: 10px;
    }
    @media (max-width: 768px) {
        .hw-stats-row {
            grid-template-columns: repeat(2, 1fr);
        }
    }
    .hw-stat {
        background: #0D1117;
        border: 1px solid #21262D;
        padding: 10px 12px;
        text-align: center;
        position: relative;
        overflow: hidden;
    }
    .hw-stat::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(0,217,255,0.2), transparent);
    }
    .hw-stat-value {
        font-family: 'JetBrains Mono', monospace;
        font-size: 1.65rem;
        font-weight: 700;
        color: #E6EDF3;
        line-height: 1;
        margin-bottom: 3px;
    }
    .hw-stat-label {
        font-family: 'Rajdhani', sans-serif;
        font-size: 0.58rem;
        font-weight: 700;
        color: #8B949E;
        letter-spacing: 0.15em;
        text-transform: uppercase;
    }
    .hw-health-bar-track {
        background: #161B22;
        height: 3px;
        margin-top: 5px;
        width: 100%;
    }
    .hw-health-bar {
        height: 3px;
        background: linear-gradient(90deg, #FF2D55, #FFD60A, #30D158);
        transition: width 1.5s ease;
    }

    /* Severity badges */
    .hw-badge {
        display: inline-block;
        font-family: 'Rajdhani', sans-serif;
        font-weight: 700;
        font-size: 0.58rem;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        padding: 2px 7px;
        vertical-align: middle;
        border-radius: 0;
        white-space: nowrap;
    }
    .hw-badge-critical { background: rgba(255,45,85,0.15);  color: #FF2D55; border: 1px solid rgba(255,45,85,0.4); }
    .hw-badge-high     { background: rgba(255,107,53,0.15); color: #FF6B35; border: 1px solid rgba(255,107,53,0.4); }
    .hw-badge-medium   { background: rgba(255,214,10,0.12); color: #FFD60A; border: 1px solid rgba(255,214,10,0.4); }
    .hw-badge-low      { background: rgba(48,209,88,0.12);  color: #30D158; border: 1px solid rgba(48,209,88,0.4); }

    /* Detection feed */
    .hw-feed-container {
        max-height: 320px;
        overflow-y: auto;
        background: #0D1117;
        border: 1px solid #21262D;
    }
    .hw-feed-container::-webkit-scrollbar { width: 3px; }
    .hw-feed-container::-webkit-scrollbar-track { background: #0D1117; }
    .hw-feed-container::-webkit-scrollbar-thumb { background: #21262D; }
    .hw-feed-container::-webkit-scrollbar-thumb:hover { background: #30363D; }

    .hw-detection-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 7px 12px;
        border-bottom: 1px solid #161B22;
        animation: slideInRight 0.3s ease;
        transition: background 0.15s ease;
    }
    .hw-detection-row:hover { background: rgba(0,217,255,0.03); }

    .hw-sev-bar  { width: 3px; height: 28px; flex-shrink: 0; }
    .hw-det-class {
        font-family: 'Rajdhani', sans-serif;
        font-weight: 700;
        font-size: 0.88rem;
        color: #E6EDF3;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        min-width: 90px;
    }
    .hw-det-stats {
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.6rem;
        color: #8B949E;
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .hw-coords   { color: #00D9FF; }
    .hw-det-time {
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.58rem;
        color: #30363D;
        white-space: nowrap;
    }
    .hw-dinov2 {
        font-family: 'Rajdhani', sans-serif;
        font-size: 0.55rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        color: #FFD60A;
        background: rgba(255,214,10,0.08);
        border: 1px solid rgba(255,214,10,0.25);
        padding: 1px 4px;
        white-space: nowrap;
    }

    /* Live dot */
    .hw-live-dot {
        display: inline-block;
        width: 7px; height: 7px;
        border-radius: 50%;
        background: #00D9FF;
        animation: hwPulse 1.5s ease-in-out infinite;
        vertical-align: middle;
        margin-right: 4px;
        box-shadow: 0 0 6px rgba(0,217,255,0.4);
    }
    .hw-live-dot-red {
        display: inline-block;
        width: 7px; height: 7px;
        border-radius: 50%;
        background: #FF2D55;
        vertical-align: middle;
        margin-right: 4px;
        box-shadow: 0 0 6px rgba(255,45,85,0.4);
    }

    /* Top bar */
    .hw-topbar {
        padding: 8px 0 10px;
        border-bottom: 1px solid #21262D;
        margin-bottom: 0;
    }
    .hw-topbar-inner {
        display: flex;
        align-items: center;
        justify-content: space-between;
    }
    .hw-wordmark {
        font-family: 'Rajdhani', sans-serif;
        font-weight: 700;
        font-size: 1.4rem;
        color: #E6EDF3;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        line-height: 1;
    }
    .hw-wordmark em { color: #00D9FF; font-style: normal; }
    .hw-subtitle {
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.56rem;
        color: #30363D;
        letter-spacing: 0.06em;
        margin-top: 3px;
    }
    .hw-status-pill {
        font-family: 'Rajdhani', sans-serif;
        font-weight: 700;
        font-size: 0.65rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        padding: 3px 10px;
        border: 1px solid;
    }
    .hw-timer {
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.75rem;
        color: #8B949E;
        letter-spacing: 0.04em;
    }

    /* Drone feed panel */
    .hw-feed-wrap {
        position: relative;
        line-height: 0;
        background: #0D1117;
    }
    .hw-feed-wrap img { width: 100%; height: auto; display: block; }
    .hw-scanlines {
        position: absolute;
        inset: 0;
        pointer-events: none;
        background: repeating-linear-gradient(
            0deg,
            transparent, transparent 2px,
            rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px
        );
        z-index: 5;
    }
    /* Corner brackets on feed panel */
    .hw-corner-wrap {
        position: relative;
        display: block;
        border: 1px solid #21262D;
    }
    .hw-corner-wrap::before,
    .hw-corner-wrap::after {
        content: '';
        position: absolute;
        width: 18px; height: 18px;
        z-index: 20;
        pointer-events: none;
    }
    .hw-corner-wrap::before {
        top: -1px; left: -1px;
        border-top: 2px solid #00D9FF;
        border-left: 2px solid #00D9FF;
    }
    .hw-corner-wrap::after {
        top: -1px; right: -1px;
        border-top: 2px solid #00D9FF;
        border-right: 2px solid #00D9FF;
    }
    /* Bottom corners via inner wrapper */
    .hw-corner-inner {
        position: relative;
        width: 100%;
    }
    .hw-corner-inner::before,
    .hw-corner-inner::after {
        content: '';
        position: absolute;
        width: 18px; height: 18px;
        z-index: 20;
        pointer-events: none;
    }
    .hw-corner-inner::before {
        bottom: 0; left: -1px;
        border-bottom: 2px solid #00D9FF;
        border-left: 2px solid #00D9FF;
    }
    .hw-corner-inner::after {
        bottom: 0; right: -1px;
        border-bottom: 2px solid #00D9FF;
        border-right: 2px solid #00D9FF;
    }

    .hw-feed-meta {
        padding: 5px 12px;
        background: #0D1117;
        border-top: 1px solid #21262D;
        display: flex;
        gap: 18px;
    }
    .hw-feed-meta-item {
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.58rem;
        color: #30363D;
        letter-spacing: 0.04em;
    }
    .hw-feed-meta-item span { color: #8B949E; }
    .hw-feed-placeholder {
        background: #0D1117;
        min-height: 300px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        gap: 16px;
        position: relative;
    }
    .hw-feed-placeholder::before {
        content: '';
        position: absolute;
        inset: 0;
        background:
            radial-gradient(circle at 50% 50%, rgba(0,217,255,0.03) 0%, transparent 70%);
        pointer-events: none;
    }
    .hw-await-text {
        font-family: 'Rajdhani', sans-serif;
        font-size: 0.8rem;
        font-weight: 700;
        letter-spacing: 0.2em;
        color: #21262D;
        text-transform: uppercase;
        animation: hwPulse 3s ease-in-out infinite;
    }
    .hw-await-icon {
        font-size: 2rem;
        animation: hwPulse 3s ease-in-out infinite;
        opacity: 0.15;
    }

    /* Report panel */
    .hw-report-field {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 6px 14px;
        border-bottom: 1px solid rgba(33,38,45,0.6);
    }
    .hw-report-key {
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.58rem;
        color: #8B949E;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        min-width: 90px;
        flex-shrink: 0;
        padding-top: 2px;
    }
    .hw-report-val {
        font-family: 'Rajdhani', sans-serif;
        font-weight: 600;
        font-size: 0.88rem;
        color: #E6EDF3;
        line-height: 1.4;
    }
    .hw-report-desc {
        font-family: 'Inter', sans-serif;
        font-size: 0.78rem;
        color: #8B949E;
        line-height: 1.7;
    }

    /* Empty states */
    .hw-empty {
        background: #0D1117;
        border: 1px dashed #21262D;
        padding: 1.8rem;
        text-align: center;
        color: #30363D;
        font-family: 'Rajdhani', sans-serif;
        font-size: 0.75rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
    }

    /* Query bar label */
    .hw-query-label {
        font-family: 'Rajdhani', sans-serif;
        font-size: 0.6rem;
        font-weight: 700;
        letter-spacing: 0.14em;
        color: #00D9FF;
        text-transform: uppercase;
        margin-bottom: 3px;
    }

    /* GPS value in stat */
    .hw-gps-value {
        font-family: 'JetBrains Mono', monospace;
        color: #00D9FF;
    }

    /* ── Responsive: stack on mobile ────────────────────────── */
    @media (max-width: 768px) {
        .hw-topbar-inner {
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
        }
        .hw-detection-row {
            flex-wrap: wrap;
        }
    }

    /* ── Keyframe animations ───────────────────────────────── */
    @keyframes hwPulse {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0.25; }
    }
    @keyframes slideInRight {
        from { transform: translateX(14px); opacity: 0; }
        to   { transform: translateX(0);   opacity: 1; }
    }
    @keyframes criticalFlash {
        0%, 100% { opacity: 1; }
        25%, 75%  { opacity: 0.2; }
    }
    @keyframes pinDrop {
        from { transform: scale(0); opacity: 0; }
        to   { transform: scale(1); opacity: 1; }
    }
    @keyframes healthCountDown {
        from { opacity: 0; transform: translateY(-5px); }
        to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes glowPulse {
        0%, 100% { box-shadow: 0 0 4px rgba(0,217,255,0.1); }
        50%      { box-shadow: 0 0 12px rgba(0,217,255,0.25); }
    }

    /* ── Success/Warning/Error flash styles ─────────────────── */
    .hw-flash-success {
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.7rem;
        color: #30D158;
        letter-spacing: 0.1em;
        animation: slideInRight 0.25s ease;
    }
    .hw-flash-warning {
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.7rem;
        color: #FF6B35;
        letter-spacing: 0.1em;
    }
    </style>""", unsafe_allow_html=True)


# ── Helpers ──────────────────────────────────────────────────────

def _esc(value: str) -> str:
    """Minimal HTML-escape for dynamic values."""
    return (
        str(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def render_stat_card(value, label, delta=None, positive=True):
    """Return HTML for a hw-stat block (legacy compat)."""
    return (
        f'<div class="hw-stat">'
        f'<div class="hw-stat-value">{value}</div>'
        f'<div class="hw-stat-label">{label}</div>'
        f'</div>'
    )


def render_detection_card(det: dict) -> str:
    """Return HTML for a single detection feed row."""
    sev       = det.get("severity", "L1")
    color     = SEV_COLOR.get(sev, "#888888")
    label     = SEV_LABEL.get(sev, sev)
    badge_cls = SEV_BADGE.get(sev, "hw-badge-low")
    cls_name  = _esc(det.get("class_name", "Unknown"))
    conf      = round(det.get("confidence", 0) * 100, 1)
    area      = det.get("area_cm2")
    area_str  = f"{area:.0f}cm²" if area else "—"
    lat       = det.get("lat", 0)
    lon       = det.get("lon", 0)
    dinov2    = det.get("dinov2_flagged", False)
    ts        = str(det.get("detected_at", ""))
    time_str  = ts[11:19] if len(ts) >= 19 else ""

    flag_html = '<span class="hw-dinov2">⚠ FLAGGED</span>' if dinov2 else ""

    # Critical detections get a flash animation
    flash = ' style="animation: criticalFlash 0.6s ease"' if sev == "L3" else ""

    return (
        f'<div class="hw-detection-row"{flash}>'
        f'<div class="hw-sev-bar" style="background:{color}"></div>'
        f'<span class="hw-badge {badge_cls}">{label}</span>'
        f'<span class="hw-det-class">{cls_name}</span>'
        f'<span class="hw-det-stats">'
        f'{conf}% &nbsp;{area_str}&nbsp;'
        f'<span class="hw-coords">{lat:.4f} {lon:.4f}</span>'
        f'</span>'
        f'{flag_html}'
        f'<span class="hw-det-time">{time_str}</span>'
        f'</div>'
    )


def render_report_panel(det: dict):
    """Render a full detection report via st.markdown calls."""
    sev       = det.get("severity", "L1")
    badge_cls = SEV_BADGE.get(sev, "hw-badge-low")
    label     = SEV_LABEL.get(sev, sev)
    conf      = round(det.get("confidence", 0) * 100, 1)
    area      = det.get("area_cm2")
    ts        = str(det.get("detected_at", ""))[:19].replace("T", " ")
    alt       = det.get("altitude_m")
    lat       = det.get("lat", 0)
    lon       = det.get("lon", 0)

    def field(key, val_html):
        return (
            f'<div class="hw-report-field">'
            f'<div class="hw-report-key">{key}</div>'
            f'<div class="hw-report-val">{val_html}</div>'
            f'</div>'
        )

    rows = [
        field("CLASS",
              f'<span style="color:#E6EDF3">{_esc(det.get("class_name","—"))}</span>'),
        field("SEVERITY",
              f'<span class="hw-badge {badge_cls}">{label}</span>'),
        field("CONFIDENCE",
              f'<span style="font-family:JetBrains Mono,monospace">{conf}%</span>'),
        field("AREA",
              f'<span style="font-family:JetBrains Mono,monospace">'
              f'{f"{area:.1f} cm²" if area else "Pending SAM2"}</span>'),
        field("GPS",
              f'<span class="hw-coords">{lat:.5f}, {lon:.5f}</span>'),
        field("TIMESTAMP",
              f'<span style="font-family:JetBrains Mono,monospace;color:#8B949E">{ts}</span>'),
    ]
    if alt:
        rows.append(field("ALTITUDE",
            f'<span style="font-family:JetBrains Mono,monospace">{alt} m</span>'))

    st.markdown(
        '<div class="hw-panel" style="margin-bottom:6px">' + "".join(rows) + "</div>",
        unsafe_allow_html=True,
    )

    # SAM-annotated image
    img_path = det.get("image_path")
    if img_path:
        filename = os.path.basename(img_path)
        st.image(f"{BACKEND}/frames/{filename}",
                 caption="SAM3 annotated frame", use_container_width=True)

    # LLM report block
    report_text = det.get("llm_report")
    if not report_text:
        st.markdown(
            '<div class="hw-empty">'
            'Report not yet generated — LLM pipeline runs every 30 s.</div>',
            unsafe_allow_html=True,
        )
        return

    structured = None
    if report_text.strip().startswith("{"):
        try:
            structured = json.loads(report_text)
        except Exception:
            pass

    if structured:
        sev_l     = structured.get("severity_level", sev)
        sev_s     = structured.get("severity_label", SEV_LABEL.get(sev_l, sev_l))
        action    = _esc(structured.get("recommended_action", "—"))
        urgency   = structured.get("urgency_days", "—")
        desc      = _esc(structured.get("description", "—"))
        cost      = structured.get("estimated_cost_inr")
        cost_str  = "₹{:,}".format(cost) if isinstance(cost, int) else _esc(str(cost or "—"))
        sev_badge = SEV_BADGE.get(sev_l, "hw-badge-low")
        urg_color = "#FF6B35" if str(urgency) in ("0", "IMMEDIATE") else "#E6EDF3"

        report_rows = [
            field("LLM SEVERITY",
                  f'<span class="hw-badge {sev_badge}">{_esc(sev_s)}</span>'),
            field("URGENCY",
                  f'<span style="color:{urg_color};font-family:JetBrains Mono,monospace">'
                  f'{urgency} days</span>'),
            field("DESCRIPTION",
                  f'<span class="hw-report-desc">{desc}</span>'),
            field("ACTION",
                  f'<span class="hw-report-desc">{action}</span>'),
            field("EST. COST",
                  f'<span style="color:#30D158;font-family:JetBrains Mono,monospace;'
                  f'font-weight:700">{cost_str}</span>'),
        ]
        st.markdown(
            '<div class="hw-panel">'
            '<div class="hw-panel-header">'
            '<span class="hw-panel-title">Gemma-3 Analysis</span></div>'
            + "".join(report_rows)
            + "</div>",
            unsafe_allow_html=True,
        )
    else:
        lines = [_esc(ln) for ln in report_text.strip().splitlines() if ln.strip()]
        st.markdown(
            '<div class="hw-panel">'
            '<div class="hw-panel-header">'
            '<span class="hw-panel-title">Gemma-3 Analysis</span></div>'
            '<div style="padding:10px 14px">'
            '<div class="hw-report-desc">' + "<br>".join(lines) + "</div>"
            "</div></div>",
            unsafe_allow_html=True,
        )
