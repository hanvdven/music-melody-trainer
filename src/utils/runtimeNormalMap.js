// #141 round 14 (Han, NL: "Is het niet gewoon beter om een normal map ook op het gras te maken? Het level
// is statisch je kan die bij app-constructie eenmalig opbouwen denk ik..." — "isn't it just better to also
// build a normal map for the grass too? The level is static, you can build it once at app construction"):
// browser-side Sobel normal-map generation, mirroring scripts/generate-tree-normal-maps.mjs's own algorithm
// (same STRENGTH-scaled height-gradient-from-luminance technique, kept in sync by hand) but running once at
// runtime via Canvas2D instead of a Node build step — needed because the floor's exact random tile
// arrangement (RpgLevelPanel.jsx's `floorTileIdx`) doesn't exist until the level itself is constructed, so
// there's no fixed source image a build-time script could point at.
const STRENGTH = 4.5;

function luminanceAt(data, width, height, x, y) {
    const cx = Math.max(0, Math.min(width - 1, x));
    const cy = Math.max(0, Math.min(height - 1, y));
    const i = (cy * width + cx) * 4;
    if (data[i + 3] === 0) return 0;
    return (data[i] + data[i + 1] + data[i + 2]) / (3 * 255);
}

export function sobelNormalMap(imageData) {
    const { width, height, data } = imageData;
    const out = new ImageData(width, height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const tl = luminanceAt(data, width, height, x - 1, y - 1), t = luminanceAt(data, width, height, x, y - 1), tr = luminanceAt(data, width, height, x + 1, y - 1);
            const l = luminanceAt(data, width, height, x - 1, y), r = luminanceAt(data, width, height, x + 1, y);
            const bl = luminanceAt(data, width, height, x - 1, y + 1), b = luminanceAt(data, width, height, x, y + 1), br = luminanceAt(data, width, height, x + 1, y + 1);
            const gx = (tr + 2 * r + br) - (tl + 2 * l + bl);
            const gy = (bl + 2 * b + br) - (tl + 2 * t + tr);
            let nx = -gx * STRENGTH, ny = -gy * STRENGTH, nz = 1;
            const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
            nx /= len; ny /= len; nz /= len;
            const i = (y * width + x) * 4;
            out.data[i] = Math.round((nx * 0.5 + 0.5) * 255);
            out.data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
            out.data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
            out.data[i + 3] = 255;   // data texture, not blended — always opaque
        }
    }
    return out;
}

export function loadImageEl(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });
}

// Crops one region of a loaded <img> into its own canvas — the source for both the diffuse tile itself
// and the input to sobelNormalMap.
export function cropToCanvas(img, sx, sy, sw, sh) {
    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    return canvas;
}

export function normalMapCanvasFromCrop(img, sx, sy, sw, sh) {
    const cropCanvas = cropToCanvas(img, sx, sy, sw, sh);
    const imageData = cropCanvas.getContext('2d').getImageData(0, 0, sw, sh);
    const normalData = sobelNormalMap(imageData);
    const outCanvas = document.createElement('canvas');
    outCanvas.width = sw;
    outCanvas.height = sh;
    outCanvas.getContext('2d').putImageData(normalData, 0, 0);
    return outCanvas;
}
