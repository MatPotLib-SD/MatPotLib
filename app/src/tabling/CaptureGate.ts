/** Tracks which asynchronous capture result is allowed to mutate local group state. */
export class CaptureGate {
  private generation = 0;
  private deviceId: string | null = null;
  private requestId: string | null = null;

  selectDevice(deviceId: string | null): number {
    this.generation += 1;
    this.deviceId = deviceId;
    this.requestId = null;
    return this.generation;
  }

  reset(): number {
    this.generation += 1;
    this.requestId = null;
    return this.generation;
  }

  token(): number { return this.generation; }

  associate(deviceId: string, generation: number, requestId: string): boolean {
    if (this.deviceId !== deviceId || this.generation !== generation || this.requestId) return false;
    this.requestId = requestId;
    return true;
  }

  accepts(deviceId: string, generation: number, requestId: string): boolean {
    return this.deviceId === deviceId && this.generation === generation && this.requestId === requestId;
  }

  finish(deviceId: string, generation: number, requestId: string): boolean {
    if (!this.accepts(deviceId, generation, requestId)) return false;
    this.requestId = null;
    return true;
  }
}
