// High-Performance 2D Spatial Hash Grid for Forest Tree Obstacles
// Reduces collision checks from O(N) (all 83 trees) to O(1) (1-3 nearby trees)

class TreeSpatialGrid {
  constructor(trees, cellSize = 12.0) {
    this.cellSize = cellSize;
    this.trees = trees || [];
    this.cells = new Map();

    for (let i = 0; i < this.trees.length; i++) {
      const tree = this.trees[i];
      const minCx = Math.floor((tree.x - tree.radius) / cellSize);
      const maxCx = Math.floor((tree.x + tree.radius) / cellSize);
      const minCz = Math.floor((tree.z - tree.radius) / cellSize);
      const maxCz = Math.floor((tree.z + tree.radius) / cellSize);

      for (let cx = minCx; cx <= maxCx; cx++) {
        for (let cz = minCz; cz <= maxCz; cz++) {
          const key = `${cx},${cz}`;
          let cell = this.cells.get(key);
          if (!cell) {
            cell = [];
            this.cells.set(key, cell);
          }
          cell.push(tree);
        }
      }
    }
  }

  // Returns only trees in the spatial cell containing (x, z) plus margin
  getNearbyTrees(x, z, searchRadius = 2.5) {
    const minCx = Math.floor((x - searchRadius) / this.cellSize);
    const maxCx = Math.floor((x + searchRadius) / this.cellSize);
    const minCz = Math.floor((z - searchRadius) / this.cellSize);
    const maxCz = Math.floor((z + searchRadius) / this.cellSize);

    // Common fast path: query is completely contained inside a single cell
    if (minCx === maxCx && minCz === maxCz) {
      return this.cells.get(`${minCx},${minCz}`) || [];
    }

    const nearby = [];
    const seen = new Set();
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const cell = this.cells.get(`${cx},${cz}`);
        if (cell) {
          for (let i = 0; i < cell.length; i++) {
            const tree = cell[i];
            if (!seen.has(tree)) {
              seen.add(tree);
              nearby.push(tree);
            }
          }
        }
      }
    }
    return nearby;
  }
}

module.exports = TreeSpatialGrid;
