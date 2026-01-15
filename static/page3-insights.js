document.addEventListener("DOMContentLoaded", () => {
  console.log("Insights page loaded. Running D3.");

  const COLOR_ACCENT = "cyan";
  const COLOR_DANGER = "#f4dd11ff";
  const COLOR_SUCCESS = "#2ed573";
  const DATA_PATH = "/api/stats-data";

  d3.dsv(";", DATA_PATH)
    .then((data) => {
      console.log("Data loaded for insights.");
      const processedData = data.map((d) => ({
        ...d,
        salary_value: d.salary_value ? +d.salary_value : null,
        technical_skills: parseListString(d.technical_skills),
        seniority_level: d.seniority_level || "Not specified",
      }));

      createScatterPlot(processedData, "#viz-popularity-scatter");
      createSeniorityLadder(processedData, "#viz-seniority-ladder");
    })
    .catch((error) => {
      console.error("Error loading data:", error);
    });

  function parseListString(listString) {
    if (!listString || listString === "[]") return [];
    return listString
      .replace(/[\[\]']/g, "")
      .split(", ")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  // VIZ 1 : POPULARITY VS VALUE SCATTER PLOT
  function createScatterPlot(data, selector) {
    const skillStats = new Map();
    data.forEach((d) => {
      if (
        d.salary_value &&
        d.salary_currency === "USD" &&
        d.salary_type === "annual" &&
        d.salary_value > 20000
      ) {
        d.technical_skills.forEach((skill) => {
          if (!skillStats.has(skill))
            skillStats.set(skill, { sum: 0, count: 0 });
          skillStats.get(skill).sum += d.salary_value;
          skillStats.get(skill).count += 1;
        });
      }
    });

    const plotData = [];
    skillStats.forEach((val, key) => {
      if (val.count >= 5) {
        plotData.push({
          skill: key,
          avgSalary: val.sum / val.count,
          mentions: val.count,
        });
      }
    });

    const medianMentions = d3.median(plotData, (d) => d.mentions);
    const medianSalary = d3.median(plotData, (d) => d.avgSalary);

    const container = d3.select(selector);
    const width = container.node().getBoundingClientRect().width;
    const height = 550;
    const margin = { top: 30, right: 30, bottom: 70, left: 80 };

    container.html("");
    const svg = container
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const x = d3
      .scaleLog()
      .domain(d3.extent(plotData, (d) => d.mentions))
      .range([0, innerWidth])
      .nice();

    const y = d3
      .scaleLinear()
      .domain([
        d3.min(plotData, (d) => d.avgSalary) * 0.9,
        d3.max(plotData, (d) => d.avgSalary) * 1.1,
      ])
      .range([innerHeight, 0])
      .nice();

    svg
      .append("line")
      .attr("x1", x(medianMentions))
      .attr("x2", x(medianMentions))
      .attr("y1", 0)
      .attr("y2", innerHeight)
      .attr("stroke", "#444")
      .attr("stroke-dasharray", "4")
      .attr("opacity", 0.5);

    svg
      .append("line")
      .attr("x1", 0)
      .attr("x2", innerWidth)
      .attr("y1", y(medianSalary))
      .attr("y2", y(medianSalary))
      .attr("stroke", "#444")
      .attr("stroke-dasharray", "4")
      .attr("opacity", 0.5);

    const labelStyle = {
      fill: "#fff",
      opacity: 0.15,
      "font-size": "1.5rem",
      "font-weight": "bold",
      "text-anchor": "middle",
    };

    svg
      .append("text")
      .attr("x", innerWidth * 0.25)
      .attr("y", innerHeight * 0.25)
      .text("💎 HIDDEN GEMS")
      .call(attrs, labelStyle);

    svg
      .append("text")
      .attr("x", innerWidth * 0.75)
      .attr("y", innerHeight * 0.25)
      .text("⭐ ELITE STARS")
      .call(attrs, labelStyle);

    svg
      .append("text")
      .attr("x", innerWidth * 0.75)
      .attr("y", innerHeight * 0.75)
      .text("⚠️ COMMODITIES")
      .call(attrs, labelStyle);

    svg
      .append("text")
      .attr("x", innerWidth * 0.25)
      .attr("y", innerHeight * 0.75)
      .text("💤 NICHE")
      .call(attrs, labelStyle);

    function attrs(selection, attributes) {
      for (const key in attributes) selection.attr(key, attributes[key]);
      if (attributes.text) selection.text(attributes.text);
    }

    svg
      .append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .attr("class", "axis")
      .call(d3.axisBottom(x).ticks(5, "~s"));
    svg
      .append("g")
      .attr("class", "axis")
      .call(d3.axisLeft(y).tickFormat((d) => `$${d / 1000}k`));

    svg
      .append("text")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight + 50)
      .attr("fill", "#aaa")
      .style("text-anchor", "middle")
      .text("→ Popularity (Number of job mentions) →");
    svg
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", -60)
      .attr("x", -innerHeight / 2)
      .attr("fill", "#aaa")
      .style("text-anchor", "middle")
      .text("↑ Value (Average Salary USD)");

    let tooltip = d3.select(".d3-tooltip");
    if (tooltip.empty())
      tooltip = d3
        .select("body")
        .append("div")
        .attr("class", "d3-tooltip")
        .style("opacity", 0);

    svg
      .selectAll(".dot")
      .data(plotData)
      .enter()
      .append("circle")
      .attr("class", "dot")
      .attr("cx", (d) => x(d.mentions))
      .attr("cy", (d) => y(d.avgSalary))
      .attr("r", (d) => Math.max(5, Math.sqrt(d.mentions) * 0.8))
      .attr("fill", (d) => {
        if (d.mentions > medianMentions && d.avgSalary < medianSalary)
          return "#ff4757";
        if (d.mentions < medianMentions && d.avgSalary > medianSalary)
          return "#2ed573";
        if (d.mentions > medianMentions && d.avgSalary > medianSalary)
          return "#ffa502";
        return "#535c68";
      })
      .attr("opacity", 0.7)
      .attr("stroke", "#1e272e")
      .on("mouseover", (event, d) => {
        d3.select(event.currentTarget)
          .attr("opacity", 1)
          .attr("stroke", "#fff")
          .attr("stroke-width", 2);
        let zone = "";
        if (d.mentions > medianMentions && d.avgSalary < medianSalary)
          zone = "⚠️ Commodity Zone";
        else if (d.mentions < medianMentions && d.avgSalary > medianSalary)
          zone = "💎 Hidden Gem!";
        else if (d.mentions > medianMentions && d.avgSalary > medianSalary)
          zone = "⭐ Elite Star";
        else zone = "💤 Niche";

        tooltip
          .style("opacity", 1)
          .html(
            `<strong>${d.skill.toUpperCase()}</strong><br><span style="color:#aaa">${zone}</span><br>💰 Avg: $${(
              d.avgSalary / 1000
            ).toFixed(0)}k<br>📊 Mentions: ${d.mentions}`
          )
          .style("left", event.pageX + 15 + "px")
          .style("top", event.pageY - 28 + "px");
      })
      .on("mouseout", (event) => {
        d3.select(event.currentTarget)
          .attr("opacity", 0.7)
          .attr("stroke", "#1e272e")
          .attr("stroke-width", 1);
        tooltip.style("opacity", 0);
      });
  }

  // VIZ 2 : SENIORITY LADDER (BAR CHART)

  function createSeniorityLadder(data, selector) {
    const groups = new Map();
    data.forEach((d) => {
      if (
        d.salary_value &&
        d.salary_currency === "USD" &&
        d.salary_type === "annual" &&
        d.salary_value > 10000
      ) {
        if (!groups.has(d.seniority_level)) groups.set(d.seniority_level, []);
        groups.get(d.seniority_level).push(d.salary_value);
      }
    });

    // ordered levels with median salaries
    const careerOrder = [
      "entry",
      "junior",
      "mid",
      "senior",
      "lead",
      "principal",
      "executive",
    ];
    let plotData = [];

    groups.forEach((salaries, level) => {
      const lvl = level.toLowerCase();
      if (careerOrder.includes(lvl) && salaries.length >= 5) {
        plotData.push({
          level: lvl,
          median: d3.median(salaries),
        });
      }
    });

    plotData.sort(
      (a, b) => careerOrder.indexOf(a.level) - careerOrder.indexOf(b.level)
    );

    // Calcul du KPI
    const juniorData = plotData.find(
      (d) => d.level === "junior" || d.level === "entry"
    );
    const seniorData = plotData.find(
      (d) => d.level === "senior" || d.level === "lead"
    );
    if (juniorData && seniorData) {
      const multiplier = (seniorData.median / juniorData.median).toFixed(1);
      d3.select("#kpi-multiplier").text(`x${multiplier}`);
    } else {
      d3.select("#kpi-multiplier").text("N/A");
    }

    // 2. Configuration D3
    const container = d3.select(selector);
    const width = container.node().getBoundingClientRect().width;
    const height = 400;
    const margin = { top: 20, right: 30, bottom: 50, left: 60 };

    container.html("");
    const svg = container
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const x = d3
      .scaleBand()
      .domain(plotData.map((d) => d.level))
      .range([0, innerWidth])
      .padding(0.4);

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(plotData, (d) => d.median) * 1.1])
      .range([innerHeight, 0]);

    // Axes
    svg
      .append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .attr("class", "axis")
      .call(
        d3
          .axisBottom(x)
          .tickFormat((d) => d.charAt(0).toUpperCase() + d.slice(1))
      );

    svg
      .append("g")
      .attr("class", "axis")
      .call(d3.axisLeft(y).tickFormat((d) => `$${d / 1000}k`));

    // Tooltip
    let tooltip = d3.select(".d3-tooltip");
    if (tooltip.empty()) {
      tooltip = d3
        .select("body")
        .append("div")
        .attr("class", "d3-tooltip")
        .style("opacity", 0);
    }

    // animated bars
    svg
      .selectAll(".bar")
      .data(plotData)
      .enter()
      .append("rect")
      .attr("class", "bar")
      .attr("x", (d) => x(d.level))
      .attr("width", x.bandwidth())
      .attr("y", innerHeight)
      .attr("height", 0)
      .attr("fill", COLOR_ACCENT)
      .on("mouseover", (event, d) => {
        d3.select(event.currentTarget).attr("fill", "#fff");
        tooltip
          .style("opacity", 1)
          .html(
            `<strong>${d.level.toUpperCase()}</strong><br>Median: $${(
              d.median / 1000
            ).toFixed(0)}k`
          )
          .style("left", event.pageX + 15 + "px")
          .style("top", event.pageY - 28 + "px");
      })
      .on("mouseout", (event) => {
        d3.select(event.currentTarget).attr("fill", COLOR_ACCENT);
        tooltip.style("opacity", 0);
      })
      .transition()
      .duration(800)
      .delay((d, i) => i * 100)
      .attr("y", (d) => y(d.median))
      .attr("height", (d) => innerHeight - y(d.median));
  }
});
