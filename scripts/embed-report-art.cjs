// Cache Drive thumbnails inside the encrypted dashboard / private PDF snapshot.
// No browser CORS dependency or expiring remote URL remains at print time.
async function embedReportArt(snapshot, request = fetch) {
  const pieces = Object.values(snapshot?.artes?.piezas || {});
  const jobs = [...new Set(pieces.map(p => p.id).filter(id => /^[\w-]{10,}$/.test(id)))];
  const images = new Map();
  async function worker() {
    while (jobs.length) {
      const id = jobs.shift();
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await request(`https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w480`, { signal: AbortSignal.timeout(15000) });
          const mime = (response.headers.get('content-type') || '').split(';')[0];
          if (!response.ok || !/^image\/(jpeg|png|webp)$/.test(mime)) throw Error('Invalid thumbnail');
          const bytes = Buffer.from(await response.arrayBuffer());
          if (!bytes.length || bytes.length > 2 * 1024 * 1024) throw Error('Invalid thumbnail size');
          images.set(id, `data:${mime};base64,${bytes.toString('base64')}`);
          break;
        } catch {
          // The viewer can retry through its authorized Apps Script endpoint.
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, jobs.length) }, worker));
  for (const piece of pieces) {
    if (images.has(piece.id)) piece.thumbnailData = images.get(piece.id);
  }
  return { total: pieces.length, embedded: pieces.filter(p => p.thumbnailData).length };
}
module.exports = { embedReportArt };
