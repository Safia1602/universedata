// observatory.js

// === CONFIG ===
const DATA_FILE = "../linkedin-scraper/november_17_jobs_updated.csv";
const DATE_COL = "date_posted";
const COUNTRY_COL = "country";
const TECH_SKILLS_COL = "technical_skills";

// How many skills to show in the bubble chart
const MAX_BUBBLES = 60;
// How many top skills (max) in the multi-line trend chart
const TOP_SKILLS_TREND = 5;

// Global state
let rawData = [];
let filteredData = [];
let allCountries = [];
let skillStatsGlobal = null; // aggregated skills for the whole dataset
let focusSkill = null; // if user clicked a bubble

// SVG dimensions
const chartWidth = 1100;
const chartHeight = 320;

// === MAIN ===
document.addEventListener("DOMContentLoaded", () => {
  setupKpiScroll();
  loadData();
});

// Smooth scroll from KPI cards
function setupKpiScroll() {
  document.querySelectorAll(".kpi-card").forEach((card) => {
    card.addEventListener("click", () => {
      const target = card.getAttribute("data-scroll-target");
      if (!target) return;
      const el = document.querySelector(target);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
}

// === DATA LOADING ===
function loadData() {
  d3.dsv("|", DATA_FILE, parseRow)
    .then((data) => {
      rawData = data.filter((d) => d.date != null);
      computeGlobalMetadata();
      initFilters();
      applyFilters(); // will also draw charts
    })
    .catch((err) => {
      console.error("Error loading data:", err);
    });
}

function parseRow(d) {
  // Parse date
  let date = null;
  if (d[DATE_COL]) {
    const tmp = new Date(d[DATE_COL]);
    if (!isNaN(tmp)) {
      date = tmp;
    }
  }

  // Normalise country
  let country = d[COUNTRY_COL] ? d[COUNTRY_COL].trim() : "Unknown";

  return {
    ...d,
    date,
    country,
    techSkills: parseSkills(d[TECH_SKILLS_COL]),
  };
}

// Splits technical_skills column into array of cleaned strings
function parseSkills(val) {
  if (!val) return [];
  // handle separators ; , |
  return val
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// === GLOBAL METADATA (KPIs, countries, skill stats) ===
function computeGlobalMetadata() {
  // Countries
  const countrySet = new Set();
  rawData.forEach((d) => {
    if (d.country && d.country !== "Unknown") {
      countrySet.add(d.country);
    }
  });
  allCountries = Array.from(countrySet).sort();

  // KPIs
  d3.select("#kpi-total-jobs-value").text(rawData.length.toLocaleString());
  d3.select("#kpi-countries-value").text(allCountries.length.toString());

  // Global skill stats
  skillStatsGlobal = aggregateSkillCounts(rawData);
  const topSkill = skillStatsGlobal
    .slice()
    .sort((a, b) => d3.descending(a.count, b.count))[0];

  if (topSkill) {
    d3.select("#kpi-top-skill-value").text(topSkill.skill);
  } else {
    d3.select("#kpi-top-skill-value").text("–");
  }
}

// Aggregate counts of technical skills from a subset of data
function aggregateSkillCounts(dataSubset) {
  const skillMap = new Map();
  dataSubset.forEach((row) => {
    row.techSkills.forEach((sk) => {
      const key = sk.toLowerCase();
      if (!skillMap.has(key)) {
        skillMap.set(key, {
          skill: sk,
          key,
          count: 0,
        });
      }
      skillMap.get(key).count += 1;
    });
  });
  return Array.from(skillMap.values());
}

// === FILTERS ===
function initFilters() {
  const countrySelect = document.getElementById("country-filter");
  allCountries.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    countrySelect.appendChild(opt);
  });

  countrySelect.addEventListener("change", () => {
    applyFilters();
  });

  const periodSelect = document.getElementById("period-filter");
  periodSelect.addEventListener("change", () => {
    applyFilters();
  });
}

function applyFilters() {
  const country = document.getElementById("country-filter").value;
  const period = document.getElementById("period-filter").value;

  const now = new Date();

  filteredData = rawData.filter((d) => {
    // country filter
    const countryOk = country === "ALL" || d.country === country;
    if (!countryOk) return false;

    // period filter
    if (!d.date) return false;

    if (period === "30d") {
      const diff = (now - d.date) / (1000 * 60 * 60 * 24);
      return diff <= 30;
    } else if (period === "90d") {
      const diff = (now - d.date) / (1000 * 60 * 60 * 24);
      return diff <= 90;
    }

    // all time
    return true;
  });

  // Update charts
  renderJobVolumeChart();
  renderSkillBubbleUniverse();
  renderSkillTrendsChart();

  // Reset focusSkill if the filters drastically changed
  // (You can keep it if you prefer)
}

// === JOB VOLUME CHART (multi-line) ===
function renderJobVolumeChart() {
  const container = d3.select("#job-volume-chart");
  container.selectAll("*").remove();

  const margin = { top: 10, right: 20, bottom: 28, left: 45 };
  const width = chartWidth - margin.left - margin.right;
  const height = chartHeight - margin.top - margin.bottom;

  const svg = container
    .append("svg")
    .attr("viewBox", `0 0 ${chartWidth} ${chartHeight}`);

  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  if (rawData.length === 0) return;

  // Aggregate by month for all data and filtered data
  const allByMonth = aggregateJobsByMonth(rawData);
  const filteredByMonth = aggregateJobsByMonth(filteredData);

  // Build x domain from the full dataset
  const allDates = allByMonth.map((d) => d.month);
  const xDomain =
    allDates.length > 0
      ? d3.extent(allDates)
      : [new Date(), new Date(new Date().getTime() + 86400000)];

  const xScale = d3.scaleTime().domain(xDomain).range([0, width]);

  const maxAll = d3.max(allByMonth, (d) => d.count) || 1;
  const maxFiltered = d3.max(filteredByMonth, (d) => d.count) || 1;
  const yMax = Math.max(maxAll, maxFiltered);

  const yScale = d3.scaleLinear().domain([0, yMax]).range([height, 0]).nice();

  // axes
  const xAxis = d3
    .axisBottom(xScale)
    .ticks(6)
    .tickFormat(d3.timeFormat("%b %Y"));
  const yAxis = d3.axisLeft(yScale).ticks(4);

  g.append("g")
    .attr("transform", `translate(0,${height})`)
    .attr("class", "axis axis-x")
    .call(xAxis)
    .selectAll("text")
    .style("fill", "#9ca3af")
    .style("font-size", "10px");

  g.append("g")
    .attr("class", "axis axis-y")
    .call(yAxis)
    .selectAll("text")
    .style("fill", "#9ca3af")
    .style("font-size", "10px");

  g.selectAll(".axis path, .axis line")
    .attr("stroke", "#374151")
    .attr("stroke-width", 1);

  // line generators
  const line = d3
    .line()
    .x((d) => xScale(d.month))
    .y((d) => yScale(d.count))
    .curve(d3.curveMonotoneX);

  // global baseline
  g.append("path")
    .datum(allByMonth)
    .attr("fill", "none")
    .attr("stroke", "#4b5563")
    .attr("stroke-width", 2)
    .attr("stroke-opacity", 0.9)
    .attr("d", line);

  // filtered line
  g.append("path")
    .datum(filteredByMonth)
    .attr("fill", "none")
    .attr("stroke", "#38bdf8")
    .attr("stroke-width", 2.4)
    .attr("stroke-linejoin", "round")
    .attr("stroke-linecap", "round")
    .attr("d", line);

  // legend
  const legend = g.append("g").attr("transform", `translate(${width - 160},4)`);

  const legendItems = [
    { label: "All jobs (baseline)", color: "#4b5563" },
    { label: "Filtered jobs", color: "#38bdf8" },
  ];

  legendItems.forEach((item, i) => {
    const row = legend.append("g").attr("transform", `translate(0,${i * 16})`);

    row
      .append("rect")
      .attr("width", 10)
      .attr("height", 10)
      .attr("rx", 2)
      .attr("ry", 2)
      .attr("fill", item.color);

    row
      .append("text")
      .attr("x", 16)
      .attr("y", 9)
      .text(item.label)
      .attr("fill", "#9ca3af")
      .style("font-size", "10px");
  });
}

function aggregateJobsByMonth(dataSubset) {
  const monthMap = new Map();
  dataSubset.forEach((d) => {
    if (!d.date) return;
    // Round to first day of the month
    const monthKey = `${d.date.getFullYear()}-${String(
      d.date.getMonth() + 1
    ).padStart(2, "0")}-01`;
    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, {
        month: new Date(monthKey),
        count: 0,
      });
    }
    monthMap.get(monthKey).count += 1;
  });

  return Array.from(monthMap.values()).sort((a, b) => a.month - b.month);
}

// === SKILL BUBBLE UNIVERSE ===
function renderSkillBubbleUniverse() {
  const container = d3.select("#skills-bubble-chart");
  container.selectAll("*").remove();

  const margin = { top: 10, right: 10, bottom: 10, left: 10 };
  const width = chartWidth - margin.left - margin.right;
  const height = chartHeight - margin.top - margin.bottom;

  const svg = container
    .append("svg")
    .attr("viewBox", `0 0 ${chartWidth} ${chartHeight}`);

  const g = svg
    .append("g")
    .attr("transform", `translate(${chartWidth / 2},${chartHeight / 2})`);

  if (filteredData.length === 0) return;

  // Aggregate skill counts in filtered dataset
  const skillStats = aggregateSkillCounts(filteredData)
    .filter((d) => d.count > 0)
    .sort((a, b) => d3.descending(a.count, b.count))
    .slice(0, MAX_BUBBLES);

  if (skillStats.length === 0) return;

  // Radius scale
  const maxCount = d3.max(skillStats, (d) => d.count);
  const radiusScale = d3.scaleSqrt().domain([1, maxCount]).range([8, 40]); // bubble sizes

  // Color scale by category
  const categories = ["programming", "bi_viz", "cloud", "ml_ai", "other"];
  const colorScale = d3
    .scaleOrdinal()
    .domain(categories)
    .range(["#38bdf8", "#a855f7", "#22c55e", "#facc15", "#f97316"]);

  // Build hierarchical structure for pack
  const root = d3
    .hierarchy({
      children: skillStats.map((d) => ({
        ...d,
        value: d.count,
        category: categorizeSkill(d.skill),
      })),
    })
    .sum((d) => d.value);

  const packLayout = d3.pack().size([width, height]).padding(4);

  const packed = packLayout(root);

  const nodes = g
    .selectAll("g.skill-node")
    .data(packed.leaves())
    .join("g")
    .attr("class", "skill-node")
    .attr(
      "transform",
      (d) =>
        `translate(${d.x - width / 2 + margin.left},${
          d.y - height / 2 + margin.top
        })`
    );

  // Outer circle
  nodes
    .append("circle")
    .attr("r", (d) => d.r)
    .attr("fill", (d) => colorScale(d.data.category))
    .attr("fill-opacity", 0.85)
    .attr("stroke", (d) =>
      focusSkill && d.data.skill.toLowerCase() === focusSkill.toLowerCase()
        ? "#ffffff"
        : "#020617"
    )
    .attr("stroke-width", (d) =>
      focusSkill && d.data.skill.toLowerCase() === focusSkill.toLowerCase()
        ? 2
        : 1
    )
    .style("cursor", "pointer")
    .on("click", (event, d) => {
      const clickedSkill = d.data.skill;
      if (
        focusSkill &&
        focusSkill.toLowerCase() === clickedSkill.toLowerCase()
      ) {
        // toggle off
        focusSkill = null;
      } else {
        focusSkill = clickedSkill;
      }
      renderSkillBubbleUniverse();
      renderSkillTrendsChart();
    });

  // Skill label
  nodes
    .append("text")
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .attr("fill", "#0f172a")
    .style("font-size", (d) => Math.min(11, d.r * 0.5) + "px")
    .style("font-weight", 600)
    .style("pointer-events", "none")
    .text((d) => shortenSkillLabel(d.data.skill));

  // Tooltip (simple title)
  nodes
    .append("title")
    .text((d) => `${d.data.skill}\n${d.data.count.toLocaleString()} mentions`);
}

// Rough categorisation of skills into functional groups
function categorizeSkill(skill) {
  const s = skill.toLowerCase();
  if (
    s.includes("python") ||
    s.includes("java") ||
    s.includes("r ") ||
    s === "r" ||
    s.includes("c++") ||
    s.includes("c#") ||
    s.includes("scala") ||
    s.includes("typescript") ||
    s.includes("javascript")
  ) {
    return "programming";
  }
  if (
    s.includes("power bi") ||
    s.includes("tableau") ||
    s.includes("looker") ||
    s.includes("qlik") ||
    s.includes("excel")
  ) {
    return "bi_viz";
  }
  if (
    s.includes("aws") ||
    s.includes("azure") ||
    s.includes("gcp") ||
    s.includes("snowflake") ||
    s.includes("databricks") ||
    s.includes("bigquery")
  ) {
    return "cloud";
  }
  if (
    s.includes("machine learning") ||
    s.includes("ml") ||
    s.includes("deep learning") ||
    s.includes("pytorch") ||
    s.includes("tensorflow") ||
    s.includes("llm") ||
    s.includes("nlp")
  ) {
    return "ml_ai";
  }
  return "other";
}

// Shorten overlong skill labels for bubbles
function shortenSkillLabel(skill) {
  if (skill.length <= 10) return skill;
  return skill.slice(0, 9) + "…";
}

// === SKILL TRENDS OVER TIME ===
function renderSkillTrendsChart() {
  const container = d3.select("#skills-trend-chart");
  container.selectAll("*").remove();

  const margin = { top: 12, right: 120, bottom: 28, left: 45 };
  const width = chartWidth - margin.left - margin.right;
  const height = chartHeight - margin.top - margin.bottom;

  const svg = container
    .append("svg")
    .attr("viewBox", `0 0 ${chartWidth} ${chartHeight}`);

  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  if (filteredData.length === 0) return;

  // Aggregate skill counts by month
  const skillMonthMap = new Map(); // key: skillKey, value: Map(monthKey -> count)

  filteredData.forEach((d) => {
    if (!d.date) return;
    const monthKey = `${d.date.getFullYear()}-${String(
      d.date.getMonth() + 1
    ).padStart(2, "0")}-01`;
    d.techSkills.forEach((sk) => {
      const key = sk.toLowerCase();
      if (!skillMonthMap.has(key)) {
        skillMonthMap.set(key, new Map());
      }
      const monthMap = skillMonthMap.get(key);
      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, {
          month: new Date(monthKey),
          count: 0,
          skill: sk,
        });
      }
      monthMap.get(monthKey).count += 1;
    });
  });

  if (skillMonthMap.size === 0) return;

  // Decide which skills to plot:
  let skillKeysToPlot;

  if (focusSkill) {
    // Only the selected skill
    const fk = focusSkill.toLowerCase();
    skillKeysToPlot = skillMonthMap.has(fk) ? [fk] : [];
  } else {
    // Top 5 skills globally within filters
    const skillTotals = [];
    skillMonthMap.forEach((monthMap, key) => {
      let total = 0;
      monthMap.forEach((v) => {
        total += v.count;
      });
      const reprName = Array.from(monthMap.values())[0]?.skill || key;
      skillTotals.push({ key, total, skill: reprName });
    });

    skillTotals.sort((a, b) => d3.descending(a.total, b.total));
    skillKeysToPlot = skillTotals.slice(0, TOP_SKILLS_TREND).map((d) => d.key);
  }

  if (skillKeysToPlot.length === 0) return;

  // Build combined time domain and y domain
  const allPoints = [];
  skillKeysToPlot.forEach((key) => {
    const monthMap = skillMonthMap.get(key);
    if (!monthMap) return;
    monthMap.forEach((v) => allPoints.push(v));
  });

  if (allPoints.length === 0) return;

  const xDomain = d3.extent(allPoints, (d) => d.month);
  const yMax = d3.max(allPoints, (d) => d.count) || 1;

  const xScale = d3.scaleTime().domain(xDomain).range([0, width]);

  const yScale = d3.scaleLinear().domain([0, yMax]).range([height, 0]).nice();

  // axes
  const xAxis = d3
    .axisBottom(xScale)
    .ticks(6)
    .tickFormat(d3.timeFormat("%b %Y"));
  const yAxis = d3.axisLeft(yScale).ticks(4);

  g.append("g")
    .attr("transform", `translate(0,${height})`)
    .attr("class", "axis axis-x")
    .call(xAxis)
    .selectAll("text")
    .style("fill", "#9ca3af")
    .style("font-size", "10px");

  g.append("g")
    .attr("class", "axis axis-y")
    .call(yAxis)
    .selectAll("text")
    .style("fill", "#9ca3af")
    .style("font-size", "10px");

  g.selectAll(".axis path, .axis line")
    .attr("stroke", "#374151")
    .attr("stroke-width", 1);

  const categories = ["programming", "bi_viz", "cloud", "ml_ai", "other"];
  const colorScale = d3
    .scaleOrdinal()
    .domain(categories)
    .range(["#38bdf8", "#a855f7", "#22c55e", "#facc15", "#f97316"]);

  const line = d3
    .line()
    .x((d) => xScale(d.month))
    .y((d) => yScale(d.count))
    .curve(d3.curveMonotoneX);

  // For legend placement
  const legend = g.append("g").attr("transform", `translate(${width + 8}, 4)`);

  let legendIndex = 0;

  skillKeysToPlot.forEach((key) => {
    const monthMap = skillMonthMap.get(key);
    if (!monthMap) return;

    const points = Array.from(monthMap.values()).sort(
      (a, b) => a.month - b.month
    );

    const skillName = points[0]?.skill || key;
    const cat = categorizeSkill(skillName);
    const color = colorScale(cat);

    g.append("path")
      .datum(points)
      .attr("fill", "none")
      .attr("stroke", color)
      .attr("stroke-width", focusSkill ? 2.8 : 2)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("d", line)
      .attr("opacity", 0.98);

    // Add a small legend row
    const row = legend
      .append("g")
      .attr("transform", `translate(0,${legendIndex * 16})`);

    row
      .append("rect")
      .attr("width", 10)
      .attr("height", 10)
      .attr("rx", 2)
      .attr("ry", 2)
      .attr("fill", color);

    row
      .append("text")
      .attr("x", 16)
      .attr("y", 9)
      .text(skillName)
      .attr("fill", "#9ca3af")
      .style("font-size", "10px");

    legendIndex += 1;
  });
}
