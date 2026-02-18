import { distance } from 'fastest-levenshtein';

// ── Types ──────────────────────────────────────────────────────────

export type MatchableItem = { id: string; name: string; unit?: string };

export type Variant = {
    id: string;
    entity_id: string | null;
    length: string | null;
    width: string | null;
    height: string | null;
    thickness: string | null;
    thickness_unit: string | null;
    dimension_unit: string | null;
};

export type MatchResult = {
    match: MatchableItem | null;
    suggestions: MatchableItem[];
};

export type ParsedEntry = {
    quantity: number | null;
    entity: { raw: string } & MatchResult;
    variant: { raw: string; match: Variant | null };
    rate: number | null;
    source: { raw: string } & MatchResult;
    destination: { raw: string } & MatchResult;
    transportCost: number | null;
    vehicleType: string;
    regNo: string;
    paymentStatus: 'paid' | 'pending' | 'advance';
    complete: boolean;
    errors: string[];
};

// ── Segments ───────────────────────────────────────────────────────
//
// The input is split into ordered segments by these keyword boundaries:
//
//   {qty} {item} {variant?} @{rate} from {source} to {dest} carting @{cost} {vehicleType} {regNo} {status}
//
// Everything is positional. Keywords: "from", "to", "carting".
// "@" always prefixes a number (rate or carting cost).
// Payment status (paid | pending | advance) at the very end.

type Segments = {
    core: string;       // "{qty} {item} {variant?} @{rate}"
    source: string;     // text after "from" until "to"
    dest: string;       // text after "to" until "carting" or end
    carting: string;    // text after "carting" until status/end  → "@{cost} {vehicleType} {regNo}"
    status: 'paid' | 'pending' | 'advance';
};

function segment(input: string): Segments {
    let remaining = input.trim();
    let status: Segments['status'] = 'paid';

    // Strip trailing payment status
    const statusRe = /\b(paid|pending|advance)\s*$/i;
    const sm = remaining.match(statusRe);
    if (sm) {
        status = sm[1].toLowerCase() as Segments['status'];
        remaining = remaining.slice(0, sm.index).trim();
    }

    // Split by keyword boundaries (case-insensitive, word-boundary)
    // We walk left-to-right looking for "from", "to", "carting"
    const fromIdx = indexOfKeyword(remaining, 'from');
    const toIdx = indexOfKeyword(remaining, 'to', fromIdx >= 0 ? fromIdx + 4 : 0);
    const cartingIdx = indexOfKeyword(remaining, 'carting', toIdx >= 0 ? toIdx + 2 : 0);

    let core = '';
    let source = '';
    let dest = '';
    let carting = '';

    if (fromIdx >= 0) {
        core = remaining.slice(0, fromIdx).trim();
        if (toIdx >= 0) {
            source = remaining.slice(fromIdx + 4, toIdx).trim(); // len("from") = 4
            if (cartingIdx >= 0) {
                dest = remaining.slice(toIdx + 2, cartingIdx).trim(); // len("to") = 2
                carting = remaining.slice(cartingIdx + 7).trim();     // len("carting") = 7
            } else {
                dest = remaining.slice(toIdx + 2).trim();
            }
        } else {
            source = remaining.slice(fromIdx + 4).trim();
        }
    } else {
        core = remaining;
    }

    return { core, source, dest, carting, status };
}

/** Find keyword at a word boundary, starting search from `start`. Returns -1 if not found. */
function indexOfKeyword(text: string, keyword: string, start = 0): number {
    const re = new RegExp(`\\b${keyword}\\b`, 'i');
    const slice = text.slice(start);
    const m = slice.match(re);
    return m ? start + m.index! : -1;
}

// ── Fuzzy search ───────────────────────────────────────────────────

function fuzzySearch(query: string, items: MatchableItem[], limit = 5): MatchResult {
    const q = query.toLowerCase().trim();
    if (!q || items.length === 0) return { match: null, suggestions: [] };

    // Exact
    const exact = items.find((i) => i.name.toLowerCase() === q);
    if (exact) return { match: exact, suggestions: [exact] };

    // Score: normalized levenshtein + bonuses for prefix/substring
    const scored = items.map((item) => {
        const name = item.name.toLowerCase();
        const maxLen = Math.max(q.length, name.length);
        let score = distance(q, name) / maxLen;
        if (name.startsWith(q)) score -= 0.5;
        else if (name.includes(q)) score -= 0.3;
        return { item, score };
    });

    scored.sort((a, b) => a.score - b.score);
    const suggestions = scored.slice(0, limit).map((s) => s.item);

    const best = scored[0];
    const bestName = best.item.name.toLowerCase();
    const accepted =
        best.score < 0.4 ||
        bestName.startsWith(q) ||
        bestName.includes(q) ||
        (q.length <= 3 && distance(q, bestName) <= 2);

    return { match: accepted ? best.item : null, suggestions };
}

// ── Variant matching ───────────────────────────────────────────────

/** Build a human-readable label for a variant (e.g. "10x20x5 mm" or "T:2 mm") */
function variantLabel(v: Variant): string {
    const fmt = (val: string | null) => {
        if (!val) return null;
        const n = parseFloat(val);
        if (!Number.isFinite(n)) return val;
        return n.toFixed(3).replace(/\.?0+$/, '');
    };

    const dims = [v.length, v.width, v.height].map(fmt).filter(Boolean);
    const dimStr = dims.length ? `${dims.join('x')}${v.dimension_unit ? ' ' + v.dimension_unit : ''}` : '';
    const thk = fmt(v.thickness);
    const thkStr = thk ? `T:${thk}${v.thickness_unit ? ' ' + v.thickness_unit : ''}` : '';
    return [dimStr, thkStr].filter(Boolean).join(' ').trim();
}

/**
 * Try to match a raw variant string against available variants for a given entity.
 * Users might type "10x20" or "10x20x5" or a label fragment.
 */
function matchVariant(raw: string, variants: Variant[], entityId: string): Variant | null {
    const q = raw.toLowerCase().trim();
    if (!q) return null;

    const pool = variants.filter((v) => v.entity_id === entityId);
    if (pool.length === 0) return null;

    // Try matching against the generated label
    for (const v of pool) {
        const label = variantLabel(v).toLowerCase();
        if (label === q || label.startsWith(q) || q.startsWith(label)) return v;
    }

    // Try matching dimension pattern like "10x20" against length x width x height
    const dimParts = q.split(/x/i).map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n));
    if (dimParts.length >= 2) {
        for (const v of pool) {
            const vDims = [v.length, v.width, v.height]
                .map((d) => (d ? parseFloat(d) : null))
                .filter((n) => n !== null);
            if (vDims.length < dimParts.length) continue;
            const matches = dimParts.every((dp, i) => Math.abs(dp - vDims[i]!) < 0.001);
            if (matches) return v;
        }
    }

    return null;
}

// ── Core parsing ───────────────────────────────────────────────────
//
// Parse "{qty} {item} {variant?} @{rate}" from the core segment.
//
// Strategy:
// 1. First token must be a number (quantity).
// 2. Find the last "@{number}" → that's the rate.
// 3. Everything between qty and @rate is "{item} {variant?}".
// 4. To separate item from variant: try progressively shorter prefixes
//    against the entity list. The longest matching prefix is the entity name,
//    the remainder is the variant.

type CoreResult = {
    quantity: number | null;
    entityRaw: string;
    variantRaw: string;
    rate: number | null;
};

function parseCore(core: string): CoreResult {
    const result: CoreResult = { quantity: null, entityRaw: '', variantRaw: '', rate: null };
    if (!core) return result;

    // Extract quantity from the start
    const qtyMatch = core.match(/^(\d+(?:\.\d+)?)\s*/);
    if (!qtyMatch) return result;

    result.quantity = parseFloat(qtyMatch[1]);
    let rest = core.slice(qtyMatch[0].length);

    // Extract @rate from the end (or anywhere — last occurrence)
    const rateMatch = rest.match(/@(\d+(?:\.\d+)?)\s*$/);
    if (rateMatch) {
        result.rate = parseFloat(rateMatch[1]);
        rest = rest.slice(0, rateMatch.index).trim();
    } else {
        // Maybe they typed @ but no number yet
        rest = rest.replace(/@\s*$/, '').trim();
    }

    // `rest` is now "{item} {variant?}" — split later via entity matching
    result.entityRaw = rest;
    return result;
}

/**
 * Given a combined "entity variant" string like "cement 10x20",
 * find the entity by trying longest-prefix fuzzy match first.
 * Returns the split point: entity raw text and leftover variant raw text.
 */
function splitEntityVariant(
    combined: string,
    entities: MatchableItem[],
): { entityRaw: string; variantRaw: string; entityResult: MatchResult } {
    if (!combined) {
        return { entityRaw: '', variantRaw: '', entityResult: { match: null, suggestions: [] } };
    }

    const tokens = combined.split(/\s+/);

    // Try full string first, then progressively fewer tokens
    for (let n = tokens.length; n >= 1; n--) {
        const candidate = tokens.slice(0, n).join(' ');
        const result = fuzzySearch(candidate, entities);
        if (result.match) {
            return {
                entityRaw: candidate,
                variantRaw: tokens.slice(n).join(' '),
                entityResult: result,
            };
        }
    }

    // No match found — treat entire thing as entity, return suggestions from full string
    return {
        entityRaw: combined,
        variantRaw: '',
        entityResult: fuzzySearch(combined, entities),
    };
}

// ── Carting segment parsing ────────────────────────────────────────
//
// Format after "carting": "@{cost} {vehicleType?} {regNo?}"

type CartingResult = {
    cost: number | null;
    vehicleType: string;
    regNo: string;
};

function parseCarting(carting: string): CartingResult {
    const result: CartingResult = { cost: null, vehicleType: '', regNo: '' };
    if (!carting) return result;

    // Cost is @{number}
    const costMatch = carting.match(/@(\d+(?:\.\d+)?)/);
    if (!costMatch) return result;

    result.cost = parseFloat(costMatch[1]);
    const rest = carting.slice(costMatch.index! + costMatch[0].length).trim();

    if (!rest) return result;

    // Remaining tokens: first is vehicle type, second is reg no.
    // Reg numbers typically contain digits, e.g. "MH12AB1234".
    const tokens = rest.split(/\s+/);
    if (tokens.length === 1) {
        // Could be vehicle type or reg no — if it has digits, assume reg no
        if (/\d/.test(tokens[0])) {
            result.regNo = tokens[0];
        } else {
            result.vehicleType = tokens[0];
        }
    } else if (tokens.length >= 2) {
        result.vehicleType = tokens[0];
        result.regNo = tokens.slice(1).join(' ');
    }

    return result;
}

// ── Parser class ───────────────────────────────────────────────────

export class QuickEntryParser {
    private entities: MatchableItem[] = [];
    private destinations: MatchableItem[] = [];
    private variants: Variant[] = [];

    setEntities(entities: MatchableItem[]) { this.entities = entities; }
    setDestinations(destinations: MatchableItem[]) { this.destinations = destinations; }
    setVariants(variants: Variant[]) { this.variants = variants; }

    /**
     * Parse a quick-entry string into structured data.
     *
     * Format:
     *   {qty} {item} {variant?} @{rate} from {source} to {dest} carting @{cost} {vehicleType} {regNo} {paid|pending|advance}
     *
     * Examples:
     *   30 cement @100 from site A to warehouse B
     *   50 steel 10x20 @250 from depot to factory carting @200 truck MH12AB1234 pending
     *   10 sand @50 from quarry to site C advance
     */
    parse(input: string): ParsedEntry {
        const segments = segment(input);

        // Parse core: qty, entity+variant, rate
        const core = parseCore(segments.core);
        const { entityRaw, variantRaw, entityResult } = splitEntityVariant(core.entityRaw, this.entities);

        // Match variant if entity was found and variant text exists
        let variantMatch: Variant | null = null;
        if (entityResult.match && variantRaw) {
            variantMatch = matchVariant(variantRaw, this.variants, entityResult.match.id);
        }

        // Match source & destination
        const sourceResult = segments.source ? fuzzySearch(segments.source, this.destinations) : { match: null, suggestions: [] };
        const destResult = segments.dest ? fuzzySearch(segments.dest, this.destinations) : { match: null, suggestions: [] };

        // Parse carting
        const carting = parseCarting(segments.carting);

        // Collect errors
        const errors: string[] = [];
        if (entityRaw && !entityResult.match) {
            errors.push(`Item "${entityRaw}" not found`);
        }
        if (variantRaw && entityResult.match && !variantMatch) {
            errors.push(`Variant "${variantRaw}" not found for ${entityResult.match.name}`);
        }
        if (segments.source && !sourceResult.match) {
            errors.push(`Source "${segments.source}" not found`);
        }
        if (segments.dest && !destResult.match) {
            errors.push(`Destination "${segments.dest}" not found`);
        }

        const complete =
            core.quantity !== null && core.quantity > 0 &&
            !!entityResult.match &&
            core.rate !== null && core.rate >= 0 &&
            !!sourceResult.match &&
            !!destResult.match &&
            errors.length === 0;

        return {
            quantity: core.quantity,
            entity: { raw: entityRaw, ...entityResult },
            variant: { raw: variantRaw, match: variantMatch },
            rate: core.rate,
            source: { raw: segments.source, ...sourceResult },
            destination: { raw: segments.dest, ...destResult },
            transportCost: carting.cost,
            vehicleType: carting.vehicleType,
            regNo: carting.regNo,
            paymentStatus: segments.status,
            complete,
            errors,
        };
    }

    /** Build FormData ready for the createExpense server action. */
    toFormData(entry: ParsedEntry): FormData {
        const fd = new FormData();
        fd.set('entity_id', entry.entity.match!.id);
        fd.set('entity_variant_id', entry.variant.match?.id ?? '');
        fd.set('quantity', String(entry.quantity));
        fd.set('rate', String(entry.rate));
        fd.set('source_id', entry.source.match!.id);
        fd.set('destination_id', entry.destination.match!.id);
        fd.set('payment_status', entry.paymentStatus);
        fd.set('date', new Date().toISOString().split('T')[0]);

        if (entry.transportCost !== null && entry.transportCost > 0) {
            fd.set('add_transportation_cost', 'on');
            fd.set('transportation_cost', String(entry.transportCost));
            fd.set('vehicle_type', entry.vehicleType);
            fd.set('reg_no', entry.regNo);
        }

        return fd;
    }
}
