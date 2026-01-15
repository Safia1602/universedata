document.addEventListener("DOMContentLoaded", () => {
  console.log("page3-tendances.js loaded .");
  //  1. CLUSTER INFO
  const clusterInfo = {
    0: {
      label: "Data Product & ML Analytics",
      desc: "Product-oriented, impact measurement, user modeling",
    },
    1: {
      label: "Generalist Data & AI",
      desc: "Versatile profiles, international tech stacks (AWS, Python, AI)",
    },
    2: {
      label: "BI & Reporting",
      desc: "Descriptive analysis, visualization (Tableau, PowerBI, Excel)",
    },
    3: {
      label: "ML & Cloud Engineering",
      desc: "Infrastructure, deployment, automation (Azure, MLOps)",
    },
    4: {
      label: "AI Strategy & Analytics Eng.",
      desc: "Hybrid roles: automation, AI strategy, and data engineering",
    },
    5: {
      label: "Junior / Entry-level Data",
      desc: "Accessible roles, reporting, data quality focus",
    },
  };

  //  2. CONFIGURATION
  const margin = { top: 80, right: 280, bottom: 40, left: 40 };
  const width = 1100;
  const height = 600;

  const colorScale = d3
    .scaleOrdinal()
    .domain([0, 1, 2, 3, 4, 5])
    .range(["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b"]);

  const theme = {
    bg: "#121212",
    textMain: "#e0e0e0",
    textSub: "#aaaaaa",
    tooltipBg: "rgba(30, 30, 30, 0.98)",
    tooltipBorder: "#333",
  };

  // SVG Container
  const svgContainer = d3
    .select("#viz-svd")
    .append("svg")
    .attr("viewBox", [0, 0, width, height])
    .style("font-family", "sans-serif")
    .style("background", theme.bg)
    .style("border", `1px solid #333`);

  //  3. TITLES AND CONTEXT
  svgContainer
    .append("text")
    .attr("x", width / 2)
    .attr("y", 35)
    .attr("text-anchor", "middle")
    .style("font-size", "24px")
    .style("font-weight", "bold")
    .style("fill", theme.textMain)
    .text("Data Jobs Landscape Map");

  // Subtitle
  svgContainer
    .append("text")
    .attr("x", width / 2)
    .attr("y", 60)
    .attr("text-anchor", "middle")
    .style("font-size", "15px")
    .style("fill", theme.textSub)
    .text(
      "Each dot is a job offer. The closer they are, the more similar their required skills."
    );

  // Main Chart Area
  const chartArea = svgContainer
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // Clip Path for Zoom
  svgContainer
    .append("defs")
    .append("clipPath")
    .attr("id", "chart-clip")
    .append("rect")
    .attr("width", width - margin.left - margin.right)
    .attr("height", height - margin.top - margin.bottom);

  const plotLayer = chartArea.append("g").attr("clip-path", "url(#chart-clip)");

  // TOOLTIP
  const tooltip = d3
    .select("body")
    .append("div")
    .attr("id", "tooltip-svd")
    .style("position", "absolute")
    .style("z-index", "10")
    .style("visibility", "hidden")
    .style("padding", "12px")
    .style("background", theme.tooltipBg)
    .style("color", theme.textMain)
    .style("border", `1px solid ${theme.tooltipBorder}`)
    .style("border-radius", "8px")
    .style("box-shadow", "0 4px 15px rgba(0,0,0,0.5)")
    .style("font-size", "13px")
    .style("max-width", "300px")
    .style("pointer-events", "none")
    .style("transition", "opacity 0.2s");

  //  4. LOAD DATA
  d3.csv("../data/clustered_jobs.csv")
    .then((data) => {
      data.forEach((d) => {
        d.svd_x = +d.svd_x;
        d.svd_y = +d.svd_y;
        d.cluster = +d.cluster;
      });

      // Scales
      const x = d3
        .scaleLinear()
        .domain(d3.extent(data, (d) => d.svd_x))
        .nice()
        .range([0, width - margin.left - margin.right]);

      const y = d3
        .scaleLinear()
        .domain(d3.extent(data, (d) => d.svd_y))
        .nice()
        .range([height - margin.top - margin.bottom, 0]);

      //  5. DRAW POINTS
      const circles = plotLayer
        .selectAll("circle")
        .data(data)
        .join("circle")
        .attr("cx", (d) => x(d.svd_x))
        .attr("cy", (d) => y(d.svd_y))
        .attr("r", 4.5)
        .attr("fill", (d) => colorScale(d.cluster))
        .attr("opacity", 0.8)
        .attr("stroke", theme.bg)
        .attr("stroke-width", 0.7);

      //  6. INTERACTIONS
      circles
        .on("mouseover", (event, d) => {
          d3.select(event.currentTarget)
            .transition()
            .duration(100)
            .attr("r", 12)
            .attr("stroke", theme.textMain)
            .attr("stroke-width", 2)
            .attr("opacity", 1);

          tooltip.style("visibility", "visible").style("opacity", 1).html(`
              <div style="font-weight:bold; font-size:15px; margin-bottom:4px; color:#fff">${
                d.title
              }</div>
              <div style="color:${theme.textSub}; margin-bottom:8px;">🏢 ${
            d.company
          }</div>
              <div style="padding-top:8px; border-top:1px solid #444; color:${colorScale(
                d.cluster
              )}">
                <strong>${clusterInfo[d.cluster].label}</strong><br>
                <em style="font-size:11px; color:#999">${
                  clusterInfo[d.cluster].desc
                }</em>
              </div>
            `);
        })
        .on("mousemove", (event) => {
          tooltip
            .style("top", event.pageY - 10 + "px")
            .style("left", event.pageX + 20 + "px");
        })
        .on("mouseout", (event) => {
          d3.select(event.currentTarget)
            .transition()
            .duration(200)
            .attr("r", 4.5)
            .attr("stroke", theme.bg)
            .attr("stroke-width", 0.7)
            .attr("opacity", 0.8);
          tooltip.style("visibility", "hidden").style("opacity", 0);
        });

      //  7. ZOOM
      const zoom = d3
        .zoom()
        .scaleExtent([0.5, 10])
        .extent([
          [0, 0],
          [
            width - margin.left - margin.right,
            height - margin.top - margin.bottom,
          ],
        ])
        .on("zoom", (e) => {
          const newX = e.transform.rescaleX(x);
          const newY = e.transform.rescaleY(y);
          circles
            .attr("cx", (d) => newX(d.svd_x))
            .attr("cy", (d) => newY(d.svd_y));
        });
      svgContainer.call(zoom);

      //  8. LEGEND
      const legend = svgContainer
        .append("g")
        .attr(
          "transform",
          `translate(${width - margin.right + 30}, ${margin.top + 20})`
        );

      legend
        .append("text")
        .attr("x", 0)
        .attr("y", -15)
        .style("font-weight", "bold")
        .style("font-size", "14px")
        .style("fill", theme.textMain)
        .text("Interpreted Profiles:");

      const legendItems = legend
        .selectAll(".legend-item")
        .data([0, 1, 2, 3, 4, 5])
        .enter()
        .append("g")
        .attr("class", "legend-item")
        .attr("transform", (d, i) => `translate(0, ${i * 60})`);

      legendItems
        .append("circle")
        .attr("r", 8)
        .attr("fill", (d) => colorScale(d));

      legendItems
        .append("text")
        .attr("x", 15)
        .attr("y", 5)
        .style("font-weight", "bold")
        .style("font-size", "13px")
        .style("fill", (d) => colorScale(d))
        .text((d) => clusterInfo[d].label);

      legendItems
        .append("foreignObject")
        .attr("x", 15)
        .attr("y", 10)
        .attr("width", 230)
        .attr("height", 45)
        .append("xhtml:div")
        .style("font-size", "11px")
        .style("color", theme.textSub)
        .style("line-height", "1.3")
        .html((d) => clusterInfo[d].desc);
    })
    .catch((error) => {
      console.error("Error loading CSV:", error);
      d3.select("#viz-svd").html(
        "<p style='color:#d9534f; padding:20px; text-align:center;'>Failed to load data. Please check 'clustered_jobs.csv'.</p>"
      );
    });
});
