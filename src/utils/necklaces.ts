const BINARY_PATTERN = /^[01]+$/;

export function canonicalRotation(bitstring: string): string {
  if (!bitstring || !BINARY_PATTERN.test(bitstring)) {
    throw new Error('canonicalRotation expects a non-empty binary string.');
  }

  let canonical = bitstring;

  for (let offset = 1; offset < bitstring.length; offset += 1) {
    const rotated = bitstring.slice(offset) + bitstring.slice(0, offset);

    if (rotated < canonical) {
      canonical = rotated;
    }
  }

  return canonical;
}

export function generateBinaryNecklaces(length: number): string[] {
  if (!Number.isInteger(length) || length < 1) {
    throw new Error('generateBinaryNecklaces expects a positive integer length.');
  }

  const necklaceCount = 2 ** length;
  const necklaces = new Set<string>();

  for (let value = 0; value < necklaceCount; value += 1) {
    const bitstring = value.toString(2).padStart(length, '0');
    necklaces.add(canonicalRotation(bitstring));
  }

  return Array.from(necklaces).sort();
}
