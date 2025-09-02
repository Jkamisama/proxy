/* eslint-disable no-restricted-globals */

// ZXing module cache
let zxingModule = null;

async function loadZXing() {
  if (zxingModule) return zxingModule;
  try {
    // ESM module over CDN; worker is created with type: 'module'
    zxingModule = await import('https://unpkg.com/@zxing/library@latest?module');
    return zxingModule;
  } catch (e) {
    postMessage({ type: 'log', level: 'warn', message: 'Failed to load ZXing module', error: String(e) });
    return null;
  }
}

function decodeBitmapWithZXing(mod, imageData) {
  const { RGBLuminanceSource, BinaryBitmap, HybridBinarizer, MultiFormatReader, DecodeHintType, BarcodeFormat } = mod;
  const luminance = new RGBLuminanceSource(imageData.data, imageData.width, imageData.height);
  const binarizer = new HybridBinarizer(luminance);
  const bitmap = new BinaryBitmap(binarizer);
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  hints.set(DecodeHintType.ALSO_INVERTED, true);
  const reader = new MultiFormatReader();
  reader.setHints(hints);
  const result = reader.decode(bitmap);
  return result?.getText?.() || result?.text || null;
}

function bitmapToImageData(bitmap) {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function toGrayscale(img) {
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const y = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
    data[i] = data[i + 1] = data[i + 2] = y;
  }
  return img;
}

function contrastStretch(img) {
  let min = 255, max = 0;
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const v = data[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = Math.max(1, max - min);
  for (let i = 0; i < data.length; i += 4) {
    const v = ((data[i] - min) * 255) / span;
    const vv = v | 0;
    data[i] = data[i + 1] = data[i + 2] = vv;
  }
  return img;
}

function invert(img) {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 255 - d[i];
    d[i + 1] = 255 - d[i + 1];
    d[i + 2] = 255 - d[i + 2];
  }
  return img;
}

function cropCenter(bitmap, scale = 0.8) {
  const w = bitmap.width;
  const h = bitmap.height;
  const side = Math.floor(Math.min(w, h) * scale);
  const sx = Math.floor((w - side) / 2);
  const sy = Math.floor((h - side) / 2);
  const canvas = new OffscreenCanvas(side, side);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, side, side);
  return canvas.transferToImageBitmap();
}

function scaleBitmap(bitmap, factor = 2) {
  const w = Math.max(1, Math.floor(bitmap.width * factor));
  const h = Math.max(1, Math.floor(bitmap.height * factor));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.transferToImageBitmap();
}

function rotateBitmap(bitmap, deg) {
  const rad = (deg * Math.PI) / 180;
  const w = bitmap.width;
  const h = bitmap.height;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.translate(w / 2, h / 2);
  ctx.rotate(rad);
  ctx.drawImage(bitmap, -w / 2, -h / 2);
  return canvas.transferToImageBitmap();
}

async function tryDecode(bitmap) {
  const mod = await loadZXing();
  if (!mod) return null;
  // Build a pyramid of candidates: [full, 0.8 center, 0.6 center] x [1x, 2x, 3x] x rotations x preprocessing
  const centerScales = [1.0, 0.85, 0.7];
  const upscales = [1.0, 1.8, 2.5];
  const rotations = [0, 90, 180, 270];
  const preprocessors = [
    (im) => im,
    (im) => contrastStretch(toGrayscale(im)),
    (im) => invert(contrastStretch(toGrayscale(im))),
  ];

  for (const c of centerScales) {
    let bmp = bitmap;
    if (c < 0.99) {
      try { bmp = cropCenter(bitmap, c); } catch {}
    }
    for (const rot of rotations) {
      let rbmp = bmp;
      if (rot !== 0) {
        try { rbmp = rotateBitmap(bmp, rot); } catch {}
      }
      for (const s of upscales) {
        let sbmp = rbmp;
        if (s > 1.01) {
          try { sbmp = scaleBitmap(rbmp, s); } catch {}
        }
        const base = bitmapToImageData(sbmp);
        for (const prep of preprocessors) {
          const img = new ImageData(new Uint8ClampedArray(base.data), base.width, base.height);
          const prepped = prep(img);
          try {
            const text = decodeBitmapWithZXing(mod, prepped);
            if (text) return text;
          } catch {}
        }
      }
    }
  }
  return null;
}

onmessage = async (e) => {
  const { type, bitmap } = e.data || {};
  if (type === 'decode' && bitmap) {
    try {
      const text = await tryDecode(bitmap);
      if (text) {
        postMessage({ type: 'result', text });
      } else {
        postMessage({ type: 'none' });
      }
    } catch (err) {
      postMessage({ type: 'error', error: String(err) });
    } finally {
      try { bitmap.close && bitmap.close(); } catch {}
    }
  }
};


