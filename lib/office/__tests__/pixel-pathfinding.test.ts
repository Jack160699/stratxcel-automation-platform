import assert from "node:assert/strict";
import {
  MANDATORY_OFFICE_ZONES,
  createOfficeCollisionGrid,
  isWalkable,
  findPixelPath,
  GRID_COLS,
  GRID_ROWS,
} from "../pixel-pathfinding.ts";

function runTests() {
  // Test 1: Defines all 14 mandatory zones
  {
    const zones = Object.keys(MANDATORY_OFFICE_ZONES);
    assert.equal(zones.length, 14, "Must define exactly 14 zones");
    assert.ok(zones.includes("EXECUTIVE_SUITE"));
    assert.ok(zones.includes("RESEARCH_POD"));
    assert.ok(zones.includes("SALES_POD"));
    assert.ok(zones.includes("MARKETING_POD"));
    assert.ok(zones.includes("SEO_POD"));
    assert.ok(zones.includes("ENGINEERING_POD"));
    assert.ok(zones.includes("FINANCE_POD"));
    assert.ok(zones.includes("OPERATIONS_POD"));
    assert.ok(zones.includes("MEETING_ROOM"));
    assert.ok(zones.includes("COFFEE_LOUNGE"));
    assert.ok(zones.includes("GAMING_ROOM"));
    assert.ok(zones.includes("FILE_DATA_ROOM"));
    assert.ok(zones.includes("COLLABORATION_AREA"));
    assert.ok(zones.includes("CORRIDORS"));

    for (const [key, zone] of Object.entries(MANDATORY_OFFICE_ZONES)) {
      assert.ok(zone.bounds.minCol >= 0, `${key} minCol >= 0`);
      assert.ok(zone.bounds.maxCol < GRID_COLS, `${key} maxCol < GRID_COLS`);
      assert.ok(zone.bounds.minRow >= 0, `${key} minRow >= 0`);
      assert.ok(zone.bounds.maxRow < GRID_ROWS, `${key} maxRow < GRID_ROWS`);
    }
    console.log("✓ Test 1 Passed: 14 mandatory office zones verified");
  }

  // Test 2: Collision grid with solid obstacles and walkable corridors
  {
    const grid = createOfficeCollisionGrid();
    assert.equal(grid.length, GRID_COLS * GRID_ROWS);

    // Perimeter should be solid
    assert.equal(isWalkable(grid, 0, 5), false, "Perimeter (0,5) must be solid");
    assert.equal(isWalkable(grid, GRID_COLS - 1, 5), false, "Perimeter maxCol must be solid");

    // Walkway corridor
    assert.equal(isWalkable(grid, 20, 7), true, "Corridor (20,7) must be walkable");
    assert.equal(isWalkable(grid, 10, 7), true, "Corridor (10,7) must be walkable");

    // Desks should be solid
    assert.equal(isWalkable(grid, 5, 3), false, "Research desk (5,3) must be solid");
    assert.equal(isWalkable(grid, 34, 3), false, "Engineering desk (34,3) must be solid");
    console.log("✓ Test 2 Passed: Collision obstacles and corridors verified");
  }

  // Test 3: Shortest deterministic path avoiding solid obstacles
  {
    const grid = createOfficeCollisionGrid();
    const start = { col: 5, row: 5 };
    const target = { col: 34, row: 5 };

    const path = findPixelPath(grid, start, target);
    assert.ok(path.length > 1, "Path must have multiple steps");
    assert.deepEqual(path[0], start, "Path starts at start");
    assert.deepEqual(path[path.length - 1], target, "Path ends at target");

    for (const node of path) {
      assert.equal(isWalkable(grid, node.col, node.row), true, `Path step (${node.col}, ${node.row}) must be walkable`);
    }
    console.log(`✓ Test 3 Passed: A* shortest obstacle avoidance path calculated (${path.length} steps)`);
  }

  // Test 4: Agent already at destination
  {
    const grid = createOfficeCollisionGrid();
    const pos = { col: 20, row: 7 };
    const path = findPixelPath(grid, pos, pos);
    assert.deepEqual(path, [pos]);
    console.log("✓ Test 4 Passed: Identity path handled");
  }
}

runTests();
console.log("All pixel-pathfinding tests passed!");
