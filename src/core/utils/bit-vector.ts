// 2024/7/8
// zhangzhong

export class BitVector {
  private bits: bigint;

  constructor() {
    this.bits = BigInt(0);
  }

  setBit(position: number): void {
    this.bits |= BigInt(1) << BigInt(position);
  }

  clearBit(position: number): void {
    this.bits &= ~(BigInt(1) << BigInt(position));
  }

  toggleBit(position: number): void {
    this.bits ^= BigInt(1) << BigInt(position);
  }

  testBit(position: number): boolean {
    return (this.bits & (BigInt(1) << BigInt(position))) !== BigInt(0);
  }
}
