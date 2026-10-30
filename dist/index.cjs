/*! Intelligent Grid v0.1.0 | MIT | https://github.com/sysborg */
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  CalcEngine: () => CalcEngine,
  ChangeTracker: () => ChangeTracker,
  ERRORS: () => ERRORS,
  FormulaError: () => FormulaError,
  ICON_SETS: () => ICON_SETS,
  IntelligentGrid: () => IntelligentGrid,
  RowLayout: () => RowLayout,
  SorlaStore: () => SorlaStore,
  TYPES: () => TYPES,
  UndoStack: () => UndoStack,
  collectDependencies: () => collectDependencies,
  columnStats: () => columnStats,
  columnWindow: () => columnWindow,
  compareCells: () => compareCells,
  compile: () => compile,
  compileFilters: () => compileFilters,
  compileQuery: () => compileQuery,
  default: () => IntelligentGrid,
  defineFunction: () => defineFunction,
  defineLazyFunction: () => defineLazyFunction,
  describeQuery: () => describeQuery,
  detectDelimiter: () => detectDelimiter,
  evaluate: () => evaluate,
  excelFormatCode: () => excelFormatCode,
  fillSeries: () => fillSeries,
  fillSeriesBackward: () => fillSeriesBackward,
  formatCell: () => formatCell,
  formatValue: () => formatValue,
  fromSorlaQuery: () => fromSorlaQuery,
  iconFor: () => iconFor,
  isFormula: () => isFormula,
  listFunctions: () => listFunctions,
  normalizeQuery: () => normalizeQuery,
  operatorsFor: () => operatorsFor,
  parse: () => parse,
  parseDelimited: () => parseDelimited,
  parseInput: () => parseInput,
  readXlsx: () => readXlsx,
  scaleColor: () => scaleColor,
  sparkline: () => sparkline,
  sparklineValues: () => sparklineValues,
  toCSV: () => toCSV,
  toExcelFormula: () => toExcelFormula,
  toSorlaQuery: () => toSorlaQuery,
  toXLSX: () => toXLSX,
  validateValue: () => validateValue,
  zip: () => zip
});
module.exports = __toCommonJS(index_exports);

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
  // stored documents by _id, for synchronous reads of the live data (formulas, rendering)
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
    return data;
  }
  /**
   * Inserts rows (copied, the caller objects are never mutated).
   * @return ids
   */
  insert(rows) {
    if (!rows.length) return [];
    const collection = this.collection;
    const start = collection.all.length;
    collection.insertMany(rows.map((row) => this.prepare(row)));
    return collection.all.slice(start).map((doc) => {
      const id = String(doc._data._id);
      this.byId.set(id, doc);
      return id;
    });
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
   * Writes values with updateOne() by _id: indexed, validated by a collection schema, and seen by
   * other code that listens to the collection (watch(), events).
   * @return previous values of the changed fields
   */
  update(id, patch) {
    const data = this.get(id);
    if (!data) throw new Error(`Row "${id}" not found`);
    const previous = {};
    const set = {};
    for (const [field, value] of Object.entries(patch)) {
      if (field === "_id") continue;
      previous[field] = data[field];
      set[field] = encodeValue(value);
    }
    if (!Object.keys(set).length) return previous;
    this.collection.updateOne({ _id: id }, { $set: set });
    this.refresh(id);
    return previous;
  }
  /**
   * Writes a calculated value. SorlaDB: written on the document data, without updateOne(): formula
   * recalculation writes one value per row of a column (100 000 for a column), where updateOne()
   * would copy each document and cost about 2 ms per 1 000 rows. Calculated values are derived from
   * the other fields, so no change event is emitted for them.
   */
  writeCalculated(data, field, value) {
    data[field] = value;
  }
  /**
   * SorlaDB: updateOne() stores a new object for the document (stored data is never changed in
   * place), so the id map points to the new one. find({_id}) uses the collection index.
   */
  refresh(id) {
    const [doc] = this.collection.find({ _id: id })._data;
    if (doc) this.byId.set(id, doc);
  }
  /**
   * @return removed rows data, in collection order
   */
  remove(ids) {
    const targets = new Set(ids.filter((id) => this.byId.has(id)));
    if (!targets.size) return [];
    const removed = this.collection.all.filter((doc) => targets.has(doc._data._id)).map((doc) => doc._data);
    this.collection.deleteMany({ _id: { $in: [...targets] } });
    for (const id of targets) this.byId.delete(id);
    return removed;
  }
  clear() {
    this.collection.deleteMany({});
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
    let rows = this.collection.find(query).ids().map((id) => this.byId.get(String(id))._data);
    if (predicates.length) rows = rows.filter((row) => predicates.every((test) => test(row)));
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
  /**
   * @return whether the row had been inserted in this session (undo needs it to restore it)
   */
  recordDelete(id, data, formulas, source = "api") {
    const wasInserted = this.inserted.has(id);
    if (wasInserted) {
      this.inserted.delete(id);
    } else {
      this.deleted.set(id, this.originals.get(id) ?? { data: { ...data }, formulas: formulas ? { ...formulas } : void 0 });
    }
    this.originals.delete(id);
    this.log({ type: "delete", id, source });
    return wasInserted;
  }
  /**
   * Undo of a delete: the row is tracked again as before (inserted, or compared with its original).
   */
  restoreDeleted(id, wasInserted, source = "undo") {
    if (wasInserted) {
      this.inserted.add(id);
    } else {
      const snapshot = this.deleted.get(id);
      this.deleted.delete(id);
      if (snapshot) this.originals.set(id, snapshot);
    }
    this.log({ type: "insert", id, source });
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
  /**
   * A value that came from the server becomes the original of a field, so it is not reported as
   * a change of the user (rows without tracked state are not affected).
   */
  rebase(id, field, value) {
    const original = this.originals.get(id);
    if (original) original.data[field] = value;
  }
};
function sameValue(a, b) {
  if (a === b) return true;
  if ((a === null || a === void 0 || a === "") && (b === null || b === void 0 || b === "")) return true;
  return typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b);
}

// src/core/undo.ts
var UndoStack = class {
  limit;
  undoSteps = [];
  redoSteps = [];
  open = null;
  depth = 0;
  constructor(limit = 100) {
    this.limit = limit;
  }
  get canUndo() {
    return this.undoSteps.length > 0;
  }
  get canRedo() {
    return this.redoSteps.length > 0;
  }
  /** Label of the step Ctrl+Z would undo. */
  get undoLabel() {
    return this.undoSteps.at(-1)?.label ?? null;
  }
  get redoLabel() {
    return this.redoSteps.at(-1)?.label ?? null;
  }
  /** Starts (or joins) a step; nested calls end up in the outermost one. */
  begin(label) {
    if (this.depth++ === 0) this.open = { label, changes: [] };
  }
  end() {
    if (this.depth === 0) return;
    if (--this.depth > 0) return;
    const step = this.open;
    this.open = null;
    if (step && step.changes.length) this.push(step);
  }
  record(change) {
    if (this.open) this.open.changes.push(change);
    else this.push({ label: change.kind === "cell" ? "edit" : change.kind, changes: [change] });
  }
  push(step) {
    this.undoSteps.push(step);
    if (this.undoSteps.length > this.limit) this.undoSteps.splice(0, this.undoSteps.length - this.limit);
    this.redoSteps = [];
  }
  takeUndo() {
    const step = this.undoSteps.pop();
    if (step) this.redoSteps.push(step);
    return step;
  }
  takeRedo() {
    const step = this.redoSteps.pop();
    if (step) this.undoSteps.push(step);
    return step;
  }
  clear() {
    this.undoSteps = [];
    this.redoSteps = [];
    this.open = null;
    this.depth = 0;
  }
};

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

// src/core/fill.ts
var TRAILING_NUMBER = /^(.*?)(\d+)$/;
var isNumber = (value) => typeof value === "number" && Number.isFinite(value);
function stepOf(values) {
  if (values.length < 2) return null;
  const step = values[1] - values[0];
  for (let i = 2; i < values.length; i++) {
    if (Math.abs(values[i] - values[i - 1] - step) > 1e-9) return null;
  }
  return step;
}
function fillSeries(source, count, type = "text") {
  if (!source.length || count <= 0) return [];
  const repeat = () => Array.from({ length: count }, (_, i) => source[i % source.length]);
  if (DATE_TYPES.has(type) && source.every((v) => typeof v === "string" && toSerial(v) !== null)) {
    const serials = source.map((v) => toSerial(v));
    const step = source.length === 1 ? 1 : stepOf(serials);
    if (step === null) return repeat();
    const last = serials.at(-1);
    return Array.from({ length: count }, (_, i) => serialToISO(last + step * (i + 1), type === "datetime"));
  }
  if (source.every(isNumber)) {
    const step = stepOf(source);
    if (step === null) return repeat();
    const last = source.at(-1);
    return Array.from({ length: count }, (_, i) => Number((last + step * (i + 1)).toPrecision(12)));
  }
  if (source.every((v) => typeof v === "string" && TRAILING_NUMBER.test(v))) {
    const parts = source.map((v) => TRAILING_NUMBER.exec(v));
    const prefix = parts[0][1];
    if (parts.every((p) => p[1] === prefix)) {
      const numbers2 = parts.map((p) => Number(p[2]));
      const step = numbers2.length === 1 ? 1 : stepOf(numbers2);
      if (step !== null) {
        const width = parts[0][2].length;
        const last = numbers2.at(-1);
        return Array.from({ length: count }, (_, i) => {
          const n = last + step * (i + 1);
          return n < 0 ? `${prefix}${n}` : `${prefix}${String(n).padStart(width, "0")}`;
        });
      }
    }
  }
  return repeat();
}
function fillSeriesBackward(source, count, type = "text") {
  return fillSeries([...source].reverse(), count, type).reverse();
}

// src/import/delimited.ts
function detectDelimiter(text) {
  const line = text.slice(0, text.search(/\r?\n|$/));
  let best = ",";
  let bestCount = 0;
  for (const candidate of [",", ";", "	"]) {
    let count = 0;
    let quoted = false;
    for (const char of line) {
      if (char === '"') quoted = !quoted;
      else if (char === candidate && !quoted) count++;
    }
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}
function parseDelimited(text, delimiter = detectDelimiter(text)) {
  if (text.charCodeAt(0) === 65279) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = "";
  let i = 0;
  const length = text.length;
  while (i < length) {
    const char = text[i];
    if (char === '"' && field === "") {
      i++;
      while (i < length) {
        if (text[i] === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          i++;
          break;
        }
        field += text[i];
        i++;
      }
      continue;
    }
    if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (char === "\r" && text[i + 1] === "\n") i++;
    } else {
      field += char;
    }
    i++;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// src/import/unzip.ts
var decoder = new TextDecoder();
function listZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65558); i--) {
    if (view.getUint32(i, true) === 101010256) {
      end = i;
      break;
    }
  }
  if (end === -1) throw new Error("Not a zip file");
  const count = view.getUint16(end + 10, true);
  let position = view.getUint32(end + 16, true);
  const entries = /* @__PURE__ */ new Map();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(position, true) !== 33639248) throw new Error("Broken zip directory");
    const method = view.getUint16(position + 10, true);
    const compressedSize = view.getUint32(position + 20, true);
    const nameLength = view.getUint16(position + 28, true);
    const extraLength = view.getUint16(position + 30, true);
    const commentLength = view.getUint16(position + 32, true);
    const offset = view.getUint32(position + 42, true);
    const name = decoder.decode(bytes.subarray(position + 46, position + 46 + nameLength));
    entries.set(name, { name, method, compressedSize, offset });
    position += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
async function readZipText(bytes, entry) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(entry.offset, true) !== 67324752) throw new Error(`Broken zip entry ${entry.name}`);
  const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
  const data = bytes.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return decoder.decode(data);
  if (entry.method !== 8) throw new Error(`Unsupported zip compression ${entry.method}`);
  if (typeof DecompressionStream === "undefined") throw new Error("Reading .xlsx needs DecompressionStream (a current browser or Node 18+)");
  const source = new ReadableStream({
    start(controller) {
      controller.enqueue(data.slice());
      controller.close();
    }
  });
  return new Response(source.pipeThrough(new DecompressionStream("deflate-raw"))).text();
}

// src/import/xlsx-read.ts
var ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
var unescapeXml = (text) => text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, code) => {
  if (code[0] === "#") return String.fromCodePoint(code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : Number(code.slice(1)));
  return ENTITIES[code] ?? match;
});
var attribute = (tag, name) => {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return match ? unescapeXml(match[1]) : null;
};
function textOf(fragment) {
  let text = "";
  for (const match of fragment.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g)) text += unescapeXml(match[1] ?? "");
  return text;
}
function columnIndex(reference) {
  let index = 0;
  for (const char of reference) {
    const code = char.charCodeAt(0);
    if (code < 65 || code > 90) break;
    index = index * 26 + code - 64;
  }
  return index - 1;
}
var DATE_FORMAT_IDS = /* @__PURE__ */ new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
function isDateFormat2(code) {
  const bare = code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, "");
  return /[dmyhs]/i.test(bare) && !/^[#0.,%\s]*$/.test(bare);
}
function dateStyles(styles) {
  const custom = /* @__PURE__ */ new Map();
  for (const match of styles.matchAll(/<numFmt\b[^>]*>/g)) {
    custom.set(Number(attribute(match[0], "numFmtId")), attribute(match[0], "formatCode") ?? "");
  }
  const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? "";
  return [...xfs.matchAll(/<xf\b[^>]*>/g)].map((match) => {
    const id = Number(attribute(match[0], "numFmtId") ?? 0);
    const code = custom.get(id);
    const isDate = code !== void 0 ? isDateFormat2(code) : DATE_FORMAT_IDS.has(id);
    if (!isDate) return null;
    const withTime = code !== void 0 ? /[hs]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]/g, "")) : id === 22 || id >= 18 && id <= 21 || id >= 45;
    return withTime ? "datetime" : "date";
  });
}
async function readXlsx(input, { sheet = 0 } = {}) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const entries = listZip(bytes);
  const read = async (name) => {
    const entry = entries.get(name);
    return entry ? readZipText(bytes, entry) : null;
  };
  const workbook = await read("xl/workbook.xml");
  if (!workbook) throw new Error("Not an .xlsx file (xl/workbook.xml is missing)");
  const relations = await read("xl/_rels/workbook.xml.rels") ?? "";
  const targets = new Map([...relations.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attribute(m[0], "Id"), attribute(m[0], "Target")]));
  const sheets = [...workbook.matchAll(/<sheet\b[^>]*>/g)].map((m) => ({ name: attribute(m[0], "name") ?? "", target: targets.get(attribute(m[0], "r:id")) ?? null }));
  const chosen = typeof sheet === "number" ? sheets[sheet] : sheets.find((s) => s.name === sheet);
  if (!chosen?.target) throw new Error(`Sheet ${JSON.stringify(sheet)} not found`);
  const path = chosen.target.startsWith("/") ? chosen.target.slice(1) : `xl/${chosen.target.replace(/^\.\//, "")}`;
  const date1904 = /<workbookPr\b[^>]*\sdate1904="(1|true)"/.test(workbook);
  const shared = [...(await read("xl/sharedStrings.xml") ?? "").matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const styles = dateStyles(await read("xl/styles.xml") ?? "");
  const xml2 = await read(path);
  if (xml2 === null) throw new Error(`Sheet file ${path} is missing`);
  const rows = [];
  for (const rowMatch of xml2.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowNumber = Number(attribute(rowMatch[1], "r") ?? rows.length + 1);
    const cells = [];
    let next = 0;
    for (const cellMatch of (rowMatch[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tag = cellMatch[1];
      const body = cellMatch[2] ?? "";
      const reference = attribute(tag, "r");
      const index = reference ? columnIndex(reference) : next;
      next = index + 1;
      const type = attribute(tag, "t") ?? "n";
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = null;
      if (type === "inlineStr") value = textOf(body);
      else if (raw === void 0) value = null;
      else if (type === "s") value = shared[Number(raw)] ?? "";
      else if (type === "str" || type === "e") value = unescapeXml(raw);
      else if (type === "b") value = raw === "1";
      else {
        const number = Number(raw);
        const kind = styles[Number(attribute(tag, "s") ?? 0)];
        value = kind && Number.isFinite(number) ? serialToISO(number + (date1904 ? 1462 : 0), kind === "datetime") : number;
      }
      while (cells.length < index) cells.push(null);
      cells[index] = value;
    }
    while (rows.length < rowNumber - 1) rows.push([]);
    rows[rowNumber - 1] = cells;
  }
  return { name: chosen.name, rows };
}

// src/core/presets.ts
var ICON_SETS = {
  arrows: [{ icon: "\u2193", tone: "bad" }, { icon: "\u2192", tone: "mid" }, { icon: "\u2191", tone: "good" }],
  traffic: [{ icon: "\u25CF", tone: "bad" }, { icon: "\u25CF", tone: "mid" }, { icon: "\u25CF", tone: "good" }],
  flags: [{ icon: "\u2691", tone: "bad" }, { icon: "\u2691", tone: "mid" }, { icon: "\u2691", tone: "good" }],
  stars: [{ icon: "\u2606", tone: "mid" }, { icon: "\u2BEA", tone: "mid" }, { icon: "\u2605", tone: "mid" }]
};
var DEFAULT_COLORS = ["#f8696b", "#ffeb84", "#63be7b"];
var isPreset = (format) => format.type === "dataBar" || format.type === "colorScale" || format.type === "iconSet";
function columnStats(values) {
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return min === Infinity ? null : { min, max };
}
function ratio(value, low, high) {
  if (high <= low) return 1;
  return Math.max(0, Math.min(1, (value - low) / (high - low)));
}
function parseHex(color) {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return null;
  const hex = match[1].length === 3 ? [...match[1]].map((c) => c + c).join("") : match[1];
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
function scaleColor(colors, t) {
  if (colors.length === 1) return colors[0];
  const scaled = Math.max(0, Math.min(1, t)) * (colors.length - 1);
  const index = Math.min(colors.length - 2, Math.floor(scaled));
  const local = scaled - index;
  const a = parseHex(colors[index]);
  const b = parseHex(colors[index + 1]);
  if (!a || !b) return colors[Math.round(scaled)];
  const mix = a.map((channel, i) => Math.round(channel + (b[i] - channel) * local));
  return `rgb(${mix.join(", ")})`;
}
function readableText(background) {
  const rgb = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(background)?.slice(1).map(Number) ?? parseHex(background);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#1f2328" : "#ffffff";
}
var colorScaleColors = (format) => format.colors && format.colors.length ? format.colors : DEFAULT_COLORS;
function iconFor(format, value, stats) {
  const set = Array.isArray(format.icons) ? format.icons.map((icon) => ({ icon, tone: "custom" })) : ICON_SETS[format.icons ?? "arrows"] ?? ICON_SETS.arrows;
  const icons = format.reverse ? [...set].reverse() : set;
  const parts = icons.length;
  const thresholds = format.thresholds ?? Array.from({ length: parts - 1 }, (_, i) => (i + 1) * 100 / parts);
  const position = format.thresholdType === "number" ? value : ratio(value, format.min ?? stats.min, format.max ?? stats.max) * 100;
  let index = 0;
  while (index < thresholds.length && position >= thresholds[index]) index++;
  return icons[Math.min(index, parts - 1)];
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
var escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
var TEXT_PATTERNS = {
  contains: (text) => text,
  notContains: (text) => text,
  equals: (text) => `^${text}$`,
  notEquals: (text) => `^${text}$`,
  startsWith: (text) => `^${text}`,
  endsWith: (text) => `${text}$`
};
var NEGATED_TEXT = /* @__PURE__ */ new Set(["notContains", "notEquals"]);
function toSorla(condition, column, locale) {
  const { op } = condition;
  if (op === "empty") return { $eq: "" };
  if (op === "notEmpty") return { $ne: "" };
  if (column.type === "boolean") {
    return op === "eq" ? { $eq: coerceOperand(condition.value, column, locale) } : null;
  }
  if (!isRangeType(column)) {
    const pattern = TEXT_PATTERNS[op];
    if (!pattern) return null;
    const source = pattern(escapeRegex(String(condition.value ?? "")));
    const negated = NEGATED_TEXT.has(op);
    if (column.options) {
      const regex2 = new RegExp(source, "i");
      const values = column.options.filter((o) => regex2.test(o.label) || regex2.test(String(o.value))).map((o) => o.value);
      return negated ? { $nin: values } : { $in: values };
    }
    const regex = { $regex: source, $options: "i" };
    return negated ? { $not: regex } : regex;
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
function andQuery(clauses) {
  const parts = clauses.filter((clause) => Object.keys(clause).length > 0);
  if (!parts.length) return {};
  if (parts.length === 1) return parts[0];
  return { $and: parts };
}
function compileFilters(filters, columns, { locale = "en-US", testFormula } = {}) {
  const clauses = [];
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
        const alternatives = conditions.map((condition) => toSorla(condition, column, locale));
        if (alternatives.every((ops) => ops !== null)) {
          clauses.push({ $or: alternatives.map((ops) => ({ [field]: ops })) });
        } else {
          predicates.push((row) => conditions.some((c) => testCondition(row[field], c, column, locale)));
        }
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
    if (Object.keys(operators).length) clauses.unshift({ [field]: operators });
  }
  return { query: andQuery(clauses), predicates };
}

// src/core/query.ts
var TEXT_QUERY_OPERATORS = ["eq", "ne", "in", "nin", "contains", "notContains", "startsWith", "endsWith", "empty", "notEmpty"];
var RANGE_QUERY_OPERATORS = ["eq", "ne", "gt", "gte", "lt", "lte", "between", "in", "nin", "empty", "notEmpty"];
var BOOLEAN_QUERY_OPERATORS = ["eq", "empty", "notEmpty"];
var TEXT_MATCH = /* @__PURE__ */ new Set(["contains", "notContains", "startsWith", "endsWith"]);
var NO_VALUE = /* @__PURE__ */ new Set(["empty", "notEmpty"]);
var LIST = /* @__PURE__ */ new Set(["in", "nin"]);
function queryOperatorsFor(column) {
  if (column.type === "boolean") return BOOLEAN_QUERY_OPERATORS;
  if (NUMERIC_TYPES.has(column.type) || DATE_TYPES.has(column.type)) return RANGE_QUERY_OPERATORS;
  return TEXT_QUERY_OPERATORS;
}
var emptyGroup = (join = "and") => ({ type: "group", join, children: [] });
function isCompleteRule(rule) {
  if (!rule.field || !rule.op) return false;
  if (NO_VALUE.has(rule.op)) return true;
  if (LIST.has(rule.op)) return Array.isArray(rule.values) && rule.values.length > 0;
  if (rule.op === "between") return !isBlank(rule.value) && !isBlank(rule.value2);
  return rule.value !== void 0 && rule.value !== null && (rule.value !== "" || rule.op === "eq" || rule.op === "ne");
}
function normalizeQuery(node) {
  if (!node) return null;
  if (node.type === "rule") return isCompleteRule(node) ? { ...node } : null;
  const children = node.children.map(normalizeQuery).filter((child) => child !== null);
  if (!children.length) return null;
  const group = { type: "group", join: node.join === "or" ? "or" : "and", children };
  if (node.not) group.not = true;
  return group;
}
function isQueryActive(node) {
  return normalizeQuery(node) !== null;
}
var isRange = (column) => NUMERIC_TYPES.has(column.type) || DATE_TYPES.has(column.type);
var asCondition = (rule, column) => {
  const textual = !isRange(column) && column.type !== "boolean";
  const op = textual && rule.op === "eq" ? "equals" : textual && rule.op === "ne" ? "notEquals" : rule.op;
  return { op, value: rule.value, value2: rule.value2 };
};
function ruleOperators(rule, column, locale) {
  if (LIST.has(rule.op)) return { [rule.op === "in" ? "$in" : "$nin"]: [...rule.values ?? []] };
  if (TEXT_MATCH.has(rule.op)) return toSorla({ op: rule.op, value: rule.value }, column, locale);
  if (!isRange(column) && column.type !== "boolean") {
    if (rule.op === "eq") return { $eq: rule.value ?? "" };
    if (rule.op === "ne") return { $ne: rule.value ?? "" };
  }
  return toSorla({ op: rule.op, value: rule.value, value2: rule.value2 }, column, locale);
}
function ruleTest(rule, column, locale) {
  return (row) => testCondition(row[rule.field], asCondition(rule, column), column, locale);
}
function compileNode(node, columns, options) {
  const locale = options.locale ?? "en-US";
  if (node.type === "rule") {
    const column = columns.get(node.field) ?? { field: node.field, type: "text", title: node.field };
    const operators = ruleOperators(node, column, locale);
    return operators ? { kind: "sorla", query: { [node.field]: operators } } : { kind: "js", test: ruleTest(node, column, locale) };
  }
  const children = node.children.map((child) => compileNode(child, columns, options));
  if (children.every((child) => child.kind === "sorla")) {
    const queries = children.map((child) => child.query);
    const inner = queries.length === 1 ? queries[0] : { [node.join === "or" ? "$or" : "$and"]: queries };
    return { kind: "sorla", query: node.not ? { $nor: [inner] } : inner };
  }
  const tests = children.map((child) => {
    if (child.kind === "js") return child.test;
    let ids = null;
    return (row) => (ids ??= options.idsFor(child.query)).has(row._id);
  });
  const combined = node.join === "or" ? (row) => tests.some((test) => test(row)) : (row) => tests.every((test) => test(row));
  return { kind: "js", test: node.not ? (row) => !combined(row) : combined };
}
function compileQuery(node, columns, options) {
  const normalized = normalizeQuery(node);
  if (!normalized) return { query: {}, predicates: [] };
  if (normalized.type === "group" && normalized.join === "and" && !normalized.not) {
    const clauses = [];
    const predicates = [];
    for (const child of normalized.children) {
      const compiled2 = compileNode(child, columns, options);
      if (compiled2.kind === "sorla") clauses.push(compiled2.query);
      else predicates.push(compiled2.test);
    }
    return { query: andQuery(clauses), predicates };
  }
  const compiled = compileNode(normalized, columns, options);
  return compiled.kind === "sorla" ? { query: compiled.query, predicates: [] } : { query: {}, predicates: [compiled.test] };
}
var unescapeRegex = (text) => text.replace(/\\(.)/g, "$1");
function toSorlaQuery(node, columns, locale = "en-US") {
  const normalized = normalizeQuery(node);
  if (!normalized) return {};
  const write = (current) => {
    if (current.type === "rule") {
      const column = columns.get(current.field) ?? { field: current.field, type: "text", title: current.field };
      const operators = ruleOperators(current, column, locale);
      if (operators) return { [current.field]: operators };
      const text = escapeRegex(String(current.value ?? ""));
      const pattern = current.op === "startsWith" ? `^${text}` : current.op === "endsWith" ? `${text}$` : text;
      const regex = { $regex: pattern, $options: "i" };
      return { [current.field]: current.op === "notContains" ? { $not: regex } : regex };
    }
    const parts = current.children.map(write);
    const inner = parts.length === 1 ? parts[0] : { [current.join === "or" ? "$or" : "$and"]: parts };
    return current.not ? { $nor: [inner] } : inner;
  };
  return write(normalized);
}
var OPERATOR_FROM_SORLA = { $eq: "eq", $ne: "ne", $gt: "gt", $gte: "gte", $lt: "lt", $lte: "lte", $in: "in", $nin: "nin" };
function fromSorlaQuery(query) {
  const readField = (field, condition) => {
    if (condition === null || typeof condition !== "object" || Array.isArray(condition)) {
      return [{ type: "rule", field, op: "eq", value: condition }];
    }
    const ops = { ...condition };
    if ("$regex" in ops) {
      const pattern = String(ops.$regex);
      if (pattern.startsWith("^")) return [{ type: "rule", field, op: "startsWith", value: unescapeRegex(pattern.slice(1)) }];
      if (pattern.endsWith("$") && !pattern.endsWith("\\$")) return [{ type: "rule", field, op: "endsWith", value: unescapeRegex(pattern.slice(0, -1)) }];
      return [{ type: "rule", field, op: "contains", value: unescapeRegex(pattern) }];
    }
    const not = ops.$not;
    if (not && typeof not === "object" && "$regex" in not) {
      return [{ type: "rule", field, op: "notContains", value: unescapeRegex(String(not.$regex)) }];
    }
    if (ops.$eq === "" && Object.keys(ops).length === 1) return [{ type: "rule", field, op: "empty" }];
    if (ops.$ne === "" && Object.keys(ops).length === 1) return [{ type: "rule", field, op: "notEmpty" }];
    if (ops.$ne === "" && Object.keys(ops).some((key) => key !== "$ne")) delete ops.$ne;
    if ("$gte" in ops && "$lte" in ops) {
      const rule = { type: "rule", field, op: "between", value: ops.$gte, value2: ops.$lte };
      delete ops.$gte;
      delete ops.$lte;
      return [rule, ...readField(field, ops)];
    }
    return Object.entries(ops).map(([operator, value]) => {
      if (operator === "$not") return { ...emptyGroup(), not: true, children: readField(field, value) };
      const op = OPERATOR_FROM_SORLA[operator];
      if (!op) throw new Error(`The query builder cannot represent ${operator}`);
      return op === "in" || op === "nin" ? { type: "rule", field, op, values: [...value] } : { type: "rule", field, op, value };
    });
  };
  const read = (current, join = "and") => {
    const children = [];
    for (const [key, value] of Object.entries(current)) {
      if (key === "$and" || key === "$or" || key === "$nor") {
        if (!Array.isArray(value)) throw new Error(`${key} must be an array`);
        const groups = value.map((item) => read(item));
        if (key === "$nor") {
          children.push({ type: "group", join: "or", not: true, children: groups.flatMap(unwrap) });
        } else {
          children.push({ type: "group", join: key === "$or" ? "or" : "and", children: groups.flatMap(unwrap) });
        }
      } else if (key.startsWith("$")) {
        throw new Error(`The query builder cannot represent ${key}`);
      } else {
        children.push(...readField(key, value));
      }
    }
    return { type: "group", join, children };
  };
  const unwrap = (group) => group.join === "and" && !group.not && group.children.length === 1 ? [group.children[0]] : [group];
  const root = read(query);
  const only = root.children[0];
  if (root.children.length === 1 && only && only.type === "group") return only;
  return root;
}
var OPERATOR_SYMBOLS = { eq: "=", ne: "\u2260", gt: ">", gte: "\u2265", lt: "<", lte: "\u2264" };
function describeQuery(node, columns, t, format) {
  const normalized = normalizeQuery(node);
  if (!normalized) return "";
  const text = (current, nested) => {
    if (current.type === "rule") {
      const column = columns.get(current.field) ?? { field: current.field, type: "text", title: current.field };
      const show = (value) => isBlank(value) ? t("blanks") : format(value, column);
      const symbol = OPERATOR_SYMBOLS[current.op];
      if (symbol) return `${column.title} ${symbol} ${show(current.value)}`;
      if (NO_VALUE.has(current.op)) return `${column.title} ${t(`op_${current.op}`).toLowerCase()}`;
      if (LIST.has(current.op)) return `${column.title} ${t(`q_${current.op}`)} ${(current.values ?? []).map(show).join(", ")}`;
      if (current.op === "between") return `${column.title} ${t("op_between").toLowerCase()} ${show(current.value)} \u2013 ${show(current.value2)}`;
      return `${column.title} ${t(`op_${current.op}`).toLowerCase()} "${String(current.value ?? "")}"`;
    }
    const joined = current.children.map((child) => text(child, true)).join(` ${t(current.join === "or" ? "or" : "and").toUpperCase()} `);
    const wrapped = nested && current.children.length > 1 || current.not ? `(${joined})` : joined;
    return current.not ? `${t("not").toUpperCase()} ${wrapped}` : wrapped;
  };
  return text(normalized, false);
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
var VOLATILE = /* @__PURE__ */ new Set(["RAND", "RANDBETWEEN"]);
var rowIndependent = /* @__PURE__ */ new WeakSet();
function markRowIndependent(node) {
  let independent;
  switch (node.type) {
    case "ref":
      independent = node.scope === "column";
      break;
    case "call": {
      const children = node.args.map(markRowIndependent);
      independent = children.every(Boolean) && !VOLATILE.has(node.name);
      break;
    }
    case "unary":
    case "postfix":
      independent = markRowIndependent(node.arg);
      break;
    case "binary": {
      const left = markRowIndependent(node.left);
      const right = markRowIndependent(node.right);
      independent = left && right;
      break;
    }
    case "array":
      independent = node.items.map(markRowIndependent).every(Boolean);
      break;
    default:
      return true;
  }
  if (independent) rowIndependent.add(node);
  return independent;
}
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
  const memo = ctx.memo;
  if (memo && rowIndependent.has(node)) {
    if (memo.has(node)) return memo.get(node);
    const value = evaluateFresh(node, ctx);
    memo.set(node, value);
    return value;
  }
  return evaluateFresh(node, ctx);
}
function evaluateFresh(node, ctx) {
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
    markRowIndependent(compiled.ast);
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
  // date columns hold ISO text; in ranges they are serial numbers, like Excel dates (MIN([due]), SUMIFS)
  dateFields = /* @__PURE__ */ new Set();
  columnFormulas = /* @__PURE__ */ new Map();
  cellFormulas = /* @__PURE__ */ new Map();
  nodes = /* @__PURE__ */ new Map();
  order = [];
  circular = /* @__PURE__ */ new Set();
  columnCache = /* @__PURE__ */ new Map();
  // row independent results for ad-hoc evaluations over every row; cleared on every data change
  sharedMemo = /* @__PURE__ */ new Map();
  constructor({ store, locale = "en-US", names = {}, functions = /* @__PURE__ */ new Map() }) {
    this.store = store;
    this.locale = locale;
    this.names = names;
    this.functions = functions;
  }
  setColumns(columns) {
    this.invalidate();
    this.fields = new Set(columns.map((c) => c.field));
    this.dateFields = new Set(columns.filter((c) => c.type === "date" || c.type === "datetime").map((c) => c.field));
    this.columnFormulas.clear();
    for (const column of columns) {
      if (typeof column.formula === "string" && column.formula.trim()) {
        this.columnFormulas.set(column.field, column.formula);
      }
    }
    this.buildGraph();
  }
  context(row, columnValues, memo) {
    return {
      memo,
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
  /** A value of a column range: dates of date columns become serial numbers, like Excel dates. */
  rangeValue(field, value) {
    return this.dateFields.has(field) && typeof value === "string" && isISODate(value) ? toSerial(value) : fromCell(value);
  }
  allValues = (field) => {
    let values = this.columnCache.get(field);
    if (!values) {
      values = this.store.values(field).map((value) => this.rangeValue(field, value));
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
  computeCell(id, field, memo) {
    const formula = this.formulaFor(id, field);
    if (!formula) return;
    const row = this.store.get(id);
    if (!row) return;
    const value = toCellResult(evaluate(compile(formula).ast, this.context(row, this.allValues, memo)));
    this.store.writeCalculated(row, field, toStored(value));
  }
  computeColumn(field, ids) {
    const memo = /* @__PURE__ */ new Map();
    for (const id of ids) this.computeCell(id, field, memo);
    this.columnCache.delete(field);
  }
  /** Forgets cached results; called whenever row values change. */
  invalidate() {
    this.columnCache.clear();
    this.sharedMemo.clear();
  }
  /**
   * Recomputes every formula of every row.
   */
  recalculateAll() {
    this.invalidate();
    const ids = this.store.ids();
    for (const field of this.circular) {
      for (const id of ids) {
        const row = this.store.get(id);
        if (row && this.formulaFor(id, field)) this.store.writeCalculated(row, field, ERRORS.CIRC);
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
    this.invalidate();
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
        values = rows.map((r) => this.rangeValue(field, r[field]));
        cache2.set(field, values);
      }
      return values;
    } : this.allValues;
    return toCellResult(evaluate(compile(formula).ast, this.context(row, columnValues, rows ? void 0 : this.sharedMemo)));
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
  advancedFilter: "Advanced filter",
  undo: "Undo",
  redo: "Redo",
  find: "Find",
  findNext: "Next match (Enter)",
  findPrevious: "Previous match (Shift+Enter)",
  findCount: "{current} of {count}",
  noMatches: "No matches",
  matchCase: "Match case",
  wholeCell: "Whole cell",
  replace: "Replace",
  replaceAll: "Replace all",
  replaceWith: "Replace with",
  replacedCount: "{count} replaced",
  goTo: "Go to",
  goToHint: "Row number, optionally a column: 120 Price",
  close: "Close",
  expandGroup: "Expand group",
  collapseGroup: "Collapse group",
  blankGroup: "(blank)",
  importFile: "Import",
  streamProgress: "Loading {loaded} of {total} rows\u2026",
  streamLoaded: "{loaded} rows loaded\u2026",
  streamDone: "{loaded} rows loaded",
  comment: "Comment",
  saveComment: "Save",
  deleteComment: "Delete",
  importDone: "{count} row(s) imported",
  importErrors: "{count} row(s) imported, {errors} value(s) did not fit and were left blank",
  confirmImport: "Importing replaces the rows and discards {count} unsaved change(s).",
  addRule: "+ Rule",
  addGroup: "+ Group",
  removeRule: "Remove rule",
  removeGroup: "Remove group",
  not: "Not",
  join: "Combine with",
  field: "Field",
  operator: "Operator",
  value: "Value",
  queryJson: "find() query (JSON)",
  copyJson: "Copy JSON",
  copied: "Copied",
  previewRows: "{count} matching row(s)",
  queryEmpty: "Add a rule to start.",
  op_in: "Is one of",
  op_nin: "Is not one of",
  q_in: "in",
  q_nin: "not in",
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
  advancedFilter: "Filtro avan\xE7ado",
  undo: "Desfazer",
  redo: "Refazer",
  find: "Localizar",
  findNext: "Pr\xF3xima ocorr\xEAncia (Enter)",
  findPrevious: "Ocorr\xEAncia anterior (Shift+Enter)",
  findCount: "{current} de {count}",
  noMatches: "Nenhuma ocorr\xEAncia",
  matchCase: "Diferenciar mai\xFAsculas",
  wholeCell: "C\xE9lula inteira",
  replace: "Substituir",
  replaceAll: "Substituir tudo",
  replaceWith: "Substituir por",
  replacedCount: "{count} substitu\xEDda(s)",
  goTo: "Ir para",
  goToHint: "N\xFAmero da linha e, se quiser, a coluna: 120 Pre\xE7o",
  close: "Fechar",
  expandGroup: "Expandir grupo",
  collapseGroup: "Recolher grupo",
  blankGroup: "(vazio)",
  importFile: "Importar",
  streamProgress: "Carregando {loaded} de {total} linhas\u2026",
  streamLoaded: "{loaded} linhas carregadas\u2026",
  streamDone: "{loaded} linhas carregadas",
  comment: "Coment\xE1rio",
  saveComment: "Salvar",
  deleteComment: "Excluir",
  importDone: "{count} linha(s) importada(s)",
  importErrors: "{count} linha(s) importada(s), {errors} valor(es) inv\xE1lido(s) ficaram em branco",
  confirmImport: "Importar substitui as linhas e descarta {count} altera\xE7\xE3o(\xF5es) n\xE3o salva(s).",
  addRule: "+ Regra",
  addGroup: "+ Grupo",
  removeRule: "Remover regra",
  removeGroup: "Remover grupo",
  not: "N\xE3o",
  join: "Combinar com",
  field: "Campo",
  operator: "Operador",
  value: "Valor",
  queryJson: "Consulta do find() (JSON)",
  copyJson: "Copiar JSON",
  copied: "Copiado",
  previewRows: "{count} linha(s) encontrada(s)",
  queryEmpty: "Adicione uma regra para come\xE7ar.",
  op_in: "\xC9 um de",
  op_nin: "N\xE3o \xE9 nenhum de",
  q_in: "em",
  q_nin: "fora de",
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
  const numbers2 = new Intl.NumberFormat(locale);
  const show = (value) => typeof value === "number" && Number.isFinite(value) ? numbers2.format(value) : String(value);
  return (key, params = {}) => {
    const [name = "", arg] = String(key).split(":");
    const template = labels[key] ?? (arg !== void 0 ? labels[name] : void 0);
    if (template === void 0) return String(key);
    return template.replace(/\{(\w+)\}/g, (m, p) => p === "0" && arg !== void 0 ? arg : params[p] === void 0 ? m : show(params[p]));
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
    const fallback = column.type === "boolean" ? null : operators.includes("contains") ? "contains" : "eq";
    value.addEventListener("input", () => {
      if (!op.value && fallback && value.value.trim() !== "") {
        op.value = fallback;
        sync();
      }
    });
    sync();
    return {
      element: h("div", { class: "ig-condition" }, op, value, value2),
      read: () => {
        const chosen = op.value || (fallback && value.value.trim() !== "" ? fallback : "");
        return chosen ? {
          op: chosen,
          value: column.type === "boolean" ? value.value === "true" : value.value,
          value2: value2.value
        } : null;
      }
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

// src/ui/query-builder.ts
var MAX_DEPTH = 4;
var QueryBuilder = class {
  element;
  grid;
  draft = emptyGroup();
  body;
  json;
  preview;
  previewTimer;
  constructor(grid) {
    this.grid = grid;
    const t = grid.t;
    this.body = h("div", { class: "ig-qb-body" });
    this.json = h("pre", { class: "ig-qb-json", tabindex: "0", "aria-label": t("queryJson") });
    this.preview = h("span", { class: "ig-qb-preview", "aria-live": "polite" });
    const copy = h("button", {
      type: "button",
      class: "ig-btn",
      text: t("copyJson"),
      onclick: async () => {
        try {
          await navigator.clipboard.writeText(this.json.textContent ?? "");
          copy.textContent = t("copied");
        } catch {
          getSelection()?.selectAllChildren(this.json);
        }
        setTimeout(() => {
          copy.textContent = t("copyJson");
        }, 1500);
      }
    });
    this.element = h(
      "div",
      { class: "ig-qb", role: "region", "aria-label": t("advancedFilter"), hidden: true },
      this.body,
      h(
        "details",
        { class: "ig-qb-details" },
        h("summary", { text: t("queryJson") }),
        this.json,
        h("div", { class: "ig-qb-json-actions" }, copy)
      ),
      h(
        "div",
        { class: "ig-qb-footer" },
        this.preview,
        h(
          "div",
          { class: "ig-qb-actions" },
          h("button", { type: "button", class: "ig-btn", text: t("clear"), onclick: () => this.clear() }),
          h("button", { type: "button", class: "ig-btn", text: t("cancel"), onclick: () => this.close() }),
          h("button", { type: "button", class: "ig-btn ig-btn-primary", text: t("apply"), onclick: () => this.apply() })
        )
      )
    );
    this.element.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        this.close();
      } else if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
        e.preventDefault();
        this.apply();
      }
    });
  }
  get isOpen() {
    return !this.element.hidden;
  }
  open() {
    this.reload();
    this.element.hidden = false;
    this.element.querySelector("select, input, button")?.focus();
    this.grid.emit("queryBuilderOpen", {});
  }
  /** Starts the draft again from the applied query (also when the query changes while the panel is open). */
  reload() {
    const current = this.grid.getQuery();
    this.draft = current ? current.type === "group" ? structuredClone(current) : { ...emptyGroup(), children: [structuredClone(current)] } : { ...emptyGroup(), children: [this.newRule()] };
    this.render();
  }
  close() {
    if (!this.isOpen) return;
    this.element.hidden = true;
    clearTimeout(this.previewTimer);
    this.grid.emit("queryBuilderClose", {});
  }
  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }
  apply() {
    this.grid.setQuery(this.draft);
    this.close();
  }
  clear() {
    this.draft = { ...emptyGroup(), children: [this.newRule()] };
    this.render();
  }
  columns() {
    return this.grid.columns.filter((column) => column.filterable);
  }
  newRule(field) {
    const column = this.columns().find((c) => c.field === field) ?? this.columns()[0];
    const rule = { type: "rule", field: column?.field ?? "", op: column ? queryOperatorsFor(column)[0] : "eq", value: "" };
    if (column?.type === "boolean") rule.value = true;
    return rule;
  }
  changed() {
    const json = toSorlaQuery(this.draft, this.grid.queryColumns(), this.grid.locale);
    this.json.textContent = JSON.stringify(json, null, 2);
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => {
      this.preview.textContent = this.grid.t("previewRows", { count: this.grid.countQuery(this.draft) });
    }, 150);
  }
  render() {
    this.body.replaceChildren(this.renderGroup(this.draft, 0, null));
    this.changed();
  }
  renderGroup(group, depth, parent) {
    const t = this.grid.t;
    const joinButton = (join, label) => h("button", {
      type: "button",
      class: `ig-qb-join${group.join === join ? " ig-active" : ""}`,
      "aria-pressed": String(group.join === join),
      text: label,
      onclick: () => {
        group.join = join;
        this.render();
      }
    });
    const not = h("input", { type: "checkbox", checked: !!group.not, onchange: (e) => {
      group.not = e.target.checked;
      this.render();
    } });
    const header = h(
      "div",
      { class: "ig-qb-group-header" },
      h("div", { class: "ig-qb-joins", role: "group", "aria-label": t("join") }, joinButton("and", t("and")), joinButton("or", t("or"))),
      h("label", { class: "ig-qb-not" }, not, t("not")),
      h("span", { class: "ig-qb-spacer" }),
      h("button", { type: "button", class: "ig-btn ig-btn-link", text: t("addRule"), onclick: () => {
        group.children.push(this.newRule());
        this.render();
      } }),
      depth < MAX_DEPTH ? h("button", {
        type: "button",
        class: "ig-btn ig-btn-link",
        text: t("addGroup"),
        onclick: () => {
          group.children.push({ ...emptyGroup(group.join === "and" ? "or" : "and"), children: [this.newRule()] });
          this.render();
        }
      }) : null,
      parent ? h("button", {
        type: "button",
        class: "ig-qb-remove",
        "aria-label": t("removeGroup"),
        title: t("removeGroup"),
        text: "\xD7",
        onclick: () => {
          parent.children.splice(parent.children.indexOf(group), 1);
          this.render();
        }
      }) : null
    );
    const children = group.children.length ? group.children.map((child) => child.type === "group" ? this.renderGroup(child, depth + 1, group) : this.renderRule(child, group)) : [h("p", { class: "ig-qb-empty", text: t("queryEmpty") })];
    return h(
      "div",
      { class: `ig-qb-group${group.not ? " ig-qb-negated" : ""}`, dataset: { depth: String(depth), join: group.join } },
      header,
      h("div", { class: "ig-qb-children" }, children)
    );
  }
  renderRule(rule, parent) {
    const t = this.grid.t;
    const columns = this.columns();
    const column = columns.find((c) => c.field === rule.field) ?? columns[0];
    if (!column) return h("div");
    const field = h("select", {
      class: "ig-input",
      "aria-label": t("field"),
      onchange: (e) => {
        const next = this.newRule(e.target.value);
        Object.assign(rule, { field: next.field, op: next.op, value: next.value, value2: void 0, values: void 0 });
        this.render();
      }
    }, columns.map((c) => h("option", { value: c.field, text: c.title, selected: c.field === column.field })));
    const operators = queryOperatorsFor(column);
    const op = h("select", {
      class: "ig-input",
      "aria-label": t("operator"),
      onchange: (e) => {
        const next = e.target.value;
        const wasList = rule.op === "in" || rule.op === "nin";
        rule.op = next;
        if ((next === "in" || next === "nin") && !wasList) rule.values = [];
        this.render();
      }
    }, operators.map((o) => h("option", { value: o, text: this.operatorLabel(o, column), selected: o === rule.op })));
    const incomplete = !isCompleteRule(rule);
    return h(
      "div",
      { class: `ig-qb-rule${incomplete ? " ig-qb-incomplete" : ""}` },
      field,
      op,
      this.renderValue(rule, column),
      h("button", {
        type: "button",
        class: "ig-qb-remove",
        "aria-label": t("removeRule"),
        title: t("removeRule"),
        text: "\xD7",
        onclick: () => {
          parent.children.splice(parent.children.indexOf(rule), 1);
          this.render();
        }
      })
    );
  }
  operatorLabel(op, column) {
    const t = this.grid.t;
    if (op === "in" || op === "nin") return t(`op_${op}`);
    if ((op === "eq" || op === "ne") && !NUMERIC_TYPES.has(column.type) && !DATE_TYPES.has(column.type) && column.type !== "boolean") {
      return t(op === "eq" ? "op_equals" : "op_notEquals");
    }
    return t(`op_${op}`);
  }
  renderValue(rule, column) {
    const t = this.grid.t;
    const update = (key) => (e) => {
      rule[key] = e.target.value;
      this.changed();
      e.target.closest(".ig-qb-rule")?.classList.toggle("ig-qb-incomplete", !isCompleteRule(rule));
    };
    const type = DATE_TYPES.has(column.type) ? "date" : "text";
    const input = (key) => h("input", {
      class: "ig-input",
      type,
      "aria-label": t("value"),
      inputmode: NUMERIC_TYPES.has(column.type) ? "decimal" : null,
      value: rule[key] === void 0 || rule[key] === null ? "" : String(rule[key]),
      oninput: update(key)
    });
    if (rule.op === "empty" || rule.op === "notEmpty") return null;
    if (rule.op === "between") return h("span", { class: "ig-qb-range" }, input("value"), h("span", { text: "\u2013" }), input("value2"));
    if (rule.op === "in" || rule.op === "nin") {
      const values = this.grid.distinctValues(column.field);
      const chosen = new Set(rule.values ?? []);
      const list = h("select", {
        class: "ig-input ig-qb-values",
        multiple: true,
        size: Math.min(6, Math.max(3, values.length)),
        "aria-label": t("value"),
        onchange: (e) => {
          const options = [...e.target.selectedOptions];
          rule.values = options.map((option) => values[Number(option.value)].value);
          this.changed();
        }
      }, values.map((v, i) => h("option", { value: String(i), text: v.value === "" ? t("blanks") : v.label, selected: chosen.has(v.value) })));
      return list;
    }
    if (column.type === "boolean") {
      return h("select", {
        class: "ig-input",
        "aria-label": t("value"),
        onchange: (e) => {
          rule.value = e.target.value === "true";
          this.changed();
        }
      }, h("option", { value: "true", text: t("true"), selected: rule.value !== false }), h("option", { value: "false", text: t("false"), selected: rule.value === false }));
    }
    if (column.options && (rule.op === "eq" || rule.op === "ne")) {
      const options = column.options;
      if (rule.value === "" && options[0]) rule.value = options[0].value;
      return h("select", {
        class: "ig-input",
        "aria-label": t("value"),
        onchange: (e) => {
          rule.value = options[Number(e.target.value)]?.value;
          this.changed();
        }
      }, options.map((o, i) => h("option", { value: String(i), text: o.label, selected: o.value === rule.value })));
    }
    return input("value");
  }
};

// src/ui/find-bar.ts
var FindBar = class {
  element;
  grid;
  mode = "find";
  input;
  replaceInput;
  matchCase;
  wholeCell;
  count;
  replaceRow;
  findOnly;
  matches = [];
  current = -1;
  timer;
  constructor(grid) {
    this.grid = grid;
    const t = grid.t;
    const option = (label) => {
      const input = h("input", { type: "checkbox", onchange: () => this.search() });
      return [input, h("label", { class: "ig-find-option" }, input, label)];
    };
    let caseLabel;
    let wholeLabel;
    [this.matchCase, caseLabel] = option(t("matchCase"));
    [this.wholeCell, wholeLabel] = option(t("wholeCell"));
    this.input = h("input", { type: "search", class: "ig-input ig-find-input", "aria-label": t("find"), oninput: () => this.schedule() });
    this.replaceInput = h("input", { type: "text", class: "ig-input ig-find-input", placeholder: t("replaceWith"), "aria-label": t("replaceWith") });
    this.count = h("span", { class: "ig-find-count", "aria-live": "polite" });
    const button = (text, onclick, title) => h("button", { type: "button", class: "ig-btn", text, title: title ?? text, "aria-label": title ?? text, onclick });
    const previous = button("\u2191", () => this.step(-1), t("findPrevious"));
    const next = button("\u2193", () => this.step(1), t("findNext"));
    this.replaceRow = h(
      "div",
      { class: "ig-find-row" },
      this.replaceInput,
      button(t("replace"), () => this.replaceCurrent()),
      button(t("replaceAll"), () => this.replaceAll())
    );
    this.findOnly = [previous, next, caseLabel, wholeLabel, this.count];
    this.element = h(
      "div",
      { class: "ig-find", role: "search", hidden: true },
      h(
        "div",
        { class: "ig-find-row" },
        this.input,
        previous,
        next,
        caseLabel,
        wholeLabel,
        this.count,
        h("button", { type: "button", class: "ig-btn ig-find-close", text: "\xD7", title: t("close"), "aria-label": t("close"), onclick: () => this.close() })
      ),
      this.replaceRow
    );
    this.element.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (this.mode === "goto") this.goTo();
        else if (e.target === this.replaceInput) this.replaceCurrent();
        else this.step(e.shiftKey ? -1 : 1);
      } else if ((e.ctrlKey || e.metaKey) && ["f", "h", "g"].includes(e.key.toLowerCase())) {
        e.preventDefault();
        this.open({ f: "find", h: "replace", g: "goto" }[e.key.toLowerCase()]);
      }
    });
  }
  get isOpen() {
    return !this.element.hidden;
  }
  open(mode2 = "find") {
    const t = this.grid.t;
    const changed = mode2 !== this.mode;
    this.mode = mode2;
    this.element.hidden = false;
    this.element.dataset.mode = mode2;
    this.replaceRow.hidden = mode2 !== "replace";
    for (const el of this.findOnly) el.hidden = mode2 === "goto";
    this.input.type = mode2 === "goto" ? "text" : "search";
    this.input.placeholder = mode2 === "goto" ? t("goToHint") : t("find");
    this.input.setAttribute("aria-label", mode2 === "goto" ? t("goTo") : t("find"));
    if (changed && (mode2 === "goto" || this.input.dataset.mode === "goto")) this.input.value = "";
    this.input.dataset.mode = mode2;
    this.input.focus();
    this.input.select();
    if (mode2 !== "goto") this.search();
  }
  close() {
    if (this.element.hidden) return;
    this.element.hidden = true;
    this.matches = [];
    this.current = -1;
    this.grid.highlightCells([]);
    this.grid.focus();
  }
  options() {
    return { matchCase: this.matchCase.checked, wholeCell: this.wholeCell.checked };
  }
  schedule() {
    clearTimeout(this.timer);
    if (this.mode === "goto") return;
    this.timer = setTimeout(() => this.search(), 120);
  }
  /** Finds every match and moves to the first one at or after the active cell. */
  search() {
    clearTimeout(this.timer);
    const text = this.input.value;
    this.matches = text ? this.grid.find(text, this.options()) : [];
    this.grid.highlightCells(this.matches);
    this.current = -1;
    if (this.matches.length) this.step(0);
    else this.updateCount();
  }
  step(delta) {
    if (!this.matches.length) {
      if (this.input.value) this.search();
      return;
    }
    if (this.current === -1) {
      const start = this.grid.indexOfCell(this.grid.getActiveCell());
      const after = this.matches.findIndex((m) => this.grid.indexOfCell(m) >= start);
      this.current = after === -1 ? 0 : after;
      if (delta < 0) this.current = (this.current - 1 + this.matches.length) % this.matches.length;
    } else {
      this.current = (this.current + delta + this.matches.length) % this.matches.length;
    }
    this.select(this.current);
  }
  select(index) {
    this.current = index;
    const match = this.matches[index];
    if (match) this.grid.setRange(match);
    this.updateCount();
  }
  updateCount() {
    const t = this.grid.t;
    this.count.textContent = !this.input.value ? "" : this.matches.length ? t("findCount", { current: this.current + 1, count: this.matches.length }) : t("noMatches");
    this.input.classList.toggle("ig-invalid", !!this.input.value && !this.matches.length);
  }
  replaceCurrent() {
    const match = this.matches[this.current];
    if (!match) {
      this.search();
      return;
    }
    this.grid.replace(this.input.value, this.replaceInput.value, { ...this.options(), cells: [match] });
    const position = this.grid.indexOfCell(match);
    this.matches = this.grid.find(this.input.value, this.options());
    this.grid.highlightCells(this.matches);
    const next = this.matches.findIndex((m) => this.grid.indexOfCell(m) > position);
    this.select(this.matches.length ? next === -1 ? 0 : next : -1);
  }
  replaceAll() {
    const replaced = this.grid.replace(this.input.value, this.replaceInput.value, this.options());
    this.search();
    this.count.textContent = this.grid.t("replacedCount", { count: replaced });
  }
  goTo() {
    const ok = this.grid.goTo(this.input.value);
    this.input.classList.toggle("ig-invalid", !ok);
    if (ok) this.close();
  }
};

// src/ui/virtual.ts
var RowLayout = class {
  defaultHeight;
  keys = [];
  heights = /* @__PURE__ */ new Map();
  offsets = new Float64Array(1);
  dirtyFrom = 0;
  constructor(defaultHeight) {
    this.defaultHeight = defaultHeight;
  }
  get count() {
    return this.keys.length;
  }
  /** The rows, in display order. Measured heights of rows that stay are kept. */
  setKeys(keys) {
    this.keys = keys;
    if (this.offsets.length < keys.length + 1) this.offsets = new Float64Array(Math.max(keys.length + 1, this.offsets.length * 2));
    this.dirtyFrom = 0;
  }
  setDefaultHeight(height) {
    if (height > 0 && height !== this.defaultHeight) {
      this.defaultHeight = height;
      this.dirtyFrom = 0;
    }
  }
  heightOf(index) {
    const key = this.keys[index];
    return key === void 0 ? this.defaultHeight : this.heights.get(key) ?? this.defaultHeight;
  }
  /**
   * Records a measured height.
   * @return whether the layout changed
   */
  measure(index, height) {
    const key = this.keys[index];
    if (key === void 0 || Math.abs(this.heightOf(index) - height) < 0.5) return false;
    if (Math.abs(height - this.defaultHeight) < 0.5) this.heights.delete(key);
    else this.heights.set(key, height);
    this.dirtyFrom = Math.min(this.dirtyFrom, index);
    return true;
  }
  forget(key) {
    this.heights.delete(key);
    this.dirtyFrom = 0;
  }
  ensure() {
    if (this.dirtyFrom > this.keys.length) return;
    const offsets = this.offsets;
    for (let i = this.dirtyFrom; i < this.keys.length; i++) offsets[i + 1] = offsets[i] + this.heightOf(i);
    this.dirtyFrom = this.keys.length + 1;
  }
  /** Top of a row, in pixels. */
  offsetOf(index) {
    this.ensure();
    return this.offsets[Math.max(0, Math.min(index, this.keys.length))];
  }
  get total() {
    return this.offsetOf(this.keys.length);
  }
  /** Index of the row at a vertical position (binary search). */
  indexAt(y) {
    this.ensure();
    let low = 0;
    let high = this.keys.length - 1;
    while (low < high) {
      const mid = low + high + 1 >> 1;
      if (this.offsets[mid] <= y) low = mid;
      else high = mid - 1;
    }
    return Math.max(0, low);
  }
  /**
   * Rows to render for a viewport, with extra rows above and below for smooth scrolling.
   * @return [start, end) indexes
   */
  window(scrollTop, viewportHeight, overscan) {
    if (!this.keys.length) return [0, 0];
    const start = Math.max(0, this.indexAt(scrollTop) - overscan);
    const last = this.indexAt(scrollTop + Math.max(viewportHeight, 1));
    const end = Math.min(this.keys.length, last + 1 + overscan);
    return [start, end];
  }
};
function columnWindow(widths, scrollLeft, viewportWidth, overscan) {
  if (!widths.length) return { start: 0, end: 0, before: 0, after: 0 };
  let x = 0;
  let first = widths.length - 1;
  for (let i = 0; i < widths.length; i++) {
    if (x + widths[i] > scrollLeft) {
      first = i;
      break;
    }
    x += widths[i];
  }
  let last = first;
  let right = x;
  for (let i = first; i < widths.length; i++) {
    right += widths[i];
    last = i;
    if (right >= scrollLeft + viewportWidth) break;
  }
  const start = Math.max(0, first - overscan);
  const end = Math.min(widths.length, last + 1 + overscan);
  let before = 0;
  for (let i = 0; i < start; i++) before += widths[i];
  let after = 0;
  for (let i = end; i < widths.length; i++) after += widths[i];
  return { start, end, before, after };
}

// src/ui/sparkline.ts
var SVG = "http://www.w3.org/2000/svg";
function svg(tag, attributes) {
  const element = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  return element;
}
function sparklineValues(value) {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,;\s]+/) : [];
  return list.map(Number).filter(Number.isFinite);
}
function sparkline(values, { type = "line", color, negativeColor, width = 100, height = 22, min, max } = {}) {
  const chart = svg("svg", { class: `ig-sparkline ig-sparkline-${type}`, width, height, viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": values.join(", ") });
  if (!values.length) return chart;
  const pad2 = 2;
  const inner = height - pad2 * 2;
  const stroke = color ?? "currentColor";
  if (type === "line") {
    const low2 = min ?? Math.min(...values);
    const high2 = max ?? Math.max(...values);
    const span2 = high2 - low2 || 1;
    const step = values.length > 1 ? (width - pad2 * 2) / (values.length - 1) : 0;
    const points = values.map((v, i) => [pad2 + i * step, pad2 + inner - (v - low2) / span2 * inner]);
    chart.append(svg("polyline", { points: points.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" "), fill: "none", stroke, "stroke-width": 1.5, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    const last = points.at(-1);
    chart.append(svg("circle", { cx: last[0].toFixed(1), cy: last[1].toFixed(1), r: 2, fill: stroke }));
    return chart;
  }
  const winLoss = type === "winloss";
  const low = winLoss ? -1 : Math.min(0, min ?? Math.min(...values));
  const high = winLoss ? 1 : Math.max(0, max ?? Math.max(...values));
  const span = high - low || 1;
  const zero = pad2 + inner - (0 - low) / span * inner;
  const slot = (width - pad2 * 2) / values.length;
  values.forEach((raw, i) => {
    const v = winLoss ? Math.sign(raw) : raw;
    if (winLoss && v === 0) return;
    const y = pad2 + inner - (v - low) / span * inner;
    chart.append(svg("rect", {
      x: (pad2 + i * slot + slot * 0.15).toFixed(1),
      y: Math.min(y, zero).toFixed(1),
      width: Math.max(1, slot * 0.7).toFixed(1),
      height: Math.max(1, Math.abs(zero - y)).toFixed(1),
      fill: v < 0 ? negativeColor ?? "var(--ig-negative)" : stroke
    }));
  });
  return chart;
}

// src/ui/grid.ts
var DEFAULT_COLUMN_WIDTH = 120;
var SELECTION_WIDTH = 40;
var widthOf = (column) => column.width ?? DEFAULT_COLUMN_WIDTH;
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
  initialQuery: null,
  selection: { mode: "multiple", checkbox: true, selectOnClick: false },
  navbar: { search: true, filters: true, columns: true, export: ["csv", "xlsx"], add: false, delete: false, changes: true, query: true, undo: true, items: [] },
  changeTracking: { inputName: "changes", historyLimit: 5e3 },
  statusBar: true,
  find: true,
  groupBy: [],
  groupsCollapsed: false,
  comments: [],
  renderChunk: 100,
  rowHeight: null,
  undoLimit: 100,
  overscan: 8,
  virtualColumns: 40,
  append: null,
  rowClass: null,
  rowFormats: [],
  exportOptions: { filename: "export", sheetName: "Sheet1" },
  confirmDelete: true,
  on: {}
};
function readBlob(blob) {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}
function inferType(values) {
  const present = values.filter((v) => v !== null && v !== void 0 && v !== "");
  if (!present.length) return "text";
  if (present.every((v) => typeof v === "number" || typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim()))) {
    return present.every((v) => Number.isInteger(Number(v))) ? "integer" : "number";
  }
  if (present.every((v) => typeof v === "boolean")) return "boolean";
  if (present.every((v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(v))) {
    return present.some((v) => v.includes("T")) ? "datetime" : "date";
  }
  return "text";
}
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
  _queryModel = null;
  _queryBuilder = null;
  _findBar = null;
  // cells marked by find ("id\u0000field")
  _highlighted = /* @__PURE__ */ new Set();
  _search = "";
  _selected = /* @__PURE__ */ new Set();
  _anchorId = null;
  _active = null;
  // the other corner of the selected range; the active cell is the anchor (like Excel)
  _focus = null;
  _dragging = false;
  // fill handle drag: the source block and how far it is being extended
  _filling = null;
  _pointer = null;
  _autoScroll = 0;
  _editing = null;
  _view = [];
  // grouping: the view is sorted by the group fields and shown as group rows plus the rows of open groups
  _groupBy = [];
  _collapsed = /* @__PURE__ */ new Set();
  _collapseNew = false;
  _display = null;
  _displayIndex = /* @__PURE__ */ new Map();
  _groupOf = /* @__PURE__ */ new Map();
  _groupEls = /* @__PURE__ */ new Map();
  _knownGroups = /* @__PURE__ */ new Set();
  // server connections: WebSocket pushes (append.socket) and a running SSE stream (loadStream)
  _offSocket = null;
  _stream = null;
  _streamRefresh;
  // min / max of columns with data bars, color scales or icon sets, over the view
  _stats = /* @__PURE__ */ new Map();
  // short message in the status bar (after an import)
  _notice = null;
  // cell comments: row id → field → text
  _comments = /* @__PURE__ */ new Map();
  _commentTip = null;
  _noticeTimer;
  _layout = new RowLayout(34);
  _viewIndex = /* @__PURE__ */ new Map();
  _rowWindow = [0, 0];
  _rowEls = /* @__PURE__ */ new Map();
  _plan = null;
  _topSpacer;
  _bottomSpacer;
  _scrollFrame = 0;
  _calibrated = false;
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
  _scroller;
  _status;
  _searchInput = null;
  _selectAllBox = null;
  _popover = null;
  _onScroll = null;
  _onDocumentPointer = null;
  _tracker = null;
  _undo = new UndoStack(100);
  _replaying = false;
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
    this._undo.limit = this.options.undoLimit;
    this._sort = [...this.options.initialSort];
    this._groupBy = [...this.options.groupBy];
    for (const comment of this.options.comments) this._writeComment(String(comment.id), comment.field, comment.text);
    this._collapseNew = this.options.groupsCollapsed;
    this._filters = { ...this.options.initialFilters };
    this._queryModel = normalizeQuery(this.options.initialQuery);
    this._append = this.options.append ? this._appendState(this.options.append) : null;
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
  /** Visible columns in display order: pinned left, scrollable, pinned right. */
  get visibleColumns() {
    const visible = this.columns.filter((c) => c.visible);
    return [...visible.filter((c) => c.pinned === "left"), ...visible.filter((c) => c.pinned !== "left" && c.pinned !== "right"), ...visible.filter((c) => c.pinned === "right")];
  }
  /**
   * Freezes a column on the left or right edge while scrolling horizontally (Excel's freeze panes).
   * @param side 'left' | 'right' | null to unfreeze
   */
  pinColumn(field, side) {
    const column = this.getColumn(field);
    if (!column) throw new Error(`Unknown column ${field}`);
    column.pinned = side;
    this._plan = null;
    this._renderHeader();
    this._renderWindow(true);
    this._renderFooter();
    this.emit("columnPin", { field, side });
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
    this._undo.clear();
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
    return this.batch(() => this._addRow(row, { position }), "insert");
  }
  _addRow(row = {}, { position = "end" } = {}) {
    const event = this.emit("beforeRowAdd", { row: { ...row } });
    if (event.defaultPrevented) return null;
    const id = this._insert([event.detail.row])[0];
    this._tracker?.recordInsert(id);
    const data = { ...this.store.get(id) };
    if (position === "start") this._view.unshift(data);
    else this._view.push(data);
    if (!this._replaying) this._undo.record({ kind: "insert", id, data: { ...data }, index: position === "start" ? 0 : this._view.length - 1 });
    this._renderBody();
    this._renderFooter();
    this._afterTrackedChange();
    this.emit("rowAdd", { id, row: this.getRow(id) });
    return id;
  }
  /**
   * Adds many rows at the end with one render and one undo step (no beforeRowAdd per row).
   * @return the new ids
   */
  addRows(rows) {
    if (!rows.length) return [];
    return this.batch(() => {
      const ids = this._insert(rows);
      for (const id of ids) {
        this._tracker?.recordInsert(id);
        const data = { ...this.store.get(id) };
        this._view.push(data);
        if (!this._replaying) this._undo.record({ kind: "insert", id, data: { ...data }, index: this._view.length - 1 });
      }
      this._renderBody();
      this._renderFooter();
      this._renderNavbar();
      this._afterTrackedChange();
      this.emit("rowsAdd", { ids });
      return ids;
    }, "insert");
  }
  updateRow(id, patch) {
    return this.batch(() => this._updateRow(id, patch), "update");
  }
  _updateRow(id, patch) {
    if (!this.store.has(id)) return false;
    this._touch(id);
    const before = this.getRow(id);
    const states = Object.keys(patch).filter((field) => field !== "_id").map((field) => [field, this._cellState(id, field)]);
    const previous = this.store.update(id, patch);
    const scope = this.calc.recalculate([id], Object.keys(patch));
    for (const [field, state] of states) this._recordCell(id, field, state);
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
    return this.batch(() => this._deleteRows(ids), "delete");
  }
  _deleteRows(ids) {
    const event = this.emit("beforeRowDelete", { ids: [...ids], rows: ids.map((id) => this.getRow(id)) });
    if (event.defaultPrevented) return [];
    for (const id of event.detail.ids) {
      const data = this.store.get(id);
      if (!data) continue;
      const formulas = this.calc.cellFormulas.get(id);
      const wasInserted = this._tracker?.recordDelete(id, data, formulas) ?? false;
      if (!this._replaying) {
        this._undo.record({ kind: "delete", id, data: { ...data }, formulas: formulas ? { ...formulas } : void 0, index: this._viewIndex.get(id) ?? this._view.length, wasInserted });
      }
    }
    const removed = this.store.remove(event.detail.ids);
    const removedIds = removed.map((r) => r._id);
    this.calc.forgetRows(removedIds);
    this.calc.recalculate([], this.columns.map((c) => c.field));
    removedIds.forEach((id) => this._selected.delete(id));
    const gone = new Set(removedIds);
    this._view = this._view.filter((r) => !gone.has(r._id));
    this._renderBody();
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
    return this.batch(() => this._setCellValue(id, field, value, { source }), "edit");
  }
  _setCellValue(id, field, value, { source = "api" } = {}) {
    const column = this.getColumn(field);
    const data = this.store.get(id);
    if (!column || !data) return { ok: false, error: "notFound" };
    if (isFormula(value) && column.allowFormulas) return this.setCellFormula(id, field, value, { source });
    if (typeof value === "string" && source !== "api" && source !== "fill") {
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
    const beforeState = this._cellState(id, field);
    const hadFormula = !!this.calc.cellFormulas.get(id)?.[field];
    if (this.calc.columnFormulas.has(field)) this.calc.setCellOverride(id, field);
    else if (hadFormula) this.calc.setCellFormula(id, field, null);
    this.store.update(id, { [field]: event.detail.value });
    this._invalid.delete(`${id}\0${field}`);
    const scope = this.calc.recalculate([id], [field]);
    this._syncRows(scope === "all" || hadFormula ? null : [id]);
    this._recordCell(id, field, beforeState);
    const updated = this.getRow(id);
    this._tracker?.recordUpdate(id, field, oldValue ?? null, updated[field] ?? null, source);
    this._afterTrackedChange();
    const change = { id, field, value: updated[field], oldValue, row: updated, source };
    column.onChange?.(change);
    this.emit("cellChange", change);
    return { ok: true };
  }
  setCellFormula(id, field, formula, { source = "api" } = {}) {
    return this.batch(() => this._setCellFormula(id, field, formula, { source }), "formula");
  }
  _setCellFormula(id, field, formula, { source = "api" } = {}) {
    const column = this.getColumn(field);
    if (!column || !this.store.has(id)) return { ok: false, error: "notFound" };
    const oldValue = this.getRow(id)[field];
    const event = this.emit("beforeCellChange", { id, field, value: formula, oldValue, row: this.getRow(id), column, source, formula: true });
    if (event.defaultPrevented) return { ok: false, error: "cancelled" };
    this._touch(id);
    const beforeState = this._cellState(id, field);
    this.calc.setCellFormula(id, field, formula);
    this.calc.recalculate([id], [field]);
    this._recordCell(id, field, beforeState);
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
  /* ---------------------------------------------------------------- undo / redo */
  /**
   * Groups every change made inside fn into one undo step: grid.batch(() => { ... }, 'import').
   * @return what fn returns
   */
  batch(fn, label = "batch") {
    this._undo.begin(label);
    try {
      return fn();
    } finally {
      this._undo.end();
      this._renderNavbar();
    }
  }
  canUndo() {
    return this._undo.canUndo;
  }
  canRedo() {
    return this._undo.canRedo;
  }
  /** Undoes the last step (Ctrl+Z). @return whether something was undone */
  undo() {
    this._closeEditor(false);
    const step = this._undo.takeUndo();
    if (!step) return false;
    this._applyStep(step, "undo");
    return true;
  }
  /** Redoes the last undone step (Ctrl+Y). @return whether something was redone */
  redo() {
    this._closeEditor(false);
    const step = this._undo.takeRedo();
    if (!step) return false;
    this._applyStep(step, "redo");
    return true;
  }
  clearUndo() {
    this._undo.clear();
    this._renderNavbar();
  }
  _cellState(id, field) {
    return { value: this.store.get(id)?.[field], formula: this.calc.cellFormulas.get(id)?.[field] };
  }
  _recordCell(id, field, before) {
    if (this._replaying) return;
    const after = this._cellState(id, field);
    if (before.value === after.value && before.formula === after.formula) return;
    this._undo.record({ kind: "cell", id, field, before, after });
  }
  _writeCell(id, field, state, source) {
    if (!this.store.has(id)) return;
    this._touch(id);
    const from = this.getRow(id)[field];
    if (state.formula === void 0) {
      if (this.calc.cellFormulas.get(id)?.[field] !== void 0) this.calc.setCellFormula(id, field, null);
    } else {
      this.calc.setCellFormula(id, field, state.formula);
    }
    this.store.update(id, { [field]: state.value });
    this._invalid.delete(`${id}\0${field}`);
    this._tracker?.recordUpdate(id, field, from ?? null, this.getRow(id)[field] ?? null, source);
  }
  _removeRow(change, source) {
    const data = this.store.get(change.id);
    if (!data) return;
    this._tracker?.recordDelete(change.id, data, this.calc.cellFormulas.get(change.id), source);
    this.store.remove([change.id]);
    this.calc.cellFormulas.delete(change.id);
    this._selected.delete(change.id);
    this._view = this._view.filter((row) => row._id !== change.id);
  }
  _restoreRow(change, source) {
    if (this.store.has(change.id)) return;
    this.store.insert([{ ...change.data }]);
    if (change.formulas) this.calc.cellFormulas.set(change.id, { ...change.formulas });
    if (change.kind === "delete") this._tracker?.restoreDeleted(change.id, change.wasInserted, source);
    else this._tracker?.recordInsert(change.id, source);
    this._view.splice(Math.min(change.index, this._view.length), 0, { ...this.store.get(change.id) });
  }
  _applyStep(step, direction) {
    this._replaying = true;
    const ids = /* @__PURE__ */ new Set();
    const fields = /* @__PURE__ */ new Set();
    let structural = false;
    try {
      const changes = direction === "undo" ? [...step.changes].reverse() : step.changes;
      const restores = changes.filter((c) => (c.kind === "insert" || c.kind === "delete") && direction === "undo" === (c.kind === "delete"));
      restores.sort((a, b) => a.index - b.index);
      for (const change of changes) {
        if (change.kind === "cell") {
          this._writeCell(change.id, change.field, direction === "undo" ? change.before : change.after, direction);
          ids.add(change.id);
          fields.add(change.field);
        } else if (change.kind === "comment") {
          this._writeComment(change.id, change.field, direction === "undo" ? change.before : change.after);
          ids.add(change.id);
        } else if (!restores.includes(change)) {
          this._removeRow(change, direction);
          structural = true;
        }
      }
      for (const change of restores) {
        this._restoreRow(change, direction);
        structural = true;
      }
    } finally {
      this._replaying = false;
    }
    if (structural) {
      this.calc.setColumns(this.columns);
      this.calc.recalculateAll();
      this._renderBody();
      this._syncRows(null);
    } else {
      const scope = this.calc.recalculate([...ids], [...fields]);
      this._syncRows(scope === "all" ? null : [...ids]);
    }
    this._afterTrackedChange();
    this._renderNavbar();
    this.emit(direction, { label: step.label, changes: step.changes.length });
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
  /** Column filters, search and the advanced filter. */
  clearFilters() {
    this._search = "";
    if (this._searchInput) this._searchInput.value = "";
    if (this._queryModel) {
      this._queryModel = null;
      this.emit("queryChange", { query: null, sorlaQuery: {} });
    }
    this.setFilters({});
  }
  /* ---------------------------------------------------------------- advanced filter (query builder) */
  /** The advanced filter as built in the query builder, null when none. */
  getQuery() {
    return this._queryModel ? structuredClone(this._queryModel) : null;
  }
  /**
   * Sets the advanced filter. It is combined (AND) with the column filters and the search.
   * Incomplete rules and empty groups are dropped.
   */
  setQuery(query) {
    this._queryModel = normalizeQuery(query);
    if (this._queryBuilder?.isOpen) this._queryBuilder.reload();
    this._renderNavbar();
    this._onQueryChange();
    this.emit("queryChange", { query: this.getQuery(), sorlaQuery: this.toSorlaQuery() });
  }
  /** The advanced filter as SorlaDB / MongoDB find() JSON ({} when none). */
  toSorlaQuery(query = this._queryModel) {
    return toSorlaQuery(query, this._columnMap, this.locale);
  }
  /** Loads a SorlaDB / MongoDB query (e.g. a saved one) into the advanced filter. */
  fromSorlaQuery(json) {
    this.setQuery(fromSorlaQuery(json));
  }
  /** Opens or closes the query builder panel. */
  toggleQueryBuilder(open) {
    if (!this._queryBuilder) return;
    if (open === void 0) this._queryBuilder.toggle();
    else if (open) this._queryBuilder.open();
    else this._queryBuilder.close();
    this._renderNavbar();
  }
  /** @internal rows matching a query (with the other filters), for the builder preview */
  countQuery(query) {
    const previous = this._queryModel;
    this._queryModel = normalizeQuery(query);
    try {
      const { query: sorla, predicates } = this._compiled();
      return this.store.query({ query: sorla, predicates }).length;
    } finally {
      this._queryModel = previous;
    }
  }
  /** @internal */
  queryColumns() {
    return this._columnMap;
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
    if (!this._queryModel) return { query, predicates };
    const advanced = compileQuery(this._queryModel, this._columnMap, {
      locale: this.locale,
      idsFor: (sorla) => new Set(this.store.query({ query: sorla }).map((row) => row._id))
    });
    return { query: andQuery([query, advanced.query]), predicates: [...predicates, ...advanced.predicates] };
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
    this._renderBody();
    this._renderFooter();
    this._renderNavbar();
    this.emit("render", { rows: this._view.length });
  }
  /* ---------------------------------------------------------------- append / infinite scroll */
  _appendState(options) {
    const { socket, ...rest } = options;
    const load = rest.load ?? (socket ? (params) => socket.load({ ...params }) : null);
    if (!load) throw new Error("append needs load(params) or a socket");
    if (socket) this._offSocket = socket.on("push", ({ message }) => this.applyServerChanges(message));
    return { pageSize: 100, serverSide: true, threshold: 200, ...rest, load, loaded: 0, hasMore: true, loading: false, request: 0 };
  }
  /** Column filters and the advanced filter as one SorlaDB query (append mode where parameter). */
  _whereQuery() {
    const { query } = compileFilters(this._filters, this._columnMap, { locale: this.locale, testFormula: () => true });
    return andQuery([query, this.toSorlaQuery()]);
  }
  _resetAppend() {
    const append = this._append;
    if (!append) return;
    append.request++;
    append.loaded = 0;
    append.hasMore = true;
    append.loading = false;
    if (this.hasChanges()) this.emit("changesDiscarded", { changes: this.getChanges() });
    this._tracker?.reset();
    this._undo.clear();
    this.store.clear();
    this.calc.cellFormulas.clear();
    this.calc.setColumns(this.columns);
    this._view = [];
    this._scroller.scrollTop = 0;
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
    const params = {
      offset: append.loaded,
      limit: append.pageSize,
      sort: this.getSort(),
      filters: this.getFilters(),
      search: this._search,
      query: this.getQuery(),
      sorlaQuery: this.toSorlaQuery(),
      where: this._whereQuery()
    };
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
      const localQuery = !append.serverSide && (this._sort.length || Object.keys(this._filters).length || this._search || this._queryModel);
      if (localQuery) {
        append.loading = false;
        this.refresh();
      } else {
        const scopeAll = this.calc.hasColumnReferences();
        if (scopeAll) this._view.forEach((row, i) => {
          this._view[i] = { ...this.store.get(row._id) };
        });
        for (const id of ids) this._view.push({ ...this.store.get(id) });
        this._renderBody();
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
    if (this._append?.hasMore) this.loadMore();
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
    for (const tr of this._rowEls.values()) {
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
    this._topSpacer = h("tr", { class: "ig-spacer", "aria-hidden": "true" });
    this._bottomSpacer = h("tr", { class: "ig-spacer", "aria-hidden": "true" });
    this._scroller = h(
      "div",
      { class: "ig-scroll", tabindex: "0", style: { maxHeight: typeof this.options.height === "number" ? `${this.options.height}px` : this.options.height } },
      this._table,
      this._message,
      this._loading
    );
    if (this.options.rowHeight) {
      this._layout.setDefaultHeight(this.options.rowHeight);
      this._calibrated = true;
    }
    this._status = h("div", { class: "ig-status", "aria-live": "polite" });
    if (this.options.navbar) this.root.append(this._navbar);
    if (this.options.navbar && this.options.navbar.query) {
      this._queryBuilder = new QueryBuilder(this);
      this.root.append(this._queryBuilder.element);
      this.on("queryBuilderClose", () => this._renderNavbar());
    }
    if (this.options.find) {
      this._findBar = new FindBar(this);
      this.root.append(this._findBar.element);
    }
    this.root.append(this._scroller);
    if (this.options.statusBar) this.root.append(this._status);
    this.element.classList.add("ig-host");
    this.element.append(this.root);
    this._renderHeader();
    this._bindEvents();
  }
  _bindEvents() {
    const scroller = this._scroller;
    this._onScroll = () => {
      if (this._scrollFrame) return;
      this._scrollFrame = requestAnimationFrame(() => {
        this._scrollFrame = 0;
        this._renderWindow();
        this._checkScrollEnd();
      });
    };
    scroller.addEventListener("scroll", this._onScroll, { passive: true });
    this._tbody.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (targetOf(e)?.closest(".ig-fill-handle")) {
        e.preventDefault();
        this._startDrag(e, true);
        return;
      }
      const td = targetOf(e)?.closest("td[data-field]");
      const tr = td?.closest("tr");
      if (!td || !tr?.dataset.id || this._editing?.td === td || targetOf(e)?.closest("input, select, textarea, button, .ig-fill-handle")) return;
      e.preventDefault();
      this._scroller.focus({ preventScroll: true });
      this._selectCell(tr.dataset.id, td.dataset.field, e.shiftKey && !!this._active);
      this._startDrag(e, false);
    });
    this._tbody.addEventListener("mouseover", (e) => {
      const td = targetOf(e)?.closest("td.ig-has-comment");
      if (td) this._showCommentTip(td);
    });
    this._tbody.addEventListener("mouseout", (e) => {
      const td = targetOf(e)?.closest("td.ig-has-comment");
      if (td && !td.contains(e.relatedTarget)) this._hideCommentTip();
    });
    this._tbody.addEventListener("pointerover", (e) => {
      if (!this._dragging) return;
      const td = targetOf(e)?.closest("td[data-field]");
      if (td) this._dragOver(td);
    });
    this._tbody.addEventListener("dblclick", (e) => {
      if (!targetOf(e)?.closest(".ig-fill-handle")) return;
      e.preventDefault();
      const bounds = this._rangeBounds();
      if (bounds) this.fill("down", this._view.length - 1 - bounds.r2);
    });
    this._tbody.addEventListener("click", (e) => {
      const group = targetOf(e)?.closest("tr.ig-group-row")?.dataset.group;
      if (group !== void 0) {
        this.toggleGroup(group);
        return;
      }
      const td = targetOf(e)?.closest("td") ?? null;
      const tr = targetOf(e)?.closest("tr");
      if (!tr || !tr.dataset.id || this._editing?.td === td) return;
      const id = tr.dataset.id;
      if (td?.dataset.field && !this._active) this._setActive(id, td.dataset.field);
      if (td?.classList.contains("ig-select-cell") || this.options.selection.selectOnClick === true) this._clickSelect(id, e);
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
  /**
   * Which columns to render: pinned ones always, scrollable ones windowed when there are more than
   * `virtualColumns` of them.
   */
  _columnPlan() {
    const columns = this.visibleColumns;
    const left = columns.filter((c) => c.pinned === "left");
    const right = columns.filter((c) => c.pinned === "right");
    const scrollable = columns.filter((c) => c.pinned !== "left" && c.pinned !== "right");
    const selection = this.selectionMode !== "none" && !!this.options.selection.checkbox;
    let center = scrollable;
    let before = 0;
    let after = 0;
    if (scrollable.length > this.options.virtualColumns) {
      const pinnedLeft = (selection ? SELECTION_WIDTH : 0) + left.reduce((sum2, c) => sum2 + widthOf(c), 0);
      const pinnedRight = right.reduce((sum2, c) => sum2 + widthOf(c), 0);
      const width = this._scroller?.clientWidth || 1200;
      const range = columnWindow(scrollable.map(widthOf), Math.max(0, this._scroller?.scrollLeft ?? 0), Math.max(200, width - pinnedLeft - pinnedRight), 2);
      center = scrollable.slice(range.start, range.end);
      before = range.before;
      after = range.after;
    }
    const sticky = /* @__PURE__ */ new Map();
    let offset = selection && left.length ? SELECTION_WIDTH : 0;
    left.forEach((column, i) => {
      sticky.set(column.field, { side: "left", offset, edge: i === left.length - 1 });
      offset += widthOf(column);
    });
    offset = 0;
    [...right].reverse().forEach((column, i) => {
      sticky.set(column.field, { side: "right", offset, edge: i === right.length - 1 });
      offset += widthOf(column);
    });
    const key = [selection, ...left.map((c) => c.field), "|", before, ...center.map((c) => c.field), after, "|", ...right.map((c) => c.field)].join(",");
    return { left, center, right, before, after, selection, sticky, key };
  }
  /** Cells of a row in plan order; spacers keep the width of the columns that are not rendered. */
  _planCells(plan, cell, spacer, selectionCell) {
    const cells = [];
    if (plan.selection) {
      const select = selectionCell();
      if (plan.left.length) select.classList.add("ig-pinned", "ig-pinned-left");
      cells.push(select);
    }
    const place = (column) => {
      const element = cell(column);
      const pin = plan.sticky.get(column.field);
      if (pin) {
        element.classList.add("ig-pinned", `ig-pinned-${pin.side}`);
        if (pin.edge) element.classList.add(`ig-pinned-${pin.side}-edge`);
        element.style[pin.side] = `${pin.offset}px`;
      }
      return element;
    };
    cells.push(...plan.left.map(place));
    if (plan.before) cells.push(spacer());
    cells.push(...plan.center.map(place));
    if (plan.after) cells.push(spacer());
    cells.push(...plan.right.map(place));
    return cells;
  }
  _renderHeader() {
    const plan = this._plan = this._columnPlan();
    clear(this._colgroup);
    clear(this._thead);
    const tr = h("tr", { "aria-rowindex": "1" });
    const multi = this._sort.length > 1;
    const pinnedWidths = plan.left.length || plan.right.length || plan.before || plan.after;
    const col = (column, width) => h("col", {
      class: column ? null : "ig-col-spacer",
      style: column ? { width: column.width || pinnedWidths ? `${widthOf(column)}px` : null, minWidth: `${column.minWidth}px` } : { width: `${width}px` }
    });
    if (plan.selection) this._colgroup.append(h("col", { class: "ig-select-col" }));
    for (const column of plan.left) this._colgroup.append(col(column));
    if (plan.before) this._colgroup.append(col(null, plan.before));
    for (const column of plan.center) this._colgroup.append(col(column));
    if (plan.after) this._colgroup.append(col(null, plan.after));
    for (const column of plan.right) this._colgroup.append(col(column));
    const cols = [...this._colgroup.children];
    const colFor = (field) => {
      const index = [...plan.selection ? [null] : [], ...plan.left, ...plan.before ? [null] : [], ...plan.center, ...plan.after ? [null] : [], ...plan.right].findIndex((column) => column?.field === field);
      return cols[index];
    };
    this._selectAllBox = plan.selection && this.selectionMode === "multiple" ? h("input", { type: "checkbox", "aria-label": this.t("selectAll"), onchange: (e) => e.target.checked ? this.selectAll() : this.clearSelection() }) : null;
    const headerCell = (column) => {
      const col2 = colFor(column.field);
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
        column.resizable ? h("span", { class: "ig-resize", onpointerdown: (e) => this._startResize(e, column, col2) }) : null
      );
      th.addEventListener("click", (e) => {
        if (targetOf(e)?.closest(".ig-filter-btn, .ig-resize")) return;
        const additive = this.options.sort.mode === "toggle" || e.shiftKey || e.ctrlKey || e.metaKey;
        this.toggleSort(column.field, additive);
      });
      return th;
    };
    tr.append(...this._planCells(plan, headerCell, () => h("th", { class: "ig-spacer-cell", "aria-hidden": "true" }), () => h("th", { class: "ig-select-cell" }, this._selectAllBox)));
    this._thead.append(tr);
    this._syncSelectAll();
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
      this._plan = null;
      this._renderWindow(true);
      this.emit("columnResize", { field: column.field, width: column.width });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  /** The rows to show changed (query, inserts, deletes): rebuild the layout and render the window. */
  _renderBody() {
    if (this._groupBy.length) this._sortGroups();
    this._stats.clear();
    this._viewIndex = new Map(this._view.map((row, i) => [row._id, i]));
    this._buildDisplay();
    this._layout.setKeys(this._display ? this._display.map((item) => typeof item === "number" ? this._view[item]._id : `${item.key}`) : this._view.map((row) => row._id));
    this._table.setAttribute("aria-rowcount", String(this._view.length + 1));
    this._renderWindow(true);
    this._showMessage(this._view.length || this._append?.loading ? null : this.t("noRows"));
    this._syncSelectAll();
  }
  /** Height of the visible area below the sticky header and above the sticky footer. */
  _viewportHeight() {
    const view = this._scroller.ownerDocument.defaultView;
    const max = view ? parseFloat(view.getComputedStyle(this._scroller).maxHeight) : NaN;
    const height = Math.max(this._scroller.clientHeight, Number.isFinite(max) ? max : 0) || (typeof this.options.height === "number" ? this.options.height : 480);
    return Math.max(1, height - (this._thead.offsetHeight || 0) - (this._tfoot.offsetHeight || 0));
  }
  /**
   * Renders only the rows (and, with many columns, the columns) in view, plus spacers that keep the
   * scroll size of the rest. Rows that stay in view are reused.
   * @param force re-render every row (columns or data changed)
   */
  _renderWindow(force = false) {
    const plan = this._columnPlan();
    if (!this._plan || plan.key !== this._plan.key) {
      this._renderHeader();
      this._renderFooter();
      force = true;
    }
    const scrollTop = Math.max(0, this._scroller.scrollTop - (this._thead.offsetHeight || 0));
    const [start, end] = this._layout.window(scrollTop, this._viewportHeight(), this.options.overscan);
    if (!force && start === this._rowWindow[0] && end === this._rowWindow[1]) return;
    if (this._editing) {
      const index = this._displayOf(this._editing.id) ?? -1;
      if (index < start || index >= end) {
        if (!this._closeEditor(true)) this._closeEditor(false);
      }
    }
    this._rowWindow = [start, end];
    const rows = [];
    const next = /* @__PURE__ */ new Map();
    const groups = /* @__PURE__ */ new Map();
    for (let i = start; i < end; i++) {
      const item = this._display ? this._display[i] : i;
      if (typeof item !== "number") {
        const tr2 = (force ? void 0 : this._groupEls.get(item.key)) ?? this._createGroupRow(item, i);
        groups.set(item.key, tr2);
        rows.push(tr2);
        continue;
      }
      const row = this._view[item];
      let tr = force ? void 0 : this._rowEls.get(row._id);
      if (!tr) tr = this._createRow(row, i);
      next.set(row._id, tr);
      rows.push(tr);
    }
    this._rowEls = next;
    this._groupEls = groups;
    const current = this._plan;
    const columnCount = (current.selection ? 1 : 0) + current.left.length + current.center.length + current.right.length + (current.before ? 1 : 0) + (current.after ? 1 : 0);
    this._setSpacer(this._topSpacer, this._layout.offsetOf(start), columnCount);
    this._setSpacer(this._bottomSpacer, this._layout.total - this._layout.offsetOf(end), columnCount);
    this._tbody.replaceChildren(this._topSpacer, ...rows, this._bottomSpacer);
    this._measureRows(start, rows);
    this._paintRange();
  }
  _setSpacer(tr, height, columns) {
    let td = tr.firstElementChild;
    if (!td) {
      td = h("td");
      tr.append(td);
    }
    td.colSpan = Math.max(1, columns);
    td.style.height = `${Math.max(0, height)}px`;
    tr.hidden = height <= 0;
  }
  /**
   * Rows taller than the default (wrapped text) are measured, so the scroll size stays exact.
   * The first rendered row also calibrates the default height when no rowHeight is configured.
   */
  _measureRows(start, rows) {
    if (!rows.length) return;
    let changed = false;
    if (!this._calibrated) {
      const height = rows[0].offsetHeight;
      if (height > 0) {
        this._layout.setDefaultHeight(height);
        this._calibrated = true;
        changed = true;
      }
    }
    if (this.columns.some((c) => c.wrap && c.visible)) {
      rows.forEach((tr, i) => {
        const height = tr.offsetHeight;
        if (height > 0 && this._layout.measure(start + i, height)) changed = true;
      });
    }
    if (changed) {
      const [first, last] = this._rowWindow;
      const columns = this._topSpacer.firstElementChild?.colSpan ?? 1;
      this._setSpacer(this._topSpacer, this._layout.offsetOf(first), columns);
      this._setSpacer(this._bottomSpacer, this._layout.total - this._layout.offsetOf(last), columns);
    }
  }
  /**
   * Scrolls so that a row is visible.
   * @param index position in the filtered and sorted rows
   */
  scrollToRow(index) {
    if (index < 0 || index >= this._view.length) return;
    const id = this._view[index]._id;
    if (this._display && !this._displayIndex.has(id)) this._openGroupsOf(id);
    const position = this._displayOf(id) ?? index;
    const top = this._layout.offsetOf(position);
    const bottom = top + this._layout.heightOf(position);
    const viewTop = this._scroller.scrollTop;
    const viewport = this._viewportHeight();
    if (top < viewTop) this._scroller.scrollTop = top;
    else if (bottom > viewTop + viewport) this._scroller.scrollTop = bottom - viewport;
    this._renderWindow();
  }
  /** Scrolls horizontally so that a column is rendered and visible. */
  _scrollToColumn(field) {
    const column = this.getColumn(field);
    if (!column || column.pinned === "left" || column.pinned === "right") return;
    const scrollable = this.visibleColumns.filter((c) => c.pinned !== "left" && c.pinned !== "right");
    let x = 0;
    for (const c of scrollable) {
      if (c.field === field) break;
      x += widthOf(c);
    }
    const pinnedLeft = (this._plan?.selection ? SELECTION_WIDTH : 0) + (this._plan?.left ?? []).reduce((sum2, c) => sum2 + widthOf(c), 0);
    const viewLeft = this._scroller.scrollLeft;
    const width = (this._scroller.clientWidth || 1200) - pinnedLeft;
    if (x < viewLeft) this._scroller.scrollLeft = x;
    else if (x + widthOf(column) > viewLeft + width) this._scroller.scrollLeft = x + widthOf(column) - width;
    this._renderWindow();
  }
  _rowClasses(row, changed, index) {
    const classes = ["ig-row"];
    if (index % 2 === 1) classes.push("ig-row-alt");
    if (this._selected.has(row._id)) classes.push("ig-selected");
    if (this._tracker?.isInserted(row._id)) classes.push("ig-row-inserted");
    else if (Object.keys(changed).length) classes.push("ig-row-updated");
    if (typeof this.options.rowClass === "function") classes.push(this.options.rowClass(this._publicRow(row)) ?? "");
    return classes;
  }
  _createRow(row, index = this._displayOf(row._id) ?? 0) {
    const tr = h("tr", { dataset: { id: row._id }, "aria-selected": String(this._selected.has(row._id)), "aria-rowindex": String(index + 2) });
    const changed = this._tracker ? this._tracker.changedFields(row._id, this._readers) : {};
    tr.className = this._rowClasses(row, changed, index).join(" ").trim();
    this._applyFormats(tr, this.options.rowFormats, row);
    const plan = this._plan ?? this._columnPlan();
    tr.append(...this._planCells(
      plan,
      (column) => this._createCell(row, column, changed[column.field]),
      () => h("td", { class: "ig-spacer-cell", "aria-hidden": "true" }),
      () => h("td", { class: "ig-select-cell" }, h("input", {
        type: this.selectionMode === "single" ? "radio" : "checkbox",
        tabindex: "-1",
        checked: this._selected.has(row._id),
        "aria-label": "select"
      }))
    ));
    return tr;
  }
  /** Re-renders one row in place when it is in view. */
  _replaceRow(id) {
    const old = this._rowEls.get(id);
    const index = this._viewIndex.get(id);
    if (!old || index === void 0) {
      if (this._display && index !== void 0) this._refreshGroupRows(id);
      return;
    }
    if (this._display && this._groupPath(this._view[index]).at(-1) !== this._groupOf.get(id)) {
      this._renderBody();
      return;
    }
    const tr = this._createRow(this._view[index], this._displayOf(id) ?? index);
    old.replaceWith(tr);
    this._rowEls.set(id, tr);
    if (this._display) this._refreshGroupRows(id);
    if (this._focus) this._paintRange();
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
    if (column.wrap) classes.push("ig-wrap");
    if (this._comments.get(row._id)?.has(column.field)) classes.push("ig-has-comment");
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
    } else if (column.sparkline && !isErrorCode(value)) {
      td.classList.add("ig-sparkline-cell");
      td.append(sparkline(sparklineValues(value), column.sparkline === true ? {} : column.sparkline));
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
    this._applyFormats(td, column.conditionalFormats, row, value, column);
    return td;
  }
  _columnStats(column) {
    if (!this._stats.has(column.field)) this._stats.set(column.field, columnStats(this._view.map((r) => r[column.field])));
    return this._stats.get(column.field) ?? null;
  }
  _applyPreset(td, format, value, column) {
    const stats = this._columnStats(column);
    if (!stats) return;
    if (format.type === "dataBar") {
      const low = format.min ?? Math.min(0, stats.min);
      const high = format.max ?? stats.max;
      td.classList.add("ig-databar");
      if (format.showValue === false) td.classList.add("ig-databar-only");
      td.style.setProperty("--ig-bar", `${(ratio(value, low, high) * 100).toFixed(1)}%`);
      if (format.color) td.style.setProperty("--ig-bar-color", format.color);
    } else if (format.type === "colorScale") {
      const background = scaleColor(colorScaleColors(format), ratio(value, format.min ?? stats.min, format.max ?? stats.max));
      td.style.backgroundColor = background;
      const text = readableText(background);
      if (text) td.style.color = text;
    } else {
      const { icon, tone } = iconFor(format, value, stats);
      const mark = h("i", { class: `ig-cf-icon ig-cf-icon-${tone}`, "aria-hidden": "true", text: icon });
      if (format.showValue === false) td.replaceChildren(mark);
      else td.prepend(mark);
    }
  }
  /**
   * Conditional formats: [{formula: '=[@total] > 1000', className, style}] or [{when(value, row), ...}]
   */
  _applyFormats(element, formats, row, value, column) {
    for (const format of formats ?? []) {
      if (isPreset(format)) {
        if (column && typeof value === "number" && Number.isFinite(value)) this._applyPreset(element, format, value, column);
        continue;
      }
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
    const presets = this.visibleColumns.filter((c) => c.conditionalFormats?.some(isPreset));
    const statsOf = () => JSON.stringify(presets.map((c) => this._columnStats(c)));
    const before = presets.length ? statsOf() : null;
    const changed = [];
    this._view.forEach((row, i) => {
      if (targets && !targets.has(row._id)) return;
      const fresh = this.store.get(row._id);
      if (!fresh) return;
      this._view[i] = { ...fresh };
      changed.push(row._id);
    });
    this._stats.clear();
    if (before !== null && !this._editing && statsOf() !== before) {
      this._renderWindow(true);
    } else {
      for (const id of changed) {
        if (this._editing?.id !== id) this._replaceRow(id);
      }
    }
    if (!ids) this._showMessage(this._view.length ? null : this.t("noRows"));
    this._renderFooter();
    this._renderNavbar();
  }
  _renderFooter() {
    clear(this._tfoot);
    if (!this.visibleColumns.some((c) => c.footer)) return;
    const plan = this._plan ?? this._columnPlan();
    const tr = h("tr", { class: "ig-footer" });
    const cell = (column) => {
      if (!column.footer) return h("td", { dataset: { field: column.field } });
      const td = this._summaryCell(column, this._view);
      td.dataset.field = column.field;
      return td;
    };
    tr.append(...this._planCells(plan, cell, () => h("td", { class: "ig-spacer-cell" }), () => h("td", { class: "ig-select-cell" })));
    this._tfoot.append(tr);
  }
  /** A footer or subtotal cell: column.footer applied to the rows. */
  _summaryCell(column, rows) {
    const value = this._footerValue(column, rows);
    const shortcut = typeof column.footer === "string" && /^count/i.test(column.footer);
    const text = shortcut ? formatCell(value, { type: "integer", decimals: 0 }, {}, this.locale) : formatCell(value, column, {}, this.locale);
    return h("td", {
      class: `ig-cell ig-align-${column.align}${isErrorCode(value) ? " ig-error" : ""}`,
      title: this._footerFormula(column) ?? null,
      text: column.type === "boolean" && !isErrorCode(value) ? String(value ?? "") : text
    });
  }
  _renderNavbar() {
    if (this.options.statusBar) {
      const total = this._append?.total ?? this.store.count();
      const parts = [this.t("status", { shown: this._view.length, total })];
      if (this._selected.size) parts.push(this.t("selected", { count: this._selected.size }));
      if (this._notice) parts.push(this._notice);
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
    if (config.query && this._queryBuilder) {
      const active = isQueryActive(this._queryModel);
      left.append(h("button", {
        type: "button",
        class: `ig-btn ig-query-btn${active ? " ig-active" : ""}`,
        "aria-expanded": String(this._queryBuilder.isOpen),
        text: this.t("advancedFilter"),
        onclick: () => this.toggleQueryBuilder()
      }));
    }
    if (config.filters) {
      if (this._queryModel) {
        left.append(h(
          "span",
          { class: "ig-chip ig-chip-query" },
          h("span", { text: describeQuery(this._queryModel, this._columnMap, this.t, (value, column) => formatCell(value, column, {}, this.locale)) }),
          h("button", { type: "button", class: "ig-chip-remove", "aria-label": this.t("clear"), text: "\xD7", onclick: () => this.setQuery(null) })
        ));
      }
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
      if (Object.keys(this._filters).length || this._search || this._queryModel) {
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
    const editable = config.add || config.delete || this.columns.some((c) => c.editable);
    if (config.undo && editable) {
      right.append(
        h("button", { type: "button", class: "ig-btn ig-btn-icon", text: "\u21B6", "aria-label": this.t("undo"), title: this.t("undo") + (this._undo.undoLabel ? ` (${this._undo.undoLabel})` : ""), disabled: !this._undo.canUndo, onclick: () => this.undo() }),
        h("button", { type: "button", class: "ig-btn ig-btn-icon", text: "\u21B7", "aria-label": this.t("redo"), title: this.t("redo") + (this._undo.redoLabel ? ` (${this._undo.redoLabel})` : ""), disabled: !this._undo.canRedo, onclick: () => this.redo() })
      );
    }
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
    if (config.import) {
      const options = config.import === true ? {} : config.import;
      const input = h("input", { type: "file", accept: ".csv,.tsv,.txt,.xlsx", hidden: true });
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        input.value = "";
        if (file) await this._importFromNavbar(file, options);
      });
      right.append(input, button({ label: this.t("importFile"), onClick: () => input.click() }));
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
    return this._rowEls.get(id)?.querySelector(`td[data-field="${CSS.escape(field)}"]`) ?? null;
  }
  /**
   * Makes a cell active (collapsing the range) or, with extend, moves the other corner of the range.
   */
  _selectCell(id, field, extend) {
    if (!extend || !this._active) {
      this._setActive(id, field);
      return;
    }
    this._focus = { id, field };
    const index = this._viewIndex.get(id);
    if (index !== void 0) this.scrollToRow(index);
    if (!this._cellElement(id, field)) this._scrollToColumn(field);
    this._paintRange();
    this.emit("rangeChange", this.getRange());
  }
  _setActive(id, field) {
    this._tbody.querySelector(".ig-active")?.classList.remove("ig-active");
    const changed = !!this._focus;
    this._focus = null;
    this._active = { id, field };
    const index = this._viewIndex.get(id);
    if (index !== void 0) this.scrollToRow(index);
    if (!this._cellElement(id, field)) this._scrollToColumn(field);
    this._cellElement(id, field)?.classList.add("ig-active");
    this._paintRange();
    this.emit("activeCellChange", { id, field });
    if (changed) this.emit("rangeChange", this.getRange());
  }
  /* ---------------------------------------------------------------- comments */
  getComment(id, field) {
    return this._comments.get(id)?.get(field) ?? null;
  }
  /** Comments of the rows that exist, in no particular order. */
  getComments() {
    const comments = [];
    for (const [id, fields] of this._comments) {
      if (!this.store.has(id)) continue;
      for (const [field, text] of fields) comments.push({ id, field, text });
    }
    return comments;
  }
  /** Sets (or with null / '' removes) the comment of a cell; undoable. */
  setComment(id, field, text) {
    if (!this.store.has(id) || !this.getColumn(field)) return false;
    const before = this.getComment(id, field);
    const after = text ? text : null;
    if (before === after) return false;
    this.batch(() => {
      this._writeComment(id, field, after);
      if (!this._replaying) this._undo.record({ kind: "comment", id, field, before, after });
    }, "comment");
    this._replaceRow(id);
    this._renderNavbar();
    this.emit("commentChange", { id, field, text: after, oldText: before });
    return true;
  }
  _writeComment(id, field, text) {
    const fields = this._comments.get(id);
    if (text) {
      if (fields) fields.set(field, text);
      else this._comments.set(id, /* @__PURE__ */ new Map([[field, text]]));
    } else if (fields) {
      fields.delete(field);
      if (!fields.size) this._comments.delete(id);
    }
  }
  /** Opens the comment editor of a cell (Shift+F2). Ctrl+Enter saves, Esc cancels. */
  editComment(id, field) {
    const td = this._cellElement(id, field);
    if (!td) return;
    this._hideCommentTip();
    const textarea = h("textarea", { class: "ig-input ig-comment-input", rows: 4, "aria-label": this.t("comment") });
    textarea.value = this.getComment(id, field) ?? "";
    const save = () => {
      this.setComment(id, field, textarea.value.trim() || null);
      this.closePopover();
      this.focus();
    };
    const menu = h(
      "div",
      { class: "ig-popover ig-comment-editor", role: "dialog", "aria-label": this.t("comment") },
      textarea,
      h(
        "div",
        { class: "ig-comment-actions" },
        h("button", { type: "button", class: "ig-btn", text: this.t("deleteComment"), onclick: () => {
          textarea.value = "";
          save();
        } }),
        h("button", { type: "button", class: "ig-btn", text: this.t("cancel"), onclick: () => {
          this.closePopover();
          this.focus();
        } }),
        h("button", { type: "button", class: "ig-btn ig-btn-primary", text: this.t("saveComment"), onclick: save })
      )
    );
    textarea.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        save();
      } else if (e.key === "Escape") {
        this.closePopover();
        this.focus();
      }
    });
    this.showPopover(menu, td);
    textarea.focus();
  }
  _showCommentTip(td) {
    const id = td.closest("tr")?.dataset.id;
    const text = id ? this.getComment(id, td.dataset.field) : null;
    if (!text || this._popover) return;
    this._commentTip ??= h("div", { class: "ig-comment-tip", role: "tooltip" });
    this._commentTip.textContent = text;
    this.root.append(this._commentTip);
    const rootBox = this.root.getBoundingClientRect();
    const box = td.getBoundingClientRect();
    this._commentTip.style.left = `${Math.max(0, Math.min(box.right - rootBox.left + 4, rootBox.width - 220))}px`;
    this._commentTip.style.top = `${box.top - rootBox.top}px`;
  }
  _hideCommentTip() {
    this._commentTip?.remove();
  }
  /* ---------------------------------------------------------------- server changes */
  /**
   * Applies rows or deletions that come from the server (SSE blocks, WebSocket pushes, polling):
   * rows with a known id update it, the others are added, ids are removed. Server changes are not
   * unsaved changes and cannot be undone. Fields the user edited and did not save keep the user's value.
   * @return ids inserted, updated and removed
   */
  applyServerChanges(change, { refresh = true } = {}) {
    const result = { inserted: [], updated: [], removed: [] };
    if (change.type === "delete" || !change.rows && change.ids) {
      const ids = (change.ids ?? []).map(String).filter((id) => this.store.has(id));
      if (ids.length) {
        const gone = new Set(ids);
        this.store.remove(ids);
        this.calc.forgetRows(ids);
        this._tracker?.forget(gone);
        ids.forEach((id) => this._selected.delete(id));
        this._view = this._view.filter((row) => !gone.has(row._id));
        this.calc.recalculate([], this.columns.map((c) => c.field));
        result.removed = ids;
      }
    }
    const fresh = [];
    for (const row of change.rows ?? []) {
      const raw = this.options.idField ? row[this.options.idField] : row._id;
      const id = raw === void 0 || raw === null || raw === "" ? null : String(raw);
      if (id === null || !this.store.has(id)) {
        fresh.push(row);
        continue;
      }
      const edited = this._tracker ? this._tracker.changedFields(id, this._readers) : {};
      const patch = {};
      for (const [field, value] of Object.entries(row)) {
        if (field === "_id" || field in edited || this.getColumn(field)?.formula) continue;
        patch[field] = value;
        this._tracker?.rebase(id, field, encodeValue(value));
      }
      this.store.update(id, patch);
      result.updated.push(id);
    }
    if (fresh.length) {
      result.inserted = this._insert(fresh);
      for (const id of result.inserted) this._view.push({ ...this.store.get(id) });
    }
    if (result.updated.length) {
      const scope = this.calc.recalculate(result.updated, this.columns.map((c) => c.field));
      this._syncRows(scope === "all" ? null : result.updated);
    }
    if (result.inserted.length || result.removed.length) {
      if (refresh && this._hasLocalQuery()) this.refresh();
      else {
        this._renderBody();
        this._renderFooter();
        this._renderNavbar();
      }
    }
    this.emit("serverChange", result);
    return result;
  }
  _hasLocalQuery() {
    if (this._append?.serverSide) return false;
    return !!(this._sort.length || Object.keys(this._filters).length || this._search || this._queryModel || this._groupBy.length);
  }
  /**
   * Loads rows from a Server-Sent Events endpoint in blocks (sorla-db 1.7.1+ stream protocol:
   * meta, rows, delete, end). Rows show up as each block arrives; sorting and filters are applied
   * again a few times per second and when the stream ends. The status bar shows the progress.
   * @return the stream controller: done (a promise), state, close()
   */
  loadStream(url, options = {}) {
    const Sorla = this.store.sorla.constructor;
    if (typeof Sorla.stream !== "function") throw new Error("loadStream needs sorla-db 1.7.1 or later");
    const { replace = true, onProgress, ...streamOptions } = options;
    this._stream?.close();
    if (replace) this.setData([]);
    const refreshSoon = () => {
      if (this._streamRefresh !== void 0 || !this._hasLocalQuery()) return;
      this._streamRefresh = setTimeout(() => {
        this._streamRefresh = void 0;
        this.refresh();
      }, 300);
    };
    const progress = (state) => {
      this._notice = state.total ? this.t("streamProgress", { loaded: state.loaded, total: state.total }) : this.t("streamLoaded", { loaded: state.loaded });
      this._renderNavbar();
      onProgress?.(state);
    };
    this._setLoading(true);
    const stream = Sorla.stream(url, {
      ...streamOptions,
      onProgress: progress,
      apply: (type, data) => {
        const list = Array.isArray(data) ? data : data;
        if (type === "rows") this.applyServerChanges({ type: "rows", rows: Array.isArray(list) ? list : list.rows ?? [] }, { refresh: false });
        else if (type === "delete") this.applyServerChanges({ type: "delete", ids: Array.isArray(list) ? list : list.ids ?? [] }, { refresh: false });
        else throw new Error(`The grid does not apply "${type}" events`);
        refreshSoon();
      }
    });
    this._stream = stream;
    const finish = () => {
      if (this._stream !== stream) return;
      this._stream = null;
      clearTimeout(this._streamRefresh);
      this._streamRefresh = void 0;
      this._setLoading(false);
      if (this._hasLocalQuery()) this.refresh();
    };
    stream.done.then((state) => {
      finish();
      this._showNotice(this.t("streamDone", { loaded: state.loaded }));
      this.emit("streamEnd", state);
    }, (error) => {
      finish();
      this._showNotice(error instanceof Error ? error.message : String(error));
      this.emit("streamError", { error });
    });
    return stream;
  }
  /* ---------------------------------------------------------------- duplicates */
  /**
   * Rows that repeat an earlier row in the given columns (the first of each set is not included).
   * @return ids, in view order
   */
  findDuplicates({ fields, matchCase = false, scope = "filtered" } = {}) {
    const columns = fields ?? this.visibleColumns.filter((c) => !c.formula).map((c) => c.field);
    const rows = scope === "all" ? this.store.ids().map((id) => this.store.get(id)) : this._view;
    const seen = /* @__PURE__ */ new Set();
    const duplicates = [];
    for (const row of rows) {
      const key = JSON.stringify(columns.map((field) => {
        const value = this._publicValue(row[field]);
        return typeof value === "string" && !matchCase ? value.trim().toLocaleLowerCase(this.locale) : value;
      }));
      if (seen.has(key)) duplicates.push(row._id);
      else seen.add(key);
    }
    return duplicates;
  }
  /**
   * Deletes the duplicate rows (see findDuplicates), as one undo step. No confirmation is asked.
   * @return removed ids
   */
  removeDuplicates(options = {}) {
    const ids = this.findDuplicates(options);
    return ids.length ? this.deleteRows(ids) : [];
  }
  /* ---------------------------------------------------------------- import */
  /**
   * Imports a .csv, .tsv, .txt or .xlsx file (for example from an <input type="file">).
   * Headers are matched to columns by field or title, ignoring case; values are read like typed text.
   */
  async importFile(file, options = {}) {
    const bytes = new Uint8Array(await readBlob(file));
    const zip2 = bytes[0] === 80 && bytes[1] === 75;
    if (zip2 || /\.xlsx$/i.test(file.name ?? "")) return this.importXLSX(bytes, options);
    const text = new TextDecoder().decode(bytes);
    return this.importCSV(text, { delimiter: /\.tsv$/i.test(file.name ?? "") ? "	" : void 0, ...options });
  }
  async _importFromNavbar(file, options) {
    const summary = this.getChangeSummary();
    if ((options.mode ?? "replace") === "replace" && this.hasChanges() && !await this.confirm({
      action: "import",
      title: this.t("importFile"),
      message: this.t("confirmImport", { count: summary.total }),
      confirmLabel: this.t("importFile"),
      danger: true
    })) return;
    try {
      const result = await this.importFile(file, options);
      this._showNotice(result.errors.length ? this.t("importErrors", { count: result.rows, errors: result.errors.length }) : this.t("importDone", { count: result.rows }));
    } catch (error) {
      this._showNotice(error instanceof Error ? error.message : String(error));
      this.emit("importError", { error });
    }
  }
  _showNotice(text) {
    this._notice = text;
    clearTimeout(this._noticeTimer);
    this._noticeTimer = setTimeout(() => {
      this._notice = null;
      this._renderNavbar();
    }, 6e3);
    this._renderNavbar();
  }
  /** Imports CSV / TSV text. */
  importCSV(text, options = {}) {
    return this.importTable(parseDelimited(text, options.delimiter), options);
  }
  /** Imports the first sheet (or options.sheet) of an .xlsx file. */
  async importXLSX(data, options = {}) {
    const sheet = await readXlsx(data, { sheet: options.sheet });
    return { ...this.importTable(sheet.rows, options), sheet: sheet.name };
  }
  /**
   * Imports rows of cells (the first one being the header unless header: false).
   * Text is parsed like typed input (numbers, dates, options in the grid locale); other values are kept.
   */
  importTable(table, { mode: mode2 = "replace", header = true, createColumns } = {}) {
    const lines = table.filter((line) => line.some((cell) => cell !== null && cell !== void 0 && cell !== ""));
    const headerLine = header ? (lines.shift() ?? []).map((cell) => String(cell ?? "").trim()) : null;
    const create = createColumns ?? this.columns.length === 0;
    const lookup = /* @__PURE__ */ new Map();
    for (const column of this.columns) {
      lookup.set(column.field.toLocaleLowerCase(this.locale), column);
      lookup.set(column.title.toLocaleLowerCase(this.locale), column);
    }
    const skipped = [];
    const created = [];
    const targets = headerLine ? headerLine.map((title, i) => {
      const column = title ? lookup.get(title.toLocaleLowerCase(this.locale)) : void 0;
      if (column) return column.formula ? null : { field: column.field, column };
      if (!title || !create) {
        if (title) skipped.push(title);
        return null;
      }
      const field = created.some((c) => c.field === title) ? `${title} ${i + 1}` : title;
      created.push({ field, title, type: inferType(lines.map((line) => line[i])) });
      return { field, column: null };
    }) : this.columns.filter((c) => !c.formula).map((column) => ({ field: column.field, column }));
    if (created.length) {
      this._setColumns([...this.columns.map(({ ...column }) => column), ...created]);
      this._renderHeader();
      for (const target of targets) if (target && !target.column) target.column = this.getColumn(target.field);
    }
    const errors = [];
    const rows = lines.map((line, n) => {
      const row = {};
      targets.forEach((target, i) => {
        if (!target?.column) return;
        const raw = line[i];
        if (raw === null || raw === void 0 || raw === "") return;
        if (typeof raw !== "string") {
          row[target.field] = raw;
          return;
        }
        const parsed = parseInput(raw, target.column, this.locale);
        if (parsed.error) errors.push({ line: n + (header ? 2 : 1), field: target.field, value: raw, error: this.t(parsed.error) });
        else row[target.field] = parsed.value;
      });
      return row;
    });
    if (mode2 === "append") this.addRows(rows);
    else this.setData(rows);
    const result = { rows: rows.length, fields: targets.filter((t) => t !== null).map((t) => t.field), skipped, errors };
    this.emit("import", { ...result });
    return result;
  }
  /* ---------------------------------------------------------------- grouping */
  /**
   * Groups the rows by one or more fields (outermost first), with a group row showing the value,
   * the row count and subtotals (column `subtotal`, or its `footer`). Pass [] or null to ungroup.
   */
  setGroupBy(fields) {
    this._groupBy = (fields ?? []).filter((field) => this.getColumn(field));
    this._collapsed.clear();
    this._knownGroups.clear();
    this._scroller.scrollTop = 0;
    this.refresh();
    this.emit("groupChange", { groupBy: [...this._groupBy] });
  }
  getGroupBy() {
    return [...this._groupBy];
  }
  /** Groups in display order, including the ones inside collapsed groups. */
  getGroups() {
    const groups = [];
    this._eachGroup((group) => {
      groups.push({ key: group.key, level: group.level, field: group.field, value: this._publicValue(group.value), count: group.end - group.start, collapsed: this._collapsed.has(group.key) });
    });
    return groups;
  }
  /** Opens or closes a group (by key, see getGroups()); without `open` it toggles. */
  toggleGroup(key, open) {
    const collapse = open === void 0 ? !this._collapsed.has(key) : !open;
    if (collapse === this._collapsed.has(key)) return;
    if (collapse) this._collapsed.add(key);
    else this._collapsed.delete(key);
    if (collapse && this._active && this._groupOf.get(this._active.id)?.startsWith(key)) {
      this._active = null;
      this._focus = null;
    }
    this._renderBody();
    this.emit("groupToggle", { key, collapsed: collapse });
  }
  expandGroups() {
    this._collapsed.clear();
    this._collapseNew = false;
    this._renderBody();
  }
  collapseGroups() {
    this._eachGroup((group) => {
      this._collapsed.add(group.key);
    });
    this._collapseNew = true;
    this._active = null;
    this._focus = null;
    this._renderBody();
  }
  _publicValue(value) {
    return value === "" || value === void 0 ? null : value;
  }
  _groupPart(field, value) {
    const v = this._publicValue(value);
    return `${field}=${v === null ? "" : `${typeof v}:${String(v)}`}`;
  }
  /** Keys of the groups a row belongs to, outermost first. */
  _groupPath(row) {
    const keys = [];
    let key = "";
    for (const field of this._groupBy) {
      key = key ? `${key}${this._groupPart(field, row[field])}` : this._groupPart(field, row[field]);
      keys.push(key);
    }
    return keys;
  }
  _sortGroups() {
    const fields = this._groupBy.map((field) => ({ field, dir: this._sort.find((s) => s.field === field)?.dir ?? "asc" }));
    this._view.sort((a, b) => {
      for (const { field, dir } of fields) {
        const result = compareCells(a[field], b[field], { dir, locale: this.locale });
        if (result) return result;
      }
      return 0;
    });
  }
  /** Calls fn for every group in display order, with whether it is hidden inside a collapsed group. */
  _eachGroup(fn, onRows) {
    const fields = this._groupBy;
    if (!fields.length) return;
    const walk = (start, end, level, parent, hidden) => {
      if (level === fields.length) {
        if (!hidden) onRows?.(start, end);
        return;
      }
      const field = fields[level];
      let i = start;
      while (i < end) {
        const part = this._groupPart(field, this._view[i][field]);
        let j = i + 1;
        while (j < end && this._groupPart(field, this._view[j][field]) === part) j++;
        const key = parent ? `${parent}${part}` : part;
        const group = { key, level, field, value: this._view[i][field], start: i, end: j };
        fn(group, hidden);
        walk(i, j, level + 1, key, hidden || this._collapsed.has(key));
        i = j;
      }
    };
    walk(0, this._view.length, 0, "", false);
  }
  _buildDisplay() {
    this._displayIndex.clear();
    this._groupOf.clear();
    if (!this._groupBy.length) {
      this._display = null;
      return;
    }
    const display = [];
    this._eachGroup((group, hidden) => {
      if (!this._knownGroups.has(group.key)) {
        this._knownGroups.add(group.key);
        if (this._collapseNew) this._collapsed.add(group.key);
      }
      if (group.level === this._groupBy.length - 1) {
        for (let i = group.start; i < group.end; i++) this._groupOf.set(this._view[i]._id, group.key);
      }
      if (!hidden) display.push(group);
    }, (start, end) => {
      for (let i = start; i < end; i++) {
        this._displayIndex.set(this._view[i]._id, display.length);
        display.push(i);
      }
    });
    this._display = display;
  }
  /** Position of a row in the rendered list; undefined when it is hidden in a collapsed group. */
  _displayOf(id) {
    return this._display ? this._displayIndex.get(id) : this._viewIndex.get(id);
  }
  /** The nearest view index at or after (direction 1) or before (-1) that is not hidden. */
  _visibleRow(index, direction) {
    if (!this._display) return index;
    for (let i = index; i >= 0 && i < this._view.length; i += direction) {
      if (this._displayIndex.has(this._view[i]._id)) return i;
    }
    for (let i = index - direction; i >= 0 && i < this._view.length; i -= direction) {
      if (this._displayIndex.has(this._view[i]._id)) return i;
    }
    return index;
  }
  _openGroupsOf(id) {
    const key = this._groupOf.get(id);
    if (!key) return;
    let changed = false;
    for (const collapsed of [...this._collapsed]) {
      if (key === collapsed || key.startsWith(`${collapsed}`)) {
        this._collapsed.delete(collapsed);
        changed = true;
      }
    }
    if (changed) this._renderBody();
  }
  /** Re-renders the visible group rows that contain a row (their subtotals changed). */
  _refreshGroupRows(id) {
    const key = this._groupOf.get(id);
    if (!key || !this._display) return;
    for (const [groupKey, tr] of this._groupEls) {
      if (key !== groupKey && !key.startsWith(`${groupKey}`)) continue;
      const position = Number(tr.dataset.position);
      const item = this._display[position];
      if (typeof item !== "object" || item.key !== groupKey) continue;
      const fresh = this._createGroupRow(item, position);
      tr.replaceWith(fresh);
      this._groupEls.set(groupKey, fresh);
    }
  }
  _createGroupRow(group, position) {
    const collapsed = this._collapsed.has(group.key);
    const column = this.getColumn(group.field);
    const count = group.end - group.start;
    const tr = h("tr", {
      class: `ig-group-row ig-group-level-${group.level}${collapsed ? " ig-group-collapsed" : ""}`,
      dataset: { group: group.key, position: String(position) },
      "aria-expanded": String(!collapsed),
      "aria-level": String(group.level + 1),
      "aria-rowindex": String(position + 2)
    });
    const plan = this._plan ?? this._columnPlan();
    const first = [...plan.left, ...plan.center, ...plan.right][0];
    const rows = this._view.slice(group.start, group.end);
    const value = group.value;
    const text = value === "" || value === null || value === void 0 ? this.t("blankGroup") : formatCell(value, column, this._publicRow(this._view[group.start]) ?? {}, this.locale);
    tr.append(...this._planCells(
      plan,
      (c) => {
        if (c === first) {
          return h(
            "td",
            { class: "ig-cell ig-group-label", style: { paddingLeft: `${8 + group.level * 18}px` } },
            h("button", {
              type: "button",
              class: "ig-group-toggle",
              tabindex: "-1",
              "aria-label": this.t(collapsed ? "expandGroup" : "collapseGroup"),
              text: collapsed ? "\u25B8" : "\u25BE"
            }),
            h("span", { class: "ig-group-title", text: `${column.title}: ${text}` }),
            h("span", { class: "ig-group-count", text: ` (${formatCell(count, { type: "integer", decimals: 0 }, {}, this.locale)})` })
          );
        }
        const subtotal = c.subtotal === void 0 ? c.footer : c.subtotal;
        if (!subtotal) return h("td", { class: "ig-cell" });
        return this._summaryCell({ ...c, footer: subtotal }, rows);
      },
      () => h("td", { class: "ig-spacer-cell" }),
      () => h("td", { class: "ig-select-cell" })
    ));
    return tr;
  }
  /* ---------------------------------------------------------------- ranges */
  /** Row and column positions of the selected range, or null. */
  _rangeBounds() {
    if (!this._active) return null;
    const columns = this.visibleColumns.map((c) => c.field);
    const focus = this._focus ?? this._active;
    const ra = this._viewIndex.get(this._active.id);
    const rb = this._viewIndex.get(focus.id);
    const ca = columns.indexOf(this._active.field);
    const cb = columns.indexOf(focus.field);
    if (ra === void 0 || rb === void 0 || ca === -1 || cb === -1) return null;
    return { r1: Math.min(ra, rb), r2: Math.max(ra, rb), c1: Math.min(ca, cb), c2: Math.max(ca, cb) };
  }
  /**
   * The selected range: from the active cell to the other corner.
   * @return {from, to, rows (ids, in display order), fields} or null
   */
  getRange() {
    const bounds = this._rangeBounds();
    if (!bounds || !this._active) return null;
    const fields = this.visibleColumns.slice(bounds.c1, bounds.c2 + 1).map((c) => c.field);
    const rows = this._view.slice(bounds.r1, bounds.r2 + 1).map((r) => r._id);
    return { from: { ...this._active }, to: { ...this._focus ?? this._active }, rows, fields };
  }
  /** Selects the cells between two corners; `from` becomes the active cell. */
  setRange(from, to = from) {
    this._setActive(from.id, from.field);
    if (to.id !== from.id || to.field !== from.field) this._selectCell(to.id, to.field, true);
  }
  /** Values of the selected range as rows of stored values. */
  getRangeValues() {
    const range = this.getRange();
    if (!range) return [];
    return range.rows.map((id) => {
      const row = this.getRow(id);
      return range.fields.map((field) => row[field]);
    });
  }
  /** Clears every editable cell of the range, as one undo step. @return cleared cells */
  clearRange() {
    const range = this.getRange();
    if (!range) return 0;
    let cleared = 0;
    this.batch(() => {
      for (const id of range.rows) {
        for (const field of range.fields) {
          const column = this.getColumn(field);
          const data = this.store.get(id);
          if (!this._isEditable(column, data) || data?.[field] === "" || data?.[field] === void 0) continue;
          if (this.setCellValue(id, field, null, { source: "edit" }).ok) cleared++;
        }
      }
    }, "clear");
    return cleared;
  }
  /** Marks the cells of the range in the rendered rows (and the fill handle on its corner). */
  _paintRange() {
    const bounds = this._rangeBounds();
    const multiple = !!bounds && (bounds.r1 !== bounds.r2 || bounds.c1 !== bounds.c2);
    const columns = new Map(this.visibleColumns.map((c, i) => [c.field, i]));
    for (const [id, tr] of this._rowEls) {
      const r = this._viewIndex.get(id) ?? -1;
      for (const td of tr.querySelectorAll("td[data-field]")) {
        const c = columns.get(td.dataset.field) ?? -1;
        const inside = multiple && r >= bounds.r1 && r <= bounds.r2 && c >= bounds.c1 && c <= bounds.c2;
        td.classList.toggle("ig-in-range", inside);
        td.classList.toggle("ig-range-top", inside && r === bounds.r1);
        td.classList.toggle("ig-range-bottom", inside && r === bounds.r2);
        td.classList.toggle("ig-range-left", inside && c === bounds.c1);
        td.classList.toggle("ig-range-right", inside && c === bounds.c2);
        td.classList.toggle("ig-find-match", this._highlighted.has(`${id}\0${td.dataset.field}`));
        const corner = !!bounds && r === bounds.r2 && c === bounds.c2;
        const handle = td.querySelector(".ig-fill-handle");
        if (corner && !handle && this._fillEnabled()) td.append(h("span", { class: "ig-fill-handle", "aria-hidden": "true" }));
        else if (!corner && handle) handle.remove();
      }
    }
  }
  /** Whether the fill handle is shown (something editable). */
  _fillEnabled() {
    return this.columns.some((c) => c.editable);
  }
  /** Range or fill drag: follows the pointer and scrolls when it nears an edge of the grid. */
  _startDrag(e, fill) {
    this._dragging = true;
    this._filling = fill ? { direction: "down", count: 0 } : null;
    this._pointer = { x: e.clientX, y: e.clientY };
    this.root.classList.add("ig-dragging");
    const move = (event) => {
      this._pointer = { x: event.clientX, y: event.clientY };
      if (!this._autoScroll) this._autoScroll = requestAnimationFrame(() => this._dragScroll());
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      cancelAnimationFrame(this._autoScroll);
      this._autoScroll = 0;
      this._dragging = false;
      this.root.classList.remove("ig-dragging");
      const filling = this._filling;
      this._filling = null;
      this._paintFill(null);
      if (filling?.count) this.fill(filling.direction, filling.count);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }
  _dragScroll() {
    this._autoScroll = 0;
    if (!this._dragging || !this._pointer) return;
    const box = this._scroller.getBoundingClientRect();
    const edge = 24;
    const { x, y } = this._pointer;
    const dy = y < box.top + edge ? y - box.top - edge : y > box.bottom - edge ? y - box.bottom + edge : 0;
    const dx = x < box.left + edge ? x - box.left - edge : x > box.right - edge ? x - box.right + edge : 0;
    if (!dx && !dy) return;
    this._scroller.scrollTop += dy;
    this._scroller.scrollLeft += dx;
    const td = document.elementFromPoint?.(Math.max(box.left + 1, Math.min(box.right - 1, x)), Math.max(box.top + 1, Math.min(box.bottom - 1, y)))?.closest("td[data-field]");
    if (td && this._tbody.contains(td)) this._dragOver(td);
    this._autoScroll = requestAnimationFrame(() => this._dragScroll());
  }
  _dragOver(td) {
    const id = td.closest("tr")?.dataset.id;
    if (!id) return;
    if (!this._filling) {
      this._selectCell(id, td.dataset.field, true);
      return;
    }
    const bounds = this._rangeBounds();
    const r = this._viewIndex.get(id);
    const c = this.visibleColumns.findIndex((column) => column.field === td.dataset.field);
    if (!bounds || r === void 0 || c === -1) return;
    const down = r - bounds.r2;
    const up = bounds.r1 - r;
    const right = c - bounds.c2;
    const left = bounds.c1 - c;
    const best = Math.max(down, up, right, left);
    let next = { direction: "down", count: 0 };
    if (best > 0) {
      if (down === best) next = { direction: "down", count: down };
      else if (up === best) next = { direction: "up", count: up };
      else if (right === best) next = { direction: "right", count: right };
      else next = { direction: "left", count: left };
    }
    this._filling = next;
    this._paintFill(next);
  }
  /** Cells a fill would write to, as view bounds. */
  _fillBounds(direction, count) {
    const b = this._rangeBounds();
    if (!b || count <= 0) return null;
    const lastRow = this._view.length - 1;
    const lastColumn = this.visibleColumns.length - 1;
    switch (direction) {
      case "down":
        return b.r2 >= lastRow ? null : { ...b, r1: b.r2 + 1, r2: Math.min(lastRow, b.r2 + count) };
      case "up":
        return b.r1 <= 0 ? null : { ...b, r1: Math.max(0, b.r1 - count), r2: b.r1 - 1 };
      case "right":
        return b.c2 >= lastColumn ? null : { ...b, c1: b.c2 + 1, c2: Math.min(lastColumn, b.c2 + count) };
      default:
        return b.c1 <= 0 ? null : { ...b, c1: Math.max(0, b.c1 - count), c2: b.c1 - 1 };
    }
  }
  _paintFill(fill) {
    const target = fill ? this._fillBounds(fill.direction, fill.count) : null;
    const columns = new Map(this.visibleColumns.map((c, i) => [c.field, i]));
    for (const [id, tr] of this._rowEls) {
      const r = this._viewIndex.get(id) ?? -1;
      for (const td of tr.querySelectorAll("td[data-field]")) {
        const c = columns.get(td.dataset.field) ?? -1;
        td.classList.toggle("ig-fill-target", !!target && r >= target.r1 && r <= target.r2 && c >= target.c1 && c <= target.c2);
      }
    }
  }
  /**
   * Copies the first row of the range into the rest of it (down, Ctrl+D) or the first column (right, Ctrl+R).
   * @return cells written
   */
  fillCopy(direction = "down") {
    const b = this._rangeBounds();
    if (!b) return 0;
    const rows = this._view;
    const columns = this.visibleColumns;
    let written = 0;
    this.batch(() => {
      for (let r = b.r1; r <= b.r2; r++) {
        for (let c = b.c1; c <= b.c2; c++) {
          if (direction === "down" ? r === b.r1 : c === b.c1) continue;
          const source = this.getRow(rows[direction === "down" ? b.r1 : r]._id);
          const field = columns[c].field;
          const value = source[direction === "down" ? field : columns[b.c1].field];
          if (this._fillCell(rows[r]._id, field, value)) written++;
        }
      }
    }, "fill");
    return written;
  }
  /**
   * Extends the selected range like Excel's fill handle: numbers and dates continue their step,
   * "Item 1" becomes "Item 2", anything else repeats. One undo step; the range grows over the filled cells.
   * @param direction where to fill
   * @param count rows (up / down) or columns (left / right) to fill
   * @return cells written
   */
  fill(direction, count) {
    const b = this._rangeBounds();
    const target = this._fillBounds(direction, count);
    if (!b || !target || !this._active) return 0;
    const rows = this._view;
    const columns = this.visibleColumns;
    const vertical = direction === "down" || direction === "up";
    const forward = direction === "down" || direction === "right";
    let written = 0;
    this.batch(() => {
      const lines = vertical ? [b.c1, b.c2] : [b.r1, b.r2];
      for (let line = lines[0]; line <= lines[1]; line++) {
        const cells = [];
        if (vertical) for (let r = b.r1; r <= b.r2; r++) cells.push([r, line]);
        else for (let c = b.c1; c <= b.c2; c++) cells.push([line, c]);
        const source = cells.map(([r, c]) => this.getRow(rows[r]._id)[columns[c].field]);
        const size = vertical ? target.r2 - target.r1 + 1 : target.c2 - target.c1 + 1;
        const type = vertical ? columns[line].type : "text";
        const values = forward ? fillSeries(source, size, type) : fillSeriesBackward(source, size, type);
        for (let i = 0; i < size; i++) {
          const r = vertical ? target.r1 + i : line;
          const c = vertical ? line : target.c1 + i;
          if (this._fillCell(rows[r]._id, columns[c].field, values[i])) written++;
        }
      }
    }, "fill");
    const corner = forward ? { id: rows[vertical ? target.r2 : b.r2]._id, field: columns[vertical ? b.c2 : target.c2].field } : { id: rows[vertical ? target.r1 : b.r1]._id, field: columns[vertical ? b.c1 : target.c1].field };
    const anchor = forward ? { id: rows[b.r1]._id, field: columns[b.c1].field } : { id: rows[b.r2]._id, field: columns[b.c2].field };
    this.setRange(anchor, corner);
    this.emit("fill", { direction, count, written, range: this.getRange() });
    return written;
  }
  /** Writes one filled value when the cell is editable and the value fits the column type. */
  _fillCell(id, field, value) {
    const column = this.getColumn(field);
    const data = this.store.get(id);
    if (!this._isEditable(column, data)) return false;
    if (typeof value !== "string" && value !== null && value !== void 0 && column && column.type === "text") value = String(value);
    return this.setCellValue(id, field, value ?? null, { source: "fill" }).ok;
  }
  /* ---------------------------------------------------------------- find / replace / go to */
  /** The active cell, or null. */
  getActiveCell() {
    return this._active ? { ...this._active } : null;
  }
  /** Moves keyboard focus to the grid. */
  focus() {
    this._scroller.focus({ preventScroll: true });
  }
  /** Opens the find / replace / go to bar (Ctrl+F, Ctrl+H, Ctrl+G). */
  openFind(mode2 = "find") {
    this._findBar?.open(mode2);
  }
  closeFind() {
    this._findBar?.close();
  }
  /** Position of a cell in reading order (row by row), for comparing cells; -1 when not in the view. */
  indexOfCell(cell) {
    if (!cell) return -1;
    const r = this._viewIndex.get(cell.id);
    const c = this.visibleColumns.findIndex((column) => column.field === cell.field);
    return r === void 0 || c === -1 ? -1 : r * this.visibleColumns.length + c;
  }
  _matcher(text, { matchCase = false, wholeCell = false }) {
    const needle = matchCase ? text : text.toLocaleLowerCase(this.locale);
    return (value) => {
      const hay = matchCase ? value : value.toLocaleLowerCase(this.locale);
      return wholeCell ? hay === needle : hay.includes(needle);
    };
  }
  /**
   * Cells whose displayed text contains the text, in reading order over the filtered and sorted view.
   * @return matching cells
   */
  find(text, options = {}) {
    if (!text) return [];
    const matches = this._matcher(text, options);
    const columns = this.visibleColumns.filter((c) => !options.fields || options.fields.includes(c.field));
    const result = [];
    for (const data of this._view) {
      const row = this._publicRow(data);
      for (const column of columns) {
        if (matches(formatCell(row[column.field], column, row, this.locale))) result.push({ id: data._id, field: column.field });
      }
    }
    return result;
  }
  /**
   * Replaces the text in the editable matching cells (in what you would type in the cell),
   * as one undo step.
   * @return cells changed
   */
  replace(text, replacement, options = {}) {
    if (!text) return 0;
    const cells = options.cells ?? this.find(text, options);
    const pattern = new RegExp(escapeRegex(text), options.matchCase ? "g" : "gi");
    let replaced = 0;
    this.batch(() => {
      for (const { id, field } of cells) {
        const column = this.getColumn(field);
        const data = this.store.get(id);
        if (!column || !this._isEditable(column, data)) continue;
        const current = editorText(this._publicRow(data)[field], column, this.locale);
        const next = options.wholeCell ? this._matcher(text, options)(current) ? replacement : current : current.replace(pattern, () => replacement);
        if (next !== current && this.setCellValue(id, field, next, { source: "edit" }).ok) replaced++;
      }
    }, "replace");
    this.emit("replace", { text, replacement, replaced });
    return replaced;
  }
  /**
   * Goes to a row of the view (1 based) and optionally a column, by title or field.
   * @param target a row number, or text such as "120 Price"
   * @return whether the cell exists
   */
  goTo(target, field) {
    let row = typeof target === "number" ? target : NaN;
    if (typeof target === "string") {
      const match = /^\s*(\d+)\s*[,;:]?\s*(.*?)\s*$/.exec(target);
      if (!match) return false;
      row = Number(match[1]);
      field = field ?? (match[2] || void 0);
    }
    const data = this._view[row - 1];
    if (!data) return false;
    const columns = this.visibleColumns;
    const lower = field?.toLocaleLowerCase(this.locale);
    const column = field === void 0 ? columns.find((c) => c.field === this._active?.field) ?? columns[0] : columns.find((c) => c.field === field || c.field.toLocaleLowerCase(this.locale) === lower || c.title.toLocaleLowerCase(this.locale) === lower);
    if (!column) return false;
    this.setRange({ id: data._id, field: column.field });
    this.focus();
    return true;
  }
  /** Marks cells (find matches); an empty list removes the marks. */
  highlightCells(cells) {
    this._highlighted = new Set(cells.map((c) => `${c.id}\0${c.field}`));
    this._paintRange();
  }
  _move(rowDelta, columnDelta, extend = false) {
    const columns = this.visibleColumns;
    const active = extend ? this._focus ?? this._active : this._active;
    if (!active) {
      const first = this._view[0];
      if (first && columns[0]) this._setActive(first._id, columns[0].field);
      return;
    }
    let rowIndex = this._viewIndex.get(active.id) ?? 0;
    let columnIndex2 = columns.findIndex((c) => c.field === active.field);
    columnIndex2 += columnDelta;
    if (Math.abs(columnDelta) > 1 || extend) {
      columnIndex2 = Math.max(0, Math.min(columns.length - 1, columnIndex2));
    } else if (columnIndex2 >= columns.length) {
      columnIndex2 = 0;
      rowIndex++;
    } else if (columnIndex2 < 0) {
      columnIndex2 = columns.length - 1;
      rowIndex--;
    }
    rowIndex = this._visibleRow(Math.max(0, Math.min(this._view.length - 1, rowIndex + rowDelta)), rowDelta < 0 ? -1 : 1);
    columnIndex2 = Math.max(0, Math.min(columns.length - 1, columnIndex2));
    const row = this._view[rowIndex];
    const column = columns[columnIndex2];
    if (row && column) this._selectCell(row._id, column.field, extend);
  }
  _onKeyDown(e) {
    if (this._editing || targetOf(e)?.closest(".ig-popover") || e.target !== this._scroller) return;
    const active = this._active;
    const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      const [rows, cols] = move;
      const far = e.ctrlKey || e.metaKey ? Number.MAX_SAFE_INTEGER : 1;
      this._move(rows * far, cols * far, e.shiftKey);
      return;
    }
    if (e.key === "Tab" && active) {
      e.preventDefault();
      this._move(0, e.shiftKey ? -1 : 1);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y")) {
      e.preventDefault();
      const redo = e.key.toLowerCase() === "y" || e.shiftKey;
      if (redo) this.redo();
      else this.undo();
      return;
    }
    if (e.key === "F2" && e.shiftKey && this._active) {
      e.preventDefault();
      this.editComment(this._active.id, this._active.field);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && this._findBar && !e.shiftKey && !e.altKey && ["f", "h", "g"].includes(e.key.toLowerCase())) {
      e.preventDefault();
      this.openFind({ f: "find", h: "replace", g: "goto" }[e.key.toLowerCase()]);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "d" || e.key.toLowerCase() === "r") && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      this.fillCopy(e.key.toLowerCase() === "d" ? "down" : "right");
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      const columns = this.visibleColumns;
      const first = this._view[0];
      const last = this._view.at(-1);
      if (first && last && columns.length) {
        this._active = { id: first._id, field: columns[0].field };
        this._focus = { id: last._id, field: columns.at(-1).field };
        this._paintRange();
        this.emit("rangeChange", this.getRange());
      }
      if (this.selectionMode === "multiple") this.selectAll();
      return;
    }
    if (!active) return;
    if (e.key === "Enter" || e.key === "F2") {
      e.preventDefault();
      this.startEdit(active.id, active.field);
    } else if (e.key === " " && this.selectionMode !== "none") {
      e.preventDefault();
      const range = this.getRange();
      if (range && range.rows.length > 1 && this.selectionMode === "multiple") this.select(range.rows, { append: true });
      else this._clickSelect(active.id, { ctrlKey: true, target: e.target });
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      this.clearRange();
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
      this._replaceRow(id);
    }
    return true;
  }
  /* ---------------------------------------------------------------- clipboard */
  _onCopy(e) {
    if (this._editing) return;
    const columns = this.visibleColumns;
    const range = this.getRange();
    let text;
    if (range && (range.rows.length > 1 || range.fields.length > 1)) {
      const rows = range.rows.map((id) => this.store.get(id));
      const rangeColumns = range.fields.map((field) => this.getColumn(field));
      text = toCSV(rows, rangeColumns, { delimiter: "	", header: false, sanitize: false, formatted: true, lineBreak: "\n", format: (v, c, r) => formatCell(v, c, r, this.locale) });
    } else if (this._selected.size > 1 || this._selected.size && !this._active) {
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
    const lines = parseDelimited(text, "	");
    const columns = this.visibleColumns;
    const bounds = this._rangeBounds();
    const startRow = bounds ? bounds.r1 : this._viewIndex.get(active.id) ?? 0;
    const startColumn = bounds ? bounds.c1 : columns.findIndex((c) => c.field === active.field);
    if (bounds && lines.length === 1 && lines[0].length === 1 && (bounds.r1 !== bounds.r2 || bounds.c1 !== bounds.c2)) {
      const value = lines[0][0];
      lines.splice(0, 1, ...Array.from({ length: bounds.r2 - bounds.r1 + 1 }, () => Array.from({ length: bounds.c2 - bounds.c1 + 1 }, () => value)));
    }
    const results = [];
    this._undo.begin("paste");
    lines.forEach((cells, r) => {
      const row = this._view[startRow + r];
      if (!row) return;
      cells.forEach((value, c) => {
        const column = columns[startColumn + c];
        if (!column || !this._isEditable(column, this.store.get(row._id))) return;
        results.push({ id: row._id, field: column.field, ...this.setCellValue(row._id, column.field, value, { source: "paste" }) });
      });
    });
    this._undo.end();
    this._renderNavbar();
    this.emit("paste", { text, results });
  }
  /* ---------------------------------------------------------------- lifecycle */
  destroy() {
    if (this._scrollFrame) cancelAnimationFrame(this._scrollFrame);
    this._offSocket?.();
    this._stream?.close();
    clearTimeout(this._noticeTimer);
    if (this._onDocumentPointer) document.removeEventListener("pointerdown", this._onDocumentPointer);
    this.closePopover();
    this.root.remove();
    this.element.classList.remove("ig-host");
    this.store.clear();
    this.emit("destroy", {});
    this.events = new Emitter(this);
  }
};
//# sourceMappingURL=index.cjs.map
