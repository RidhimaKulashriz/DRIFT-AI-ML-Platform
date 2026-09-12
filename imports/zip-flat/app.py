"""DRIFT — Ops-Center Dashboard."""
import json
import os
import time

import requests
import folium
from branca.element import Element as _BrancaElement
import streamlit as st
import streamlit.components.v1 as components
from streamlit_folium import st_folium

from utils import (
    inject_css,
    render_stat_card,
    render_detection_card,
    render_report_panel,
    SEV_COLOR, SEV_LABEL, SEV_BADGE, SEV_FOLIUM,
    SEV_RADIUS, SEV_OPACITY,
    _esc, BACKEND,
)

# ── Page config ─────────────────────────────────────────────────
st.set_page_config(
    layout="wide",
    page_title="HAWK-I · Structural Inspection System",
    page_icon="🛡️",
    initial_sidebar_state="collapsed",
)
inject_css()

# ── Constants ───────────────────────────────────────────────────
SEV_FILTER_MAP = {
    "All":      ["L3", "L2", "L1"],
    "Critical": ["L3"],
    "High":     ["L2"],
    "Low":      ["L1"],
}

# ── Data fetch ──────────────────────────────────────────────────
@st.cache_data(ttl=3)
def fetch_detections(limit: int = 100) -> list:
    try:
        r = requests.get(f"{BACKEND}/detections/latest",
                         params={"limit": limit}, timeout=3)
        return r.json()
    except Exception:
        return []


@st.cache_data(ttl=2)
def fetch_gcs_status():
    try:
        r = requests.get(f"{BACKEND}/api/gcs/status", timeout=2)
        print(r.status_code)
        print(r.text)
        return r.json()
    except Exception as e:
        print("ERROR:", e)
        return {
            "connected": False,
            "fps": 0,
            "last_gps": {},
            "frames_received": 0,
        }

@st.cache_data(ttl=3)
def fetch_llm_reports(seconds: int = 60, limit: int = 10) -> list:
    try:
        r = requests.get(
            f"{BACKEND}/detections/llm_reports/latest",
            params={"seconds": seconds, "limit": limit},
            timeout=3,
        )
        return r.json()
    except Exception:
        return []


def load_demo_detections() -> list:
    demo_path = os.path.join(os.path.dirname(__file__), "..", "data", "demo_detections.json")
    try:
        with open(demo_path) as f:
            return json.load(f)
    except Exception:
        return []


# ── Map builder ─────────────────────────────────────────────────
def _has_gps(pin: dict) -> bool:
    """True only for pins with non-null, non-zero GPS coordinates."""
    lat = pin.get("lat")
    lon = pin.get("lon")
    return (lat is not None and lon is not None
            and not (lat == 0.0 and lon == 0.0))


def build_folium_map(pins: list):
    mappable = [p for p in pins if _has_gps(p)]
    center   = [mappable[0]["lat"], mappable[0]["lon"]] if mappable else [12.97, 77.59]
    m = folium.Map(location=center, zoom_start=16, tiles="CartoDB dark_matter")

    for pin in mappable:
        sev       = pin.get("severity", "L1")
        color_hex = SEV_COLOR.get(sev, "#888888")
        sev_lbl   = SEV_LABEL.get(sev, sev)
        radius    = SEV_RADIUS.get(sev, 8)
        fill_op   = SEV_OPACITY.get(sev, 0.8)
        area_cm2  = pin.get("area_cm2")
        area_lbl  = f"{area_cm2:.1f} cm²" if area_cm2 else "pending"
        conf_pct  = round(pin.get("confidence", 0) * 100, 1)

        popup_html = f"""
        <div style="background:#0D1117;color:#E6EDF3;
                    font-family:'JetBrains Mono',monospace;font-size:11px;
                    padding:10px 12px;border:1px solid #21262D;min-width:190px;
                    border-left:3px solid {color_hex}">
            <b style="color:{color_hex};font-size:13px;font-family:'Rajdhani',sans-serif;
                      letter-spacing:0.08em;text-transform:uppercase">
                {pin.get('class_name','')}
            </b><br>
            <span style="color:{color_hex};font-size:9px;font-weight:700;
                         letter-spacing:0.12em">{sev_lbl}</span>
            <div style="margin-top:7px;color:#8B949E;font-size:10px;line-height:1.8">
                CONF &nbsp;&nbsp;<span style="color:#E6EDF3">{conf_pct}%</span><br>
                AREA &nbsp;&nbsp;<span style="color:#E6EDF3">{area_lbl}</span><br>
                <span style="color:#00D9FF">
                    {round(pin.get('lat',0),5)}, {round(pin.get('lon',0),5)}
                </span>
            </div>
        </div>"""

        folium.CircleMarker(
            location=[pin["lat"], pin["lon"]],
            radius=radius,
            color=color_hex,
            fill=True,
            fill_color=color_hex,
            fill_opacity=fill_op,
            weight=2,
            popup=folium.Popup(popup_html, max_width=220),
            tooltip=folium.Tooltip(
                f"<b style='color:{color_hex}'>{pin.get('class_name','')}</b>"
                f" | {sev_lbl} | {conf_pct}%",
                sticky=True,
            ),
        ).add_to(m)

    # Hide Leaflet attribution bar
    m.get_root().header.add_child(_BrancaElement(
        "<style>.leaflet-control-attribution{display:none!important}"
        ".leaflet-control-zoom{border-radius:0!important}"
        "</style>"
    ))

    # Map legend
    legend_html = """
    <div style="position:fixed;bottom:18px;right:18px;z-index:9999;
                background:#0D1117;border:1px solid #21262D;
                padding:8px 12px;font-family:monospace;font-size:10px;
                color:#8B949E;line-height:2">
        <div><span style="color:#FF2D55;font-size:13px">●</span> CRITICAL</div>
        <div><span style="color:#FF6B35;font-size:13px">●</span> HIGH</div>
        <div><span style="color:#30D158;font-size:13px">●</span> LOW</div>
    </div>"""
    m.get_root().html.add_child(_BrancaElement(legend_html))

    return m


# ── Fragments ───────────────────────────────────────────────────

@st.fragment(run_every=3)
def live_stats_section():
    """Auto-refreshing stats row — renders as HTML (no st.metric)."""
    try:
        gcs    = fetch_gcs_status()
        fps    = gcs.get("fps", 0.0)
        frames = gcs.get("frames_received", 0)
        gps    = gcs.get("last_gps") or {}
        lat    = gps.get("lat")
        lon    = gps.get("lon")
        gps_str = f"{lat:.4f},{lon:.4f}" if lat is not None else "NO FIX"

        # Read directly from backend cache — session_state.pins may be empty
        # on first load or filtered by GPS; this always reflects the true count.
        all_dets = fetch_detections(limit=500)
        l1      = sum(1 for p in all_dets if p.get("severity") == "L1")
        l2      = sum(1 for p in all_dets if p.get("severity") == "L2")
        l3      = sum(1 for p in all_dets if p.get("severity") == "L3")
        defects = len(all_dets)
        penalty = l3 * 25 + l2 * 3 + l1
        health  = max(0, 100 - penalty) if all_dets else 100
        hc      = "#30D158" if health > 60 else ("#FFD60A" if health > 30 else "#FF2D55")

        st.markdown(f"""
        <div class="hw-stats-row">
            <div class="hw-stat">
                <div class="hw-stat-value">{frames}</div>
                <div class="hw-stat-label">Frames RX</div>
            </div>
            <div class="hw-stat">
                <div class="hw-stat-value">{fps:.1f}</div>
                <div class="hw-stat-label">TX FPS</div>
            </div>
            <div class="hw-stat">
                <div class="hw-stat-value" style="color:#FF6B35">{defects}</div>
                <div class="hw-stat-label">Defects</div>
            </div>
            <div class="hw-stat">
                <div class="hw-stat-value" style="color:{hc};animation:healthCountDown 1s ease">{health}</div>
                <div class="hw-stat-label">Site Health</div>
                <div class="hw-health-bar-track">
                    <div class="hw-health-bar" style="width:{health}%"></div>
                </div>
            </div>
            <div class="hw-stat">
                <div class="hw-stat-value hw-gps-value"
                     style="font-size:{'0.9rem' if lat is None else '0.78rem'}">{gps_str}</div>
                <div class="hw-stat-label">GPS Status</div>
            </div>
        </div>
        """, unsafe_allow_html=True)
    except Exception:
        pass


@st.fragment(run_every=3)
def live_map_section():
    """Poll for new pins, rebuild map only when pin set changes."""
    try:
        resp     = requests.get(f"{BACKEND}/detections/latest", timeout=2)
        new_pins = resp.json()
        existing = {p.get("id") for p in st.session_state.pins}
        for pin in new_pins:
            # Accept any detection into session_state; GPS validity checked at render time
            if pin.get("id") not in existing:
                st.session_state.pins.append(pin)
                existing.add(pin.get("id"))
    except Exception:
        pass

    # Rebuild map when pin IDs change (not just count — handles replacements too)
    cur_ids = frozenset(p.get("id") for p in st.session_state.pins)
    if cur_ids != st.session_state.get("last_pin_ids", frozenset()):
        st.session_state.last_pin_ids = cur_ids
        st.session_state.cached_map = build_folium_map(st.session_state.pins)

    m = st.session_state.get("cached_map") or build_folium_map(st.session_state.pins)
    st_folium(m, height=500, use_container_width=True, returned_objects=[])


@st.fragment(run_every=3)
def live_detection_section():
    """Render detection feed as styled HTML rows, newest first."""
    pins = st.session_state.get("pins", [])

    # Apply active filters from session_state widgets
    sel_classes    = st.session_state.get("filter_class", [])
    sel_severities = SEV_FILTER_MAP.get(
        st.session_state.get("sev_filter", "All"), ["L3", "L2", "L1"]
    )
    filtered = [
        p for p in pins
        if (not sel_classes or p.get("class_name") in sel_classes)
        and p.get("severity") in sel_severities
    ]
    recent = filtered[:15]

    if not recent:
        st.markdown(
            '<div class="hw-feed-container">'
            '<div class="hw-empty">Awaiting detections...</div>'
            '</div>',
            unsafe_allow_html=True,
        )
        return

    rows_html = "".join(render_detection_card(d) for d in recent)
    st.markdown(
        f'<div class="hw-feed-container">{rows_html}</div>',
        unsafe_allow_html=True,
    )


@st.fragment(run_every=5)
def live_report_section():
    """Render the latest LLM inspection report."""
    try:
        resp    = requests.get(
            f"{BACKEND}/detections/llm_reports/latest",
            params={"limit": 1},
            timeout=2,
        )
        reports = resp.json()
    except Exception:
        reports = []

    if not reports:
        st.markdown(
            '<div class="hw-empty" style="min-height:120px;display:flex;'
            'align-items:center;justify-content:center">'
            'Generating analysis...<br>LLM pipeline runs every 30 s.</div>',
            unsafe_allow_html=True,
        )
        return

    det = reports[0]
    render_report_panel(det)

    # Similar defects
    det_id = det.get("id")
    if det_id:
        try:
            sim = requests.get(f"{BACKEND}/api/similar/{det_id}", timeout=2).json()
            if isinstance(sim, list) and sim:
                sim_rows = "".join(
                    f'<div style="font-family:JetBrains Mono,monospace;font-size:0.62rem;'
                    f'color:#8B949E;padding:4px 0;border-bottom:1px solid #161B22">'
                    f'<span style="color:{SEV_COLOR.get(s.get("severity","L1"),"#888")}">'
                    f'{SEV_LABEL.get(s.get("severity","L1"),"")}</span>'
                    f' {_esc(s.get("class_name",""))}'
                    f' <span class="hw-coords">'
                    f'{s.get("lat",0):.4f}, {s.get("lon",0):.4f}</span>'
                    f'</div>'
                    for s in sim[:3]
                )
                st.markdown(
                    '<div class="hw-panel" style="margin-top:6px">'
                    '<div class="hw-panel-header">'
                    '<span class="hw-panel-title">Similar Defects</span></div>'
                    f'<div style="padding:8px 14px">{sim_rows}</div>'
                    '</div>',
                    unsafe_allow_html=True,
                )
        except Exception:
            pass


# ── Offline / live data ──────────────────────────────────────────
_offline = st.session_state.get("offline_mode", False)
if _offline:
    all_detections = load_demo_detections()
else:
    all_detections = fetch_detections()

# ── Mission start time (persists across reruns) ──────────────────
if "mission_start" not in st.session_state:
    st.session_state.mission_start = int(time.time() * 1000)

# ── Sidebar ──────────────────────────────────────────────────────
with st.sidebar:
    st.markdown(
        "<div style='font-family:Rajdhani,sans-serif;font-weight:700;font-size:1.1rem;"
        "color:#00D9FF;letter-spacing:0.15em;text-transform:uppercase;padding:.3rem 0'>"
        "HAWK-I</div>"
        "<div style='font-family:JetBrains Mono,monospace;font-size:0.56rem;color:#30363D;"
        "letter-spacing:0.06em;margin-bottom:.5rem'>STRUCTURAL INSPECTION SYSTEM</div>",
        unsafe_allow_html=True,
    )
    st.divider()

    # Drone control
    st.markdown(
        "<div style='font-family:Rajdhani,sans-serif;font-size:0.6rem;color:#8B949E;"
        "text-transform:uppercase;letter-spacing:0.12em;margin-bottom:5px'>Drone Control</div>",
        unsafe_allow_html=True,
    )
    query = st.text_input(
        "Query",
        placeholder="crack, spalling, exposed rebar",
        label_visibility="collapsed",
        key="drone_query",
    )
    _s_col, _t_col = st.columns([3, 2])
    with _s_col:
        if st.button("Send to Drone", use_container_width=True, key="btn_send_query"):
            try:
                _r = requests.post(f"{BACKEND}/query", json={"query": query}, timeout=3)
                _d = _r.json()
                if _d.get("status") == "no_drone_connected":
                    st.warning("No drone connected")
                else:
                    st.success("Transmitted ✓")
            except Exception:
                st.error("Backend offline")
    with _t_col:
        if st.button("Test", use_container_width=True, key="btn_test_conn"):
            try:
                _t0 = time.time()
                _r  = requests.get(f"{BACKEND}/health", timeout=3)
                _ms = round((time.time() - _t0) * 1000)
                st.success(f"✓ {_ms}ms") if _r.status_code == 200 else st.error(f"HTTP {_r.status_code}")
            except Exception:
                st.error("Offline")

    try:
        _qc = requests.get(f"{BACKEND}/query/current", timeout=1).json()
        _active = _qc.get("classes", [])
    except Exception:
        _active = []
    st.caption(f"Active: {', '.join(_active)}" if _active else "No active filter")

    st.divider()

    # Class filter
    st.markdown(
        "<div style='font-family:Rajdhani,sans-serif;font-size:0.6rem;color:#8B949E;"
        "text-transform:uppercase;letter-spacing:0.12em;margin-bottom:5px'>Filter by Class</div>",
        unsafe_allow_html=True,
    )
    classes = sorted({d["class_name"] for d in all_detections}) if all_detections else []
    selected_classes = st.multiselect(
        "Class", classes, default=classes,
        label_visibility="collapsed", key="filter_class",
    )

    st.divider()

    # Severity filter
    st.markdown(
        "<div style='font-family:Rajdhani,sans-serif;font-size:0.6rem;color:#8B949E;"
        "text-transform:uppercase;letter-spacing:0.12em;margin-bottom:5px'>Severity</div>",
        unsafe_allow_html=True,
    )
    sev_choice = st.radio(
        "Severity", options=list(SEV_FILTER_MAP.keys()),
        horizontal=False, label_visibility="collapsed", key="sev_filter",
    )

    st.divider()

    # Mode toggles
    offline_mode = st.toggle("Offline Mode", value=False, key="offline_mode")
    st.caption("Reads demo_detections.json")
    live_mode = st.toggle("Live Mode", value=True)
    st.caption("Polls backend every 3 s")

    st.divider()

    # PDF report
    st.markdown(
        "<div style='font-family:Rajdhani,sans-serif;font-size:0.6rem;color:#8B949E;"
        "text-transform:uppercase;letter-spacing:0.12em;margin-bottom:5px'>Reports</div>",
        unsafe_allow_html=True,
    )
    if st.button("Generate PDF Report", use_container_width=True, key="btn_pdf_sidebar"):
        with st.spinner("Generating…"):
            if st.session_state.get("offline_mode"):
                try:
                    import sys as _sys
                    _sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
                    from pdf_generator import generate_inspection_pdf
                    st.session_state["pdf_bytes"] = generate_inspection_pdf(load_demo_detections())
                    st.success("Ready")
                except Exception as exc:
                    st.error(f"Failed: {exc}")
            else:
                try:
                    r = requests.get(f"{BACKEND}/api/report/pdf", timeout=60)
                    if r.status_code == 200:
                        st.session_state["pdf_bytes"] = r.content
                        st.success("Ready")
                    else:
                        st.error(f"HTTP {r.status_code}")
                except Exception as exc:
                    st.error(f"Error: {exc}")

    if "pdf_bytes" in st.session_state:
        st.download_button(
            "Download PDF",
            data=st.session_state["pdf_bytes"],
            file_name="DRIFT_inspection_report.pdf",
            mime="application/pdf",
            use_container_width=True,
        )

# ── Apply filters ────────────────────────────────────────────────
selected_severities = SEV_FILTER_MAP.get(sev_choice, ["L3", "L2", "L1"])
pins = [
    d for d in all_detections
    if (not selected_classes or d.get("class_name") in selected_classes)
    and d.get("severity") in selected_severities
]

# Sync session-state with the latest fetched detections.
# No GPS filter here — that is applied only inside build_folium_map.
if "pins" not in st.session_state:
    st.session_state.pins = list(all_detections)
else:
    existing_ids = {p.get("id") for p in st.session_state.pins}
    for p in all_detections:
        if p.get("id") not in existing_ids:
            st.session_state.pins.append(p)
            existing_ids.add(p.get("id"))

# ── GCS status for header ────────────────────────────────────────
_gcs             = fetch_gcs_status()
st.write("DEBUG:", _gcs)
_drone_connected = _gcs.get("connected", False)
_conn_color      = "#00D9FF" if _drone_connected else "#FF2D55"
_conn_label      = "OPERATIONAL" if _drone_connected else "DRONE OFFLINE"
_dot_class       = "hw-live-dot" if _drone_connected else "hw-live-dot-red"

# Session info
sess_info = ""
try:
    sess     = requests.get(f"{BACKEND}/api/session", timeout=1).json()
    sess_id  = sess.get("session_id", "")[:8]
    sess_det = sess.get("detections", 0)
    sess_info = f"SESSION {sess_id} · {sess_det} DETECTIONS"
except Exception:
    pass

start_ms = st.session_state.mission_start

# ══════════════════════════════════════════════════════════════════
# TOP BAR  (uses components.html so <script> actually executes)
# ══════════════════════════════════════════════════════════════════
_tb_left, _tb_right = st.columns([6, 2])

with _tb_left:
    _topbar_html = f"""
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Rajdhani:wght@500;600;700&display=swap" rel="stylesheet">
    <style>
        body {{ margin:0; padding:0; background:transparent !important; overflow:hidden; }}
        .hw-topbar {{ padding:4px 0 8px; }}
        .hw-topbar-inner {{ display:flex; align-items:center; justify-content:space-between; }}
        .hw-wordmark {{ font-family:'Rajdhani',sans-serif; font-weight:700; font-size:1.4rem;
                        color:#E6EDF3; letter-spacing:0.2em; text-transform:uppercase; line-height:1; }}
        .hw-wordmark em {{ color:#00D9FF; font-style:normal; }}
        .hw-subtitle {{ font-family:'JetBrains Mono',monospace; font-size:0.56rem;
                        color:#30363D; letter-spacing:0.06em; margin-top:3px; }}
        .hw-live-dot {{ display:inline-block; width:7px; height:7px; border-radius:50%;
                        background:#00D9FF; animation:hwPulse 1.5s ease-in-out infinite;
                        vertical-align:middle; margin-right:4px; box-shadow:0 0 6px rgba(0,217,255,0.4); }}
        .hw-live-dot-red {{ display:inline-block; width:7px; height:7px; border-radius:50%;
                            background:#FF2D55; vertical-align:middle; margin-right:4px;
                            box-shadow:0 0 6px rgba(255,45,85,0.4); }}
        .hw-status-pill {{ font-family:'Rajdhani',sans-serif; font-weight:700; font-size:0.65rem;
                           letter-spacing:0.12em; text-transform:uppercase; padding:3px 10px; border:1px solid; }}
        .hw-timer {{ font-family:'JetBrains Mono',monospace; font-size:0.75rem;
                     color:#8B949E; letter-spacing:0.04em; }}
        @keyframes hwPulse {{ 0%,100% {{ opacity:1; }} 50% {{ opacity:0.25; }} }}
    </style>
    <div class="hw-topbar">
        <div class="hw-topbar-inner">
            <div>
                <div class="hw-wordmark">HAWK<em>-I</em></div>
                <div class="hw-subtitle">STRUCTURAL INSPECTION SYSTEM
                    {f'&nbsp;·&nbsp; {sess_info}' if sess_info else ''}
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:12px">
                <span class="{_dot_class}"></span>
                <span class="hw-status-pill"
                      style="color:{_conn_color};border-color:{_conn_color}">
                    {_conn_label}
                </span>
                <span class="hw-timer">
                    MISSION &nbsp;<span id="hw-mission-timer">00:00:00</span>
                </span>
            </div>
        </div>
    </div>
    <script>
    (function() {{
        var t0 = {start_ms};
        function tick() {{
            var e  = Math.floor((Date.now() - t0) / 1000);
            var h  = String(Math.floor(e / 3600)).padStart(2, '0');
            var m  = String(Math.floor((e % 3600) / 60)).padStart(2, '0');
            var s  = String(e % 60).padStart(2, '0');
            var el = document.getElementById('hw-mission-timer');
            if (el) el.textContent = h + ':' + m + ':' + s;
        }}
        tick();
        setInterval(tick, 1000);
    }})();
    </script>
    """
    components.html(_topbar_html, height=60)

with _tb_right:
    st.markdown("<div style='height:6px'></div>", unsafe_allow_html=True)
    if st.button("⊞ GENERATE REPORT", use_container_width=True, key="btn_gen_report_top"):
        with st.spinner("Generating…"):
            if st.session_state.get("offline_mode"):
                try:
                    import sys as _sys
                    _sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
                    from pdf_generator import generate_inspection_pdf
                    st.session_state["pdf_bytes"] = generate_inspection_pdf(load_demo_detections())
                except Exception as exc:
                    st.error(f"Failed: {exc}")
            else:
                try:
                    r = requests.get(f"{BACKEND}/api/report/pdf", timeout=60)
                    if r.status_code == 200:
                        st.session_state["pdf_bytes"] = r.content
                    else:
                        st.error(f"HTTP {r.status_code}")
                except Exception as exc:
                    st.error(f"Error: {exc}")
    # Inline download button — no sidebar needed
    if "pdf_bytes" in st.session_state:
        st.download_button(
            "⬇ DOWNLOAD PDF",
            data=st.session_state["pdf_bytes"],
            file_name="DRIFT_inspection_report.pdf",
            mime="application/pdf",
            use_container_width=True,
            key="btn_download_pdf_top",
        )

st.markdown('<hr style="border-color:#21262D;margin:6px 0 10px">', unsafe_allow_html=True)

# ══════════════════════════════════════════════════════════════════
# STATS ROW
# Re-use the same st.empty() slot across reruns so the fragment is
# always written into one stable DOM node instead of appending twice.
# ══════════════════════════════════════════════════════════════════
if "_stats_placeholder" not in st.session_state:
    st.session_state["_stats_placeholder"] = st.empty()
with st.session_state["_stats_placeholder"]:
    live_stats_section()


# ══════════════════════════════════════════════════════════════════
# MAIN PANEL: DEFECT MAP (full width)
# ══════════════════════════════════════════════════════════════════
st.markdown(f"""
<div class="hw-panel-header">
    <span class="hw-panel-title">Defect Map</span>
    <span class="hw-panel-meta">{len(st.session_state.get('pins', []))} MARKERS · CARTO DARK</span>
</div>
""", unsafe_allow_html=True)
live_map_section()

# ══════════════════════════════════════════════════════════════════
# BOTTOM: DETECTION FEED  |  INSPECTION REPORT
# ══════════════════════════════════════════════════════════════════
det_col, rep_col = st.columns([1, 1])

with det_col:
    st.markdown("""
    <div class="hw-panel-header">
        <span class="hw-panel-title">Detection Feed</span>
        <span class="hw-panel-meta">NEWEST FIRST · MAX 15</span>
    </div>
    """, unsafe_allow_html=True)
    live_detection_section()

with rep_col:
    st.markdown("""
    <div class="hw-panel-header">
        <span class="hw-panel-title">Inspection Report</span>
        <span class="hw-panel-meta">GEMMA-3 ANALYSIS</span>
    </div>
    """, unsafe_allow_html=True)
    live_report_section()

# ══════════════════════════════════════════════════════════════════
# QUERY BAR
# ══════════════════════════════════════════════════════════════════
st.markdown(
    '<hr style="border-color:#21262D;margin:8px 0 6px">'
    '<div class="hw-query-label">Query to Drone</div>',
    unsafe_allow_html=True,
)
q_input_col, q_btn_col = st.columns([8, 2])
with q_input_col:
    main_query = st.text_input(
        "main_query",
        placeholder="QUERY // crack, spalling, exposed rebar, corrosion, rust stain",
        label_visibility="collapsed",
        key="main_drone_query",
    )
with q_btn_col:
    if st.button("SEND ↗", use_container_width=True, key="btn_main_query"):
        if main_query:
            try:
                _r = requests.post(
                    f"{BACKEND}/query",
                    json={"query": main_query},
                    timeout=3,
                )
                _d = _r.json()
                if _d.get("status") == "no_drone_connected":
                    st.warning("No drone connected")
                else:
                    st.success("TRANSMITTED ✓")
            except Exception:
                st.error("Backend offline")
        else:
            st.warning("Enter a query first")
