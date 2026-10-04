export function buildBeiYingDemoResponse(reference, layer) {
  if (layer !== 0 && layer !== 1) throw new Error("未対応のキー配列レイヤーです");
  const slots = reference?.layers?.[String(layer)]?.slots;
  if (!slots || typeof slots !== "object" || Array.isArray(slots)) {
    throw new Error("サンプルのキー配列データがありません");
  }

  const response = new Uint8Array(512);
  response.set([0x06, 0x83, layer, 0, 0x01, 0, 0xf8, 0x01]);
  for (const [rawIndex, rawCode] of Object.entries(slots)) {
    const index = Number(rawIndex);
    if (!Number.isInteger(index) || index < 0 || index >= 126 ||
        typeof rawCode !== "string" || !/^[0-9a-fA-F]{8}$/.test(rawCode)) {
      throw new Error("サンプルのキー配列データが不正です");
    }
    const bytes = rawCode.match(/../g).map(byte => Number.parseInt(byte, 16));
    response.set(bytes, 8 + index * 4);
  }
  return response;
}
