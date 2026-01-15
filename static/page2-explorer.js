document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM chargé. Lancement de page2-explorer.js (v3 - Checkboxes)");

  let allJobs = [];
  const dataPath =
    window.API && window.API.jobs ? window.API.jobs : "/api/jobs";

  const filterInputs = {
    text: document.getElementById("filter-text"),
    salary: document.getElementById("filter-salary"),
    hybrid: document.getElementById("filter-hybrid"),
    visa: document.getElementById("filter-visa"),
  };
  const filterGroups = {
    country: document.getElementById("filter-country"),
    skills: document.getElementById("filter-skills"),
    seniority: document.getElementById("filter-seniority"),
    domain: document.getElementById("filter-domain"),
  };
  const salaryValueLabel = document.getElementById("salary-value");
  const resultsCount = document.getElementById("results-count");
  const jobList = document.getElementById("job-list");
  const modalBackdrop = document.getElementById("modal-backdrop");
  const modal = document.getElementById("job-modal");
  const modalContent = document.getElementById("modal-content");
  const modalCloseBtn = document.getElementById("modal-close-btn");
  const resetFiltersBtn = document.getElementById("reset-filters");

  fetch(dataPath)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((data) => {
      console.log(`Data loaded successfully from ${dataPath}!`, data[0]);

      allJobs = data.map((d) => ({
        ...d,
        id: +d.id,
        salary_value: d.salary ? +d.salary : null,
        hybrid_policy:
          d.hybrid === true || d.hybrid === "True" || d.hybrid === "true",
        visa_sponsorship:
          d.visa === true || d.visa === "True" || d.visa === "true",
        technical_skills: parseListString(d.technical_skills),
        tools_used: parseListString(d.tools),
        domains: parseListString(d.domains),
        soft_skills: parseListString(d.soft_skills),
        tasks: parseListString(d.tasks),
        benefits: parseListString(d.benefits),
        seniority_level: d.seniority || "Not specified",
        country: d.country || "Not specified",
        description: d.description || "No description provided.",
        link: d.link || "",
        source: d.source || "",
      }));

      console.log("Données traitées. Total :", allJobs.length);
      populateFilters(allJobs);
      updateResults();
      setupListeners();
    })
    .catch((error) => {
      console.error(
        `Erreur lors du chargement des données depuis ${dataPath}:`,
        error
      );
      resultsCount.innerText = "Error loading data. Please refresh.";
    });

  function parseListString(listString) {
    if (!listString || listString === "[]") return [];
    return listString
      .replace(/[\[\]']/g, "")
      .split(/;|,|\|/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  function getUniqueValues(data, column, isList = false) {
    const valueSet = new Set();
    data.forEach((d) => {
      if (isList) {
        if (Array.isArray(d[column])) {
          d[column].forEach((item) => valueSet.add(item));
        }
      } else {
        if (d[column]) valueSet.add(d[column]);
      }
    });
    return Array.from(valueSet).sort();
  }

  function getCheckedValues(container) {
    const checkedInputs = container.querySelectorAll(
      'input[type="checkbox"]:checked'
    );
    return Array.from(checkedInputs).map((input) => input.value);
  }

  function populateFilters(data) {
    const createCheckboxes = (container, values) => {
      container.innerHTML = "";
      values.forEach((val) => {
        const item = document.createElement("div");
        item.className = "filter-item";
        const escapedVal = val.replace(/"/g, "&quot;");
        item.innerHTML = `
                    <label>
                        <input type="checkbox" value="${escapedVal}">
                        ${val}
                    </label>
                `;
        container.appendChild(item);
      });
    };

    createCheckboxes(filterGroups.country, getUniqueValues(data, "country"));
    createCheckboxes(
      filterGroups.skills,
      getUniqueValues(data, "technical_skills", true)
    );
    createCheckboxes(
      filterGroups.seniority,
      getUniqueValues(data, "seniority_level")
    );
    createCheckboxes(
      filterGroups.domain,
      getUniqueValues(data, "domains", true)
    );

    console.log("Filtres (checkboxes) remplis.");
  }

  function updateResults() {
    const f_text = filterInputs.text.value.toLowerCase();
    const f_salary = +filterInputs.salary.value;
    const f_hybrid = filterInputs.hybrid.checked;
    const f_visa = filterInputs.visa.checked;

    const f_countries = getCheckedValues(filterGroups.country);
    const f_skills = getCheckedValues(filterGroups.skills);
    const f_seniorities = getCheckedValues(filterGroups.seniority);
    const f_domains = getCheckedValues(filterGroups.domain);

    const filteredJobs = allJobs.filter((job) => {
      const textMatch =
        f_text === "" ||
        job.title.toLowerCase().includes(f_text) ||
        job.description.toLowerCase().includes(f_text);

      const salaryMatch =
        f_salary === 0 || (job.salary_value && job.salary_value >= f_salary);
      const hybridMatch = !f_hybrid || job.hybrid_policy === true;
      const visaMatch = !f_visa || job.visa_sponsorship === true;
      const countryMatch =
        f_countries.length === 0 || f_countries.includes(job.country);
      const seniorityMatch =
        f_seniorities.length === 0 ||
        f_seniorities.includes(job.seniority_level);
      const skillMatch =
        f_skills.length === 0 ||
        f_skills.every((skill) => job.technical_skills.includes(skill));
      const domainMatch =
        f_domains.length === 0 ||
        f_domains.some((domain) => job.domains.includes(domain));

      return (
        textMatch &&
        salaryMatch &&
        hybridMatch &&
        visaMatch &&
        countryMatch &&
        seniorityMatch &&
        skillMatch &&
        domainMatch
      );
    });

    renderJobs(filteredJobs);
  }

  function renderJobs(jobs) {
    resultsCount.innerText = `${jobs.length} jobs found. Showing Top 10.`;
    jobList.innerHTML = "";
    const top10Jobs = jobs.slice(0, 10);

    if (top10Jobs.length === 0) {
      jobList.innerHTML =
        '<p style="color: var(--gray);">No jobs match your criteria. Try removing some filters.</p>';
      return;
    }

    top10Jobs.forEach((job) => {
      const card = document.createElement("div");
      card.className = "card job-card";
      card.dataset.jobId = job.id;
      const salaryText = job.salary_value
        ? `$${job.salary_value.toLocaleString()}`
        : "Not specified";
      const skillsHtml = job.technical_skills
        .slice(0, 5)
        .map((skill) => `<span class="skill-tag">${skill}</span>`)
        .join("");
      card.innerHTML = `
                <h3>${job.title}</h3>
                <div class="company">${job.company || "Confidential"}</div>
                <div class="location">${job.location || "Not specified"}</div>
                <div class="salary">${salaryText}</div>
                <div class="skills-preview">${skillsHtml}</div>
            `;
      jobList.appendChild(card);
    });
  }

  function showModal(jobId) {
    const job = allJobs.find((j) => j.id === jobId);
    if (!job) return;
    const skillsHtml = job.technical_skills
      .map((skill) => `<span class="skill-tag">${skill}</span>`)
      .join("");
    const toolsHtml = job.tools_used
      .map((tool) => `<span class="skill-tag">${tool}</span>`)
      .join("");
    const benefitsHtml = job.benefits.map((b) => `<li>${b}</li>`).join("");
    const linkHtml = job.link
      ? `<a href="${
          job.link
        }" target="_blank" rel="noopener noreferrer">View Original Post${
          job.source ? " on " + job.source : ""
        }</a>`
      : "";

    modalContent.innerHTML = `
            <h2>${job.title}</h2>
            <h3>${job.company} - ${job.location}</h3>
            ${linkHtml}
            <h4 style="margin-top: 1.5rem; color: var(--accent);">Full Description</h4>
            <div class="modal-description">${job.description}</div>
            ${
              skillsHtml.length > 0
                ? `<h4 style="color: var(--accent);">Technical Skills</h4><div class="modal-tags">${skillsHtml}</div>`
                : ""
            }
            ${
              toolsHtml.length > 0
                ? `<h4 style="color: var(--accent);">Tools Mentioned</h4><div class="modal-tags">${toolsHtml}</div>`
                : ""
            }
            ${
              benefitsHtml.length > 0
                ? `<h4 style="color: var(--accent);">Benefits</h4><ul>${benefitsHtml}</ul>`
                : ""
            }
        `;
    modal.classList.remove("hidden");
    modalBackdrop.classList.remove("hidden");
  }

  function hideModal() {
    modal.classList.add("hidden");
    modalBackdrop.classList.add("hidden");
    modalContent.innerHTML = "";
  }

  // event listeners setup

  function setupListeners() {
    Object.values(filterInputs).forEach((filter) => {
      filter.addEventListener("input", updateResults);
    });
    Object.values(filterGroups).forEach((group) => {
      group.addEventListener("input", updateResults);
    });
    filterInputs.salary.addEventListener("input", () => {
      salaryValueLabel.innerText = `$${(
        +filterInputs.salary.value / 1000
      ).toFixed(0)}k`;
    });
    resetFiltersBtn.addEventListener("click", () => {
      filterInputs.text.value = "";
      filterInputs.salary.value = 0;
      salaryValueLabel.innerText = "$0k";
      filterInputs.hybrid.checked = false;
      filterInputs.visa.checked = false;
      document
        .querySelectorAll('.filter-list input[type="checkbox"]')
        .forEach((cb) => (cb.checked = false));
      updateResults();
    });
    modalCloseBtn.addEventListener("click", hideModal);
    modalBackdrop.addEventListener("click", hideModal);
    jobList.addEventListener("click", (event) => {
      const card = event.target.closest(".job-card");
      if (card && card.dataset.jobId) {
        showModal(+card.dataset.jobId);
      }
    });
    console.log("Tous les écouteurs (v3) sont en place.");
  }
});
