const heightmap = require('../config/forestHeightmap.json');

function getTerrainHeight(x, z) {
  const clampedX = Math.max(heightmap.minX, Math.min(heightmap.maxX, x));
  const clampedZ = Math.max(heightmap.minZ, Math.min(heightmap.maxZ, z));

  const u = (clampedX - heightmap.minX) / (heightmap.maxX - heightmap.minX);
  const v = (clampedZ - heightmap.minZ) / (heightmap.maxZ - heightmap.minZ);

  const col = Math.min(heightmap.resX - 2, Math.max(0, Math.floor(u * (heightmap.resX - 1))));
  const row = Math.min(heightmap.resZ - 2, Math.max(0, Math.floor(v * (heightmap.resZ - 1))));

  const fx = (u * (heightmap.resX - 1)) - col;
  const fz = (v * (heightmap.resZ - 1)) - row;

  const h00 = heightmap.grid[row][col];
  const h10 = heightmap.grid[row][col + 1];
  const h01 = heightmap.grid[row + 1][col];
  const h11 = heightmap.grid[row + 1][col + 1];

  const hTop = h00 * (1 - fx) + h10 * fx;
  const hBottom = h01 * (1 - fx) + h11 * fx;

  return hTop * (1 - fz) + hBottom * fz;
}

module.exports = {
  getTerrainHeight,
  heightmap
};

