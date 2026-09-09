import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Calculator, ChevronRight, Gauge, Network, ShieldCheck, Train, TrendingUp } from "lucide-react";
import "./cost-scalability.css";

type WorkspaceMode = "cost" | "scale";
type Currency = "₹" | "soles";

type CostScenario = {
  id: string;
  label: string;
  currency: Currency;
  baselineRate: number;
  systemRate: number;
  baselineTime: number | null;
  systemTime: number | null;
  timeUnit: string;
  source: string;
  caveat: string;
  composition: Array<{ name: string; value: number; color: string }>;
};

const COST_SCENARIOS: CostScenario[] = [
  {
    id: "transmission-inhouse",
    label: "India transmission · in-house drone",
    currency: "₹",
    baselineRate: 2125,
    systemRate: 1170,
    baselineTime: null,
    systemTime: null,
    timeUnit: "",
    source: "SAREP / USAID 2023",
    caveat: "Published transmission benchmark; not a measured DRIFT production rate.",
    composition: [
      { name: "Drone + payload", value: 87, color: "#263b36" },
      { name: "Maintenance", value: 167, color: "#5e766d" },
      { name: "Data management", value: 250, color: "#9aaa9f" },
      { name: "Supervisor", value: 271, color: "#c4cec7" },
      { name: "Pilot", value: 146, color: "#788e84" },
      { name: "Transport", value: 250, color: "#aebdb5" },
    ],
  },
  {
    id: "transmission-rental",
    label: "India transmission · rental drone",
    currency: "₹",
    baselineRate: 2125,
    systemRate: 1563,
    baselineTime: null,
    systemTime: null,
    timeUnit: "",
    source: "SAREP / USAID 2023",
    caveat: "Published transmission benchmark; rental scenario includes supervision, pilot, payload, reporting, and transport.",
    composition: [
      { name: "Supervisor", value: 271, color: "#263b36" },
      { name: "Pilot", value: 146, color: "#5e766d" },
      { name: "Quadcopter rental", value: 521, color: "#9aaa9f" },
      { name: "Payload", value: 125, color: "#c4cec7" },
      { name: "Automated reporting", value: 250, color: "#788e84" },
      { name: "Transport", value: 250, color: "#aebdb5" },
    ],
  },
  {
    id: "33kv-rental",
    label: "India 33kV · rental drone",
    currency: "₹",
    baselineRate: 6364,
    systemRate: 4773,
    baselineTime: null,
    systemTime: null,
    timeUnit: "",
    source: "SAREP / USAID 2023",
    caveat: "Urban 33kV power-line scenario; useful as an Indian operational benchmark, not a road quote.",
    composition: [
      { name: "Supervisor", value: 909, color: "#263b36" },
      { name: "Drone + pilot", value: 1591, color: "#5e766d" },
      { name: "Payload", value: 455, color: "#9aaa9f" },
      { name: "Automated reporting", value: 909, color: "#c4cec7" },
      { name: "Transport", value: 909, color: "#788e84" },
    ],
  },
  {
    id: "road-study",
    label: "Road inspection · published study",
    currency: "soles",
    baselineRate: 1422.73,
    systemRate: 375,
    baselineTime: 30,
    systemTime: 3,
    timeUnit: "hours for a 2 km study",
    source: "Smart Road Maintenance study 2024",
    caveat: "Study-specific values in Peruvian soles; do not convert into a universal DRIFT road price.",
    composition: [],
  },
];

const PROTOTYPE_PARTS = [
  { name: "ESP32 DevKit V1", value: 400, category: "Sensing" },
  { name: "MPU6050 / GY-521", value: 150, category: "Sensing" },
  { name: "MLX90614 temperature sensor", value: 600, category: "Sensing" },
  { name: "Power bank / USB power", value: 700, category: "Power" },
  { name: "Breadboard + jumper wires + USB cable", value: 250, category: "Wiring" },
];

const PROTOTYPE_TOTAL = 4615;
const RAIL_SENSOR_NODE_COST = PROTOTYPE_PARTS.reduce((total, part) => total + part.value, 0);
const FLEET_OPTIONS = [1, 10, 50, 100, 500, 1000];
const PALETTE = ["#263b36", "#5e766d", "#9aaa9f", "#c4cec7", "#788e84", "#aebdb5"];

function formatINR(value: number) {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function formatMetric(value: number, digits = 0) {
  return value.toLocaleString("en-IN", { maximumFractionDigits: digits });
}

function safeNumber(value: string, fallback: number, minimum = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, parsed) : fallback;
}

function ChartFrame({ children, className = "" }: { children: React.ReactElement; className?: string }) {
  return <div className={`cost-chart-frame ${className}`}><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>;
}

function SectionHeader({ mode }: { mode: WorkspaceMode }) {
  const isCost = mode === "cost";
  return (
    <div className="cost-section-header">
      <div>
        <span className="eyebrow">{isCost ? "ECONOMIC MODEL · BENCHMARKED INPUTS" : "FLEET MODEL · THEORETICAL CAPACITY"}</span>
        <h2>{isCost ? "Cost efficient" : "Scalability"}</h2>
        <p>{isCost ? "Translate inspection distance, benchmark rates, and rail-sensor hardware into a transparent operating-cost view." : "Show how throughput grows with fleet orchestration, targeted road selection, and distributed rail-vibration sensing."}</p>
      </div>
      {isCost ? <Calculator className="cost-section-icon" /> : <TrendingUp className="cost-section-icon" />}
    </div>
  );
}

export default function CostScalabilityWorkspace({ mode, onOpenTrainMonitoring }: { mode: WorkspaceMode; onOpenTrainMonitoring: () => void }) {
  const [scenarioId, setScenarioId] = useState("transmission-inhouse");
  const [distanceKm, setDistanceKm] = useState(300);
  const [railNodes, setRailNodes] = useState(10);
  const [fleetSize, setFleetSize] = useState(10);
  const [kmPerMission, setKmPerMission] = useState(5);
  const [missionsPerDay, setMissionsPerDay] = useState(10);
  const [operatingDays, setOperatingDays] = useState(300);
  const [utilisation, setUtilisation] = useState(100);
  const [targetNetworkKm, setTargetNetworkKm] = useState(1000);
  const [priorityShare, setPriorityShare] = useState(30);

  const scenario = COST_SCENARIOS.find(item => item.id === scenarioId) ?? COST_SCENARIOS[0]!;
  const isRupeeScenario = scenario.currency === "₹";
  const railCapex = isRupeeScenario ? railNodes * RAIL_SENSOR_NODE_COST : 0;
  const baselineTotal = distanceKm * scenario.baselineRate;
  const inspectionTotal = distanceKm * scenario.systemRate;
  const operatingSaving = Math.max(0, baselineTotal - inspectionTotal);
  const savingPercent = baselineTotal > 0 ? (operatingSaving / baselineTotal) * 100 : 0;
  const firstYearModeledCost = inspectionTotal + railCapex;
  const effectiveCostPerKm = distanceKm > 0 ? firstYearModeledCost / distanceKm : 0;

  const rateComparison = useMemo(() => {
    const sameCurrency = COST_SCENARIOS.filter(item => item.currency === scenario.currency);
    return sameCurrency.map(item => ({
      label: item.label.replace("India ", "").replace(" · ", " / "),
      baseline: item.baselineRate,
      system: item.systemRate,
    }));
  }, [scenario.currency]);

  const cumulativeCost = useMemo(() => {
    const fractions = [0.2, 0.4, 0.6, 0.8, 1];
    return fractions.map(fraction => ({
      km: Math.max(1, Math.round(distanceKm * fraction)),
      baseline: Math.round(distanceKm * fraction * scenario.baselineRate),
      system: Math.round(distanceKm * fraction * scenario.systemRate),
    }));
  }, [distanceKm, scenario]);

  const composition = scenario.composition;
  const sensorMix = useMemo(() => PROTOTYPE_PARTS.map(part => ({ name: part.name.replace(" / GY-521", ""), value: part.value })), []);

  const priorityDistance = targetNetworkKm * (priorityShare / 100);
  const distanceAvoided = Math.max(0, targetNetworkKm - priorityDistance);
  const capacityForFleet = (drones: number) => drones * kmPerMission * missionsPerDay * operatingDays * (utilisation / 100);
  const selectedAnnualCapacity = capacityForFleet(fleetSize);
  const selectedCoverage = priorityDistance > 0 ? Math.min(100, (selectedAnnualCapacity / priorityDistance) * 100) : 0;
  const scaleData = FLEET_OPTIONS.map(drones => ({
    drones,
    capacity: Math.round(capacityForFleet(drones)),
    coverage: Math.min(100, priorityDistance > 0 ? (capacityForFleet(drones) / priorityDistance) * 100 : 0),
  }));
  const sensorCapexData = [1, 10, 50, 100].map(nodes => ({ nodes, capex: nodes * RAIL_SENSOR_NODE_COST }));

  return (
    <section className="workspace-page cost-scalability-workspace">
      <SectionHeader mode={mode} />

      {mode === "cost" ? (
        <>
          <section className="cost-control-panel" aria-label="Cost model controls">
            <div className="cost-control-heading"><div><span className="eyebrow">USER-DRIVEN MODEL</span><h3>Build a transparent cost case</h3><p>Every headline below is recalculated from the selected benchmark and the inputs you control.</p></div><ShieldCheck /></div>
            <div className="cost-input-grid">
              <label>BENCHMARK SCENARIO<select value={scenarioId} onChange={event => setScenarioId(event.target.value)}>{COST_SCENARIOS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
              <label>VERIFIED DISTANCE · KM<input type="number" min={1} step={1} value={distanceKm} onChange={event => setDistanceKm(safeNumber(event.target.value, distanceKm, 1))} /></label>
              <label>RAIL SENSOR NODES<input type="number" min={0} step={1} value={railNodes} disabled={!isRupeeScenario} onChange={event => setRailNodes(safeNumber(event.target.value, railNodes))} /><small>{isRupeeScenario ? `${formatINR(RAIL_SENSOR_NODE_COST)} per configurable prototype node` : "Available on INR scenarios only; road study is reported in soles."}</small></label>
            </div>
          </section>

          <section className="cost-kpi-grid" aria-label="Cost model results">
            <article><span className="eyebrow">BASELINE TOTAL</span><strong>{scenario.currency === "₹" ? formatINR(baselineTotal) : `${formatMetric(baselineTotal, 2)} soles`}</strong><small>{scenario.currency}{formatMetric(scenario.baselineRate, 2)} / km · published comparison</small></article>
            <article className="cost-kpi-positive"><span className="eyebrow">SELECTED SYSTEM RATE</span><strong>{scenario.currency === "₹" ? formatINR(inspectionTotal) : `${formatMetric(inspectionTotal, 2)} soles`}</strong><small>{scenario.currency}{formatMetric(scenario.systemRate, 2)} / km · selected benchmark</small></article>
            <article><span className="eyebrow">OPERATING DIFFERENCE</span><strong>{scenario.currency === "₹" ? formatINR(operatingSaving) : `${formatMetric(operatingSaving, 2)} soles`}</strong><small>{formatMetric(savingPercent, 1)}% lower than the selected baseline</small></article>
            <article className="cost-kpi-dark"><span className="eyebrow">FIRST-YEAR MODEL</span><strong>{isRupeeScenario ? formatINR(firstYearModeledCost) : `${formatMetric(firstYearModeledCost, 2)} soles`}</strong><small>{isRupeeScenario ? `${formatINR(effectiveCostPerKm)} / km including ${railNodes} sensor nodes` : "Rail sensor capex excluded from mixed-currency scenario"}</small></article>
          </section>

          <section className="cost-chart-grid">
            <article className="panel cost-chart-card"><div className="panel-heading"><div><span className="eyebrow">RATE COMPARISON</span><h3>Benchmark vs selected system</h3></div><Gauge /></div><ChartFrame><BarChart data={rateComparison} margin={{ top: 8, right: 12, left: 4, bottom: 54 }}><CartesianGrid strokeDasharray="3 3" stroke="#d6ddd8" vertical={false} /><XAxis dataKey="label" angle={-22} textAnchor="end" height={60} tick={{ fontSize: 9, fill: "#52635f" }} /><YAxis tick={{ fontSize: 9, fill: "#52635f" }} tickFormatter={value => scenario.currency === "₹" ? `₹${Math.round(Number(value) / 1000)}k` : `${value}`} /><Tooltip contentStyle={{ border: "1px solid #bfc9c2", borderRadius: 0, fontSize: 11 }} formatter={(value: number) => [scenario.currency === "₹" ? formatINR(value) : `${formatMetric(value, 2)} soles`, ""]} /><Bar dataKey="baseline" name="Baseline" fill="#aebdb5" radius={[2, 2, 0, 0]} /><Bar dataKey="system" name="Drone / system" fill="#263b36" radius={[2, 2, 0, 0]} /></BarChart></ChartFrame><p className="chart-note">Only benchmarks with the same currency are shown together. These are reference rates, not a universal DRIFT tariff.</p></article>
            <article className="panel cost-chart-card"><div className="panel-heading"><div><span className="eyebrow">CUMULATIVE ECONOMICS</span><h3>Cost curve by verified distance</h3></div><TrendingUp /></div><ChartFrame><LineChart data={cumulativeCost} margin={{ top: 8, right: 14, left: 4, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" stroke="#d6ddd8" vertical={false} /><XAxis dataKey="km" tick={{ fontSize: 9, fill: "#52635f" }} tickFormatter={value => `${value} km`} /><YAxis tick={{ fontSize: 9, fill: "#52635f" }} tickFormatter={value => scenario.currency === "₹" ? `₹${Math.round(Number(value) / 1000)}k` : `${Math.round(Number(value))}`} /><Tooltip contentStyle={{ border: "1px solid #bfc9c2", borderRadius: 0, fontSize: 11 }} formatter={(value: number) => [scenario.currency === "₹" ? formatINR(value) : `${formatMetric(value, 2)} soles`, ""]} /><Line type="monotone" dataKey="baseline" name="Baseline" stroke="#8a9b92" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="system" name="Selected system" stroke="#263b36" strokeWidth={3} dot={{ r: 3, fill: "#263b36" }} /></LineChart></ChartFrame><p className="chart-note">Formula: distance × published cost/km. Rail node capex is shown separately in the first-year model.</p></article>
          </section>

          <section className="cost-detail-grid">
            <article className="panel cost-chart-card"><div className="panel-heading"><div><span className="eyebrow">COST COMPOSITION</span><h3>{composition.length ? "Selected system rate" : "Composition not published"}</h3></div><Calculator /></div>{composition.length ? <><ChartFrame className="cost-donut-frame"><PieChart><Pie data={composition} dataKey="value" nameKey="name" innerRadius={56} outerRadius={86} paddingAngle={2}>{composition.map((item, index) => <Cell key={item.name} fill={item.color ?? PALETTE[index % PALETTE.length]} />)}</Pie><Tooltip contentStyle={{ border: "1px solid #bfc9c2", borderRadius: 0, fontSize: 11 }} formatter={(value: number) => [formatINR(value), "₹/km"]} /></PieChart></ChartFrame><div className="cost-legend">{composition.map(item => <span key={item.name}><i style={{ background: item.color }} />{item.name}<b>{formatINR(item.value)}/km</b></span>)}</div></> : <div className="cost-empty"><strong>Do not invent a breakdown.</strong><p>The supplied road study publishes comparative rates and time, but not a component-level cost split. The comparison and formula remain available without implying unsupported detail.</p></div>}</article>
            <article className="panel cost-chart-card"><div className="panel-heading"><div><span className="eyebrow">RAIL VIBRATION SENSOR</span><h3>Configurable node economics</h3></div><Train /></div><div className="sensor-cost-callout"><strong>{formatINR(RAIL_SENSOR_NODE_COST)}</strong><span>per configurable rail node</span><small>ESP32 + MPU6050 + MLX90614 + power + wiring</small></div><ChartFrame><PieChart><Pie data={sensorMix} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2}>{sensorMix.map((item, index) => <Cell key={item.name} fill={PALETTE[index % PALETTE.length]} />)}</Pie><Tooltip contentStyle={{ border: "1px solid #bfc9c2", borderRadius: 0, fontSize: 11 }} formatter={(value: number) => [formatINR(value), "prototype component"]} /></PieChart></ChartFrame><button type="button" className="secondary-action cost-link-button" onClick={onOpenTrainMonitoring}>OPEN RAIL VIBRATION MODULE <ChevronRight /></button></article>
          </section>
          <p className="cost-disclosure"><strong>{scenario.source}.</strong> {scenario.caveat} The workbook explicitly separates published benchmarks from DRIFT planning assumptions. DRIFT reduces search, verification, prioritisation, and coordination effort; physical repair materials and labour remain outside this model.</p>
        </>
      ) : (
        <>
          <section className="cost-control-panel" aria-label="Scalability model controls">
            <div className="cost-control-heading"><div><span className="eyebrow">USER-DRIVEN CAPACITY MODEL</span><h3>Stress-test fleet and network assumptions</h3><p>Adjust the operational levers below. Capacity is theoretical until pilot telemetry validates utilisation, weather, turnaround, and regulatory constraints.</p></div><Network /></div>
            <div className="cost-input-grid scale-input-grid">
              <label>FLEET SIZE<select value={fleetSize} onChange={event => setFleetSize(Number(event.target.value))}>{FLEET_OPTIONS.map(value => <option key={value} value={value}>{value.toLocaleString("en-IN")} drone{value === 1 ? "" : "s"}</option>)}</select></label>
              <label>KM PER MISSION<input type="number" min={0.5} step={0.5} value={kmPerMission} onChange={event => setKmPerMission(safeNumber(event.target.value, kmPerMission, 0.5))} /></label>
              <label>MISSIONS / DAY / DRONE<input type="number" min={1} step={1} value={missionsPerDay} onChange={event => setMissionsPerDay(safeNumber(event.target.value, missionsPerDay, 1))} /></label>
              <label>OPERATING DAYS / YEAR<input type="number" min={1} max={365} step={1} value={operatingDays} onChange={event => setOperatingDays(Math.min(365, safeNumber(event.target.value, operatingDays, 1)))} /></label>
              <label>UTILISATION<input type="number" min={10} max={100} step={5} value={utilisation} onChange={event => setUtilisation(Math.min(100, safeNumber(event.target.value, utilisation, 10)))} /><small>100% is the supplied theoretical ceiling.</small></label>
              <label>TARGET NETWORK · KM<input type="number" min={1} step={50} value={targetNetworkKm} onChange={event => setTargetNetworkKm(safeNumber(event.target.value, targetNetworkKm, 1))} /></label>
              <label>PRIORITY ROAD SHARE · %<input type="number" min={1} max={100} step={5} value={priorityShare} onChange={event => setPriorityShare(Math.min(100, safeNumber(event.target.value, priorityShare, 1)))} /><small>Workbook illustration defaults to 30%.</small></label>
              <label>RAIL SENSOR NODES<input type="number" min={0} step={1} value={railNodes} onChange={event => setRailNodes(safeNumber(event.target.value, railNodes))} /><small>{formatINR(RAIL_SENSOR_NODE_COST)} per configurable node.</small></label>
            </div>
          </section>

          <section className="cost-kpi-grid scale-kpi-grid" aria-label="Scalability model results">
            <article className="cost-kpi-dark"><span className="eyebrow">SELECTED ANNUAL CAPACITY</span><strong>{formatMetric(selectedAnnualCapacity)} km</strong><small>{fleetSize} drones × {kmPerMission} km × {missionsPerDay} missions × {operatingDays} days × {utilisation}% utilisation</small></article>
            <article><span className="eyebrow">PRIORITY DISTANCE</span><strong>{formatMetric(priorityDistance)} km</strong><small>{formatMetric(targetNetworkKm)} km target × {priorityShare}% priority share</small></article>
            <article className="cost-kpi-positive"><span className="eyebrow">THEORETICAL COVERAGE</span><strong>{formatMetric(selectedCoverage, 1)}%</strong><small>of the priority distance in one modeled year</small></article>
            <article><span className="eyebrow">RAIL NODE CAPEX</span><strong>{formatINR(railNodes * RAIL_SENSOR_NODE_COST)}</strong><small>{railNodes} configurable sensor nodes; prototype hardware basis</small></article>
          </section>

          <section className="cost-chart-grid">
            <article className="panel cost-chart-card"><div className="panel-heading"><div><span className="eyebrow">FLEET THROUGHPUT</span><h3>Capacity scales with orchestration</h3></div><TrendingUp /></div><ChartFrame><LineChart data={scaleData} margin={{ top: 8, right: 14, left: 4, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" stroke="#d6ddd8" vertical={false} /><XAxis dataKey="drones" tick={{ fontSize: 9, fill: "#52635f" }} tickFormatter={value => `${value}`} /><YAxis tick={{ fontSize: 9, fill: "#52635f" }} tickFormatter={value => `${Math.round(Number(value) / 1000)}k`} /><Tooltip contentStyle={{ border: "1px solid #bfc9c2", borderRadius: 0, fontSize: 11 }} formatter={(value: number, name: string) => [name === "capacity" ? `${formatMetric(value)} km/year` : `${formatMetric(value, 1)}%`, name === "capacity" ? "Theoretical capacity" : "Priority coverage"]} /><Line type="monotone" dataKey="capacity" name="capacity" stroke="#263b36" strokeWidth={3} dot={{ r: 3, fill: "#263b36" }} /><Line type="monotone" dataKey="coverage" name="coverage" stroke="#8a9b92" strokeWidth={2} strokeDasharray="5 4" dot={false} /></LineChart></ChartFrame><p className="chart-note">The workbook gives 15,000 theoretical km/year for one drone and 15 million for 1,000 drones under full utilisation. This chart keeps the formula visible.</p></article>
            <article className="panel cost-chart-card"><div className="panel-heading"><div><span className="eyebrow">RAIL SENSOR NETWORK</span><h3>Node capex by network size</h3></div><Train /></div><ChartFrame><BarChart data={sensorCapexData} margin={{ top: 8, right: 14, left: 4, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" stroke="#d6ddd8" vertical={false} /><XAxis dataKey="nodes" tick={{ fontSize: 9, fill: "#52635f" }} tickFormatter={value => `${value} nodes`} /><YAxis tick={{ fontSize: 9, fill: "#52635f" }} tickFormatter={value => `₹${Math.round(Number(value) / 1000)}k`} /><Tooltip contentStyle={{ border: "1px solid #bfc9c2", borderRadius: 0, fontSize: 11 }} formatter={(value: number) => [formatINR(value), "Prototype node capex"]} /><Bar dataKey="capex" fill="#5e766d" radius={[2, 2, 0, 0]} /></BarChart></ChartFrame><p className="chart-note">Node cost is derived from the supplied normal-cost report: ESP32, MPU6050, MLX90614, power, and wiring. Motor-rig parts are not included.</p></article>
          </section>

          <section className="scale-architecture-grid">
            <article className="panel scale-principles"><div className="panel-heading"><div><span className="eyebrow">SCALE ARCHITECTURE</span><h3>What expands without changing the workflow</h3></div><Network /></div><div className="scale-principle-list"><div><b>01</b><span><strong>Prioritise first</strong><small>CCTV and traffic segmentation target the highest-value road distance before dispatch.</small></span></div><div><b>02</b><span><strong>Orchestrate a fleet</strong><small>More drones and docking points increase throughput without forcing one aircraft to do everything.</small></span></div><div><b>03</b><span><strong>Keep the human checkpoint</strong><small>Engineer verification remains the safety and audit boundary for actionable findings.</small></span></div><div><b>04</b><span><strong>Reuse the evidence pipeline</strong><small>GPS, model outputs, priority scores, tickets, and closure evidence share one traceable record.</small></span></div></div></article>
            <article className="panel scale-principles"><div className="panel-heading"><div><span className="eyebrow">NETWORK EFFECT</span><h3>Targeted coverage logic</h3></div><Gauge /></div><div className="targeted-coverage"><div><span>TARGET NETWORK</span><strong>{formatMetric(targetNetworkKm)} km</strong></div><div><span>PRIORITY WORKLIST</span><strong>{formatMetric(priorityDistance)} km</strong></div><div><span>AVOIDED FIRST PASS</span><strong>{formatMetric(distanceAvoided)} km</strong></div><p>Illustrative targeting does not claim that 70% of inspection is always avoided. It shows how traffic intelligence can focus limited fleet capacity before a wider reinspection cycle.</p></div><button type="button" className="secondary-action cost-link-button" onClick={onOpenTrainMonitoring}>OPEN TRAIN MONITORING &amp; SENSOR DATA <ChevronRight /></button></article>
          </section>
          <p className="cost-disclosure"><strong>Planning and theoretical model.</strong> The supplied sheet labels fleet capacity, priority share, and autonomous operation as planning assumptions. Report actual pilot values for cost/km, utilisation, coverage, false-positive rate, false-negative rate, and human-review rate before making operational claims.</p>
        </>
      )}
    </section>
  );
}
