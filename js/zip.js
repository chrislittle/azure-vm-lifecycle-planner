// A zip file of a few text files, made in the browser. Each file is compressed
// (deflate) with the browser's own CompressionStream: no library, nothing sent. A file
// is stored as it is when the browser cannot compress, or when that is not smaller.
// Format: PKWARE APPNOTE 6.3 (local headers, central directory, end record).

const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

// MS-DOS time and date, as zip files store them.
function dosTime(d) {
    return {
        time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
        date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    };
}

// Raw deflate (zip method 8) of the bytes, or null if this browser cannot do it.
async function deflate(bytes) {
    if (typeof CompressionStream !== 'function') return null;
    try {
        const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch {
        return null;
    }
}

// files: [{ name, text }] -> Promise of a Uint8Array of a zip file.
export async function makeZip(files, when = new Date()) {
    const enc = new TextEncoder();
    const { time, date } = dosTime(when);
    const parts = [];
    const central = [];
    let offset = 0;
    for (const f of files) {
        const name = enc.encode(f.name);
        const raw = enc.encode(f.text);
        const crc = crc32(raw);
        const packed = await deflate(raw);
        const method = packed && packed.length < raw.length ? 8 : 0;
        const data = method ? packed : raw;
        const local = new DataView(new ArrayBuffer(30));
        local.setUint32(0, 0x04034b50, true);   // local file header
        local.setUint16(4, 20, true);           // version needed
        local.setUint16(6, 0x0800, true);       // UTF-8 names
        local.setUint16(8, method, true);       // 8 deflate, 0 stored
        local.setUint16(10, time, true);
        local.setUint16(12, date, true);
        local.setUint32(14, crc, true);
        local.setUint32(18, data.length, true); // compressed size
        local.setUint32(22, raw.length, true);  // size
        local.setUint16(26, name.length, true);
        local.setUint16(28, 0, true);
        parts.push(new Uint8Array(local.buffer), name, data);

        const c = new DataView(new ArrayBuffer(46));
        c.setUint32(0, 0x02014b50, true);       // central directory header
        c.setUint16(4, 20, true);
        c.setUint16(6, 20, true);
        c.setUint16(8, 0x0800, true);
        c.setUint16(10, method, true);
        c.setUint16(12, time, true);
        c.setUint16(14, date, true);
        c.setUint32(16, crc, true);
        c.setUint32(20, data.length, true);
        c.setUint32(24, raw.length, true);
        c.setUint16(28, name.length, true);
        c.setUint32(42, offset, true);
        central.push(new Uint8Array(c.buffer), name);
        offset += 30 + name.length + data.length;
    }
    const centralSize = central.reduce((n, p) => n + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);         // end of central directory
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);
    const all = [...parts, ...central, new Uint8Array(end.buffer)];
    const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of all) { out.set(p, at); at += p.length; }
    return out;
}
