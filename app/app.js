const photoInput = document.getElementById("photoInput");
const maxSize = document.getElementById("maxSize");
const maxSizeValue = document.getElementById("maxSizeValue");
const quality = document.getElementById("quality");
const qualityValue = document.getElementById("qualityValue");
const format = document.getElementById("format");
const sourcePreview = document.getElementById("sourcePreview");
const tinyPreview = document.getElementById("tinyPreview");
const qrCanvas = document.getElementById("qrCanvas");
const generateBtn = document.getElementById("generateBtn");
const stats = document.getElementById("stats");
const downloadQr = document.getElementById("downloadQr");
const downloadPayload = document.getElementById("downloadPayload");
const qrPanel = document.querySelector(".qr-panel");

const state = {
  file: null,
  sourceUrl: "",
  payload: "",
  qrUrl: "",
};

const qualityLabel = () => `${quality.value}%`;

function updateSliders() {
  maxSizeValue.textContent = `${maxSize.value}px`;
  qualityValue.textContent = qualityLabel();
}

function setStatus(message) {
  stats.textContent = message;
}

function revokeUrl(url) {
  if (url) {
    URL.revokeObjectURL(url);
  }
}

function fitQrCanvas() {
  const panelWidth = qrPanel?.clientWidth ?? 256;
  return Math.max(256, Math.min(640, Math.floor(panelWidth * window.devicePixelRatio)));
}

function scheduleQrRedraw() {
  if (!state.payload) {
    return;
  }

  requestAnimationFrame(async () => {
    try {
      await renderQr(state.payload);
    } catch (error) {
      setStatus(`QRの再描画に失敗しました: ${error.message}`);
    }
  });
}

function canvasToBlob(canvas, mimeType, qualityValue) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, qualityValue);
  });
}

async function fileToImage(file) {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";

  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
    image.src = url;
  });

  return { image, url };
}

async function resizeImage(image, maxDimension, mimeType, q) {
  const ratio = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * ratio));
  const height = Math.max(1, Math.round(image.naturalHeight * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d", { alpha: true, willReadFrequently: false });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, width, height);

  const blob = await canvasToBlob(canvas, mimeType, mimeType === "image/png" ? undefined : q);
  if (!blob) {
    throw new Error("画像の圧縮に失敗しました");
  }

  const dataUrl = await blobToDataUrl(blob);
  return { blob, dataUrl, width, height };
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function renderQr(payload) {
  const size = fitQrCanvas();
  const qrOptions = {
    errorCorrectionLevel: "L",
    margin: 2,
    width: size,
    color: {
      dark: "#0b1020",
      light: "#ffffff",
    },
  };

  const svg = await QRCode.toString(payload, { ...qrOptions, type: "svg" });
  revokeUrl(state.qrUrl);
  state.qrUrl = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" })
  );
  qrCanvas.src = state.qrUrl;
  return svg;
}

async function generatePayload() {
  if (!state.file) {
    setStatus("先に画像を選んでください。");
    return;
  }

  if (typeof QRCode === "undefined") {
    setStatus("QRライブラリの読み込み待ちです。少ししてからもう一度試してください。");
    return;
  }

  generateBtn.disabled = true;
  generateBtn.textContent = "生成中...";

  try {
    const { image, url } = await fileToImage(state.file);
    revokeUrl(state.sourceUrl);
    state.sourceUrl = url;
    sourcePreview.src = url;

    const mimeType = format.value;
    const qualityValue = Number(quality.value) / 100;
    const maxDimension = Number(maxSize.value);

    const candidates = [];
    for (let dim = maxDimension; dim >= 16; dim -= 4) {
      for (const q of [qualityValue, 0.5, 0.4, 0.3, 0.2]) {
        const candidate = await resizeImage(image, dim, mimeType, q);
        candidates.push({
          ...candidate,
          dim,
          quality: q,
        });
        try {
          const payload = candidate.dataUrl;
          const svg = await renderQr(payload);
          state.payload = payload;
          tinyPreview.src = candidate.dataUrl;
          const bytes = candidate.blob.size;
          setStatus(
            [
              `QR化に成功しました`,
              `縮小後: ${candidate.width} x ${candidate.height}`,
              `形式: ${mimeType.replace("image/", "").toUpperCase()}`,
              `サイズ: ${bytes} bytes`,
              `設定: max ${dim}px / quality ${(q * 100).toFixed(0)}%`,
            ].join("\n")
          );
          downloadQr.href = state.qrUrl;
          downloadPayload.href = URL.createObjectURL(
            new Blob([payload], { type: "text/plain;charset=utf-8" })
          );
          downloadQr.download = "photo-qr.svg";
          return;
        } catch (error) {
          continue;
        }
      }
    }

    const last = candidates[candidates.length - 1];
    if (last) {
      tinyPreview.src = last.dataUrl;
    }
    setStatus(
      [
        "この画像はまだ大きすぎてQRに入りませんでした。",
        "もっと小さくするか、単純な画像で試してください。",
        "目安としては、16px前後の極小画像なら通りやすいです。",
      ].join("\n")
    );
  } catch (error) {
    setStatus(`エラー: ${error.message}`);
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = "QRを生成";
  }
}

photoInput.addEventListener("change", async (event) => {
  const [file] = event.target.files ?? [];
  if (!file) {
    return;
  }

  state.file = file;
  setStatus("画像を読み込みました。QRを生成できます。");

  try {
    const { url } = await fileToImage(file);
    revokeUrl(state.sourceUrl);
    state.sourceUrl = url;
    sourcePreview.src = url;
  } catch (error) {
    setStatus(`画像の読み込みに失敗しました: ${error.message}`);
  }
});

maxSize.addEventListener("input", updateSliders);
quality.addEventListener("input", updateSliders);
generateBtn.addEventListener("click", generatePayload);
window.addEventListener("resize", scheduleQrRedraw);

updateSliders();
fitQrCanvas();
setStatus("画像を選ぶと、縮小してQR化できます。");
