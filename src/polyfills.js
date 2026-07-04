import { Buffer } from "buffer";
import { EventEmitter } from "events";

const browserProcess = {
  env: {},
  browser: true,
  version: "",
  versions: {},
  nextTick: (callback) => Promise.resolve().then(callback)
};

globalThis.Buffer = Buffer;
globalThis.EventEmitter = EventEmitter;
globalThis.process = browserProcess;
globalThis.global = globalThis;

window.Buffer = Buffer;
window.EventEmitter = EventEmitter;
window.process = browserProcess;
window.global = window;