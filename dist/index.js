/*! Intelligent Grid v0.1.0 | MIT | https://github.com/sysborg */

// src/formula/errors.ts
var FormulaError = class {
  code;
  message;
  constructor(code, message = "") {
    this.code = code;
    this.message = message;
  }
  toString() {
    return this.code;
  }
};
var ERRORS = Object.freeze({
  DIV0: "#DIV/0!",
  VALUE: "#VALUE!",
  NAME: "#NAME?",
  REF: "#REF!",
  NA: "#N/A",
  NUM: "#NUM!",
  NULL: "#NULL!",
  CIRC: "#CIRC!",
  SYNTAX: "#ERROR!"
});
var ERROR_CODES = new Set(Object.values(ERRORS));
var err = (code, message) => new FormulaError(code, message);
var isError = (value) => value instanceof FormulaError;
var isErrorCode = (value) => typeof value === "string" && ERROR_CODES.has(value);
var reviveError = (value) => isErrorCode(value) ? err(value) : value;

// src/core/store.ts
var storeCounter = 0;
function resolveSorla(sorla) {
  const candidate = sorla ?? globalThis.sorla;
  if (!candidate) {
    throw new Error('Intelligent Grid needs SorlaDB: load sorla-db (window.sorla) or pass the "sorla" option');
  }
  return typeof candidate === "function" ? new candidate() : candidate;
}
function encodeValue(value) {
  if (value === null || value === void 0) return "";
  if (value instanceof Date) return isNaN(value.getTime()) ? "" : value.toISOString();
  if (typeof value === "number" && !Number.isFinite(value)) return "";
  return value;
}
var isBlank = (value) => value === "" || value === null || value === void 0;
var SorlaStore = class {
  sorla;
  databaseName;
  collectionName;
  idField;
  fields = [];
  db;
  // documents by _id, SorlaDB 1.0 has no indexes and findOne() throws when nothing matches
  byId = /* @__PURE__ */ new Map();
  constructor({ sorla, database, collection = "rows", idField = null } = {}) {
    this.sorla = resolveSorla(sorla);
    this.databaseName = database ?? `intelligent_grid_${++storeCounter}`;
    this.collectionName = collection;
    this.idField = idField;
    this.sorla.useDb(this.databaseName);
    this.db = this.sorla.db;
    if (!this.db[this.collectionName]) this.db.createCollection(this.collectionName);
    for (const doc of this.collection.all) this.byId.set(doc._data._id, doc);
  }
  get collection() {
    return this.db[this.collectionName];
  }
  /**
   * Fields that every document must have, so "not equal" style queries see blanks.
   */
  setFields(fields) {
    this.fields = fields;
  }
  prepare(row) {
    const data = {};
    for (const [key, value] of Object.entries(row)) data[key] = encodeValue(value);
    for (const field of this.fields) if (!(field in data)) data[field] = "";
    if (this.idField && !isBlank(row[this.idField])) data._id = String(row[this.idField]);
    if (data._id !== void 0 && this.byId.has(String(data._id))) {
      throw new Error(`Duplicate row id "${String(data._id)}"`);
    }
    return data;
  }
  /**
   * Inserts rows (copied, the caller objects are never mutated).
   * @return ids
   */
  insert(rows) {
    const ids = [];
    const collection = this.collection;
    for (const row of rows) {
      const data = this.prepare(row);
      collection.insertOne(data);
      const doc = collection.all[collection.all.length - 1];
      const id = String(doc._data._id);
      this.byId.set(id, doc);
      ids.push(id);
    }
    return ids;
  }
  has(id) {
    return this.byId.has(id);
  }
  /**
   * Live document data, for internal reads only (formulas, rendering).
   */
  get(id) {
    return this.byId.get(id)?._data;
  }
  /**
   * SorlaDB 1.0 workaround: there is no updateOne() yet and the document proxy rejects writes from
   * outside the library, so values are written on the document data object.
   * @return previous values of the changed fields
   */
  update(id, patch) {
    const data = this.get(id);
    if (!data) throw new Error(`Row "${id}" not found`);
    const previous = {};
    for (const [field, value] of Object.entries(patch)) {
      if (field === "_id") continue;
      previous[field] = data[field];
      data[field] = encodeValue(value);
    }
    return previous;
  }
  /**
   * SorlaDB 1.0 workaround: there is no deleteOne()/deleteMany() yet.
   * @return removed rows data
   */
  remove(ids) {
    const targets = new Set(ids.filter((id) => this.byId.has(id)));
    if (!targets.size) return [];
    const removed = [];
    const documents = this.collection.all;
    for (let i = documents.length - 1; i >= 0; i--) {
      const data = documents[i]._data;
      if (targets.has(data._id)) {
        removed.push(data);
        documents.splice(i, 1);
        this.byId.delete(data._id);
      }
    }
    return removed.reverse();
  }
  clear() {
    this.collection.all.length = 0;
    this.byId.clear();
  }
  count() {
    return this.collection.count();
  }
  ids() {
    return this.collection.all.map((doc) => doc._data._id);
  }
  /**
   * Live values of a field across every row in insertion order (formula column ranges).
   */
  values(field) {
    return this.collection.all.map((doc) => doc._data[field]);
  }
  /**
   * Runs a query through SorlaDB.
   * @return row data (copies)
   */
  query({ query = {}, predicates = [], sort = [], compare = compareCells } = {}) {
    let documents = this.collection.find(query)._data;
    if (predicates.length) {
      documents = documents.filter((doc) => predicates.every((test) => test(doc._data)));
    }
    const rows = documents.map((doc) => doc._data);
    if (!sort.length) return rows;
    return rows.sort((a, b) => {
      for (const entry of sort) {
        const result = compare(a[entry.field], b[entry.field], entry);
        if (result !== 0) return result;
      }
      return 0;
    });
  }
};
var collators = /* @__PURE__ */ new Map();
function compareCells(a, b, { dir = "asc", locale = "en-US" } = {}) {
  const blankA = isBlank(a);
  const blankB = isBlank(b);
  if (blankA || blankB) return blankA === blankB ? 0 : blankA ? 1 : -1;
  const rank2 = (value) => isErrorCode(value) ? 3 : typeof value === "boolean" ? 2 : typeof value === "string" ? 1 : 0;
  const rankA = rank2(a);
  const rankB = rank2(b);
  let result;
  if (rankA !== rankB) {
    result = rankA - rankB;
  } else if (rankA === 1) {
    let collator = collators.get(locale);
    if (!collator) {
      collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
      collators.set(locale, collator);
    }
    result = collator.compare(a, b);
  } else {
    const x = a;
    const y = b;
    result = x < y ? -1 : x > y ? 1 : 0;
  }
  return dir === "desc" ? -result : result;
}

// src/core/events.ts
var Emitter = class {
  owner;
  handlers = /* @__PURE__ */ new Map();
  constructor(owner) {
    this.owner = owner;
  }
  on(type, handler) {
    let set = this.handlers.get(type);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      this.handlers.set(type, set);
    }
    set.add(handler);
    return () => this.off(type, handler);
  }
  once(type, handler) {
    const off = this.on(type, (event) => {
      off();
      handler(event);
    });
    return off;
  }
  off(type, handler) {
    if (!handler) this.handlers.delete(type);
    else this.handlers.get(type)?.delete(handler);
  }
  /**
   * @return the event, check event.defaultPrevented for "before*" events
   */
  emit(type, detail) {
    const event = {
      type,
      detail,
      grid: this.owner,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      }
    };
    for (const handler of [...this.handlers.get(type) ?? [], ...this.handlers.get("*") ?? []]) {
      try {
        handler(event);
      } catch (e) {
        console.error(`[intelligent-grid] "${type}" handler failed`, e);
      }
    }
    return event;
  }
};

// src/core/changes.ts
var copyFormulas = (formulas) => {
  if (!formulas) return void 0;
  const real = Object.fromEntries(Object.entries(formulas).filter(([, formula]) => formula));
  return Object.keys(real).length ? real : void 0;
};
var ChangeTracker = class {
  history = [];
  historyLimit;
  originals = /* @__PURE__ */ new Map();
  inserted = /* @__PURE__ */ new Set();
  deleted = /* @__PURE__ */ new Map();
  seq = 0;
  constructor(historyLimit = 5e3) {
    this.historyLimit = historyLimit;
  }
  /**
   * Must be called before a row is modified, so its original values can be compared later.
   */
  touch(id, data, formulas) {
    if (!data || this.inserted.has(id) || this.originals.has(id)) return;
    this.originals.set(id, { data: { ...data }, formulas: formulas ? { ...formulas } : void 0 });
  }
  log(entry) {
    this.history.push({ seq: ++this.seq, at: (/* @__PURE__ */ new Date()).toISOString(), ...entry });
    if (this.history.length > this.historyLimit) this.history.splice(0, this.history.length - this.historyLimit);
  }
  recordInsert(id, source = "api") {
    this.inserted.add(id);
    this.log({ type: "insert", id, source });
  }
  recordUpdate(id, field, from, to, source = "api", formula) {
    const entry = { type: "update", id, field, from, to, source };
    if (formula !== void 0) entry.formula = formula;
    this.log(entry);
  }
  /**
   * @param data the row right before it is removed
   */
  recordDelete(id, data, formulas, source = "api") {
    if (this.inserted.has(id)) {
      this.inserted.delete(id);
    } else {
      this.deleted.set(id, this.originals.get(id) ?? { data: { ...data }, formulas: formulas ? { ...formulas } : void 0 });
    }
    this.originals.delete(id);
    this.log({ type: "delete", id, source });
  }
  isInserted(id) {
    return this.inserted.has(id);
  }
  /**
   * Fields of a row whose value differs from the original (empty for untouched rows).
   */
  changedFields(id, readers) {
    const original = this.originals.get(id);
    const data = readers.current(id);
    if (!original || !data) return {};
    const before = readers.publicRow(original.data);
    const after = readers.publicRow(data);
    const changes = {};
    for (const field of /* @__PURE__ */ new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (field === "_id" || !readers.tracked(id, field, original.formulas)) continue;
      if (!sameValue(before[field], after[field])) changes[field] = { from: before[field] ?? null, to: after[field] ?? null };
    }
    return changes;
  }
  getChanges(readers) {
    const withFormulas = (entry, formulas) => {
      const real = copyFormulas(formulas);
      return real ? { ...entry, formulas: real } : entry;
    };
    const inserted = [];
    for (const id of this.inserted) {
      const data = readers.current(id);
      if (data) inserted.push(withFormulas({ id, row: readers.publicRow(data) }, readers.formulas(id)));
    }
    const updated = [];
    for (const id of this.originals.keys()) {
      const changes = this.changedFields(id, readers);
      const data = readers.current(id);
      if (data && Object.keys(changes).length) {
        updated.push(withFormulas({ id, changes, row: readers.publicRow(data) }, readers.formulas(id)));
      }
    }
    const deleted = [...this.deleted].map(([id, snapshot]) => ({ id, row: readers.publicRow(snapshot.data) }));
    return { inserted, updated, deleted };
  }
  summary(readers) {
    const changes = this.getChanges(readers);
    const inserted = changes.inserted.length;
    const updated = changes.updated.length;
    const deleted = changes.deleted.length;
    return { inserted, updated, deleted, total: inserted + updated + deleted };
  }
  /**
   * What has to be undone to restore the original state, for the given rows (all when null).
   */
  pending(ids) {
    const inScope = (id) => !ids || ids.has(id);
    return {
      inserted: [...this.inserted].filter(inScope),
      updated: [...this.originals].filter(([id]) => inScope(id)),
      deleted: [...this.deleted].filter(([id]) => inScope(id))
    };
  }
  /**
   * Forgets the tracked state of the given rows (all when null): their current values become the new originals.
   */
  forget(ids) {
    if (!ids) {
      this.originals.clear();
      this.inserted.clear();
      this.deleted.clear();
      this.history = [];
      return;
    }
    for (const id of ids) {
      this.originals.delete(id);
      this.inserted.delete(id);
      this.deleted.delete(id);
    }
    this.history = this.history.filter((entry) => !ids.has(entry.id));
  }
  reset() {
    this.forget(null);
  }
};
function sameValue(a, b) {
  if (a === b) return true;
  if ((a === null || a === void 0 || a === "") && (b === null || b === void 0 || b === "")) return true;
  return typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b);
}

// src/formula/dates.ts
var MS_PER_DAY = 864e5;
var EPOCH = Date.UTC(1899, 11, 30);
var ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/;
function isISODate(value) {
  return typeof value === "string" && ISO_DATE.test(value);
}
function partsToSerial(year, month, day, hours = 0, minutes = 0, seconds = 0) {
  return (Date.UTC(year, month - 1, day, hours, minutes, seconds) - EPOCH) / MS_PER_DAY;
}
function toSerial(value) {
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return partsToSerial(
      value.getFullYear(),
      value.getMonth() + 1,
      value.getDate(),
      value.getHours(),
      value.getMinutes(),
      value.getSeconds()
    );
  }
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const match = ISO_DATE.exec(value);
    if (!match) return null;
    const [y, m, d, h2 = 0, mi = 0, s = 0] = match.slice(1).map((part) => part === void 0 ? void 0 : Number(part));
    return partsToSerial(y, m, d, h2, mi, s);
  }
  return null;
}
function serialToParts(serial2) {
  const ms = Math.round(serial2 * MS_PER_DAY / 1e3) * 1e3 + EPOCH;
  const date = new Date(ms);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hours: date.getUTCHours(),
    minutes: date.getUTCMinutes(),
    seconds: date.getUTCSeconds(),
    weekday: date.getUTCDay()
  };
}
var pad = (n, size = 2) => String(n).padStart(size, "0");
function serialToISO(serial2, withTime = false) {
  const p = serialToParts(serial2);
  const date = `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
  return withTime ? `${date}T${pad(p.hours)}:${pad(p.minutes)}:${pad(p.seconds)}` : date;
}
function todaySerial() {
  return Math.floor(toSerial(/* @__PURE__ */ new Date()));
}
function nowSerial() {
  return toSerial(/* @__PURE__ */ new Date());
}

// src/formula/values.ts
var NUMERIC = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;
function fromCell(value) {
  if (value === void 0 || value === null || value === "") return null;
  if (value instanceof Date) return toSerial(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return reviveError(value);
  if (Array.isArray(value)) return value.map(fromCell);
  return String(value);
}
function toNumber(value) {
  if (isError(value)) throw value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw err(ERRORS.NUM);
    return value;
  }
  if (value === null || value === void 0) return 0;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (Array.isArray(value)) {
    if (value.length === 1) return toNumber(value[0]);
    throw err(ERRORS.VALUE);
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (NUMERIC.test(text)) return Number(text);
    if (/^[+-]?(\d+\.?\d*|\.\d+)%$/.test(text)) return Number(text.slice(0, -1)) / 100;
    if (isISODate(text)) return toSerial(text);
  }
  throw err(ERRORS.VALUE);
}
function asNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const text = value.trim();
    if (NUMERIC.test(text)) return Number(text);
    if (isISODate(text)) return toSerial(text);
  }
  return null;
}
function toText(value, ctx) {
  if (isError(value)) throw value;
  if (value === null || value === void 0) return "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return formatGeneral(value, ctx?.decimalSeparator ?? ".");
  if (Array.isArray(value)) {
    if (value.length === 1) return toText(value[0], ctx);
    throw err(ERRORS.VALUE);
  }
  return String(value);
}
function formatGeneral(number, decimalSeparator = ".") {
  if (Number.isInteger(number)) return String(number);
  const text = String(Number(number.toPrecision(15)));
  return decimalSeparator === "." ? text : text.replace(".", decimalSeparator);
}
function toBoolean(value) {
  if (isError(value)) throw value;
  if (typeof value === "boolean") return value;
  if (value === null || value === void 0) return false;
  if (typeof value === "number") return value !== 0;
  if (Array.isArray(value)) {
    if (value.length === 1) return toBoolean(value[0]);
    throw err(ERRORS.VALUE);
  }
  const upper = String(value).trim().toUpperCase();
  if (upper === "TRUE") return true;
  if (upper === "FALSE") return false;
  throw err(ERRORS.VALUE);
}
var typeRank = (value) => {
  if (typeof value === "string") return 1;
  if (typeof value === "boolean") return 2;
  return 0;
};
function compareValues(a, b) {
  if (isError(a)) throw a;
  if (isError(b)) throw b;
  if (a === null || a === void 0) a = typeof b === "string" ? "" : typeof b === "boolean" ? false : 0;
  if (b === null || b === void 0) b = typeof a === "string" ? "" : typeof a === "boolean" ? false : 0;
  if (typeof a === "string" && typeof b === "number" && isISODate(a)) a = toSerial(a);
  if (typeof b === "string" && typeof a === "number" && isISODate(b)) b = toSerial(b);
  const rankA = typeRank(a);
  const rankB = typeRank(b);
  if (rankA !== rankB) return rankA < rankB ? -1 : 1;
  if (typeof a === "string" && typeof b === "string") {
    const x = a.toLowerCase();
    const y = b.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  }
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
function lift2(a, b, fn) {
  const apply = (x, y) => {
    try {
      return fn(x, y);
    } catch (e) {
      if (isError(e)) return e;
      throw e;
    }
  };
  const arrA = Array.isArray(a);
  const arrB = Array.isArray(b);
  if (!arrA && !arrB) return apply(a, b);
  const length = arrA && arrB ? Math.max(a.length, b.length) : arrA ? a.length : b.length;
  const out = new Array(length);
  for (let i = 0; i < length; i++) {
    const x = arrA ? i < a.length ? a[i] : err(ERRORS.NA) : a;
    const y = arrB ? i < b.length ? b[i] : err(ERRORS.NA) : b;
    out[i] = apply(x, y);
  }
  return out;
}
function lift1(a, fn) {
  return lift2(a, null, (x) => fn(x));
}

// src/formula/numfmt.ts
var separatorsCache = /* @__PURE__ */ new Map();
function localeSeparators(locale) {
  let separators = separatorsCache.get(locale);
  if (!separators) {
    const parts = new Intl.NumberFormat(locale).formatToParts(12345675e-1);
    separators = {
      group: parts.find((p) => p.type === "group")?.value ?? ",",
      decimal: parts.find((p) => p.type === "decimal")?.value ?? "."
    };
    separatorsCache.set(locale, separators);
  }
  return separators;
}
function splitSections(code) {
  const sections = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch === '"') quoted = !quoted;
    if (ch === "\\" && !quoted) {
      current += ch + (code[i + 1] ?? "");
      i++;
      continue;
    }
    if (ch === ";" && !quoted) {
      sections.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  sections.push(current);
  return sections;
}
function lex(section) {
  const tokens = [];
  for (let i = 0; i < section.length; i++) {
    const ch = section[i];
    if (ch === '"') {
      const end = section.indexOf('"', i + 1);
      tokens.push({ literal: section.slice(i + 1, end === -1 ? void 0 : end) });
      i = end === -1 ? section.length : end;
    } else if (ch === "\\") {
      tokens.push({ literal: section[i + 1] ?? "" });
      i++;
    } else if (ch === "[") {
      const end = section.indexOf("]", i);
      const inner = section.slice(i + 1, end);
      if (inner.startsWith("$")) tokens.push({ literal: inner.slice(1).split("-")[0] });
      i = end === -1 ? section.length : end;
    } else if (ch === "_" || ch === "*") {
      if (ch === "_") tokens.push({ literal: " " });
      i++;
    } else {
      tokens.push({ code: ch });
    }
  }
  return tokens;
}
var codeText = (tokens) => tokens.map((t) => t.code ?? "").join("");
function isDateFormat(code) {
  if (!code || /^general$/i.test(code)) return false;
  const text = codeText(lex(splitSections(code)[0]));
  return /[ydhs]/i.test(text) || /m/i.test(text) && !/[0#?]/.test(text);
}
function formatDate(serial2, tokens, locale) {
  const p = serialToParts(serial2);
  const text = codeText(tokens);
  const hasAmPm = /AM\/PM|A\/P/i.test(text);
  const monthName = (style) => new Intl.DateTimeFormat(locale, { month: style, timeZone: "UTC" }).format(new Date(Date.UTC(2e3, p.month - 1, 1)));
  const dayName = (style) => new Intl.DateTimeFormat(locale, { weekday: style, timeZone: "UTC" }).format(new Date(Date.UTC(2e3, 0, 2 + p.weekday)));
  const pad2 = (n) => String(n).padStart(2, "0");
  const codes = [];
  for (const token of tokens) {
    if (token.literal !== void 0) {
      codes.push(token);
      continue;
    }
    const prev = codes[codes.length - 1];
    if (prev?.code && prev.code[0].toLowerCase() === token.code.toLowerCase() && /[ymdhs]/i.test(token.code)) {
      prev.code += token.code;
    } else {
      codes.push({ code: token.code });
    }
  }
  let out = "";
  let lastWasHour = false;
  for (let i = 0; i < codes.length; i++) {
    const token = codes[i];
    if (token.literal !== void 0) {
      out += token.literal;
      continue;
    }
    const run = token.code;
    const lower = run.toLowerCase();
    const rest = () => codes.slice(i).map((t) => t.code ?? t.literal).join("");
    if (lower[0] === "y") {
      out += run.length <= 2 ? pad2(p.year % 100) : String(p.year);
    } else if (lower[0] === "m") {
      const nextCode = codes.slice(i + 1).find((t) => t.code && /[a-z]/i.test(t.code));
      const isMinute = lastWasHour || nextCode?.code?.[0]?.toLowerCase() === "s";
      if (isMinute) out += run.length >= 2 ? pad2(p.minutes) : String(p.minutes);
      else if (run.length >= 4) out += monthName("long");
      else if (run.length === 3) out += monthName("short").replace(".", "");
      else out += run.length === 2 ? pad2(p.month) : String(p.month);
    } else if (lower[0] === "d") {
      if (run.length >= 4) out += dayName("long");
      else if (run.length === 3) out += dayName("short").replace(".", "");
      else out += run.length === 2 ? pad2(p.day) : String(p.day);
    } else if (lower[0] === "h") {
      let hours = p.hours;
      if (hasAmPm) hours = hours % 12 || 12;
      out += run.length >= 2 ? pad2(hours) : String(hours);
      lastWasHour = true;
      continue;
    } else if (lower[0] === "s") {
      out += run.length >= 2 ? pad2(p.seconds) : String(p.seconds);
    } else if (lower === "a" && /^AM\/PM/i.test(rest())) {
      out += p.hours < 12 ? "AM" : "PM";
      i += 4;
    } else if (lower === "a" && /^A\/P/i.test(rest())) {
      out += p.hours < 12 ? "A" : "P";
      i += 2;
    } else {
      out += run;
    }
    if (/[a-z]/i.test(run)) lastWasHour = false;
  }
  return out;
}
function roundTo(number, digits) {
  const factor = Math.pow(10, digits);
  return Math.round(number * factor * (1 + Number.EPSILON)) / factor;
}
function formatNumber(value, tokens, locale, signed) {
  const { group, decimal } = localeSeparators(locale);
  const text = codeText(tokens);
  const percent = (text.match(/%/g) ?? []).length;
  let number = value * Math.pow(100, percent);
  const first = tokens.findIndex((t) => t.code && /[0#?]/.test(t.code));
  if (first === -1) {
    return tokens.map((t) => t.literal ?? (t.code === "@" ? "" : t.code)).join("");
  }
  let last = first;
  tokens.forEach((t, i) => {
    if (t.code && /[0#?.,]/.test(t.code) && i > first) last = i;
  });
  const pattern = codeText(tokens.slice(first, last + 1));
  const [intPattern = "", decPattern = ""] = pattern.split(".");
  const useGrouping = intPattern.includes(",");
  const scaleCommas = (intPattern.match(/,+$/) ?? [""])[0].length;
  number = number / Math.pow(1e3, scaleCommas);
  const minInt = (intPattern.match(/0/g) ?? []).length;
  const maxDec = (decPattern.match(/[0#?]/g) ?? []).length;
  const minDec = (decPattern.match(/0/g) ?? []).length;
  const negative = number < 0;
  const fixed = roundTo(Math.abs(number), maxDec).toFixed(maxDec);
  let [intPart = "", decPart = ""] = fixed.split(".");
  while (decPart.length > minDec && decPart.endsWith("0")) decPart = decPart.slice(0, -1);
  if (intPart === "0" && minInt === 0) intPart = "";
  intPart = intPart.padStart(minInt, "0");
  if (useGrouping) intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  const numeric = intPart + (decPart ? decimal + decPart : decPattern.includes("0") ? decimal : "");
  const prefix = tokens.slice(0, first).map((t) => t.literal ?? t.code).join("");
  const suffix = tokens.slice(last + 1).map((t) => t.literal ?? t.code).join("");
  const sign = signed && negative && Number(fixed) !== 0 ? "-" : "";
  return sign + prefix + numeric + suffix;
}
function formatValue(value, code, locale = "en-US") {
  if (value === null || value === void 0) return "";
  if (!code || /^general$/i.test(code)) {
    if (typeof value === "number") return formatGeneral(value, localeSeparators(locale).decimal);
    if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
    return String(value);
  }
  const sections = splitSections(code);
  if (typeof value !== "number") {
    const serial2 = isDateFormat(code) ? toSerial(value) : null;
    if (serial2 === null) {
      const textSection = sections[3] ?? (sections.length === 1 && sections[0].includes("@") ? sections[0] : null);
      if (!textSection) return typeof value === "boolean" ? value ? "TRUE" : "FALSE" : String(value);
      return lex(textSection).map((t) => t.literal ?? (t.code === "@" ? String(value) : t.code)).join("");
    }
    value = serial2;
  }
  const number = value;
  let section = sections[0];
  let signed = true;
  if (number < 0 && sections[1] !== void 0 && sections[1] !== "") {
    section = sections[1];
    signed = false;
  } else if (number === 0 && sections[2] !== void 0 && sections[2] !== "") {
    section = sections[2];
  }
  const tokens = lex(section);
  if (isDateFormat(section)) return formatDate(number, tokens, locale);
  return formatNumber(signed ? number : Math.abs(number), tokens, locale, signed);
}

// src/core/columns.ts
var TYPES = ["text", "number", "integer", "currency", "percent", "date", "datetime", "boolean", "select"];
var NUMERIC_TYPES = /* @__PURE__ */ new Set(["number", "integer", "currency", "percent"]);
var DATE_TYPES = /* @__PURE__ */ new Set(["date", "datetime"]);
var DEFAULT_CURRENCY = { "pt-BR": "BRL", "en-US": "USD", "en-GB": "GBP", "es-ES": "EUR", "de-DE": "EUR", "fr-FR": "EUR" };
function normalizeColumn(definition, grid) {
  if (!definition || typeof definition.field !== "string" || !definition.field) {
    throw new Error('Every column needs a "field"');
  }
  if (/[.$]/.test(definition.field)) {
    throw new Error(`Column field "${definition.field}" cannot contain "." or "$" (reserved by SorlaDB)`);
  }
  const type = definition.type ?? (definition.options ? "select" : "text");
  if (!TYPES.includes(type)) throw new Error(`Unknown column type "${String(type)}"`);
  const isFormula2 = typeof definition.formula === "string";
  const { options, editor, ...rest } = definition;
  return {
    title: definition.field,
    width: null,
    minWidth: 60,
    visible: true,
    sortable: true,
    filterable: true,
    resizable: true,
    editable: isFormula2 ? false : grid.editable,
    allowFormulas: grid.cellFormulas,
    decimals: type === "integer" ? 0 : type === "currency" ? 2 : null,
    currency: grid.currency ?? DEFAULT_CURRENCY[grid.locale] ?? "USD",
    align: NUMERIC_TYPES.has(type) ? "right" : type === "boolean" ? "center" : "left",
    conditionalFormats: [],
    html: false,
    ...rest,
    type,
    options: options ? normalizeOptions(options) : void 0,
    editor: editor ?? defaultEditor(type)
  };
}
function normalizeOptions(options) {
  return options.map((option) => typeof option === "object" && option !== null ? { value: option.value, label: String(option.label ?? option.value) } : { value: option, label: String(option) });
}
function defaultEditor(type) {
  if (NUMERIC_TYPES.has(type)) return "number";
  if (type === "date") return "date";
  if (type === "datetime") return "datetime";
  if (type === "boolean") return "checkbox";
  if (type === "select") return "select";
  return "text";
}
var numberFormatters = /* @__PURE__ */ new Map();
var dateFormatters = /* @__PURE__ */ new Map();
function numberFormatter(locale, options) {
  const key = locale + JSON.stringify(options);
  let formatter = numberFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options);
    numberFormatters.set(key, formatter);
  }
  return formatter;
}
function dateFormatter(locale, options) {
  const key = locale + JSON.stringify(options);
  let formatter = dateFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    dateFormatters.set(key, formatter);
  }
  return formatter;
}
function formatCell(value, column, row, locale) {
  if (isErrorCode(value)) return value;
  if (typeof column.format === "function") return String(column.format(value, row, column) ?? "");
  if (isBlank(value)) return "";
  if (typeof column.format === "string") return formatValue(value, column.format, locale);
  switch (column.type) {
    case "number":
    case "integer":
    case "currency":
    case "percent": {
      const number = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(number)) return String(value);
      const decimals = column.decimals ?? null;
      const options = {
        style: column.type === "currency" ? "currency" : column.type === "percent" ? "percent" : "decimal",
        minimumFractionDigits: decimals ?? 0,
        maximumFractionDigits: decimals ?? (column.type === "percent" ? 2 : 4)
      };
      if (column.type === "currency") options.currency = column.currency ?? "USD";
      return numberFormatter(locale, options).format(number);
    }
    case "date":
    case "datetime": {
      const serial2 = toSerial(value);
      if (serial2 === null) return String(value);
      const date = /* @__PURE__ */ new Date(`${serialToISO(serial2, true)}Z`);
      const options = { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" };
      if (column.type === "datetime") Object.assign(options, { hour: "2-digit", minute: "2-digit" });
      return dateFormatter(locale, options).format(date);
    }
    case "boolean":
      return value === true ? "\u2713" : value === false ? "\u2717" : String(value);
    case "select": {
      const option = column.options?.find((o) => o.value === value);
      return option ? option.label : String(value);
    }
    default:
      return String(value);
  }
}
function excelFormatCode(column, locale) {
  if (typeof column.format === "string") return column.format;
  const decimals = column.decimals;
  const fraction = (places) => places > 0 ? "." + "0".repeat(places) : "";
  switch (column.type) {
    case "integer":
      return "#,##0";
    case "number":
      return decimals === null || decimals === void 0 ? "General" : `#,##0${fraction(decimals)}`;
    case "percent":
      return `0${fraction(decimals ?? 0)}%`;
    case "currency": {
      const parts = new Intl.NumberFormat(locale, { style: "currency", currency: column.currency }).formatToParts(1);
      const symbol = parts.find((p) => p.type === "currency")?.value ?? column.currency;
      const symbolFirst = parts.findIndex((p) => p.type === "currency") < parts.findIndex((p) => p.type === "integer");
      const number = `#,##0${fraction(decimals ?? 2)}`;
      const quoted = `"${symbol}"`;
      return symbolFirst ? `${quoted} ${number};-${quoted} ${number}` : `${number} ${quoted};-${number} ${quoted}`;
    }
    case "date":
      return localeDatePattern(locale);
    case "datetime":
      return `${localeDatePattern(locale)} hh:mm`;
    default:
      return null;
  }
}
function localeDatePattern(locale) {
  const parts = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(new Date(Date.UTC(2026, 0, 31)));
  const tokens = { day: "dd", month: "mm", year: "yyyy" };
  return parts.map((p) => p.type === "literal" ? p.value : tokens[p.type] ?? "").join("");
}
function parseInput(input, column, locale) {
  if (typeof column.parse === "function") {
    try {
      return { value: column.parse(input, column) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }
  if (typeof input !== "string") {
    if (input instanceof Date) return { value: serialToISO(toSerial(input), column.type === "datetime") };
    return { value: input };
  }
  const text = input.trim();
  if (text === "") return { value: null };
  switch (column.type) {
    case "number":
    case "integer":
    case "currency":
    case "percent": {
      const number = parseNumberText(text, locale);
      if (number === null) return { error: "invalidNumber" };
      if (column.type === "percent" && !text.endsWith("%")) return { value: number / 100 };
      if (column.type === "percent") return { value: number };
      if (column.type === "integer" && !Number.isInteger(number)) return { error: "invalidInteger" };
      return { value: number };
    }
    case "date":
    case "datetime": {
      const iso = parseDateText(text, locale, column.type === "datetime");
      return iso === null ? { error: "invalidDate" } : { value: iso };
    }
    case "boolean": {
      const lower = text.toLowerCase();
      if (["true", "1", "yes", "sim", "x", "verdadeiro", "\u2713"].includes(lower)) return { value: true };
      if (["false", "0", "no", "n\xE3o", "nao", "falso", "\u2717"].includes(lower)) return { value: false };
      return { error: "invalidBoolean" };
    }
    case "select": {
      const lower = text.toLowerCase();
      const option = column.options?.find((o) => String(o.value).toLowerCase() === lower || o.label.toLowerCase() === lower);
      if (option) return { value: option.value };
      return column.strict === false ? { value: text } : { error: "invalidOption" };
    }
    default:
      return { value: input };
  }
}
function parseNumberText(text, locale) {
  const { group, decimal } = localeSeparators(locale);
  let value = text.replace(/[^\d.,\-+%eE]/g, "");
  const percent = value.endsWith("%");
  value = value.replace("%", "");
  if (!value) return null;
  const hasGroup = value.includes(group);
  const hasDecimal = value.includes(decimal);
  if (decimal === "," && !hasDecimal && hasGroup && !/^\d{1,3}(\.\d{3})+$/.test(value)) {
    value = value.replace(".", ",");
  }
  const normalized = value.split(group).join("").replace(decimal, ".");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(normalized)) return null;
  const number = Number(normalized);
  return percent ? number / 100 : number;
}
function parseDateText(text, locale, withTime) {
  const serial2 = toSerial(text);
  if (serial2 !== null) return withTime ? serialToISO(serial2, true).slice(0, 16) : serialToISO(serial2);
  const match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  if (!match) return null;
  const [, a = "", b = "", yearText = "", h2 = "0", mi = "0", s = "0"] = match;
  let year = Number(yearText);
  if (year < 100) year += year < 30 ? 2e3 : 1900;
  const monthFirst = localeDatePattern(locale).startsWith("mm");
  const month = Number(monthFirst ? a : b);
  const day = Number(monthFirst ? b : a);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (new Date(Date.UTC(year, month - 1, day)).getUTCDate() !== day) return null;
  const iso = serialToISO(partsToSerial(year, month, day, Number(h2), Number(mi), Number(s)), withTime);
  return withTime ? iso.slice(0, 16) : iso;
}
function editorText(value, column, locale) {
  if (isBlank(value)) return "";
  if (column.type === "date") return String(value).slice(0, 10);
  if (column.type === "datetime") return String(value).slice(0, 16);
  if (NUMERIC_TYPES.has(column.type) && typeof value === "number") {
    const shown = column.type === "percent" ? Number((value * 100).toPrecision(15)) : value;
    return String(shown).replace(".", localeSeparators(locale).decimal) + (column.type === "percent" ? "%" : "");
  }
  return String(value);
}
function compareBound(value, bound) {
  const a = toSerial(value) ?? value;
  const b = toSerial(bound) ?? bound;
  return a < b ? -1 : a > b ? 1 : 0;
}
function validateValue(value, column, row) {
  const rules = column.validate;
  if (!rules) return null;
  const check = (rule) => {
    if (typeof rule === "function") {
      const result = rule(value, row, column);
      if (result === true || result === void 0 || result === null) return null;
      return result === false ? "invalidValue" : String(result);
    }
    const blank = isBlank(value);
    if (rule.required && blank) return rule.message ?? "required";
    if (blank) return null;
    if (rule.min !== void 0 && compareBound(value, rule.min) < 0) return rule.message ?? `min:${rule.min}`;
    if (rule.max !== void 0 && compareBound(value, rule.max) > 0) return rule.message ?? `max:${rule.max}`;
    if (rule.minLength !== void 0 && String(value).length < rule.minLength) return rule.message ?? `minLength:${rule.minLength}`;
    if (rule.maxLength !== void 0 && String(value).length > rule.maxLength) return rule.message ?? `maxLength:${rule.maxLength}`;
    if (rule.pattern && !new RegExp(rule.pattern).test(String(value))) return rule.message ?? "pattern";
    return null;
  };
  for (const rule of Array.isArray(rules) ? rules : [rules]) {
    const error = check(rule);
    if (error) return error;
  }
  return null;
}

// src/core/filters.ts
var TEXT_OPERATORS = ["contains", "notContains", "equals", "notEquals", "startsWith", "endsWith", "empty", "notEmpty"];
var RANGE_OPERATORS = ["eq", "ne", "gt", "gte", "lt", "lte", "between", "empty", "notEmpty"];
var BOOLEAN_OPERATORS = ["eq", "empty", "notEmpty"];
function operatorsFor(column) {
  if (column.type === "boolean") return BOOLEAN_OPERATORS;
  if (NUMERIC_TYPES.has(column.type) || DATE_TYPES.has(column.type)) return RANGE_OPERATORS;
  return TEXT_OPERATORS;
}
var isRangeType = (column) => NUMERIC_TYPES.has(column.type) || DATE_TYPES.has(column.type);
function coerceOperand(value, column, locale) {
  if (value === null || value === void 0 || value === "") return null;
  if (NUMERIC_TYPES.has(column.type)) {
    if (typeof value === "number") return value;
    const number = parseNumberText(String(value), locale);
    if (number === null) return null;
    return column.type === "percent" && !String(value).includes("%") ? number / 100 : number;
  }
  if (DATE_TYPES.has(column.type)) return parseDateText(String(value), locale, false);
  if (column.type === "boolean") return value === true || value === "true";
  return value;
}
var nextDay = (iso) => serialToISO(Math.floor(toSerial(iso)) + 1);
function toSorla(condition, column, locale) {
  const { op } = condition;
  if (op === "empty") return { $eq: "" };
  if (op === "notEmpty") return { $ne: "" };
  if (column.type === "boolean") {
    return op === "eq" ? { $eq: coerceOperand(condition.value, column, locale) } : null;
  }
  if (!isRangeType(column)) {
    if (column.type === "select" && (op === "equals" || op === "notEquals")) {
      return op === "equals" ? { $eq: condition.value } : { $ne: condition.value };
    }
    return null;
  }
  const value = coerceOperand(condition.value, column, locale);
  if (value === null) return {};
  const day = column.type === "datetime";
  const iso = value;
  switch (op) {
    case "eq":
      return day ? { $gte: value, $lt: nextDay(iso) } : { $eq: value };
    case "ne":
      return day ? null : { $ne: value };
    // blanks are stored as '' and '' < 5 is true in JS, so range operators exclude them
    case "gt":
      return day ? { $gte: nextDay(iso), $ne: "" } : { $gt: value, $ne: "" };
    case "gte":
      return { $gte: value, $ne: "" };
    case "lt":
      return { $lt: value, $ne: "" };
    case "lte":
      return day ? { $lt: nextDay(iso), $ne: "" } : { $lte: value, $ne: "" };
    case "between": {
      const upper = coerceOperand(condition.value2, column, locale);
      if (upper === null) return { $gte: value, $ne: "" };
      return day ? { $gte: value, $lt: nextDay(upper), $ne: "" } : { $gte: value, $lte: upper, $ne: "" };
    }
  }
  return null;
}
function testCondition(rawValue, condition, column, locale) {
  const { op } = condition;
  if (op === "empty") return isBlank(rawValue);
  if (op === "notEmpty") return !isBlank(rawValue);
  if (isRangeType(column) || column.type === "boolean") {
    const operand = coerceOperand(condition.value, column, locale);
    if (operand === null) return true;
    if (isBlank(rawValue)) return op === "ne";
    const toComparable = (v) => DATE_TYPES.has(column.type) ? Math.floor(toSerial(v) ?? NaN) : v;
    const value = toComparable(rawValue);
    const target = toComparable(operand);
    switch (op) {
      case "eq":
        return value === target;
      case "ne":
        return value !== target;
      case "gt":
        return value > target;
      case "gte":
        return value >= target;
      case "lt":
        return value < target;
      case "lte":
        return value <= target;
      case "between": {
        const upper = coerceOperand(condition.value2, column, locale);
        return value >= target && (upper === null || value <= toComparable(upper));
      }
    }
    return true;
  }
  const needle = String(condition.value ?? "").toLocaleLowerCase(locale);
  const option = column.options?.find((o) => o.value === rawValue);
  const haystack = String(option ? option.label : rawValue ?? "").toLocaleLowerCase(locale);
  const raw = String(rawValue ?? "").toLocaleLowerCase(locale);
  switch (op) {
    case "contains":
      return haystack.includes(needle);
    case "notContains":
      return !haystack.includes(needle);
    case "equals":
      return haystack === needle || raw === needle;
    case "notEquals":
      return haystack !== needle && raw !== needle;
    case "startsWith":
      return haystack.startsWith(needle);
    case "endsWith":
      return haystack.endsWith(needle);
  }
  return true;
}
function mergeOperators(target, operators) {
  for (const [key, value] of Object.entries(operators)) {
    if (key in target && target[key] !== value) return false;
  }
  Object.assign(target, operators);
  return true;
}
var isActive = (condition) => !!condition && !!condition.op && (condition.op === "empty" || condition.op === "notEmpty" || condition.value !== void 0 && condition.value !== null && condition.value !== "");
function isFilterActive(filter) {
  if (!filter) return false;
  return Array.isArray(filter.values) || (filter.conditions ?? []).some(isActive) || typeof filter.formula === "string" && filter.formula.trim() !== "" || typeof filter.test === "function";
}
function compileFilters(filters, columns, { locale = "en-US", testFormula } = {}) {
  const query = {};
  const predicates = [];
  for (const [field, filter] of Object.entries(filters ?? {})) {
    if (!isFilterActive(filter)) continue;
    const column = columns.get(field) ?? { field, type: "text" };
    const operators = {};
    if (Array.isArray(filter.values)) {
      operators.$in = [...filter.values];
    }
    const conditions = (filter.conditions ?? []).filter(isActive);
    if (conditions.length) {
      const join = filter.join === "or" && conditions.length > 1 ? "or" : "and";
      const residual = [];
      if (join === "and") {
        for (const condition of conditions) {
          const sorla = toSorla(condition, column, locale);
          if (sorla === null || !mergeOperators(operators, sorla)) residual.push(condition);
        }
        if (residual.length) {
          predicates.push((row) => residual.every((c) => testCondition(row[field], c, column, locale)));
        }
      } else {
        predicates.push((row) => conditions.some((c) => testCondition(row[field], c, column, locale)));
      }
    }
    const test = filter.test;
    if (typeof test === "function") {
      predicates.push((row) => !!test(row[field], row));
    }
    const formula = filter.formula;
    if (typeof formula === "string" && formula.trim() && testFormula) {
      predicates.push((row) => testFormula(formula, row));
    }
    if (Object.keys(operators).length) query[field] = operators;
  }
  return { query, predicates };
}

// src/formula/functions.ts
var registry = /* @__PURE__ */ new Map();
function defineFunction(name, fn, options = {}) {
  registry.set(name.toUpperCase(), { fn, lazy: false, errors: !!options.errors });
}
function defineLazyFunction(name, fn) {
  registry.set(name.toUpperCase(), { fn, lazy: true, errors: false });
}
function getFunction(name) {
  return registry.get(name.toUpperCase());
}
function listFunctions() {
  return [...registry.keys()].sort();
}
function fail(code) {
  throw err(code);
}
var flat = (args) => args.flatMap((arg) => Array.isArray(arg) ? arg : [arg]);
function numbers(args) {
  const out = [];
  for (const arg of args) {
    if (Array.isArray(arg)) {
      for (const item of arg) {
        if (isError(item)) throw item;
        if (typeof item === "number") out.push(item);
      }
    } else if (arg !== null && arg !== void 0) {
      out.push(toNumber(arg));
    }
  }
  return out;
}
var sum = (list) => list.reduce((acc, n) => acc + n, 0);
function average(list) {
  if (!list.length) fail(ERRORS.DIV0);
  return sum(list) / list.length;
}
function variance(list, sample) {
  if (list.length < (sample ? 2 : 1)) fail(ERRORS.DIV0);
  const mean = sum(list) / list.length;
  return sum(list.map((n) => (n - mean) ** 2)) / (list.length - (sample ? 1 : 0));
}
function roundHalfAway(number, digits) {
  const factor = Math.pow(10, digits);
  const scaled = Math.abs(number) * factor;
  return Math.sign(number) * Math.round(scaled * (1 + Number.EPSILON)) / factor;
}
var integer = (value) => Math.trunc(toNumber(value));
var optional = (value, fallback) => value === void 0 || value === null ? fallback : value;
var OUTCOMES = (c) => ({ "=": c === 0, "<>": c !== 0, "<": c < 0, "<=": c <= 0, ">": c > 0, ">=": c >= 0 });
function compileCriteria(criteria) {
  if (isError(criteria)) throw criteria;
  if (typeof criteria === "number") return (value) => typeof value !== "boolean" && asNumber(value) === criteria;
  if (typeof criteria === "boolean") return (value) => value === criteria;
  const text = criteria === null || criteria === void 0 ? "" : String(criteria);
  const match = /^(<=|>=|<>|<|>|=)?(.*)$/s.exec(text);
  const op = match[1] ?? "=";
  const operand = match[2] ?? "";
  const numeric = asNumber(operand);
  if (numeric !== null && operand.trim() !== "") {
    return (value) => {
      const n = typeof value === "boolean" ? null : asNumber(value);
      if (n === null) return op === "<>";
      return OUTCOMES(n === numeric ? 0 : n < numeric ? -1 : 1)[op];
    };
  }
  if (op === "=" || op === "<>") {
    if (operand === "") {
      return op === "=" ? (value) => value === null || value === "" : (value) => value !== null && value !== "";
    }
    const upper = operand.toUpperCase();
    if (upper === "TRUE" || upper === "FALSE") {
      const bool = upper === "TRUE";
      return (value) => value === bool === (op === "=");
    }
    const regex = wildcardRegex(operand);
    return (value) => {
      const hit = value !== null && value !== void 0 && !isError(value) && regex.test(toText(value));
      return op === "=" ? hit : !hit;
    };
  }
  return (value) => {
    if (typeof value !== "string") return false;
    return OUTCOMES(compareValues(value, operand))[op];
  };
}
function wildcardRegex(pattern) {
  const escape = (ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let source = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "~" && i + 1 < pattern.length) source += escape(pattern[++i]);
    else if (ch === "*") source += ".*";
    else if (ch === "?") source += ".";
    else source += escape(ch);
  }
  return new RegExp(`^${source}$`, "is");
}
var asArray = (value) => Array.isArray(value) ? value : [value ?? null];
function matchingIndexes(pairs) {
  if (pairs.length % 2 !== 0 || pairs.length === 0) fail(ERRORS.VALUE);
  const ranges = [];
  for (let i = 0; i < pairs.length; i += 2) {
    ranges.push({ range: asArray(pairs[i]), test: compileCriteria(pairs[i + 1]) });
  }
  const length = ranges[0].range.length;
  if (ranges.some((r) => r.range.length !== length)) fail(ERRORS.VALUE);
  const indexes = [];
  for (let i = 0; i < length; i++) {
    if (ranges.every((r) => r.test(r.range[i]))) indexes.push(i);
  }
  return indexes;
}
var numericAt = (range, indexes) => indexes.map((i) => range[i]).filter((v) => {
  if (isError(v)) throw v;
  return typeof v === "number";
});
defineFunction("SUM", (args) => sum(numbers(args)));
defineFunction("PRODUCT", (args) => numbers(args).reduce((acc, n) => acc * n, 1));
defineFunction("AVERAGE", (args) => average(numbers(args)));
defineFunction("MIN", (args) => {
  const list = numbers(args);
  return list.length ? Math.min(...list) : 0;
});
defineFunction("MAX", (args) => {
  const list = numbers(args);
  return list.length ? Math.max(...list) : 0;
});
defineFunction("COUNT", (args) => args.reduce((count, arg) => {
  if (Array.isArray(arg)) return count + arg.filter((v) => typeof v === "number").length;
  return count + (typeof arg === "number" || typeof arg === "boolean" || asNumber(arg) !== null ? 1 : 0);
}, 0));
defineFunction("COUNTA", (args) => flat(args).filter((v) => v !== null && v !== void 0 && v !== "").length, { errors: true });
defineFunction("COUNTBLANK", (args) => flat(args).filter((v) => v === null || v === void 0 || v === "").length);
defineFunction("ABS", ([n]) => Math.abs(toNumber(n)));
defineFunction("SIGN", ([n]) => Math.sign(toNumber(n)));
defineFunction("INT", ([n]) => Math.floor(toNumber(n)));
defineFunction("TRUNC", ([n, digits]) => {
  const factor = Math.pow(10, integer(optional(digits, 0)));
  return Math.trunc(toNumber(n) * factor) / factor;
});
defineFunction("ROUND", ([n, digits]) => roundHalfAway(toNumber(n), integer(optional(digits, 0))));
defineFunction("ROUNDUP", ([n, digits]) => {
  const factor = Math.pow(10, integer(optional(digits, 0)));
  const x = toNumber(n);
  return Math.sign(x) * Math.ceil(Number((Math.abs(x) * factor).toPrecision(15))) / factor;
});
defineFunction("ROUNDDOWN", ([n, digits]) => {
  const factor = Math.pow(10, integer(optional(digits, 0)));
  const x = toNumber(n);
  return Math.sign(x) * Math.floor(Number((Math.abs(x) * factor).toPrecision(15))) / factor;
});
defineFunction("MROUND", ([n, multiple]) => {
  const x = toNumber(n);
  const m = toNumber(multiple);
  if (m === 0) return 0;
  if (Math.sign(x) * Math.sign(m) < 0) fail(ERRORS.NUM);
  return roundHalfAway(x / m, 0) * m;
});
var ceiling = ([n, significance]) => {
  const s = Math.abs(toNumber(optional(significance, 1)));
  return s === 0 ? 0 : Math.ceil(Number((toNumber(n) / s).toPrecision(15))) * s;
};
var floor = ([n, significance]) => {
  const s = Math.abs(toNumber(optional(significance, 1)));
  return s === 0 ? 0 : Math.floor(Number((toNumber(n) / s).toPrecision(15))) * s;
};
defineFunction("CEILING", ceiling);
defineFunction("CEILING.MATH", ceiling);
defineFunction("FLOOR", floor);
defineFunction("FLOOR.MATH", floor);
defineFunction("MOD", ([a, b]) => {
  const x = toNumber(a);
  const y = toNumber(b);
  if (y === 0) fail(ERRORS.DIV0);
  return x - y * Math.floor(x / y);
});
defineFunction("POWER", ([a, b]) => {
  const result = Math.pow(toNumber(a), toNumber(b));
  if (!Number.isFinite(result)) fail(ERRORS.NUM);
  return result;
});
defineFunction("SQRT", ([n]) => {
  const x = toNumber(n);
  if (x < 0) fail(ERRORS.NUM);
  return Math.sqrt(x);
});
defineFunction("EXP", ([n]) => Math.exp(toNumber(n)));
defineFunction("LN", ([n]) => {
  const x = toNumber(n);
  if (x <= 0) fail(ERRORS.NUM);
  return Math.log(x);
});
defineFunction("LOG", ([n, base]) => {
  const x = toNumber(n);
  const b = toNumber(optional(base, 10));
  if (x <= 0 || b <= 0 || b === 1) fail(ERRORS.NUM);
  return Math.log(x) / Math.log(b);
});
defineFunction("LOG10", ([n]) => {
  const x = toNumber(n);
  if (x <= 0) fail(ERRORS.NUM);
  return Math.log10(x);
});
defineFunction("PI", () => Math.PI);
defineFunction("RAND", () => Math.random());
defineFunction("RANDBETWEEN", ([a, b]) => {
  const low = Math.ceil(toNumber(a));
  const high = Math.floor(toNumber(b));
  if (low > high) fail(ERRORS.NUM);
  return low + Math.floor(Math.random() * (high - low + 1));
});
defineFunction("SUMPRODUCT", (args) => {
  const arrays = args.map(asArray);
  const length = arrays[0]?.length ?? 0;
  if (arrays.some((a) => a.length !== length)) fail(ERRORS.VALUE);
  let total = 0;
  for (let i = 0; i < length; i++) {
    let product = 1;
    for (const array of arrays) {
      const v = array[i];
      if (isError(v)) throw v;
      product *= typeof v === "number" ? v : 0;
    }
    total += product;
  }
  return total;
});
defineFunction("MEDIAN", (args) => {
  const list = numbers(args).sort((a, b) => a - b);
  if (!list.length) fail(ERRORS.NUM);
  const mid = Math.floor(list.length / 2);
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
});
var mode = (args) => {
  const counts = /* @__PURE__ */ new Map();
  let best = null;
  let bestCount = 1;
  for (const n of numbers(args)) {
    const c = (counts.get(n) ?? 0) + 1;
    counts.set(n, c);
    if (c > bestCount) {
      best = n;
      bestCount = c;
    }
  }
  if (best === null) fail(ERRORS.NA);
  return best;
};
defineFunction("MODE", mode);
defineFunction("MODE.SNGL", mode);
defineFunction("STDEV", (args) => Math.sqrt(variance(numbers(args), true)));
defineFunction("STDEV.S", (args) => Math.sqrt(variance(numbers(args), true)));
defineFunction("STDEVP", (args) => Math.sqrt(variance(numbers(args), false)));
defineFunction("STDEV.P", (args) => Math.sqrt(variance(numbers(args), false)));
defineFunction("VAR", (args) => variance(numbers(args), true));
defineFunction("VAR.S", (args) => variance(numbers(args), true));
defineFunction("VARP", (args) => variance(numbers(args), false));
defineFunction("VAR.P", (args) => variance(numbers(args), false));
defineFunction("LARGE", ([range, k]) => {
  const list = numbers([asArray(range)]).sort((a, b) => b - a);
  const i = integer(k);
  if (i < 1 || i > list.length) fail(ERRORS.NUM);
  return list[i - 1];
});
defineFunction("SMALL", ([range, k]) => {
  const list = numbers([asArray(range)]).sort((a, b) => a - b);
  const i = integer(k);
  if (i < 1 || i > list.length) fail(ERRORS.NUM);
  return list[i - 1];
});
var rank = ([n, range, order]) => {
  const x = toNumber(n);
  const list = numbers([asArray(range)]);
  if (!list.includes(x)) fail(ERRORS.NA);
  const ascending = toNumber(optional(order, 0)) !== 0;
  return 1 + list.filter((v) => ascending ? v < x : v > x).length;
};
defineFunction("RANK", rank);
defineFunction("RANK.EQ", rank);
var percentile = ([range, k]) => {
  const list = numbers([asArray(range)]).sort((a, b) => a - b);
  const p = toNumber(k);
  if (!list.length || p < 0 || p > 1) fail(ERRORS.NUM);
  const position = (list.length - 1) * p;
  const lower = Math.floor(position);
  const fraction = position - lower;
  const base = list[lower];
  return lower + 1 < list.length ? base + fraction * (list[lower + 1] - base) : base;
};
defineFunction("PERCENTILE", percentile);
defineFunction("PERCENTILE.INC", percentile);
var quartile = ([range, q]) => {
  const quart = integer(q);
  if (quart < 0 || quart > 4) fail(ERRORS.NUM);
  return percentile([range, quart / 4]);
};
defineFunction("QUARTILE", quartile);
defineFunction("QUARTILE.INC", quartile);
defineFunction("SUMIF", ([range, criteria, sumRange]) => {
  const indexes = matchingIndexes([range, criteria]);
  return sum(numericAt(asArray(optional(sumRange, range)), indexes));
});
defineFunction("SUMIFS", ([sumRange, ...pairs]) => sum(numericAt(asArray(sumRange), matchingIndexes(pairs))));
defineFunction("COUNTIF", ([range, criteria]) => matchingIndexes([range, criteria]).length);
defineFunction("COUNTIFS", (pairs) => matchingIndexes(pairs).length);
defineFunction("AVERAGEIF", ([range, criteria, avgRange]) => {
  const indexes = matchingIndexes([range, criteria]);
  return average(numericAt(asArray(optional(avgRange, range)), indexes));
});
defineFunction("AVERAGEIFS", ([avgRange, ...pairs]) => average(numericAt(asArray(avgRange), matchingIndexes(pairs))));
defineFunction("MAXIFS", ([maxRange, ...pairs]) => {
  const list = numericAt(asArray(maxRange), matchingIndexes(pairs));
  return list.length ? Math.max(...list) : 0;
});
defineFunction("MINIFS", ([minRange, ...pairs]) => {
  const list = numericAt(asArray(minRange), matchingIndexes(pairs));
  return list.length ? Math.min(...list) : 0;
});
var SUBTOTALS = { 1: "AVERAGE", 2: "COUNT", 3: "COUNTA", 4: "MAX", 5: "MIN", 6: "PRODUCT", 7: "STDEV.S", 8: "STDEV.P", 9: "SUM", 10: "VAR.S", 11: "VAR.P" };
defineFunction("SUBTOTAL", ([fnNumber, ...ranges], ctx) => {
  const name = SUBTOTALS[integer(fnNumber) % 100];
  if (!name) fail(ERRORS.VALUE);
  return registry.get(name).fn(ranges, ctx);
});
defineLazyFunction("IF", ([condition, whenTrue, whenFalse], ctx, evaluate2) => {
  const test = toBoolean(evaluate2(condition));
  if (test) return whenTrue ? evaluate2(whenTrue) : true;
  return whenFalse ? evaluate2(whenFalse) : false;
});
defineLazyFunction("IFS", (args, ctx, evaluate2) => {
  for (let i = 0; i + 1 < args.length; i += 2) {
    if (toBoolean(evaluate2(args[i]))) return evaluate2(args[i + 1]);
  }
  return fail(ERRORS.NA);
});
defineLazyFunction("IFERROR", ([value, fallback], ctx, evaluate2) => {
  const result = evaluate2(value);
  return isError(result) ? evaluate2(fallback) : result;
});
defineLazyFunction("IFNA", ([value, fallback], ctx, evaluate2) => {
  const result = evaluate2(value);
  return isError(result) && result.code === ERRORS.NA ? evaluate2(fallback) : result;
});
defineLazyFunction("SWITCH", ([expression, ...cases], ctx, evaluate2) => {
  const value = evaluate2(expression);
  if (isError(value)) return value;
  for (let i = 0; i + 1 < cases.length; i += 2) {
    if (compareValues(value, evaluate2(cases[i])) === 0) return evaluate2(cases[i + 1]);
  }
  return cases.length % 2 ? evaluate2(cases[cases.length - 1]) : fail(ERRORS.NA);
});
defineLazyFunction("CHOOSE", ([index, ...options], ctx, evaluate2) => {
  const i = integer(evaluate2(index));
  if (i < 1 || i > options.length) fail(ERRORS.VALUE);
  return evaluate2(options[i - 1]);
});
var booleans = (args) => {
  const out = [];
  for (const arg of args) {
    if (Array.isArray(arg)) {
      for (const item of arg) {
        if (isError(item)) throw item;
        if (typeof item === "boolean" || typeof item === "number") out.push(toBoolean(item));
      }
    } else if (arg !== null && arg !== void 0) {
      out.push(toBoolean(arg));
    }
  }
  if (!out.length) fail(ERRORS.VALUE);
  return out;
};
defineFunction("AND", (args) => booleans(args).every(Boolean));
defineFunction("OR", (args) => booleans(args).some(Boolean));
defineFunction("XOR", (args) => booleans(args).filter(Boolean).length % 2 === 1);
defineFunction("NOT", ([value]) => !toBoolean(value));
defineFunction("TRUE", () => true);
defineFunction("FALSE", () => false);
defineFunction("ISBLANK", ([v]) => v === null || v === void 0 || v === "", { errors: true });
defineFunction("ISNUMBER", ([v]) => typeof v === "number", { errors: true });
defineFunction("ISTEXT", ([v]) => typeof v === "string", { errors: true });
defineFunction("ISNONTEXT", ([v]) => typeof v !== "string", { errors: true });
defineFunction("ISLOGICAL", ([v]) => typeof v === "boolean", { errors: true });
defineFunction("ISERROR", ([v]) => isError(v), { errors: true });
defineFunction("ISERR", ([v]) => isError(v) && v.code !== ERRORS.NA, { errors: true });
defineFunction("ISNA", ([v]) => isError(v) && v.code === ERRORS.NA, { errors: true });
defineFunction("ISEVEN", ([v]) => Math.trunc(toNumber(v)) % 2 === 0);
defineFunction("ISODD", ([v]) => Math.abs(Math.trunc(toNumber(v)) % 2) === 1);
defineFunction("NA", () => fail(ERRORS.NA));
defineFunction("N", ([v]) => typeof v === "number" ? v : v === true ? 1 : 0);
defineFunction("CONCAT", (args, ctx) => flat(args).map((v) => toText(v, ctx)).join(""));
defineFunction("CONCATENATE", (args, ctx) => args.map((v) => toText(v, ctx)).join(""));
defineFunction("TEXTJOIN", ([delimiter, ignoreEmpty, ...values], ctx) => {
  const skip = toBoolean(ignoreEmpty);
  return flat(values).map((v) => toText(v, ctx)).filter((t) => !skip || t !== "").join(toText(delimiter, ctx));
});
defineFunction("LEFT", ([text, count], ctx) => {
  const n = integer(optional(count, 1));
  if (n < 0) fail(ERRORS.VALUE);
  return toText(text, ctx).slice(0, n);
});
defineFunction("RIGHT", ([text, count], ctx) => {
  const n = integer(optional(count, 1));
  if (n < 0) fail(ERRORS.VALUE);
  const value = toText(text, ctx);
  return n === 0 ? "" : value.slice(-n);
});
defineFunction("MID", ([text, start, count], ctx) => {
  const s = integer(start);
  const n = integer(count);
  if (s < 1 || n < 0) fail(ERRORS.VALUE);
  return toText(text, ctx).slice(s - 1, s - 1 + n);
});
defineFunction("LEN", ([text], ctx) => toText(text, ctx).length);
defineFunction("UPPER", ([text], ctx) => toText(text, ctx).toUpperCase());
defineFunction("LOWER", ([text], ctx) => toText(text, ctx).toLowerCase());
defineFunction("PROPER", ([text], ctx) => toText(text, ctx).toLowerCase().replace(/(^|[^\p{L}])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()));
defineFunction("TRIM", ([text], ctx) => toText(text, ctx).trim().replace(/ {2,}/g, " "));
defineFunction("SUBSTITUTE", ([text, search, replacement, instance], ctx) => {
  const value = toText(text, ctx);
  const find = toText(search, ctx);
  const replace = toText(replacement, ctx);
  if (!find) return value;
  if (instance === void 0 || instance === null) return value.split(find).join(replace);
  const target = integer(instance);
  let index = -1;
  for (let i = 0; i < target; i++) {
    index = value.indexOf(find, index + 1);
    if (index === -1) return value;
  }
  return value.slice(0, index) + replace + value.slice(index + find.length);
});
defineFunction("REPLACE", ([text, start, count, replacement], ctx) => {
  const value = toText(text, ctx);
  const s = integer(start) - 1;
  return value.slice(0, s) + toText(replacement, ctx) + value.slice(s + integer(count));
});
defineFunction("FIND", ([search, text, start], ctx) => {
  const index = toText(text, ctx).indexOf(toText(search, ctx), integer(optional(start, 1)) - 1);
  if (index === -1) fail(ERRORS.VALUE);
  return index + 1;
});
defineFunction("SEARCH", ([search, text, start], ctx) => {
  const haystack = toText(text, ctx);
  const from = integer(optional(start, 1)) - 1;
  const regex = new RegExp(wildcardRegex(toText(search, ctx)).source.slice(1, -1), "is");
  const match = regex.exec(haystack.slice(from));
  if (!match) return fail(ERRORS.VALUE);
  return match.index + from + 1;
});
defineFunction("REPT", ([text, times], ctx) => {
  const n = integer(times);
  if (n < 0) fail(ERRORS.VALUE);
  return toText(text, ctx).repeat(n);
});
defineFunction("EXACT", ([a, b], ctx) => toText(a, ctx) === toText(b, ctx));
defineFunction("CHAR", ([n]) => String.fromCharCode(integer(n)));
defineFunction("CODE", ([text], ctx) => {
  const value = toText(text, ctx);
  if (!value) fail(ERRORS.VALUE);
  return value.charCodeAt(0);
});
defineFunction("TEXTBEFORE", ([text, delimiter], ctx) => {
  const value = toText(text, ctx);
  const index = value.indexOf(toText(delimiter, ctx));
  if (index === -1) fail(ERRORS.NA);
  return value.slice(0, index);
});
defineFunction("TEXTAFTER", ([text, delimiter], ctx) => {
  const value = toText(text, ctx);
  const d = toText(delimiter, ctx);
  const index = value.indexOf(d);
  if (index === -1) fail(ERRORS.NA);
  return value.slice(index + d.length);
});
defineFunction("TEXT", ([value, format], ctx) => {
  if (isError(value)) throw value;
  return formatValue(value, toText(format, ctx), ctx?.locale);
});
defineFunction("VALUE", ([text], ctx) => {
  if (typeof text === "number") return text;
  const direct = asNumber(text);
  if (direct !== null) return direct;
  return parseLocaleNumber(toText(text, ctx), ctx?.locale);
});
defineFunction("NUMBERVALUE", ([text, decimal, group], ctx) => {
  const value = toText(text, ctx);
  const dec = decimal === void 0 || decimal === null ? localeSeparators(ctx?.locale ?? "en-US").decimal : toText(decimal, ctx);
  const grp = group === void 0 || group === null ? localeSeparators(ctx?.locale ?? "en-US").group : toText(group, ctx);
  const normalized = value.split(grp).join("").replace(dec, ".").replace(/\s/g, "");
  const n = asNumber(normalized);
  if (n === null) fail(ERRORS.VALUE);
  return n;
});
function parseLocaleNumber(text, locale = "en-US") {
  const { group, decimal } = localeSeparators(locale);
  let value = String(text).trim().replace(/\s/g, "");
  const percent = value.endsWith("%");
  if (percent) value = value.slice(0, -1);
  value = value.split(group).join("").replace(decimal, ".");
  const n = asNumber(value);
  if (n === null) return fail(ERRORS.VALUE);
  return percent ? n / 100 : n;
}
var serial = (value) => {
  if (value === null || value === void 0) return 0;
  const s = typeof value === "string" ? toSerial(value) : null;
  return s ?? toNumber(value);
};
defineFunction("TODAY", () => todaySerial());
defineFunction("NOW", () => nowSerial());
defineFunction("DATE", ([y, m, d]) => partsToSerial(integer(y), integer(m), integer(d)));
defineFunction("TIME", ([h2, m, s]) => (integer(h2) * 3600 + integer(m) * 60 + integer(s)) % 86400 / 86400);
defineFunction("DATEVALUE", ([text], ctx) => {
  const value = toText(text, ctx).trim();
  const iso = toSerial(value);
  if (iso !== null) return Math.floor(iso);
  const match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(value);
  if (!match) fail(ERRORS.VALUE);
  const [a = 0, b = 0] = match.slice(1).map(Number);
  let y = Number(match[3]);
  if (y < 100) y += y < 30 ? 2e3 : 1900;
  const monthFirst = (ctx?.locale ?? "en-US") === "en-US";
  return partsToSerial(y, monthFirst ? a : b, monthFirst ? b : a);
});
defineFunction("YEAR", ([v]) => serialToParts(serial(v)).year);
defineFunction("MONTH", ([v]) => serialToParts(serial(v)).month);
defineFunction("DAY", ([v]) => serialToParts(serial(v)).day);
defineFunction("HOUR", ([v]) => serialToParts(serial(v)).hours);
defineFunction("MINUTE", ([v]) => serialToParts(serial(v)).minutes);
defineFunction("SECOND", ([v]) => serialToParts(serial(v)).seconds);
defineFunction("WEEKDAY", ([v, type]) => {
  const day = serialToParts(serial(v)).weekday;
  switch (integer(optional(type, 1))) {
    case 1:
      return day + 1;
    case 2:
      return day === 0 ? 7 : day;
    case 3:
      return day === 0 ? 6 : day - 1;
    default:
      return fail(ERRORS.NUM);
  }
});
var addMonths = (start, months) => {
  const p = serialToParts(serial(start));
  return { year: p.year, month: p.month + integer(months), day: p.day };
};
defineFunction("EDATE", ([start, months]) => {
  const { year, month, day } = addMonths(start, months);
  const lastDay = serialToParts(partsToSerial(year, month + 1, 0)).day;
  return partsToSerial(year, month, Math.min(day, lastDay));
});
defineFunction("EOMONTH", ([start, months]) => {
  const { year, month } = addMonths(start, months);
  return partsToSerial(year, month + 1, 0);
});
defineFunction("DAYS", ([end, start]) => Math.floor(serial(end)) - Math.floor(serial(start)));
defineFunction("DATEDIF", ([start, end, unit], ctx) => {
  const a = Math.floor(serial(start));
  const b = Math.floor(serial(end));
  if (a > b) fail(ERRORS.NUM);
  const p = serialToParts(a);
  const q = serialToParts(b);
  let months = (q.year - p.year) * 12 + (q.month - p.month);
  if (q.day < p.day) months--;
  switch (toText(unit, ctx).toUpperCase()) {
    case "D":
      return b - a;
    case "M":
      return months;
    case "Y":
      return Math.floor(months / 12);
    case "YM":
      return months % 12;
    case "MD": {
      const days = q.day - p.day;
      return days >= 0 ? days : b - partsToSerial(q.year, q.month - 1, p.day);
    }
    case "YD": {
      let anniversary = partsToSerial(q.year, p.month, p.day);
      if (anniversary > b) anniversary = partsToSerial(q.year - 1, p.month, p.day);
      return b - anniversary;
    }
    default:
      return fail(ERRORS.NUM);
  }
});
var holidaySet = (holidays) => new Set(holidays === void 0 || holidays === null ? [] : asArray(holidays).map((h2) => Math.floor(serial(h2))));
var isWorkday = (day, holidays) => {
  const weekday = serialToParts(day).weekday;
  return weekday !== 0 && weekday !== 6 && !holidays.has(day);
};
defineFunction("NETWORKDAYS", ([start, end, holidays]) => {
  let a = Math.floor(serial(start));
  let b = Math.floor(serial(end));
  const sign = a <= b ? 1 : -1;
  if (sign < 0) [a, b] = [b, a];
  const skip = holidaySet(holidays);
  let count = 0;
  for (let day = a; day <= b; day++) if (isWorkday(day, skip)) count++;
  return sign * count;
});
defineFunction("WORKDAY", ([start, days, holidays]) => {
  let day = Math.floor(serial(start));
  let remaining = integer(days);
  const step = remaining < 0 ? -1 : 1;
  const skip = holidaySet(holidays);
  while (remaining !== 0) {
    day += step;
    if (isWorkday(day, skip)) remaining -= step;
  }
  return day;
});
defineFunction("PMT", ([rate, nper, pv, fv, type]) => {
  const r = toNumber(rate);
  const n = toNumber(nper);
  const p = toNumber(pv);
  const f = toNumber(optional(fv, 0));
  const t = toNumber(optional(type, 0)) ? 1 : 0;
  if (r === 0) return -(p + f) / n;
  const factor = Math.pow(1 + r, n);
  return -(r * (p * factor + f)) / ((1 + r * t) * (factor - 1));
});
defineFunction("FV", ([rate, nper, pmt, pv, type]) => {
  const r = toNumber(rate);
  const n = toNumber(nper);
  const payment = toNumber(pmt);
  const p = toNumber(optional(pv, 0));
  const t = toNumber(optional(type, 0)) ? 1 : 0;
  if (r === 0) return -(p + payment * n);
  const factor = Math.pow(1 + r, n);
  return -(p * factor + payment * (1 + r * t) * (factor - 1) / r);
});
defineFunction("PV", ([rate, nper, pmt, fv, type]) => {
  const r = toNumber(rate);
  const n = toNumber(nper);
  const payment = toNumber(pmt);
  const f = toNumber(optional(fv, 0));
  const t = toNumber(optional(type, 0)) ? 1 : 0;
  if (r === 0) return -(f + payment * n);
  const factor = Math.pow(1 + r, n);
  return -(f + payment * (1 + r * t) * (factor - 1) / r) / factor;
});
defineFunction("NPV", ([rate, ...values]) => {
  const r = toNumber(rate);
  return numbers(values).reduce((acc, v, i) => acc + v / Math.pow(1 + r, i + 1), 0);
});
defineFunction("IRR", ([values, guess]) => {
  const flows = numbers([asArray(values)]);
  let rate = toNumber(optional(guess, 0.1));
  for (let i = 0; i < 100; i++) {
    let npv = 0;
    let derivative = 0;
    flows.forEach((v, t) => {
      npv += v / Math.pow(1 + rate, t);
      derivative -= t * v / Math.pow(1 + rate, t + 1);
    });
    if (derivative === 0) break;
    const next = rate - npv / derivative;
    if (Math.abs(next - rate) < 1e-10) return next;
    rate = next;
  }
  return fail(ERRORS.NUM);
});
function sameValue2(a, b) {
  if (isError(a) || isError(b) || a === null || b === null) return a === b;
  if (typeof a === "boolean" || typeof b === "boolean") return a === b;
  const x = asNumber(a);
  const y = asNumber(b);
  if (x !== null && y !== null) return x === y;
  return typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
}
function exactIndex(value, array, { fromEnd = false, wildcards = false } = {}) {
  const test = wildcards && typeof value === "string" ? compileCriteria(value) : (item) => sameValue2(item, value);
  if (fromEnd) {
    for (let i = array.length - 1; i >= 0; i--) if (test(array[i])) return i;
    return -1;
  }
  return array.findIndex((item) => test(item));
}
function approximateIndex(value, array, direction) {
  let best = -1;
  array.forEach((item, i) => {
    if (isError(item) || item === null) return;
    const c = compareValues(item, value);
    if (c === 0) {
      if (best === -1 || compareValues(array[best], value) !== 0) best = i;
      return;
    }
    if (Math.sign(c) !== direction) return;
    if (best === -1) {
      best = i;
      return;
    }
    const bestDiff = compareValues(array[best], value);
    if (bestDiff !== 0 && compareValues(item, array[best]) === -direction) best = i;
  });
  return best;
}
defineFunction("XLOOKUP", ([lookup, lookupArray, returnArray, notFound, matchMode, searchMode]) => {
  if (isError(lookup)) throw lookup;
  const keys = asArray(lookupArray);
  const results = asArray(returnArray);
  if (keys.length !== results.length) fail(ERRORS.VALUE);
  const mode2 = integer(optional(matchMode, 0));
  const fromEnd = integer(optional(searchMode, 1)) < 0;
  let index;
  if (mode2 === 0 || mode2 === 2) index = exactIndex(lookup, keys, { fromEnd, wildcards: mode2 === 2 });
  else if (mode2 === -1 || mode2 === 1) index = approximateIndex(lookup, keys, mode2);
  else fail(ERRORS.VALUE);
  if (index === -1) {
    if (notFound !== void 0 && notFound !== null) return notFound;
    fail(ERRORS.NA);
  }
  return results[index] ?? null;
});
defineFunction("MATCH", ([lookup, lookupArray, matchType]) => {
  if (isError(lookup)) throw lookup;
  const keys = asArray(lookupArray);
  const type = integer(optional(matchType, 1));
  if (type === 0) {
    const index = exactIndex(lookup, keys, { wildcards: true });
    if (index === -1) fail(ERRORS.NA);
    return index + 1;
  }
  let found = -1;
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] === null || isError(keys[i])) continue;
    const c = compareValues(keys[i], lookup);
    if (type > 0 ? c <= 0 : c >= 0) found = i;
    else break;
  }
  if (found === -1) fail(ERRORS.NA);
  return found + 1;
});
defineFunction("INDEX", ([array, position]) => {
  const list = asArray(array);
  const i = integer(position);
  if (i < 1 || i > list.length) fail(ERRORS.REF);
  return list[i - 1];
});
defineFunction("ROWS", ([array]) => asArray(array).length);
defineFunction("FILTER", ([array, include, ifEmpty]) => {
  const list = asArray(array);
  const mask = asArray(include);
  if (mask.length !== list.length) fail(ERRORS.VALUE);
  const out = list.filter((v, i) => !isError(mask[i]) && toBoolean(mask[i]));
  if (!out.length) {
    if (ifEmpty !== void 0 && ifEmpty !== null) return ifEmpty;
    fail(ERRORS.NA);
  }
  return out;
});
defineFunction("UNIQUE", ([array]) => {
  const out = [];
  for (const v of asArray(array)) {
    if (!out.some((o) => sameValue2(o, v))) out.push(v);
  }
  return out;
});
defineFunction("SORT", ([array, , order]) => {
  const descending = integer(optional(order, 1)) < 0;
  return [...asArray(array)].sort((a, b) => descending ? compareValues(b, a) : compareValues(a, b));
});

// src/formula/parser.ts
var FormulaSyntaxError = class extends Error {
  position;
  constructor(message, position) {
    super(`${message} (at ${position})`);
    this.position = position;
  }
};
var ERROR_LITERALS = Object.values(ERRORS).sort((a, b) => b.length - a.length);
var OPERATORS = ["<>", "<=", ">=", "+", "-", "*", "/", "^", "&", "=", "<", ">", "%"];
function tokenize(source) {
  const tokens = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const start = i;
    if (/[0-9]/.test(ch) || ch === "." && /[0-9]/.test(source[i + 1] ?? "")) {
      const match = /^(\d*\.?\d+|\d+\.)(e[+-]?\d+)?/i.exec(source.slice(i));
      tokens.push({ type: "number", value: Number(match[0]), pos: start });
      i += match[0].length;
      continue;
    }
    if (ch === '"') {
      let value = "";
      i++;
      while (true) {
        if (i >= source.length) throw new FormulaSyntaxError("Unterminated string", start);
        if (source[i] === '"') {
          if (source[i + 1] === '"') {
            value += '"';
            i += 2;
            continue;
          }
          i++;
          break;
        }
        value += source[i++];
      }
      tokens.push({ type: "string", value, pos: start });
      continue;
    }
    if (ch === "[") {
      const { value, end } = readReference(source, i);
      tokens.push({ type: "reference", value, pos: start });
      i = end;
      continue;
    }
    if (ch === "#") {
      const literal = ERROR_LITERALS.find((code) => source.slice(i, i + code.length).toUpperCase() === code);
      if (!literal) throw new FormulaSyntaxError("Unknown error literal", start);
      tokens.push({ type: "error", value: literal, pos: start });
      i += literal.length;
      continue;
    }
    if (/[A-Za-z_À-ɏ]/.test(ch)) {
      const word = /^[A-Za-z_À-ɏ][A-Za-z0-9_.À-ɏ]*/.exec(source.slice(i))[0];
      const upper = word.toUpperCase();
      i += word.length;
      if ((upper === "TRUE" || upper === "FALSE") && source[i] !== "(") {
        tokens.push({ type: "boolean", value: upper === "TRUE", pos: start });
      } else {
        tokens.push({ type: "identifier", value: word, pos: start });
      }
      continue;
    }
    const op = OPERATORS.find((candidate) => source.startsWith(candidate, i));
    if (op) {
      tokens.push({ type: "operator", value: op, pos: start });
      i += op.length;
      continue;
    }
    if (ch === "(" || ch === ")" || ch === "{" || ch === "}") {
      tokens.push({ type: ch, value: ch, pos: start });
      i++;
      continue;
    }
    if (ch === "," || ch === ";") {
      tokens.push({ type: "separator", value: ch, pos: start });
      i++;
      continue;
    }
    throw new FormulaSyntaxError(`Unexpected character "${ch}"`, start);
  }
  tokens.push({ type: "eof", value: null, pos: source.length });
  return tokens;
}
function readReference(source, start) {
  let i = start + 1;
  let scope = "column";
  if (source[i] === "@") {
    scope = "row";
    i++;
  }
  let field;
  if (source[i] === "[") {
    const close = source.indexOf("]]", i);
    if (close === -1) throw new FormulaSyntaxError("Unterminated reference", start);
    field = source.slice(i + 1, close);
    i = close + 2;
  } else {
    const close = source.indexOf("]", i);
    if (close === -1) throw new FormulaSyntaxError("Unterminated reference", start);
    field = source.slice(i, close);
    i = close + 1;
  }
  field = field.trim();
  if (!field) throw new FormulaSyntaxError("Empty reference", start);
  return { value: { field, scope }, end: i };
}
var INFIX = {
  "=": 1,
  "<>": 1,
  "<": 1,
  ">": 1,
  "<=": 1,
  ">=": 1,
  "&": 2,
  "+": 3,
  "-": 3,
  "*": 4,
  "/": 4,
  "^": 5
};
var POSTFIX_PERCENT = 6;
var PREFIX = 7;
function parse(source) {
  const text = String(source).replace(/^\s*=/, "");
  const tokens = tokenize(text);
  let index = 0;
  const peek = () => tokens[index];
  const next = () => tokens[index++];
  const expect = (type) => {
    const token = next();
    if (token.type !== type) throw new FormulaSyntaxError(`Expected "${type}"`, token.pos);
    return token;
  };
  function parseExpression(minBp) {
    let left = parsePrefix();
    while (true) {
      const token = peek();
      if (token.type !== "operator") break;
      if (token.value === "%") {
        if (POSTFIX_PERCENT < minBp) break;
        next();
        left = { type: "postfix", op: "%", arg: left };
        continue;
      }
      const bp = INFIX[token.value];
      if (bp === void 0 || bp <= minBp) break;
      next();
      const right = parseExpression(bp);
      left = { type: "binary", op: token.value, left, right };
    }
    return left;
  }
  function parsePrefix() {
    const token = next();
    switch (token.type) {
      case "number":
        return { type: "number", value: token.value };
      case "string":
        return { type: "string", value: token.value };
      case "boolean":
        return { type: "boolean", value: token.value };
      case "error":
        return { type: "error", code: token.value };
      case "reference":
        return { type: "ref", field: token.value.field, scope: token.value.scope };
      case "identifier":
        if (peek().type === "(") return parseCall(token.value);
        return { type: "name", name: token.value };
      case "(": {
        const expr = parseExpression(0);
        expect(")");
        return expr;
      }
      case "{":
        return parseArray();
      case "operator":
        if (token.value === "-" || token.value === "+") {
          return { type: "unary", op: token.value, arg: parseExpression(PREFIX) };
        }
        break;
    }
    throw new FormulaSyntaxError(token.type === "eof" ? "Unexpected end of formula" : `Unexpected "${String(token.value)}"`, token.pos);
  }
  function parseCall(name) {
    expect("(");
    const args = [];
    if (peek().type === ")") {
      next();
      return { type: "call", name: name.toUpperCase(), args };
    }
    while (true) {
      const token = peek();
      if (token.type === "separator" || token.type === ")") {
        args.push({ type: "empty" });
      } else {
        args.push(parseExpression(0));
      }
      const after = next();
      if (after.type === ")") break;
      if (after.type !== "separator") throw new FormulaSyntaxError('Expected "," or ")"', after.pos);
    }
    return { type: "call", name: name.toUpperCase(), args };
  }
  function parseArray() {
    const items = [];
    if (peek().type === "}") {
      next();
      return { type: "array", items };
    }
    while (true) {
      items.push(parseExpression(0));
      const after = next();
      if (after.type === "}") break;
      if (after.type !== "separator") throw new FormulaSyntaxError('Expected "," or "}"', after.pos);
    }
    return { type: "array", items };
  }
  const ast = parseExpression(0);
  const last = peek();
  if (last.type !== "eof") throw new FormulaSyntaxError(`Unexpected "${String(last.value)}"`, last.pos);
  return ast;
}
function collectDependencies(ast) {
  const deps = { row: /* @__PURE__ */ new Set(), column: /* @__PURE__ */ new Set(), names: /* @__PURE__ */ new Set(), functions: /* @__PURE__ */ new Set() };
  (function walk(node) {
    switch (node.type) {
      case "ref":
        deps[node.scope].add(node.field);
        break;
      case "name":
        deps.names.add(node.name);
        break;
      case "call":
        deps.functions.add(node.name);
        node.args.forEach(walk);
        break;
      case "unary":
      case "postfix":
        walk(node.arg);
        break;
      case "binary":
        walk(node.left);
        walk(node.right);
        break;
      case "array":
        node.items.forEach(walk);
        break;
    }
  })(ast);
  return deps;
}
function toExcelFormula(ast, resolveRef, resolveName = () => null) {
  let failed = false;
  const print = (node, parentBp = 0) => {
    switch (node.type) {
      case "number":
        return String(node.value);
      case "string":
        return `"${node.value.replace(/"/g, '""')}"`;
      case "boolean":
        return node.value ? "TRUE" : "FALSE";
      case "error":
        return node.code;
      case "empty":
        return "";
      case "ref": {
        const a1 = resolveRef(node.field, node.scope);
        if (a1 === null || a1 === void 0) failed = true;
        return a1 ?? "";
      }
      case "name": {
        const value = resolveName(node.name);
        if (value === null || value === void 0) failed = true;
        return value ?? "";
      }
      case "call":
        return `${node.name}(${node.args.map((arg) => print(arg)).join(",")})`;
      case "unary":
        return `${node.op}${print(node.arg, PREFIX)}`;
      case "postfix":
        return `${print(node.arg, POSTFIX_PERCENT)}%`;
      case "array":
        return `{${node.items.map((item) => print(item)).join(",")}}`;
      case "binary": {
        const bp = INFIX[node.op];
        const text = `${print(node.left, bp - 1)}${node.op}${print(node.right, bp)}`;
        return bp <= parentBp ? `(${text})` : text;
      }
    }
  };
  const result = print(ast);
  return failed ? null : result;
}

// src/formula/evaluator.ts
var ARITHMETIC = {
  "+": (a, b) => a + b,
  "-": (a, b) => a - b,
  "*": (a, b) => a * b,
  "/": (a, b) => {
    if (b === 0) throw err(ERRORS.DIV0);
    return a / b;
  },
  "^": (a, b) => {
    const result = Math.pow(a, b);
    if (!Number.isFinite(result)) throw err(ERRORS.NUM);
    return result;
  }
};
var COMPARISON = {
  "=": (c) => c === 0,
  "<>": (c) => c !== 0,
  "<": (c) => c < 0,
  "<=": (c) => c <= 0,
  ">": (c) => c > 0,
  ">=": (c) => c >= 0
};
function evaluate(node, ctx) {
  try {
    return evaluateNode(node, ctx);
  } catch (e) {
    if (isError(e)) return e;
    throw e;
  }
}
function evaluateNode(node, ctx) {
  switch (node.type) {
    case "number":
    case "string":
    case "boolean":
      return node.value;
    case "error":
      return err(node.code);
    case "empty":
      return null;
    case "ref":
      return node.scope === "row" ? ctx.rowValue(node.field) : ctx.columnValues(node.field);
    case "name": {
      const value = ctx.name ? ctx.name(node.name) : void 0;
      return value === void 0 ? err(ERRORS.NAME, `Unknown name ${node.name}`) : value;
    }
    case "array":
      return node.items.map((item) => {
        const value = evaluate(item, ctx);
        return Array.isArray(value) ? value[0] ?? null : value;
      });
    case "unary": {
      const value = evaluate(node.arg, ctx);
      return lift1(value, (x) => node.op === "-" ? -toNumber(x) : toNumber(x));
    }
    case "postfix":
      return lift1(evaluate(node.arg, ctx), (x) => toNumber(x) / 100);
    case "binary":
      return evaluateBinary(node, ctx);
    case "call":
      return evaluateCall(node, ctx);
  }
}
function evaluateBinary(node, ctx) {
  const left = evaluate(node.left, ctx);
  const right = evaluate(node.right, ctx);
  const arithmetic = ARITHMETIC[node.op];
  if (arithmetic) return lift2(left, right, (a, b) => arithmetic(toNumber(a), toNumber(b)));
  if (node.op === "&") return lift2(left, right, (a, b) => toText(a, ctx) + toText(b, ctx));
  const test = COMPARISON[node.op];
  return lift2(left, right, (a, b) => test(compareValues(a, b)));
}
function evaluateCall(node, ctx) {
  const definition = ctx.functions?.get(node.name) ?? getFunction(node.name);
  if (!definition) return err(ERRORS.NAME, `Unknown function ${node.name}`);
  try {
    if (definition.lazy) {
      const result2 = definition.fn(node.args, ctx, (arg) => arg ? evaluate(arg, ctx) : null);
      return result2 === void 0 ? null : result2;
    }
    const args = node.args.map((arg) => evaluate(arg, ctx));
    if (!definition.errors) {
      const failed = args.find(isError);
      if (failed) return failed;
    }
    const result = definition.fn(args, ctx);
    return result === void 0 ? null : result;
  } catch (e) {
    if (isError(e)) return e;
    throw e;
  }
}
function toCellResult(value) {
  if (Array.isArray(value)) {
    return value.length === 1 ? toCellResult(value[0]) : err(ERRORS.VALUE, "A cell cannot hold an array");
  }
  if (typeof value === "number" && !Number.isFinite(value)) return err(ERRORS.NUM);
  return value;
}
var cache = /* @__PURE__ */ new Map();
var CACHE_LIMIT = 2e3;
function compile(formula) {
  const key = String(formula);
  const cached = cache.get(key);
  if (cached) return cached;
  let compiled;
  try {
    compiled = { ast: parse(key), error: null };
  } catch (e) {
    if (!(e instanceof FormulaSyntaxError)) throw e;
    compiled = { ast: { type: "error", code: ERRORS.SYNTAX }, error: e };
  }
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
  cache.set(key, compiled);
  return compiled;
}
var isFormula = (value) => typeof value === "string" && value.trim().startsWith("=") && value.trim().length > 1;

// src/formula/engine.ts
var toStored = (value) => isError(value) ? value.code : value === null ? "" : value;
var CalcEngine = class {
  store;
  locale;
  names;
  functions;
  fields = /* @__PURE__ */ new Set();
  columnFormulas = /* @__PURE__ */ new Map();
  cellFormulas = /* @__PURE__ */ new Map();
  nodes = /* @__PURE__ */ new Map();
  order = [];
  circular = /* @__PURE__ */ new Set();
  columnCache = /* @__PURE__ */ new Map();
  constructor({ store, locale = "en-US", names = {}, functions = /* @__PURE__ */ new Map() }) {
    this.store = store;
    this.locale = locale;
    this.names = names;
    this.functions = functions;
  }
  setColumns(columns) {
    this.fields = new Set(columns.map((c) => c.field));
    this.columnFormulas.clear();
    for (const column of columns) {
      if (typeof column.formula === "string" && column.formula.trim()) {
        this.columnFormulas.set(column.field, column.formula);
      }
    }
    this.buildGraph();
  }
  context(row, columnValues) {
    return {
      locale: this.locale,
      decimalSeparator: localeSeparators(this.locale).decimal,
      functions: this.functions,
      rowValue: (field) => {
        if (!this.fields.has(field) && !(row && field in row)) return err(ERRORS.REF, `Unknown column ${field}`);
        if (this.circular.has(field)) return err(ERRORS.CIRC);
        return fromCell(row?.[field]);
      },
      columnValues: (field) => {
        if (!this.fields.has(field)) return err(ERRORS.REF, `Unknown column ${field}`);
        if (this.circular.has(field)) return err(ERRORS.CIRC);
        return columnValues(field);
      },
      name: (name) => {
        const key = Object.keys(this.names).find((k) => k.toUpperCase() === name.toUpperCase());
        return key === void 0 ? void 0 : fromCell(this.names[key]);
      }
    };
  }
  allValues = (field) => {
    let values = this.columnCache.get(field);
    if (!values) {
      values = this.store.values(field).map(fromCell);
      this.columnCache.set(field, values);
    }
    return values;
  };
  /**
   * Formula fields and their dependencies, topologically ordered; cycles become #CIRC!.
   */
  buildGraph() {
    const nodes = /* @__PURE__ */ new Map();
    const addDeps = (field, formula) => {
      const deps = collectDependencies(compile(formula).ast);
      const node = nodes.get(field) ?? { row: /* @__PURE__ */ new Set(), column: /* @__PURE__ */ new Set() };
      deps.row.forEach((f) => node.row.add(f));
      deps.column.forEach((f) => node.column.add(f));
      nodes.set(field, node);
    };
    for (const [field, formula] of this.columnFormulas) addDeps(field, formula);
    for (const formulas of this.cellFormulas.values()) {
      for (const [field, formula] of Object.entries(formulas)) if (formula) addDeps(field, formula);
    }
    const pending = new Map([...nodes].map(([field, node]) => [
      field,
      new Set([...node.row, ...node.column].filter((dep) => nodes.has(dep) && dep !== field))
    ]));
    const selfReferencing = [...nodes].filter(([field, node]) => node.row.has(field) || node.column.has(field)).map(([field]) => field);
    const order = [];
    let progress = true;
    while (progress) {
      progress = false;
      for (const [field, deps] of pending) {
        if ([...deps].every((dep) => !pending.has(dep))) {
          order.push(field);
          pending.delete(field);
          progress = true;
        }
      }
    }
    this.nodes = nodes;
    this.circular = /* @__PURE__ */ new Set([...pending.keys(), ...selfReferencing]);
    this.order = order.filter((field) => !this.circular.has(field));
  }
  formulaFor(id, field) {
    const own = this.cellFormulas.get(id)?.[field];
    if (own !== void 0) return own || null;
    return this.columnFormulas.get(field) ?? null;
  }
  /**
   * A value typed into a calculated column: the column formula skips that cell from now on
   * (Excel's "calculated column exception"). Setting a cell formula or null removes it.
   */
  setCellOverride(id, field) {
    this.setCellFormula(id, field, "");
  }
  isFormulaField(field) {
    return this.nodes.has(field);
  }
  /** true when some formula reads a whole column, so appending rows changes existing results */
  hasColumnReferences() {
    return this.order.some((field) => (this.nodes.get(field)?.column.size ?? 0) > 0);
  }
  setCellFormula(id, field, formula) {
    const formulas = { ...this.cellFormulas.get(id) ?? {} };
    if (formula !== null) formulas[field] = formula;
    else delete formulas[field];
    if (Object.keys(formulas).length) this.cellFormulas.set(id, formulas);
    else this.cellFormulas.delete(id);
    this.buildGraph();
  }
  forgetRows(ids) {
    let changed = false;
    for (const id of ids) changed = this.cellFormulas.delete(id) || changed;
    if (changed) this.buildGraph();
  }
  reset(columns) {
    this.cellFormulas.clear();
    this.setColumns(columns);
  }
  computeCell(id, field) {
    const formula = this.formulaFor(id, field);
    if (!formula) return;
    const row = this.store.get(id);
    if (!row) return;
    const value = toCellResult(evaluate(compile(formula).ast, this.context(row, this.allValues)));
    row[field] = toStored(value);
  }
  computeColumn(field, ids) {
    for (const id of ids) this.computeCell(id, field);
    this.columnCache.delete(field);
  }
  /**
   * Recomputes every formula of every row.
   */
  recalculateAll() {
    this.columnCache.clear();
    const ids = this.store.ids();
    for (const field of this.circular) {
      for (const id of ids) {
        const row = this.store.get(id);
        if (row && this.formulaFor(id, field)) row[field] = ERRORS.CIRC;
      }
    }
    for (const field of this.order) this.computeColumn(field, ids);
    this.columnCache.clear();
  }
  /**
   * Recomputes what depends on the changed fields.
   * @param ids rows that changed (inserted, edited or removed)
   * @param fields fields that changed
   * @return 'all' when every row may have changed, 'rows' otherwise
   */
  recalculate(ids, fields) {
    this.columnCache.clear();
    const dirty = new Map(fields.map((f) => [f, "rows"]));
    let scope = "rows";
    for (const field of this.order) {
      const node = this.nodes.get(field);
      let mode2 = dirty.get(field) ?? null;
      for (const dep of node.row) {
        if (dirty.has(dep) && mode2 !== "all") mode2 = dirty.get(dep);
      }
      for (const dep of node.column) {
        if (dirty.has(dep)) mode2 = "all";
      }
      if (!mode2) continue;
      dirty.set(field, mode2);
      if (mode2 === "all") scope = "all";
      this.computeColumn(field, mode2 === "all" ? this.store.ids() : ids.filter((id) => this.store.has(id)));
    }
    this.columnCache.clear();
    return scope;
  }
  /**
   * Evaluates an ad-hoc formula: footers, conditional formats, formula filters, grid.evaluate().
   * @param row data for [@field] references
   * @param rows rows used by [field] ranges (defaults to every row)
   */
  evaluate(formula, row = null, rows = null) {
    const cache2 = /* @__PURE__ */ new Map();
    const columnValues = rows ? (field) => {
      let values = cache2.get(field);
      if (!values) {
        values = rows.map((r) => fromCell(r[field]));
        cache2.set(field, values);
      }
      return values;
    } : this.allValues;
    const result = toCellResult(evaluate(compile(formula).ast, this.context(row, columnValues)));
    if (!rows) this.columnCache.clear();
    return result;
  }
};

// src/export/csv.ts
var DANGEROUS = /^[=+\-@\t\r]/;
function toCSV(rows, columns, options = {}) {
  const {
    delimiter = ",",
    header = true,
    formatted = false,
    // prefixes text starting with = + - @ so spreadsheets do not run it (CSV injection)
    sanitize = true,
    decimal = ".",
    lineBreak = "\r\n",
    format = (value) => value
  } = options;
  const escape = (text) => {
    const value = String(text);
    return value.includes(delimiter) || /["\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  };
  const cell = (value, column, row) => {
    if (formatted) value = format(value, column, row);
    if (isBlank(value)) return "";
    if (typeof value === "number") return escape(decimal === "." ? String(value) : String(value).replace(".", decimal));
    if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
    let text = String(value);
    if (sanitize && DANGEROUS.test(text) && !/^-?\d/.test(text)) text = `'${text}`;
    return escape(text);
  };
  const lines = [];
  if (header) lines.push(columns.map((c) => escape(c.title)).join(delimiter));
  for (const row of rows) lines.push(columns.map((c) => cell(row[c.field], c, row)).join(delimiter));
  return lines.join(lineBreak);
}

// src/export/zip.ts
var CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(bytes) {
  let crc = 4294967295;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 255] ^ crc >>> 8;
  return (crc ^ 4294967295) >>> 0;
}
function zip(files) {
  const encoder = new TextEncoder();
  const entries = files.map((file) => {
    const name = encoder.encode(file.name);
    const data = typeof file.data === "string" ? encoder.encode(file.data) : file.data;
    return { name, data, crc: crc32(data) };
  });
  const localSize = entries.reduce((acc, e) => acc + 30 + e.name.length + e.data.length, 0);
  const centralSize = entries.reduce((acc, e) => acc + 46 + e.name.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  const time = 0;
  const date = 0 << 9 | 1 << 5 | 1;
  let offset = 0;
  const offsets = [];
  for (const e of entries) {
    offsets.push(offset);
    view.setUint32(offset, 67324752, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 2048, true);
    view.setUint16(offset + 8, 0, true);
    view.setUint16(offset + 10, time, true);
    view.setUint16(offset + 12, date, true);
    view.setUint32(offset + 14, e.crc, true);
    view.setUint32(offset + 18, e.data.length, true);
    view.setUint32(offset + 22, e.data.length, true);
    view.setUint16(offset + 26, e.name.length, true);
    view.setUint16(offset + 28, 0, true);
    out.set(e.name, offset + 30);
    out.set(e.data, offset + 30 + e.name.length);
    offset += 30 + e.name.length + e.data.length;
  }
  const centralStart = offset;
  entries.forEach((e, i) => {
    view.setUint32(offset, 33639248, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 20, true);
    view.setUint16(offset + 8, 2048, true);
    view.setUint16(offset + 10, 0, true);
    view.setUint16(offset + 12, time, true);
    view.setUint16(offset + 14, date, true);
    view.setUint32(offset + 16, e.crc, true);
    view.setUint32(offset + 20, e.data.length, true);
    view.setUint32(offset + 24, e.data.length, true);
    view.setUint16(offset + 28, e.name.length, true);
    view.setUint32(offset + 42, offsets[i], true);
    out.set(e.name, offset + 46);
    offset += 46 + e.name.length;
  });
  view.setUint32(offset, 101010256, true);
  view.setUint16(offset + 8, entries.length, true);
  view.setUint16(offset + 10, entries.length, true);
  view.setUint32(offset + 12, offset - centralStart, true);
  view.setUint32(offset + 16, centralStart, true);
  return out;
}

// src/export/xlsx.ts
var xml = (text) => String(text).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function columnLetter(index) {
  let letters = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(65 + (n - 1) % 26) + letters;
  return letters;
}
function toXLSX({ columns, rows, formulaFor = () => null, sheetName = "Sheet1", formulas = true, freezeHeader = true, autoFilter = true, footer = null }) {
  const letters = new Map(columns.map((c, i) => [c.field, columnLetter(i)]));
  const lastDataRow = rows.length + 1;
  const numFmts = [];
  const fmtId = (code) => {
    if (!code || code === "General") return 0;
    let index = numFmts.indexOf(code);
    if (index === -1) index = numFmts.push(code) - 1;
    return 164 + index;
  };
  const columnStyles = columns.map((c, i) => ({ data: 2 + i * 2, footer: 3 + i * 2, numFmt: fmtId(c.numFmt) }));
  const translate = (formula, rowNumber) => {
    const { ast, error } = compile(formula);
    if (error) return null;
    return toExcelFormula(ast, (field, scope) => {
      const letter = letters.get(field);
      if (!letter) return null;
      return scope === "row" ? `${letter}${rowNumber}` : `${letter}$2:${letter}$${lastDataRow}`;
    });
  };
  const cellXml = (ref, value, column, style, formula, rowNumber) => {
    const f = formulas && formula ? translate(formula, rowNumber) : null;
    const fXml = f ? `<f>${xml(f)}</f>` : "";
    if (isBlank(value)) return fXml ? `<c r="${ref}" s="${style}">${fXml}</c>` : `<c r="${ref}" s="${style}"/>`;
    if (isErrorCode(value)) return `<c r="${ref}" s="${style}" t="e">${fXml}<v>${xml(value)}</v></c>`;
    if (typeof value === "boolean") return `<c r="${ref}" s="${style}" t="b">${fXml}<v>${value ? 1 : 0}</v></c>`;
    if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}" s="${style}">${fXml}<v>${value}</v></c>`;
    if (column && DATE_TYPES.has(column.type)) {
      const serial2 = toSerial(value);
      if (serial2 !== null) return `<c r="${ref}" s="${style}">${fXml}<v>${serial2}</v></c>`;
    }
    if (fXml) return `<c r="${ref}" s="${style}" t="str">${fXml}<v>${xml(value)}</v></c>`;
    return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  };
  const sheetRows = [];
  sheetRows.push(`<row r="1">${columns.map((c, i) => cellXml(`${columnLetter(i)}1`, c.title, null, 1, null, 1)).join("")}</row>`);
  rows.forEach((row, r) => {
    const rowNumber = r + 2;
    const cells = columns.map((c, i) => cellXml(`${columnLetter(i)}${rowNumber}`, row[c.field], c, columnStyles[i].data, formulaFor(row, c), rowNumber));
    sheetRows.push(`<row r="${rowNumber}">${cells.join("")}</row>`);
  });
  if (footer) {
    const rowNumber = lastDataRow + 1;
    const cells = columns.map((c, i) => {
      const item = footer[c.field];
      if (!item) return "";
      return cellXml(`${columnLetter(i)}${rowNumber}`, item.value, c, columnStyles[i].footer, item.formula, rowNumber);
    }).join("");
    sheetRows.push(`<row r="${rowNumber}">${cells}</row>`);
  }
  const lastColumn = columnLetter(Math.max(columns.length - 1, 0));
  const cols = columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.max(8, Math.round((c.width ?? 120) / 7))}" customWidth="1"/>`).join("");
  const pane = freezeHeader ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : "";
  const filter = autoFilter && columns.length ? `<autoFilter ref="A1:${lastColumn}${lastDataRow}"/>` : "";
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${pane}${cols ? `<cols>${cols}</cols>` : ""}<sheetData>${sheetRows.join("")}</sheetData>${filter}</worksheet>`;
  const xfs = [
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>'
  ];
  for (const style of columnStyles) {
    xfs.push(`<xf numFmtId="${style.numFmt}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`);
    xfs.push(`<xf numFmtId="${style.numFmt}" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>`);
  }
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${numFmts.length ? `<numFmts count="${numFmts.length}">${numFmts.map((code, i) => `<numFmt numFmtId="${164 + i}" formatCode="${xml(code)}"/>`).join("")}</numFmts>` : ""}<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7ECF3"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs></styleSheet>`;
  const safeName = xml(String(sheetName).replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet1");
  const definedName = filter ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${safeName.replace(/'/g, "''")}'!$A$1:$${lastColumn}$${lastDataRow}</definedName></definedNames>` : "";
  return zip([
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${safeName}" sheetId="1" r:id="rId1"/></sheets>${definedName}<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", data: styles },
    { name: "xl/worksheets/sheet1.xml", data: sheet }
  ]);
}
function download(data, filename, mime) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1e3);
}

// src/i18n/labels.ts
var en = {
  search: "Search\u2026",
  clearFilters: "Clear filters",
  columns: "Columns",
  addRow: "Add row",
  deleteRows: "Delete",
  exportCsv: "CSV",
  exportXlsx: "Excel",
  sortAsc: "Sort ascending",
  sortDesc: "Sort descending",
  clearSort: "Clear sort",
  filter: "Filter",
  apply: "Apply",
  clear: "Clear",
  selectAll: "(Select all)",
  blanks: "(Blanks)",
  and: "And",
  or: "Or",
  noRows: "No rows to show",
  loading: "Loading\u2026",
  loadError: "Could not load rows",
  status: "{shown} of {total} rows",
  selected: "{count} selected",
  confirmDelete: "Delete {count} row(s)? This cannot be undone.",
  deleteTitle: "Delete rows",
  confirmTitle: "Are you sure?",
  confirm: "OK",
  cancel: "Cancel",
  discard: "Discard",
  changesCount: "{count} change(s)",
  changesDetail: "{inserted} inserted, {updated} updated, {deleted} deleted",
  discardChanges: "Discard changes",
  confirmDiscard: "Discard {count} unsaved change(s)?",
  was: "Was: {value}",
  op_contains: "Contains",
  op_notContains: "Does not contain",
  op_equals: "Equals",
  op_notEquals: "Does not equal",
  op_startsWith: "Begins with",
  op_endsWith: "Ends with",
  op_empty: "Is blank",
  op_notEmpty: "Is not blank",
  op_eq: "Equals",
  op_ne: "Does not equal",
  op_gt: "Greater than",
  op_gte: "Greater than or equal to",
  op_lt: "Less than",
  op_lte: "Less than or equal to",
  op_between: "Between",
  required: "This field is required",
  invalidValue: "Invalid value",
  invalidNumber: "Enter a valid number",
  invalidInteger: "Enter a whole number",
  invalidDate: "Enter a valid date",
  invalidBoolean: "Enter yes or no",
  invalidOption: "Choose one of the options",
  pattern: "Invalid format",
  min: "Minimum is {0}",
  max: "Maximum is {0}",
  minLength: "At least {0} characters",
  maxLength: "At most {0} characters",
  true: "Yes",
  false: "No"
};
var ptBR = {
  search: "Pesquisar\u2026",
  clearFilters: "Limpar filtros",
  columns: "Colunas",
  addRow: "Adicionar linha",
  deleteRows: "Excluir",
  exportCsv: "CSV",
  exportXlsx: "Excel",
  sortAsc: "Classificar crescente",
  sortDesc: "Classificar decrescente",
  clearSort: "Remover classifica\xE7\xE3o",
  filter: "Filtrar",
  apply: "Aplicar",
  clear: "Limpar",
  selectAll: "(Selecionar tudo)",
  blanks: "(Vazias)",
  and: "E",
  or: "Ou",
  noRows: "Nenhuma linha para exibir",
  loading: "Carregando\u2026",
  loadError: "N\xE3o foi poss\xEDvel carregar as linhas",
  status: "{shown} de {total} linhas",
  selected: "{count} selecionada(s)",
  confirmDelete: "Excluir {count} linha(s)? Esta a\xE7\xE3o n\xE3o pode ser desfeita.",
  deleteTitle: "Excluir linhas",
  confirmTitle: "Tem certeza?",
  confirm: "OK",
  cancel: "Cancelar",
  discard: "Descartar",
  changesCount: "{count} altera\xE7\xE3o(\xF5es)",
  changesDetail: "{inserted} inserida(s), {updated} alterada(s), {deleted} exclu\xEDda(s)",
  discardChanges: "Descartar altera\xE7\xF5es",
  confirmDiscard: "Descartar {count} altera\xE7\xE3o(\xF5es) n\xE3o salva(s)?",
  was: "Antes: {value}",
  op_contains: "Cont\xE9m",
  op_notContains: "N\xE3o cont\xE9m",
  op_equals: "\xC9 igual a",
  op_notEquals: "\xC9 diferente de",
  op_startsWith: "Come\xE7a com",
  op_endsWith: "Termina com",
  op_empty: "Est\xE1 vazio",
  op_notEmpty: "N\xE3o est\xE1 vazio",
  op_eq: "\xC9 igual a",
  op_ne: "\xC9 diferente de",
  op_gt: "\xC9 maior que",
  op_gte: "\xC9 maior ou igual a",
  op_lt: "\xC9 menor que",
  op_lte: "\xC9 menor ou igual a",
  op_between: "Est\xE1 entre",
  required: "Campo obrigat\xF3rio",
  invalidValue: "Valor inv\xE1lido",
  invalidNumber: "Informe um n\xFAmero v\xE1lido",
  invalidInteger: "Informe um n\xFAmero inteiro",
  invalidDate: "Informe uma data v\xE1lida",
  invalidBoolean: "Informe sim ou n\xE3o",
  invalidOption: "Escolha uma das op\xE7\xF5es",
  pattern: "Formato inv\xE1lido",
  min: "O m\xEDnimo \xE9 {0}",
  max: "O m\xE1ximo \xE9 {0}",
  minLength: "M\xEDnimo de {0} caracteres",
  maxLength: "M\xE1ximo de {0} caracteres",
  true: "Sim",
  false: "N\xE3o"
};
var LOCALES = { en, pt: ptBR, "pt-BR": ptBR };
function createTranslator(locale, overrides = {}) {
  const base = LOCALES[locale] ?? LOCALES[locale.split("-")[0]] ?? en;
  const labels = { ...en, ...base, ...overrides };
  return (key, params = {}) => {
    const [name = "", arg] = String(key).split(":");
    const template = labels[key] ?? (arg !== void 0 ? labels[name] : void 0);
    if (template === void 0) return String(key);
    return template.replace(/\{(\w+)\}/g, (m, p) => p === "0" && arg !== void 0 ? arg : String(params[p] ?? m));
  };
}

// src/ui/dom.ts
function h(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === void 0 || value === null || value === false) continue;
    if (key === "class") element.className = String(value);
    else if (key === "text") element.textContent = String(value);
    else if (key === "style" && typeof value === "object") Object.assign(element.style, value);
    else if (key === "dataset" && typeof value === "object") Object.assign(element.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") element.addEventListener(key.slice(2), value);
    else if (key in element && typeof value !== "string") element[key] = value;
    else element.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === void 0 || child === false) continue;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return element;
}
function clear(element) {
  while (element.firstChild) element.firstChild.remove();
}

// src/ui/editors.ts
var textInput = (type, extra = {}) => ({
  create({ text }) {
    const input = h("input", { class: "ig-editor", type, value: text, ...extra });
    return { element: input, getValue: () => input.value, focus: () => {
      input.focus();
      input.select();
    } };
  }
});
var EDITORS = {
  text: textInput("text"),
  number: textInput("text", { inputmode: "decimal" }),
  date: textInput("date"),
  datetime: textInput("datetime-local"),
  textarea: {
    create({ text }) {
      const area = h("textarea", { class: "ig-editor ig-editor-textarea", rows: 3 });
      area.value = text;
      return { element: area, getValue: () => area.value, focus: () => area.focus() };
    }
  },
  select: {
    create({ value, column }) {
      const options = column.options ?? [];
      const select = h(
        "select",
        { class: "ig-editor" },
        h("option", { value: "", text: "" }),
        options.map((option, i) => h("option", { value: String(i), text: option.label, selected: option.value === value }))
      );
      return {
        element: select,
        // option values can be numbers/booleans, map the index back to the real value
        getValue: () => select.value === "" ? null : options[Number(select.value)]?.value,
        focus: () => select.focus()
      };
    }
  },
  checkbox: {
    create({ value }) {
      const input = h("input", { class: "ig-editor ig-editor-checkbox", type: "checkbox", checked: value === true });
      return { element: input, getValue: () => input.checked, focus: () => input.focus() };
    }
  }
};
function resolveEditor(column, isFormula2) {
  if (isFormula2) return EDITORS.text;
  const editor = column.editor;
  if (typeof editor === "object" && typeof editor.create === "function") return editor;
  if (typeof editor === "function") return { create: editor };
  return EDITORS[editor] ?? EDITORS.text;
}

// src/ui/filter-menu.ts
var MAX_VALUES = 1e3;
function openFilterMenu(grid, column, anchor) {
  grid.closePopover();
  const t = grid.t;
  const current = grid.getFilters()[column.field] ?? {};
  const operators = operatorsFor(column);
  const noValue = (op) => op === "empty" || op === "notEmpty";
  const inputType = DATE_TYPES.has(column.type) ? "date" : "text";
  const conditionRow = (condition = {}) => {
    const op = h(
      "select",
      { class: "ig-input" },
      h("option", { value: "", text: "" }),
      operators.map((o) => h("option", { value: o, text: t(`op_${o}`), selected: condition.op === o }))
    );
    const value = column.type === "boolean" ? h(
      "select",
      { class: "ig-input" },
      h("option", { value: "true", text: t("true"), selected: condition.value === true }),
      h("option", { value: "false", text: t("false"), selected: condition.value === false })
    ) : h("input", { class: "ig-input", type: inputType, value: condition.value ?? "" });
    const value2 = h("input", { class: "ig-input", type: inputType, value: condition.value2 ?? "" });
    const sync = () => {
      value.hidden = noValue(op.value);
      value2.hidden = op.value !== "between";
    };
    op.addEventListener("change", sync);
    sync();
    return {
      element: h("div", { class: "ig-condition" }, op, value, value2),
      read: () => op.value ? {
        op: op.value,
        value: column.type === "boolean" ? value.value === "true" : value.value,
        value2: value2.value
      } : null
    };
  };
  const first = conditionRow(current.conditions?.[0]);
  const second = conditionRow(current.conditions?.[1]);
  const joinName = `ig-join-${Math.random().toString(36).slice(2)}`;
  const joinAnd = h("input", { type: "radio", name: joinName, checked: current.join !== "or" });
  const joinOr = h("input", { type: "radio", name: joinName, checked: current.join === "or" });
  const distinct = grid.distinctValues(column.field);
  const selected = new Set(Array.isArray(current.values) ? current.values : distinct.map((d) => d.value));
  const search = h("input", { class: "ig-input", type: "search", placeholder: t("search") });
  const list = h("div", { class: "ig-values" });
  const all = h("input", { type: "checkbox" });
  const syncAll = () => {
    all.checked = selected.size === distinct.length;
    all.indeterminate = selected.size > 0 && selected.size < distinct.length;
  };
  const renderValues = () => {
    const needle = search.value.trim().toLocaleLowerCase(grid.locale);
    const visible = distinct.filter((d) => !needle || d.label.toLocaleLowerCase(grid.locale).includes(needle)).slice(0, MAX_VALUES);
    list.replaceChildren(...visible.map((d) => {
      const box = h("input", {
        type: "checkbox",
        checked: selected.has(d.value),
        onchange: (e) => {
          if (e.target.checked) selected.add(d.value);
          else selected.delete(d.value);
          syncAll();
        }
      });
      return h("label", { class: "ig-value" }, box, h("span", { text: d.value === "" ? t("blanks") : d.label }), h("small", { text: d.count }));
    }));
  };
  all.addEventListener("change", () => {
    if (all.checked) distinct.forEach((d) => selected.add(d.value));
    else selected.clear();
    renderValues();
    syncAll();
  });
  search.addEventListener("input", renderValues);
  renderValues();
  syncAll();
  const apply = () => {
    const conditions = [first.read(), second.read()].filter((c) => c !== null);
    const filter = { formula: current.formula, test: current.test };
    if (conditions.length) {
      filter.conditions = conditions;
      filter.join = joinOr.checked ? "or" : "and";
    }
    if (selected.size !== distinct.length) filter.values = [...selected];
    grid.setFilter(column.field, filter);
    grid.closePopover();
  };
  const sortButton = (dir, label) => h("button", {
    type: "button",
    class: "ig-menu-item",
    text: label,
    onclick: () => {
      grid.setSort([{ field: column.field, dir }]);
      grid.closePopover();
    }
  });
  const menu = h(
    "div",
    { class: "ig-popover ig-filter-menu", role: "dialog" },
    column.sortable ? h("div", { class: "ig-menu-section" }, sortButton("asc", t("sortAsc")), sortButton("desc", t("sortDesc"))) : null,
    h(
      "div",
      { class: "ig-menu-section" },
      h("strong", { text: t("filter") }),
      first.element,
      h("div", { class: "ig-join" }, h("label", {}, joinAnd, t("and")), h("label", {}, joinOr, t("or"))),
      second.element
    ),
    h(
      "div",
      { class: "ig-menu-section" },
      search,
      h("label", { class: "ig-value ig-value-all" }, all, h("span", { text: t("selectAll") })),
      list
    ),
    h(
      "div",
      { class: "ig-menu-actions" },
      h("button", { type: "button", class: "ig-btn", text: t("clear"), onclick: () => {
        grid.setFilter(column.field, null);
        grid.closePopover();
      } }),
      h("button", { type: "button", class: "ig-btn ig-btn-primary", text: t("apply"), onclick: apply })
    )
  );
  menu.addEventListener("keydown", (e) => {
    const target = e.target;
    if (e.key === "Enter" && target.tagName === "INPUT" && target.type !== "checkbox") apply();
  });
  grid.showPopover(menu, anchor);
}

// src/ui/modal.ts
function openConfirm(container, request, t) {
  return new Promise((resolve) => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const id = `ig-modal-${Math.random().toString(36).slice(2)}`;
    const cancel = h("button", { type: "button", class: "ig-btn", text: request.cancelLabel ?? t("cancel") });
    const confirm = h("button", {
      type: "button",
      class: `ig-btn ${request.danger ? "ig-btn-danger-solid" : "ig-btn-primary"}`,
      text: request.confirmLabel ?? t("confirm")
    });
    const dialog = h(
      "div",
      {
        class: "ig-modal",
        role: "alertdialog",
        "aria-modal": "true",
        "aria-labelledby": `${id}-title`,
        "aria-describedby": `${id}-message`
      },
      h("h2", { class: "ig-modal-title", id: `${id}-title`, text: request.title ?? t("confirmTitle") }),
      h("p", { class: "ig-modal-message", id: `${id}-message`, text: request.message }),
      h("div", { class: "ig-modal-actions" }, cancel, confirm)
    );
    const backdrop = h("div", { class: "ig-modal-backdrop" }, dialog);
    const close = (answer) => {
      backdrop.remove();
      document.removeEventListener("keydown", onKey, true);
      previous?.focus();
      resolve(answer);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close(false);
      } else if (e.key === "Tab") {
        e.preventDefault();
        (document.activeElement === cancel ? confirm : cancel).focus();
      }
    };
    cancel.addEventListener("click", () => close(false));
    confirm.addEventListener("click", () => close(true));
    backdrop.addEventListener("pointerdown", (e) => {
      if (e.target === backdrop) close(false);
    });
    document.addEventListener("keydown", onKey, true);
    container.append(backdrop);
    (request.danger ? cancel : confirm).focus();
  });
}

// src/ui/grid.ts
var isRow = (row) => row !== null;
var targetOf = (event) => event.target instanceof Element ? event.target : null;
var FOOTER_SHORTCUTS = { sum: "SUM", avg: "AVERAGE", average: "AVERAGE", count: "COUNT", counta: "COUNTA", min: "MIN", max: "MAX", median: "MEDIAN" };
var DEFAULTS = {
  columns: [],
  data: [],
  idField: null,
  locale: null,
  labels: {},
  height: 480,
  editable: false,
  cellFormulas: true,
  names: {},
  functions: {},
  sort: { mode: "modifier" },
  initialSort: [],
  initialFilters: {},
  selection: { mode: "multiple", checkbox: true },
  navbar: { search: true, filters: true, columns: true, export: ["csv", "xlsx"], add: false, delete: false, changes: true, items: [] },
  changeTracking: { inputName: "changes", historyLimit: 5e3 },
  statusBar: true,
  renderChunk: 100,
  append: null,
  rowClass: null,
  rowFormats: [],
  exportOptions: { filename: "export", sheetName: "Sheet1" },
  confirmDelete: true,
  on: {}
};
var IntelligentGrid = class {
  element;
  options;
  locale;
  t;
  events;
  functions = /* @__PURE__ */ new Map();
  store;
  calc;
  columns = [];
  root;
  _columnMap = /* @__PURE__ */ new Map();
  _sort;
  _filters;
  _search = "";
  _selected = /* @__PURE__ */ new Set();
  _anchorId = null;
  _active = null;
  _editing = null;
  _view = [];
  _rendered = 0;
  _invalid = /* @__PURE__ */ new Map();
  _append;
  _navbar;
  _colgroup;
  _thead;
  _tbody;
  _tfoot;
  _table;
  _message;
  _loading;
  _sentinel;
  _scroller;
  _status;
  _searchInput = null;
  _selectAllBox = null;
  _popover = null;
  _observer = null;
  _onScroll = null;
  _onDocumentPointer = null;
  _tracker = null;
  _formInputs = [];
  /**
   * @param string|HTMLElement target
   * @param object options see README
   */
  constructor(target, options) {
    const element = typeof target === "string" ? document.querySelector(target) : target;
    if (!element) throw new Error("Intelligent Grid: target element not found");
    this.element = element;
    this.options = {
      ...DEFAULTS,
      ...options,
      sort: { ...DEFAULTS.sort, ...options.sort },
      selection: options.selection === false ? { mode: "none" } : { ...DEFAULTS.selection, ...options.selection },
      navbar: options.navbar === false ? false : { ...DEFAULTS.navbar, ...options.navbar },
      exportOptions: { ...DEFAULTS.exportOptions, ...options.exportOptions },
      changeTracking: options.changeTracking === false ? false : { ...DEFAULTS.changeTracking, ...options.changeTracking === true ? {} : options.changeTracking }
    };
    this.locale = this.options.locale ?? globalThis.navigator?.language ?? "en-US";
    this.t = createTranslator(this.locale, this.options.labels);
    this.events = new Emitter(this);
    for (const [type, handler] of Object.entries(this.options.on)) this.on(type, handler);
    for (const [name, fn] of Object.entries(this.options.functions)) this.registerFunction(name, fn);
    this.store = new SorlaStore({ sorla: options.sorla, idField: this.options.idField, database: options.database });
    this.calc = new CalcEngine({ store: this.store, locale: this.locale, names: this.options.names, functions: this.functions });
    const tracking = this.options.changeTracking;
    if (tracking) this._tracker = new ChangeTracker(tracking.historyLimit);
    this._sort = [...this.options.initialSort];
    this._filters = { ...this.options.initialFilters };
    this._append = this.options.append ? { pageSize: 100, serverSide: true, threshold: 200, ...this.options.append, loaded: 0, hasMore: true, loading: false, request: 0 } : null;
    this._setColumns(this.options.columns);
    this._build();
    if (tracking && tracking.form) this.bindForm(tracking.form, tracking.inputName);
    if (this._append) {
      this.refresh();
      this.loadMore();
    } else {
      this._insert(this.options.data);
      this.refresh();
    }
    this.emit("ready", {});
  }
  /* ---------------------------------------------------------------- events */
  on(type, handler) {
    return this.events.on(type, handler);
  }
  once(type, handler) {
    return this.events.once(type, handler);
  }
  off(type, handler) {
    this.events.off(type, handler);
  }
  emit(type, detail) {
    return this.events.emit(type, detail);
  }
  /* ---------------------------------------------------------------- columns */
  _setColumns(definitions) {
    const gridDefaults = { locale: this.locale, editable: this.options.editable, cellFormulas: this.options.cellFormulas, currency: this.options.currency };
    this.columns = definitions.map((definition) => normalizeColumn(definition, gridDefaults));
    this._columnMap = new Map(this.columns.map((c) => [c.field, c]));
    if (this._columnMap.size !== this.columns.length) throw new Error("Intelligent Grid: duplicated column field");
    this.store.setFields(this.columns.map((c) => c.field));
    this.calc.setColumns(this.columns);
  }
  getColumn(field) {
    return this._columnMap.get(field);
  }
  get visibleColumns() {
    return this.columns.filter((c) => c.visible);
  }
  setColumns(definitions) {
    this._setColumns(definitions);
    this.calc.recalculateAll();
    this._renderHeader();
    this.refresh();
  }
  addColumn(definition, index = this.columns.length) {
    const definitions = this.columns.map((c) => ({ ...c }));
    definitions.splice(index, 0, definition);
    this.setColumns(definitions);
  }
  removeColumn(field) {
    this.setColumns(this.columns.filter((c) => c.field !== field).map((c) => ({ ...c })));
  }
  setColumnVisible(field, visible) {
    const column = this.getColumn(field);
    if (!column || column.visible === visible) return;
    column.visible = visible;
    this._renderHeader();
    this._renderBody();
    this.emit("columnVisibilityChange", { field, visible });
  }
  setColumnFormula(field, formula) {
    const column = this.getColumn(field);
    if (!column) throw new Error(`Unknown column ${field}`);
    column.formula = formula || void 0;
    this.calc.setColumns(this.columns);
    this.calc.recalculateAll();
    this.refresh();
  }
  registerFunction(name, fn, options = {}) {
    this.functions.set(name.toUpperCase(), { fn, lazy: !!options.lazy, errors: !!options.errors });
  }
  static defineFunction(name, fn, options = {}) {
    if (options.lazy) defineLazyFunction(name, fn);
    else defineFunction(name, fn, options);
  }
  /* ---------------------------------------------------------------- data */
  _insert(rows) {
    const ids = this.store.insert(rows);
    if (ids.length) this.calc.recalculate(ids, this.columns.map((c) => c.field));
    return ids;
  }
  /**
   * Row as handed to developers: a copy, blanks of non text columns as null.
   */
  _publicRow(data) {
    if (!data) return null;
    const row = { ...data };
    for (const column of this.columns) {
      if (row[column.field] === "" && column.type !== "text" && column.type !== "select") row[column.field] = null;
    }
    return row;
  }
  setData(rows) {
    this._closeEditor(false);
    this.store.clear();
    this.calc.cellFormulas.clear();
    this.calc.setColumns(this.columns);
    this._selected.clear();
    this._tracker?.reset();
    this._insert(rows);
    this.refresh();
    this._afterTrackedChange();
    this.emit("dataChange", { reason: "setData" });
  }
  /**
   * @param string scope 'all' | 'filtered' (sorted as shown) | 'selected'
   */
  getRows(scope = "all") {
    if (scope === "filtered") return this._view.map((row) => this._publicRow(this.store.get(row._id))).filter(isRow);
    if (scope === "selected") return this.getSelected();
    return this.store.ids().map((id) => this._publicRow(this.store.get(id))).filter(isRow);
  }
  getRow(id) {
    return this._publicRow(this.store.get(id));
  }
  addRow(row = {}, { position = "end" } = {}) {
    const event = this.emit("beforeRowAdd", { row: { ...row } });
    if (event.defaultPrevented) return null;
    const id = this._insert([event.detail.row])[0];
    this._tracker?.recordInsert(id);
    const data = { ...this.store.get(id) };
    if (position === "start") this._view.unshift(data);
    else this._view.push(data);
    this._renderBody();
    this._renderFooter();
    this._afterTrackedChange();
    this.emit("rowAdd", { id, row: this.getRow(id) });
    return id;
  }
  updateRow(id, patch) {
    if (!this.store.has(id)) return false;
    this._touch(id);
    const before = this.getRow(id);
    const previous = this.store.update(id, patch);
    const scope = this.calc.recalculate([id], Object.keys(patch));
    const after = this.getRow(id);
    for (const field of Object.keys(patch)) {
      if (field !== "_id") this._tracker?.recordUpdate(id, field, before[field] ?? null, after[field] ?? null, "api");
    }
    this._syncRows(scope === "all" ? null : [id]);
    this._afterTrackedChange();
    this.emit("rowChange", { id, row: this.getRow(id), previous });
    return true;
  }
  deleteRows(ids) {
    const event = this.emit("beforeRowDelete", { ids: [...ids], rows: ids.map((id) => this.getRow(id)) });
    if (event.defaultPrevented) return [];
    for (const id of event.detail.ids) {
      const data = this.store.get(id);
      if (data) this._tracker?.recordDelete(id, data, this.calc.cellFormulas.get(id));
    }
    const removed = this.store.remove(event.detail.ids);
    const removedIds = removed.map((r) => r._id);
    this.calc.forgetRows(removedIds);
    this.calc.recalculate([], this.columns.map((c) => c.field));
    removedIds.forEach((id) => this._selected.delete(id));
    const gone = new Set(removedIds);
    this._view = this._view.filter((r) => !gone.has(r._id));
    this._rendered = Math.min(this._rendered, this._view.length);
    this._syncRows(null);
    if (removedIds.length) this.emit("selectionChange", this._selectionDetail());
    this._afterTrackedChange();
    this.emit("rowDelete", { ids: removedIds, rows: removed.map((r) => this._publicRow(r)) });
    return removedIds;
  }
  /**
   * Same pipeline as a user edit: parsing (strings), formulas, validation and events.
   * @return object {ok, error?}
   */
  setCellValue(id, field, value, { source = "api" } = {}) {
    const column = this.getColumn(field);
    const data = this.store.get(id);
    if (!column || !data) return { ok: false, error: "notFound" };
    if (isFormula(value) && column.allowFormulas) return this.setCellFormula(id, field, value, { source });
    if (typeof value === "string" && source !== "api") {
      const parsed = parseInput(value, column, this.locale);
      if (parsed.error) return this._invalidCell(id, field, value, parsed.error);
      value = parsed.value;
    }
    const row = this._publicRow(data);
    const error = validateValue(value, column, row);
    if (error) return this._invalidCell(id, field, value, error);
    const oldValue = row[field];
    const detail = { id, field, value, oldValue, row, column, source };
    if (typeof column.beforeChange === "function") {
      const result = column.beforeChange(detail);
      if (result === false) return { ok: false, error: "cancelled" };
      if (result !== void 0 && result !== true) detail.value = result;
    }
    const event = this.emit("beforeCellChange", detail);
    if (event.defaultPrevented) return { ok: false, error: "cancelled" };
    this._touch(id);
    const hadFormula = !!this.calc.cellFormulas.get(id)?.[field];
    if (this.calc.columnFormulas.has(field)) this.calc.setCellOverride(id, field);
    else if (hadFormula) this.calc.setCellFormula(id, field, null);
    this.store.update(id, { [field]: event.detail.value });
    this._invalid.delete(`${id}\0${field}`);
    const scope = this.calc.recalculate([id], [field]);
    this._syncRows(scope === "all" || hadFormula ? null : [id]);
    const updated = this.getRow(id);
    this._tracker?.recordUpdate(id, field, oldValue ?? null, updated[field] ?? null, source);
    this._afterTrackedChange();
    const change = { id, field, value: updated[field], oldValue, row: updated, source };
    column.onChange?.(change);
    this.emit("cellChange", change);
    return { ok: true };
  }
  setCellFormula(id, field, formula, { source = "api" } = {}) {
    const column = this.getColumn(field);
    if (!column || !this.store.has(id)) return { ok: false, error: "notFound" };
    const oldValue = this.getRow(id)[field];
    const event = this.emit("beforeCellChange", { id, field, value: formula, oldValue, row: this.getRow(id), column, source, formula: true });
    if (event.defaultPrevented) return { ok: false, error: "cancelled" };
    this._touch(id);
    this.calc.setCellFormula(id, field, formula);
    this.calc.recalculate([id], [field]);
    this._syncRows(null);
    const value = this.getRow(id)[field];
    if (isErrorCode(value)) this.emit("formulaError", { id, field, formula, error: value });
    this._tracker?.recordUpdate(id, field, oldValue ?? null, value ?? null, source, formula);
    this._afterTrackedChange();
    const change = { id, field, value, oldValue, formula: formula ?? void 0, row: this.getRow(id), source };
    column.onChange?.(change);
    this.emit("cellChange", change);
    return { ok: true };
  }
  /** Formula of a cell: its own, or the column formula; null for plain values. */
  getCellFormula(id, field) {
    return this.calc.formulaFor(id, field);
  }
  _invalidCell(id, field, value, error) {
    const message = this.t(error);
    this._invalid.set(`${id}\0${field}`, message);
    this.emit("validationError", { id, field, value, error, message });
    return { ok: false, error: message };
  }
  /**
   * Evaluates a formula: grid.evaluate('=SUM([total])') over the filtered rows, or for one row.
   */
  evaluate(formula, id = null) {
    const row = id === null ? null : this.store.get(id);
    const value = this.calc.evaluate(formula, row, row ? null : this._view);
    return isError(value) ? value.code : value;
  }
  /* ---------------------------------------------------------------- dialogs */
  /**
   * Asks the user to confirm, with the built-in modal or the `confirm` option.
   * Also available for your own actions: `if (await grid.confirm({ action: 'archive', message: '…' })) …`
   */
  async confirm(request) {
    const custom = this.options.confirm;
    if (typeof custom === "function") return !!await custom(request);
    return openConfirm(this.root, request, this.t);
  }
  /* ---------------------------------------------------------------- change tracking */
  _readers = {
    current: (id) => this.store.get(id),
    publicRow: (data) => this._publicRow(data) ?? {},
    formulas: (id) => this.calc.cellFormulas.get(id),
    // calculated values are not user data, unless the user typed something into that cell
    tracked: (id, field, original) => !this.calc.columnFormulas.has(field) || this.calc.cellFormulas.get(id)?.[field] !== void 0 || original?.[field] !== void 0
  };
  _touch(id) {
    this._tracker?.touch(id, this.store.get(id), this.calc.cellFormulas.get(id));
  }
  _afterTrackedChange() {
    if (!this._tracker) return;
    const json = this._formInputs.length ? this.getChangesJSON() : "";
    for (const input of this._formInputs) input.value = json;
    this._renderNavbar();
    this.emit("changes", { summary: this.getChangeSummary(), hasChanges: this.hasChanges() });
  }
  /**
   * Net changes since the data was loaded or the last acceptChanges():
   * { inserted: [{id, row}], updated: [{id, changes: {field: {from, to}}, row}], deleted: [{id, row}] }
   */
  getChanges() {
    if (!this._tracker) return { inserted: [], updated: [], deleted: [] };
    return this._tracker.getChanges(this._readers);
  }
  getChangesJSON(space) {
    return JSON.stringify(this.getChanges(), null, space);
  }
  getChangeSummary() {
    if (!this._tracker) return { inserted: 0, updated: 0, deleted: 0, total: 0 };
    return this._tracker.summary(this._readers);
  }
  hasChanges() {
    return this.getChangeSummary().total > 0;
  }
  /** Every insert, update and delete since the last acceptChanges(), oldest first. */
  getHistory() {
    return this._tracker ? this._tracker.history.map((entry) => ({ ...entry })) : [];
  }
  /**
   * The current values become the new originals (call it after the server saved the changes).
   * @param ids only these rows (e.g. the ones the server accepted); all when omitted
   */
  acceptChanges(ids) {
    if (!this._tracker) return;
    this._tracker.forget(ids ? new Set(ids) : null);
    this._syncRows(null);
    this._afterTrackedChange();
    this.emit("changesAccept", { ids: ids ?? null });
  }
  /**
   * Restores the original state: removes inserted rows, restores deleted ones and reverts updates.
   * @param ids only these rows; all when omitted
   */
  rejectChanges(ids) {
    if (!this._tracker) return;
    this._closeEditor(false);
    const scope = ids ? new Set(ids) : null;
    const pending = this._tracker.pending(scope);
    this.store.remove(pending.inserted);
    this.calc.forgetRows(pending.inserted);
    pending.inserted.forEach((id) => this._selected.delete(id));
    const restore = (id, formulas) => {
      if (formulas && Object.keys(formulas).length) this.calc.cellFormulas.set(id, { ...formulas });
      else this.calc.cellFormulas.delete(id);
    };
    for (const [id, snapshot] of pending.updated) {
      const { _id, ...values } = snapshot.data;
      const current = this.store.get(id);
      if (!current) continue;
      for (const field of Object.keys(current)) if (field !== "_id" && !(field in values)) values[field] = null;
      this.store.update(id, values);
      restore(id, snapshot.formulas);
    }
    for (const [id, snapshot] of pending.deleted) {
      this.store.insert([{ ...snapshot.data }]);
      restore(id, snapshot.formulas);
    }
    this._tracker.forget(scope);
    this.calc.setColumns(this.columns);
    this.calc.recalculateAll();
    this.refresh();
    this._afterTrackedChange();
    this.emit("changesReject", { ids: ids ?? null });
  }
  /**
   * Keeps a hidden input with getChangesJSON() inside a form, updated on every change,
   * so a normal form submit sends the changes.
   * @return the hidden input
   */
  bindForm(form, name = "changes") {
    const element = typeof form === "string" ? document.querySelector(form) : form;
    if (!element) throw new Error("Intelligent Grid: form not found");
    let input = element.querySelector(`input[type="hidden"][name="${CSS.escape(name)}"]`);
    if (!input) {
      input = h("input", { type: "hidden", name });
      element.append(input);
    }
    input.value = this.getChangesJSON();
    if (!this._formInputs.includes(input)) this._formInputs.push(input);
    return input;
  }
  /* ---------------------------------------------------------------- sort, filters, search */
  getSort() {
    return this._sort.map((s) => ({ ...s }));
  }
  setSort(sort) {
    this._sort = (sort ?? []).filter((s) => this.getColumn(s.field)).map((s) => ({ field: s.field, dir: s.dir === "desc" ? "desc" : "asc" }));
    this._renderHeader();
    this._onQueryChange();
    this.emit("sortChange", { sort: this.getSort() });
  }
  /**
   * asc -> desc -> none. Additive keeps the other sorted columns (multi column sort).
   */
  toggleSort(field, additive = false) {
    const column = this.getColumn(field);
    if (!column?.sortable) return;
    const current = this._sort.find((s) => s.field === field);
    const next = !current ? "asc" : current.dir === "asc" ? "desc" : null;
    let sort = additive ? this._sort.filter((s) => s.field !== field) : [];
    if (additive && current && next) sort = this._sort.map((s) => s.field === field ? { field, dir: next } : s);
    else if (next) sort.push({ field, dir: next });
    this.setSort(sort);
  }
  getFilters() {
    return { ...this._filters };
  }
  setFilter(field, filter) {
    if (filter && isFilterActive(filter)) this._filters[field] = filter;
    else delete this._filters[field];
    this._renderHeader();
    this._onQueryChange();
    this.emit("filterChange", { field, filter: this._filters[field] ?? null, filters: this.getFilters() });
  }
  setFilters(filters) {
    this._filters = {};
    for (const [field, filter] of Object.entries(filters ?? {})) if (isFilterActive(filter)) this._filters[field] = filter;
    this._renderHeader();
    this._onQueryChange();
    this.emit("filterChange", { field: null, filter: null, filters: this.getFilters() });
  }
  clearFilters() {
    this._search = "";
    if (this._searchInput) this._searchInput.value = "";
    this.setFilters({});
  }
  setSearch(text) {
    this._search = String(text ?? "");
    if (this._searchInput && this._searchInput.value !== this._search) this._searchInput.value = this._search;
    this._onQueryChange();
    this.emit("searchChange", { search: this._search });
  }
  _onQueryChange() {
    if (this._append?.serverSide) {
      this._resetAppend();
      this.loadMore();
      return;
    }
    this.refresh();
  }
  _compiled(excludeField = null) {
    const filters = { ...this._filters };
    if (excludeField) delete filters[excludeField];
    const { query, predicates } = compileFilters(filters, this._columnMap, {
      locale: this.locale,
      testFormula: (formula, row) => this.calc.evaluate(formula, row) === true
    });
    const needle = this._search.trim().toLocaleLowerCase(this.locale);
    if (needle) {
      const columns = this.visibleColumns;
      predicates.push((row) => columns.some((c) => formatCell(row[c.field], c, row, this.locale).toLocaleLowerCase(this.locale).includes(needle)));
    }
    return { query, predicates };
  }
  _query() {
    const { query, predicates } = this._append?.serverSide ? { query: {}, predicates: [] } : this._compiled();
    const sort = this._append?.serverSide ? [] : this._sort.map((s) => ({ ...s, locale: this.locale }));
    return this.store.query({ query, predicates, sort, compare: compareCells });
  }
  /**
   * Distinct values of a field for the filter checklist, considering the other filters (Excel).
   */
  /** @internal used by the filter menu */
  distinctValues(field) {
    const column = this.getColumn(field);
    const { query, predicates } = this._compiled(field);
    const counts = /* @__PURE__ */ new Map();
    for (const row of this.store.query({ query, predicates })) {
      const value = row[field];
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => compareCells(a[0], b[0], { locale: this.locale })).map(([value, count]) => ({ value, count, label: column ? formatCell(value, column, {}, this.locale) : String(value) }));
  }
  /**
   * Re-runs the query (filters + search + sort) through SorlaDB and renders from the top.
   */
  refresh() {
    this._closeEditor(false);
    this._view = this._query();
    this._rendered = 0;
    this._renderBody();
    this._renderFooter();
    this._renderNavbar();
    this.emit("render", { rows: this._view.length });
  }
  /* ---------------------------------------------------------------- append / infinite scroll */
  _resetAppend() {
    const append = this._append;
    if (!append) return;
    append.request++;
    append.loaded = 0;
    append.hasMore = true;
    append.loading = false;
    if (this.hasChanges()) this.emit("changesDiscarded", { changes: this.getChanges() });
    this._tracker?.reset();
    this.store.clear();
    this.calc.cellFormulas.clear();
    this.calc.setColumns(this.columns);
    this._view = [];
    this._rendered = 0;
    this._renderBody();
  }
  /**
   * Loads the next page from options.append.load({offset, limit, sort, filters, search}).
   * The loader resolves {rows, hasMore?, total?}.
   */
  async loadMore() {
    const append = this._append;
    if (!append || append.loading || !append.hasMore) return;
    append.loading = true;
    const request = append.request;
    const params = { offset: append.loaded, limit: append.pageSize, sort: this.getSort(), filters: this.getFilters(), search: this._search };
    this._setLoading(true);
    this.emit("loadStart", params);
    try {
      const result = await append.load(params);
      if (request !== append.request) return;
      const page = Array.isArray(result) ? { rows: result } : result;
      const rows = page?.rows ?? [];
      const ids = this._insert(rows);
      append.loaded += rows.length;
      append.total = page?.total ?? null;
      append.hasMore = page?.hasMore ?? rows.length >= append.pageSize;
      const localQuery = !append.serverSide && (this._sort.length || Object.keys(this._filters).length || this._search);
      if (localQuery) {
        append.loading = false;
        this.refresh();
      } else {
        const scopeAll = this.calc.hasColumnReferences();
        if (scopeAll) this._view.forEach((row, i) => {
          this._view[i] = { ...this.store.get(row._id) };
        });
        this._view.push(...ids.map((id) => ({ ...this.store.get(id) })));
        if (scopeAll) {
          this._rendered = 0;
          this._renderBody();
        } else {
          this._renderMore();
        }
        this._renderFooter();
        this._renderNavbar();
      }
      this.emit("loadEnd", { ...params, rows: rows.length, hasMore: append.hasMore, total: append.total });
    } catch (error) {
      if (request !== append.request) return;
      append.hasMore = false;
      this.emit("loadError", { ...params, error });
      this._showMessage(this.t("loadError"));
    } finally {
      if (request === append.request) {
        append.loading = false;
        this._setLoading(false);
        requestAnimationFrame(() => this._checkScrollEnd());
      }
    }
  }
  reload() {
    if (this._append) {
      this._resetAppend();
      return this.loadMore();
    }
    this.refresh();
  }
  _checkScrollEnd() {
    const scroller = this._scroller;
    if (!scroller) return;
    if (scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - (this._append?.threshold ?? 200)) return;
    if (this._rendered < this._view.length) this._renderMore();
    else if (this._append?.hasMore) this.loadMore();
    else this.emit("scrollEnd", {});
  }
  /* ---------------------------------------------------------------- selection */
  get selectionMode() {
    return this.options.selection.mode;
  }
  getSelected() {
    return [...this._selected].map((id) => this.getRow(id)).filter(isRow);
  }
  getSelectedIds() {
    return [...this._selected];
  }
  select(ids, { append = this.selectionMode === "multiple" } = {}) {
    if (this.selectionMode === "none") return;
    const list = this.selectionMode === "single" ? ids.slice(-1) : ids;
    if (!append || this.selectionMode === "single") this._selected.clear();
    list.filter((id) => this.store.has(id)).forEach((id) => this._selected.add(id));
    this._afterSelection();
  }
  deselect(ids) {
    ids.forEach((id) => this._selected.delete(id));
    this._afterSelection();
  }
  selectAll() {
    if (this.selectionMode !== "multiple") return;
    this._view.forEach((row) => this._selected.add(row._id));
    this._afterSelection();
  }
  clearSelection() {
    if (!this._selected.size) return;
    this._selected.clear();
    this._afterSelection();
  }
  _selectionDetail() {
    return { ids: this.getSelectedIds(), rows: this.getSelected() };
  }
  _afterSelection() {
    for (const tr of this._tbody.rows) {
      const selected = this._selected.has(tr.dataset.id ?? "");
      tr.classList.toggle("ig-selected", selected);
      tr.setAttribute("aria-selected", String(selected));
      const box = tr.querySelector(".ig-select-cell input");
      if (box) box.checked = selected;
    }
    this._syncSelectAll();
    this._renderNavbar();
    this.emit("selectionChange", this._selectionDetail());
  }
  _syncSelectAll() {
    if (!this._selectAllBox) return;
    const total = this._view.length;
    const selected = this._view.filter((r) => this._selected.has(r._id)).length;
    this._selectAllBox.checked = total > 0 && selected === total;
    this._selectAllBox.indeterminate = selected > 0 && selected < total;
  }
  _clickSelect(id, event) {
    const mode2 = this.selectionMode;
    if (mode2 === "none") return;
    if (mode2 === "single") {
      this.select([id], { append: false });
    } else if (event.shiftKey && this._anchorId) {
      const ids = this._view.map((r) => r._id);
      const [a = -1, b = -1] = [ids.indexOf(this._anchorId), ids.indexOf(id)].sort((x, y) => x - y);
      if (a === -1) return this.select([id], { append: false });
      this.select(ids.slice(a, b + 1), { append: event.ctrlKey || event.metaKey });
      return;
    } else if (event.ctrlKey || event.metaKey || event.target instanceof Element && event.target.closest(".ig-select-cell")) {
      if (this._selected.has(id)) this.deselect([id]);
      else this.select([id], { append: true });
    } else {
      this.select([id], { append: false });
    }
    this._anchorId = id;
  }
  /* ---------------------------------------------------------------- export */
  _exportRows(rows = "filtered") {
    const live = (id) => this.store.get(id);
    const present = (row) => row !== void 0;
    if (rows === "selected") return this.getSelected().map((r) => live(r._id)).filter(present);
    if (rows === "all") return this.store.ids().map(live).filter(present);
    return this._view.map((r) => this.store.get(r._id) ?? r);
  }
  _exportColumns(columns = "visible") {
    if (Array.isArray(columns)) return columns.map((f) => this.getColumn(f)).filter((c) => c !== void 0);
    return columns === "all" ? this.columns : this.visibleColumns;
  }
  /**
   * @param object options {rows: 'filtered'|'all'|'selected', columns: 'visible'|'all'|[fields],
   *   delimiter, formatted, bom, filename, download}
   * @return string
   */
  exportCSV(options = {}) {
    const event = this.emit("beforeExport", { format: "csv", options: { rows: "filtered", columns: "visible", ...options } });
    if (event.defaultPrevented) return null;
    const opts = event.detail.options;
    const { decimal } = localeSeparators(this.locale);
    const delimiter = opts.delimiter ?? (decimal === "," ? ";" : ",");
    const csv = toCSV(this._exportRows(opts.rows), this._exportColumns(opts.columns), {
      ...opts,
      delimiter,
      decimal: opts.decimal ?? (opts.formatted ? "." : decimal === "," && delimiter === ";" ? "," : "."),
      format: (value, column, row) => formatCell(value, column, row, this.locale)
    });
    const content = opts.bom ?? true ? "\uFEFF" + csv : csv;
    if (opts.download !== false) download(content, `${opts.filename ?? this.options.exportOptions.filename}.csv`, "text/csv;charset=utf-8");
    this.emit("export", { format: "csv", options: opts });
    return csv;
  }
  /**
   * @param object options {rows, columns, formulas (true), footer (true), sheetName, filename, download}
   * @return Uint8Array
   */
  exportXLSX(options = {}) {
    const event = this.emit("beforeExport", { format: "xlsx", options: { rows: "filtered", columns: "visible", formulas: true, footer: true, ...options } });
    if (event.defaultPrevented) return null;
    const opts = event.detail.options;
    const columns = this._exportColumns(opts.columns).map((c) => ({ ...c, numFmt: excelFormatCode(c, this.locale) }));
    const rows = this._exportRows(opts.rows);
    let footer = null;
    if (opts.footer && columns.some((c) => c.footer)) {
      footer = {};
      for (const column of columns) {
        const formula = this._footerFormula(column);
        if (formula) footer[column.field] = { formula, value: this._footerValue(column, rows) };
      }
    }
    const bytes = toXLSX({
      columns,
      rows,
      footer,
      formulas: opts.formulas,
      sheetName: opts.sheetName ?? this.options.exportOptions.sheetName,
      formulaFor: (row, column) => this.calc.formulaFor(row._id, column.field)
    });
    if (opts.download !== false) {
      download(bytes, `${opts.filename ?? this.options.exportOptions.filename}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    }
    this.emit("export", { format: "xlsx", options: opts });
    return bytes;
  }
  /* ---------------------------------------------------------------- footer */
  _footerFormula(column) {
    const footer = column.footer;
    if (typeof footer !== "string") return null;
    if (isFormula(footer)) return footer;
    const fn = FOOTER_SHORTCUTS[footer.toLowerCase()];
    return fn ? `=${fn}([${column.field}])` : null;
  }
  _footerValue(column, rows = this._view) {
    if (typeof column.footer === "function") return column.footer(rows.map((r) => this._publicRow(r)).filter(isRow), column, this);
    const formula = this._footerFormula(column);
    if (!formula) return null;
    const value = this.calc.evaluate(formula, null, rows);
    return isError(value) ? value.code : value;
  }
  /* ---------------------------------------------------------------- DOM */
  _build() {
    clear(this.element);
    this.root = h("div", { class: "ig", lang: this.locale });
    this._navbar = h("div", { class: "ig-navbar", role: "toolbar" });
    this._colgroup = h("colgroup");
    this._thead = h("thead");
    this._tbody = h("tbody");
    this._tfoot = h("tfoot");
    this._table = h(
      "table",
      { class: "ig-table", role: "grid", "aria-multiselectable": this.selectionMode === "multiple" ? "true" : null },
      this._colgroup,
      this._thead,
      this._tbody,
      this._tfoot
    );
    this._message = h("div", { class: "ig-message", hidden: true });
    this._loading = h("div", { class: "ig-loading", hidden: true, text: this.t("loading") });
    this._sentinel = h("div", { class: "ig-sentinel" });
    this._scroller = h(
      "div",
      { class: "ig-scroll", tabindex: "0", style: { maxHeight: typeof this.options.height === "number" ? `${this.options.height}px` : this.options.height } },
      this._table,
      this._message,
      this._loading,
      this._sentinel
    );
    this._status = h("div", { class: "ig-status", "aria-live": "polite" });
    if (this.options.navbar) this.root.append(this._navbar);
    this.root.append(this._scroller);
    if (this.options.statusBar) this.root.append(this._status);
    this.element.append(this.root);
    this._renderHeader();
    this._bindEvents();
  }
  _bindEvents() {
    const scroller = this._scroller;
    this._onScroll = () => this._checkScrollEnd();
    scroller.addEventListener("scroll", this._onScroll, { passive: true });
    if (typeof IntersectionObserver !== "undefined") {
      this._observer = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) this._checkScrollEnd();
      }, { root: scroller, rootMargin: "200px" });
      this._observer.observe(this._sentinel);
    }
    this._tbody.addEventListener("click", (e) => {
      const td = targetOf(e)?.closest("td") ?? null;
      const tr = targetOf(e)?.closest("tr");
      if (!tr || !tr.dataset.id || this._editing?.td === td) return;
      const id = tr.dataset.id;
      if (td?.dataset.field) this._setActive(id, td.dataset.field);
      if (td?.classList.contains("ig-select-cell") || this.options.selection.selectOnClick !== false) this._clickSelect(id, e);
      const row = this.getRow(id);
      this.emit("rowClick", { id, row, event: e });
      if (td?.dataset.field) this.emit("cellClick", { id, field: td.dataset.field, value: row?.[td.dataset.field], row, event: e });
    });
    this._tbody.addEventListener("dblclick", (e) => {
      const td = targetOf(e)?.closest("td[data-field]");
      const tr = targetOf(e)?.closest("tr");
      if (!tr?.dataset.id) return;
      this.emit("rowDblClick", { id: tr.dataset.id, row: this.getRow(tr.dataset.id), event: e });
      if (td?.dataset.field) this.startEdit(tr.dataset.id, td.dataset.field);
    });
    this._tbody.addEventListener("change", (e) => {
      const box = e.target;
      if (!(box instanceof HTMLInputElement) || !box.matches(".ig-cell-checkbox")) return;
      const td = box.closest("td");
      const id = td?.parentElement?.dataset.id;
      if (!td?.dataset.field || !id) return;
      const result = this.setCellValue(id, td.dataset.field, box.checked, { source: "edit" });
      if (!result.ok) box.checked = !box.checked;
    });
    scroller.addEventListener("keydown", (e) => this._onKeyDown(e));
    scroller.addEventListener("paste", (e) => this._onPaste(e));
    scroller.addEventListener("copy", (e) => this._onCopy(e));
    this._onDocumentPointer = (e) => {
      const target = targetOf(e);
      if (this._popover && !this._popover.contains(target) && !target?.closest(".ig-filter-btn, .ig-columns-btn")) this.closePopover();
    };
    document.addEventListener("pointerdown", this._onDocumentPointer);
  }
  _renderHeader() {
    clear(this._colgroup);
    clear(this._thead);
    const tr = h("tr");
    const multi = this._sort.length > 1;
    if (this.selectionMode !== "none" && this.options.selection.checkbox) {
      this._colgroup.append(h("col", { class: "ig-select-col" }));
      this._selectAllBox = this.selectionMode === "multiple" ? h("input", { type: "checkbox", "aria-label": this.t("selectAll"), onchange: (e) => e.target.checked ? this.selectAll() : this.clearSelection() }) : null;
      tr.append(h("th", { class: "ig-select-cell" }, this._selectAllBox));
    } else {
      this._selectAllBox = null;
    }
    for (const column of this.visibleColumns) {
      const col = h("col", { style: { width: column.width ? `${column.width}px` : null, minWidth: `${column.minWidth}px` } });
      this._colgroup.append(col);
      const sortIndex = this._sort.findIndex((s) => s.field === column.field);
      const sort = this._sort[sortIndex];
      const filtered = isFilterActive(this._filters[column.field]);
      const th = h(
        "th",
        {
          class: ["ig-th", `ig-align-${column.align}`, column.sortable ? "ig-sortable" : "", sort ? "ig-sorted" : "", column.headerClass ?? ""].join(" ").trim(),
          dataset: { field: column.field },
          scope: "col",
          "aria-sort": sort ? sort.dir === "asc" ? "ascending" : "descending" : null,
          title: column.tooltip ?? null
        },
        h(
          "div",
          { class: "ig-th-inner" },
          h("span", { class: "ig-th-title", text: column.title }),
          sort ? h("span", { class: "ig-sort-indicator", text: sort.dir === "asc" ? "\u25B2" : "\u25BC" }, multi ? h("sup", { text: sortIndex + 1 }) : null) : null,
          column.filterable ? h("button", {
            type: "button",
            class: `ig-filter-btn${filtered ? " ig-active" : ""}`,
            "aria-label": `${this.t("filter")} ${column.title}`,
            text: filtered ? "\u29E9" : "\u25BE",
            onclick: (e) => {
              e.stopPropagation();
              openFilterMenu(this, column, e.currentTarget);
            }
          }) : null
        ),
        column.resizable ? h("span", { class: "ig-resize", onpointerdown: (e) => this._startResize(e, column, col) }) : null
      );
      th.addEventListener("click", (e) => {
        if (targetOf(e)?.closest(".ig-filter-btn, .ig-resize")) return;
        const additive = this.options.sort.mode === "toggle" || e.shiftKey || e.ctrlKey || e.metaKey;
        this.toggleSort(column.field, additive);
      });
      tr.append(th);
    }
    this._thead.append(tr);
  }
  _startResize(event, column, col) {
    event.preventDefault();
    event.stopPropagation();
    const th = targetOf(event)?.closest("th");
    if (!th) return;
    const start = event.clientX;
    const initial = th.getBoundingClientRect().width;
    const move = (e) => {
      column.width = Math.max(column.minWidth, Math.round(initial + e.clientX - start));
      col.style.width = `${column.width}px`;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      this.emit("columnResize", { field: column.field, width: column.width });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  _renderBody() {
    clear(this._tbody);
    const target = Math.max(this._rendered, Math.min(this.options.renderChunk, this._view.length));
    this._rendered = 0;
    this._renderRows(target);
    this._showMessage(this._view.length || this._append?.loading ? null : this.t("noRows"));
    this._syncSelectAll();
  }
  _renderMore() {
    this._renderRows(this._rendered + this.options.renderChunk);
    this._showMessage(this._view.length ? null : this.t("noRows"));
    this._syncSelectAll();
  }
  _renderRows(upTo) {
    const end = Math.min(upTo, this._view.length);
    const fragment = document.createDocumentFragment();
    for (let i = this._rendered; i < end; i++) fragment.append(this._createRow(this._view[i]));
    this._tbody.append(fragment);
    this._rendered = end;
  }
  _rowClasses(row, changed) {
    const classes = ["ig-row"];
    if (this._selected.has(row._id)) classes.push("ig-selected");
    if (this._tracker?.isInserted(row._id)) classes.push("ig-row-inserted");
    else if (Object.keys(changed).length) classes.push("ig-row-updated");
    if (typeof this.options.rowClass === "function") classes.push(this.options.rowClass(this._publicRow(row)) ?? "");
    return classes;
  }
  _createRow(row) {
    const tr = h("tr", { dataset: { id: row._id }, "aria-selected": String(this._selected.has(row._id)) });
    const changed = this._tracker ? this._tracker.changedFields(row._id, this._readers) : {};
    tr.className = this._rowClasses(row, changed).join(" ").trim();
    this._applyFormats(tr, this.options.rowFormats, row);
    if (this.selectionMode !== "none" && this.options.selection.checkbox) {
      tr.append(h("td", { class: "ig-select-cell" }, h("input", {
        type: this.selectionMode === "single" ? "radio" : "checkbox",
        tabindex: "-1",
        checked: this._selected.has(row._id),
        "aria-label": "select"
      })));
    }
    for (const column of this.visibleColumns) tr.append(this._createCell(row, column, changed[column.field]));
    return tr;
  }
  _isEditable(column, row) {
    if (!column) return false;
    if (typeof column.editable === "function") return !!column.editable(this._publicRow(row), column);
    return !!column.editable;
  }
  _createCell(row, column, change) {
    const value = row[column.field];
    const td = h("td", { dataset: { field: column.field }, role: "gridcell" });
    const classes = ["ig-cell", `ig-align-${column.align}`, `ig-type-${column.type}`];
    const formula = this.calc.formulaFor(row._id, column.field);
    const invalid = this._invalid.get(`${row._id}\0${column.field}`);
    if (formula) classes.push("ig-formula");
    if (isErrorCode(value)) classes.push("ig-error");
    if (invalid) classes.push("ig-invalid");
    if (change) classes.push("ig-cell-changed");
    if (!this._isEditable(column, row)) classes.push("ig-readonly");
    if (NUMERIC_TYPES.has(column.type) && typeof value === "number" && value < 0) classes.push("ig-negative");
    if (this._active && this._active.id === row._id && this._active.field === column.field) classes.push("ig-active");
    if (typeof column.cellClass === "function") classes.push(column.cellClass(value, this._publicRow(row), column) ?? "");
    else if (column.cellClass) classes.push(column.cellClass);
    td.className = classes.join(" ").trim();
    if (invalid) td.title = invalid;
    else if (formula) td.title = formula;
    else if (change) td.title = this.t("was", { value: change.from === null || change.from === "" ? this.t("blanks") : String(change.from) });
    const formatted = formatCell(value, column, row, this.locale);
    if (typeof column.render === "function") {
      const output = column.render(value, this._publicRow(row), { column, grid: this, formatted });
      if (output instanceof Node) td.append(output);
      else if (column.html) td.innerHTML = output ?? "";
      else td.textContent = output ?? "";
    } else if (column.type === "boolean" && !isErrorCode(value) && !formula) {
      td.append(h("input", {
        type: "checkbox",
        class: "ig-cell-checkbox",
        tabindex: "-1",
        checked: value === true,
        disabled: !this._isEditable(column, row)
      }));
    } else {
      td.textContent = formatted;
    }
    this._applyFormats(td, column.conditionalFormats, row, value);
    return td;
  }
  /**
   * Conditional formats: [{formula: '=[@total] > 1000', className, style}] or [{when(value, row), ...}]
   */
  _applyFormats(element, formats, row, value) {
    for (const format of formats ?? []) {
      let hit = false;
      if (typeof format.when === "function") hit = !!format.when(value, this._publicRow(row));
      else if (format.formula) hit = this.calc.evaluate(format.formula, this.store.get(row._id) ?? row) === true;
      if (!hit) continue;
      if (format.className) element.classList.add(...format.className.split(/\s+/).filter(Boolean));
      if (format.style) Object.assign(element.style, format.style);
    }
  }
  /**
   * Updates view rows from the store without re-sorting (like Excel, edited rows stay in place).
   * @param array|null ids null = every row
   */
  _syncRows(ids) {
    const targets = ids ? new Set(ids) : null;
    this._view.forEach((row, i) => {
      if (targets && !targets.has(row._id)) return;
      const fresh = this.store.get(row._id);
      if (!fresh) return;
      this._view[i] = { ...fresh };
      if (i >= this._rendered) return;
      const tr = this._tbody.children[i];
      if (!tr || this._editing && this._editing.id === row._id) return;
      tr.replaceWith(this._createRow(this._view[i]));
    });
    if (!ids) {
      this._rendered = Math.min(this._rendered, this._view.length);
      while (this._tbody.rows.length > this._rendered) this._tbody.lastElementChild?.remove();
      this._showMessage(this._view.length ? null : this.t("noRows"));
    }
    this._renderFooter();
    this._renderNavbar();
  }
  _renderFooter() {
    clear(this._tfoot);
    const columns = this.visibleColumns;
    if (!columns.some((c) => c.footer)) return;
    const tr = h("tr", { class: "ig-footer" });
    if (this.selectionMode !== "none" && this.options.selection.checkbox) tr.append(h("td", { class: "ig-select-cell" }));
    for (const column of columns) {
      if (!column.footer) {
        tr.append(h("td"));
        continue;
      }
      const value = this._footerValue(column);
      const shortcut = typeof column.footer === "string" && /^count/i.test(column.footer);
      const text = shortcut ? formatCell(value, { type: "integer", decimals: 0 }, {}, this.locale) : formatCell(value, column, {}, this.locale);
      tr.append(h("td", {
        class: `ig-cell ig-align-${column.align}${isErrorCode(value) ? " ig-error" : ""}`,
        title: this._footerFormula(column) ?? null,
        text: column.type === "boolean" && !isErrorCode(value) ? String(value ?? "") : text
      }));
    }
    this._tfoot.append(tr);
  }
  _renderNavbar() {
    if (this.options.statusBar) {
      const total = this._append?.total ?? this.store.count();
      const parts = [this.t("status", { shown: this._view.length, total })];
      if (this._selected.size) parts.push(this.t("selected", { count: this._selected.size }));
      this._status.textContent = parts.join(" \xB7 ");
    }
    const config = this.options.navbar;
    if (!config) return;
    const left = h("div", { class: "ig-navbar-group" });
    const right = h("div", { class: "ig-navbar-group ig-navbar-right" });
    if (config.title) left.append(h("strong", { class: "ig-title", text: config.title }));
    if (config.search) {
      if (!this._searchInput) {
        let timer;
        this._searchInput = h("input", { class: "ig-input ig-search", type: "search", placeholder: this.t("search"), "aria-label": this.t("search") });
        this._searchInput.addEventListener("input", () => {
          clearTimeout(timer);
          timer = setTimeout(() => this.setSearch(this._searchInput?.value ?? ""), 200);
        });
      }
      left.append(this._searchInput);
    }
    if (config.filters) {
      for (const [field, filter] of Object.entries(this._filters)) {
        const column = this.getColumn(field);
        if (!column) continue;
        left.append(h(
          "span",
          { class: "ig-chip" },
          h("span", { text: `${column.title}: ${this._describeFilter(filter, column)}` }),
          h("button", { type: "button", class: "ig-chip-remove", "aria-label": this.t("clear"), text: "\xD7", onclick: () => this.setFilter(field, null) })
        ));
      }
      if (Object.keys(this._filters).length || this._search) {
        left.append(h("button", { type: "button", class: "ig-btn ig-btn-link", text: this.t("clearFilters"), onclick: () => this.clearFilters() }));
      }
    }
    const button = (item) => h("button", {
      type: "button",
      class: `ig-btn ${item.className ?? ""}`.trim(),
      title: item.title ?? null,
      disabled: typeof item.disabled === "function" ? item.disabled(this) : !!item.disabled,
      text: item.label,
      onclick: (e) => item.onClick(this, e)
    });
    for (const item of config.items ?? []) (item.position === "left" ? left : right).append(button(item));
    if (config.add) right.append(button({ label: this.t("addRow"), onClick: () => this.addRow(typeof config.add === "function" ? config.add(this) : {}) }));
    if (config.delete && this.selectionMode !== "none") {
      right.append(button({
        label: this.t("deleteRows"),
        className: "ig-btn-danger",
        disabled: !this._selected.size,
        onClick: async () => {
          const ids = this.getSelectedIds();
          if (this.options.confirmDelete && !await this.confirm({
            action: "delete",
            title: this.t("deleteTitle"),
            message: this.t("confirmDelete", { count: ids.length }),
            confirmLabel: this.t("deleteRows"),
            danger: true
          })) return;
          this.deleteRows(ids);
        }
      }));
    }
    if (config.changes && this._tracker) {
      const summary = this.getChangeSummary();
      if (summary.total) {
        right.append(h("span", {
          class: "ig-changes-badge",
          title: this.t("changesDetail", summary),
          text: this.t("changesCount", { count: summary.total })
        }));
        right.append(button({
          label: this.t("discardChanges"),
          onClick: async () => {
            if (this.options.confirmDelete && !await this.confirm({
              action: "discard",
              title: this.t("discardChanges"),
              message: this.t("confirmDiscard", { count: summary.total }),
              confirmLabel: this.t("discard"),
              danger: true
            })) return;
            this.rejectChanges();
          }
        }));
      }
    }
    if (config.columns) {
      right.append(h("button", {
        type: "button",
        class: "ig-btn ig-columns-btn",
        text: this.t("columns"),
        onclick: (e) => this._openColumnsMenu(e.currentTarget)
      }));
    }
    const exports = config.export === true ? ["csv", "xlsx"] : config.export || [];
    if (exports.includes("csv")) right.append(button({ label: this.t("exportCsv"), onClick: () => this.exportCSV() }));
    if (exports.includes("xlsx")) right.append(button({ label: this.t("exportXlsx"), onClick: () => this.exportXLSX() }));
    const search = this._searchInput;
    const caret = search && document.activeElement === search ? search.selectionStart : null;
    this._navbar.replaceChildren(left, right);
    if (search && caret !== null) {
      search.focus();
      search.setSelectionRange(caret, caret);
    }
  }
  _describeFilter(filter, column) {
    const parts = [];
    if (Array.isArray(filter.values)) parts.push(filter.values.length === 1 ? formatCell(filter.values[0], column, {}, this.locale) || this.t("blanks") : `${filter.values.length} \u2713`);
    for (const condition of filter.conditions ?? []) {
      const value = condition.op === "empty" || condition.op === "notEmpty" ? "" : ` ${condition.value}${condition.op === "between" ? `\u2013${condition.value2}` : ""}`;
      parts.push(`${this.t(`op_${condition.op}`)}${value}`);
    }
    if (filter.formula) parts.push(filter.formula);
    if (filter.test) parts.push("\u0192");
    return parts.join(filter.join === "or" ? ` ${this.t("or")} ` : ", ");
  }
  _openColumnsMenu(anchor) {
    this.closePopover();
    const menu = h(
      "div",
      { class: "ig-popover ig-columns-menu" },
      this.columns.map((column) => h(
        "label",
        { class: "ig-value" },
        h("input", { type: "checkbox", checked: column.visible, onchange: (e) => this.setColumnVisible(column.field, e.target.checked) }),
        h("span", { text: column.title })
      ))
    );
    this.showPopover(menu, anchor);
  }
  /** @internal */
  showPopover(element, anchor) {
    this._popover = element;
    this.root.append(element);
    const rootBox = this.root.getBoundingClientRect();
    const box = anchor.getBoundingClientRect();
    const left = Math.min(box.left - rootBox.left, Math.max(0, rootBox.width - element.offsetWidth - 4));
    element.style.left = `${Math.max(0, left)}px`;
    element.style.top = `${box.bottom - rootBox.top + 4}px`;
    element.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.closePopover();
        anchor.focus();
      }
    });
    element.querySelector("input, select, button")?.focus();
  }
  /** @internal */
  closePopover() {
    this._popover?.remove();
    this._popover = null;
  }
  _showMessage(text) {
    this._message.hidden = !text;
    this._message.textContent = text ?? "";
  }
  _setLoading(loading) {
    this._loading.hidden = !loading;
    this.root.classList.toggle("ig-is-loading", loading);
    if (loading) this._showMessage(null);
  }
  /* ---------------------------------------------------------------- active cell & keyboard */
  _cellElement(id, field) {
    const index = this._view.findIndex((r) => r._id === id);
    if (index === -1 || index >= this._rendered) return null;
    return this._tbody.children[index]?.querySelector(`td[data-field="${CSS.escape(field)}"]`) ?? null;
  }
  _setActive(id, field) {
    this._tbody.querySelector(".ig-active")?.classList.remove("ig-active");
    this._active = { id, field };
    const td = this._cellElement(id, field);
    if (td) {
      td.classList.add("ig-active");
      td.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    }
    this.emit("activeCellChange", { id, field });
  }
  _move(rowDelta, columnDelta) {
    const columns = this.visibleColumns;
    const active = this._active;
    if (!active) {
      const first = this._view[0];
      if (first && columns[0]) this._setActive(first._id, columns[0].field);
      return;
    }
    let rowIndex = this._view.findIndex((r) => r._id === active.id);
    let columnIndex = columns.findIndex((c) => c.field === active.field);
    columnIndex += columnDelta;
    if (columnIndex >= columns.length) {
      columnIndex = 0;
      rowIndex++;
    } else if (columnIndex < 0) {
      columnIndex = columns.length - 1;
      rowIndex--;
    }
    rowIndex = Math.max(0, Math.min(this._view.length - 1, rowIndex + rowDelta));
    if (rowIndex >= this._rendered) this._renderRows(rowIndex + this.options.renderChunk);
    const row = this._view[rowIndex];
    const column = columns[columnIndex];
    if (row && column) this._setActive(row._id, column.field);
  }
  _onKeyDown(e) {
    if (this._editing || targetOf(e)?.closest(".ig-popover") || e.target !== this._scroller) return;
    const active = this._active;
    const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      this._move(...move);
      if (e.shiftKey && this._active && this.selectionMode === "multiple") this._clickSelect(this._active.id, { shiftKey: true });
      return;
    }
    if (e.key === "Tab" && active) {
      e.preventDefault();
      this._move(0, e.shiftKey ? -1 : 1);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a" && this.selectionMode === "multiple") {
      e.preventDefault();
      this.selectAll();
      return;
    }
    if (!active) return;
    if (e.key === "Enter" || e.key === "F2") {
      e.preventDefault();
      this.startEdit(active.id, active.field);
    } else if (e.key === " " && this.selectionMode !== "none") {
      e.preventDefault();
      this._clickSelect(active.id, { ctrlKey: true, target: e.target });
    } else if (e.key === "Delete" || e.key === "Backspace") {
      const column = this.getColumn(active.field);
      if (this._isEditable(column, this.store.get(active.id))) {
        e.preventDefault();
        this.setCellValue(active.id, active.field, null, { source: "edit" });
      }
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (this.startEdit(active.id, active.field, e.key)) e.preventDefault();
    }
  }
  /* ---------------------------------------------------------------- editing */
  /**
   * @param string id
   * @param string field
   * @param string|null initialText replaces the content (typing on a selected cell)
   * @return boolean
   */
  startEdit(id, field, initialText = null) {
    const column = this.getColumn(field);
    const data = this.store.get(id);
    if (!column || !data || !this._isEditable(column, data)) return false;
    this._closeEditor(true);
    if (this._editing) return false;
    const td = this._cellElement(id, field);
    if (!td) return false;
    const formula = this.calc.cellFormulas.get(id)?.[field] || null;
    const value = data[field];
    const event = this.emit("beforeCellEdit", { id, field, value, row: this._publicRow(data), column });
    if (event.defaultPrevented) return false;
    const editorDefinition = resolveEditor(column, !!formula || initialText === "=" && column.allowFormulas);
    const text = initialText ?? formula ?? editorText(value, column, this.locale);
    const editor = editorDefinition.create({
      value,
      text,
      column,
      row: this._publicRow(data),
      grid: this,
      t: this.t,
      commit: () => this._closeEditor(true),
      cancel: () => this._closeEditor(false)
    });
    this._active = { id, field };
    this._editing = { id, field, td, editor, column };
    clear(td);
    td.classList.add("ig-editing", "ig-active");
    td.append(editor.element);
    editor.focus?.();
    const input = editor.element;
    if (initialText !== null && (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) && input.type !== "checkbox") {
      const end = input.value.length;
      input.setSelectionRange(end, end);
    }
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        this._closeEditor(false);
        this._scroller.focus();
      } else if (e.key === "Enter" && !(input instanceof HTMLTextAreaElement && (e.shiftKey || e.altKey))) {
        e.preventDefault();
        if (this._closeEditor(true)) {
          this._scroller.focus();
          this._move(e.shiftKey ? -1 : 1, 0);
        }
      } else if (e.key === "Tab") {
        e.preventDefault();
        if (this._closeEditor(true)) {
          this._scroller.focus();
          this._move(0, e.shiftKey ? -1 : 1);
        }
      }
    });
    input.addEventListener("blur", () => setTimeout(() => {
      if (this._editing?.editor === editor && !td.contains(document.activeElement)) this._closeEditor(true);
    }, 0));
    if (input instanceof HTMLInputElement && input.type === "checkbox" || input instanceof HTMLSelectElement) {
      input.addEventListener("change", () => this._closeEditor(true));
    }
    this.emit("cellEditStart", { id, field, value, row: this._publicRow(data), column });
    return true;
  }
  /**
   * @param boolean commit
   * @return boolean false when the value was rejected (the editor stays open)
   */
  _closeEditor(commit) {
    const editing = this._editing;
    if (!editing) return true;
    const { id, field, td, editor, column } = editing;
    if (commit) {
      const raw = editor.getValue();
      const before = this.calc.cellFormulas.get(id)?.[field] || editorText(this.store.get(id)?.[field], column, this.locale);
      if (raw !== before) {
        this._editing = null;
        const result = this.setCellValue(id, field, raw, { source: "edit" });
        if (!result.ok && result.error !== "cancelled") {
          this._editing = editing;
          td.classList.add("ig-invalid");
          td.title = result.error ?? "";
          editor.focus?.();
          return false;
        }
      }
    } else {
      this._invalid.delete(`${id}\0${field}`);
      this.emit("cellEditCancel", { id, field });
    }
    this._editing = null;
    editor.destroy?.();
    const index = this._view.findIndex((r) => r._id === id);
    const row = index === -1 ? null : this._view[index];
    if (row && td.isConnected) {
      const fresh = this.store.get(id) ?? row;
      this._view[index] = { ...fresh };
      td.parentElement?.replaceWith(this._createRow(this._view[index]));
    }
    return true;
  }
  /* ---------------------------------------------------------------- clipboard */
  _onCopy(e) {
    if (this._editing) return;
    const columns = this.visibleColumns;
    let text;
    if (this._selected.size > 1 || this._selected.size && !this._active) {
      const rows = this._view.filter((r) => this._selected.has(r._id));
      text = toCSV(rows, columns, { delimiter: "	", header: false, sanitize: false, formatted: true, lineBreak: "\n", format: (v, c, r) => formatCell(v, c, r, this.locale) });
    } else if (this._active) {
      const row = this.store.get(this._active.id);
      const column = this.getColumn(this._active.field);
      if (!row || !column) return;
      text = formatCell(row[this._active.field], column, row, this.locale);
    } else {
      return;
    }
    e.preventDefault();
    e.clipboardData?.setData("text/plain", text);
    this.emit("copy", { text });
  }
  /**
   * Pastes tab separated text from the active cell, through the normal edit pipeline.
   */
  _onPaste(e) {
    const active = this._active;
    if (this._editing || !active) return;
    const text = e.clipboardData?.getData("text/plain");
    if (!text) return;
    e.preventDefault();
    const lines = text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n").map((line) => line.split("	"));
    const columns = this.visibleColumns;
    const startRow = this._view.findIndex((r) => r._id === active.id);
    const startColumn = columns.findIndex((c) => c.field === active.field);
    const results = [];
    lines.forEach((cells, r) => {
      const row = this._view[startRow + r];
      if (!row) return;
      cells.forEach((value, c) => {
        const column = columns[startColumn + c];
        if (!column || !this._isEditable(column, this.store.get(row._id))) return;
        results.push({ id: row._id, field: column.field, ...this.setCellValue(row._id, column.field, value, { source: "paste" }) });
      });
    });
    this.emit("paste", { text, results });
  }
  /* ---------------------------------------------------------------- lifecycle */
  destroy() {
    this._observer?.disconnect();
    if (this._onDocumentPointer) document.removeEventListener("pointerdown", this._onDocumentPointer);
    this.closePopover();
    this.root.remove();
    this.store.clear();
    this.emit("destroy", {});
    this.events = new Emitter(this);
  }
};
export {
  CalcEngine,
  ChangeTracker,
  ERRORS,
  FormulaError,
  IntelligentGrid,
  SorlaStore,
  TYPES,
  collectDependencies,
  compareCells,
  compile,
  compileFilters,
  IntelligentGrid as default,
  defineFunction,
  defineLazyFunction,
  evaluate,
  excelFormatCode,
  formatCell,
  formatValue,
  isFormula,
  listFunctions,
  operatorsFor,
  parse,
  parseInput,
  toCSV,
  toExcelFormula,
  toXLSX,
  validateValue,
  zip
};
//# sourceMappingURL=index.js.map
