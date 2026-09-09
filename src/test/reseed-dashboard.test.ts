// src/test/reseed-dashboard.test.ts
import { describe, expect, it } from "bun:test";
import { renderReseedDashboard } from "../reseed-dashboard";

describe("reseed-dashboard", () => {
  it("renders accessible controls, summary cards, table, and script module", () => {
    const html = renderReseedDashboard();

    // Accessible labels and inputs
    expect(html).toContain('label for="searchInput"');
    expect(html).toContain('id="searchInput"');

    expect(html).toContain('label for="categorySelect"');
    expect(html).toContain('id="categorySelect"');

    expect(html).toContain('label for="requesterSelect"');
    expect(html).toContain('id="requesterSelect"');

    expect(html).toContain('label for="minBonusInput"');
    expect(html).toContain('id="minBonusInput"');
    expect(html).toContain('label for="maxBonusInput"');
    expect(html).toContain('id="maxBonusInput"');

    expect(html).toContain('label for="minSizeInput"');
    expect(html).toContain('id="minSizeInput"');
    expect(html).toContain('label for="maxSizeInput"');
    expect(html).toContain('id="maxSizeInput"');

    expect(html).toContain('label for="fromDateInput"');
    expect(html).toContain('id="fromDateInput"');
    expect(html).toContain('label for="toDateInput"');
    expect(html).toContain('id="toDateInput"');

    // Controls
    expect(html).toContain('id="clearFiltersBtn"');
    expect(html).toContain("Clear Filters");
    expect(html).toContain('id="refreshBtn"');
    expect(html).toContain("Refresh");

    // Summary cards
    expect(html).toContain('id="summaryCount"');
    expect(html).toContain('id="summaryBonus"');
    expect(html).toContain('id="summarySyncTime"');
    expect(html).toContain('id="summaryState"');

    // Table and wrapper
    expect(html).toContain("<table");
    expect(html).toContain('id="reseedTable"');

    // Script module and link back to main dashboard
    expect(html).toContain('<script type="module" src="/reseed-ui.js"></script>');
    expect(html).toContain('href="/"');
  });
});
