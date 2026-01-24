export class HdrLike {
    private values: number[] = [];

    add(v: number): void {
        if (Number.isFinite(v)) {
            this.values.push(v);
        }
    }

    p(pct: number): number {
        if (this.values.length === 0) return 0;
        const a = [...this.values].sort((a, b) => a - b);
        const i = Math.min(a.length - 1, Math.max(0, Math.floor((pct / 100) * a.length)));
        return a[i];
    }

    count(): number {
        return this.values.length;
    }

    reset(): void {
        this.values = [];
    }
}
