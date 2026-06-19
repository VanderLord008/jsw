document.addEventListener("DOMContentLoaded", () => {
  // --- Scale Configuration ---
  const BASE_SCALE_WEEKLY = 150; // base day width with no splits
  const SCALE_QUARTERLY = 12; // 1 day = 12 pixels (approx 3 months visible by default)
  const TREE_NODE_W = 120; // fixed width for each node in a split tree
  const TREE_GAP = 40; // horizontal gap between tree levels
  const LEAF_SPACING = 50; // vertical spacing between leaf-level nodes

  // --- State ---
  let startDate = new Date(document.getElementById("start-date").value);
  let endDate = new Date(document.getElementById("end-date").value);
  let currentMode = "quarterly";
  let onboardingStep = 0; // 0: need channels, 1: need init, 2: need tactic, 3: done
  let connections = [];
  let nodesData = []; // The single source of truth for all placed tactics
  let dayWidths = []; // pixel width for each day (variable for split days)
  let dayStartX = []; // prefix sums: x position where each day starts

  const AVAILABLE_CHANNELS = [
    { id: "field-promotion", name: "Field / Personal Promotion" },
    { id: "digital-remote", name: "Digital & Remote" },
    { id: "pharmacy", name: "Pharmacy" },
    { id: "print", name: "Print & Literature" },
    { id: "social", name: "Social Media" },
    { id: "tv", name: "TV & Broadcast" },
  ];
  let activeChannels = [];
  let initiatives = [];

  let phases = [];
  let recommendationData = null;
  let pendingRecommendation = null; // Stores data for the Accept button

  const tacticNames = {
    webinar: "Webinar",
    tv: "TV Advertising",
    "pharmacy-act": "In-Pharmacy Activation",
    "pharmacy-pro": "Pharmacy Promo",
    "rep-calls": "Pharmacy Rep Calls",
    hta: "HTA Materials",
  };

  // Fetch Recommendation Data
  fetch("dummy.json")
    .then((res) => res.json())
    .then((data) => {
      recommendationData = data;
      updateLayout();
    })
    .catch((err) => console.error("Failed to load recommendation data:", err));

  const specialtySelector = document.getElementById("specialty-selector");
  if (specialtySelector) {
    specialtySelector.addEventListener("change", () => {
      updateLayout();
    });
  }

  const toggleRecommendations = document.getElementById(
    "toggle-recommendations",
  );
  if (toggleRecommendations) {
    toggleRecommendations.addEventListener("change", () => {
      updateLayout();
    });
  }

  // Accept Suggestion button handler
  document
    .getElementById("copilot-accept-btn")
    .addEventListener("click", () => {
      if (!pendingRecommendation) return;
      const rec = pendingRecommendation;

      // Determine proper duration
      let duration = 1;
      if (currentMode === "quarterly") {
        const d = new Date(rec.timestamp);
        duration = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      }

      // Create real node from the recommendation
      const newNode = {
        id: "node-" + Math.random().toString(36).substring(2, 9),
        laneId: rec.laneId,
        type: rec.type,
        name: tacticNames[rec.type] || rec.type,
        timestamp: rec.timestamp,
        durationDays: duration,
        isStandalone: currentMode === "weekly",
      };
      nodesData.push(newNode);

      // Create real connection if recommended
      if (rec.sourceId && rec.connectionType) {
        connections.push({
          sourceId: rec.sourceId,
          targetId: newNode.id,
          type: rec.connectionType,
        });
      }

      pendingRecommendation = null;
      updateLayout();
    });

  // --- Hour Calculation Helpers ---
  function calculateNodeHours(node) {
    let min = 0,
      max = 0;
    if (node.serviceLines) {
      node.serviceLines.forEach((sl) => {
        if (sl.size === "S") {
          min += 8;
          max += 16;
        } else if (sl.size === "M") {
          min += 16;
          max += 24;
        } else if (sl.size === "L") {
          min += 24;
          max += 40;
        }
      });
    }
    return { min, max };
  }

  function getInitiativeHours(initId) {
    let min = 0,
      max = 0;
    nodesData.forEach((node) => {
      if (node.initiativeId === initId) {
        const hrs = calculateNodeHours(node);
        min += hrs.min;
        max += hrs.max;
      }
    });
    return { min, max };
  }

  function formatHours(hrs) {
    if (hrs.min === 0 && hrs.max === 0) return "0 hours";
    if (hrs.min === hrs.max) return `${hrs.min} hours`;
    return `${hrs.min}-${hrs.max} hours`;
  }

  function updateJourneyHoursDisplay() {
    let min = 0,
      max = 0;
    nodesData.forEach((node) => {
      const hrs = calculateNodeHours(node);
      min += hrs.min;
      max += hrs.max;
    });
    const display = document.getElementById("journey-name-display");
    if (display) {
      display.innerText = `test454 - ${formatHours({ min, max })}`;
    }
  }

  // --- DOM Elements ---
  const gridHeader = document.getElementById("grid-header");
  const svgCanvas = document.getElementById("connection-canvas");
  const viewSelector = document.getElementById("view-selector");
  const gridContainer = document.getElementById("grid-container");
  const lanesContainer = document.getElementById("lanes-container");
  const emptyState = document.getElementById("empty-state");

  // Initialize Layout
  updateLayout();

  // --- 1. Top Bar Listeners ---
  document.getElementById("start-date").addEventListener("change", (e) => {
    startDate = new Date(e.target.value);
    if (startDate >= endDate) {
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 30);
      document.getElementById("end-date").value = endDate
        .toISOString()
        .split("T")[0];
    }
    updateLayout();
  });

  document.getElementById("end-date").addEventListener("change", (e) => {
    endDate = new Date(e.target.value);
    updateLayout();
  });

  viewSelector.addEventListener("change", (e) => {
    currentMode = e.target.value;
    if (currentMode === "quarterly") {
      gridContainer.classList.add("quarterly-mode");
    } else {
      gridContainer.classList.remove("quarterly-mode");
    }
    updateLayout();
  });

  // --- Phase Management ---
  const phasesModal = document.getElementById("phases-modal");
  document.getElementById("manage-phases-btn").addEventListener("click", () => {
    renderPhasesList();
    phasesModal.style.display = "flex";
  });

  document
    .getElementById("close-phases-modal-btn")
    .addEventListener("click", () => {
      phasesModal.style.display = "none";
      updateLayout();
    });

  document
    .getElementById("add-phase-submit-btn")
    .addEventListener("click", () => {
      const name = document.getElementById("new-phase-name").value;
      const start = document.getElementById("new-phase-start").value;
      const end = document.getElementById("new-phase-end").value;
      const color = document.getElementById("new-phase-color").value;

      if (name && start && end) {
        phases.push({
          id: "phase-" + Date.now(),
          name,
          start,
          end,
          color: color + "20",
        }); // 20 is hex for ~12% opacity
        document.getElementById("new-phase-name").value = "";
        document.getElementById("new-phase-start").value = "";
        document.getElementById("new-phase-end").value = "";
        renderPhasesList();
        updateLayout();
      }
    });

  function renderPhasesList() {
    const list = document.getElementById("phases-list");
    if (!list) return;
    if (phases.length === 0) {
      list.innerHTML =
        '<div style="color: #64748b; font-style: italic;">No phases created yet.</div>';
      return;
    }
    list.innerHTML = phases
      .map(
        (p) => `
            <div class="phase-item">
                <div>
                    <span class="phase-color-dot" style="background: ${p.color.substring(0, 7)}"></span>
                    <strong>${p.name}</strong>
                    <div style="font-size: 11px; color: #64748b; margin-top: 4px;">${p.start} to ${p.end}</div>
                </div>
                <button class="delete-phase-btn" data-phase-id="${p.id}" style="background: none; border: none; cursor: pointer;">🗑️</button>
            </div>
        `,
      )
      .join("");

    // Attach delete listeners via event delegation
    list.querySelectorAll(".delete-phase-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-phase-id");
        phases = phases.filter((p) => p.id !== id);
        renderPhasesList();
        updateLayout();
      });
    });
  }

  // --- 2. Drag & Drop Initialization ---
  document.querySelectorAll(".tactic-item").forEach((tactic) => {
    tactic.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("type", tactic.dataset.type);
      // Get just the text node (ignoring the icon span)
      const textNode = Array.from(tactic.childNodes).find(
        (n) => n.nodeType === 3 && n.textContent.trim().length > 0,
      );
      e.dataTransfer.setData(
        "name",
        textNode ? textNode.textContent.trim() : tactic.innerText,
      );
    });
  });

  // Event delegation for dynamically added dropzones and placeholders
  gridContainer.addEventListener("dragover", (e) => {
    const dropTarget =
      e.target.closest(".lane-dropzone") || e.target.closest(".placeholder");
    if (!dropTarget) return;
    e.preventDefault();
    dropTarget.classList.add("drag-over");
  });

  gridContainer.addEventListener("dragleave", (e) => {
    const dropTarget =
      e.target.closest(".lane-dropzone") || e.target.closest(".placeholder");
    if (dropTarget) dropTarget.classList.remove("drag-over");
  });

  gridContainer.addEventListener("drop", (e) => {
    const placeholder = e.target.closest(".placeholder");
    const zone = e.target.closest(".lane-dropzone");
    if (!placeholder && !zone) return;

    e.preventDefault();
    if (placeholder) placeholder.classList.remove("drag-over");
    if (zone) zone.classList.remove("drag-over");

    const type = e.dataTransfer.getData("type");
    const name = e.dataTransfer.getData("name");
    const existingId = e.dataTransfer.getData("existing-id");
    if (!name && !existingId) return;

    // If dropped onto a placeholder (converting it)
    if (placeholder && !existingId) {
      e.stopPropagation();
      const data = nodesData.find((n) => n.id === placeholder.id);
      if (data) {
        data.type = type;
        data.name = name;
        data.isPlaceholder = false;
        updateLayout();
      }
      return;
    }

    if (!zone) return;

    // THE FIX: Clean, exact coordinate math.
    // This gets the absolute pixel position purely inside the dropzone, ignoring scroll and labels.
    const zoneRect = zone.getBoundingClientRect();
    const actualDropX = Math.max(0, e.clientX - zoneRect.left);

    // Calculate exact date based on the current scale
    const dropDayIdx = xPositionToDay(actualDropX);
    const daysOffset = dropDayIdx;

    let dropDate = new Date(
      startDate.getFullYear(),
      startDate.getMonth(),
      startDate.getDate(),
    );
    dropDate.setDate(dropDate.getDate() + daysOffset);

    let nodeTimestamp = dropDate.getTime();
    let nodeDuration = 1;

    if (currentMode === "quarterly") {
      // Snap to the first day of the month and span the entire month
      const dropMonth = dropDate.getMonth();
      const dropYear = dropDate.getFullYear();
      const firstDayOfMonth = new Date(dropYear, dropMonth, 1);
      const daysInMonth = new Date(dropYear, dropMonth + 1, 0).getDate();

      nodeTimestamp = firstDayOfMonth.getTime();
      nodeDuration = daysInMonth;
    }

    if (existingId) {
      // Move existing node
      const existingNode = nodesData.find((n) => n.id === existingId);
      if (existingNode) {
        // If it's not standalone, update its duration when moving in quarterly
        if (currentMode === "quarterly" && !existingNode.isStandalone) {
          existingNode.durationDays = nodeDuration;
          existingNode.timestamp = nodeTimestamp;

          // Don't shift children blindly if we snapped to month,
          // just let them flow normally or we'd need complex logic.
        } else {
          const timeDelta = nodeTimestamp - existingNode.timestamp;

          // Recursive function to shift timestamp of all children
          function shiftTree(nodeId, delta) {
            const node = nodesData.find((n) => n.id === nodeId);
            if (!node) return;
            node.timestamp += delta;
            if (node.splitChildIds) {
              node.splitChildIds.forEach((childId) =>
                shiftTree(childId, delta),
              );
            }
          }

          shiftTree(existingId, timeDelta);
        }

        existingNode.laneId = zone.parentElement.id; // Only the dragged node changes lane
      }
    } else {
      // Create new node
      const newNode = {
        id: "node-" + Math.random().toString(36).substring(2, 9),
        laneId: zone.parentElement.id,
        type: type,
        name: name,
        timestamp: nodeTimestamp,
        durationDays: nodeDuration,
        isStandalone: currentMode === "weekly", // Tracks if it's restricted to a single day
      };

      nodesData.push(newNode);
    }

    // --- Vertical Stack Reordering ---
    const targetNode = existingId
      ? nodesData.find((n) => n.id === existingId)
      : nodesData[nodesData.length - 1];
    if (targetNode) {
      // Find all nodes in this lane that overlap horizontally
      const laneNodes = nodesData.filter((n) => n.laneId === targetNode.laneId);

      const overlapNodes = laneNodes.filter((n) => {
        if (n.id === targetNode.id) return false;
        const nStart = n.timestamp;
        const nEnd = n.timestamp + n.durationDays * 24 * 60 * 60 * 1000;
        const tStart = targetNode.timestamp;
        const tEnd =
          targetNode.timestamp + targetNode.durationDays * 24 * 60 * 60 * 1000;
        return nStart < tEnd && nEnd > tStart;
      });

      if (overlapNodes.length > 0) {
        // Sort overlapping nodes by their current visual Y position
        overlapNodes.sort((a, b) => (a.computedY || 0) - (b.computedY || 0));

        const zoneRect = zone.getBoundingClientRect();
        const actualDropY = e.clientY - zoneRect.top;

        let insertIndex = overlapNodes.length;
        for (let i = 0; i < overlapNodes.length; i++) {
          if (actualDropY < (overlapNodes[i].computedY || 0) + 20) {
            // middle of a typical 40px node
            insertIndex = i;
            break;
          }
        }

        overlapNodes.splice(insertIndex, 0, targetNode);

        // Assign sequential verticalSortIndex
        overlapNodes.forEach((n, idx) => {
          n.verticalSortIndex = idx;
        });
      }
    }

    updateLayout();
  });

  // Handle node clicks and deletion
  gridContainer.addEventListener("click", (e) => {
    if (e.target.classList.contains("delete-btn")) {
      const nodeId = e.target.parentElement.id;
      deleteNodeData(nodeId);
    } else if (
      e.target.closest(".add-rule-btn") ||
      e.target.closest(".rule-block")
    ) {
      const el =
        e.target.closest(".add-rule-btn") || e.target.closest(".rule-block");
      const connIdx = el.dataset.index;
      openRuleModal(connIdx);
    }
  });

  function deleteNodeData(nodeId) {
    // Remove node
    nodesData = nodesData.filter((n) => n.id !== nodeId);

    // Clean up connections
    connections = connections.filter(
      (c) => c.sourceId !== nodeId && c.targetId !== nodeId,
    );

    // Clean up parent references if it was a child
    nodesData.forEach((n) => {
      if (n.splitChildIds) {
        n.splitChildIds = n.splitChildIds.filter((id) => id !== nodeId);
      }
    });

    updateLayout();
  }

  // --- 3. Rendering the Physical Node & Resizing Logic ---
  const typeIcons = {
    webinar: "💻",
    tv: "📺",
    "pharmacy-act": "🏥",
    "pharmacy-pro": "💊",
    hta: "📄",
    "rep-calls": "🤝",
  };

  function renderNodeDOM(data, container) {
    const div = document.createElement("div");
    div.id = data.id;

    const icon = typeIcons[data.type] || "📌";

    if (data.isPlaceholder) {
      div.className = "canvas-node placeholder";
      div.innerHTML = `<div class="node-content"><span class="node-name">${data.name}</span></div><div class="delete-btn">×</div>`;
    } else if (data.isGhost) {
      div.className = "canvas-node ghost";
      div.innerHTML = `<div class="node-content"><span class="node-icon">${icon}</span> <span class="node-name">${data.name}</span></div>`;
    } else {
      div.className = "canvas-node";
      div.innerHTML = `<div class="node-content"><span class="node-icon">${icon}</span> <span class="node-name">${data.name}</span></div><div class="delete-btn">×</div><div class="resize-handle"></div>`;
      div.setAttribute("draggable", "true");

      // Apply initiative color if assigned
      if (data.initiativeId) {
        const init = initiatives.find((i) => i.id === data.initiativeId);
        if (init) {
          div.style.backgroundColor = init.color;
          div.style.color = "#fff";
          div.style.border = `1px solid ${init.color}`;
          // Improve visibility of text/delete btn on dark backgrounds
          div.querySelector("span").style.textShadow =
            "0 1px 2px rgba(0,0,0,0.5)";
        }
      }

      // Drag start for existing nodes
      div.addEventListener("dragstart", (e) => {
        e.stopPropagation();
        e.dataTransfer.setData("type", data.type);
        e.dataTransfer.setData("name", data.name);
        e.dataTransfer.setData("existing-id", data.id);
      });

      const resizer = div.querySelector(".resize-handle");
      resizer.addEventListener("mousedown", (e) => {
        e.stopPropagation(); // Stops connection drawing
        e.preventDefault(); // Prevents HTML5 drag from initiating!

        div.setAttribute("draggable", "false"); // Extra safety

        let startX = e.clientX;
        let startWidth = div.offsetWidth;
        div.classList.add("dragging-resize");

        function onMouseMove(moveEvent) {
          let newWidth = Math.max(
            120,
            startWidth + (moveEvent.clientX - startX),
          );
          div.style.width = `${newWidth}px`;
          redrawConnections(); // Keep lines attached
        }

        function onMouseUp() {
          div.classList.remove("dragging-resize");
          div.setAttribute("draggable", "true");

          // Calculate how many days wide this is now
          const finalWidth = div.offsetWidth;

          if (currentMode === "weekly") {
            data.durationDays = Math.max(
              1,
              Math.round(finalWidth / BASE_SCALE_WEEKLY),
            );
          } else if (currentMode === "quarterly") {
            const endX = data.computedX + finalWidth;
            const endDayIdx = xPositionToDay(endX);
            const dayMs = 1000 * 60 * 60 * 24;

            // We use the global startDate to map index back to Date
            const targetDate = new Date(
              startDate.getTime() + endDayIdx * dayMs,
            );

            // We want to snap to the end of the target month
            const targetMonthEnd = new Date(
              targetDate.getFullYear(),
              targetDate.getMonth() + 1,
              0,
            );

            // The duration is the difference from the tactic's current start date to the end of that month
            const tacticStart = new Date(data.timestamp);
            const newDuration =
              Math.round(
                (targetMonthEnd.getTime() - tacticStart.getTime()) / dayMs,
              ) + 1;
            data.durationDays = Math.max(1, newDuration);
          }

          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);
          updateLayout(); // Snap to grid & run collisions
        }

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
      });
    }

    container.appendChild(div);
  }

  // --- 3b. Decision Split Logic ---
  function createSplitChild(parentData) {
    return {
      id: "node-" + Math.random().toString(36).substring(2, 9),
      laneId: parentData.laneId,
      type: "placeholder",
      name: "Drop tactic here",
      // Spawn on the end date of the stretched parent
      timestamp:
        parentData.timestamp +
        Math.max(0, parentData.durationDays - 1) * 24 * 60 * 60 * 1000,
      durationDays: 1,
      isPlaceholder: true,
      splitParentId: parentData.id,
    };
  }

  function handleDecisionSplit(parentEl) {
    const parentData = nodesData.find((n) => n.id === parentEl.id);
    if (!parentData) return;

    if (!parentData.splitChildIds) parentData.splitChildIds = [];

    if (parentData.splitChildIds.length === 0) {
      // First split: create two children
      const child1 = createSplitChild(parentData);
      const child2 = createSplitChild(parentData);

      parentData.splitChildIds.push(child1.id, child2.id);
      nodesData.push(child1, child2);

      connections.push({
        sourceId: parentData.id,
        targetId: child1.id,
        type: "decision",
      });
      connections.push({
        sourceId: parentData.id,
        targetId: child2.id,
        type: "decision",
      });
    } else {
      // Subsequent splits: add one more child
      const newChild = createSplitChild(parentData);

      parentData.splitChildIds.push(newChild.id);
      nodesData.push(newChild);

      connections.push({
        sourceId: parentData.id,
        targetId: newChild.id,
        type: "decision",
      });
    }

    updateLayout();
    checkOnboarding();
  }

  // --- 4. Tree Metric Helpers ---
  function getMaxTreeDepth(nodeId, depth) {
    depth = depth || 0;
    const node = nodesData.find((n) => n.id === nodeId);
    if (!node || !node.splitChildIds || node.splitChildIds.length === 0)
      return depth;
    let maxD = depth;
    for (const cid of node.splitChildIds) {
      maxD = Math.max(maxD, getMaxTreeDepth(cid, depth + 1));
    }
    return maxD;
  }

  function getLeafCount(nodeId) {
    const node = nodesData.find((n) => n.id === nodeId);
    if (!node || !node.splitChildIds || node.splitChildIds.length === 0)
      return 1;
    let count = 0;
    for (const cid of node.splitChildIds) {
      count += getLeafCount(cid);
    }
    return count;
  }

  function getXForDay(idx, daysTotal) {
    const baseW =
      currentMode === "weekly" ? BASE_SCALE_WEEKLY : SCALE_QUARTERLY;
    if (idx < 0) return idx * baseW;
    if (idx > daysTotal)
      return dayStartX[daysTotal] + (idx - daysTotal) * baseW;
    return dayStartX[idx];
  }

  function computeDayLayout() {
    const start = new Date(
      startDate.getFullYear(),
      startDate.getMonth(),
      startDate.getDate(),
    );
    const end = new Date(
      endDate.getFullYear(),
      endDate.getMonth(),
      endDate.getDate(),
    );
    const dayMs = 1000 * 60 * 60 * 24;
    const daysTotal = Math.max(1, Math.round((end - start) / dayMs));

    let dynamicQuarterlyScale = SCALE_QUARTERLY;
    if (currentMode === "quarterly") {
      const gridWidth = document.getElementById("grid-container").clientWidth;
      // 200px is the lane label width. We want 3 months (~91.5 days) to fit the remaining space.
      const availableSpace = Math.max(900, gridWidth - 200);
      dynamicQuarterlyScale = availableSpace / 91.5;
    }

    const baseW =
      currentMode === "weekly" ? BASE_SCALE_WEEKLY : dynamicQuarterlyScale;
    const minNodeW = currentMode === "weekly" ? 120 : 70;

    function walkDescendantsOnSameDay(nodeId, targetDayIdx) {
      const node = nodesData.find((x) => x.id === nodeId);
      if (!node || !node.splitChildIds) return 0;
      let maxD = 0;
      for (const cid of node.splitChildIds) {
        const child = nodesData.find((x) => x.id === cid);
        if (child) {
          const childStartDayIdx = Math.floor(
            (child.timestamp - start.getTime()) / dayMs,
          );
          if (childStartDayIdx === targetDayIdx) {
            maxD = Math.max(
              maxD,
              1 + walkDescendantsOnSameDay(cid, targetDayIdx),
            );
          }
        }
      }
      return maxD;
    }

    // Build per-day extra-width map from split trees
    const splitDayExtra = {};

    nodesData.forEach((n) => {
      if (n.splitChildIds && n.splitChildIds.length > 0) {
        const startDayIdx = Math.floor((n.timestamp - start.getTime()) / dayMs);
        const lastDayIdx = startDayIdx + n.durationDays - 1;

        const descendants = walkDescendantsOnSameDay(n.id, lastDayIdx);
        const totalNodes = 1 + descendants;
        const requiredSpace = totalNodes * minNodeW + descendants * TREE_GAP;
        const extra = Math.max(0, requiredSpace - baseW);

        if (lastDayIdx >= 0 && lastDayIdx <= daysTotal) {
          splitDayExtra[lastDayIdx] = Math.max(
            splitDayExtra[lastDayIdx] || 0,
            extra,
          );
        }
      }
    });

    // Build per-day density map: count tactics starting on each day (across all lanes)
    // This widens columns where many tactics cluster, giving lines room to breathe
    const dayDensity = {};
    nodesData.forEach((n) => {
      const dayIdx = Math.floor((n.timestamp - start.getTime()) / dayMs);
      if (dayIdx >= 0 && dayIdx <= daysTotal) {
        dayDensity[dayIdx] = (dayDensity[dayIdx] || 0) + 1;
      }
    });

    // Also count connections that pass through each day (source-day to target-day range)
    // This ensures columns with heavy line traffic get extra width
    connections.forEach((conn) => {
      const srcNode = nodesData.find((n) => n.id === conn.sourceId);
      const tgtNode = nodesData.find((n) => n.id === conn.targetId);
      if (!srcNode || !tgtNode) return;
      const srcDay = Math.floor((srcNode.timestamp - start.getTime()) / dayMs);
      const tgtDay = Math.floor((tgtNode.timestamp - start.getTime()) / dayMs);
      const lo = Math.max(0, Math.min(srcDay, tgtDay));
      const hi = Math.min(daysTotal, Math.max(srcDay, tgtDay));
      // Add a fractional density for transit days (not start/end)
      for (let d = lo + 1; d < hi; d++) {
        dayDensity[d] = (dayDensity[d] || 0) + 0.3;
      }
    });

    // Minimum width per tactic in a dense column (quarterly only)
    const densityMinW = currentMode === "weekly" ? 0 : 15;

    dayWidths = [];
    dayStartX = [0];
    for (let i = 0; i <= daysTotal; i++) {
      let w = baseW + (splitDayExtra[i] || 0);

      // Month Separator Logic (Gap between months)
      let monthGap = 0;
      if (currentMode === "quarterly" && i > 0) {
        const currDay = new Date(
          start.getFullYear(),
          start.getMonth(),
          start.getDate() + i,
        );
        if (currDay.getDate() === 1) {
          monthGap = 15; // 15 pixel wide separator
        }
      }

      if (monthGap > 0) {
        dayStartX[i] += monthGap;
      }

      // Density widening: if >1 tactic on this day, widen proportionally
      const density = dayDensity[i] || 0;
      if (density > 1) {
        const densityExtra = Math.ceil(density) * densityMinW;
        w = Math.max(w, densityExtra);
      }

      dayWidths.push(w);
      dayStartX.push(dayStartX[i] + w);
    }

    return { daysTotal, start, end };
  }

  function getDayWidth(dayIdx) {
    return (
      dayWidths[dayIdx] ||
      (currentMode === "weekly" ? BASE_SCALE_WEEKLY : SCALE_QUARTERLY)
    );
  }

  function xPositionToDay(xPos) {
    for (let i = 0; i < dayStartX.length - 1; i++) {
      if (xPos < dayStartX[i + 1]) return i;
    }
    return Math.max(0, dayStartX.length - 2);
  }

  // --- 5. The Unified Layout Engine (Absolute Chronological Scale) ---
  function updateLayout() {
    // --- 0. Clean up ghosts before layout ---
    nodesData = nodesData.filter((n) => !n.isGhost);
    connections = connections.filter((c) => !c.isGhost);

    const isCopilotEnabled =
      document.getElementById("toggle-recommendations")?.checked ?? true;
    const copilotWidget = document.getElementById("copilot-widget");

    // --- Calculate Next Best Action ---
    if (isCopilotEnabled && recommendationData && activeChannels.length > 0) {
      const specialty = document.getElementById("specialty-selector").value;
      const journey = recommendationData.specialties[specialty]?.optimalJourney;

      if (journey) {
        const realNodes = nodesData
          .slice()
          .sort((a, b) => a.timestamp - b.timestamp);
        let lastMatchedNode = null;
        let nextStepIndex = 0;

        for (let i = 0; i < journey.length; i++) {
          const step = journey[i];
          const match = realNodes.find(
            (n) =>
              n.type === step.tacticType &&
              (!lastMatchedNode || n.timestamp >= lastMatchedNode.timestamp),
          );
          if (match) {
            lastMatchedNode = match;
            nextStepIndex = i + 1;
          } else {
            break;
          }
        }

        const copilotWidget = document.getElementById("copilot-widget");

        if (nextStepIndex < journey.length) {
          const nextStep = journey[nextStepIndex];

          // Update Copilot UI
          document.getElementById("copilot-tactic").innerText =
            nextStep.tacticType.toUpperCase();
          if (lastMatchedNode) {
            document.getElementById("copilot-timing").innerText =
              `Wait ${nextStep.delayDays} days after previous tactic. Connect using '${nextStep.connectionType}' line.`;
          } else {
            document.getElementById("copilot-timing").innerText =
              `Place this tactic at the start of your timeline.`;
          }
          document.getElementById("copilot-rationale").innerText =
            nextStep.rationale;
          copilotWidget.style.display = "block";

          // Inject Ghost
          const startMs = new Date(
            startDate.getFullYear(),
            startDate.getMonth(),
            startDate.getDate(),
          ).getTime();
          const ghostTimestamp = lastMatchedNode
            ? lastMatchedNode.timestamp +
              nextStep.delayDays * 24 * 60 * 60 * 1000
            : startMs;

          // find a suitable lane (just use the first active one, or the same as last node if possible)
          let targetLaneId = activeChannels[0].id;
          if (
            lastMatchedNode &&
            activeChannels.find((c) => c.id === lastMatchedNode.laneId)
          ) {
            targetLaneId = lastMatchedNode.laneId;
          }

          // Store for Accept button
          pendingRecommendation = {
            type: nextStep.tacticType,
            timestamp: ghostTimestamp,
            laneId: targetLaneId,
            connectionType: nextStep.connectionType,
            sourceId: lastMatchedNode ? lastMatchedNode.id : null,
          };

          const ghostNode = {
            id: "ghost-node",
            laneId: targetLaneId,
            type: nextStep.tacticType,
            name:
              "Recommended: " +
              (tacticNames[nextStep.tacticType] || nextStep.tacticType),
            timestamp: ghostTimestamp,
            durationDays: 1,
            isGhost: true,
            isStandalone: currentMode === "weekly",
          };
          nodesData.push(ghostNode);

          if (lastMatchedNode && nextStep.connectionType) {
            connections.push({
              sourceId: lastMatchedNode.id,
              targetId: "ghost-node",
              type: nextStep.connectionType,
              isGhost: true,
            });
          }
        } else {
          // Journey completed
          if (copilotWidget) copilotWidget.style.display = "none";
        }
      }
    } else {
      if (copilotWidget) copilotWidget.style.display = "none";
    }

    let html = `<div class="header-corner"><button id="add-channels-btn" class="add-channels-btn">Add Channels</button></div>`;

    const { daysTotal, start, end } = computeDayLayout();
    const totalWidth = dayStartX[daysTotal];

    // Render Phase Backgrounds inside the header
    phases.forEach((phase) => {
      const pStart = new Date(phase.start);
      const pEnd = new Date(phase.end);
      if (pEnd >= start && pStart <= end) {
        const effectiveStart = new Date(
          Math.max(pStart.getTime(), start.getTime()),
        );
        const effectiveEnd = new Date(Math.min(pEnd.getTime(), end.getTime()));
        const startDayIdx = Math.floor(
          (effectiveStart.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
        );
        const endDayIdx = Math.ceil(
          (effectiveEnd.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
        );

        const startX = getXForDay(startDayIdx, daysTotal) + 200; // offset by header-corner width
        const endX = getXForDay(endDayIdx, daysTotal) + 200;
        const width = endX - startX;

        if (width > 0) {
          html += `<div style="position: absolute; left: ${startX}px; width: ${width}px; top: 0; bottom: 0; background-color: ${phase.color || "rgba(0,0,0,0.02)"}; z-index: 0; pointer-events: none;"></div>`;
        }
      }
    });

    // Render Headers
    if (currentMode === "weekly") {
      let d = new Date(start);
      for (let i = 0; i <= daysTotal; i++) {
        const w = getDayWidth(i);
        html += `<div class="header-cell" style="width: ${w}px">${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</div>`;
        d.setDate(d.getDate() + 1);
      }
    } else if (currentMode === "quarterly") {
      let d = new Date(start);
      while (d <= end) {
        const daysInMonth = new Date(
          d.getFullYear(),
          d.getMonth() + 1,
          0,
        ).getDate();
        let daysToUse = daysInMonth - d.getDate() + 1;

        const tempEnd = new Date(
          d.getFullYear(),
          d.getMonth(),
          d.getDate() + daysToUse - 1,
        );
        if (tempEnd > end) {
          daysToUse = Math.round((end - d) / (1000 * 60 * 60 * 24)) + 1;
        }

        // Sum widths for the days in this month
        const monthStartIdx = Math.round((d - start) / (1000 * 60 * 60 * 24));
        let monthWidth = 0;
        for (let mi = 0; mi < daysToUse; mi++) {
          monthWidth += getDayWidth(monthStartIdx + mi);
        }
        html += `<div class="header-cell" style="width: ${monthWidth}px; border-right: none;">${d.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</div>`;

        d.setMonth(d.getMonth() + 1);
        d.setDate(1);

        if (d <= end) {
          // Add the visual separator matching the 15px gap
          html += `<div class="month-separator" style="width: 15px; background: repeating-linear-gradient(45deg, #e2e8f0, #e2e8f0 2px, #f1f5f9 2px, #f1f5f9 4px); border-left: 1px solid #cbd5e1; border-right: 1px solid #cbd5e1; flex-shrink: 0; position: relative; z-index: 10;"></div>`;
        }
      }
    }

    gridHeader.innerHTML = html;

    // Handle empty state
    if (activeChannels.length === 0) {
      emptyState.style.display = "block";
      lanesContainer.innerHTML = "";
    } else {
      emptyState.style.display = "none";

      let lanesHtml = "";
      // Render Phase Backgrounds inside the lanes container (only covers active lanes)
      phases.forEach((phase) => {
        const pStart = new Date(phase.start);
        const pEnd = new Date(phase.end);
        if (pEnd >= start && pStart <= end) {
          const effectiveStart = new Date(
            Math.max(pStart.getTime(), start.getTime()),
          );
          const effectiveEnd = new Date(
            Math.min(pEnd.getTime(), end.getTime()),
          );
          const startDayIdx = Math.floor(
            (effectiveStart.getTime() - start.getTime()) /
              (1000 * 60 * 60 * 24),
          );
          const endDayIdx = Math.ceil(
            (effectiveEnd.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
          );

          const startX = getXForDay(startDayIdx, daysTotal) + 200;
          const endX = getXForDay(endDayIdx, daysTotal) + 200;
          const width = endX - startX;

          if (width > 0) {
            lanesHtml += `<div style="position: absolute; left: ${startX}px; width: ${width}px; top: 0; bottom: 0; background-color: ${phase.color || "rgba(0,0,0,0.02)"}; z-index: 1; pointer-events: none; border-right: 1px dashed rgba(0,0,0,0.1);"></div>`;
          }
        }
      });

      // Render active channels dynamically
      lanesHtml += activeChannels
        .map(
          (channel) => `
                <div class="channel-lane ${channel.isCollapsed ? "collapsed" : ""}" id="${channel.id}">
                    <div class="lane-label">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span class="collapse-toggle" data-id="${channel.id}" style="cursor: pointer; padding: 2px 4px; background: rgba(0,0,0,0.05); border-radius: 4px;">
                                ${channel.isCollapsed ? "▶" : "▼"}
                            </span>
                            ${channel.name}
                        </div>
                        <small>0 tactics</small>
                    </div>
                    <div class="lane-dropzone" style="width: ${totalWidth}px; background-size: 0; ${channel.isCollapsed ? "display: none;" : ""}"></div>
                </div>
            `,
        )
        .join("");

      lanesContainer.innerHTML = lanesHtml;

      // Re-render all nodes DOM since we just destroyed them
      nodesData.forEach((data) => {
        let effectiveInitId = data.initiativeId;
        if (!effectiveInitId && data.splitParentId) {
          const parent = nodesData.find((p) => p.id === data.splitParentId);
          if (parent) effectiveInitId = parent.initiativeId;
        }
        if (effectiveInitId) {
          const init = initiatives.find((i) => i.id === effectiveInitId);
          if (init && init.isHidden) return;
        }
        const laneDropzone = document.querySelector(
          `#${data.laneId} .lane-dropzone`,
        );
        if (
          laneDropzone &&
          !activeChannels.find((c) => c.id === data.laneId)?.isCollapsed
        ) {
          renderNodeDOM(data, laneDropzone);
        }
      });
    }

    if (svgCanvas) svgCanvas.style.width = `${totalWidth + 200}px`;

    // Render & Position Tactics (Strict Chronological Mapping)
    const dayMs = 1000 * 60 * 60 * 24;

    document.querySelectorAll(".channel-lane").forEach((lane) => {
      const channel = activeChannels.find((c) => c.id === lane.id);
      if (channel && channel.isCollapsed) {
        lane.style.minHeight = "60px"; // Just the header height
        return;
      }

      const laneNodes = nodesData
        .filter((n) => {
          if (n.laneId !== lane.id) return false;

          let effectiveInitId = n.initiativeId;
          if (!effectiveInitId && n.splitParentId) {
            const parent = nodesData.find((p) => p.id === n.splitParentId);
            if (parent) effectiveInitId = parent.initiativeId;
          }

          if (effectiveInitId) {
            const init = initiatives.find((i) => i.id === effectiveInitId);
            if (init && init.isHidden) return false;
          }
          return true;
        })
        .sort((a, b) => {
          const aSort = a.verticalSortIndex || 0;
          const bSort = b.verticalSortIndex || 0;
          if (aSort !== bSort) return aSort - bSort;
          return a.timestamp - b.timestamp;
        });
      const placedBounds = [];
      const rootNodes = laneNodes.filter((n) => !n.splitParentId);

      lane.style.minHeight = "200px";

      rootNodes.forEach((data) => {
        // Pass 1: Compute X and W for every node in this tree recursively
        function computeTreeXW(nodeId, parentX, parentW) {
          const node = nodesData.find((n) => n.id === nodeId);
          if (!node) return;

          const minWidth = currentMode === "weekly" ? 100 : 70;
          const padding = currentMode === "weekly" ? 40 : 5;

          if (parentX !== undefined) {
            node.computedX = parentX + parentW + TREE_GAP;
          } else {
            const nodeDate = new Date(node.timestamp);
            const startDayIdx = Math.floor((nodeDate - start) / dayMs);
            node.computedX = getXForDay(startDayIdx, daysTotal);
          }

          const nodeDate = new Date(node.timestamp);
          const startDayIdx = Math.floor((nodeDate - start) / dayMs);
          const endDayIdx = startDayIdx + node.durationDays;

          let endX;
          if (node.durationDays > 0) {
            const lastDayIdx = startDayIdx + node.durationDays - 1;
            if (lastDayIdx >= 0 && lastDayIdx <= daysTotal) {
              endX =
                getXForDay(lastDayIdx, daysTotal) + getDayWidth(lastDayIdx);
            } else {
              endX = getXForDay(endDayIdx, daysTotal);
            }
          } else {
            endX = getXForDay(endDayIdx, daysTotal);
          }

          if (node.splitChildIds && node.splitChildIds.length > 0) {
            const lastDayIdx = startDayIdx + node.durationDays - 1;
            if (lastDayIdx >= 0 && lastDayIdx <= daysTotal) {
              const wBeforeLastDay =
                getXForDay(lastDayIdx, daysTotal) - node.computedX;
              node.computedW = Math.max(minWidth, wBeforeLastDay + minWidth);
            } else {
              node.computedW = Math.max(
                minWidth,
                endX - node.computedX - padding,
              );
            }
          } else {
            node.computedW = Math.max(
              minWidth,
              endX - node.computedX - padding,
            );
          }

          if (node.splitChildIds) {
            node.splitChildIds.forEach((cid) =>
              computeTreeXW(cid, node.computedX, node.computedW),
            );
          }
        }

        computeTreeXW(data.id);

        // Pass 2: Calculate overall tree bounds for collision detection
        function getTreeHeight(nodeId) {
          const node = nodesData.find((n) => n.id === nodeId);
          if (!node || !node.splitChildIds || node.splitChildIds.length === 0)
            return 40;
          const leafCount = getLeafCount(nodeId);
          return Math.max(40, leafCount * LEAF_SPACING);
        }

        const treeHeight = getTreeHeight(data.id);

        function getTreeWidth(nodeId) {
          const node = nodesData.find((n) => n.id === nodeId);
          if (!node) return 0;
          let maxW = node.computedX + node.computedW;
          if (node.splitChildIds) {
            node.splitChildIds.forEach((cid) => {
              maxW = Math.max(maxW, getTreeWidth(cid));
            });
          }
          return maxW;
        }

        const treeWidth = getTreeWidth(data.id) - data.computedX;

        // Smart Stacking Algorithm (reserves full tree bounds)
        let y = 15;
        let collision = true;
        while (collision) {
          collision = false;
          for (let p of placedBounds) {
            if (
              data.computedX < p.x + p.w &&
              data.computedX + treeWidth > p.x
            ) {
              if (y < p.y + p.h && y + treeHeight > p.y) {
                y = p.y + p.h + 10;
                collision = true;
                break;
              }
            }
          }
        }

        placedBounds.push({
          x: data.computedX,
          y: y,
          w: treeWidth,
          h: treeHeight,
        });

        // Pass 3: Layout the tree vertically and apply styles
        function applyTreeStyles(nodeId, yStart, yEnd) {
          const node = nodesData.find((n) => n.id === nodeId);
          const el = document.getElementById(nodeId);
          if (!node || !el) return;

          const yCentre = (yStart + yEnd) / 2 - 18; // 18 is half of 36px typical node height
          node.computedY = Math.max(5, yCentre);

          el.style.left = `${node.computedX}px`;
          el.style.top = `${node.computedY}px`;
          el.style.width = `${node.computedW}px`;

          if (node.computedY + 50 > lane.offsetHeight) {
            lane.style.minHeight = `${node.computedY + 80}px`;
          }

          if (!node.splitChildIds || node.splitChildIds.length === 0) return;

          const childLeafCounts = node.splitChildIds.map((cid) =>
            getLeafCount(cid),
          );
          const totalLeaves = childLeafCounts.reduce((a, b) => a + b, 0);

          let curY = yStart;
          node.splitChildIds.forEach((cid, i) => {
            const portion =
              (childLeafCounts[i] / totalLeaves) * (yEnd - yStart);
            applyTreeStyles(cid, curY, curY + portion);
            curY += portion;
          });
        }

        applyTreeStyles(data.id, y, y + treeHeight);
      });

      lane.querySelector("small").innerText = `${laneNodes.length} tactics`;
    });

    if (svgCanvas) svgCanvas.style.height = `${gridContainer.scrollHeight}px`;
    setTimeout(redrawConnections, 300);

    updateJourneyHoursDisplay();
    renderInitiativeFilters();

    // Let the DOM update before positioning tooltips
    setTimeout(checkOnboarding, 50);
  }

  // --- 5. Connecting Tactics (SVG Drawing) ---
  let activeKey = null;
  let sourceNode = null;

  document.querySelectorAll(".key-item").forEach((key) => {
    key.addEventListener("click", () => {
      document
        .querySelectorAll(".key-item")
        .forEach((k) => k.classList.remove("active"));
      if (activeKey === key.dataset.key) {
        activeKey = null;
        sourceNode?.classList.remove("source-selected");
        sourceNode = null;
      } else {
        key.classList.add("active");
        activeKey = key.dataset.key;
      }
    });
  });

  gridContainer.addEventListener("click", (e) => {
    const clickedNode = e.target.closest(".canvas-node");
    if (
      !clickedNode ||
      e.target.classList.contains("resize-handle") ||
      e.target.classList.contains("delete-btn")
    )
      return;

    if (activeKey === "decision") {
      // Decision split: spawn two placeholder children
      if (!clickedNode.classList.contains("placeholder")) {
        handleDecisionSplit(clickedNode);
      }
      activeKey = null;
      sourceNode = null;
      document
        .querySelectorAll(".key-item")
        .forEach((k) => k.classList.remove("active"));
    } else if (activeKey) {
      if (!sourceNode) {
        sourceNode = clickedNode;
        sourceNode.classList.add("source-selected");
      } else if (sourceNode !== clickedNode) {
        connections.push({
          sourceId: sourceNode.id,
          targetId: clickedNode.id,
          type: activeKey,
        });
        sourceNode.classList.remove("source-selected");
        sourceNode = null;
        redrawConnections();
      }
    } else {
      // Open Tactic Details modal
      if (!clickedNode.classList.contains("placeholder")) {
        openTacticConfigModal(clickedNode.id);
      }
    }
  });

  // --- Flow Visualization Enhancements: Bloodline ---

  if (gridContainer) {
    gridContainer.addEventListener("mouseover", (e) => {
      const nodeEl = e.target.closest(".canvas-node");
      if (nodeEl && !nodeEl.classList.contains("placeholder")) {
        const nodeId = nodeEl.id;
        const relatedNodeIds = new Set([nodeId]);
        const relatedPathIndices = new Set();

        function traceForward(id) {
          connections.forEach((conn, idx) => {
            if (conn.sourceId === id) {
              relatedPathIndices.add(idx);
              if (!relatedNodeIds.has(conn.targetId)) {
                relatedNodeIds.add(conn.targetId);
                traceForward(conn.targetId);
              }
            }
          });
        }

        function traceBackward(id) {
          connections.forEach((conn, idx) => {
            if (conn.targetId === id) {
              relatedPathIndices.add(idx);
              if (!relatedNodeIds.has(conn.sourceId)) {
                relatedNodeIds.add(conn.sourceId);
                traceBackward(conn.sourceId);
              }
            }
          });
        }

        traceForward(nodeId);
        traceBackward(nodeId);

        gridContainer.classList.add("dimmed-canvas");

        document.querySelectorAll(".canvas-node").forEach((n) => {
          if (relatedNodeIds.has(n.id)) n.classList.add("highlighted-node");
        });

        document.querySelectorAll(".path-line").forEach((path) => {
          if (relatedPathIndices.has(parseInt(path.dataset.index))) {
            path.classList.add("highlighted-path");
          }
        });

        document.querySelectorAll(".add-rule-btn").forEach((btn) => {
          if (relatedPathIndices.has(parseInt(btn.dataset.index))) {
            btn.classList.add("highlighted-btn");
          }
        });
      }
    });

    gridContainer.addEventListener("mouseout", (e) => {
      const nodeEl = e.target.closest(".canvas-node");
      if (nodeEl) {
        gridContainer.classList.remove("dimmed-canvas");
        document
          .querySelectorAll(".highlighted-node")
          .forEach((n) => n.classList.remove("highlighted-node"));
        document
          .querySelectorAll(".highlighted-path")
          .forEach((p) => p.classList.remove("highlighted-path"));
        document
          .querySelectorAll(".highlighted-btn")
          .forEach((b) => b.classList.remove("highlighted-btn"));
      }
    });
  }

  function redrawConnections() {
    if (!svgCanvas) return;
    svgCanvas.innerHTML = "";
    const rulesContainer = document.getElementById("rules-container");
    if (rulesContainer) rulesContainer.innerHTML = "";
    const svgRect = svgCanvas.getBoundingClientRect();

    // Color map for connection types
    const typeColors = {
      echo: "#4caf50",
      next: "#2196f3",
      decision: "#9c27b0",
    };

    // Collect dot positions so we draw them AFTER all paths (on top)
    const dots = [];

    // Pre-pass: group connections by source node to compute fan-out index
    const fanOutMap = {};
    connections.forEach((conn, i) => {
      if (!fanOutMap[conn.sourceId]) fanOutMap[conn.sourceId] = [];
      fanOutMap[conn.sourceId].push(i);
    });

    connections.forEach((conn, connIdx) => {
      const srcNodeData = nodesData.find((n) => n.id === conn.sourceId);
      const tgtNodeData = nodesData.find((n) => n.id === conn.targetId);

      if (!srcNodeData || !tgtNodeData) return;

      // Skip drawing if either node belongs to a hidden initiative
      function getInitId(node) {
        if (node.initiativeId) return node.initiativeId;
        if (node.splitParentId) {
          const p = nodesData.find((x) => x.id === node.splitParentId);
          if (p) return p.initiativeId;
        }
        return null;
      }

      const srcInitId = getInitId(srcNodeData);
      if (srcInitId) {
        const init = initiatives.find((i) => i.id === srcInitId);
        if (init && init.isHidden) return;
      }

      const tgtInitId = getInitId(tgtNodeData);
      if (tgtInitId) {
        const init = initiatives.find((i) => i.id === tgtInitId);
        if (init && init.isHidden) return;
      }

      // Check if lanes are collapsed
      const srcChannel = activeChannels.find(
        (c) => c.id === srcNodeData.laneId,
      );
      const tgtChannel = activeChannels.find(
        (c) => c.id === tgtNodeData.laneId,
      );

      const src = document.getElementById(conn.sourceId);
      const tgt = document.getElementById(conn.targetId);

      // Determine Source Rect
      let sR;
      if (srcChannel && srcChannel.isCollapsed) {
        const laneLabel = document.querySelector(
          `#${srcChannel.id} .lane-label`,
        );
        sR = laneLabel ? laneLabel.getBoundingClientRect() : null;
      } else if (src) {
        sR = src.getBoundingClientRect();
      }

      // Determine Target Rect
      let tR;
      if (tgtChannel && tgtChannel.isCollapsed) {
        const laneLabel = document.querySelector(
          `#${tgtChannel.id} .lane-label`,
        );
        tR = laneLabel ? laneLabel.getBoundingClientRect() : null;
      } else if (tgt) {
        tR = tgt.getBoundingClientRect();
      }

      if (sR && tR) {
        const siblings = fanOutMap[conn.sourceId] || [connIdx];
        const fanIndex = siblings.indexOf(connIdx);
        const fanCount = siblings.length;
        const fanSpread =
          fanCount > 1 ? ((fanIndex / (fanCount - 1)) * 2 - 1) * 15 : 0;

        let startX =
          srcChannel && srcChannel.isCollapsed
            ? sR.left - svgRect.left + 50
            : sR.right - svgRect.left;
        let startY =
          srcChannel && srcChannel.isCollapsed
            ? sR.bottom - svgRect.top
            : sR.top - svgRect.top + sR.height / 2;

        let endX =
          tgtChannel && tgtChannel.isCollapsed
            ? tR.left - svgRect.left + 50
            : tR.left - svgRect.left;
        let endY =
          tgtChannel && tgtChannel.isCollapsed
            ? tR.top - svgRect.top
            : tR.top - svgRect.top + tR.height / 2;

        if (!srcChannel?.isCollapsed && !tgtChannel?.isCollapsed) {
          startY += fanSpread * 0.5;
        } else {
          if (srcChannel && srcChannel.isCollapsed) startX += fanSpread;
          if (tgtChannel && tgtChannel.isCollapsed) endX += fanSpread;
        }

        const path = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "path",
        );
        const dx = Math.abs(endX - startX);
        let offset = Math.min(dx * 0.35, 60);

        let cp1X = startX + offset;
        let cp1Y = startY;
        let cp2X = endX - offset;
        let cp2Y = endY;

        // Simple collapsed logic
        if (srcChannel && srcChannel.isCollapsed) {
          cp1X = startX;
          cp1Y = startY + offset;
        }
        if (tgtChannel && tgtChannel.isCollapsed) {
          cp2X = endX;
          cp2Y = endY - offset;
        }

        path.setAttribute(
          "d",
          `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`,
        );
        path.classList.add("path-line", `path-${conn.type}`);
        if (conn.isGhost) path.classList.add("path-ghost");
        path.dataset.index = connIdx;
        path.style.fill = "transparent";
        svgCanvas.appendChild(path);

        // Add business rule block or add button
        if (rulesContainer) {
          const midX =
            0.125 * startX + 0.375 * cp1X + 0.375 * cp2X + 0.125 * endX;
          const midY =
            0.125 * startY + 0.375 * cp1Y + 0.375 * cp2Y + 0.125 * endY;

          if (conn.rule) {
            const ruleBlock = document.createElement("div");
            const isCompact = Math.abs(endX - startX) < 100;
            ruleBlock.className =
              "rule-block" + (isCompact ? " compact-mode" : "");
            ruleBlock.style.left = `${midX}px`;
            ruleBlock.style.top = `${midY}px`;
            ruleBlock.dataset.index = connIdx;
            // Use a span for text so we can hide it in compact mode
            ruleBlock.innerHTML = `<span class="rule-block-icon">⚡</span> <span class="rule-block-text">${conn.rule.name}</span>`;
            ruleBlock.title = conn.rule.description || "";
            rulesContainer.appendChild(ruleBlock);
          } else {
            const btnWrapper = document.createElement("div");
            btnWrapper.className = "add-rule-btn-wrapper";
            btnWrapper.style.left = `${midX}px`;
            btnWrapper.style.top = `${midY}px`;

            const addBtn = document.createElement("div");
            addBtn.className = "add-rule-btn";
            addBtn.dataset.index = connIdx;
            addBtn.textContent = "+";
            addBtn.title = "Add Business Rule";

            btnWrapper.appendChild(addBtn);
            rulesContainer.appendChild(btnWrapper);
          }
        }

        // Collect dots for attachment points
        const color = typeColors[conn.type] || "#2196f3";
        dots.push({ x: startX, y: startY, color });
        dots.push({ x: endX, y: endY, color });
      }
    });

    // Draw connection dots ON TOP of all paths
    dots.forEach((dot) => {
      const circle = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle",
      );
      circle.setAttribute("cx", dot.x);
      circle.setAttribute("cy", dot.y);
      circle.setAttribute("r", "4");
      circle.setAttribute("fill", dot.color);
      circle.setAttribute("stroke", "white");
      circle.setAttribute("stroke-width", "1.5");
      svgCanvas.appendChild(circle);
    });
  }

  // --- 6. Channel Selection Modal ---
  const channelModal = document.getElementById("channel-modal");
  const channelList = document.getElementById("channel-list");
  const closeBtn = document.getElementById("close-modal-btn");
  const confirmBtn = document.getElementById("confirm-channels-btn");

  // Handle Channel Collapse Toggles
  document.addEventListener("click", (e) => {
    const toggle = e.target.closest(".collapse-toggle");
    if (toggle) {
      const channelId = toggle.dataset.id;
      const channel = activeChannels.find((c) => c.id === channelId);
      if (channel) {
        channel.isCollapsed = !channel.isCollapsed;
        updateLayout();
      }
    }
  });

  // Handle "Add Channels" button (since it's dynamically rendered, use event delegation)
  document.addEventListener("click", (e) => {
    if (
      e.target.id === "add-channels-btn" ||
      e.target.id === "empty-state-add-btn"
    ) {
      // Render options
      channelList.innerHTML = AVAILABLE_CHANNELS.map((ch) => {
        const isChecked = activeChannels.some((ac) => ac.id === ch.id)
          ? "checked"
          : "";
        return `
                    <label class="channel-option">
                        <input type="checkbox" value="${ch.id}" ${isChecked}>
                        ${ch.name}
                    </label>
                `;
      }).join("");

      channelModal.style.display = "flex";
    }
  });

  closeBtn.addEventListener("click", () => {
    channelModal.style.display = "none";
  });

  confirmBtn.addEventListener("click", () => {
    const checkboxes = channelList.querySelectorAll(
      'input[type="checkbox"]:checked',
    );
    const selectedIds = Array.from(checkboxes).map((cb) => cb.value);

    activeChannels = AVAILABLE_CHANNELS.filter((ch) =>
      selectedIds.includes(ch.id),
    );
    channelModal.style.display = "none";

    // Update document layout with new channels
    updateLayout();
  });

  // --- 7. Initiatives Management ---
  const initListModal = document.getElementById("manage-initiative-modal");
  const initEditModal = document.getElementById("edit-initiative-modal");
  const initList = document.getElementById("initiative-list");

  // Open List Modal
  document
    .getElementById("manage-initiative-btn")
    .addEventListener("click", () => {
      renderInitiativeList();
      initListModal.style.display = "flex";
    });

  document
    .getElementById("close-initiative-modal")
    .addEventListener("click", () => {
      initListModal.style.display = "none";
    });

  // Open Create/Edit Modal
  document
    .getElementById("open-create-initiative-btn")
    .addEventListener("click", () => {
      document.getElementById("edit-init-title").innerText =
        "Create Initiative";
      document.getElementById("edit-init-id").value = "";
      document.getElementById("init-name").value = "";
      document.getElementById("init-start").value = "";
      document.getElementById("init-end").value = "";
      document.getElementById("init-color").value = "#3b82f6";
      initEditModal.style.display = "flex";
    });

  document
    .getElementById("close-edit-initiative-btn")
    .addEventListener("click", () => {
      initEditModal.style.display = "none";
    });

  document
    .getElementById("save-initiative-btn")
    .addEventListener("click", () => {
      const id = document.getElementById("edit-init-id").value;
      const name = document.getElementById("init-name").value;
      const start = document.getElementById("init-start").value;
      const end = document.getElementById("init-end").value;
      const color = document.getElementById("init-color").value;

      if (!name || !start || !end) {
        console.warn("Please fill out all fields.");
        return;
      }

      if (id) {
        // Edit existing
        const init = initiatives.find((i) => i.id === id);
        if (init) {
          init.name = name;
          init.startDate = new Date(start).getTime();
          init.endDate = new Date(end).getTime();
          init.color = color;
        }
      } else {
        // Create new
        initiatives.push({
          id: "init-" + Math.random().toString(36).substring(2, 9),
          name,
          startDate: new Date(start).getTime(),
          endDate: new Date(end).getTime(),
          color,
        });
      }

      initEditModal.style.display = "none";
      renderInitiativeList();
      updateLayout(); // Re-render nodes to pick up any color changes
    });

  function renderInitiativeList() {
    if (initiatives.length === 0) {
      initList.innerHTML =
        '<div style="padding: 20px; color: #666; font-size: 14px; text-align: center;">No initiatives created yet.</div>';
      return;
    }

    initList.innerHTML = initiatives
      .map((init) => {
        const startStr = new Date(init.startDate).toISOString().split("T")[0];
        const endStr = new Date(init.endDate).toISOString().split("T")[0];
        return `
                <div class="initiative-item">
                    <div class="initiative-item-info">
                        <div class="initiative-color-swatch" style="background-color: ${init.color};"></div>
                        <div>
                            <div class="initiative-item-name">${init.name} - ${formatHours(getInitiativeHours(init.id))}</div>
                            <div class="initiative-item-dates">${new Date(init.startDate).toLocaleDateString()} - ${new Date(init.endDate).toLocaleDateString()}</div>
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn secondary edit-init-btn" data-id="${init.id}" data-name="${init.name}" data-start="${startStr}" data-end="${endStr}" data-color="${init.color}" style="padding: 4px 8px;">Edit</button>
                        <button class="btn danger delete-init-btn" data-id="${init.id}">Delete</button>
                    </div>
                </div>
            `;
      })
      .join("");

    // Attach edit listeners
    initList.querySelectorAll(".edit-init-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.getElementById("edit-init-title").innerText =
          "Edit Initiative";
        document.getElementById("edit-init-id").value = btn.dataset.id;
        document.getElementById("init-name").value = btn.dataset.name;
        document.getElementById("init-start").value = btn.dataset.start;
        document.getElementById("init-end").value = btn.dataset.end;
        document.getElementById("init-color").value = btn.dataset.color;
        initEditModal.style.display = "flex";
      });
    });

    // Attach delete listeners
    initList.querySelectorAll(".delete-init-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        initiatives = initiatives.filter((i) => i.id !== id);

        // Remove link from tactics and re-render
        let needsUpdate = false;
        nodesData.forEach((node) => {
          if (node.initiativeId === id) {
            node.initiativeId = null;
            needsUpdate = true;
          }
        });

        renderInitiativeList();
        if (needsUpdate) updateLayout();
      });
    });

    renderInitiativeFilters();
  }

  function renderInitiativeFilters() {
    const filtersContainer = document.getElementById("initiative-filters");
    if (!filtersContainer) return;

    if (initiatives.length === 0) {
      filtersContainer.innerHTML = "";
      filtersContainer.style.display = "none";
      return;
    }

    filtersContainer.style.display = "flex";
    filtersContainer.innerHTML =
      '<span style="font-size: 12px; color: #666; font-weight: 500;">Filters:</span>' +
      initiatives
        .map(
          (init) => `
            <div class="filter-pill ${init.isHidden ? "hidden" : ""}" data-id="${init.id}" style="${init.isHidden ? "" : `background-color: ${init.color}20; color: ${init.color}; border-color: ${init.color}40;`}">
                <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${init.isHidden ? "#ccc" : init.color};"></span>
                ${init.name} - ${formatHours(getInitiativeHours(init.id))}
            </div>
        `,
        )
        .join("");

    // Attach click listeners
    filtersContainer.querySelectorAll(".filter-pill").forEach((pill) => {
      pill.addEventListener("click", () => {
        const initId = pill.getAttribute("data-id");
        const init = initiatives.find((i) => i.id === initId);
        if (init) {
          init.isHidden = !init.isHidden;
          renderInitiativeFilters(); // update visual state of pills
          updateLayout(); // re-layout and re-render tactics
        }
      });
    });
  }

  // --- 8. Tactic Config Modal Logic ---
  const tacticConfigModal = document.getElementById("tactic-config-modal");
  const tacticStandaloneCb = document.getElementById("tactic-is-standalone");
  const tacticDateInput = document.getElementById("tactic-date");
  const tacticInitSelect = document.getElementById("tactic-initiative");
  const tacticNameInput = document.getElementById("tactic-name");
  const serviceLineSelect = document.getElementById("service-line-select");
  const addServiceLineBtn = document.getElementById("add-service-line-btn");
  const serviceLineList = document.getElementById("service-line-list");

  let currentConfigTacticId = null;
  let currentServiceLines = [];

  function renderServiceLines() {
    serviceLineList.innerHTML = "";
    currentServiceLines.forEach((sl, index) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.gap = "10px";
      row.style.alignItems = "center";
      row.style.background = "#f8fafc";
      row.style.padding = "6px 8px";
      row.style.borderRadius = "4px";
      row.style.border = "1px solid #e2e8f0";

      row.innerHTML = `
                <div style="flex: 1; font-size: 13px; font-weight: 500;">${sl.name}</div>
                <select class="form-input sl-size-select" data-index="${index}" style="width: 130px; padding: 2px 6px; font-size: 12px; height: 26px;">
                    <option value="S" ${sl.size === "S" ? "selected" : ""}>S (8-16 hours)</option>
                    <option value="M" ${sl.size === "M" ? "selected" : ""}>M (16-24 hours)</option>
                    <option value="L" ${sl.size === "L" ? "selected" : ""}>L (24-40 hours)</option>
                </select>
                <button class="btn danger remove-sl-btn" data-index="${index}" style="padding: 2px 6px; font-size: 16px; line-height: 1; height: 26px;">×</button>
            `;
      serviceLineList.appendChild(row);
    });

    // Add event listeners for new elements
    serviceLineList.querySelectorAll(".sl-size-select").forEach((select) => {
      select.addEventListener("change", (e) => {
        const idx = parseInt(e.target.getAttribute("data-index"));
        currentServiceLines[idx].size = e.target.value;
      });
    });

    serviceLineList.querySelectorAll(".remove-sl-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const idx = parseInt(e.target.getAttribute("data-index"));
        currentServiceLines.splice(idx, 1);
        renderServiceLines();
      });
    });
  }

  const serviceLineSizeSelect = document.getElementById(
    "service-line-size-select",
  );

  addServiceLineBtn.addEventListener("click", () => {
    const val = serviceLineSelect.value;
    const sizeVal = serviceLineSizeSelect.value || "M";
    if (val) {
      // Check if already added
      if (!currentServiceLines.find((sl) => sl.name === val)) {
        currentServiceLines.push({ name: val, size: sizeVal });
        renderServiceLines();
      }
      serviceLineSelect.value = "";
      serviceLineSizeSelect.value = "M";
    }
  });

  function openTacticConfigModal(nodeId) {
    currentConfigTacticId = nodeId;
    const node = nodesData.find((n) => n.id === nodeId);
    if (!node) return;

    document.getElementById("config-tactic-id").value = node.id;
    tacticNameInput.value = node.name || "";

    // Populate initiatives
    tacticInitSelect.innerHTML =
      '<option value="">None (Unassigned)</option>' +
      initiatives
        .map(
          (init) =>
            `<option value="${init.id}" ${node.initiativeId === init.id ? "selected" : ""}>${init.name} - ${formatHours(getInitiativeHours(init.id))}</option>`,
        )
        .join("");

    // Setup Date picker bounds based on the node's current month
    const nodeDate = new Date(node.timestamp);
    const year = nodeDate.getFullYear();
    const month = nodeDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const formatForInput = (d) => {
      return (
        d.getFullYear() +
        "-" +
        String(d.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(d.getDate()).padStart(2, "0")
      );
    };

    tacticDateInput.min = formatForInput(firstDay);
    tacticDateInput.max = formatForInput(lastDay);
    tacticDateInput.value = formatForInput(nodeDate);

    // Standalone toggle logic
    tacticStandaloneCb.checked = !!node.isStandalone;
    tacticDateInput.disabled = !tacticStandaloneCb.checked;

    // Service lines logic
    currentServiceLines = node.serviceLines
      ? JSON.parse(JSON.stringify(node.serviceLines))
      : [];
    renderServiceLines();

    tacticConfigModal.style.display = "flex";
  }

  tacticStandaloneCb.addEventListener("change", (e) => {
    tacticDateInput.disabled = !e.target.checked;
  });

  document
    .getElementById("close-tactic-config-btn")
    .addEventListener("click", () => {
      tacticConfigModal.style.display = "none";
    });

  document
    .getElementById("save-tactic-config-btn")
    .addEventListener("click", () => {
      const node = nodesData.find((n) => n.id === currentConfigTacticId);
      if (!node) return;

      if (tacticNameInput.value.trim()) {
        node.name = tacticNameInput.value.trim();
      }

      node.initiativeId = tacticInitSelect.value || null;
      const wasStandalone = node.isStandalone;
      node.isStandalone = tacticStandaloneCb.checked;
      node.serviceLines = JSON.parse(JSON.stringify(currentServiceLines));

      if (node.isStandalone) {
        const newDate = new Date(tacticDateInput.value);
        const origMonth = new Date(node.timestamp).getMonth();
        if (!isNaN(newDate.getTime()) && newDate.getMonth() === origMonth) {
          node.timestamp = newDate.getTime();
          if (currentMode === "quarterly" || !wasStandalone) {
            node.durationDays = 1;
          }
        }
      } else {
        // Revert back to full month duration
        const d = new Date(node.timestamp);
        const dropYear = d.getFullYear();
        const dropMonth = d.getMonth();
        const firstDayOfMonth = new Date(dropYear, dropMonth, 1);
        const daysInMonth = new Date(dropYear, dropMonth + 1, 0).getDate();

        node.timestamp = firstDayOfMonth.getTime();
        node.durationDays = daysInMonth;
      }

      tacticConfigModal.style.display = "none";
      updateLayout();
    });

  // --- 9. UX Polish: Context Menu & Inline Editing ---
  const ctxMenu = document.getElementById("context-menu");
  let ctxNodeId = null;

  gridContainer.addEventListener("contextmenu", (e) => {
    const nodeEl = e.target.closest(".canvas-node");
    if (!nodeEl) return;

    e.preventDefault();
    e.stopPropagation();
    ctxNodeId = nodeEl.id;

    ctxMenu.style.display = "block";

    // Ensure menu doesn't go off-screen
    let x = e.clientX;
    let y = e.clientY;
    if (x + 180 > window.innerWidth) x -= 180;
    if (y + 150 > window.innerHeight) y -= 150;

    ctxMenu.style.left = `${x}px`;
    ctxMenu.style.top = `${y}px`;
  });

  document.addEventListener("click", (e) => {
    if (ctxMenu && !e.target.closest("#context-menu")) {
      ctxMenu.style.display = "none";
    }
  });

  document.getElementById("ctx-edit-name").addEventListener("click", () => {
    ctxMenu.style.display = "none";
    if (ctxNodeId) triggerInlineEdit(ctxNodeId);
  });

  document.getElementById("ctx-assign-init").addEventListener("click", () => {
    ctxMenu.style.display = "none";
    if (ctxNodeId) openTacticConfigModal(ctxNodeId);
  });

  document.getElementById("ctx-duplicate").addEventListener("click", () => {
    ctxMenu.style.display = "none";
    if (ctxNodeId) {
      const original = nodesData.find((n) => n.id === ctxNodeId);
      if (original) {
        const clone = JSON.parse(JSON.stringify(original));
        clone.id = "node-" + Math.random().toString(36).substring(2, 9);
        clone.splitChildIds = [];
        clone.splitParentId = null;
        // Add an hour so it visually offsets if sorted, but layout engine stacks it anyway
        clone.timestamp += 3600000;
        nodesData.push(clone);
        updateLayout();
      }
    }
  });

  document.getElementById("ctx-delete").addEventListener("click", () => {
    ctxMenu.style.display = "none";
    if (ctxNodeId) deleteNodeData(ctxNodeId);
  });

  function triggerInlineEdit(nodeId) {
    const el = document.getElementById(nodeId);
    const data = nodesData.find((n) => n.id === nodeId);
    if (!el || !data) return;

    const span = el.querySelector(".node-name") || el.querySelector("span");
    if (!span || span.classList.contains("tactic-inline-input")) return; // Prevent double triggering

    const input = document.createElement("input");
    input.type = "text";
    input.value = data.name;
    input.className = "tactic-inline-input";

    span.replaceWith(input);
    input.focus();
    input.select();

    let saved = false;
    function saveEdit() {
      if (saved) return;
      saved = true;
      if (input.value.trim()) {
        data.name = input.value.trim();
      }
      updateLayout();
    }

    input.addEventListener("blur", saveEdit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        saveEdit();
      } else if (e.key === "Escape") {
        saved = true; // prevent blur from triggering save
        updateLayout(); // Revert
      }
    });
  }

  gridContainer.addEventListener("dblclick", (e) => {
    const nodeEl = e.target.closest(".canvas-node");
    if (!nodeEl) return;
    // Don't trigger if they double click the resize handle or delete button
    if (
      e.target.classList.contains("resize-handle") ||
      e.target.classList.contains("delete-btn")
    )
      return;

    triggerInlineEdit(nodeEl.id);
  });

  // Keep lines glued to blocks if the browser resizes
  window.addEventListener("resize", redrawConnections);

  // --- 10. Guided Onboarding ---
  const tooltip = document.getElementById("onboarding-tooltip");
  const tooltipContent = document.getElementById("onboarding-content");
  const tooltipArrow = document.getElementById("onboarding-arrow");

  document.getElementById("onboarding-close").addEventListener("click", () => {
    onboardingStep++;
    checkOnboarding();
  });

  function checkOnboarding() {
    if (onboardingStep === 0 && activeChannels.length > 0) {
      onboardingStep = 1;
    }
    if (onboardingStep === 1 && initiatives.length > 0) {
      onboardingStep = 2;
    }
    if (onboardingStep === 2 && nodesData.length > 0) {
      onboardingStep = 3;
    }

    if (onboardingStep === 1) {
      // Point to Manage Initiative button
      const btn = document.getElementById("manage-initiative-btn");
      if (btn) {
        const rect = btn.getBoundingClientRect();
        tooltip.style.display = "block";
        tooltip.style.top = `${rect.bottom + 15}px`;
        // Align the tooltip so its left edge is slightly inside the button,
        // making the arrow (at left: 20px) point to the center-left of the button.
        tooltip.style.left = `${rect.left + 20}px`;
        tooltipContent.innerHTML = `🎉 Channels added!<br>Next, click here to create an <b>Initiative</b> to group your tactics (Optional).`;
        tooltipArrow.className = "tooltip-arrow top";
      }
    } else if (onboardingStep === 2) {
      // Point to sidebar
      const sidebar = document.querySelector(".sidebar");
      if (sidebar) {
        const rect = sidebar.getBoundingClientRect();
        tooltip.style.display = "block";
        tooltip.style.top = `${rect.top + 100}px`;
        tooltip.style.left = `${rect.right + 10}px`;
        tooltipContent.innerHTML = `✨ Now drag a tactic from the library onto the grid to begin building your journey!`;
        tooltipArrow.className = "tooltip-arrow left";
      }
    } else {
      tooltip.style.display = "none";
    }
  }

  // Initial checks
  checkOnboarding();

  // --- 11. Seed Test Data ---
  function seedTestData() {
    nodesData = [];
    connections = [];
    initiatives = [];
    onboardingStep = 3;

    startDate = new Date("2026-06-01");
    endDate = new Date("2026-08-31");
    document.getElementById("start-date").value = "2026-06-01";
    document.getElementById("end-date").value = "2026-08-31";

    activeChannels = [
      { id: "field-promotion", name: "Field / Personal Promotion" },
      { id: "digital-remote", name: "Digital & Remote" },
    ];

    let nid = 0;
    const F = "field-promotion",
      D = "digital-remote";
    function mk(lane, type, name, date) {
      const id = `s${nid++}`;
      nodesData.push({
        id,
        laneId: lane,
        type,
        name,
        timestamp: new Date(date).getTime(),
        durationDays: 1,
      });
      return id;
    }
    function c(a, b, t) {
      connections.push({ sourceId: a, targetId: b, type: t || "next" });
    }

    // == Jun 01: Digital 3x In-Pharmacy Act ==
    const di1 = mk(D, "pharmacy-act", "In-Pharmacy Activation", "2026-06-01");
    const di2 = mk(D, "pharmacy-act", "In-Pharmacy Activation", "2026-06-01");
    const di3 = mk(D, "pharmacy-act", "In-Pharmacy Activation", "2026-06-01");

    // == Jun 06-08: Field 3x In-Pharm + 9x TV ==
    const fa1 = mk(F, "pharmacy-act", "In-Pharmacy Activation", "2026-06-06");
    const fa2 = mk(F, "pharmacy-act", "In-Pharmacy Activation", "2026-06-07");
    const fa3 = mk(F, "pharmacy-act", "In-Pharmacy Activation", "2026-06-08");
    const ft1 = mk(F, "tv", "TV Advertising", "2026-06-06");
    const ft2 = mk(F, "tv", "TV Advertising", "2026-06-07");
    const ft3 = mk(F, "tv", "TV Advertising", "2026-06-08");
    const ft4 = mk(F, "tv", "TV Advertising", "2026-06-06");
    const ft5 = mk(F, "tv", "TV Advertising", "2026-06-07");
    const ft6 = mk(F, "tv", "TV Advertising", "2026-06-08");
    const ft7 = mk(F, "tv", "TV Advertising", "2026-06-06");
    const ft8 = mk(F, "tv", "TV Advertising", "2026-06-07");
    const ft9 = mk(F, "tv", "TV Advertising", "2026-06-08");

    // == Jun 09: Digital 3x Rep Calls ==
    const dr1 = mk(D, "rep-calls", "Pharmacy Rep Calls", "2026-06-09");
    const dr2 = mk(D, "rep-calls", "Pharmacy Rep Calls", "2026-06-09");
    const dr3 = mk(D, "rep-calls", "Pharmacy Rep Calls", "2026-06-09");

    // Sequences
    c(fa1, fa2);
    c(fa2, fa3);
    c(ft1, ft2);
    c(ft2, ft3);
    c(ft4, ft5);
    c(ft5, ft6);
    c(ft7, ft8);
    c(ft8, ft9);
    // Cross-lane
    c(di1, fa1, "echo");
    c(di2, ft1, "echo");
    c(di3, ft4, "echo");
    c(fa3, dr1, "echo");
    c(ft3, dr2, "echo");
    c(ft6, dr3, "echo");

    // == Jun 19: Field 3x Pharmacy Promo ==
    const fp1 = mk(F, "pharmacy-pro", "Pharmacy Promo", "2026-06-19");
    const fp2 = mk(F, "pharmacy-pro", "Pharmacy Promo", "2026-06-19");
    const fp3 = mk(F, "pharmacy-pro", "Pharmacy Promo", "2026-06-19");

    // == Jun 22: Field 3x In-Pharmacy Act ==
    const fb1 = mk(F, "pharmacy-act", "In-Pharmacy Activation", "2026-06-22");
    const fb2 = mk(F, "pharmacy-act", "In-Pharmacy Activation", "2026-06-22");
    const fb3 = mk(F, "pharmacy-act", "In-Pharmacy Activation", "2026-06-22");

    // == Jun 27: Field 3x Rep Calls ==
    const fr1 = mk(F, "rep-calls", "Pharmacy Rep Calls", "2026-06-27");
    const fr2 = mk(F, "rep-calls", "Pharmacy Rep Calls", "2026-06-27");
    const fr3 = mk(F, "rep-calls", "Pharmacy Rep Calls", "2026-06-27");

    c(fp1, fb1);
    c(fb1, fr1);
    c(fp2, fb2);
    c(fb2, fr2);
    c(fp3, fb3);
    c(fb3, fr3);

    // == Jul 03: Digital 3x Webinar ==
    const dw1 = mk(D, "webinar", "Webinar", "2026-07-03");
    const dw2 = mk(D, "webinar", "Webinar", "2026-07-03");
    const dw3 = mk(D, "webinar", "Webinar", "2026-07-03");

    c(fr1, dw1, "echo");
    c(fr2, dw2, "echo");
    c(fr3, dw3, "echo");

    // == Jul 09-12: Field In-Pharm + Webinars ==
    const g1a = mk(F, "pharmacy-act", "In-Pharmacy Activation", "2026-07-09");
    const g2a = mk(F, "webinar", "Webinar", "2026-07-09");
    const g3a = mk(F, "webinar", "Webinar", "2026-07-09");
    const g4a = mk(F, "webinar", "Webinar", "2026-07-09");

    const g1b = mk(F, "pharmacy-act", "In-Pharmacy Activation", "2026-07-10");
    const g2b = mk(F, "webinar", "Webinar", "2026-07-10");
    const g3b = mk(F, "webinar", "Webinar", "2026-07-10");
    const g4b = mk(F, "webinar", "Webinar", "2026-07-10");

    const g1c = mk(F, "pharmacy-act", "In-Pharmacy Activation", "2026-07-12");
    const g2c = mk(F, "webinar", "Webinar", "2026-07-12");
    const g3c = mk(F, "webinar", "Webinar", "2026-07-12");
    const g4c = mk(F, "webinar", "Webinar", "2026-07-12");

    c(g1a, g1b);
    c(g1b, g1c);
    c(g2a, g2b);
    c(g2b, g2c);
    c(g3a, g3b);
    c(g3b, g3c);
    c(g4a, g4b);
    c(g4b, g4c);
    c(dw1, g1a, "echo");
    c(dw2, g2a, "echo");
    c(dw3, g3a, "echo");

    // == Jul 17: Field 3x In-Pharmacy Act ==
    const h1 = mk(F, "pharmacy-act", "In-Pharmacy Activation", "2026-07-17");
    const h2 = mk(F, "pharmacy-act", "In-Pharmacy Activation", "2026-07-17");
    const h3 = mk(F, "pharmacy-act", "In-Pharmacy Activation", "2026-07-17");

    c(g1c, h1);
    c(g2c, h2);
    c(g3c, h3);

    // == Jul 21: Field 3x TV Advertising ==
    const j1 = mk(F, "tv", "TV Advertising", "2026-07-21");
    const j2 = mk(F, "tv", "TV Advertising", "2026-07-21");
    const j3 = mk(F, "tv", "TV Advertising", "2026-07-21");

    c(h1, j1);
    c(h2, j2);
    c(h3, j3);

    // == Jul 24: Field 3x Pharmacy Promo ==
    const k1 = mk(F, "pharmacy-pro", "Pharmacy Promo", "2026-07-24");
    const k2 = mk(F, "pharmacy-pro", "Pharmacy Promo", "2026-07-24");
    const k3 = mk(F, "pharmacy-pro", "Pharmacy Promo", "2026-07-24");

    c(j1, k1);
    c(j2, k2);
    c(j3, k3);

    // == Digital Jul 09-30 ==
    const dw4 = mk(D, "webinar", "Webinar", "2026-07-09");
    const dw5 = mk(D, "webinar", "Webinar", "2026-07-09");
    const dw6 = mk(D, "webinar", "Webinar", "2026-07-09");
    const dp1 = mk(D, "pharmacy-pro", "Pharmacy Promo", "2026-07-21");
    const dp2 = mk(D, "pharmacy-pro", "Pharmacy Promo", "2026-07-21");
    const dp3 = mk(D, "pharmacy-pro", "Pharmacy Promo", "2026-07-21");
    const dr4 = mk(D, "rep-calls", "Pharmacy Rep Calls", "2026-07-30");
    const dr5 = mk(D, "rep-calls", "Pharmacy Rep Calls", "2026-07-30");

    c(dw4, dp1);
    c(dw5, dp2);
    c(dw6, dp3);
    c(dp1, dr4);
    c(dp2, dr5);
    c(k1, dp1, "echo");
    c(k2, dp2, "echo");
    c(k3, dp3, "echo");

    updateLayout();
    console.log(
      "%c✅ Seeded " +
        nodesData.length +
        " tactics and " +
        connections.length +
        " connections.",
      "color: green; font-weight: bold",
    );
  }

  // --- Business Rule Modal Logic ---
  const ruleConfigModal = document.getElementById("rule-config-modal");
  const closeRuleConfigBtn = document.getElementById("close-rule-config-btn");
  const saveRuleConfigBtn = document.getElementById("save-rule-config-btn");
  const deleteRuleBtn = document.getElementById("delete-rule-btn");
  const configRuleConnIndex = document.getElementById("config-rule-conn-index");
  const ruleNameInput = document.getElementById("rule-name");
  const ruleDescriptionInput = document.getElementById("rule-description");

  function openRuleModal(connIdx) {
    const conn = connections[connIdx];
    if (!conn) return;

    configRuleConnIndex.value = connIdx;

    if (conn.rule) {
      ruleNameInput.value = conn.rule.name || "";
      ruleDescriptionInput.value = conn.rule.description || "";
      deleteRuleBtn.style.display = "block";
    } else {
      ruleNameInput.value = "";
      ruleDescriptionInput.value = "";
      deleteRuleBtn.style.display = "none";
    }

    ruleConfigModal.style.display = "flex";
  }

  closeRuleConfigBtn.addEventListener("click", () => {
    ruleConfigModal.style.display = "none";
  });

  saveRuleConfigBtn.addEventListener("click", () => {
    const connIdx = configRuleConnIndex.value;
    const conn = connections[connIdx];
    if (conn) {
      const name = ruleNameInput.value.trim();
      const desc = ruleDescriptionInput.value.trim();

      if (name) {
        conn.rule = {
          name: name,
          description: desc,
        };
      } else {
        delete conn.rule;
      }
      redrawConnections();
    }
    ruleConfigModal.style.display = "none";
  });

  deleteRuleBtn.addEventListener("click", () => {
    const connIdx = configRuleConnIndex.value;
    const conn = connections[connIdx];
    if (conn) {
      delete conn.rule;
      redrawConnections();
    }
    ruleConfigModal.style.display = "none";
  });

  // --- 11. Simulation Mode ---
  const simulateBtn = document.getElementById("simulate-btn");
  let isSimulating = false;
  let simulationTimeouts = [];
  let activeParticles = [];

  function stopSimulation() {
    isSimulating = false;
    document.body.classList.remove("simulation-mode");
    if (simulateBtn) simulateBtn.innerText = "▶ Simulate";

    // Clear all timeouts and particles
    simulationTimeouts.forEach(clearTimeout);
    simulationTimeouts = [];
    activeParticles.forEach((p) => p.remove());
    activeParticles = [];

    // Remove active classes
    document
      .querySelectorAll(".sim-active")
      .forEach((el) => el.classList.remove("sim-active"));
    document.querySelectorAll(".sim-tooltip").forEach((el) => el.remove());
  }

  async function startSimulation() {
    isSimulating = true;
    document.body.classList.add("simulation-mode");
    if (simulateBtn) simulateBtn.innerText = "⏹ Stop Simulation";

    // Find start nodes (nodes with no incoming connections)
    const targetIds = new Set(connections.map((c) => c.targetId));
    const startNodes = nodesData.filter((n) => !targetIds.has(n.id));

    if (startNodes.length === 0) {
      console.warn(
        "No starting tactics found. Add tactics and connect them to simulate the journey.",
      );
      stopSimulation();
      return;
    }

    // Delay to allow CSS transition to dark mode
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Start processing from root nodes
    startNodes.forEach((node) => playNode(node.id));
  }

  function animateParticleAlongPath(pathEl, duration) {
    return new Promise((resolve) => {
      if (!isSimulating) return resolve();

      const particle = document.createElement("div");
      particle.className = "sim-particle";
      document.body.appendChild(particle);
      activeParticles.push(particle);

      const pathLength = pathEl.getTotalLength();
      const startTime = performance.now();

      // We need to offset the particle based on the SVG canvas position
      const svgRect = svgCanvas.getBoundingClientRect();

      function step(currentTime) {
        if (!isSimulating) return resolve();

        let elapsed = currentTime - startTime;
        let progress = Math.min(elapsed / duration, 1);

        const point = pathEl.getPointAtLength(progress * pathLength);

        particle.style.left = svgRect.left + point.x + "px";
        particle.style.top = svgRect.top + point.y + "px";

        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          particle.remove();
          activeParticles = activeParticles.filter((p) => p !== particle);
          resolve();
        }
      }
      requestAnimationFrame(step);
    });
  }

  function showTooltip(x, y, text) {
    const tooltip = document.createElement("div");
    tooltip.className = "sim-tooltip";
    tooltip.innerText = text;
    tooltip.style.left = x + "px";
    tooltip.style.top = y + "px";
    document.body.appendChild(tooltip);

    setTimeout(() => {
      if (tooltip.parentNode) tooltip.remove();
    }, 1500);
  }

  async function playNode(nodeId) {
    if (!isSimulating) return;

    const el = document.getElementById(nodeId);
    if (el) {
      el.classList.add("sim-active");
      // Scroll into view if needed
      el.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "center",
      });
    }

    await new Promise((r) => {
      const t = setTimeout(r, 600);
      simulationTimeouts.push(t);
    });

    if (!isSimulating) return;

    // Find outgoing connections
    const outgoingConns = connections
      .map((c, i) => ({ ...c, index: i }))
      .filter((c) => c.sourceId === nodeId);

    if (outgoingConns.length === 0) {
      // End of path
      return;
    }

    // Animate all outgoing connections concurrently
    await Promise.all(
      outgoingConns.map(async (conn) => {
        const pathEl = document.querySelector(
          `.path-line[data-index="${conn.index}"]`,
        );
        if (!pathEl) return;

        if (conn.rule) {
          // Show tooltip at start of path
          const pt = pathEl.getPointAtLength(0);
          const svgRect = svgCanvas.getBoundingClientRect();
          showTooltip(
            svgRect.left + pt.x,
            svgRect.top + pt.y,
            `Evaluating: ${conn.rule.name}`,
          );

          await new Promise((r) => {
            const t = setTimeout(r, 1000);
            simulationTimeouts.push(t);
          });
        }

        if (!isSimulating) return;

        pathEl.classList.add("sim-active");

        // Particle animation taking 1.5 seconds
        await animateParticleAlongPath(pathEl, 1500);

        if (!isSimulating) return;

        // Recursively play target node
        playNode(conn.targetId);
      }),
    );
  }

  if (simulateBtn) {
    simulateBtn.addEventListener("click", () => {
      if (isSimulating) {
        stopSimulation();
      } else {
        startSimulation();
      }
    });
  }

  // seedTestData available via console: call seedTestData() from DOMContentLoaded scope
});
