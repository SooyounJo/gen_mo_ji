import sharp from "sharp";

function parseCropFrac() {
  const n = Number(process.env.RUNPOD_CROP_BOTTOM || "");
  if (Number.isFinite(n) && n > 0 && n <= 0.35) return n;
  return 0.08;
}

/**
 * RunPod 응답 data URL 하단을 비율만큼 크롭해 바닥 그림자 띠를 숨긴다.
 * URL 이미지는 그대로 유지한다.
 */
export async function cropBottomDataUrlIfNeeded(image) {
  const frac = parseCropFrac();
  if (!frac) return image;
  const s = String(image || "").trim();
  if (!s.startsWith("data:")) return image;

  const m = s.match(/^data:([^;]+);base64,(.+)$/i);
  if (!m) return image;

  const mime = m[1] || "image/png";
  const input = Buffer.from(m[2], "base64");
  const meta = await sharp(input).metadata();
  const width = Number(meta.width || 0);
  const height = Number(meta.height || 0);
  if (!width || !height) return image;

  const croppedHeight = Math.max(1, Math.floor(height * (1 - frac)));
  if (croppedHeight >= height) return image;

  // 1) 그림자 제거용 하단 크롭
  // 2) 제거된 높이만큼 흰색으로 다시 채워 원래 크기(대개 1:1)를 유지
  let out = await sharp(input)
    .extract({ left: 0, top: 0, width, height: croppedHeight })
    .extend({
      top: 0,
      bottom: Math.max(0, height - croppedHeight),
      left: 0,
      right: 0,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .toBuffer();

  // 워커가 비정사각형을 반환해도 테스트 페이지에서는 정사각형으로 고정 표시.
  if (width !== height) {
    const side = Math.max(width, height);
    out = await sharp({
      create: {
        width: side,
        height: side,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    })
      .composite([{ input: out, left: Math.floor((side - width) / 2), top: Math.floor((side - height) / 2) }])
      .png()
      .toBuffer();
  }

  return `data:${mime};base64,${out.toString("base64")}`;
}

export async function cropBottomImagesIfNeeded(images) {
  if (!Array.isArray(images) || images.length === 0) return images;
  const out = [];
  for (const image of images) {
    try {
      out.push(await cropBottomDataUrlIfNeeded(image));
    } catch {
      out.push(image);
    }
  }
  return out;
}

