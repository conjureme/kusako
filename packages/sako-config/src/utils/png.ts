import type { CharacterCard } from '../types/characters';

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function readUint32(data: Uint8Array, offset: number): number {
  return (
    ((data[offset]! << 24) |
      (data[offset + 1]! << 16) |
      (data[offset + 2]! << 8) |
      data[offset + 3]!) >>>
    0
  );
}

function writeUint32(data: Uint8Array, offset: number, value: number): void {
  data[offset] = (value >> 24) & 0xff;
  data[offset + 1] = (value >> 16) & 0xff;
  data[offset + 2] = (value >> 8) & 0xff;
  data[offset + 3] = value & 0xff;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]!;
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function extractCharacterFromPng(
  file: File,
): Promise<CharacterCard> {
  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);

  for (let i = 0; i < 8; i++) {
    if (data[i] !== PNG_SIGNATURE[i]) {
      throw new Error('not a valid png file');
    }
  }

  let offset = 8;
  while (offset < data.length) {
    const length = readUint32(data, offset);
    const type = decoder.decode(data.slice(offset + 4, offset + 8));

    if (type === 'tEXt') {
      const chunkData = data.slice(offset + 8, offset + 8 + length);
      const nullIndex = chunkData.indexOf(0);

      if (nullIndex !== -1) {
        const keyword = decoder.decode(chunkData.slice(0, nullIndex));

        if (keyword.toLowerCase() === 'chara') {
          const base64 = decoder.decode(chunkData.slice(nullIndex + 1));
          const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          const json = new TextDecoder().decode(bytes);
          return JSON.parse(json) as CharacterCard;
        }
      }
    }

    if (type === 'IEND') break;
    offset += 12 + length;
  }

  throw new Error('no character data found in png');
}

export async function encodeCharacterToPng(
  pngFile: File,
  card: CharacterCard,
): Promise<Blob> {
  const buffer = await pngFile.arrayBuffer();
  const data = new Uint8Array(buffer);

  const json = JSON.stringify(card);
  const jsonBytes = new TextEncoder().encode(json);
  let binary = '';
  for (let i = 0; i < jsonBytes.length; i++) {
    binary += String.fromCharCode(jsonBytes[i]!);
  }
  const base64 = btoa(binary);
  const keyword = encoder.encode('chara');
  const value = encoder.encode(base64);

  const chunkPayload = new Uint8Array(keyword.length + 1 + value.length);
  chunkPayload.set(keyword, 0);
  chunkPayload[keyword.length] = 0;
  chunkPayload.set(value, keyword.length + 1);

  const typeBytes = encoder.encode('tEXt');
  const crcInput = new Uint8Array(4 + chunkPayload.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(chunkPayload, 4);
  const crc = crc32(crcInput);

  const chunk = new Uint8Array(12 + chunkPayload.length);
  writeUint32(chunk, 0, chunkPayload.length);
  chunk.set(typeBytes, 4);
  chunk.set(chunkPayload, 8);
  writeUint32(chunk, 8 + chunkPayload.length, crc);

  const filteredChunks: Uint8Array[] = [];
  filteredChunks.push(data.slice(0, 8));

  let iendOffset = data.length;
  let offset = 8;
  while (offset < data.length) {
    const length = readUint32(data, offset);
    const type = decoder.decode(data.slice(offset + 4, offset + 8));
    const chunkEnd = offset + 12 + length;

    if (type === 'IEND') {
      iendOffset = offset;
      break;
    }

    if (type === 'tEXt') {
      const existingData = data.slice(offset + 8, offset + 8 + length);
      const nullIdx = existingData.indexOf(0);
      if (nullIdx !== -1) {
        const existingKeyword = decoder.decode(existingData.slice(0, nullIdx));
        if (existingKeyword.toLowerCase() === 'chara') {
          offset = chunkEnd;
          continue;
        }
      }
    }

    filteredChunks.push(data.slice(offset, chunkEnd));
    offset = chunkEnd;
  }

  filteredChunks.push(chunk);
  filteredChunks.push(data.slice(iendOffset));

  const totalLength = filteredChunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const c of filteredChunks) {
    result.set(c, pos);
    pos += c.length;
  }

  return new Blob([result], { type: 'image/png' });
}
