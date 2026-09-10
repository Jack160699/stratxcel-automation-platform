export interface GridCoord {
  col: number;
  row: number;
}

export const GRID_COLS = 40;
export const GRID_ROWS = 24;

export type ZoneKey =
  | "EXECUTIVE_SUITE"
  | "RESEARCH_POD"
  | "SALES_POD"
  | "MARKETING_POD"
  | "SEO_POD"
  | "ENGINEERING_POD"
  | "FINANCE_POD"
  | "OPERATIONS_POD"
  | "MEETING_ROOM"
  | "COFFEE_LOUNGE"
  | "GAMING_ROOM"
  | "FILE_DATA_ROOM"
  | "COLLABORATION_AREA"
  | "CORRIDORS";

export interface ZoneLocation {
  key: ZoneKey;
  name: string;
  departmentKey: string;
  bounds: { minCol: number; maxCol: number; minRow: number; maxRow: number };
  seatCoord: GridCoord;
  standCoord: GridCoord;
  color: string;
}

// 14 Mandatory Zones with exact pixel-grid coordinates
export const MANDATORY_OFFICE_ZONES: Record<ZoneKey, ZoneLocation> = {
  EXECUTIVE_SUITE: {
    key: "EXECUTIVE_SUITE",
    name: "Executive Suite (Hermes CEO)",
    departmentKey: "executive",
    bounds: { minCol: 16, maxCol: 24, minRow: 1, maxRow: 5 },
    seatCoord: { col: 20, row: 3 },
    standCoord: { col: 20, row: 4 },
    color: "#06b6d4",
  },
  RESEARCH_POD: {
    key: "RESEARCH_POD",
    name: "Research & Market Intelligence",
    departmentKey: "research",
    bounds: { minCol: 2, maxCol: 9, minRow: 2, maxRow: 6 },
    seatCoord: { col: 5, row: 4 },
    standCoord: { col: 5, row: 5 },
    color: "#38bdf8",
  },
  SALES_POD: {
    key: "SALES_POD",
    name: "Sales & Outbound Outreach",
    departmentKey: "sales",
    bounds: { minCol: 2, maxCol: 9, minRow: 8, maxRow: 12 },
    seatCoord: { col: 5, row: 10 },
    standCoord: { col: 5, row: 11 },
    color: "#f43f5e",
  },
  MARKETING_POD: {
    key: "MARKETING_POD",
    name: "Marketing & Creative Content",
    departmentKey: "content",
    bounds: { minCol: 2, maxCol: 9, minRow: 14, maxRow: 18 },
    seatCoord: { col: 5, row: 16 },
    standCoord: { col: 5, row: 17 },
    color: "#a855f7",
  },
  SEO_POD: {
    key: "SEO_POD",
    name: "SEO & Search Console",
    departmentKey: "seo",
    bounds: { minCol: 11, maxCol: 16, minRow: 8, maxRow: 12 },
    seatCoord: { col: 13, row: 10 },
    standCoord: { col: 13, row: 11 },
    color: "#10b981",
  },
  ENGINEERING_POD: {
    key: "ENGINEERING_POD",
    name: "Engineering & Self-Repair Pod",
    departmentKey: "engineering",
    bounds: { minCol: 30, maxCol: 38, minRow: 2, maxRow: 6 },
    seatCoord: { col: 34, row: 4 },
    standCoord: { col: 34, row: 5 },
    color: "#3b82f6",
  },
  FINANCE_POD: {
    key: "FINANCE_POD",
    name: "Finance & Revenue Ops",
    departmentKey: "finance",
    bounds: { minCol: 30, maxCol: 38, minRow: 8, maxRow: 12 },
    seatCoord: { col: 34, row: 10 },
    standCoord: { col: 34, row: 11 },
    color: "#f59e0b",
  },
  OPERATIONS_POD: {
    key: "OPERATIONS_POD",
    name: "Operations & Delivery Queue",
    departmentKey: "operations",
    bounds: { minCol: 30, maxCol: 38, minRow: 14, maxRow: 18 },
    seatCoord: { col: 34, row: 16 },
    standCoord: { col: 34, row: 17 },
    color: "#14b8a6",
  },
  MEETING_ROOM: {
    key: "MEETING_ROOM",
    name: "Central Strategic Conference Room",
    departmentKey: "executive",
    bounds: { minCol: 17, maxCol: 23, minRow: 8, maxRow: 14 },
    seatCoord: { col: 20, row: 11 },
    standCoord: { col: 20, row: 12 },
    color: "#6366f1",
  },
  COFFEE_LOUNGE: {
    key: "COFFEE_LOUNGE",
    name: "Barista Coffee Lounge",
    departmentKey: "general",
    bounds: { minCol: 1, maxCol: 7, minRow: 20, maxRow: 23 },
    seatCoord: { col: 4, row: 22 },
    standCoord: { col: 4, row: 21 },
    color: "#d97706",
  },
  GAMING_ROOM: {
    key: "GAMING_ROOM",
    name: "Arcade & Recreation Zone",
    departmentKey: "general",
    bounds: { minCol: 9, maxCol: 15, minRow: 20, maxRow: 23 },
    seatCoord: { col: 12, row: 22 },
    standCoord: { col: 12, row: 21 },
    color: "#ec4899",
  },
  FILE_DATA_ROOM: {
    key: "FILE_DATA_ROOM",
    name: "Artifact Archives & Memory Bot",
    departmentKey: "data",
    bounds: { minCol: 25, maxCol: 30, minRow: 20, maxRow: 23 },
    seatCoord: { col: 27, row: 22 },
    standCoord: { col: 27, row: 21 },
    color: "#8b5cf6",
  },
  COLLABORATION_AREA: {
    key: "COLLABORATION_AREA",
    name: "Cross-Department Whiteboard Dais",
    departmentKey: "collaborative",
    bounds: { minCol: 17, maxCol: 23, minRow: 16, maxRow: 19 },
    seatCoord: { col: 20, row: 17 },
    standCoord: { col: 20, row: 18 },
    color: "#10b981",
  },
  CORRIDORS: {
    key: "CORRIDORS",
    name: "Walkway Aisles & Intersections",
    departmentKey: "general",
    bounds: { minCol: 0, maxCol: 39, minRow: 0, maxRow: 23 },
    seatCoord: { col: 20, row: 7 },
    standCoord: { col: 20, row: 7 },
    color: "#64748b",
  },
};

// Static Collision Grid: 0 = Walkable, 1 = Solid Obstacle (Desk, Wall, Partition)
export function createOfficeCollisionGrid(): Uint8Array {
  const grid = new Uint8Array(GRID_COLS * GRID_ROWS);

  function setSolid(c: number, r: number) {
    if (c >= 0 && c < GRID_COLS && r >= 0 && r < GRID_ROWS) {
      grid[r * GRID_COLS + c] = 1;
    }
  }

  // Outer perimeter boundaries
  for (let c = 0; c < GRID_COLS; c++) {
    setSolid(c, 0);
    setSolid(c, GRID_ROWS - 1);
  }
  for (let r = 0; r < GRID_ROWS; r++) {
    setSolid(0, r);
    setSolid(GRID_COLS - 1, r);
  }

  // Solid Desks for Research, Sales, Marketing Pods (Cols 3..7)
  [3, 9, 15].forEach((r) => {
    for (let c = 4; c <= 7; c++) setSolid(c, r);
  });

  // Solid Desks for Engineering, Finance, Operations Pods (Cols 32..36)
  [3, 9, 15].forEach((r) => {
    for (let c = 32; c <= 35; c++) setSolid(c, r);
  });

  // Solid SEO Pod desk (Col 12..14, Row 9)
  for (let c = 12; c <= 14; c++) setSolid(c, 9);

  // Meeting Room Center Table (Cols 19..21, Rows 10..11)
  for (let c = 19; c <= 21; c++) {
    setSolid(c, 10);
    setSolid(c, 11);
  }

  // Executive Hermes Suite Desk (Cols 19..21, Row 2)
  for (let c = 19; c <= 21; c++) setSolid(c, 2);

  // Coffee Lounge Bar (Cols 2..5, Row 23)
  for (let c = 2; c <= 5; c++) setSolid(c, 23);

  // Gaming Room Cabinets (Cols 10..13, Row 23)
  for (let c = 10; c <= 13; c++) setSolid(c, 23);

  // File Data Racks (Cols 26..28, Row 23)
  for (let c = 26; c <= 28; c++) setSolid(c, 23);

  return grid;
}

export function isWalkable(grid: Uint8Array, col: number, row: number): boolean {
  if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return false;
  return grid[row * GRID_COLS + col] === 0;
}

interface PathNode {
  col: number;
  row: number;
  g: number;
  h: number;
  f: number;
  parent?: PathNode;
}

// A* Deterministic Pathfinding Algorithm
export function findPixelPath(
  grid: Uint8Array,
  start: GridCoord,
  target: GridCoord
): GridCoord[] {
  // If already at target
  if (start.col === target.col && start.row === target.row) {
    return [start];
  }

  // Ensure target is walkable; if target itself is solid (e.g. seated inside desk), use nearest walkable neighbor
  let dest = { ...target };
  if (!isWalkable(grid, dest.col, dest.row)) {
    const neighbors = [
      { col: dest.col, row: dest.row + 1 },
      { col: dest.col, row: dest.row - 1 },
      { col: dest.col + 1, row: dest.row },
      { col: dest.col - 1, row: dest.row },
    ];
    const valid = neighbors.find((n) => isWalkable(grid, n.col, n.row));
    if (valid) dest = valid;
    else return [start];
  }

  function heuristic(a: GridCoord, b: GridCoord): number {
    return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
  }

  const openList: PathNode[] = [];
  const closedSet = new Set<number>();

  const startNode: PathNode = {
    col: start.col,
    row: start.row,
    g: 0,
    h: heuristic(start, dest),
    f: heuristic(start, dest),
  };
  openList.push(startNode);

  const keyFor = (c: number, r: number) => r * GRID_COLS + c;

  while (openList.length > 0) {
    // Find node with lowest f
    let bestIdx = 0;
    for (let i = 1; i < openList.length; i++) {
      if (openList[i].f < openList[bestIdx].f) {
        bestIdx = i;
      }
    }

    const current = openList.splice(bestIdx, 1)[0];
    const currentKey = keyFor(current.col, current.row);

    if (current.col === dest.col && current.row === dest.row) {
      // Reconstruct path
      const path: GridCoord[] = [];
      let curr: PathNode | undefined = current;
      while (curr) {
        path.unshift({ col: curr.col, row: curr.row });
        curr = curr.parent;
      }
      return path;
    }

    closedSet.add(currentKey);

    // 4 orthogonal movements (cardinal grid directions for crisp pixel walking)
    const dirs = [
      { col: 0, row: -1 },
      { col: 0, row: 1 },
      { col: -1, row: 0 },
      { col: 1, row: 0 },
    ];

    for (const d of dirs) {
      const nc = current.col + d.col;
      const nr = current.row + d.row;
      const neighborKey = keyFor(nc, nr);

      if (!isWalkable(grid, nc, nr)) continue;
      if (closedSet.has(neighborKey)) continue;

      const tentativeG = current.g + 1;
      const existing = openList.find((n) => n.col === nc && n.row === nr);

      if (!existing) {
        const neighborNode: PathNode = {
          col: nc,
          row: nr,
          g: tentativeG,
          h: heuristic({ col: nc, row: nr }, dest),
          f: tentativeG + heuristic({ col: nc, row: nr }, dest),
          parent: current,
        };
        openList.push(neighborNode);
      } else if (tentativeG < existing.g) {
        existing.g = tentativeG;
        existing.f = tentativeG + existing.h;
        existing.parent = current;
      }
    }
  }

  // If no complete path found, return straight line fallback towards dest
  return [start, dest];
}
