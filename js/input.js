// Reading the VM list: pasted rows (from Excel or Resource Graph Explorer) or a
// CSV file, in one standard format. The page does not guess at other column
// names: it names what is missing or unknown and points back to the query or
// the template.

// The columns, in the order the template and the query write them.
export const COLUMNS = [
    { name: 'Machine name', required: true },
    { name: 'Region' },
    { name: 'Current size', required: true },
    { name: 'Generation', required: true },
    { name: 'OS' },
    { name: 'NIC count' },
    { name: 'Data-disk count' },
    { name: 'Security type' },
    { name: 'Image publisher' },
    { name: 'Image offer' },
    { name: 'Image SKU' },
    { name: 'Disk controller' },
    { name: 'Accelerated NICs' },
    { name: 'Primary NIC accelerated' },
    { name: 'Azure Disk Encryption' },
    { name: 'Hibernation' },
    { name: 'Scale set' },
    { name: 'Azure Virtual Desktop' },
    { name: 'SAP' },
    { name: 'Unmanaged disks' },
    { name: 'Ephemeral OS disk' },
    { name: 'System-assigned identity' },
    { name: 'Availability set' },
    { name: 'Zone' },
    // The workload pattern (query 0.3.0-beta and later).
    { name: 'Resource type' },
    { name: 'Instances' },
    { name: 'Managed by' },
    { name: 'AVD host pool type' },
    { name: 'SQL Server' },
    { name: 'SQL availability group' },
    { name: 'Shared disk' },
    // Azure's unique key for the VM (query 0.4.6-beta and later). Optional.
    { name: 'Resource ID' },
];

// A header as it is compared: case, spaces, dashes, underscores and dots ignored.
export const headerKey = (text) => String(text ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Text -> rows of cells. Tab-separated (a paste), else semicolon or comma,
// whichever the first line has more of. Quotes as in CSV. Empty rows skipped.
export function parseTable(text) {
    text = String(text ?? '').replace(/^﻿/, '');
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    const count = (ch) => firstLine.split(ch).length - 1;
    const delim = count('\t') > 0 ? '\t' : count(';') > count(',') ? ';' : ',';
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"') {
                if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
            } else cell += ch;
        } else if (ch === '"' && cell === '') quoted = true;
        else if (ch === delim) { row.push(cell); cell = ''; }
        else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            row.push(cell); rows.push(row); row = []; cell = '';
        } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

// Rows -> { headers, rows, map: column -> index, stops: [], notes: [] }.
// A stop means nothing can be planned until the list is fixed.
export function readList(text) {
    const all = parseTable(text);
    const stops = [];
    const notes = [];
    if (!all.length) return { headers: [], rows: [], map: {}, stops: ['The list is empty.'], notes };
    const headers = all[0].map((h) => String(h).trim());
    const rows = all.slice(1);
    const map = {};
    const known = new Map(COLUMNS.map((c) => [headerKey(c.name), c.name]));
    const unknown = [];
    headers.forEach((h, i) => {
        const column = known.get(headerKey(h));
        if (!column) { if (h) unknown.push(h); return; }
        if (column in map) stops.push(`Two columns have the name ${column}: '${headers[map[column]]}' and '${h}'. Remove one of them.`);
        else map[column] = i;
    });
    for (const c of COLUMNS) {
        if (c.required && !(c.name in map)) stops.push(`The list has no ${c.name} column.`);
    }
    if (unknown.length) notes.push(`This tool does not use these columns: ${unknown.map((u) => `'${u}'`).join(', ')}.`);
    return { headers, rows, map, stops, notes };
}
