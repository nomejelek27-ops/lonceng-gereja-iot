/**
 * priorityQueue.js
 * Implementasi Priority Queue berbasis Min-Heap.
 *
 * Setiap item jadwal diberi "nilai prioritas" berdasarkan rumus:
 *   T = (60 x J) + M
 * Item dengan nilai T terkecil akan berada di posisi terdepan (diproses lebih dulu).
 *
 * Struktur ini murni algoritmik (tidak tergantung Express/HTTP) supaya
 * bisa langsung dipakai sebagai bukti implementasi Priority Queue di skripsi.
 */

class PriorityQueue {
  constructor() {
    this.heap = [];
  }

  size() {
    return this.heap.length;
  }

  isEmpty() {
    return this.heap.length === 0;
  }

  /** Konversi waktu "HH:MM" menjadi nilai prioritas T = 60J + M */
  static timeToPriority(hhmm) {
    const [jam, menit] = hhmm.split(':').map(Number);
    return jam * 60 + menit;
  }

  /** Masukkan item baru ke queue, otomatis diurutkan berdasarkan priority */
  push(item) {
    this.heap.push(item);
    this._bubbleUp(this.heap.length - 1);
  }

  /** Lihat item dengan prioritas tertinggi (waktu tercepat) tanpa menghapus */
  peek() {
    return this.isEmpty() ? null : this.heap[0];
  }

  /** Ambil dan hapus item dengan prioritas tertinggi */
  pop() {
    if (this.isEmpty()) return null;
    const top = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this._bubbleDown(0);
    }
    return top;
  }

  /** Kembalikan seluruh isi queue terurut (tanpa mengubah heap asli) — untuk ditampilkan di web */
  toSortedArray() {
    return [...this.heap].sort((a, b) => a.priority - b.priority);
  }

  _bubbleUp(idx) {
    while (idx > 0) {
      const parent = Math.floor((idx - 1) / 2);
      if (this.heap[parent].priority <= this.heap[idx].priority) break;
      [this.heap[parent], this.heap[idx]] = [this.heap[idx], this.heap[parent]];
      idx = parent;
    }
  }

  _bubbleDown(idx) {
    const n = this.heap.length;
    while (true) {
      let smallest = idx;
      const left = 2 * idx + 1;
      const right = 2 * idx + 2;
      if (left < n && this.heap[left].priority < this.heap[smallest].priority) smallest = left;
      if (right < n && this.heap[right].priority < this.heap[smallest].priority) smallest = right;
      if (smallest === idx) break;
      [this.heap[smallest], this.heap[idx]] = [this.heap[idx], this.heap[smallest]];
      idx = smallest;
    }
  }
}

module.exports = PriorityQueue;
