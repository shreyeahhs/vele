/**
 * Places timed events into side-by-side columns where they overlap, the way
 * a person would write two meetings in the same hour of a diary.
 */
export interface Positioned<T> {
  item: T;
  top: number;
  height: number;
  column: number;
  columns: number;
}

export function layoutDay<T>(items: T[], getRange: (item: T) => { start: number; end: number }, minHeightMin = 20): Positioned<T>[] {
  const sorted = items.map((item) => ({ item, ...getRange(item) })).sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Positioned<T>[] = [];
  let cluster: Array<(typeof sorted)[number] & { column: number }> = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    const columns = Math.max(1, ...cluster.map((c) => c.column + 1));
    for (const c of cluster) {
      out.push({ item: c.item, top: c.start, height: Math.max(c.end - c.start, minHeightMin), column: c.column, columns });
    }
    cluster = [];
  };

  for (const e of sorted) {
    const visualEnd = Math.max(e.end, e.start + minHeightMin);
    if (e.start >= clusterEnd && cluster.length) {
      flush();
      clusterEnd = -Infinity;
    }
    // First column whose last event has ended.
    const used = new Set<number>();
    for (const c of cluster) if (Math.max(c.end, c.start + minHeightMin) > e.start) used.add(c.column);
    let column = 0;
    while (used.has(column)) column++;
    cluster.push({ ...e, column });
    clusterEnd = Math.max(clusterEnd, visualEnd);
  }
  if (cluster.length) flush();
  return out;
}
