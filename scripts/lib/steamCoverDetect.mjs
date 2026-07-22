let servicePromise = null;

async function getService() {
  if (!servicePromise) {
    servicePromise = (async () => {
      const { PaddleOcrService } = await import("ppu-paddle-ocr");
      const service = new PaddleOcrService();
      await service.initialize();
      return service;
    })();
  }
  return servicePromise;
}

/** @param {Buffer} imageBytes */
export async function detectTextBoxes(imageBytes) {
  const service = await getService();
  const ab =
    imageBytes.buffer instanceof ArrayBuffer
      ? imageBytes.buffer.slice(imageBytes.byteOffset, imageBytes.byteOffset + imageBytes.byteLength)
      : Uint8Array.from(imageBytes).buffer;
  const { boxes } = await service.detect(ab);
  return (boxes ?? []).map((b) => ({
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
  }));
}
